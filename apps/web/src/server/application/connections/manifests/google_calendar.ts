import { z } from 'zod';
import type { ProviderManifest } from '@/server/domain/connections/connector';
import { defineAction, loc } from './define';

const P = 'google_calendar';
const CAL = 'https://www.googleapis.com/auth/calendar.readonly';
const EVENTS = 'https://www.googleapis.com/auth/calendar.events';
const EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

const eventTime = z.object({ date_time: z.string().min(1), time_zone: z.string().optional() });
const eventOutput = z.object({
  id: z.string(),
  title: z.string(),
  start: eventTime,
  end: eventTime,
  location: z.string().nullable().optional(),
  html_link: z.string().optional(),
});

export const GOOGLE_CALENDAR: ProviderManifest = {
  provider_id: P,
  display_name: 'Google Calendar',
  category: 'calendar',
  status: 'available',
  auth_type: 'oauth2_pkce',
  // A member may connect their own calendar privately (FR-CONN-03, OQ-CONN-7 default).
  personal_capable: true,
  description: loc(
    'See your schedule and, when you allow it, add or change events. Sineva asks you first.',
    'Lihat jadwalmu dan, kalau kamu izinkan, tambah atau ubah acara. Sineva selalu tanya kamu dulu.',
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
      scope_key: CAL,
      label: loc('See your calendars and events', 'Melihat kalender dan acaramu'),
      access_class: 'read',
    },
    {
      scope_key: EVENTS,
      label: loc('See and change events on your calendars', 'Melihat dan mengubah acara di kalendermu'),
      access_class: 'write',
    },
  ],
  bundles: [
    {
      bundle_key: 'calendar_read',
      label: loc('Read your calendar', 'Baca kalendermu'),
      scope_keys: ['openid', EMAIL, CAL],
    },
    {
      bundle_key: 'calendar_events',
      label: loc('Read and change events', 'Baca dan ubah acara'),
      scope_keys: ['openid', EMAIL, CAL, EVENTS],
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
    // Recalling, not verified (OQ-CONN-8): Google issues a refresh token only
    // with offline access and, on a repeat consent, only when consent is forced.
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
    { host: 'www.googleapis.com', path_prefixes: ['/calendar/v3/'] },
    { host: 'openidconnect.googleapis.com', path_prefixes: ['/v1/userinfo'] },
    { host: 'oauth2.googleapis.com', path_prefixes: ['/token', '/revoke'] },
  ],
  actions: [
    defineAction({
      action_id: 'google_calendar_list_calendars',
      provider_id: P,
      side_effect: 'read',
      scopes: [CAL],
      input_schema: z.object({}).strict(),
      output_schema: z.object({ calendars: z.array(z.object({ id: z.string(), name: z.string(), primary: z.boolean().optional() })) }),
      sentence: loc('List your calendars', 'Tampilkan daftar kalendermu'),
    }),
    defineAction({
      action_id: 'google_calendar_list_events',
      provider_id: P,
      side_effect: 'read',
      scopes: [CAL],
      input_schema: z
        .object({
          calendar_id: z.string().default('primary'),
          time_min: z.string().optional(),
          time_max: z.string().optional(),
          max_results: z.number().int().min(1).max(50).default(20),
        })
        .strict(),
      output_schema: z.object({ events: z.array(eventOutput) }),
      sentence: loc('Read your events', 'Baca acaramu'),
      display_card_type: 'calendar_events',
    }),
    defineAction({
      action_id: 'google_calendar_get_event',
      provider_id: P,
      side_effect: 'read',
      scopes: [CAL],
      input_schema: z.object({ calendar_id: z.string().default('primary'), event_id: z.string().min(1) }).strict(),
      output_schema: eventOutput,
      sentence: loc('Read one event', 'Baca satu acara'),
    }),
    defineAction({
      action_id: 'google_calendar_create_event',
      provider_id: P,
      side_effect: 'write_external',
      scopes: [EVENTS],
      input_schema: z
        .object({
          calendar_id: z.string().default('primary'),
          title: z.string().min(1).max(200),
          start: eventTime,
          end: eventTime,
          location: z.string().max(300).optional(),
          description: z.string().max(2000).optional(),
          attendee_emails: z.array(z.string().email()).max(20).optional(),
        })
        .strict(),
      output_schema: eventOutput,
      sentence: loc('Add "{title}" to your calendar at {start}', 'Tambahkan "{title}" ke kalendermu pada {start}'),
      reversible: true,
      display_card_type: 'calendar_events',
    }),
    defineAction({
      action_id: 'google_calendar_update_event',
      provider_id: P,
      side_effect: 'write_external',
      scopes: [EVENTS],
      input_schema: z
        .object({
          calendar_id: z.string().default('primary'),
          event_id: z.string().min(1),
          title: z.string().min(1).max(200).optional(),
          start: eventTime.optional(),
          end: eventTime.optional(),
          location: z.string().max(300).optional(),
        })
        .strict(),
      output_schema: eventOutput,
      sentence: loc('Change the event "{title}"', 'Ubah acara "{title}"'),
      reversible: false,
    }),
  ],
};
