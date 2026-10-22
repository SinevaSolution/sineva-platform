// Website scan (FR-ONB-09 to FR-ONB-13). The platform owns the request record,
// rate limit and expiry; sineva-ai fetches and extracts. The result shapes
// below follow the proposed contract (ADR-0031, fixtures `scan_*.json`).

export const SCAN_RATE_LIMIT = 5;
export const SCAN_RATE_WINDOW_MS = 60 * 60 * 1000;
export const SCAN_RESULT_TTL_MS = 24 * 60 * 60 * 1000;

export type ScanStatus = 'queued' | 'running' | 'partial' | 'succeeded' | 'failed';

/** Typed reasons a scan that ran could not read the page (sineva-ai side). */
export const SCAN_FAILURE_CODES = [
  'unreachable_url',
  'blocked_by_robots',
  'login_required',
  'captcha_or_js_required',
  'not_html',
  'too_large',
  'timeout',
  'blocked_target',
  'extraction_failed',
] as const;
export type ScanFailureCode = (typeof SCAN_FAILURE_CODES)[number];

/** Reasons the platform itself records when the call to sineva-ai did not complete. */
export type PlatformScanErrorCode = 'ai_engine_unavailable' | 'ai_engine_bad_response' | 'scan_timeout';

/** Not counted against the hourly quota: the scan never reached the fetcher. */
export const UNCOUNTED_SCAN_ERRORS: readonly string[] = ['ai_engine_unavailable'];

export interface ScanEvidence {
  source_url: string;
  evidence_snippet: string;
}

export interface ScanTextField extends ScanEvidence {
  value: string;
}

export interface ScanContactChannel {
  kind: 'whatsapp' | 'phone' | 'email' | 'instagram' | 'other';
  value: string;
}

export interface ScanResult {
  scan_id: string;
  status: 'succeeded' | 'partial' | 'failed';
  source_url: string;
  final_url: string | null;
  fetched_pages: number;
  site_language: string | null;
  fields: {
    display_name?: ScanTextField;
    description?: ScanTextField;
    tone_cues?: ScanEvidence & { value: string[] };
    contact_channels?: ScanEvidence & { value: ScanContactChannel[] };
  };
  /** No price on purpose: a price exists only when the owner types it (FR-ONB-16). */
  offers: Array<ScanEvidence & { name: string; description: string | null }>;
  policies: Array<ScanEvidence & { kind: string; title: string; body: string }>;
  error_code: ScanFailureCode | null;
}

export interface ProfileScanEntity {
  id: string;
  workspace_id: string;
  requested_by: string;
  url: string;
  status: ScanStatus;
  result: ScanResult | null;
  error_code: string | null;
  created_at: string;
  expires_at: string;
}
