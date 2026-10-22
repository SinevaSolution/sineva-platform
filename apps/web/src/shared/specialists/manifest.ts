// Presentation manifest for the specialists (ADR-0024, FR-SPEC-05).
//
// Code, not a table: one entry per specialist, keyed by the sineva-ai slug.
// It holds how a specialist looks and reads (accent, room theme, localized
// copy, order) and nothing about whether it exists or is available. sineva-ai
// owns that, so the shell can render from this file while sineva-ai is down,
// and the roster route still answers 503 instead of passing this list off as
// availability.
//
// This file is pure data and types so server components, client components and
// route handlers can all import it. Strings here never pass through
// `messages/*.json`, so `specialist_manifest.test.ts` runs the same copy lint
// over them.

import type { LocaleCode } from '@sineva/i18n';

// Fixed enum, validated by the compiler and the tests, so no data can inject a
// color (FR-UX-16). The first six have ramps in CSS today (`data-product-accent`
// in globals.css); the other seven are reserved for waves 2 and 3 so adding a
// specialist later does not change this type.
export const ACCENT_KEYS = [
  'people',
  'finance',
  'sales',
  'social',
  'help',
  'insights',
  'desk',
  'write',
  'shop',
  'guard',
  'tax',
  'legal',
  'ops',
] as const;
export type AccentKey = (typeof ACCENT_KEYS)[number];

export interface SpecialistCopy {
  /** A job title that reads inside a sentence ("I'm your Finance Specialist"), so it is Title Case in both languages. */
  role_title: string;
  short_description: string;
  starter_prompts: readonly [string, string, string];
}

// Keyed by the locale registry's type, so enabling a locale fails to compile
// until every specialist has copy for it (FR-UX-37a).
export type SpecialistCopyByLocale = Record<LocaleCode, SpecialistCopy>;

export interface SpecialistManifestEntry {
  agent_slug: string;
  /** Handle form, never "Sino Finance" (FR-SPEC-07). A proper name, so it is not localized. */
  display_name: string;
  accent_key: AccentKey;
  /** Names the Room background in `public/rooms` (`/rooms/<id>.avif|webp`). */
  room_theme_id: string;
  order: number;
  copy: SpecialistCopyByLocale;
}

/** What the shell receives: one language already picked, plain serializable data. */
export interface LocalizedSpecialist {
  agent_slug: string;
  display_name: string;
  role_title: string;
  short_description: string;
  accent_key: AccentKey;
  room_theme_id: string;
  starter_prompts: readonly [string, string, string];
}

export const SPECIALIST_MANIFEST: readonly SpecialistManifestEntry[] = [
  {
    agent_slug: 'sinopeople',
    display_name: 'SinoPeople',
    accent_key: 'people',
    room_theme_id: 'sinopeople',
    order: 1,
    copy: {
      en: {
        role_title: 'People & HR Specialist',
        short_description:
          'Drafts job posts, onboarding plans and review questions, and sums up how your team is doing. Never hires or rejects anyone.',
        starter_prompts: [
          'Write a job post for a part-time barista',
          'Draft a friendly onboarding checklist for new hires',
          'Help me prepare questions for a performance review',
        ],
      },
      id: {
        role_title: 'Spesialis SDM',
        short_description:
          'Menyusun draf iklan lowongan, rencana onboarding, dan pertanyaan evaluasi, serta merangkum kondisi timmu. Tidak pernah merekrut atau menolak siapa pun.',
        starter_prompts: [
          'Tulis iklan lowongan untuk barista paruh waktu',
          'Buat draf daftar periksa onboarding yang ramah untuk karyawan baru',
          'Bantu aku menyiapkan pertanyaan untuk evaluasi kinerja',
        ],
      },
    },
  },
  {
    agent_slug: 'sinofinance',
    display_name: 'SinoFinance',
    accent_key: 'finance',
    room_theme_id: 'sinofinance',
    order: 2,
    copy: {
      en: {
        role_title: 'Finance & Cash Flow Specialist',
        short_description:
          'Explains invoices, flags unusual spending and outlines your cash flow. Gives information, never moves money.',
        starter_prompts: [
          'Make a simple cash flow plan for next month',
          'Explain this invoice and what I should check',
          'Draft a polite payment reminder to a client',
        ],
      },
      id: {
        role_title: 'Spesialis Keuangan & Arus Kas',
        short_description:
          'Menjelaskan invoice, menandai pengeluaran yang tidak biasa, dan menyusun gambaran arus kas. Memberi informasi, tidak pernah memindahkan uang.',
        starter_prompts: [
          'Buat rencana arus kas sederhana untuk bulan depan',
          'Jelaskan invoice ini dan apa yang perlu aku periksa',
          'Buat draf pengingat pembayaran yang sopan untuk klien',
        ],
      },
    },
  },
  {
    agent_slug: 'sinosales',
    display_name: 'SinoSales',
    accent_key: 'sales',
    room_theme_id: 'sinosales',
    order: 3,
    copy: {
      en: {
        role_title: 'Sales & Pipeline Specialist',
        short_description:
          'Drafts follow-ups and proposals, scores leads and suggests next steps. Nothing goes out until you approve it.',
        starter_prompts: [
          'Write a follow-up email after a product demo',
          'Turn my notes into a short sales proposal',
          'Suggest three ways to reach new local customers',
        ],
      },
      id: {
        role_title: 'Spesialis Penjualan & Prospek',
        short_description:
          'Menyusun draf tindak lanjut dan proposal, menilai prospek, dan menyarankan langkah berikutnya. Tidak ada yang terkirim sebelum kamu setujui.',
        starter_prompts: [
          'Tulis email tindak lanjut setelah demo produk',
          'Ubah catatanku jadi proposal penjualan singkat',
          'Sarankan tiga cara menjangkau pelanggan lokal baru',
        ],
      },
    },
  },
  {
    agent_slug: 'sinosocial',
    display_name: 'SinoSocial',
    accent_key: 'social',
    room_theme_id: 'sinosocial',
    order: 4,
    copy: {
      en: {
        role_title: 'Social & Content Specialist',
        short_description:
          'Plans content, writes captions for each channel and drafts posts. Nothing is posted until you approve it.',
        starter_prompts: [
          'Plan five Instagram posts for this week',
          'Write a caption for our new menu item',
          'Turn this announcement into a LinkedIn post',
        ],
      },
      id: {
        role_title: 'Spesialis Media Sosial & Konten',
        short_description:
          'Merencanakan konten, menulis caption untuk tiap kanal, dan menyusun draf unggahan. Tidak ada yang diunggah sebelum kamu setujui.',
        starter_prompts: [
          'Rencanakan lima unggahan Instagram untuk minggu ini',
          'Tulis caption untuk menu baru kami',
          'Ubah pengumuman ini jadi unggahan LinkedIn',
        ],
      },
    },
  },
  {
    agent_slug: 'sinohelp',
    display_name: 'SinoHelp',
    accent_key: 'help',
    room_theme_id: 'sinohelp',
    order: 5,
    copy: {
      en: {
        role_title: 'Customer Support Specialist',
        short_description:
          'Drafts replies to customers from the answers you approve, and hands anything new or sensitive to you.',
        starter_prompts: [
          'Draft a reply to a customer asking for a refund',
          'Write answers for our five most common questions',
          'Make a calm reply to an unhappy review',
        ],
      },
      id: {
        role_title: 'Spesialis Dukungan Pelanggan',
        short_description:
          'Menyusun balasan untuk pelanggan dari jawaban yang sudah kamu setujui, dan menyerahkan hal baru atau sensitif kepadamu.',
        starter_prompts: [
          'Buat draf balasan untuk pelanggan yang minta pengembalian dana',
          'Tulis jawaban untuk lima pertanyaan yang paling sering muncul',
          'Buat balasan yang tenang untuk ulasan yang kurang puas',
        ],
      },
    },
  },
  {
    agent_slug: 'sinoinsights',
    display_name: 'SinoInsights',
    accent_key: 'insights',
    room_theme_id: 'sinoinsights',
    order: 6,
    copy: {
      en: {
        role_title: 'Business Insights Specialist',
        short_description:
          'Reads your numbers, sums up what changed and suggests what to track. Read only, it never edits your records.',
        starter_prompts: [
          'What should I look at in my monthly sales numbers?',
          'Compare this month and last month and tell me what changed',
          'Suggest three numbers I should track every week',
        ],
      },
      id: {
        role_title: 'Spesialis Analisis Bisnis',
        short_description:
          'Membaca angka bisnismu, merangkum apa yang berubah, dan menyarankan apa yang perlu dipantau. Hanya membaca, tidak pernah mengubah datamu.',
        starter_prompts: [
          'Apa yang perlu aku lihat di angka penjualan bulananku?',
          'Bandingkan bulan ini dan bulan lalu, lalu kasih tahu apa yang berubah',
          'Sarankan tiga angka yang perlu aku pantau tiap minggu',
        ],
      },
    },
  },
];

export function findManifestEntry(slug: string): SpecialistManifestEntry | undefined {
  return SPECIALIST_MANIFEST.find((entry) => entry.agent_slug === slug);
}

/** The manifest in display order with one language picked, for the shell. */
export function localizeSpecialists(locale: LocaleCode): LocalizedSpecialist[] {
  return [...SPECIALIST_MANIFEST]
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      agent_slug: entry.agent_slug,
      display_name: entry.display_name,
      role_title: entry.copy[locale].role_title,
      short_description: entry.copy[locale].short_description,
      accent_key: entry.accent_key,
      room_theme_id: entry.room_theme_id,
      starter_prompts: entry.copy[locale].starter_prompts,
    }));
}
