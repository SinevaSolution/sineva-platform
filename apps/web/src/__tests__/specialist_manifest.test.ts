import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES, lintCopyString } from '@sineva/i18n';
import {
  ACCENT_KEYS,
  SPECIALIST_MANIFEST,
  findManifestEntry,
  localizeSpecialists,
} from '@/shared/specialists/manifest';
import { CANONICAL_SPECIALISTS } from '@/server/domain/chat/specialist_catalog';

const WAVE_1 = ['sinopeople', 'sinofinance', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights'];
const FIXTURE = resolve(import.meta.dirname, 'contract/fixtures/catalog_slugs.json');
const ROOMS_DIR = resolve(import.meta.dirname, '../../public/rooms');
const ENABLED_LOCALES = LOCALES.filter((l) => l.enabled).map((l) => l.code);

describe('specialist manifest (FR-SPEC-05, FR-SPEC-07)', () => {
  it('lists exactly the six wave 1 specialists, in order', () => {
    const ordered = [...SPECIALIST_MANIFEST].sort((a, b) => a.order - b.order);
    expect(ordered.map((e) => e.agent_slug)).toEqual(WAVE_1);
    expect(new Set(SPECIALIST_MANIFEST.map((e) => e.order)).size).toBe(WAVE_1.length);
  });

  it('matches the platform canonical slugs (the orchestrator is not a specialist card)', () => {
    const canonical = CANONICAL_SPECIALISTS.map((s) => s.slug).filter((slug) => slug !== 'sino');
    expect(SPECIALIST_MANIFEST.map((e) => e.agent_slug).sort()).toEqual([...canonical].sort());
  });

  // The sineva-ai fixture arrives with its catalog endpoint. Until it is copied
  // into contract/fixtures this check skips itself instead of passing on an
  // invented list.
  it.skipIf(!existsSync(FIXTURE))('matches the sineva-ai catalog_slugs.json fixture', () => {
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as string[] | { slugs: string[] };
    const slugs = Array.isArray(raw) ? raw : raw.slugs;
    const live = slugs.filter((slug) => slug !== 'sino');
    for (const entry of SPECIALIST_MANIFEST) {
      expect(live, `${entry.agent_slug} is in the sineva-ai catalog`).toContain(entry.agent_slug);
    }
  });

  it('uses the handle form for display names, never "Sino Finance"', () => {
    for (const entry of SPECIALIST_MANIFEST) {
      expect(entry.display_name).toMatch(/^Sino[A-Z][a-z]+$/);
      expect(entry.display_name.toLowerCase()).toBe(entry.agent_slug);
    }
  });

  it('has a fixed 13-value accent_key enum and one valid key per specialist', () => {
    expect(ACCENT_KEYS).toHaveLength(13);
    expect(new Set(ACCENT_KEYS).size).toBe(13);
    const used = SPECIALIST_MANIFEST.map((e) => e.accent_key);
    for (const key of used) expect(ACCENT_KEYS).toContain(key);
    expect(new Set(used).size).toBe(used.length);
  });

  it('points every specialist at a room that has a background in public/rooms', () => {
    for (const entry of SPECIALIST_MANIFEST) {
      expect(entry.room_theme_id).toBe(entry.agent_slug);
      expect(existsSync(resolve(ROOMS_DIR, `${entry.room_theme_id}.webp`))).toBe(true);
    }
  });

  it('carries role title, description and three starter prompts in every enabled locale', () => {
    expect(ENABLED_LOCALES.sort()).toEqual(['en', 'id']);
    for (const entry of SPECIALIST_MANIFEST) {
      for (const locale of ENABLED_LOCALES) {
        const copy = entry.copy[locale];
        expect(copy.role_title.trim().length, `${entry.agent_slug} ${locale} role_title`).toBeGreaterThan(0);
        expect(copy.short_description.trim().length).toBeGreaterThan(0);
        expect(copy.starter_prompts).toHaveLength(3);
        for (const prompt of copy.starter_prompts) expect(prompt.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('passes the same copy lint as the message catalogs, in both locales', () => {
    const problems: string[] = [];
    for (const entry of SPECIALIST_MANIFEST) {
      for (const locale of ENABLED_LOCALES) {
        const copy = entry.copy[locale];
        const strings: Record<string, string> = {
          role_title: copy.role_title,
          short_description: copy.short_description,
          starter_a: copy.starter_prompts[0],
          starter_b: copy.starter_prompts[1],
          starter_c: copy.starter_prompts[2],
        };
        for (const [field, value] of Object.entries(strings)) {
          for (const v of lintCopyString(value, { locale, key: `specialists.${entry.agent_slug}.${field}` })) {
            problems.push(`${entry.agent_slug} ${locale} ${field}: ${v.rule}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('gives Indonesian its own role titles instead of the English ones', () => {
    for (const entry of SPECIALIST_MANIFEST) {
      expect(entry.copy.id.role_title).not.toBe(entry.copy.en.role_title);
      expect(entry.copy.id.role_title).toMatch(/^Spesialis /);
    }
  });

  it('keeps mentions in the @SinoX request form in starter prompts', () => {
    for (const entry of SPECIALIST_MANIFEST) {
      for (const locale of ENABLED_LOCALES) {
        for (const prompt of entry.copy[locale].starter_prompts) {
          expect(prompt).not.toMatch(/@Sino[A-Za-z]*,/);
        }
      }
    }
  });

  it('finds an entry by slug and returns undefined for others', () => {
    expect(findManifestEntry('sinofinance')?.accent_key).toBe('finance');
    expect(findManifestEntry('sino')).toBeUndefined();
    expect(findManifestEntry('sino-finance')).toBeUndefined();
  });

  it('localizes for the shell: one language, manifest order, no invented metrics', () => {
    const id = localizeSpecialists('id');
    expect(id.map((s) => s.agent_slug)).toEqual(WAVE_1);
    expect(id[1]).toEqual({
      agent_slug: 'sinofinance',
      display_name: 'SinoFinance',
      role_title: findManifestEntry('sinofinance')!.copy.id.role_title,
      short_description: findManifestEntry('sinofinance')!.copy.id.short_description,
      accent_key: 'finance',
      room_theme_id: 'sinofinance',
      starter_prompts: findManifestEntry('sinofinance')!.copy.id.starter_prompts,
    });
    expect(localizeSpecialists('en')[1]!.role_title).toBe(findManifestEntry('sinofinance')!.copy.en.role_title);
  });
});
