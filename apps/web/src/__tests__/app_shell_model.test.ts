import { describe, expect, it } from 'vitest';
import {
  buildNavSections,
  chatMarker,
  FEATURES,
  featureBySegment,
  isNavItemActive,
  parseSidebarCookie,
  type FeatureId,
} from '@/client/components/shell/nav_model';
import {
  specialistAccent,
  specialistPose,
} from '@/client/components/ui/specialist_accent';
import uiReducer, {
  setMobileNavOpen,
  toggleSidebarSection,
} from '@/client/store/slices/ui_slice';

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
    for (const id of ['inbox', 'squads', 'library', 'tools', 'workflows', 'routines', 'skills']) {
      const item = items.find((i) => i.id === id);
      expect(item?.href).toBe(`/w/kopi-senja/${FEATURES[id as FeatureId].segment}`);
      expect(item?.soon).toBe(true);
    }
    expect(items.find((i) => i.id === 'home')?.soon).toBe(false);
  });

  it('knows which path segments are planned features', () => {
    expect(featureBySegment('workflows')?.id).toBe('workflows');
    expect(featureBySegment('library')?.label).toBe('Sino Library');
    expect(featureBySegment('nope')).toBeNull();
  });

  it('matches Home exactly and nested routes by prefix', () => {
    expect(isNavItemActive('/w/a', '/w/a', true)).toBe(true);
    expect(isNavItemActive('/w/a/chat', '/w/a', true)).toBe(false);
    expect(isNavItemActive('/w/a/chat/123', '/w/a/chat', false)).toBe(true);
    expect(isNavItemActive('/w/a/chatter', '/w/a/chat', false)).toBe(false);
  });
});

describe('recent chat marker', () => {
  const names = { sinofinance: 'SinoFinance' };
  it('labels a hub chat as Team', () => {
    expect(chatMarker({ kind: 'hub', agent_slug: null }, names)).toEqual({ label: 'Team', pose: 'wave' });
  });
  it('labels a private chat with the specialist name and pose', () => {
    expect(chatMarker({ kind: 'room', agent_slug: 'sinofinance' }, names)).toEqual({
      label: 'SinoFinance',
      pose: 'coins',
    });
  });
  it('falls back to Specialist for an unknown slug', () => {
    expect(chatMarker({ kind: 'room', agent_slug: 'ghost' }, names).label).toBe('Specialist');
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
