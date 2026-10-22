// Squad templates (ADR-0043): code, not a table, like the specialist manifest
// (ADR-0024). The copy has to exist in both languages and pass the copy lint,
// which this shape lets a test run directly; a table would duplicate it and
// need a seed in the shared database.
//
// `target_members` is the full roster the Squads PRD describes, kept for when
// the later specialists release. Only `starter_members` (what exists today) is
// ever shown or used, so an unreleased specialist never appears, not even as
// disabled (FR-SQD-03).

import type { LocaleCode } from '@sineva/i18n';

export interface SquadTemplateCopy {
  name: string;
  goal: string;
  starter_prompts: readonly [string, string, string];
  /** Suggested Library collections, shown as a hint on the create screen. */
  library_folders: readonly [string, string, string];
}

export interface SquadTemplateEntry {
  slug: string;
  order: number;
  target_members: readonly string[];
  starter_members: readonly string[];
  /** `sino` for every shipped template; kept so a member-led template can exist. */
  lead_type: 'sino' | 'member';
  /** Specialist wave of the full composition (2 means it needs a wave 2 specialist). */
  wave: number;
  copy: Record<LocaleCode, SquadTemplateCopy>;
}

export interface LocalizedSquadTemplate {
  slug: string;
  name: string;
  goal: string;
  member_slugs: readonly string[];
  lead_type: 'sino' | 'member';
  starter_prompts: readonly [string, string, string];
  library_folders: readonly [string, string, string];
}

export const SQUAD_TEMPLATES: readonly SquadTemplateEntry[] = [
  {
    slug: 'launch',
    order: 1,
    target_members: ['sinosocial', 'sinowrite', 'sinoinsights'],
    starter_members: ['sinosocial', 'sinoinsights'],
    lead_type: 'sino',
    wave: 2,
    copy: {
      en: {
        name: 'Launch squad',
        goal: 'Plan and prepare the launch of our new product, from content to results.',
        starter_prompts: [
          'Plan the launch of our new product for the next two weeks',
          'Draft a week of launch posts and tell me what to track',
          'What should we measure in the first month after launch?',
        ],
        library_folders: ['Brand guide', 'Price list', 'SOP'],
      },
      id: {
        name: 'Squad peluncuran',
        goal: 'Rencanakan dan siapkan peluncuran produk baru kita, dari konten sampai hasilnya.',
        starter_prompts: [
          'Susun rencana peluncuran produk baru kita untuk dua minggu ke depan',
          'Buat draf postingan peluncuran satu minggu dan beri tahu aku apa yang perlu dipantau',
          'Apa yang sebaiknya kita ukur di bulan pertama setelah peluncuran?',
        ],
        library_folders: ['Panduan merek', 'Daftar harga', 'SOP'],
      },
    },
  },
  {
    slug: 'back_office',
    order: 2,
    target_members: ['sinofinance', 'sinotax', 'sinoops'],
    starter_members: ['sinofinance', 'sinopeople', 'sinoinsights'],
    lead_type: 'sino',
    wave: 3,
    copy: {
      en: {
        name: 'Back-office squad',
        goal: 'Keep invoices, taxes and stock on track each month.',
        starter_prompts: [
          'Give me a checklist to close this month',
          'Which invoices are overdue and what should I do about them?',
          'Summarize our costs this month and point out anything unusual',
        ],
        library_folders: ['Brand guide', 'Price list', 'SOP'],
      },
      id: {
        name: 'Squad back-office',
        goal: 'Jaga invoice, pajak, dan stok tetap berjalan rapi setiap bulan.',
        starter_prompts: [
          'Beri aku daftar periksa untuk tutup buku bulan ini',
          'Invoice mana yang sudah lewat jatuh tempo dan apa yang perlu aku lakukan?',
          'Rangkum biaya kita bulan ini dan tunjukkan yang tidak biasa',
        ],
        library_folders: ['Panduan merek', 'Daftar harga', 'SOP'],
      },
    },
  },
  {
    slug: 'customer',
    order: 3,
    target_members: ['sinohelp', 'sinoshop', 'sinosales'],
    starter_members: ['sinohelp', 'sinosales', 'sinoinsights'],
    lead_type: 'sino',
    wave: 2,
    copy: {
      en: {
        name: 'Customer squad',
        goal: 'Answer customers quickly and move good leads forward.',
        starter_prompts: [
          'Draft replies to the questions customers ask most',
          'Which leads should I follow up with this week?',
          'What are customers asking about most, and how can we answer sooner?',
        ],
        library_folders: ['Brand guide', 'Price list', 'SOP'],
      },
      id: {
        name: 'Squad pelanggan',
        goal: 'Jawab pelanggan dengan cepat dan dorong calon pelanggan yang menjanjikan.',
        starter_prompts: [
          'Buat draf balasan untuk pertanyaan yang paling sering ditanyakan pelanggan',
          'Calon pelanggan mana yang perlu aku hubungi minggu ini?',
          'Apa yang paling sering ditanyakan pelanggan, dan bagaimana kita bisa menjawab lebih cepat?',
        ],
        library_folders: ['Panduan merek', 'Daftar harga', 'SOP'],
      },
    },
  },
];

export function findSquadTemplate(slug: string): SquadTemplateEntry | undefined {
  return SQUAD_TEMPLATES.find((entry) => entry.slug === slug);
}

export function localizeSquadTemplate(entry: SquadTemplateEntry, locale: LocaleCode): LocalizedSquadTemplate {
  const copy = entry.copy[locale];
  return {
    slug: entry.slug,
    name: copy.name,
    goal: copy.goal,
    member_slugs: entry.starter_members,
    lead_type: entry.lead_type,
    starter_prompts: copy.starter_prompts,
    library_folders: copy.library_folders,
  };
}

export function localizeSquadTemplates(locale: LocaleCode): LocalizedSquadTemplate[] {
  return [...SQUAD_TEMPLATES].sort((a, b) => a.order - b.order).map((entry) => localizeSquadTemplate(entry, locale));
}
