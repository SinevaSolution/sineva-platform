import { z } from 'zod';
import type { ProviderManifest } from '@/server/domain/connections/connector';
import { defineAction, loc } from './define';

const READ = 'read_payments';

// Payment providers connect with a pasted API key, and every action is a read:
// SinoFinance never moves money (product guardrail), and the registry self-check
// rejects a write or a `pay` here even if the key itself could do more (FR-CONN-29).
const readScope = {
  scope_key: READ,
  label: loc('Read payments, balance and invoices', 'Membaca pembayaran, saldo, dan faktur'),
  access_class: 'read' as const,
};
const readBundle = {
  bundle_key: 'read_only',
  label: loc('Read only', 'Hanya baca'),
  scope_keys: [READ],
};

const money = z.object({ amount: z.number(), currency: z.string() });

export const XENDIT: ProviderManifest = {
  provider_id: 'xendit',
  display_name: 'Xendit',
  category: 'payments',
  status: 'available',
  auth_type: 'api_key',
  personal_capable: false,
  description: loc(
    'Let SinoFinance read your payments and balance. It cannot change anything.',
    'Biar SinoFinance membaca pembayaran dan saldomu. SinoFinance tidak bisa mengubah apa pun.',
  ),
  scopes: [readScope],
  bundles: [readBundle],
  api_key: {
    fields: [{ field_key: 'secret_key', label: loc('Secret API key', 'Kunci API rahasia'), kind: 'secret' }],
    test: {
      method: 'GET',
      // Recalling, not verified (OQ-CONN-8): the balance endpoint answers 200 for
      // a valid key, 401 for an invalid one and 403 when the key lacks the permission.
      url_by_environment: { default: 'https://api.xendit.co/balance' },
      auth: 'basic_user',
      accept_statuses: [200],
      invalid_statuses: [401],
      insufficient_statuses: [403],
    },
  },
  egress: [{ host: 'api.xendit.co', path_prefixes: ['/balance', '/transactions', '/v2/invoices'] }],
  actions: [
    defineAction({
      action_id: 'xendit_get_balance',
      provider_id: 'xendit',
      side_effect: 'read',
      scopes: [READ],
      input_schema: z.object({}).strict(),
      output_schema: z.object({ balance: z.number(), currency: z.string().optional() }),
      sentence: loc('Read your Xendit balance', 'Baca saldo Xendit-mu'),
    }),
    defineAction({
      action_id: 'xendit_list_transactions',
      provider_id: 'xendit',
      side_effect: 'read',
      scopes: [READ],
      input_schema: z
        .object({ created_after: z.string().optional(), created_before: z.string().optional(), limit: z.number().int().min(1).max(50).default(20) })
        .strict(),
      output_schema: z.object({ transactions: z.array(z.object({ id: z.string(), status: z.string(), amount: money, created: z.string() })) }),
      sentence: loc('Read your Xendit transactions', 'Baca transaksi Xendit-mu'),
    }),
    defineAction({
      action_id: 'xendit_get_invoice',
      provider_id: 'xendit',
      side_effect: 'read',
      scopes: [READ],
      input_schema: z.object({ invoice_id: z.string().min(1) }).strict(),
      output_schema: z.object({ id: z.string(), status: z.string(), amount: z.number(), currency: z.string().optional() }),
      sentence: loc('Read one Xendit invoice', 'Baca satu faktur Xendit'),
    }),
  ],
};

export const MIDTRANS: ProviderManifest = {
  provider_id: 'midtrans',
  display_name: 'Midtrans',
  category: 'payments',
  status: 'available',
  auth_type: 'api_key',
  personal_capable: false,
  description: loc(
    'Let SinoFinance read your payment statuses. It cannot change anything.',
    'Biar SinoFinance membaca status pembayaranmu. SinoFinance tidak bisa mengubah apa pun.',
  ),
  scopes: [readScope],
  bundles: [readBundle],
  api_key: {
    fields: [
      { field_key: 'server_key', label: loc('Server key', 'Server key'), kind: 'secret' },
      {
        field_key: 'environment',
        label: loc('Environment', 'Lingkungan'),
        kind: 'choice',
        choices: ['sandbox', 'production'],
      },
    ],
    test: {
      method: 'GET',
      // Recalling, not verified (OQ-CONN-8): Midtrans has no account call. A
      // status lookup for an order id that cannot exist answers 404 when the key
      // is accepted and 401 when it is not, so 404 counts as success here.
      url_by_environment: {
        sandbox: 'https://api.sandbox.midtrans.com/v2/sineva-connection-check/status',
        production: 'https://api.midtrans.com/v2/sineva-connection-check/status',
      },
      auth: 'basic_user',
      accept_statuses: [200, 404],
      invalid_statuses: [401],
      insufficient_statuses: [403],
    },
  },
  egress: [
    { host: 'api.midtrans.com', path_prefixes: ['/v2/', '/v1/payment-links'] },
    { host: 'api.sandbox.midtrans.com', path_prefixes: ['/v2/', '/v1/payment-links'] },
  ],
  actions: [
    defineAction({
      action_id: 'midtrans_get_transaction_status',
      provider_id: 'midtrans',
      side_effect: 'read',
      scopes: [READ],
      input_schema: z.object({ order_id: z.string().min(1).max(100) }).strict(),
      output_schema: z.object({ order_id: z.string(), transaction_status: z.string(), gross_amount: z.string().optional() }),
      sentence: loc('Read the payment status of an order', 'Baca status pembayaran sebuah pesanan'),
    }),
    defineAction({
      action_id: 'midtrans_get_payment_link',
      provider_id: 'midtrans',
      side_effect: 'read',
      scopes: [READ],
      input_schema: z.object({ payment_link_id: z.string().min(1).max(100) }).strict(),
      output_schema: z.object({ id: z.string(), status: z.string().optional() }),
      sentence: loc('Read a payment link', 'Baca sebuah tautan pembayaran'),
    }),
  ],
};
