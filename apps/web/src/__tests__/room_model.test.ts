import { describe, expect, it } from 'vitest';
import { SPECIALIST_MANIFEST } from '@/shared/specialists/manifest';
import { roomFor, roomLoop, teamStarterKeys } from '@/client/components/room/room_model';

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

  it('names each specialist room from the manifest and falls back to the studio', () => {
    for (const entry of SPECIALIST_MANIFEST) {
      expect(roomFor(entry.agent_slug).slug).toBe(entry.room_theme_id);
    }
    expect(roomFor('sino').slug).toBe('sino');
    expect(roomFor('ghost').slug).toBe('sino');
  });

  it('keeps three starter prompts for the team chat in the catalogs; specialists carry theirs in the manifest', () => {
    expect(teamStarterKeys()).toHaveLength(3);
    for (const entry of SPECIALIST_MANIFEST) {
      expect(entry.copy.en.starter_prompts).toHaveLength(3);
      expect(entry.copy.id.starter_prompts).toHaveLength(3);
    }
  });
});
