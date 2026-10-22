import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_MARKER,
  checkProductionEnv,
  decideMigration,
  findDestructive,
  gatePendingMigrations,
  isPoolerUrl,
  parseMigrationStatus,
  redact,
  withPlatformSchema,
} from '../../scripts/vercel_build_lib.mjs';

const SCRIPT = resolve(import.meta.dirname, '../../scripts/vercel_build.mjs');

const DIRECT = 'postgresql://owner:Sup3rSecretPw@ep-cool-1.neon.tech/sineva?sslmode=require';
const POOLED = 'postgresql://owner:Sup3rSecretPw@ep-cool-1-pooler.neon.tech/sineva?sslmode=require';
const PREVIEW = 'postgresql://prev:PreviewPw99@ep-prev-1.neon.tech/sineva_preview?sslmode=require';

const prod = { VERCEL: '1', VERCEL_ENV: 'production' };
const preview = { VERCEL: '1', VERCEL_ENV: 'preview' };

describe('isPoolerUrl', () => {
  it('recognises Neon, Supabase and pgbouncer pooler URLs', () => {
    expect(isPoolerUrl(POOLED)).toBe(true);
    expect(isPoolerUrl('postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres')).toBe(true);
    expect(isPoolerUrl('postgresql://u:p@db.example-host.net:6543/postgres')).toBe(true);
    expect(isPoolerUrl('postgresql://u:p@db.host.net:5432/x?pgbouncer=true')).toBe(true);
  });
  it('does not flag a direct URL', () => {
    expect(isPoolerUrl(DIRECT)).toBe(false);
    expect(isPoolerUrl('postgresql://u:p@db.host.net:5432/x')).toBe(false);
  });
});

describe('withPlatformSchema', () => {
  it('adds schema=platform and keeps other parameters', () => {
    const url = new URL(withPlatformSchema(DIRECT));
    expect(url.searchParams.get('schema')).toBe('platform');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.password).toBe('Sup3rSecretPw');
  });
  it('keeps an existing schema=platform and refuses any other schema', () => {
    expect(new URL(withPlatformSchema(`${DIRECT}&schema=platform`)).searchParams.getAll('schema')).toEqual(['platform']);
    expect(() => withPlatformSchema(`${DIRECT}&schema=public`)).toThrow(/schema/i);
  });
  it('rejects a malformed URL without echoing it', () => {
    let message = '';
    try {
      withPlatformSchema('not a url with Sup3rSecretPw');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL|valid/i);
    expect(message).not.toContain('Sup3rSecretPw');
  });
});

describe('decideMigration', () => {
  it('does nothing outside Vercel (local, Docker, CI)', () => {
    expect(decideMigration({})).toMatchObject({ action: 'skip', reason: 'not_vercel' });
    expect(decideMigration({ DATABASE_URL: DIRECT, DIRECT_DATABASE_URL: DIRECT })).toMatchObject({ action: 'skip' });
  });

  it('migrates in production with DIRECT_DATABASE_URL', () => {
    const decision = decideMigration({ ...prod, DIRECT_DATABASE_URL: DIRECT, DATABASE_URL: POOLED });
    expect(decision).toMatchObject({ action: 'migrate', source: 'DIRECT_DATABASE_URL' });
    expect(new URL(decision.url).searchParams.get('schema')).toBe('platform');
  });

  it('falls back to DATABASE_URL in production only when it is not a pooler URL', () => {
    expect(decideMigration({ ...prod, DATABASE_URL: DIRECT })).toMatchObject({ action: 'migrate', source: 'DATABASE_URL' });
    const pooled = decideMigration({ ...prod, DATABASE_URL: POOLED });
    expect(pooled.action).toBe('fail');
    expect(pooled.message).toMatch(/DIRECT_DATABASE_URL/);
  });

  it('fails in production with no usable database URL or a pooled DIRECT_DATABASE_URL', () => {
    expect(decideMigration({ ...prod }).action).toBe('fail');
    expect(decideMigration({ ...prod, DIRECT_DATABASE_URL: POOLED }).action).toBe('fail');
  });

  it('skips preview builds without PREVIEW_DATABASE_URL, whatever production variables are visible', () => {
    expect(decideMigration({ ...preview, DIRECT_DATABASE_URL: DIRECT, DATABASE_URL: DIRECT })).toMatchObject({
      action: 'skip',
      reason: 'preview_without_database',
    });
  });

  it('migrates the preview database when PREVIEW_DATABASE_URL is a direct URL', () => {
    expect(decideMigration({ ...preview, PREVIEW_DATABASE_URL: PREVIEW })).toMatchObject({
      action: 'migrate',
      source: 'PREVIEW_DATABASE_URL',
    });
    expect(decideMigration({ ...preview, PREVIEW_DATABASE_URL: PREVIEW.replace('ep-prev-1', 'ep-prev-1-pooler') }).action).toBe('fail');
  });

  it('refuses a preview build whose PREVIEW_DATABASE_URL points at the production database', () => {
    const decision = decideMigration({
      ...preview,
      PREVIEW_DATABASE_URL: DIRECT,
      DIRECT_DATABASE_URL: DIRECT,
    });
    expect(decision.action).toBe('fail');
    expect(decision.message).not.toContain('Sup3rSecretPw');
  });

  it('skips every other Vercel environment', () => {
    expect(decideMigration({ VERCEL: '1', VERCEL_ENV: 'development', DIRECT_DATABASE_URL: DIRECT })).toMatchObject({ action: 'skip' });
    expect(decideMigration({ VERCEL: '1', DIRECT_DATABASE_URL: DIRECT })).toMatchObject({ action: 'skip' });
  });

  it('never puts a credential in a message', () => {
    const decisions = [
      decideMigration({ ...prod, DATABASE_URL: POOLED }),
      decideMigration({ ...prod, DIRECT_DATABASE_URL: POOLED }),
      decideMigration({ ...preview, PREVIEW_DATABASE_URL: DIRECT, DIRECT_DATABASE_URL: DIRECT }),
    ];
    for (const decision of decisions) expect(JSON.stringify({ ...decision, url: undefined })).not.toMatch(/Sup3rSecretPw|owner:/);
  });
});

describe('checkProductionEnv', () => {
  it('does nothing outside a Vercel production build', () => {
    expect(checkProductionEnv({})).toEqual({ errors: [], warnings: [] });
    expect(checkProductionEnv({ ...preview })).toEqual({ errors: [], warnings: [] });
  });

  it('fails a production build without an https NEXT_PUBLIC_APP_URL: the code would fall back to localhost', () => {
    expect(checkProductionEnv({ ...prod }).errors.join(' ')).toMatch(/NEXT_PUBLIC_APP_URL/);
    expect(checkProductionEnv({ ...prod, NEXT_PUBLIC_APP_URL: 'http://sineva.id' }).errors.join(' ')).toMatch(/https/);
    expect(checkProductionEnv({ ...prod, NEXT_PUBLIC_APP_URL: 'https://sineva.id' }).errors).toEqual([]);
  });

  it('warns about a missing CRON_SECRET (jobs would answer 401) and a missing SMTP host (no email is sent)', () => {
    const warnings = checkProductionEnv({ ...prod, NEXT_PUBLIC_APP_URL: 'https://sineva.id' }).warnings.join(' ');
    expect(warnings).toMatch(/CRON_SECRET/);
    expect(warnings).toMatch(/EMAIL_SERVER_HOST/);
    const quiet = checkProductionEnv({
      ...prod,
      NEXT_PUBLIC_APP_URL: 'https://sineva.id',
      CRON_SECRET: 'c'.repeat(24),
      EMAIL_SERVER_HOST: 'smtp.example-mail.net',
    });
    expect(quiet.warnings).toEqual([]);
  });
});

describe('parseMigrationStatus', () => {
  const header = 'Prisma schema loaded from prisma/schema.prisma\n\n3 migrations found in prisma/migrations\n\n';

  it('reads an up to date database', () => {
    expect(parseMigrationStatus(`${header}Database schema is up to date!\n`)).toEqual({ total: 3, pending: [] });
  });

  it('lists pending migrations, singular or plural wording', () => {
    const plural = `${header}Following migrations have not yet been applied:\n20261023100000_a\n20261023110000_b\n\nTo apply migrations in production run prisma migrate deploy.\n`;
    expect(parseMigrationStatus(plural)).toEqual({ total: 3, pending: ['20261023100000_a', '20261023110000_b'] });
    const singular = `${header}Following migration have not yet been applied:\n20261023100000_a\n\nTo apply migrations in production run prisma migrate deploy.\n`;
    expect(parseMigrationStatus(singular).pending).toEqual(['20261023100000_a']);
  });

  it('fails closed on failed migrations, diverged history or output it cannot read', () => {
    expect(() => parseMigrationStatus(`${header}Following migration have failed:\n20261023100000_a\n`)).toThrow(/failed/i);
    expect(() => parseMigrationStatus(`${header}Your local migration history and the migrations table from your database are different:\n`)).toThrow(/history/i);
    expect(() => parseMigrationStatus('something unexpected')).toThrow(/status/i);
  });
});

describe('findDestructive', () => {
  it.each([
    ['DROP TABLE "platform"."agent_configs";', 'DROP TABLE'],
    ['ALTER TABLE "platform"."t" DROP COLUMN "c";', 'DROP COLUMN'],
    ['truncate table platform.t;', 'TRUNCATE'],
    ['DELETE FROM "platform"."t";', 'DELETE FROM without WHERE'],
    ['DROP SCHEMA platform CASCADE;', 'DROP SCHEMA'],
  ])('flags %s', (sql, kind) => {
    expect(findDestructive(sql)).toContain(kind);
  });

  it('allows additive SQL, a scoped DELETE and a mention in a comment', () => {
    expect(findDestructive('CREATE TABLE "platform"."x" ("id" uuid);\nALTER TABLE "platform"."x" ADD COLUMN "c" text;')).toEqual([]);
    expect(findDestructive('DELETE FROM "platform"."t" WHERE "id" = $1;')).toEqual([]);
    expect(findDestructive('-- DROP TABLE x;\n/* TRUNCATE y; */\nSELECT 1;')).toEqual([]);
    expect(findDestructive('DROP INDEX "platform"."i";')).toEqual([]);
  });
});

describe('gatePendingMigrations', () => {
  function setup(files: Record<string, Record<string, string>>) {
    const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(dir, name));
      for (const [file, body] of Object.entries(content)) writeFileSync(join(dir, name, file), body);
    }
    return dir;
  }

  it('blocks a pending destructive migration without a marker', () => {
    const dir = setup({ '20261101000000_drop': { 'migration.sql': 'DROP TABLE "platform"."old";' } });
    const result = gatePendingMigrations(dir, ['20261101000000_drop']);
    expect(result.blocked).toEqual([{ name: '20261101000000_drop', kinds: ['DROP TABLE'] }]);
  });

  it('allows it once the folder holds an approval marker with a reason', () => {
    const dir = setup({
      '20261101000000_drop': {
        'migration.sql': 'DROP TABLE "platform"."old";',
        [APPROVAL_MARKER]: 'Table unused since release 12; data exported to cold storage on 2026-10-30.',
      },
    });
    expect(gatePendingMigrations(dir, ['20261101000000_drop']).blocked).toEqual([]);
  });

  it('does not accept an empty marker', () => {
    const dir = setup({ '20261101000000_drop': { 'migration.sql': 'TRUNCATE "platform"."t";', [APPROVAL_MARKER]: ' \n' } });
    expect(gatePendingMigrations(dir, ['20261101000000_drop']).blocked).toHaveLength(1);
  });

  it('ignores applied migrations, even destructive ones', () => {
    const dir = setup({
      '20261022120000_drop_agent_configs': { 'migration.sql': 'DROP TABLE "platform"."agent_configs";' },
      '20261101000000_add': { 'migration.sql': 'ALTER TABLE "platform"."t" ADD COLUMN "c" text;' },
    });
    expect(gatePendingMigrations(dir, ['20261101000000_add']).blocked).toEqual([]);
  });

  it('fails when a pending migration has no folder', () => {
    const dir = setup({});
    expect(() => gatePendingMigrations(dir, ['20261101000000_missing'])).toThrow(/20261101000000_missing/);
  });

  it('every real migration folder has a migration.sql the gate can read', () => {
    const real = resolve(import.meta.dirname, '../../prisma/migrations');
    const folders = readdirSync(real, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(folders.length).toBeGreaterThan(10);
    expect(() => gatePendingMigrations(real, folders)).not.toThrow();
  });
});

describe('redact', () => {
  it('removes the URL, the user and the password from any text', () => {
    const text = `failed to connect ${DIRECT} as owner with Sup3rSecretPw (user owner)`;
    const out = redact(text, [DIRECT]);
    expect(out).not.toContain('Sup3rSecretPw');
    expect(out).not.toContain(DIRECT);
    expect(out).not.toMatch(/\bowner\b/);
  });

  it('also covers the URL once the schema parameter was added', () => {
    const withSchema = withPlatformSchema(DIRECT);
    expect(redact(`x ${withSchema} y`, [DIRECT, withSchema])).not.toContain('Sup3rSecretPw');
  });
});

describe('scripts/vercel_build.mjs', () => {
  function run(env: Record<string, string>) {
    return spawnSync('node', [SCRIPT], {
      // A minimal environment: nothing from the developer's shell can leak in.
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', VERCEL_BUILD_DRY_RUN: '1', ...env } as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
  }

  it('is a dry run that migrates nothing and prints the plan for production', () => {
    const result = run({ ...prod, DIRECT_DATABASE_URL: DIRECT, NEXT_PUBLIC_APP_URL: 'https://sineva.id' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/migrate deploy/);
    expect(result.stdout).toMatch(/DIRECT_DATABASE_URL/);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/Sup3rSecretPw|owner/);
  });

  it('skips migrations for a preview build without a preview database', () => {
    const result = run({ ...preview, DIRECT_DATABASE_URL: DIRECT });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skipp/i);
    expect(result.stdout).not.toMatch(/migrate deploy/);
  });

  it('fails a production build without NEXT_PUBLIC_APP_URL before touching the database', () => {
    const result = run({ ...prod, DIRECT_DATABASE_URL: DIRECT });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/NEXT_PUBLIC_APP_URL/);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/migrate deploy/);
  });

  it('skips locally', () => {
    const result = run({});
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skipp/i);
  });

  it('fails the build for production without a direct database URL, without printing credentials', () => {
    const result = run({ ...prod, DATABASE_URL: POOLED, NEXT_PUBLIC_APP_URL: 'https://sineva.id' });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/DIRECT_DATABASE_URL/);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/Sup3rSecretPw|owner/);
  });

  it('never runs a command that can destroy data', () => {
    const source = readFileSync(SCRIPT, 'utf8') + readFileSync(resolve(SCRIPT, '../vercel_build_lib.mjs'), 'utf8');
    expect(source).not.toMatch(/migrate (reset|dev)|db push|db seed/);
  });
});
