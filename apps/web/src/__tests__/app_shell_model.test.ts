import { describe, expect, it } from 'vitest';
import { flattenMessages } from '@sineva/i18n';
import en from '../../messages/en.json';
import id from '../../messages/id.json';
import {
  buildNavSections,
  chatMarker,
  FEATURES,
  featureBySegment,
  isNavItemActive,
  parseSidebarCookie,
  type FeatureId,
} from '@/client/components/shell/nav_model';
import { specialistAccent, specialistPose } from '@/client/components/ui/specialist_accent';
import uiReducer, { setMobileNavOpen, toggleSidebarSection } from '@/client/store/slices/ui_slice';

describe('sidebar navigation model', () => {
  it('starts with Home and New chat, scoped to the workspace', () => {
    const primary = buildNavSections('kopi-senja').find((s) => s.id === 'primary');
    expect(primary?.items.slice(0, 2).map((i) => i.href)).toEqual([
      '/w/kopi-senja',
      '/w/kopi-senja/new',
    ]);
  });

  it('has no Specialists section: specialists are picked on Home and New chat', () => {
    const sections = buildNavSections('kopi-senja');
    expect(sections.some((s) => s.id === ('specialists' as string))).toBe(false);
  });

  it('shows every planned feature, marking unbuilt ones as soon', () => {
    const items = buildNavSections('kopi-senja').flatMap((s) => s.items);
    for (const id of [
      'inbox',
      'customers',
      'squads',
      'library',
      'tools',
      'workflows',
      'routines',
      'skills',
    ]) {
      const item = items.find((i) => i.id === id);
      expect(item?.href).toBe(`/w/kopi-senja/${FEATURES[id as FeatureId].segment}`);
      expect(item?.soon).toBe(id !== 'inbox' && id !== 'library' && id !== 'squads');
    }
    expect(items.find((i) => i.id === 'home')?.soon).toBe(false);
  });

  it('lists Customer chats right after Inbox in the primary group', () => {
    const primary = buildNavSections('kopi-senja').find((s) => s.id === 'primary');
    const ids = primary?.items.map((i) => i.id) ?? [];
    expect(ids.indexOf('customers')).toBe(ids.indexOf('inbox') + 1);
  });

  it('knows which path segments are planned features', () => {
    expect(featureBySegment('workflows')?.id).toBe('workflows');
    expect(featureBySegment('library')?.labelKey).toBe('features.library.label');
    expect(featureBySegment('nope')).toBeNull();
  });

  it('matches Home exactly and nested routes by prefix', () => {
    expect(isNavItemActive('/w/a', '/w/a', true)).toBe(true);
    expect(isNavItemActive('/w/a/chat', '/w/a', true)).toBe(false);
    expect(isNavItemActive('/w/a/chat/123', '/w/a/chat', false)).toBe(true);
    expect(isNavItemActive('/w/a/chatter', '/w/a/chat', false)).toBe(false);
  });
});

describe('nav copy keys', () => {
  const nav = buildNavSections('kopi-senja');
  const keys = [
    ...nav.flatMap((s) => (s.labelKey ? [s.labelKey] : [])),
    ...nav.flatMap((s) => s.items.map((i) => i.labelKey)),
    ...Object.values(FEATURES).flatMap((f) => [f.labelKey, f.blurbKey]),
  ];

  it('points every label and blurb at a message that exists in both languages', () => {
    for (const catalog of [en, id]) {
      const flat = flattenMessages(catalog);
      for (const key of keys) {
        expect(flat[`shell.${key}`], key).toBeTruthy();
      }
    }
  });

  it('keeps the protected names and the two translated names as decided', () => {
    const flat = flattenMessages(id);
    expect(flat['shell.features.library.label']).toBe('Sino Library');
    expect(flat['shell.features.inbox.label']).toBe('Inbox');
    expect(flat['shell.features.workflows.label']).toBe('Workflows');
    expect(flat['shell.features.routines.label']).toBe('Routines');
    expect(flat['shell.features.skills.label']).toBe('Skills');
    expect(flat['shell.features.squads.label']).toBe('Squads');
    expect(flat['shell.features.tools.label']).toBe('Aplikasi terhubung');
  });
});

describe('recent chat marker', () => {
  const names = { sinofinance: 'SinoFinance' };
  it('marks a hub chat as the team chat', () => {
    expect(chatMarker({ kind: 'hub', agent_slug: null }, names)).toEqual({
      kind: 'team',
      name: null,
      pose: 'wave',
    });
  });
  it('marks a private chat with the specialist name and pose', () => {
    expect(chatMarker({ kind: 'room', agent_slug: 'sinofinance' }, names)).toEqual({
      kind: 'specialist',
      name: 'SinoFinance',
      pose: 'coins',
    });
  });
  it('leaves the name empty for an unknown slug so the caller shows the generic label', () => {
    expect(chatMarker({ kind: 'room', agent_slug: 'ghost' }, names)).toMatchObject({
      kind: 'specialist',
      name: null,
    });
  });
});

describe('sidebar collapse', () => {
  it('reads the collapsed cookie value', () => {
    expect(parseSidebarCookie('collapsed')).toBe(true);
    expect(parseSidebarCookie('expanded')).toBe(false);
    expect(parseSidebarCookie(undefined)).toBe(false);
  });
});

describe('specialist accents', () => {
  it('maps canonical slugs to their product accent and falls back to brand', () => {
    expect(specialistAccent('sinofinance')).toBe('finance');
    expect(specialistAccent('sinopeople')).toBe('people');
    expect(specialistAccent('unknown')).toBe('brand');
  });

  it('gives each specialist its Sino pose and Sino the wave', () => {
    expect(specialistPose('sinofinance')).toBe('coins');
    expect(specialistPose('sinohelp')).toBe('holding-phone');
    expect(specialistPose('sino')).toBe('wave');
  });
});

describe('ui slice', () => {
  it('toggles sidebar sections and the mobile nav', () => {
    let state = uiReducer(undefined, { type: 'init' });
    expect(state.collapsed_sections).toEqual([]);
    state = uiReducer(state, toggleSidebarSection('specialists'));
    expect(state.collapsed_sections).toEqual(['specialists']);
    state = uiReducer(state, toggleSidebarSection('specialists'));
    expect(state.collapsed_sections).toEqual([]);
    state = uiReducer(state, setMobileNavOpen(true));
    expect(state.mobile_nav_open).toBe(true);
  });
});
