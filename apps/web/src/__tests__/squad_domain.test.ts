import { describe, expect, it } from 'vitest';
import { lintCopyString, LOCALES } from '@sineva/i18n';
import {
  SQUAD_HARD_CAPS,
  SQUAD_STARTER_BOUNDS,
  boundsFor,
  buildSquadClaim,
  canEditSquad,
  canOpenSquad,
  computeAttention,
  leadSlugOf,
  turnBlockReason,
  turnCeilingPoints,
  validateComposition,
  type SquadEntity,
  type SquadRosterEntry,
} from '@/server/domain/squads/squad';
import { SPECIALIST_MANIFEST } from '@/shared/specialists/manifest';
import { SQUAD_TEMPLATES, localizeSquadTemplates } from '@/shared/squads/templates';

const roster = (over: Partial<Record<string, Partial<SquadRosterEntry>>> = {}): SquadRosterEntry[] =>
  ['sinopeople', 'sinofinance', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights'].map((agent_slug) => ({
    agent_slug,
    enabled: true,
    accessible: true,
    ...over[agent_slug],
  }));

const squad = (over: Partial<SquadEntity> = {}): SquadEntity => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  name: 'Back-office',
  goal: 'Keep the month on track',
  lead_type: 'sino',
  lead_agent_slug: null,
  template_slug: null,
  status: 'active',
  limits: null,
  created_by: 'user-1',
  archived_at: null,
  created_at: '2026-10-23T00:00:00.000Z',
  updated_at: '2026-10-23T00:00:00.000Z',
  members: [
    { agent_slug: 'sinofinance', position: 0, added_by: 'user-1', added_at: '2026-10-23T00:00:00.000Z' },
    { agent_slug: 'sinopeople', position: 1, added_by: 'user-1', added_at: '2026-10-23T00:00:00.000Z' },
  ],
  ...over,
});

const comp = (member_slugs: string[], over = {}) => ({
  member_slugs,
  lead_type: 'sino' as const,
  lead_agent_slug: null,
  ...over,
});

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { details?: Array<{ code: string }> }).details?.[0]?.code ?? 'unknown';
  }
}

describe('squad composition (FR-SQD-02, FR-SQD-06)', () => {
  it('accepts 2 to 5 distinct enabled, accessible specialists', () => {
    expect(codeOf(() => validateComposition(comp(['sinofinance', 'sinopeople']), roster()))).toBeNull();
    expect(
      codeOf(() =>
        validateComposition(comp(['sinofinance', 'sinopeople', 'sinosales', 'sinosocial', 'sinohelp']), roster()),
      ),
    ).toBeNull();
  });

  it('rejects one member and six members, naming the limit', () => {
    expect(codeOf(() => validateComposition(comp(['sinofinance']), roster()))).toBe('squad_members_count');
    expect(
      codeOf(() =>
        validateComposition(
          comp(['sinofinance', 'sinopeople', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights']),
          roster(),
        ),
      ),
    ).toBe('squad_members_count');
  });

  it('rejects a duplicate member', () => {
    expect(codeOf(() => validateComposition(comp(['sinofinance', 'sinofinance']), roster()))).toBe('squad_member_duplicate');
  });

  it('rejects a specialist that is disabled, unknown or not accessible to the creator', () => {
    expect(
      codeOf(() => validateComposition(comp(['sinofinance', 'sinopeople']), roster({ sinopeople: { enabled: false } }))),
    ).toBe('squad_member_unavailable');
    expect(
      codeOf(() => validateComposition(comp(['sinofinance', 'sinopeople']), roster({ sinopeople: { accessible: false } }))),
    ).toBe('squad_member_unavailable');
    expect(codeOf(() => validateComposition(comp(['sinofinance', 'sinolegal']), roster()))).toBe('squad_member_unavailable');
  });

  it('allows a member as lead and rejects a lead who is not a member; there is no squad inside a squad', () => {
    expect(
      codeOf(() =>
        validateComposition(comp(['sinofinance', 'sinopeople'], { lead_type: 'member', lead_agent_slug: 'sinofinance' }), roster()),
      ),
    ).toBeNull();
    expect(
      codeOf(() =>
        validateComposition(comp(['sinofinance', 'sinopeople'], { lead_type: 'member', lead_agent_slug: 'sinosales' }), roster()),
      ),
    ).toBe('squad_lead_invalid');
    // A squad id is not a specialist slug, so it cannot be added as a member.
    expect(codeOf(() => validateComposition(comp(['sinofinance', 'squad:abc']), roster()))).toBe('squad_member_unavailable');
  });
});

describe('squad access and needs attention (FR-SQD-18, FR-SQD-26)', () => {
  it('opens when the person can use every member, otherwise needs an override', () => {
    const restricted = { specialist_scope: 'selected' as const, allowed_specialists: ['sinofinance'] };
    expect(canOpenSquad(squad(), { specialist_scope: 'all' }, false)).toBe(true);
    expect(canOpenSquad(squad(), restricted, false)).toBe(false);
    expect(canOpenSquad(squad(), restricted, true)).toBe(true);
  });

  it('lets a Member edit only their own squads', () => {
    expect(canEditSquad('owner', 'x', squad())).toBe(true);
    expect(canEditSquad('admin', 'x', squad())).toBe(true);
    expect(canEditSquad('member', 'user-1', squad())).toBe(true);
    expect(canEditSquad('member', 'user-2', squad())).toBe(false);
    expect(canEditSquad('viewer', 'user-1', squad())).toBe(false);
  });

  it('reports a disabled member and a removed lead; null roster means not checked', () => {
    expect(computeAttention(squad(), roster())).toEqual([]);
    expect(computeAttention(squad(), roster({ sinopeople: { enabled: false } }))).toEqual([
      { reason: 'member_disabled', agent_slug: 'sinopeople' },
    ]);
    expect(computeAttention(squad({ lead_type: 'member', lead_agent_slug: 'sinosales' }), roster())).toEqual([
      { reason: 'lead_removed', agent_slug: 'sinosales' },
    ]);
    expect(computeAttention(squad(), null)).toBeNull();
    expect(computeAttention(squad({ status: 'archived' }), null)).toEqual([]);
  });

  it('blocks new turns for an archived squad or one that needs attention', () => {
    expect(turnBlockReason(squad(), [])).toBeNull();
    expect(turnBlockReason(squad({ status: 'archived' }), [])).toBe('archived');
    expect(turnBlockReason(squad(), [{ reason: 'member_disabled', agent_slug: 'sinopeople' }])).toBe('needs_attention');
  });
});

describe('squad bounds and claim (FR-SQD-13, FR-SQD-19)', () => {
  it('uses the starter bounds and never lets a squad raise a hard cap', () => {
    expect(boundsFor(squad())).toEqual(SQUAD_STARTER_BOUNDS);
    expect(boundsFor(squad({ limits: { max_delegations: 99, max_parallel: 9, max_credits: 10 } }))).toMatchObject({
      max_delegations: SQUAD_HARD_CAPS.max_delegations,
      max_parallel: SQUAD_HARD_CAPS.max_parallel,
      max_credits: 10,
    });
    expect(turnCeilingPoints(squad({ limits: { max_credits: 12 } }))).toBe(12);
  });

  it('builds the claim from stored data: members in order, principals, namespace, only the tools given', () => {
    const claim = buildSquadClaim(squad(), { sinofinance: ['read_invoices'], sinosales: ['send_email'] });
    expect(claim.squad_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(claim.lead_slug).toBe('sino');
    expect(claim.members.map((m) => m.agent_slug)).toEqual(['sinofinance', 'sinopeople']);
    // A tool of a specialist that is not a member never appears.
    expect(claim.members.flatMap((m) => m.allowed_tools)).toEqual(['read_invoices']);
    expect(claim.library_principals).toEqual(['squad:11111111-1111-4111-8111-111111111111', 'workspace']);
    expect(claim.memory_namespace).toBe('squad:11111111-1111-4111-8111-111111111111');
    expect(claim.bounds).toEqual(SQUAD_STARTER_BOUNDS);
    expect(JSON.stringify(claim)).not.toContain('Keep the month on track');
    expect(leadSlugOf(squad({ lead_type: 'member', lead_agent_slug: 'sinopeople' }))).toBe('sinopeople');
  });
});

describe('squad templates (FR-SQD-03, section G)', () => {
  const wave1 = new Set(SPECIALIST_MANIFEST.map((entry) => entry.agent_slug));

  it('ships Launch, Back-office and Customer with only released specialists as starters', () => {
    expect(SQUAD_TEMPLATES.map((t) => t.slug)).toEqual(['launch', 'back_office', 'customer']);
    for (const template of SQUAD_TEMPLATES) {
      expect(template.starter_members.length).toBeGreaterThanOrEqual(2);
      for (const slug of template.starter_members) expect(wave1.has(slug)).toBe(true);
    }
  });

  it('never exposes an unreleased specialist in the localized output', () => {
    for (const locale of LOCALES.map((l) => l.code)) {
      const shown = JSON.stringify(localizeSquadTemplates(locale));
      for (const unreleased of ['sinowrite', 'sinotax', 'sinoops', 'sinoshop']) expect(shown).not.toContain(unreleased);
    }
  });

  it('has three prompts and three folders per template in both languages, and passes the copy lint', () => {
    const problems: string[] = [];
    for (const template of SQUAD_TEMPLATES) {
      for (const locale of ['en', 'id'] as const) {
        const copy = template.copy[locale];
        expect(copy.starter_prompts).toHaveLength(3);
        expect(copy.library_folders).toHaveLength(3);
        expect(copy.goal.length).toBeLessThanOrEqual(500);
        const strings = { name: copy.name, goal: copy.goal, ...Object.fromEntries(copy.starter_prompts.map((p, i) => [`p${i}`, p])) };
        for (const [field, value] of Object.entries(strings)) {
          for (const v of lintCopyString(value, { locale, key: `squads.${template.slug}.${field}` })) problems.push(`${template.slug} ${locale} ${field}: ${v.rule}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
