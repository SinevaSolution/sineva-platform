// Pure model for chat rooms: which background, which living Sino loop for
// the chat's mood, and the team chat's starter prompts. Each specialist has a
// room that matches their field (Blender renders in /public/rooms), named by
// the manifest's `room_theme_id`; the team chat with Sino uses the shared
// studio. A specialist's own starter prompts live in the manifest.

import type { SinoLoopName } from '@/client/components/ui/sino_loop';
import { findManifestEntry } from '@/shared/specialists/manifest';

export type RoomMood = 'idle' | 'working' | 'done' | 'error';

/** `background` is a path without extension; the stage asks for .avif then .webp. */
export function roomFor(slug: string | null): { slug: string; background: string } {
  const room = (slug && findManifestEntry(slug)?.room_theme_id) || 'sino';
  return { slug: room, background: `/rooms/${room}` };
}

/**
 * Idle: a wave, or the phone for SinoHelp (customer calls are the job).
 * Working while a message is out, thumbs up when it lands, confused on error.
 */
export function roomLoop(slug: string | null, mood: RoomMood): SinoLoopName {
  if (mood === 'working') return 'build';
  if (mood === 'done') return 'thumbs';
  if (mood === 'error') return 'confused';
  return slug === 'sinohelp' ? 'phone' : 'wave';
}

// Message keys in the `room` namespace for the team chat. Sino is the
// orchestrator, not a specialist, so these stay in the catalogs (EN and ID),
// where mentions keep the `@SinoX request` form.
const TEAM_STARTER_KEYS = ['starters.sino.a', 'starters.sino.b', 'starters.sino.c'] as const;

/** Keys of the three starter prompts of the team chat with Sino. */
export function teamStarterKeys(): readonly [string, string, string] {
  return TEAM_STARTER_KEYS;
}
