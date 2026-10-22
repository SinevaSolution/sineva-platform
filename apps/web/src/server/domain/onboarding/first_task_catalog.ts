import type { GoalKey } from '@/server/domain/business_profile/business_profile';

export const BUSINESS_TYPES = [
  'online_shop',
  'food_beverage',
  'services_agency',
  'retail_store',
  'manufacturing',
  'other',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export type TaskLocale = 'en' | 'id';
export type GuardrailPromise = 'draft_only' | 'no_money_moves' | 'read_only';
export type TaskOutputType = 'draft' | 'explanation' | 'list';

export interface FirstTask {
  task_id: string;
  specialist_slug: string;
  output_type: TaskOutputType;
  guardrail_promise: GuardrailPromise;
  title: string;
  /** The visible Hub message the card sends: `@SinoX request`, no comma (FR-ONB-23). */
  message: string;
}

export interface DismissedTask {
  task_id: string;
  dismissed_at: string;
}

export interface FirstTaskInput {
  business_type: BusinessType | null;
  goals: GoalKey[];
  locale: TaskLocale;
  business_name: string | null;
  offer_name: string | null;
  dismissed: DismissedTask[];
  now: Date;
}

interface CatalogEntry {
  id: string;
  specialist_slug: string;
  output_type: TaskOutputType;
  guardrail_promise: GuardrailPromise;
  goals: GoalKey[];
  text: Record<TaskLocale, { title: string; message: string }>;
}

// Curated, not generated (FR-ONB-22): every task is reviewable and testable, and
// none needs a connected tool. `{business}` and `{offer}` are filled from the
// confirmed profile; when a value is missing a neutral phrase is used, never an
// invented name. The three launch business types have their own tasks, every
// other type uses the generic set until CBT supplies more (OQ-ONB-1).
const GENERIC: CatalogEntry[] = [
  {
    id: 'generic_social_week',
    specialist_slug: 'sinosocial',
    output_type: 'draft',
    guardrail_promise: 'draft_only',
    goals: ['create_content', 'find_customers'],
    text: {
      en: { title: 'A week of post ideas', message: '@SinoSocial create a week of post ideas for {business}' },
      id: { title: 'Ide konten satu minggu', message: '@SinoSocial buatkan ide konten satu minggu untuk {business}' },
    },
  },
  {
    id: 'generic_help_faq',
    specialist_slug: 'sinohelp',
    output_type: 'draft',
    guardrail_promise: 'draft_only',
    goals: ['faster_replies'],
    text: {
      en: { title: 'Answers to common questions', message: '@SinoHelp write answers to the 5 questions customers ask {business} most' },
      id: { title: 'Jawaban untuk pertanyaan umum', message: '@SinoHelp tulis jawaban untuk 5 pertanyaan yang paling sering ditanyakan pelanggan {business}' },
    },
  },
  {
    id: 'generic_finance_cashflow',
    specialist_slug: 'sinofinance',
    output_type: 'explanation',
    guardrail_promise: 'no_money_moves',
    goals: ['organize_finances', 'understand_numbers'],
    text: {
      en: { title: 'How to track cash flow', message: '@SinoFinance explain how to track the cash flow of {business}' },
      id: { title: 'Cara mencatat arus kas', message: '@SinoFinance jelaskan cara mencatat arus kas {business}' },
    },
  },
  {
    id: 'generic_sales_followup',
    specialist_slug: 'sinosales',
    output_type: 'draft',
    guardrail_promise: 'draft_only',
    goals: ['find_customers'],
    text: {
      en: { title: 'A follow-up message', message: '@SinoSales draft a friendly follow-up message for customers of {business}' },
      id: { title: 'Pesan tindak lanjut', message: '@SinoSales buatkan draf pesan tindak lanjut yang ramah untuk pelanggan {business}' },
    },
  },
  {
    id: 'generic_people_jobpost',
    specialist_slug: 'sinopeople',
    output_type: 'draft',
    guardrail_promise: 'draft_only',
    goals: ['manage_staff'],
    text: {
      en: { title: 'A job post draft', message: '@SinoPeople draft a job post for a new team member at {business}' },
      id: { title: 'Draf lowongan kerja', message: '@SinoPeople buatkan draf lowongan kerja untuk anggota tim baru di {business}' },
    },
  },
  {
    id: 'generic_insights_questions',
    specialist_slug: 'sinoinsights',
    output_type: 'list',
    guardrail_promise: 'read_only',
    goals: ['understand_numbers'],
    text: {
      en: { title: 'Questions worth tracking', message: '@SinoInsights list the numbers {business} should look at every week' },
      id: { title: 'Angka yang layak dipantau', message: '@SinoInsights daftarkan angka yang perlu dilihat {business} setiap minggu' },
    },
  },
];

const BY_TYPE: Partial<Record<BusinessType, CatalogEntry[]>> = {
  online_shop: [
    {
      id: 'shop_product_captions',
      specialist_slug: 'sinosocial',
      output_type: 'draft',
      guardrail_promise: 'draft_only',
      goals: ['create_content', 'find_customers'],
      text: {
        en: { title: 'Captions for a product', message: '@SinoSocial write three post captions for {offer} from {business}' },
        id: { title: 'Keterangan untuk satu produk', message: '@SinoSocial tulis tiga keterangan postingan untuk {offer} dari {business}' },
      },
    },
    {
      id: 'shop_order_replies',
      specialist_slug: 'sinohelp',
      output_type: 'draft',
      guardrail_promise: 'draft_only',
      goals: ['faster_replies'],
      text: {
        en: { title: 'Replies about orders', message: '@SinoHelp draft replies to common order and shipping questions for {business}' },
        id: { title: 'Balasan soal pesanan', message: '@SinoHelp buatkan draf balasan untuk pertanyaan pesanan dan pengiriman di {business}' },
      },
    },
    {
      id: 'shop_offer_pitch',
      specialist_slug: 'sinosales',
      output_type: 'draft',
      guardrail_promise: 'draft_only',
      goals: ['find_customers'],
      text: {
        en: { title: 'A short pitch', message: '@SinoSales write a short pitch for {offer}' },
        id: { title: 'Pitch singkat', message: '@SinoSales tulis pitch singkat untuk {offer}' },
      },
    },
  ],
  food_beverage: [
    {
      id: 'fnb_menu_posts',
      specialist_slug: 'sinosocial',
      output_type: 'draft',
      guardrail_promise: 'draft_only',
      goals: ['create_content', 'find_customers'],
      text: {
        en: { title: 'Menu highlight posts', message: '@SinoSocial create a week of menu highlight posts for {business}' },
        id: { title: 'Postingan menu andalan', message: '@SinoSocial buatkan postingan menu andalan satu minggu untuk {business}' },
      },
    },
    {
      id: 'fnb_customer_questions',
      specialist_slug: 'sinohelp',
      output_type: 'draft',
      guardrail_promise: 'draft_only',
      goals: ['faster_replies'],
      text: {
        en: { title: 'Replies about opening hours and orders', message: '@SinoHelp draft replies about opening hours, menu and pre-orders for {business}' },
        id: { title: 'Balasan soal jam buka dan pesanan', message: '@SinoHelp buatkan draf balasan soal jam buka, menu dan pesan di muka untuk {business}' },
      },
    },
    {
      id: 'fnb_daily_costs',
      specialist_slug: 'sinofinance',
      output_type: 'explanation',
      guardrail_promise: 'no_money_moves',
      goals: ['organize_finances', 'understand_numbers'],
      text: {
        en: { title: 'Track daily ingredient costs', message: '@SinoFinance explain how to track daily ingredient costs and margins for {business}' },
        id: { title: 'Mencatat biaya bahan harian', message: '@SinoFinance jelaskan cara mencatat biaya bahan harian dan margin untuk {business}' },
      },
    },
  ],
  services_agency: [
    {
      id: 'svc_proposal_outline',
      specialist_slug: 'sinosales',
      output_type: 'draft',
      guardrail_promise: 'draft_only',
      goals: ['find_customers'],
      text: {
        en: { title: 'A proposal outline', message: '@SinoSales draft a proposal outline for a new client of {business}' },
        id: { title: 'Kerangka proposal', message: '@SinoSales buatkan draf kerangka proposal untuk klien baru {business}' },
      },
    },
    {
      id: 'svc_case_posts',
      specialist_slug: 'sinosocial',
      output_type: 'draft',
      guardrail_promise: 'draft_only',
      goals: ['create_content'],
      text: {
        en: { title: 'Posts about your work', message: '@SinoSocial create a week of posts that show the work of {business}' },
        id: { title: 'Postingan tentang pekerjaanmu', message: '@SinoSocial buatkan postingan satu minggu yang menunjukkan hasil kerja {business}' },
      },
    },
    {
      id: 'svc_invoice_reminder',
      specialist_slug: 'sinofinance',
      output_type: 'explanation',
      guardrail_promise: 'no_money_moves',
      goals: ['organize_finances'],
      text: {
        en: { title: 'Follow up late invoices', message: '@SinoFinance explain a polite routine for following up late invoices at {business}' },
        id: { title: 'Menagih faktur yang terlambat', message: '@SinoFinance jelaskan rutinitas yang sopan untuk menagih faktur terlambat di {business}' },
      },
    },
  ],
};

const KNOWN_TASK_IDS: ReadonlySet<string> = new Set(
  [...GENERIC, ...Object.values(BY_TYPE).flat()].map((entry) => entry.id),
);

export function isKnownFirstTaskId(taskId: string): boolean {
  return KNOWN_TASK_IDS.has(taskId);
}

const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function fill(template: string, input: FirstTaskInput): string {
  const business = input.business_name ?? (input.locale === 'id' ? 'bisnis saya' : 'my business');
  const offer = input.offer_name ?? (input.locale === 'id' ? 'produk saya' : 'my products');
  return template.replaceAll('{business}', business).replaceAll('{offer}', offer);
}

function toTask(entry: CatalogEntry, input: FirstTaskInput): FirstTask {
  const text = entry.text[input.locale];
  return {
    task_id: entry.id,
    specialist_slug: entry.specialist_slug,
    output_type: entry.output_type,
    guardrail_promise: entry.guardrail_promise,
    title: fill(text.title, input),
    message: fill(text.message, input),
  };
}

/**
 * Exactly three tasks. Order of choice: tasks matching the owner's goals (one
 * per specialist first, so the three do not all come from one product), then
 * the rest of the pool in catalog order. A task dismissed within the last week
 * is skipped; only when the pool would otherwise fall below three are
 * dismissed ones brought back, oldest dismissal first.
 */
export function selectFirstTasks(input: FirstTaskInput): FirstTask[] {
  const typePool = input.business_type ? (BY_TYPE[input.business_type] ?? []) : [];
  const pool = [...typePool, ...GENERIC];

  const recent = new Map<string, number>();
  for (const d of input.dismissed) {
    const at = Date.parse(d.dismissed_at);
    if (Number.isFinite(at) && input.now.getTime() - at < DISMISS_WINDOW_MS) {
      recent.set(d.task_id, at);
    }
  }
  const available = pool.filter((entry) => !recent.has(entry.id));

  const picked: CatalogEntry[] = [];
  const usesSpecialist = (slug: string) => picked.some((p) => p.specialist_slug === slug);
  const add = (entry: CatalogEntry | undefined): void => {
    if (entry && picked.length < 3 && !picked.includes(entry)) {
      picked.push(entry);
    }
  };

  for (const goal of input.goals) {
    add(available.find((e) => e.goals.includes(goal) && !picked.includes(e) && !usesSpecialist(e.specialist_slug)));
  }
  for (const entry of available) {
    if (!usesSpecialist(entry.specialist_slug)) add(entry);
  }
  for (const entry of available) add(entry);

  if (picked.length < 3) {
    const revived = pool
      .filter((entry) => recent.has(entry.id))
      .sort((a, b) => (recent.get(a.id) ?? 0) - (recent.get(b.id) ?? 0));
    for (const entry of revived) add(entry);
  }

  return picked.map((entry) => toTask(entry, input));
}