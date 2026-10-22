import { describe, expect, it } from 'vitest';
import { insertMention } from '@/client/components/chat/mention_insert';

describe('insertMention', () => {
  it('starts an empty message with the mention and a space', () => {
    expect(insertMention('', 'SinoFinance')).toBe('@SinoFinance ');
  });

  it('puts the mention in front of an existing draft, no comma', () => {
    expect(insertMention('  check last month’s spend', 'SinoFinance')).toBe(
      '@SinoFinance check last month’s spend',
    );
  });

  it('does not add the same specialist twice', () => {
    expect(insertMention('@SinoFinance hi', 'SinoFinance')).toBe('@SinoFinance hi');
  });

  it('adds a second specialist after the first', () => {
    expect(insertMention('@SinoFinance hi', 'SinoSales')).toBe('@SinoSales @SinoFinance hi');
  });
});
