import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getInternalKeys } from '@/app/internal/v1/keys/route';
import { GET as getApiInternalKeys } from '@/app/api/internal/v1/keys/route';
import type { SigningKeyRepository } from '@/server/domain/repositories/signing_key_repository';
import type { SigningKeyEntity } from '@/server/domain/entities/signing_key';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';

class FakeSigningKeyRepository implements SigningKeyRepository {
  public keys: SigningKeyEntity[] = [];

  async findActiveKey(): Promise<SigningKeyEntity | null> {
    return this.keys.find((k) => k.status === 'active') ?? null;
  }

  async findByKid(kid: string): Promise<SigningKeyEntity | null> {
    return this.keys.find((k) => k.kid === kid) ?? null;
  }

  async listValidPublicKeys(): Promise<SigningKeyEntity[]> {
    return this.keys;
  }

  async save(key: SigningKeyEntity): Promise<void> {
    const idx = this.keys.findIndex((k) => k.kid === key.kid);
    if (idx >= 0) {
      this.keys[idx] = key;
    } else {
      this.keys.push(key);
    }
  }

  async rotate(newKey: SigningKeyEntity, retireKid?: string): Promise<void> {
    if (retireKid) {
      const old = this.keys.find((k) => k.kid === retireKid);
      if (old) old.status = 'retired';
    }
    this.keys.push(newKey);
  }
}

describe('Internal Signing Keys API (GET /internal/v1/keys, WP-M0-27 task 5)', () => {
  const fakeRepo = new FakeSigningKeyRepository();

  beforeEach(() => {
    fakeRepo.keys = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        kid: 'k1',
        alg: 'EdDSA',
        public_key: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA1111111111111111111111111111111111111111110=\n-----END PUBLIC KEY-----',
        status: 'active',
        purpose: 'context',
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        kid: 'k2',
        alg: 'EdDSA',
        public_key: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA2222222222222222222222222222222222222222220=\n-----END PUBLIC KEY-----',
        status: 'next',
        purpose: 'context',
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(container, 'getSigningKeyRepository').mockReturnValue(fakeRepo);
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({
      node_env: 'test',
      next_public_app_url: 'http://localhost:3000',
      next_public_api_base_url: 'http://localhost:3000/api/v1',
      database_url: 'postgresql://localhost:5432/sineva_platform',
      redis_url: 'redis://localhost:6379/0',
      redis_key_prefix: 'sineva:platform:',
      s3_endpoint: 'http://localhost:8333',
      s3_public_endpoint: 'http://localhost:8333',
      s3_region: 'us-east-1',
      s3_access_key_id: 'dev-s3-key',
      s3_secret_access_key: 'dev-s3-secret',
      s3_bucket_name: 'sineva-assets',
      s3_force_path_style: true,
      ai_engine_internal_url: 'http://sineva-ai:8000',
      ai_engine_internal_api_key: 'test-secret-key-primary',
      ai_engine_internal_api_key_next: 'test-secret-key-secondary',
      ai_engine_timeout_ms: 15000,
      auth_secret: 'test-auth-secret-placeholder-32-chars',
      internal_context_signing_key: 'dev-signing-key',
      internal_context_kid: 'k1',
    });
  });

  it('rejects unauthenticated request missing X-Internal-Api-Key with 401', async () => {
    const req = new NextRequest('http://localhost:3000/internal/v1/keys', {
      method: 'GET',
    });

    const res = await getInternalKeys(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('unauthorized');
  });

  it('rejects request with invalid X-Internal-Api-Key with 401', async () => {
    const req = new NextRequest('http://localhost:3000/internal/v1/keys', {
      method: 'GET',
      headers: {
        'x-internal-api-key': 'wrong-key-guess',
      },
    });

    const res = await getInternalKeys(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('unauthorized');
  });

  it('accepts request with valid primary X-Internal-Api-Key and returns public keys (200)', async () => {
    const req = new NextRequest('http://localhost:3000/internal/v1/keys', {
      method: 'GET',
      headers: {
        'x-internal-api-key': 'test-secret-key-primary',
      },
    });

    const res = await getInternalKeys(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.keys.length).toBe(2);
    expect(body.data.keys[0].kid).toBe('k1');
    expect(body.data.keys[0].alg).toBe('EdDSA');
    expect(body.data.keys[0].status).toBe('active');
    expect(body.data.keys[1].kid).toBe('k2');
    expect(body.data.keys[1].status).toBe('next');
  });

  it('accepts request with valid secondary (_NEXT) X-Internal-Api-Key during rotation', async () => {
    const req = new NextRequest('http://localhost:3000/internal/v1/keys', {
      method: 'GET',
      headers: {
        'x-internal-api-key': 'test-secret-key-secondary',
      },
    });

    const res = await getInternalKeys(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.keys.length).toBe(2);
  });

  it('works identically via /api/internal/v1/keys route alias', async () => {
    const req = new NextRequest('http://localhost:3000/api/internal/v1/keys', {
      method: 'GET',
      headers: {
        'x-internal-api-key': 'test-secret-key-primary',
      },
    });

    const res = await getApiInternalKeys(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.keys.length).toBe(2);
  });
});
