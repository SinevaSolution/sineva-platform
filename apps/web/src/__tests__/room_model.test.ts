import { describe, expect, it } from 'vitest';
import { roomFor, roomLoop, startersFor } from '@/client/components/room/room_model';

describe('room model', () => {
  it('gives every specialist its own room background, and Sino the studio', () => {
    expect(roomFor('sinofinance').background).toBe('/rooms/sinofinance');
    expect(roomFor(null).background).toBe('/rooms/sino');
    expect(roomFor('unknown').background).toBe('/rooms/sino');
  });

  it('plays a calm idle loop that fits the specialist', () => {
    expect(roomLoop('sinohelp', 'idle')).toBe('phone');
    expect(roomLoop('sinofinance', 'idle')).toBe('wave');
  });

  it('switches loops with the chat mood', () => {
    expect(roomLoop('sinofinance', 'working')).toBe('build');
    expect(roomLoop(null, 'done')).toBe('thumbs');
    expect(roomLoop('sinosales', 'error')).toBe('confused');
  });

  it('offers three starters per specialist and for the team', () => {
    for (const slug of [null, 'sinopeople', 'sinofinance', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights']) {
      expect(startersFor(slug)).toHaveLength(3);
    }
    expect(startersFor('ghost')).toEqual(startersFor(null));
  });
});
