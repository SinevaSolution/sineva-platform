import type { ProviderManifest } from '@/server/domain/connections/connector';
import { loc } from './define';

// Catalog entries without drivers (PRD 08 section F). They exist so the catalog
// shows what is planned, as non-link cards; the gateway and the flow never see
// them. Review lead times, not code, decide when each becomes available.
function soon(entry: Pick<ProviderManifest, 'provider_id' | 'display_name' | 'category' | 'auth_type' | 'description'>): ProviderManifest {
  return {
    ...entry,
    status: 'coming_soon',
    personal_capable: false,
    scopes: [],
    bundles: [],
    egress: [],
    actions: [],
  };
}

export const COMING_SOON: readonly ProviderManifest[] = [
  soon({
    provider_id: 'mekari_jurnal',
    display_name: 'Mekari Jurnal',
    category: 'accounting',
    auth_type: 'oauth2_pkce',
    description: loc('Read your invoices and contacts for bookkeeping questions.', 'Baca faktur dan kontakmu untuk pertanyaan pembukuan.'),
  }),
  soon({
    provider_id: 'whatsapp_business',
    display_name: 'WhatsApp Business',
    category: 'messaging',
    auth_type: 'embedded_signup',
    description: loc('Draft replies to your customers from answers you approved.', 'Siapkan balasan untuk pelangganmu dari jawaban yang sudah kamu setujui.'),
  }),
  soon({
    provider_id: 'instagram',
    display_name: 'Instagram',
    category: 'messaging',
    auth_type: 'oauth2_pkce',
    description: loc('Draft posts and replies for your account.', 'Siapkan draf posting dan balasan untuk akunmu.'),
  }),
  soon({
    provider_id: 'shopee',
    display_name: 'Shopee',
    category: 'marketplace',
    auth_type: 'hmac',
    description: loc('Read orders and stock from your shop.', 'Baca pesanan dan stok dari tokomu.'),
  }),
  soon({
    provider_id: 'tiktok_shop',
    display_name: 'TikTok Shop',
    category: 'marketplace',
    auth_type: 'oauth2_pkce',
    description: loc('Read orders and stock from your shop.', 'Baca pesanan dan stok dari tokomu.'),
  }),
];
