import type { ScanResult } from '@/server/domain/onboarding/profile_scan';

export interface WebsiteScanCall {
  source_url: string;
  locale: 'id' | 'en';
  /** The platform's scan record id, echoed back by sineva-ai for correlation. */
  scan_id: string;
  contextToken: string;
  requestId?: string;
}

/**
 * Port to the website scan in sineva-ai (WP-M1-10). The contract is proposed
 * by the platform and pending sineva-ai (ADR-0031).
 *
 * @throws UpstreamUnavailableError (503) when sineva-ai cannot be reached.
 * @throws UpstreamServiceError (502) on a non-2xx answer or a body that is not
 *   the contract. A scan that ran and could not read the page is not an error:
 *   it resolves with `status: 'failed'` and a typed `error_code`.
 */
export interface WebsiteScanGateway {
  scan(call: WebsiteScanCall): Promise<ScanResult>;
}
