import { describe, expect, it } from 'vitest';
import { activeMention, applyMention, filterSpecialists } from '@/client/components/chat/mention_query';

describe('activeMention', () => {
  it('finds a bare @ at the start', () => {
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' });
  });
  it('finds a partial token after whitespace', () => {
    expect(activeMention('hi @sin', 7)).toEqual({ start: 3, query: 'sin' });
  });
  it('works mid-text with the caret at the token end', () => {
    expect(activeMention('hi @sin there', 7)).toEqual({ start: 3, query: 'sin' });
  });
  it('ignores an @ glued to a word (email)', () => {
    expect(activeMention('email@x', 7)).toBeNull();
  });
  it('returns null once the caret is past a space', () => {
    expect(activeMention('@Sino Finance', 13)).toBeNull();
    expect(activeMention('@Sino ', 6)).toBeNull();
  });
  it('returns null with no @ before the caret', () => {
    expect(activeMention('hello', 5)).toBeNull();
  });
  it('treats a newline as whitespace', () => {
    expect(activeMention('a\n@fi', 5)).toEqual({ start: 2, query: 'fi' });
  });
});

const list = [
  { agent_slug: 'sinopeople', display_name: 'SinoPeople', role_title: 'HR and hiring' },
  { agent_slug: 'sinofinance', display_name: 'SinoFinance', role_title: 'Spend and invoices' },
  { agent_slug: 'sinohelp', display_name: 'SinoHelp', role_title: 'Support and people questions' },
];

describe('filterSpecialists', () => {
  it('returns everything in order for an empty query', () => {
    expect(filterSpecialists(list, '')).toEqual(list);
  });
  it('is case-insensitive and ranks display_name prefix first', () => {
    expect(filterSpecialists(list, 'sinop').map((s) => s.display_name)).toEqual(['SinoPeople']);
    expect(filterSpecialists(list, 'PEOPLE').map((s) => s.display_name)).toEqual(['SinoPeople', 'SinoHelp']);
  });
  it('puts prefix matches before contains matches', () => {
    expect(filterSpecialists(list, 'sinoh').map((s) => s.display_name)).toEqual(['SinoHelp']);
    expect(filterSpecialists(list, 'help').map((s) => s.display_name)).toEqual(['SinoHelp']);
    const l2 = [list[0]!, { agent_slug: 'x', display_name: 'PeopleOps', role_title: '' }];
    expect(filterSpecialists(l2, 'people').map((s) => s.display_name)).toEqual(['PeopleOps', 'SinoPeople']);
  });
  it('matches slug and role_title', () => {
    expect(filterSpecialists(list, 'invoices').map((s) => s.display_name)).toEqual(['SinoFinance']);
  });
  it('returns nothing when nothing matches', () => {
    expect(filterSpecialists(list, 'zzz')).toEqual([]);
  });
  it('caps at 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      agent_slug: `s${i}`,
      display_name: `Sino${i}`,
      role_title: 'r',
    }));
    expect(filterSpecialists(many, '')).toHaveLength(8);
  });
});

describe('applyMention', () => {
  it('replaces the token and adds one trailing space', () => {
    expect(applyMention('hi @fi', 3, 6, 'SinoFinance')).toEqual({ text: 'hi @SinoFinance ', caret: 16 });
  });
  it('does not double an existing space', () => {
    expect(applyMention('@fi rest', 0, 3, 'SinoFinance')).toEqual({ text: '@SinoFinance rest', caret: 13 });
  });
  it('keeps text after the caret', () => {
    expect(applyMention('@ tail', 0, 1, 'SinoHelp')).toEqual({ text: '@SinoHelp tail', caret: 10 });
  });
});
