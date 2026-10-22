import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SecretRef } from '@/server/domain/vault/vault';
import { LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';
import { InMemoryVaultRepository } from './fakes/in_memory_vault_repository';

// ADR-0036 decision 8: rotating the key-encryption key rewraps every data key
// and leaves the ciphertext alone. A runbook command, not a schedule.

const kek = (id: string) => `${id}:${randomBytes(32).toString('base64')}`;
const ref = (n: number): SecretRef => ({
  owner_type: 'connection',
  owner_id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`,
  workspace_id: '22222222-2222-4222-8222-222222222222',
  provider_id: 'google_calendar',
});

describe('VaultService.rotateKeys', () => {
  it('rewraps rows written under the previous key; ciphertext, nonce and version stay the same and every secret still reads', async () => {
    const repo = new InMemoryVaultRepository();
    const oldKek = kek('prod-2025');
    const newKek = kek('prod-2026');
    const before = new VaultService(repo, new LocalKms({ current: oldKek, production: true }));
    for (let i = 1; i <= 5; i += 1) await before.put(ref(i), { access_token: `tok-${i}` });
    const snapshot = await repo.find('connection', ref(1).owner_id);

    const after = new VaultService(repo, new LocalKms({ current: newKek, previous: oldKek, production: true }));
    const result = await after.rotateKeys(100);

    expect(result).toEqual({ rotated: 5, skipped: 0, failed: 0, more: false });
    const row = (await repo.find('connection', ref(1).owner_id))!;
    expect(row.kek_id).toBe('prod-2026');
    expect(row.ciphertext.equals(snapshot!.ciphertext)).toBe(true);
    expect(row.nonce.equals(snapshot!.nonce)).toBe(true);
    expect(row.version).toBe(snapshot!.version);
    expect(row.dek_wrapped.equals(snapshot!.dek_wrapped)).toBe(false);
    for (let i = 1; i <= 5; i += 1) expect((await after.get(ref(i)))?.payload.access_token).toBe(`tok-${i}`);
    // With only the new key, the data is still readable: the old key can be retired.
    const retired = new VaultService(repo, new LocalKms({ current: newKek, production: true }));
    expect((await retired.get(ref(3)))?.payload.access_token).toBe('tok-3');
  });

  it('works in batches and reports when more remain', async () => {
    const repo = new InMemoryVaultRepository();
    const oldKek = kek('prod-2025');
    const newKek = kek('prod-2026');
    const before = new VaultService(repo, new LocalKms({ current: oldKek, production: true }));
    for (let i = 1; i <= 5; i += 1) await before.put(ref(i), { v: i });
    const after = new VaultService(repo, new LocalKms({ current: newKek, previous: oldKek, production: true }));

    const first = await after.rotateKeys(2);
    expect(first).toMatchObject({ rotated: 2, more: true });
    const second = await after.rotateKeys(2);
    expect(second).toMatchObject({ rotated: 2, more: true });
    const third = await after.rotateKeys(2);
    expect(third).toMatchObject({ rotated: 1, more: false });
    expect(await after.rotateKeys(2)).toEqual({ rotated: 0, skipped: 0, failed: 0, more: false });
  });

  it('a row wrapped by a key this process no longer holds is counted as failed, not skipped or hidden, and the rest still rotate', async () => {
    const repo = new InMemoryVaultRepository();
    const oldKek = kek('prod-2025');
    const lostKek = kek('prod-2024');
    const newKek = kek('prod-2026');
    await new VaultService(repo, new LocalKms({ current: lostKek, production: true })).put(ref(1), { v: 1 });
    await new VaultService(repo, new LocalKms({ current: oldKek, production: true })).put(ref(2), { v: 2 });

    const after = new VaultService(repo, new LocalKms({ current: newKek, previous: oldKek, production: true }));
    const result = await after.rotateKeys(100);

    expect(result).toMatchObject({ rotated: 1, failed: 1 });
    expect(result.more).toBe(true);
    expect((await after.get(ref(2)))?.payload.v).toBe(2);
  });

  it('a row that changed while it was being rewrapped is skipped and picked up next time', async () => {
    const repo = new InMemoryVaultRepository();
    const oldKek = kek('prod-2025');
    const newKek = kek('prod-2026');
    await new VaultService(repo, new LocalKms({ current: oldKek, production: true })).put(ref(1), { v: 1 });
    const after = new VaultService(repo, new LocalKms({ current: newKek, previous: oldKek, production: true }));
    // A refresh writes the row between the read and the rewrap.
    const originalRewrap = repo.rewrap.bind(repo);
    repo.rewrap = async (row, version) => {
      await after.put(ref(1), { v: 'newer' });
      return originalRewrap(row, version);
    };

    const result = await after.rotateKeys(100);

    expect(result).toMatchObject({ rotated: 0, skipped: 1 });
    expect((await after.get(ref(1)))?.payload.v).toBe('newer');
  });
});
