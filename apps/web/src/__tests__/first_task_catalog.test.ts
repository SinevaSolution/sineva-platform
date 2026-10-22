import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TYPES,
  selectFirstTasks,
  type FirstTaskInput,
} from '@/server/domain/onboarding/first_task_catalog';

const NOW = new Date('2026-10-22T10:00:00.000Z');

function input(overrides: Partial<FirstTaskInput> = {}): FirstTaskInput {
  return {
    business_type: 'online_shop',
    goals: [],
    locale: 'en',
    business_name: 'Toko Kopi',
    offer_name: 'Kopi Gayo 250g',
    dismissed: [],
    now: NOW,
    ...overrides,
  };
}

// Words banned in user-facing copy (conventions section 10).
const BANNED = /\b(agent|assistant|chatbot|bot|asisten|pembantu|credit|kredit|loan|financing|cicilan|pinjaman|pembiayaan|submit)\b|[–—]/i;

describe('first-task catalog (FR-ONB-21, 22, 23)', () => {
  it.each(BUSINESS_TYPES.flatMap((type) => (['en', 'id'] as const).map((locale) => [type, locale] as const)))(
    'returns exactly three complete tasks for %s in %s',
    (business_type, locale) => {
      const tasks = selectFirstTasks(input({ business_type, locale }));
      expect(tasks).toHaveLength(3);
      expect(new Set(tasks.map((t) => t.task_id)).size).toBe(3);
      for (const task of tasks) {
        expect(task.specialist_slug).toMatch(/^sino[a-z]+$/);
        expect(['draft', 'explanation', 'list']).toContain(task.output_type);
        expect(['draft_only', 'no_money_moves', 'read_only']).toContain(task.guardrail_promise);
        expect(task.title.length).toBeGreaterThan(0);
        expect(task.message).not.toMatch(/[{}]/);
      }
    },
  );

  it('uses the visible mention form: @SinoX then the request, no comma', () => {
    for (const task of selectFirstTasks(input())) {
      expect(task.message).toMatch(/^@Sino[A-Za-z]+ [^,]/);
    }
  });

  it('fills the real business name and first offer, and falls back to neutral wording when they are missing', () => {
    const filled = selectFirstTasks(input({ business_type: 'online_shop' })).map((t) => t.message).join(' ');
    expect(filled).toContain('Toko Kopi');
    const bare = selectFirstTasks(input({ business_name: null, offer_name: null })).map((t) => t.message).join(' ');
    expect(bare).not.toContain('null');
    expect(bare).not.toMatch(/[{}]/);
  });

  it('prefers tasks that match the owner goals', () => {
    const tasks = selectFirstTasks(input({ goals: ['faster_replies'] }));
    expect(tasks.some((t) => t.specialist_slug === 'sinohelp')).toBe(true);
    const finance = selectFirstTasks(input({ goals: ['organize_finances'] }));
    expect(finance.some((t) => t.specialist_slug === 'sinofinance')).toBe(true);
  });

  it('does not return a task dismissed less than a week ago', () => {
    const first = selectFirstTasks(input());
    const dismissed = [{ task_id: first[0].task_id, dismissed_at: '2026-10-20T10:00:00.000Z' }];
    const next = selectFirstTasks(input({ dismissed }));
    expect(next).toHaveLength(3);
    expect(next.map((t) => t.task_id)).not.toContain(first[0].task_id);
  });

  it('lets a task come back after the week is over', () => {
    const first = selectFirstTasks(input());
    const dismissed = [{ task_id: first[0].task_id, dismissed_at: '2026-10-10T10:00:00.000Z' }];
    expect(selectFirstTasks(input({ dismissed })).map((t) => t.task_id)).toContain(first[0].task_id);
  });

  it('still returns exactly three when everything was dismissed, oldest dismissal first', () => {
    const all = selectFirstTasks(input({ goals: [] }));
    const pool = new Set<string>();
    // Dismiss repeatedly until the pool is exhausted.
    const dismissed: Array<{ task_id: string; dismissed_at: string }> = [];
    for (let i = 0; i < 20; i += 1) {
      for (const t of selectFirstTasks(input({ dismissed }))) {
        if (!pool.has(t.task_id)) {
          pool.add(t.task_id);
          dismissed.push({ task_id: t.task_id, dismissed_at: new Date(NOW.getTime() - (100 - pool.size) * 60_000).toISOString() });
        }
      }
    }
    expect(all).toHaveLength(3);
    const exhausted = selectFirstTasks(input({ dismissed }));
    expect(exhausted).toHaveLength(3);
    expect(exhausted[0].task_id).toBe(dismissed[0].task_id);
  });

  it('keeps all copy free of banned words and dashes in both locales', () => {
    for (const type of BUSINESS_TYPES) {
      for (const locale of ['en', 'id'] as const) {
        for (const goal of [[], ['create_content'], ['organize_finances'], ['faster_replies']] as const) {
          for (const task of selectFirstTasks(input({ business_type: type, locale, goals: [...goal] }))) {
            expect(`${task.title} ${task.message}`).not.toMatch(BANNED);
          }
        }
      }
    }
  });

  it('writes Indonesian with kamu, never Anda, in the id locale', () => {
    for (const task of selectFirstTasks(input({ locale: 'id' }))) {
      expect(task.message).not.toMatch(/\bAnda\b/);
    }
  });
});
