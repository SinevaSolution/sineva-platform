import type {
  ActionDefinition,
  ProviderManifest,
  ScopeBundle,
  ScopeDefinition,
} from '@/server/domain/connections/connector';
import { ASSIGNABLE_SIDE_EFFECTS } from '@/server/domain/connections/connector';

export const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

export type Unavailability = 'coming_soon' | 'credentials_not_configured';

export interface RegistryOptions {
  /** True when the environment holds the provider's OAuth app credentials (API-key providers need none). */
  credentialsAvailable: (manifest: ProviderManifest) => boolean;
  /** Specialists whose built-in skills declare the provider (ADR-0039 decision 4). */
  specialistsFor: (providerId: string) => readonly string[];
}

/**
 * Self-check of the manifest data (the plan's "registry self-check test").
 * Returns every problem, so a bad edit shows all of its mistakes at once.
 * The registry constructor throws on a non-empty result: an invalid manifest
 * must stop startup, not surface as a odd gateway decision later.
 */
export function validateManifests(manifests: readonly ProviderManifest[]): string[] {
  const errors: string[] = [];
  const providerIds = new Set<string>();
  const actionIds = new Set<string>();

  const text = (value: { en: string; id: string } | undefined) =>
    Boolean(value && value.en.trim() && value.id.trim());

  for (const manifest of manifests) {
    const p = manifest.provider_id;
    if (!IDENTIFIER.test(p)) errors.push(`provider id "${p}" must match ${IDENTIFIER}`);
    if (providerIds.has(p)) errors.push(`provider "${p}" is defined twice`);
    providerIds.add(p);
    if (!manifest.display_name.trim()) errors.push(`${p}: display_name is empty`);
    if (!text(manifest.description)) errors.push(`${p}: description needs English and Indonesian text`);

    const scopeKeys = new Set<string>();
    for (const scope of manifest.scopes) {
      if (!text(scope.label)) errors.push(`${p}: scope "${scope.scope_key}" needs English and Indonesian labels`);
      if (scopeKeys.has(scope.scope_key)) errors.push(`${p}: scope "${scope.scope_key}" is defined twice`);
      scopeKeys.add(scope.scope_key);
    }

    for (const bundle of manifest.bundles) {
      if (!IDENTIFIER.test(bundle.bundle_key)) errors.push(`${p}: bundle id "${bundle.bundle_key}" must match ${IDENTIFIER}`);
      if (!text(bundle.label)) errors.push(`${p}: bundle "${bundle.bundle_key}" needs English and Indonesian labels`);
      if (bundle.scope_keys.length === 0) errors.push(`${p}: bundle "${bundle.bundle_key}" has no scopes`);
      for (const key of bundle.scope_keys) {
        if (!scopeKeys.has(key)) errors.push(`${p}: bundle "${bundle.bundle_key}" names unknown scope "${key}"`);
      }
    }

    if (manifest.status !== 'coming_soon') {
      if (manifest.auth_type === 'oauth2_pkce') {
        if (!manifest.oauth) errors.push(`${p}: an oauth2_pkce provider needs an oauth config`);
        if (manifest.bundles.length === 0) errors.push(`${p}: an oauth2_pkce provider needs at least one scope bundle`);
        for (const url of [manifest.oauth?.authorize_url, manifest.oauth?.token_url, manifest.oauth?.revoke_url]) {
          if (url && !url.startsWith('https://')) errors.push(`${p}: OAuth URL "${url}" must be https`);
        }
      }
      if (manifest.auth_type === 'api_key' && !manifest.api_key) {
        errors.push(`${p}: an api_key provider needs an api_key config`);
      }
      if (manifest.egress.length === 0) errors.push(`${p}: an available provider needs an egress allowlist`);
    }

    for (const rule of manifest.egress) {
      if (/[*/:]/.test(rule.host) || !rule.host.includes('.')) {
        errors.push(`${p}: egress host "${rule.host}" must be a bare host name without wildcards`);
      }
      if (rule.path_prefixes.length === 0 || rule.path_prefixes.some((prefix) => !prefix.startsWith('/'))) {
        errors.push(`${p}: egress rule for "${rule.host}" needs path prefixes that start with /`);
      }
    }

    for (const action of manifest.actions) {
      const a = action.action_id;
      if (!IDENTIFIER.test(a)) errors.push(`action id "${a}" must match ${IDENTIFIER} (dotted ids are invalid)`);
      if (actionIds.has(a)) errors.push(`action "${a}" is defined twice`);
      actionIds.add(a);
      if (action.provider_id !== p) errors.push(`action "${a}" belongs to "${action.provider_id}" but is listed under "${p}"`);
      if (!a.startsWith(`${p}_`)) errors.push(`action "${a}" must start with its provider id "${p}_"`);
      // The type already excludes `pay`; this catches a cast or untyped data.
      if (!(ASSIGNABLE_SIDE_EFFECTS as readonly string[]).includes(action.side_effect)) {
        errors.push(`action "${a}" has side effect "${action.side_effect}", which is not assignable in v1.0`);
      }
      if (manifest.category === 'payments' && action.side_effect !== 'read') {
        errors.push(`action "${a}": payment provider actions must all be read`);
      }
      if (action.autonomy_eligible && action.side_effect !== 'read' && action.guardrail_locked) {
        errors.push(`action "${a}" cannot be both autonomy eligible and guardrail locked`);
      }
      for (const scope of action.scopes) {
        if (!scopeKeys.has(scope)) errors.push(`action "${a}" needs unknown scope "${scope}"`);
      }
      if (!text(action.approval_sentence_template)) errors.push(`action "${a}" needs an approval sentence in English and Indonesian`);
      if (!/^[a-z][a-z0-9_.]*$/.test(action.activity_label_key)) errors.push(`action "${a}" has an invalid activity_label_key`);
      if (action.max_response_bytes <= 0) errors.push(`action "${a}" needs a positive max_response_bytes`);
    }
  }
  return errors;
}

export class ConnectorRegistry {
  private readonly byId = new Map<string, ProviderManifest>();
  private readonly actionById = new Map<string, ActionDefinition>();

  constructor(
    private readonly manifests: readonly ProviderManifest[],
    private readonly options: RegistryOptions,
  ) {
    const errors = validateManifests(manifests);
    if (errors.length > 0) {
      throw new Error(`Invalid connector manifests:\n- ${errors.join('\n- ')}`);
    }
    for (const manifest of manifests) {
      this.byId.set(manifest.provider_id, manifest);
      for (const action of manifest.actions) this.actionById.set(action.action_id, action);
    }
  }

  providers(): readonly ProviderManifest[] {
    return this.manifests;
  }

  provider(providerId: string): ProviderManifest | null {
    return this.byId.get(providerId) ?? null;
  }

  /** A "coming soon" provider is a catalog entry only; a provider without credentials cannot start a flow. */
  availability(providerId: string): { available: boolean; reason: Unavailability | null } {
    const manifest = this.byId.get(providerId);
    if (!manifest) return { available: false, reason: 'coming_soon' };
    if (manifest.status === 'coming_soon') return { available: false, reason: 'coming_soon' };
    if (!this.options.credentialsAvailable(manifest)) return { available: false, reason: 'credentials_not_configured' };
    return { available: true, reason: null };
  }

  specialistsFor(providerId: string): readonly string[] {
    return this.options.specialistsFor(providerId);
  }

  action(actionId: string): ActionDefinition | null {
    return this.actionById.get(actionId) ?? null;
  }

  actionsFor(providerId: string): readonly ActionDefinition[] {
    return this.byId.get(providerId)?.actions ?? [];
  }

  scope(providerId: string, scopeKey: string): ScopeDefinition | null {
    return this.byId.get(providerId)?.scopes.find((scope) => scope.scope_key === scopeKey) ?? null;
  }

  bundle(providerId: string, bundleKey: string): ScopeBundle | null {
    return this.byId.get(providerId)?.bundles.find((bundle) => bundle.bundle_key === bundleKey) ?? null;
  }

  /** Scope definitions of a bundle, in manifest order. */
  bundleScopes(providerId: string, bundleKey: string): ScopeDefinition[] {
    const bundle = this.bundle(providerId, bundleKey);
    if (!bundle) return [];
    return bundle.scope_keys.flatMap((key) => {
      const scope = this.scope(providerId, key);
      return scope ? [scope] : [];
    });
  }

  /** True when every action of the provider only reads (the payment providers). */
  isReadOnlyProvider(providerId: string): boolean {
    const actions = this.actionsFor(providerId);
    return actions.every((action) => action.side_effect === 'read');
  }

  /** https only, exact host, path under an allowed prefix (ADR-0037 egress allowlist). */
  isEgressAllowed(providerId: string, rawUrl: string): boolean {
    const manifest = this.byId.get(providerId);
    if (!manifest) return false;
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return manifest.egress.some(
      (rule) => url.hostname === rule.host && rule.path_prefixes.some((prefix) => url.pathname.startsWith(prefix)),
    );
  }
}
