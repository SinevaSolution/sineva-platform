import { beforeEach, describe, expect, it } from 'vitest';
import { UpdateProfileSchema } from '@/server/application/dtos/profile_dto';
import { GetProfileUseCase } from '@/server/application/use-cases/profile/get_profile_use_case';
import { UpdateProfileUseCase } from '@/server/application/use-cases/profile/update_profile_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { buildUserProfile, FakeUserProfileRepository } from './fakes/fake_user_profile_repository';

describe('GetProfileUseCase', () => {
  let repo: FakeUserProfileRepository;

  beforeEach(() => {
    repo = new FakeUserProfileRepository();
  });

  it('returns the profile of the given user', async () => {
    repo.seed(buildUserProfile({ id: 'usr-1', full_name: 'Amira Putri' }));
    repo.seed(buildUserProfile({ id: 'usr-2', full_name: 'Someone Else' }));

    const profile = await new GetProfileUseCase(repo).execute('usr-1');

    expect(profile.id).toBe('usr-1');
    expect(profile.full_name).toBe('Amira Putri');
  });

  it('throws NotFoundError when the user does not exist', async () => {
    await expect(new GetProfileUseCase(repo).execute('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('UpdateProfileUseCase', () => {
  let repo: FakeUserProfileRepository;

  beforeEach(() => {
    repo = new FakeUserProfileRepository();
    repo.seed(buildUserProfile({ id: 'usr-1' }));
    repo.seed(buildUserProfile({ id: 'usr-2', full_name: 'Someone Else' }));
  });

  it('applies only the fields that were provided', async () => {
    const updated = await new UpdateProfileUseCase(repo, new CountingAuditLogger()).execute({
      user_id: 'usr-1',
      full_name: 'Amira Lestari',
    });

    expect(updated.full_name).toBe('Amira Lestari');
    expect(updated.locale).toBe('id');
    expect(updated.timezone).toBe('Asia/Jakarta');
    expect(repo.updateCalls[0]?.input).toEqual({ full_name: 'Amira Lestari' });
  });

  it('updates locale and timezone together', async () => {
    const updated = await new UpdateProfileUseCase(repo, new CountingAuditLogger()).execute({
      user_id: 'usr-1',
      locale: 'en',
      timezone: 'Asia/Makassar',
    });

    expect(updated.locale).toBe('en');
    expect(updated.timezone).toBe('Asia/Makassar');
  });

  it('writes only to the user it was given', async () => {
    await new UpdateProfileUseCase(repo, new CountingAuditLogger()).execute({ user_id: 'usr-1', full_name: 'Changed' });

    expect(repo.profiles.get('usr-2')?.full_name).toBe('Someone Else');
    expect(repo.updateCalls.map((c) => c.user_id)).toEqual(['usr-1']);
  });

  it('throws NotFoundError when the user does not exist', async () => {
    await expect(
      new UpdateProfileUseCase(repo, new CountingAuditLogger()).execute({ user_id: 'missing', full_name: 'X' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('UpdateProfileSchema', () => {
  it('trims full_name', () => {
    expect(UpdateProfileSchema.parse({ full_name: '  Amira  ' })).toEqual({ full_name: 'Amira' });
  });

  it('rejects an empty or whitespace-only full_name', () => {
    expect(UpdateProfileSchema.safeParse({ full_name: '' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ full_name: '   ' }).success).toBe(false);
  });

  it('accepts 100 characters and rejects 101', () => {
    expect(UpdateProfileSchema.safeParse({ full_name: 'a'.repeat(100) }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ full_name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('accepts only en and id as locale', () => {
    expect(UpdateProfileSchema.safeParse({ locale: 'en' }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ locale: 'id' }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ locale: 'fr' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ locale: 'ID' }).success).toBe(false);
  });

  it('accepts a valid IANA timezone', () => {
    expect(UpdateProfileSchema.parse({ timezone: 'Asia/Jakarta' })).toEqual({
      timezone: 'Asia/Jakarta',
    });
  });

  it('canonicalises the casing of a valid timezone', () => {
    expect(UpdateProfileSchema.parse({ timezone: 'asia/jakarta' })).toEqual({
      timezone: 'Asia/Jakarta',
    });
  });

  it('rejects unknown timezones, empty strings and UTC offsets', () => {
    expect(UpdateProfileSchema.safeParse({ timezone: 'Mars/Phobos' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ timezone: '' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ timezone: '+07:00' }).success).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(UpdateProfileSchema.safeParse({}).success).toBe(false);
  });

  it('rejects keys it does not own, such as identity fields', () => {
    expect(UpdateProfileSchema.safeParse({ full_name: 'A', user_id: 'usr-2' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ full_name: 'A', email: 'x@y.id' }).success).toBe(false);
  });
});
