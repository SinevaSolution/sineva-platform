import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';

const SRC = resolve(import.meta.dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Other workstreams own these pages while they are rebuilt; they move to the
// registry in their own change.
const EXEMPT = [/^client\/components\/library\//, /^client\/components\/inbox\//];

const sources = [...walk(join(SRC, 'client')), ...walk(join(SRC, 'app'))]
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
  .map((f) => ({ path: relative(SRC, f), source: readFileSync(f, 'utf8') }))
  .filter((s) => !EXEMPT.some((re) => re.test(s.path)));

describe('empty states come from the registry', () => {
  // The places the registry was built for. Each must render its preset.
  const KNOWN: Array<[string, string]> = [
    ['client/components/shell/recent_chats.tsx', 'sidebar_recent'],
    ['client/components/home/home_recent.tsx', 'home_recent'],
    ['client/components/home/home_view.tsx', 'home_ideas'],
    ['client/components/chat/chat_thread.tsx', 'chat_thread_empty'],
    ['client/components/chat/chat_thread.tsx', 'chat_deleted'],
    ['client/components/chat/chat_thread.tsx', 'chat_load_failed'],
    ['client/components/room/new_chat_view.tsx', 'new_chat_starters'],
    ['client/components/chat/mention_menu.tsx', 'mention_no_match'],
    ['client/components/members/members_screen.tsx', 'members_invitations'],
    ['client/components/members/members_screen.tsx', 'members_list'],
    ['client/components/onboarding/business_profile_screen.tsx', 'business_offerings'],
    ['client/components/onboarding/business_profile_screen.tsx', 'business_policies'],
    ['client/components/onboarding/onboarding_screen.tsx', 'onboarding_tasks'],
    ['client/components/settings/sign_in_methods.tsx', 'sign_in_methods_none'],
    ['client/components/shell/coming_soon.tsx', 'coming_soon'],
    ['app/not-found.tsx', 'not_found'],
    ['app/w/[workspace_slug]/error.tsx', 'workspace_error'],
  ];

  it.each(KNOWN)('%s renders the %s preset', (file, preset) => {
    const source = sources.find((s) => s.path === file)?.source;
    expect(source, `${file} is missing`).toBeTruthy();
    expect(source).toMatch(new RegExp(`<PresetEmptyState[^>]*preset="${preset}"`));
  });

  it('renders no ad-hoc empty text for a list', () => {
    const offenders: string[] = [];
    for (const { path, source } of sources) {
      if (path.endsWith('/empty_state.tsx')) continue;
      // `x.length === 0 ? <p>` and `if (x.length === 0) return <p>` are the ad-hoc shapes.
      if (/\.length === 0\s*\?\s*\(?\s*<(p|span|div)\b/.test(source)) offenders.push(`${path}: ternary`);
      if (/\.length === 0\)\s*\{?\s*return\s*\(?\s*<(p|span)\b/.test(source)) offenders.push(`${path}: early return`);
      // A message key that names itself empty belongs in the `empty` namespace.
      // `time_zone_empty` is the one-line "no match" row inside the time zone
      // combobox popover, which takes a plain string label rather than a state.
      const keys = source
        .match(/\bt\(\s*'[a-z_.]*(?:^|[._])(?:empty|no_[a-z_]+)[a-z_.]*'/g)
        ?.filter((k) => !k.includes('time_zone_empty'));
      if (keys?.length) offenders.push(`${path}: ${keys.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the old ad-hoc empty keys out of the catalog', () => {
    const catalog = JSON.stringify(en);
    for (const old of ['recent_empty', 'empty_invites', 'empty_offerings', 'empty_policies']) {
      expect(catalog).not.toContain(`"${old}"`);
    }
  });
});
