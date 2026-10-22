import 'server-only';
import crypto from 'node:crypto';
import { z } from 'zod';

export interface AppEnvConfig {
  node_env: 'development' | 'test' | 'production';
  next_public_app_url: string;
  next_public_api_base_url: string;
  database_url: string;
  redis_url: string;
  redis_key_prefix: string;
  s3_endpoint: string;
  s3_public_endpoint: string;
  s3_region: string;
  s3_access_key_id: string;
  s3_secret_access_key: string;
  s3_bucket_name: string;
  s3_force_path_style: boolean;
  ai_engine_internal_url: string;
  ai_engine_internal_api_key: string;
  ai_engine_internal_api_key_next?: string;
  ai_engine_timeout_ms: number;
  auth_secret: string;
  internal_context_signing_key: string;
  internal_context_kid: string;
  email_from?: string;
  email_server_host?: string;
  email_server_port?: number;
  email_server_user?: string;
  email_server_password?: string;
  google_client_id?: string;
  google_client_secret?: string;
  github_client_id?: string;
  github_client_secret?: string;
}

// SHA-256 hashes of dev secrets from .env.example.
// Checked in production to prevent running with known dev defaults without storing
// plaintext credentials in code (SEC-4).
const KNOWN_DEV_SECRET_HASHES = new Set([
  'b771d363ab2b2a1581b2fc43b8f020176e33bbf16085842031fb84fe2c81fa94', // db password
  '3dcc625c0078488584bc846cfc24fd1c500a83146f8fa9f57f7dc5fa14acb074', // s3 key
  'b3a04bfe46a2f968f5c9f78305093e4c29580554f27acefca7f53f940ded8338', // s3 secret
  'd1a6090cbd7f04748ef60551015216ad376475b10c9fbffc289cb54f7c7104f5', // internal ai token
]);

// Values shipped for local development carry an explicit marker word between
// separators (for example "dev-..." or "..._dev"). The hash list covers the
// legacy compose credentials, the marker covers every value in .env.example
// without keeping a second plaintext copy of them in code. A random 256-bit
// secret hits the marker only by coincidence, and the error says what to change.
const DEV_MARKER =
  /(^|[-_.])(dev|development|changeme|change[-_]me|placeholder|example|insecure)([-_.0-9]|$)/i;

function matchesDevDefault(candidate: string): boolean {
  const hash = crypto.createHash('sha256').update(candidate.trim()).digest('hex');
  return KNOWN_DEV_SECRET_HASHES.has(hash) || DEV_MARKER.test(candidate);
}

function isDevDefaultSecret(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  if (matchesDevDefault(value)) {
    return true;
  }
  try {
    const parsed = new URL(value);
    // A connection URL: the credential is the password component.
    if (parsed.password && matchesDevDefault(decodeURIComponent(parsed.password))) {
      return true;
    }
  } catch {
    // Not a URL
  }
  return false;
}

const SECRET_KEYS = [
  'DATABASE_URL',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'AI_ENGINE_INTERNAL_API_KEY',
  'AUTH_SECRET',
  'INTERNAL_CONTEXT_SIGNING_KEY',
] as const;

const REQUIRED_NAMES_IN_PRODUCTION = [
  'REDIS_URL',
  'S3_ENDPOINT',
  'S3_PUBLIC_ENDPOINT',
  'AI_ENGINE_INTERNAL_URL',
  'INTERNAL_CONTEXT_KID',
] as const;

const timeoutSchema = z
  .string()
  .optional()
  .default('15000')
  .transform((val, ctx) => {
    const num = Number(val);
    if (Number.isNaN(num) || !Number.isInteger(num) || num < 1000 || num > 300000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'AI_ENGINE_TIMEOUT_MS must be an integer timeout between 1000 and 300000 ms (INF-6)',
      });
      return z.NEVER;
    }
    return num;
  });

export function validateEnvConfig(
  raw: Record<string, string | undefined>,
): AppEnvConfig {
  const nodeEnv = (raw.NODE_ENV ?? 'development') as
    | 'development'
    | 'test'
    | 'production';
  const isProduction = nodeEnv === 'production';

  // Parse timeout first to enforce INF-6 across all environments
  const timeoutResult = timeoutSchema.safeParse(raw.AI_ENGINE_TIMEOUT_MS);
  if (!timeoutResult.success) {
    throw new Error(timeoutResult.error.issues[0]?.message);
  }
  const timeoutMs = timeoutResult.data;

  // Credentials have no default anywhere in code, so every environment must
  // supply them: production from its secret store, development and tests from
  // .env.example (loaded in getEnvConfig). Failing fast beats booting with a
  // value that anyone who reads the repository already knows.
  for (const key of SECRET_KEYS) {
    if (!raw[key]?.trim()) {
      throw new Error(`Configuration error: ${key} is required (SEC-4)`);
    }
  }

  if (isProduction) {
    // Non-secret names that would otherwise fall back to a localhost or
    // Docker-internal address. The S3 public endpoint matters most: presigned
    // URLs are handed to browsers, and falling back to S3_ENDPOINT would hand
    // them an address they cannot reach.
    for (const key of REQUIRED_NAMES_IN_PRODUCTION) {
      if (!raw[key]?.trim()) {
        throw new Error(
          `Configuration error: ${key} is required in production environment (SEC-4)`,
        );
      }
    }

    for (const key of SECRET_KEYS) {
      if (isDevDefaultSecret(raw[key])) {
        throw new Error(
          `Configuration error: ${key} cannot equal a known dev default in production (SEC-4)`,
        );
      }
    }

    if (raw.AUTH_SECRET && raw.AUTH_SECRET.length < 32) {
      throw new Error(
        'Configuration error: AUTH_SECRET must be at least 32 characters in production',
      );
    }
  }

  return {
    node_env: nodeEnv,
    next_public_app_url:
      raw.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    next_public_api_base_url:
      raw.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1',
    database_url: raw.DATABASE_URL as string,
    redis_url: raw.REDIS_URL ?? 'redis://localhost:6379/0',
    redis_key_prefix: raw.REDIS_KEY_PREFIX ?? 'sineva:platform:',
    s3_endpoint: raw.S3_ENDPOINT ?? 'http://localhost:8333',
    s3_public_endpoint:
      raw.S3_PUBLIC_ENDPOINT ?? raw.S3_ENDPOINT ?? 'http://localhost:8333',
    s3_region: raw.S3_REGION ?? 'us-east-1',
    s3_access_key_id: raw.S3_ACCESS_KEY_ID as string,
    s3_secret_access_key: raw.S3_SECRET_ACCESS_KEY as string,
    s3_bucket_name: raw.S3_BUCKET_NAME ?? 'sineva-assets',
    s3_force_path_style: raw.S3_FORCE_PATH_STYLE !== 'false',
    ai_engine_internal_url:
      raw.AI_ENGINE_INTERNAL_URL ?? 'http://sineva-ai:8000',
    ai_engine_internal_api_key: raw.AI_ENGINE_INTERNAL_API_KEY as string,
    ai_engine_internal_api_key_next: raw.AI_ENGINE_INTERNAL_API_KEY_NEXT,
    ai_engine_timeout_ms: timeoutMs,
    auth_secret: raw.AUTH_SECRET as string,
    internal_context_signing_key: raw.INTERNAL_CONTEXT_SIGNING_KEY as string,
    internal_context_kid: raw.INTERNAL_CONTEXT_KID ?? 'k1',
    email_from: raw.EMAIL_FROM,
    email_server_host: raw.EMAIL_SERVER_HOST,
    email_server_port: raw.EMAIL_SERVER_PORT
      ? Number(raw.EMAIL_SERVER_PORT)
      : undefined,
    email_server_user: raw.EMAIL_SERVER_USER,
    email_server_password: raw.EMAIL_SERVER_PASSWORD,
    google_client_id: raw.GOOGLE_CLIENT_ID,
    google_client_secret: raw.GOOGLE_CLIENT_SECRET,
    github_client_id: raw.GITHUB_CLIENT_ID,
    github_client_secret: raw.GITHUB_CLIENT_SECRET,
  };
}

let cachedConfig: AppEnvConfig | null = null;

export function getEnvConfig(): AppEnvConfig {
  if (!cachedConfig) {
    if (process.env.NODE_ENV !== 'production' && typeof process.loadEnvFile === 'function') {
      for (const envFile of ['.env', '../../.env', '.env.example', '../../.env.example']) {
        try {
          process.loadEnvFile(envFile);
        } catch {
          // Fall through if file is not found
        }
      }
    }
    cachedConfig = validateEnvConfig(process.env);
  }
  return cachedConfig;
}
