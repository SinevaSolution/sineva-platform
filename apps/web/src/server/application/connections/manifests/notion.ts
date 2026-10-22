import { z } from 'zod';
import type { ProviderManifest } from '@/server/domain/connections/connector';
import { defineAction, loc } from './define';

const P = 'notion';
const READ = 'notion.read_content';
const UPDATE = 'notion.update_content';

const page = z.object({ id: z.string(), title: z.string(), url: z.string().optional(), last_edited_time: z.string().optional() });

export const NOTION: ProviderManifest = {
  provider_id: P,
  display_name: 'Notion',
  category: 'knowledge',
  status: 'available',
  auth_type: 'oauth2_pkce',
  personal_capable: false,
  description: loc(
    'Let your specialists read the pages you share, and keep your Library in sync.',
    'Biar spesialismu bisa membaca halaman yang kamu bagikan, dan menjaga Library tetap mutakhir.',
  ),
  // Notion has no scope strings: what an integration can do is fixed when it is
  // created in Notion, and the person picks the pages at the consent screen. The
  // two keys below are Sineva's own names for those capabilities, so the access
  // matrix and labels work like any other provider.
  scopes: [
    {
      scope_key: READ,
      label: loc('Read the pages and databases you share', 'Membaca halaman dan database yang kamu bagikan'),
      access_class: 'read',
    },
    {
      scope_key: UPDATE,
      label: loc('Add and edit pages you share', 'Menambah dan mengubah halaman yang kamu bagikan'),
      access_class: 'write',
    },
  ],
  bundles: [
    {
      bundle_key: 'workspace_content',
      label: loc('Read and edit the pages you share', 'Baca dan ubah halaman yang kamu bagikan'),
      scope_keys: [READ, UPDATE],
    },
  ],
  oauth: {
    authorize_url: 'https://api.notion.com/v1/oauth/authorize',
    token_url: 'https://api.notion.com/v1/oauth/token',
    issuer: 'https://api.notion.com',
    // Recalling, not verified (OQ-CONN-8): Notion's public OAuth documents no
    // PKCE, so it is off here; turn it on when the documentation says otherwise.
    pkce: false,
    scope_separator: ' ',
    send_scope_param: false,
    extra_authorize_params: { owner: 'user' },
    // Recalling, not verified: HTTP Basic client authentication and a JSON body.
    client_auth: 'basic',
    token_request_format: 'json',
    // Recalling, not verified: Notion access tokens carry no expiry and no refresh token.
    token_lifetime: 'non_expiring',
    scopes_in_token_response: false,
    whoami: { source: 'token_response', account_id_path: 'workspace_id', account_label_path: 'workspace_name' },
    credential_keys: { client_id: 'notion_client_id', client_secret: 'notion_client_secret' },
  },
  egress: [{ host: 'api.notion.com', path_prefixes: ['/v1/'] }],
  actions: [
    defineAction({
      action_id: 'notion_search',
      provider_id: P,
      side_effect: 'read',
      scopes: [READ],
      input_schema: z.object({ query: z.string().max(200), max_results: z.number().int().min(1).max(25).default(10) }).strict(),
      output_schema: z.object({ results: z.array(page) }),
      sentence: loc('Search your shared pages', 'Cari di halaman yang kamu bagikan'),
    }),
    defineAction({
      action_id: 'notion_get_page',
      provider_id: P,
      side_effect: 'read',
      scopes: [READ],
      input_schema: z.object({ page_id: z.string().min(1) }).strict(),
      output_schema: z.object({ page, text: z.string() }),
      sentence: loc('Read one page', 'Baca satu halaman'),
    }),
    defineAction({
      action_id: 'notion_query_database',
      provider_id: P,
      side_effect: 'read',
      scopes: [READ],
      input_schema: z.object({ database_id: z.string().min(1), max_results: z.number().int().min(1).max(50).default(20) }).strict(),
      output_schema: z.object({ rows: z.array(z.record(z.string(), z.unknown())) }),
      sentence: loc('Read rows from a database', 'Baca baris dari sebuah database'),
    }),
    defineAction({
      action_id: 'notion_create_page',
      provider_id: P,
      side_effect: 'write_external',
      scopes: [UPDATE],
      input_schema: z
        .object({ parent_id: z.string().min(1), title: z.string().min(1).max(200), text: z.string().max(20_000).optional() })
        .strict(),
      output_schema: page,
      sentence: loc('Create the page "{title}" in Notion', 'Buat halaman "{title}" di Notion'),
      reversible: true,
    }),
    defineAction({
      action_id: 'notion_update_page',
      provider_id: P,
      side_effect: 'write_external',
      scopes: [UPDATE],
      input_schema: z
        .object({ page_id: z.string().min(1), title: z.string().min(1).max(200).optional(), text: z.string().max(20_000).optional() })
        .strict(),
      output_schema: page,
      sentence: loc('Change the page "{title}" in Notion', 'Ubah halaman "{title}" di Notion'),
      reversible: false,
    }),
  ],
};
