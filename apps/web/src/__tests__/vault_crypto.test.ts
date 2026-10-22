import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '@/server/domain/errors/domain_error';
import {
  VaultDecryptError,
  VaultUnavailableError,
  type KmsPort,
  type SecretRef,
} from '@/server/domain/vault/vault';
import { CloudKmsStub, LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';
import { InMemoryVaultRepository } from './fakes/in_memory_vault_repository';

const kekValue = (id: string) => `${id}:${randomBytes(32).toString('base64')}`;

const REF: SecretRef = {
  owner_type: 'connection',
  owner_id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  provider_id: 'google_calendar',
};
const PAYLOAD = { access_token: 'ya29.canary-access-token', refresh_token: '1//canary-refresh-token', expires_in: 3600 };

function makeVault() {
  const repo = new InMemoryVaultRepository();
  const kms = new LocalKms({ current: kekValue('local-test-1'), production: false });
  return { repo, kms, vault: new VaultService(repo, kms) };
}

describe('VaultService envelope encryption (WP-M2-05, FR-CONN-15, ADR-0036)', () => {
  let ctx: ReturnType<typeof makeVault>;
  beforeEach(() => {
    ctx = makeVault();
  });

  it('round-trips a payload and reports the row version', async () => {
    const written = await ctx.vault.put(REF, PAYLOAD);
    expect(written.version).toBe(1);
    const read = await ctx.vault.get(REF);
    expect(read).toEqual({ payload: PAYLOAD, version: 1 });
  });

  it('returns null for a secret that does not exist', async () => {
    expect(await ctx.vault.get(REF)).toBeNull();
  });

  it('never stores plaintext: the row holds no token text', async () => {
    await ctx.vault.put(REF, PAYLOAD);
    const row = (await ctx.repo.find('connection', REF.owner_id))!;
    const blob = Buffer.concat([row.ciphertext, row.nonce, row.dek_wrapped]).toString('latin1');
    expect(blob).not.toContain('canary-access-token');
    expect(blob).not.toContain('canary-refresh-token');
    expect(row.nonce).toHaveLength(12);
    expect(row.kek_id).toBe('local-test-1');
  });

  it.each([
    ['workspace swapped', { workspace_id: '33333333-3333-4333-8333-333333333333' }],
    ['owner id swapped', { owner_id: '44444444-4444-4444-8444-444444444444' }],
    ['provider swapped', { provider_id: 'notion' }],
  ])('fails to decrypt when the context differs: %s (wrong AAD)', async (_label, change) => {
    await ctx.vault.put(REF, PAYLOAD);
    // Simulates a row copied between tenants, owners or providers: the row
    // stays, the caller presents another context.
    const row = (await ctx.repo.find('connection', REF.owner_id))!;
    const moved = { ...REF, ...change };
    ctx.repo.rows.set(`connection:${moved.owner_id}`, { ...row, ...change });
    await expect(ctx.vault.get(moved)).rejects.toBeInstanceOf(VaultDecryptError);
  });

  it('refuses to read a row whose stored context differs from the caller context', async () => {
    await ctx.vault.put(REF, PAYLOAD);
    await expect(ctx.vault.get({ ...REF, workspace_id: '33333333-3333-4333-8333-333333333333' })).rejects.toBeInstanceOf(
      VaultDecryptError,
    );
  });

  it('fails when the ciphertext is tampered with', async () => {
    await ctx.vault.put(REF, PAYLOAD);
    const row = (await ctx.repo.find('connection', REF.owner_id))!;
    row.ciphertext[0] = row.ciphertext[0]! ^ 0x01;
    ctx.repo.rows.set(`connection:${REF.owner_id}`, row);
    await expect(ctx.vault.get(REF)).rejects.toBeInstanceOf(VaultDecryptError);
  });

  it('fails when the wrapped data key or the nonce is tampered with', async () => {
    await ctx.vault.put(REF, PAYLOAD);
    const base = (await ctx.repo.find('connection', REF.owner_id))!;

    const badKey = { ...base, dek_wrapped: Buffer.from(base.dek_wrapped) };
    badKey.dek_wrapped[badKey.dek_wrapped.length - 1] ^= 0x01;
    ctx.repo.rows.set(`connection:${REF.owner_id}`, badKey);
    await expect(ctx.vault.get(REF)).rejects.toBeInstanceOf(VaultDecryptError);

    const badNonce = { ...base, nonce: Buffer.from(base.nonce) };
    badNonce.nonce[0] ^= 0x01;
    ctx.repo.rows.set(`connection:${REF.owner_id}`, badNonce);
    await expect(ctx.vault.get(REF)).rejects.toBeInstanceOf(VaultDecryptError);
  });

  it('never reuses a nonce (or a data key) across 10,000 writes', async () => {
    const nonces = new Set<string>();
    const deks = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      await ctx.vault.put({ ...REF, owner_id: randomUUIDLike(i) }, { n: i });
      const row = (await ctx.repo.find('connection', randomUUIDLike(i)))!;
      nonces.add(row.nonce.toString('hex'));
      deks.add(row.dek_wrapped.toString('hex'));
    }
    expect(nonces.size).toBe(10_000);
    expect(deks.size).toBe(10_000);
  });

  it('a rewrite of the same secret draws a fresh nonce and bumps the version', async () => {
    await ctx.vault.put(REF, PAYLOAD);
    const first = (await ctx.repo.find('connection', REF.owner_id))!;
    const second = await ctx.vault.put(REF, { ...PAYLOAD, access_token: 'new' });
    const row = (await ctx.repo.find('connection', REF.owner_id))!;
    expect(second.version).toBe(2);
    expect(row.nonce.equals(first.nonce)).toBe(false);
  });

  it('expected_version is a compare-and-swap: a stale writer gets a conflict and changes nothing', async () => {
    await ctx.vault.put(REF, PAYLOAD);
    await ctx.vault.put(REF, { ...PAYLOAD, access_token: 'winner' }, { expected_version: 1 });
    await expect(
      ctx.vault.put(REF, { ...PAYLOAD, access_token: 'loser' }, { expected_version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await ctx.vault.get(REF))?.payload.access_token).toBe('winner');
  });

  it('erase removes the row and is idempotent', async () => {
    await ctx.vault.put(REF, PAYLOAD);
    await ctx.vault.erase(REF);
    expect(await ctx.repo.find('connection', REF.owner_id)).toBeNull();
    expect(await ctx.vault.get(REF)).toBeNull();
    await expect(ctx.vault.erase(REF)).resolves.toBeUndefined();
  });

  it('never leaks key material through an error message', async () => {
    await ctx.vault.put(REF, PAYLOAD);
    const row = (await ctx.repo.find('connection', REF.owner_id))!;
    row.ciphertext[1] = row.ciphertext[1]! ^ 0xff;
    ctx.repo.rows.set(`connection:${REF.owner_id}`, row);
    const error = await ctx.vault.get(REF).catch((e: Error) => e);
    expect(String((error as Error).message)).not.toMatch(/canary|token|key/i);
  });
});

function randomUUIDLike(i: number): string {
  return `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
}

describe('LocalKms (ADR-0036 decision 4)', () => {
  it('rejects a KEK that is not exactly 32 bytes', () => {
    expect(() => new LocalKms({ current: `k:${randomBytes(16).toString('base64')}`, production: false })).toThrow(
      VaultUnavailableError,
    );
    expect(() => new LocalKms({ current: 'no-colon-here', production: false })).toThrow(VaultUnavailableError);
  });

  it('refuses a development default KEK id in production, accepts it in development', () => {
    let thrown: unknown;
    try {
      new LocalKms({ current: kekValue('dev-local-1'), production: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(VaultUnavailableError);
    expect((thrown as VaultUnavailableError).details[0]?.detail).toMatch(/development default/);
    expect(() => new LocalKms({ current: kekValue('changeme'), production: true })).toThrow(VaultUnavailableError);
    expect(() => new LocalKms({ current: kekValue('dev-local-1'), production: false })).not.toThrow();
    expect(() => new LocalKms({ current: kekValue('prod-2026-10'), production: true })).not.toThrow();
  });

  it('refuses an all-zero or repeated-byte KEK in production', () => {
    expect(() => new LocalKms({ current: `prod-1:${Buffer.alloc(32, 7).toString('base64')}`, production: true })).toThrow(
      VaultUnavailableError,
    );
  });

  it('rotates: a row wrapped by the previous KEK is rewrapped under the current one and still opens', async () => {
    const oldKek = kekValue('prod-2025');
    const newKek = kekValue('prod-2026');
    const repo = new InMemoryVaultRepository();
    const before = new VaultService(repo, new LocalKms({ current: oldKek, production: true }));
    await before.put(REF, PAYLOAD);
    const row = (await repo.find('connection', REF.owner_id))!;
    expect(row.kek_id).toBe('prod-2025');

    const rotated = new LocalKms({ current: newKek, previous: oldKek, production: true });
    const { secretAad } = await import('@/server/infrastructure/vault/envelope_crypto');
    const rewrapped = await rotated.rotate(row.dek_wrapped, row.kek_id, secretAad(REF));
    expect(rewrapped.kek_id).toBe('prod-2026');
    expect(await repo.rewrap({ ...row, ...{ dek_wrapped: rewrapped.wrapped, kek_id: rewrapped.kek_id, key_version: rewrapped.key_version } }, row.version)).toBe(true);

    const after = new VaultService(repo, rotated);
    expect((await after.get(REF))?.payload).toEqual(PAYLOAD);
    // The old KEK alone can no longer read it.
    const stale = new VaultService(repo, new LocalKms({ current: oldKek, production: true }));
    await expect(stale.get(REF)).rejects.toBeDefined();
  });

  it('cannot unwrap with a KEK id it does not hold', async () => {
    const kms = new LocalKms({ current: kekValue('prod-a'), production: true });
    const { secretAad } = await import('@/server/infrastructure/vault/envelope_crypto');
    const wrapped = await kms.wrapDek(randomBytes(32), secretAad(REF));
    await expect(kms.unwrapDek(wrapped.wrapped, 'someone-else', secretAad(REF))).rejects.toBeInstanceOf(
      VaultUnavailableError,
    );
  });
});

describe('CloudKmsStub', () => {
  it('throws a typed unavailable error until the production KMS is decided', async () => {
    const stub: KmsPort = new CloudKmsStub();
    await expect(stub.wrapDek(randomBytes(32), Buffer.from('x'))).rejects.toBeInstanceOf(VaultUnavailableError);
    await expect(stub.unwrapDek(randomBytes(60), 'k', Buffer.from('x'))).rejects.toBeInstanceOf(VaultUnavailableError);
  });
});
