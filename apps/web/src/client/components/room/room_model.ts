// Pure model for chat rooms: which background, which living Sino loop for
// the chat's mood, and the starter prompts. Each specialist has a room that
// matches their field (Blender renders in /public/rooms); the team chat with
// Sino uses the shared studio.

import type { SinoLoopName } from '@/client/components/ui/sino_loop';

export type RoomMood = 'idle' | 'working' | 'done' | 'error';

const ROOM_SLUGS = new Set([
  'sinopeople',
  'sinofinance',
  'sinosales',
  'sinosocial',
  'sinohelp',
  'sinoinsights',
]);

/** `background` is a path without extension; the stage asks for .avif then .webp. */
export function roomFor(slug: string | null): { slug: string; background: string } {
  const room = slug && ROOM_SLUGS.has(slug) ? slug : 'sino';
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

// Message keys in the `room` namespace. The prompts themselves live in the
// catalogs (EN and ID), where mentions keep the `@SinoX request` form.
const STARTER_KEYS: Record<string, [string, string, string]> = {
  sino: ['starters.sino.a', 'starters.sino.b', 'starters.sino.c'],
  sinopeople: ['starters.sinopeople.a', 'starters.sinopeople.b', 'starters.sinopeople.c'],
  sinofinance: ['starters.sinofinance.a', 'starters.sinofinance.b', 'starters.sinofinance.c'],
  sinosales: ['starters.sinosales.a', 'starters.sinosales.b', 'starters.sinosales.c'],
  sinosocial: ['starters.sinosocial.a', 'starters.sinosocial.b', 'starters.sinosocial.c'],
  sinohelp: ['starters.sinohelp.a', 'starters.sinohelp.b', 'starters.sinohelp.c'],
  sinoinsights: ['starters.sinoinsights.a', 'starters.sinoinsights.b', 'starters.sinoinsights.c'],
};

/** Keys of the three starter prompts for a room (Sino's team chat when the slug is unknown). */
export function startersFor(slug: string | null): [string, string, string] {
  return STARTER_KEYS[slug && STARTER_KEYS[slug] ? slug : 'sino']!;
}
