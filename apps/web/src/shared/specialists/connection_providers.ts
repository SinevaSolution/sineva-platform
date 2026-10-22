import { SPECIALIST_MANIFEST } from './manifest';

// Which specialists' built-in skills declare which connection provider
// (ADR-0039 decision 4). A new connection grants Read to exactly these
// specialists. A stopgap table: it moves into the skill bundles when WP-M2-24
// lands, and a skill that needs a provider is declared there, not here. Pure
// data beside the specialist manifest, so it needs no table and no sineva-ai call.
//
// The mapping is a product assumption made while building the connection layer,
// not a decision of the specialist PRDs: calendars for the specialists that
// schedule (people, sales), payment data for SinoFinance only, and shared
// knowledge for the specialists that answer from it (sales, help, insights).
// Payment providers are not given to SinoInsights on purpose: read access to
// money data is a deliberate grant, not a default.
export const SPECIALIST_CONNECTION_PROVIDERS: Readonly<Record<string, readonly string[]>> = {
  sinopeople: ['google_calendar'],
  sinofinance: ['xendit', 'midtrans', 'mekari_jurnal'],
  sinosales: ['google_calendar', 'gmail', 'notion'],
  sinosocial: [],
  sinohelp: ['gmail', 'notion'],
  sinoinsights: ['notion'],
};

/** Specialist slugs declaring `providerId`, in manifest order. */
export function specialistsDeclaring(providerId: string): readonly string[] {
  return SPECIALIST_MANIFEST.filter((entry) =>
    (SPECIALIST_CONNECTION_PROVIDERS[entry.agent_slug] ?? []).includes(providerId),
  ).map((entry) => entry.agent_slug);
}
