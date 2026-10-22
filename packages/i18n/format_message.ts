// A small ICU MessageFormat subset: `{name}` arguments and
// `{name, plural, =0 {..} one {..} other {..}}` with `#` for the number.
//
// Why not pull in a full ICU parser: the catalogs only need those two forms
// (Indonesian has no plural forms at all, so `other` is the only branch it
// ever uses), and a 100-line parser that fails loudly on anything else is
// easier to keep correct than a dependency. No quoting or escaping exists:
// a literal `{` or `}` cannot appear in a message. If a future string needs
// select or date arguments, swap this module for the real ICU implementation
// (next-intl uses the same syntax, so catalogs stay valid).

export type MessageParams = Readonly<Record<string, string | number>>;

export type MessageNode =
  | string
  | { type: 'arg'; name: string }
  | { type: 'hash' }
  | { type: 'plural'; name: string; cases: Record<string, MessageNode[]> };

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseMessage(source: string): MessageNode[] {
  let i = 0;

  const fail = (reason: string): never => {
    throw new Error(`Invalid message "${source}": ${reason} at ${i}`);
  };

  function parseNodes(inPlural: boolean, stopAtBrace: boolean): MessageNode[] {
    const nodes: MessageNode[] = [];
    let text = '';
    const flush = () => {
      if (text) nodes.push(text);
      text = '';
    };
    while (i < source.length) {
      const ch = source[i]!;
      if (ch === '}') {
        if (stopAtBrace) break;
        fail('unmatched "}"');
      }
      if (ch === '{') {
        flush();
        i += 1;
        nodes.push(parseArgument());
        continue;
      }
      if (ch === '#' && inPlural) {
        flush();
        nodes.push({ type: 'hash' });
        i += 1;
        continue;
      }
      text += ch;
      i += 1;
    }
    flush();
    return nodes;
  }

  function readUntil(stops: string): string {
    const start = i;
    while (i < source.length && !stops.includes(source[i]!)) i += 1;
    return source.slice(start, i).trim();
  }

  function parseArgument(): MessageNode {
    const name = readUntil(',}');
    if (!NAME.test(name)) fail(`bad argument name "${name}"`);
    if (source[i] === '}') {
      i += 1;
      return { type: 'arg', name };
    }
    if (source[i] !== ',') fail('unterminated argument');
    i += 1;
    const kind = readUntil(',');
    if (kind !== 'plural') fail(`unsupported argument type "${kind}"`);
    if (source[i] !== ',') fail('expected "," after plural');
    i += 1;
    const cases: Record<string, MessageNode[]> = {};
    for (;;) {
      while (/\s/.test(source[i] ?? '')) i += 1;
      if (source[i] === '}') {
        i += 1;
        break;
      }
      const selector = readUntil('{');
      if (!selector || source[i] !== '{') fail('expected a plural branch');
      i += 1;
      cases[selector] = parseNodes(true, true);
      if (source[i] !== '}') fail('unterminated plural branch');
      i += 1;
    }
    if (!cases.other) fail('plural needs an "other" branch');
    return { type: 'plural', name, cases };
  }

  const nodes = parseNodes(false, false);
  return nodes;
}

/** Names of every argument in a message, once each. */
export function messageParams(source: string): string[] {
  const names = new Set<string>();
  const visit = (nodes: MessageNode[]) => {
    for (const node of nodes) {
      if (typeof node === 'string' || node.type === 'hash') continue;
      names.add(node.name);
      if (node.type === 'plural') Object.values(node.cases).forEach(visit);
    }
  };
  visit(parseMessage(source));
  return [...names];
}

function requireParam(params: MessageParams, name: string): string | number {
  const value = params[name];
  if (value === undefined) {
    throw new Error(`Missing message param "${name}"`);
  }
  return value;
}

export function formatMessage(source: string, intlLocale: string, params: MessageParams = {}): string {
  const numbers = new Intl.NumberFormat(intlLocale);
  const render = (nodes: MessageNode[], hash: number | null): string =>
    nodes
      .map((node) => {
        if (typeof node === 'string') return node;
        if (node.type === 'hash') return hash === null ? '#' : numbers.format(hash);
        const value = requireParam(params, node.name);
        if (node.type === 'arg') {
          return typeof value === 'number' ? numbers.format(value) : value;
        }
        const n = Number(value);
        const branch =
          node.cases[`=${n}`] ?? node.cases[new Intl.PluralRules(intlLocale).select(n)] ?? node.cases.other!;
        return render(branch, n);
      })
      .join('');
  return render(parseMessage(source), null);
}
