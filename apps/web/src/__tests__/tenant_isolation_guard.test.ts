import { describe, expect, it } from 'vitest';
import {
  buildStoragePrefix,
  buildStorageKey,
  buildTenantCacheKey,
  isReservedSlug,
  generateWorkspaceSlug,
} from '@/server/domain/tenancy/tenant_isolation';
import { ValidationError } from '@/server/domain/errors/domain_error';

describe('Tenant Isolation Guard & Key Builders (WP-M0-26, FR-AUTH-30, SEC-3, FR-SHELL-13)', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const invalidUuid = 'not-a-valid-uuid-123';

  describe('Storage Key Builder (SEC-3)', () => {
    it('constructs correct object storage prefix for valid workspace UUID', () => {
      const prefix = buildStoragePrefix(validUuid);
      expect(prefix).toBe(`t/${validUuid}/`);
    });

    it('constructs correct storage key with normalized path', () => {
      const key = buildStorageKey(validUuid, 'documents/report.pdf');
      expect(key).toBe(`t/${validUuid}/documents/report.pdf`);
    });

    it('strips leading slashes from file path', () => {
      const key = buildStorageKey(validUuid, '/documents/report.pdf');
      expect(key).toBe(`t/${validUuid}/documents/report.pdf`);
    });

    it('rejects non-UUID workspace_id with ValidationError (SEC-3)', () => {
      expect(() => buildStoragePrefix(invalidUuid)).toThrow(ValidationError);
      expect(() => buildStorageKey(invalidUuid, 'file.txt')).toThrow(ValidationError);
    });
  });

  describe('Cache Key Builder (SEC-3)', () => {
    it('constructs correct Redis key for valid workspace UUID', () => {
      const key = buildTenantCacheKey(validUuid, 'agents:active');
      expect(key).toBe(`t:${validUuid}:agents:active`);
    });

    it('rejects non-UUID workspace_id with ValidationError (SEC-3)', () => {
      expect(() => buildTenantCacheKey(invalidUuid, 'key')).toThrow(ValidationError);
    });
  });

  describe('Reserved Slugs (FR-SHELL-13)', () => {
    it('identifies reserved system paths as reserved slugs', () => {
      const reserved = ['api', 'admin', 'app', 'w', 'login', 'signup', 'settings', 'auth', 'account', 'billing'];
      for (const slug of reserved) {
        expect(isReservedSlug(slug)).toBe(true);
        expect(isReservedSlug(slug.toUpperCase())).toBe(true);
      }
    });

    it('allows non-reserved company names', () => {
      expect(isReservedSlug('acme-corp')).toBe(false);
      expect(isReservedSlug('sumber-rejeki')).toBe(false);
      expect(isReservedSlug('sineva-internal')).toBe(false);
    });
  });

  describe('Workspace Slug Generator', () => {
    it('generates clean kebab-case slug from company name', () => {
      expect(generateWorkspaceSlug('Acme Corporation')).toBe('acme-corporation');
      expect(generateWorkspaceSlug('PT. Sumber Makmur Sejahtera')).toBe('pt-sumber-makmur-sejahtera');
    });

    it('strips special symbols and consecutive hyphens', () => {
      expect(generateWorkspaceSlug('Finance & Ops (HQ) -- 2026!')).toBe('finance-ops-hq-2026');
    });

    it('appends fallback if name produces a reserved slug', () => {
      const slug = generateWorkspaceSlug('Settings');
      expect(isReservedSlug(slug)).toBe(false);
      expect(slug).toBe('settings-workspace');
    });
  });
});
