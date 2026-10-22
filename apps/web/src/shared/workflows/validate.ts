import {
  CONDITION_OPS,
  DEFAULT_LOOP_CAP,
  INPUT_TYPES,
  KEY_PATTERN,
  LOOP_BODY_TYPES,
  MAX_LOOP_CAP,
  MAX_REVIEW_EXPIRY_DAYS,
  MAX_WAIT_HOURS,
  MAX_WORKFLOW_STEPS,
  OUTPUT_TYPES,
  RESERVED_STEP_TYPES,
  STEP_TYPES,
  UNARY_CONDITION_OPS,
  WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_SPECIALISTS,
  producesOutput,
  type StepType,
} from './definition';

// The one validator of Workflow definitions (ADR-0045). It runs in the use
// cases (publish, run, edit) and in the builder, so a person sees the same
// issue the server would refuse. It works on `unknown` and never throws: a
// draft is saved half finished, and garbage must come back as issues.
//
// It checks only what it is given facts for. A context field left out
// (`null` or absent) skips the check that needs it: the builder has no
// registry in some states, and guessing would invent a "Needs attention" that
// is not true. The server always passes every fact.

export type ActionClass = 'read' | 'write' | 'send' | 'pay';

/** What the connector action registry says about one action. */
export interface ActionMeta {
  class: ActionClass;
  reads_private: boolean;
  /** The action returns text written by someone outside the business (messages, reviews, files). */
  reads_external: boolean;
}

export interface ValidationContext {
  /** Owner or Admin: may set a loop cap above the default. */
  can_raise_loop_cap?: boolean;
  enabled_specialists?: readonly string[] | null;
  connections?: ReadonlyArray<{ id: string; provider: string; connected: boolean }> | null;
  /** Keyed `provider:action_id`. */
  actions?: Readonly<Record<string, ActionMeta>> | null;
  /** The definition came from "describe it" (FR-WF-19). */
  generated?: boolean;
  /** The person asked for something to be sent, posted or changed. */
  requested_send?: boolean;
}

export interface WorkflowIssue {
  /** Message key suffix under `workflows.issues`. */
  code: string;
  /** For example `steps[2].instruction`; empty for the whole definition. */
  path: string;
  step_key: string | null;
  params: Record<string, string | number>;
  /** A specialist that is off or a connection that is missing: shown as "Needs attention". */
  needs_attention: boolean;
}

export interface ValidationResult {
  ok: boolean;
  issues: WorkflowIssue[];
}

type Dict = Record<string, unknown>;
const isDict = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const REF_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;
const SINGLE_REF = /^\{\{\s*([^{}]*?)\s*\}\}$/;

type ParsedRef =
  | { kind: 'input'; key: string }
  | { kind: 'step'; key: string }
  | { kind: 'item' }
  | null;

function parseRef(inner: string): ParsedRef {
  if (inner === 'loop.item') return { kind: 'item' };
  const input = /^inputs\.([a-z][a-z0-9_]{0,31})$/.exec(inner);
  if (input) return { kind: 'input', key: input[1]! };
  const step = /^steps\.([a-z][a-z0-9_]{0,31})\.output$/.exec(inner);
  if (step) return { kind: 'step', key: step[1]! };
  return null;
}

interface FlatStep {
  step: Dict;
  path: string;
  /** Key of the loop this step sits in, or null. */
  loop_key: string | null;
}

export function validateWorkflowDefinition(input: unknown, context: ValidationContext = {}): ValidationResult {
  const issues: WorkflowIssue[] = [];
  const add = (
    code: string,
    path: string,
    stepKey: string | null = null,
    params: Record<string, string | number> = {},
    needsAttention = false,
  ) => {
    issues.push({ code, path, step_key: stepKey, params, needs_attention: needsAttention });
  };
  const finish = (): ValidationResult => ({ ok: issues.length === 0, issues });

  if (!isDict(input)) {
    add('schema_invalid', '');
    return finish();
  }
  if (input.schema_version !== WORKFLOW_SCHEMA_VERSION) {
    add('schema_version_unsupported', 'schema_version', null, { supported: WORKFLOW_SCHEMA_VERSION });
    return finish();
  }
  if (!Array.isArray(input.steps)) {
    add('schema_invalid', 'steps');
    return finish();
  }
  if (input.inputs !== undefined && !Array.isArray(input.inputs)) add('schema_invalid', 'inputs');
  if (input.outputs !== undefined && !Array.isArray(input.outputs)) add('schema_invalid', 'outputs');

  // --- inputs ---------------------------------------------------------------
  const inputs = new Map<string, Dict>();
  (Array.isArray(input.inputs) ? input.inputs : []).forEach((raw, index) => {
    const path = `inputs[${index}]`;
    if (!isDict(raw)) return add('schema_invalid', path);
    const key = raw.key;
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      add('input_key_invalid', `${path}.key`);
    } else if (inputs.has(key)) {
      add('input_key_duplicate', `${path}.key`, null, { key });
    } else {
      inputs.set(key, raw);
    }
    if (typeof raw.type !== 'string' || !(INPUT_TYPES as readonly string[]).includes(raw.type)) {
      add('schema_invalid', `${path}.type`);
    }
    if (!isText(raw.label)) add('field_required', `${path}.label`, null, { field: 'label' });
    if (raw.type === 'choice' && !(Array.isArray(raw.options) && raw.options.filter(isText).length >= 2)) {
      add('input_choice_options_required', `${path}.options`);
    }
  });

  // --- steps: shape, limits, one pass in run order -------------------------
  const flat: FlatStep[] = [];
  const collect = (list: unknown[], base: string, loopKey: string | null) => {
    list.forEach((raw, index) => {
      const path = `${base}[${index}]`;
      if (!isDict(raw)) return add('schema_invalid', path);
      flat.push({ step: raw, path, loop_key: loopKey });
      if (raw.type === 'loop' && Array.isArray(raw.body)) {
        collect(raw.body, `${path}.body`, typeof raw.key === 'string' ? raw.key : '');
      }
    });
  };
  collect(input.steps, 'steps', null);

  if (flat.length === 0) add('no_steps', 'steps');
  if (flat.length > MAX_WORKFLOW_STEPS) add('step_limit_exceeded', 'steps', null, { max: MAX_WORKFLOW_STEPS });

  const keys = new Map<string, FlatStep>();
  const keyOf = (s: FlatStep) => (typeof s.step.key === 'string' ? s.step.key : null);
  const actionMeta = (step: Dict): { meta: ActionMeta | null; id: string } => {
    const id = `${String(step.provider)}:${String(step.action_id)}`;
    return { meta: context.actions?.[id] ?? null, id };
  };

  for (const entry of flat) {
    const { step, path } = entry;
    const key = keyOf(entry);
    if (key === null || !KEY_PATTERN.test(key)) {
      add('step_key_invalid', `${path}.key`);
    } else if (keys.has(key)) {
      add('step_key_duplicate', `${path}.key`, key, { key });
    } else {
      keys.set(key, entry);
    }
    const type = step.type;
    if (typeof type !== 'string' || !(STEP_TYPES as readonly string[]).includes(type)) {
      add('step_type_unknown', `${path}.type`, key);
      continue;
    }
    if ((RESERVED_STEP_TYPES as readonly string[]).includes(type)) {
      add('step_type_reserved', `${path}.type`, key, { type });
      continue;
    }
    const stepType = type as StepType;
    if (entry.loop_key !== null && !(LOOP_BODY_TYPES as readonly string[]).includes(stepType)) {
      add(stepType === 'loop' ? 'loop_nested' : 'step_not_allowed_in_loop', `${path}.type`, key, { type });
      continue;
    }
    if ('output_type' in step && step.output_type !== undefined && !(OUTPUT_TYPES as readonly string[]).includes(String(step.output_type))) {
      add('schema_invalid', `${path}.output_type`, key);
    }

    switch (stepType) {
      case 'specialist_task': {
        const slug = step.specialist;
        if (typeof slug !== 'string' || !(WORKFLOW_SPECIALISTS as readonly string[]).includes(slug)) {
          add('specialist_unknown', `${path}.specialist`, key, { specialist: String(slug ?? '') });
        } else if (context.enabled_specialists && !context.enabled_specialists.includes(slug)) {
          add('specialist_not_enabled', `${path}.specialist`, key, { specialist: slug }, true);
        }
        if (!isText(step.instruction)) add('field_required', `${path}.instruction`, key, { field: 'instruction' });
        break;
      }
      case 'connection_action': {
        if (!isText(step.provider)) add('field_required', `${path}.provider`, key, { field: 'provider' });
        if (!isText(step.action_id)) add('field_required', `${path}.action_id`, key, { field: 'action_id' });
        const provider = String(step.provider ?? '');
        if (!isText(step.connection_id)) {
          add('connection_missing', `${path}.connection_id`, key, { provider }, true);
        } else if (context.connections) {
          const found = context.connections.find((c) => c.id === step.connection_id);
          if (!found || !found.connected || found.provider !== provider) {
            add('connection_missing', `${path}.connection_id`, key, { provider }, true);
          }
        }
        if (isText(step.provider) && isText(step.action_id) && context.actions) {
          const { meta, id } = actionMeta(step);
          if (!meta) add('action_unknown', `${path}.action_id`, key, { action: id });
          else if (meta.class === 'pay') add('action_class_forbidden', `${path}.action_id`, key, { action: id });
        }
        break;
      }
      case 'review': {
        if (!isText(step.instruction)) add('field_required', `${path}.instruction`, key, { field: 'instruction' });
        const days = step.expiry_days;
        if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > MAX_REVIEW_EXPIRY_DAYS) {
          add('review_expiry_invalid', `${path}.expiry_days`, key, { max: MAX_REVIEW_EXPIRY_DAYS });
        }
        if (step.on_reject !== 'end' && step.on_reject !== 'continue') add('schema_invalid', `${path}.on_reject`, key);
        break;
      }
      case 'condition': {
        const check = step.check;
        if (!isDict(check)) {
          add('schema_invalid', `${path}.check`, key);
          break;
        }
        if (!isText(check.left)) add('field_required', `${path}.check.left`, key, { field: 'check.left' });
        const op = check.op;
        if (typeof op !== 'string' || !(CONDITION_OPS as readonly string[]).includes(op)) {
          add('schema_invalid', `${path}.check.op`, key);
        } else if (!(UNARY_CONDITION_OPS as readonly string[]).includes(op) && !isText(check.right)) {
          add('field_required', `${path}.check.right`, key, { field: 'check.right' });
        }
        if (step.if_not !== 'end') add('schema_invalid', `${path}.if_not`, key);
        break;
      }
      case 'wait': {
        const hours = step.duration_hours;
        if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 1) {
          add('wait_invalid', `${path}.duration_hours`, key);
        } else if (hours > MAX_WAIT_HOURS) {
          add('wait_too_long', `${path}.duration_hours`, key, { max_days: MAX_WAIT_HOURS / 24 });
        }
        break;
      }
      case 'loop': {
        const cap = step.cap;
        if (!Number.isInteger(cap) || (cap as number) < 1) {
          add('schema_invalid', `${path}.cap`, key);
        } else if ((cap as number) > MAX_LOOP_CAP) {
          add('loop_cap_exceeded', `${path}.cap`, key, { max: MAX_LOOP_CAP });
        } else if ((cap as number) > DEFAULT_LOOP_CAP && !context.can_raise_loop_cap) {
          add('loop_cap_requires_admin', `${path}.cap`, key, { max: DEFAULT_LOOP_CAP });
        }
        if (!Array.isArray(step.body) || step.body.length === 0) add('loop_empty', `${path}.body`, key);
        break;
      }
      case 'ask_me': {
        if (!isText(step.question)) add('field_required', `${path}.question`, key, { field: 'question' });
        if (step.answer !== 'choice' && step.answer !== 'text') {
          add('schema_invalid', `${path}.answer`, key);
        } else if (step.answer === 'choice' && !(Array.isArray(step.choices) && step.choices.filter(isText).length >= 2)) {
          add('ask_me_choices_required', `${path}.choices`, key);
        }
        break;
      }
      default:
        break;
    }
  }

  // --- references ---------------------------------------------------------
  const outputTypeOf = (entry: FlatStep): string =>
    entry.step.type === 'loop' ? 'list' : String(entry.step.output_type ?? 'text');

  const resolve = (
    parsed: Exclude<ParsedRef, null>,
    path: string,
    stepKey: string | null,
    visible: ReadonlySet<string>,
    inLoop: boolean,
  ): string | null => {
    if (parsed.kind === 'item') {
      if (!inLoop) add('reference_loop_item_outside_loop', path, stepKey);
      return inLoop ? 'item' : null;
    }
    if (parsed.kind === 'input') {
      const declared = inputs.get(parsed.key);
      if (!declared) {
        add('reference_unknown_input', path, stepKey, { key: parsed.key });
        return null;
      }
      return declared.type === 'library_file' && declared.multiple === true ? 'list' : 'text';
    }
    const target = keys.get(parsed.key);
    if (!target) {
      add('reference_missing_step', path, stepKey, { key: parsed.key });
      return null;
    }
    if (!visible.has(parsed.key)) {
      add('reference_later_step', path, stepKey, { key: parsed.key });
      return null;
    }
    if (!producesOutput(target.step.type as StepType)) {
      add('reference_no_output', path, stepKey, { key: parsed.key });
      return null;
    }
    return outputTypeOf(target);
  };

  const checkText = (value: unknown, path: string, stepKey: string | null, visible: ReadonlySet<string>, inLoop: boolean) => {
    if (typeof value !== 'string') return;
    for (const match of value.matchAll(REF_PATTERN)) {
      const parsed = parseRef(match[1]!);
      if (!parsed) add('reference_invalid', path, stepKey, { ref: match[1]!.slice(0, 40) });
      else resolve(parsed, path, stepKey, visible, inLoop);
    }
    const rest = value.replace(REF_PATTERN, '');
    if (rest.includes('{{') || rest.includes('}}')) add('reference_invalid', path, stepKey, { ref: '' });
  };

  /** A field that must be exactly one reference. Returns the type it points at. */
  const checkSingle = (value: unknown, path: string, stepKey: string | null, visible: ReadonlySet<string>, inLoop: boolean): string | null => {
    if (typeof value !== 'string' || value.trim() === '') return null; // field_required was reported already
    const match = SINGLE_REF.exec(value.trim());
    const parsed = match ? parseRef(match[1]!) : null;
    if (!parsed) {
      add('reference_invalid', path, stepKey, { ref: value.slice(0, 40) });
      return null;
    }
    return resolve(parsed, path, stepKey, visible, inLoop);
  };

  const walkRefs = (list: unknown[], base: string, visible: Set<string>, inLoop: boolean) => {
    list.forEach((raw, index) => {
      if (!isDict(raw)) return;
      const path = `${base}[${index}]`;
      const key = typeof raw.key === 'string' ? raw.key : null;
      const text = (value: unknown, field: string) => checkText(value, `${path}.${field}`, key, visible, inLoop);
      switch (raw.type) {
        case 'specialist_task':
          text(raw.instruction, 'instruction');
          break;
        case 'connection_action':
          if (isDict(raw.args)) for (const [name, value] of Object.entries(raw.args)) text(value, `args.${name}`);
          break;
        case 'review':
          text(raw.instruction, 'instruction');
          if (raw.subject !== null && raw.subject !== undefined) {
            checkSingle(raw.subject, `${path}.subject`, key, visible, inLoop);
          }
          break;
        case 'condition':
          if (isDict(raw.check)) {
            checkSingle(raw.check.left, `${path}.check.left`, key, visible, inLoop);
            if (isText(raw.check.right)) text(raw.check.right, 'check.right');
          }
          text(raw.end_note, 'end_note');
          break;
        case 'ask_me':
          text(raw.question, 'question');
          if (raw.per_item_of !== null && raw.per_item_of !== undefined) {
            const type = checkSingle(raw.per_item_of, `${path}.per_item_of`, key, visible, inLoop);
            if (type !== null && type !== 'list') add('ask_me_per_item_not_list', `${path}.per_item_of`, key);
          }
          break;
        case 'loop': {
          const type = checkSingle(raw.over, `${path}.over`, key, visible, inLoop);
          if (type !== null && type !== 'list') add('loop_over_not_list', `${path}.over`, key);
          if (Array.isArray(raw.body)) walkRefs(raw.body, `${path}.body`, new Set(visible), true);
          break;
        }
        default:
          break;
      }
      if (key !== null) visible.add(key);
    });
  };
  const visibleTop = new Set<string>();
  walkRefs(input.steps, 'steps', visibleTop, false);
  (Array.isArray(input.outputs) ? input.outputs : []).forEach((raw, index) => {
    const path = `outputs[${index}]`;
    if (!isDict(raw)) return add('schema_invalid', path);
    if (typeof raw.key !== 'string' || !KEY_PATTERN.test(raw.key)) add('step_key_invalid', `${path}.key`);
    if (!isText(raw.from)) add('field_required', `${path}.from`, null, { field: 'from' });
    else checkSingle(raw.from, `${path}.from`, null, visibleTop, false);
  });

  // --- lints that block publishing -----------------------------------------
  if (context.actions) {
    const metaFor = (s: FlatStep) => (s.step.type === 'connection_action' ? actionMeta(s.step).meta : null);
    const hasLibraryInput = [...inputs.values()].some((i) => i.type === 'library_file');
    const isWrite = (meta: ActionMeta | null) => meta !== null && (meta.class === 'write' || meta.class === 'send');

    const specialistWork = flat.some((s) => s.step.type === 'specialist_task' || s.step.type === 'skill');
    const privateData = hasLibraryInput || specialistWork || flat.some((s) => metaFor(s)?.reads_private === true);
    const untrusted =
      hasLibraryInput ||
      flat.some((s) => metaFor(s)?.reads_external === true || (s.step.type === 'wait' && s.step.or_reply === true));
    const sends = flat.some((s) => isWrite(metaFor(s)));

    let reviewSeen = false;
    for (const entry of flat) {
      if (entry.step.type === 'review') reviewSeen = true;
      if (!isWrite(metaFor(entry))) continue;
      const key = keyOf(entry);
      // A lethal trifecta: private data, outside text and a way out in one run.
      // Outside text can carry instructions, so a person looks before it leaves.
      if (privateData && untrusted && sends && !reviewSeen) add('write_needs_review', entry.path, key);
      if (context.generated) {
        if (!context.requested_send) add('generated_unasked_send', entry.path, key);
        if (!reviewSeen) add('generated_write_needs_review', entry.path, key);
      }
    }
  }

  return finish();
}
