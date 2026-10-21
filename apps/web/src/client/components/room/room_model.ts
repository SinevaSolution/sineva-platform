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

const STARTERS: Record<string, string[]> = {
  sino: [
    '@SinoSales draft a follow-up for yesterday’s client meeting',
    'Plan my week around three priorities',
    '@SinoFinance and @SinoInsights review last month’s spending',
  ],
  sinopeople: [
    'Write a job post for a part-time barista',
    'Draft a friendly onboarding checklist for new hires',
    'Help me prepare questions for a performance review',
  ],
  sinofinance: [
    'Make a simple cash flow plan for next month',
    'Explain this invoice and what I should check',
    'Draft a polite payment reminder to a client',
  ],
  sinosales: [
    'Write a follow-up email after a product demo',
    'Turn my notes into a short sales proposal',
    'Suggest three ways to reach new local customers',
  ],
  sinosocial: [
    'Plan five Instagram posts for this week',
    'Write a caption for our new menu item',
    'Turn this announcement into a LinkedIn post',
  ],
  sinohelp: [
    'Draft a reply to a customer asking for a refund',
    'Write answers for our five most common questions',
    'Make a calm reply to an unhappy review',
  ],
  sinoinsights: [
    'What should I look at in my monthly sales numbers?',
    'Compare this month and last month and tell me what changed',
    'Suggest three numbers I should track every week',
  ],
};

export function startersFor(slug: string | null): string[] {
  return STARTERS[slug && STARTERS[slug] ? slug : 'sino'];
}
