import {
  PROFILE_FIELD_KEYS,
  POLICY_KINDS,
  type ProfileAggregate,
  type ProfileFieldKey,
} from './business_profile';

// The compact Business Profile the runtime receives (FR-ONB-18). Pure
// projection: confirmed values only, built field by field (an allowlist, never
// a spread of the row), so a column added later stays out until someone decides
// it belongs here.

export const PROFILE_PACK_TOKEN_CAP = 2000;

export interface ProfilePack {
  profile_version: number;
  identity: Record<string, unknown>;
  voice: Record<string, unknown> | null;
  policies: Array<{ id: string; kind: string; title: string; body: string }>;
  offers: Array<{
    id: string;
    name: string;
    description: string | null;
    price_amount: number | null;
    price_currency: string;
  }>;
  truncated: boolean;
  omitted: { policies: number; offers: number; voice_samples: number };
  token_estimate: number;
}

// A heuristic, not a tokenizer: about four characters per token for Latin text.
// It errs low for Indonesian and CJK-free business copy by a small margin, and
// sineva-ai caps the pack again with its own counter, so this only has to keep
// the pack in the right order of magnitude.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const POLICY_PRIORITY: ReadonlyArray<string> = POLICY_KINDS;

// `brand_voice` is its own pack section; every other confirmed field is identity.
const IDENTITY_KEYS = PROFILE_FIELD_KEYS.filter((key) => key !== 'brand_voice');

function measure(pack: ProfilePack): number {
  return estimateTokens(JSON.stringify({ ...pack, token_estimate: 0 }));
}

/**
 * Null when the workspace has no profile row. Priority when the cap bites:
 * identity, voice settings, policies (returns, shipping, payment, hours, faq,
 * other), offers in position order, voice samples. An item that does not fit
 * is omitted whole and counted: half a return policy is worse than none.
 */
export function buildProfilePack(aggregate: ProfileAggregate, cap = PROFILE_PACK_TOKEN_CAP): ProfilePack | null {
  const profile = aggregate.profile;
  if (!profile) {
    return null;
  }

  const confirmed = (key: ProfileFieldKey): boolean => Boolean(profile.field_meta[key]?.confirmed_at);

  const identity: Record<string, unknown> = {};
  for (const key of IDENTITY_KEYS) {
    const value = profile[key];
    if (confirmed(key) && value !== null && value !== undefined) {
      identity[key] = value;
    }
  }

  let voice: Record<string, unknown> | null = null;
  let samples: string[] = [];
  if (confirmed('brand_voice') && profile.brand_voice) {
    const { samples: voiceSamples, ...rest } = profile.brand_voice;
    voice = { ...rest };
    samples = voiceSamples ?? [];
  }

  const pack: ProfilePack = {
    profile_version: profile.version,
    identity,
    voice,
    policies: [],
    offers: [],
    truncated: false,
    omitted: { policies: 0, offers: 0, voice_samples: 0 },
    token_estimate: 0,
  };

  const policies = aggregate.policies
    .filter((p) => p.confirmed_at)
    .map((p, index) => ({ p, index }))
    .sort(
      (a, b) =>
        POLICY_PRIORITY.indexOf(a.p.kind) - POLICY_PRIORITY.indexOf(b.p.kind) || a.index - b.index,
    )
    .map(({ p }) => p);
  for (const p of policies) {
    pack.policies.push({ id: p.id, kind: p.kind, title: p.title, body: p.body });
    if (measure(pack) > cap) {
      pack.policies.pop();
      pack.omitted.policies += 1;
    }
  }

  const offers = aggregate.offerings.filter((o) => o.confirmed_at).sort((a, b) => a.position - b.position);
  for (const o of offers) {
    pack.offers.push({
      id: o.id,
      name: o.name,
      description: o.description,
      price_amount: o.price_amount,
      price_currency: o.price_currency,
    });
    if (measure(pack) > cap) {
      pack.offers.pop();
      pack.omitted.offers += 1;
    }
  }

  for (const sample of samples) {
    const withSample = { ...(pack.voice ?? {}), samples: [...((pack.voice?.samples as string[] | undefined) ?? []), sample] };
    const previousVoice = pack.voice;
    pack.voice = withSample;
    if (measure(pack) > cap) {
      pack.voice = previousVoice;
      pack.omitted.voice_samples += 1;
    }
  }

  pack.truncated = pack.omitted.policies + pack.omitted.offers + pack.omitted.voice_samples > 0;
  pack.token_estimate = measure(pack);
  return pack;
}
