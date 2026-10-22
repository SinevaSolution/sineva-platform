import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { validateEnvConfig } from '@/server/infrastructure/config/env';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { buildCspReportOnly } from '@/server/http/csp';
import { verifyCsrf } from '@/server/http/csrf_guard';
import { ForbiddenError } from '@/server/domain/errors/domain_error';

const ROOT_DIR = resolve(import.meta.dirname, '../../../../');
const WEB_DIR = resolve(import.meta.dirname, '../../');

const KNOWN_DEV_DEFAULTS = [
  'sineva_secret_password',
  'sineva_s3_key',
  'sineva_s3_secret',
  'sineva_internal_service_token_dev',
  'dev-s3-key',
  'dev-s3-secret',
  'dev-internal-token',
  'dev-signing-key',
  'dev-auth-secret',
];

// Variables whose value is a credential or key. The code carries no default for
// any of them: they come from the environment (production) or from .env.example
// (development and tests).
const SECRET_KEYS = [
  'DATABASE_URL',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'AI_ENGINE_INTERNAL_API_KEY',
  'AUTH_SECRET',
  'INTERNAL_CONTEXT_SIGNING_KEY',
];

function readEnvExample(): Record<string, string> {
  return parseEnv(readFileSync(resolve(ROOT_DIR, '.env.example'), 'utf8')) as Record<string, string>;
}

describe('WP-M0-09: Secrets Without Defaults & Web Hardening (H2)', () => {
  describe('Environment Config Validation (SEC-4, INF-6)', () => {
    const validProdEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:p7_xK9_SecureRealProdPw@postgres.prod:5432/sineva_platform',
      REDIS_URL: 'redis://redis.prod:6379/0',
      REDIS_KEY_PREFIX: 'sineva:platform:',
      S3_ENDPOINT: 'https://s3.internal.sineva.com',
      S3_PUBLIC_ENDPOINT: 'https://s3.sineva.com',
      S3_REGION: 'ap-southeast-3',
      S3_ACCESS_KEY_ID: 'AKIA_PROD_S3_KEY_REAL',
      S3_SECRET_ACCESS_KEY: 's3_prod_secret_key_long_and_complex_12345',
      S3_BUCKET_NAME: 'sineva-production-assets',
      S3_FORCE_PATH_STYLE: 'true',
      AI_ENGINE_INTERNAL_URL: 'http://sineva-ai:8000',
      AI_ENGINE_INTERNAL_API_KEY: 'snv_ai_prod_key_77a98c11bf882d9e',
      AI_ENGINE_TIMEOUT_MS: '15000',
      AUTH_SECRET: 'auth_secret_must_be_at_least_32_characters_long_real',
      INTERNAL_CONTEXT_SIGNING_KEY: '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgprod...',
      INTERNAL_CONTEXT_KID: 'k1',
    };

    it('validates a complete, secure production environment', () => {
      const parsed = validateEnvConfig(validProdEnv);
      expect(parsed.node_env).toBe('production');
      expect(parsed.ai_engine_timeout_ms).toBe(15000);
      expect(parsed.auth_secret).toBe(validProdEnv.AUTH_SECRET);
      expect(parsed.internal_context_kid).toBe('k1');
    });

    it('throws in production when a required secret is missing', () => {
      const missingAuth = { ...validProdEnv };
      delete (missingAuth as Record<string, string>).AUTH_SECRET;

      expect(() => validateEnvConfig(missingAuth)).toThrow(
        /AUTH_SECRET/i,
      );
    });

    it('throws in production when a secret equals a known dev default', () => {
      const devPw = {
        ...validProdEnv,
        DATABASE_URL: 'postgresql://sineva_user:sineva_secret_password@postgres:5432/sineva_platform',
      };
      expect(() => validateEnvConfig(devPw)).toThrow(/dev default/i);

      const devS3Key = {
        ...validProdEnv,
        S3_SECRET_ACCESS_KEY: 'sineva_s3_secret',
      };
      expect(() => validateEnvConfig(devS3Key)).toThrow(/dev default/i);

      const devAiKey = {
        ...validProdEnv,
        AI_ENGINE_INTERNAL_API_KEY: 'sineva_internal_service_token_dev',
      };
      expect(() => validateEnvConfig(devAiKey)).toThrow(/dev default/i);
    });

    it('throws on non-numeric or invalid AI_ENGINE_TIMEOUT_MS (INF-6)', () => {
      expect(() =>
        validateEnvConfig({ ...validProdEnv, AI_ENGINE_TIMEOUT_MS: 'not-a-number' }),
      ).toThrow(/timeout/i);

      expect(() =>
        validateEnvConfig({ ...validProdEnv, AI_ENGINE_TIMEOUT_MS: '-500' }),
      ).toThrow(/timeout/i);

      expect(() =>
        validateEnvConfig({ ...validProdEnv, AI_ENGINE_TIMEOUT_MS: '0' }),
      ).toThrow(/timeout/i);
    });

    it('throws in production when a required name is missing: S3_PUBLIC_ENDPOINT, INTERNAL_CONTEXT_KID, URLs', () => {
      for (const key of [
        'S3_PUBLIC_ENDPOINT',
        'INTERNAL_CONTEXT_KID',
        'REDIS_URL',
        'S3_ENDPOINT',
        'AI_ENGINE_INTERNAL_URL',
      ]) {
        const env: Record<string, string> = { ...validProdEnv };
        delete env[key];
        expect(() => validateEnvConfig(env), key).toThrow(new RegExp(key));
      }
    });

    it('throws in production when a required value is blank', () => {
      expect(() => validateEnvConfig({ ...validProdEnv, AUTH_SECRET: '   ' })).toThrow(/AUTH_SECRET/);
    });

    it('throws in development too when a secret is missing: the code holds no fallback', () => {
      const env = { NODE_ENV: 'development' };
      expect(() => validateEnvConfig(env)).toThrow(/required/i);
    });

    it('boots in development and test with the values shipped in .env.example', () => {
      const example = readEnvExample();
      for (const key of SECRET_KEYS) {
        expect(example[key], `${key} must exist in .env.example`).toBeTruthy();
      }
      for (const nodeEnv of ['development', 'test']) {
        const parsed = validateEnvConfig({ ...example, NODE_ENV: nodeEnv });
        expect(parsed.node_env).toBe(nodeEnv);
        expect(parsed.ai_engine_timeout_ms).toBe(15000);
      }
    });

    it('rejects in production every secret value that .env.example ships', () => {
      const example = readEnvExample();
      for (const key of SECRET_KEYS) {
        const env = { ...validProdEnv, [key]: example[key] };
        expect(() => validateEnvConfig(env), key).toThrow(/dev default/i);
      }
    });
  });

  describe('Static Secret Scan in Code and Compose (SEC-4)', () => {
    it('finds no hardcoded credential literals in env.ts', () => {
      const envTs = readFileSync(
        resolve(WEB_DIR, 'src/server/infrastructure/config/env.ts'),
        'utf8',
      );

      for (const devDefault of KNOWN_DEV_DEFAULTS) {
        expect(envTs).not.toContain(devDefault);
      }
    });

    it('docker-compose.yml has no default or literal for any secret-looking variable', () => {
      const composeYaml = readFileSync(resolve(ROOT_DIR, 'docker-compose.yml'), 'utf8');
      const secretish = /(PASSWORD|SECRET|API_KEY|ACCESS_KEY|SIGNING_KEY|TOKEN)/;
      for (const line of composeYaml.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+):\s*(.+)$/);
        if (!m || !secretish.test(m[1])) continue;
        const value = m[2].trim();
        expect(value, line).toMatch(/\$\{[A-Z0-9_]+:\?[^}]+\}/);
        expect(value, line).not.toMatch(/\$\{[A-Z0-9_]+:-/);
      }
    });

    it('docker-compose.yml uses ${VAR:?message} syntax for required secrets and has no literals', () => {
      const composeYaml = readFileSync(
        resolve(ROOT_DIR, 'docker-compose.yml'),
        'utf8',
      );

      // Verify that secrets are enforced via ${VAR:?...}
      expect(composeYaml).toMatch(/\$\{POSTGRES_PASSWORD:\?[^}]+\}/);
      expect(composeYaml).toMatch(/\$\{S3_SECRET_ACCESS_KEY:\?[^}]+\}/);
      expect(composeYaml).toMatch(/\$\{AI_ENGINE_INTERNAL_API_KEY:\?[^}]+\}/);

      // Verify no hardcoded default fallbacks for secrets
      expect(composeYaml).not.toMatch(/\$\{POSTGRES_PASSWORD:-/);
      expect(composeYaml).not.toMatch(/\$\{S3_SECRET_ACCESS_KEY:-/);
      expect(composeYaml).not.toMatch(/\$\{AI_ENGINE_INTERNAL_API_KEY:-/);
    });
  });

  describe('Baseline Security Headers in next.config.ts', () => {
    it('configures mandatory security headers (frame denial, nosniff, referrer, permissions)', async () => {
      expect(typeof nextConfig.headers).toBe('function');
      const headersConfig = await nextConfig.headers!();

      expect(headersConfig.length).toBeGreaterThan(0);
      const allHeaders = headersConfig.flatMap((entry) => entry.headers);

      const headerMap = new Map(
        allHeaders.map((h) => [h.key.toLowerCase(), h.value]),
      );

      expect(headerMap.get('x-frame-options')).toBe('DENY');
      expect(headerMap.get('x-content-type-options')).toBe('nosniff');
      expect(headerMap.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(headerMap.get('permissions-policy')).toBeDefined();
      // The CSP carries a per-request nonce, so it is set by the proxy. A static
      // copy here would be a second, nonce-less policy on every response.
      expect(headerMap.has('content-security-policy-report-only')).toBe(false);
      expect(headerMap.has('content-security-policy')).toBe(false);
    });
  });

  describe('Content Security Policy in report-only mode with a nonce hook (OQ-UX-11)', () => {
    it('builds a policy that allows scripts only by nonce and denies framing and plugins', () => {
      const policy = buildCspReportOnly('abc123nonce', { production: true });
      expect(policy).toContain("script-src 'self' 'nonce-abc123nonce' 'strict-dynamic'");
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("base-uri 'self'");
      expect(policy).not.toContain('localhost');
    });

    it('keeps eval and local websockets for development builds only', () => {
      const policy = buildCspReportOnly('n', { production: false });
      expect(policy).toContain("'unsafe-eval'");
      expect(policy).toContain('ws://localhost:*');
    });

    it('proxy sends the policy as report-only (never enforcing) with a fresh nonce per request', () => {
      const first = proxy(new NextRequest('http://localhost:3000/sign-in'));
      const second = proxy(new NextRequest('http://localhost:3000/sign-in'));

      const a = first.headers.get('content-security-policy-report-only') ?? '';
      const b = second.headers.get('content-security-policy-report-only') ?? '';
      expect(first.headers.get('content-security-policy')).toBeNull();
      const nonceA = a.match(/'nonce-([^']+)'/)?.[1];
      const nonceB = b.match(/'nonce-([^']+)'/)?.[1];
      expect(nonceA).toBeTruthy();
      expect(nonceB).toBeTruthy();
      expect(nonceA).not.toBe(nonceB);
      // The nonce reaches the root layout (and Next's own inline scripts) as a
      // forwarded request header.
      expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonceA);
    });

    it('also sets the policy on page redirects', () => {
      const res = proxy(new NextRequest('http://localhost:3000/w/acme'));
      expect(res.status).toBe(307);
      expect(res.headers.get('content-security-policy-report-only')).toContain("'nonce-");
    });
  });

  describe('CSRF Guard for Cookie-Authenticated Mutations', () => {
    it('allows GET, HEAD, OPTIONS requests without CSRF check', () => {
      const getReq = new Request('http://localhost:3000/api/v1/agents', {
        method: 'GET',
      });
      expect(() => verifyCsrf(getReq)).not.toThrow();
    });

    it('rejects mutating request with mismatched origin', () => {
      const req = new Request('http://localhost:3000/api/v1/agents', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-site.com',
          host: 'localhost:3000',
        },
      });

      expect(() => verifyCsrf(req)).toThrow(ForbiddenError);
    });

    it('rejects an origin on the same hostname but another port', () => {
      const req = new Request('http://localhost:3000/api/v1/agents', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:8080',
          host: 'localhost:3000',
        },
      });

      expect(() => verifyCsrf(req)).toThrow(ForbiddenError);
    });

    it('accepts mutating request with matching origin or custom header', () => {
      const reqWithOrigin = new Request('http://localhost:3000/api/v1/agents', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
      });
      expect(() => verifyCsrf(reqWithOrigin)).not.toThrow();

      const reqWithHeader = new Request('http://localhost:3000/api/v1/agents', {
        method: 'POST',
        headers: {
          'x-sineva-action': '1',
        },
      });
      expect(() => verifyCsrf(reqWithHeader)).not.toThrow();
    });
  });
});
