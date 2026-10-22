import { z } from 'zod';
import type { ProviderManifest } from '@/server/domain/connections/connector';
import { defineAction, loc } from './define';

// Gmail shares the Google Connect client with Calendar. Both Gmail scopes below
// are restricted (checked 2026-10-22 against Google's scope reference):
// https://developers.google.com/workspace/gmail/api/auth/scopes
// External testing uses registered test accounts; public use needs verification
// and a security assessment when restricted data is stored or transmitted by servers.
const P = 'gmail';
const READ = 'https://www.googleapis.com/auth/gmail.readonly';
// gmail.compose covers drafts and sending them; narrower than full mail access.
const COMPOSE = 'https://www.googleapis.com/auth/gmail.compose';
const EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

const address = z.string().email();
const messageSummary = z.object({
  id: z.string(),
  thread_id: z.string(),
  from: z.string(),
  subject: z.string(),
  snippet: z.string(),
  received_at: z.string(),
  unread: z.boolean().optional(),
});

export const GMAIL: ProviderManifest = {
  provider_id: P,
  display_name: 'Gmail',
  category: 'messaging',
  status: 'available',
  auth_type: 'oauth2_pkce',
  // A mailbox is personal by nature; a shared inbox can still be connected for the workspace.
  personal_capable: true,
  description: loc(
    'Let your specialists read and search your email and, when you allow it, prepare and send replies. Sineva asks you before anything is sent.',
    'Biarkan para Spesialis membaca dan mencari email kamu dan, kalau kamu izinkan, menyiapkan serta mengirim balasan. Sineva selalu tanya kamu dulu sebelum ada yang terkirim.',
  ),
  scopes: [
    {
      scope_key: 'openid',
      label: loc('Know which Google account is connected', 'Tahu akun Google mana yang terhubung'),
      access_class: 'read',
    },
    {
      scope_key: EMAIL,
      label: loc('See your email address', 'Melihat alamat emailmu'),
      access_class: 'read',
    },
    {
      scope_key: READ,
      label: loc('Read and search your email', 'Membaca dan mencari email kamu'),
      access_class: 'read',
    },
    {
      scope_key: COMPOSE,
      label: loc('Prepare drafts and send email for you', 'Menyiapkan draf dan mengirim email untukmu'),
      access_class: 'write',
    },
  ],
  bundles: [
    {
      bundle_key: 'email_read',
      label: loc('Read your email', 'Baca email kamu'),
      scope_keys: ['openid', EMAIL, READ],
    },
    {
      bundle_key: 'email_compose',
      label: loc('Read email, prepare and send replies', 'Baca email, siapkan dan kirim balasan'),
      scope_keys: ['openid', EMAIL, READ, COMPOSE],
    },
  ],
  oauth: {
    authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    revoke_url: 'https://oauth2.googleapis.com/revoke',
    issuer: 'https://accounts.google.com',
    pkce: true,
    scope_separator: ' ',
    send_scope_param: true,
    extra_authorize_params: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    client_auth: 'body',
    token_request_format: 'form',
    token_lifetime: 'expiring',
    scopes_in_token_response: true,
    whoami: {
      source: 'endpoint',
      url: 'https://openidconnect.googleapis.com/v1/userinfo',
      account_id_path: 'sub',
      account_label_path: 'email',
    },
    credential_keys: { client_id: 'google_connect_client_id', client_secret: 'google_connect_client_secret' },
  },
  egress: [
    { host: 'gmail.googleapis.com', path_prefixes: ['/gmail/v1/'] },
    { host: 'openidconnect.googleapis.com', path_prefixes: ['/v1/userinfo'] },
    { host: 'oauth2.googleapis.com', path_prefixes: ['/token', '/revoke'] },
  ],
  actions: [
    defineAction({
      action_id: 'gmail_search_messages',
      provider_id: P,
      side_effect: 'read',
      scopes: [READ],
      input_schema: z
        .object({
          query: z.string().max(500).default(''),
          max_results: z.number().int().min(1).max(25).default(10),
        })
        .strict(),
      output_schema: z.object({ messages: z.array(messageSummary) }),
      sentence: loc('Search your email', 'Cari di email kamu'),
    }),
    defineAction({
      action_id: 'gmail_get_message',
      provider_id: P,
      side_effect: 'read',
      scopes: [READ],
      input_schema: z.object({ message_id: z.string().min(1) }).strict(),
      output_schema: messageSummary.extend({ to: z.array(z.string()), body_text: z.string(), body_source: z.enum(['plain_text', 'snippet']).optional() }),
      sentence: loc('Read one email', 'Baca satu email'),
    }),
    defineAction({
      action_id: 'gmail_create_draft',
      provider_id: P,
      side_effect: 'write_external',
      scopes: [COMPOSE],
      input_schema: z
        .object({
          to: z.array(address).min(1).max(20),
          cc: z.array(address).max(20).optional(),
          subject: z.string().min(1).max(250),
          body_text: z.string().min(1).max(20000),
          reply_to_message_id: z.string().optional(),
        })
        .strict(),
      output_schema: z.object({ draft_id: z.string(), message_id: z.string() }),
      sentence: loc('Save a draft "{subject}" in your Gmail', 'Simpan draf "{subject}" di Gmail kamu'),
      reversible: true,
    }),
    defineAction({
      action_id: 'gmail_send_message',
      provider_id: P,
      side_effect: 'write_external',
      scopes: [COMPOSE],
      input_schema: z
        .object({
          to: z.array(address).min(1).max(20),
          cc: z.array(address).max(20).optional(),
          subject: z.string().min(1).max(250),
          body_text: z.string().min(1).max(20000),
          reply_to_message_id: z.string().optional(),
        })
        .strict(),
      output_schema: z.object({ message_id: z.string(), thread_id: z.string() }),
      sentence: loc('Send "{subject}" to {to}', 'Kirim "{subject}" ke {to}'),
      // A sent email cannot be taken back.
      reversible: false,
    }),
  ],
};
