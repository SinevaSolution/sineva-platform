import { describe, expect, it } from 'vitest';
import { mentionEndingAt, splitMentions } from '@/client/components/chat/mention_segments';

const names = ['SinoFinance', 'SinoHelp'];

describe('splitMentions', () => {
  it('marks known specialist mentions, case-insensitively', () => {
    expect(splitMentions('@SinoFinance cek invoice dan @sinohelp balas', names)).toEqual([
      { text: '@SinoFinance', mention: true },
      { text: ' cek invoice dan ', mention: false },
      { text: '@sinohelp', mention: true },
      { text: ' balas', mention: false },
    ]);
  });

  it('leaves unknown names, emails and partial names as plain text', () => {
    expect(splitMentions('@abc mail me@SinoHelp.id @SinoHelper', names)).toEqual([
      { text: '@abc mail me@SinoHelp.id @SinoHelper', mention: false },
    ]);
  });

  it('keeps every character so the overlay lines up with the textarea', () => {
    const text = 'hi\n@SinoHelp,  ok ';
    expect(splitMentions(text, names).map((s) => s.text).join('')).toBe(text);
  });

  it('returns one plain segment when there are no names', () => {
    expect(splitMentions('@SinoHelp', [])).toEqual([{ text: '@SinoHelp', mention: false }]);
  });
});

describe('mentionEndingAt', () => {
  it('finds a known mention that ends right at the caret', () => {
    expect(mentionEndingAt('tolong @SinoHelp', 16, names)).toEqual({ start: 7, end: 16 });
  });

  it('ignores the caret inside or after a space', () => {
    expect(mentionEndingAt('@SinoHelp ', 10, names)).toBeNull();
    expect(mentionEndingAt('@SinoHelp', 5, names)).toBeNull();
  });
});
