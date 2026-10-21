import { describe, expect, it } from 'vitest';
import { PasswordHasher } from '@/server/infrastructure/security/password_hasher';

describe('PasswordHasher (scrypt-based)', () => {
  it('hashes password and verifies successfully', () => {
    const password = 'mySecretPassword123';
    const hash = PasswordHasher.hash(password);

    expect(hash).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(PasswordHasher.verify(password, hash)).toBe(true);
  });

  it('rejects incorrect password', () => {
    const hash = PasswordHasher.hash('correctPassword123');
    expect(PasswordHasher.verify('wrongPassword123', hash)).toBe(false);
  });

  it('produces different hashes for the same password due to random salt', () => {
    const pass = 'identicalPassword123';
    const hash1 = PasswordHasher.hash(pass);
    const hash2 = PasswordHasher.hash(pass);

    expect(hash1).not.toBe(hash2);
    expect(PasswordHasher.verify(pass, hash1)).toBe(true);
    expect(PasswordHasher.verify(pass, hash2)).toBe(true);
  });

  it('returns false on malformed hash string', () => {
    expect(PasswordHasher.verify('pass', 'invalid-hash')).toBe(false);
    expect(PasswordHasher.verify('pass', '')).toBe(false);
  });
});
