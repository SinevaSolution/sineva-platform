// Decision logic of the Vercel build (ADR-0047). Kept free of I/O side effects
// except `gatePendingMigrations`, which only reads migration folders, so the
// decisions can be unit tested without a database.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const APPROVAL_MARKER = 'APPROVED_DESTRUCTIVE.md';
const MIN_REASON_LENGTH = 20;

/**
 * True for a connection-pooler URL. Prisma's migration advisory lock does not
 * survive a transaction pooler, so migrations need the direct host.
 */
export function isPoolerUrl(rawUrl) {
  const url = new URL(rawUrl);
  return (
    /-pooler(\.|$)/i.test(url.hostname) ||
    /(^|\.)pooler\./i.test(url.hostname) ||
    url.port === '6543' ||
    url.searchParams.get('pgbouncer') === 'true'
  );
}

/**
 * `_prisma_migrations` lives in `platform`, so `migrate deploy` must run with
 * `?schema=platform`. Another schema is refused instead of silently rewritten.
 */
export function withPlatformSchema(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    // The message must not echo the value: it may hold a password.
    throw new Error('The migration database URL is not a valid PostgreSQL URL.');
  }
  const schemas = url.searchParams.getAll('schema');
  if (schemas.length > 0) {
    if (schemas.every((schema) => schema === 'platform')) return rawUrl;
    throw new Error('The migration database URL names a schema other than "platform"; remove it, the script sets schema=platform.');
  }
  url.searchParams.set('schema', 'platform');
  return url.toString();
}

function sameDatabase(a, b) {
  const one = new URL(a);
  const two = new URL(b);
  const host = (url) => url.hostname.replace(/-pooler(?=\.)/i, '').toLowerCase();
  return host(one) === host(two) && one.pathname === two.pathname;
}

function usable(env, name) {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Production migrates the production database, a preview build migrates only a
 * dedicated preview database, everything else (local, Docker, CI) does nothing.
 * Messages never contain a URL or a credential.
 */
export function decideMigration(env) {
  if (env.VERCEL !== '1') return { action: 'skip', reason: 'not_vercel' };

  if (env.VERCEL_ENV === 'production') {
    const direct = usable(env, 'DIRECT_DATABASE_URL');
    const runtime = usable(env, 'DATABASE_URL');
    let source;
    let candidate;
    if (direct) {
      source = 'DIRECT_DATABASE_URL';
      candidate = direct;
    } else if (runtime) {
      source = 'DATABASE_URL';
      candidate = runtime;
    } else {
      return { action: 'fail', message: 'Production build: set DIRECT_DATABASE_URL (a direct, non-pooled Postgres URL) so migrations can run.' };
    }
    try {
      if (isPoolerUrl(candidate)) {
        return {
          action: 'fail',
          message: `Production build: ${source} is a pooled connection. Set DIRECT_DATABASE_URL to the direct (non-pooled) URL; migrations cannot take Prisma's lock through a pooler.`,
        };
      }
      return { action: 'migrate', source, url: withPlatformSchema(candidate) };
    } catch (error) {
      return { action: 'fail', message: `Production build: ${source} is not usable. ${error.message}` };
    }
  }

  if (env.VERCEL_ENV === 'preview') {
    const preview = usable(env, 'PREVIEW_DATABASE_URL');
    if (!preview) return { action: 'skip', reason: 'preview_without_database' };
    try {
      if (isPoolerUrl(preview)) {
        return { action: 'fail', message: 'Preview build: PREVIEW_DATABASE_URL is a pooled connection; use the direct (non-pooled) URL.' };
      }
      for (const name of ['DIRECT_DATABASE_URL', 'DATABASE_URL']) {
        const other = usable(env, name);
        if (other && sameDatabase(preview, other)) {
          return { action: 'fail', message: `Preview build: PREVIEW_DATABASE_URL points at the same database as ${name}. A preview build must never migrate the production database.` };
        }
      }
      return { action: 'migrate', source: 'PREVIEW_DATABASE_URL', url: withPlatformSchema(preview) };
    } catch (error) {
      return { action: 'fail', message: `Preview build: PREVIEW_DATABASE_URL is not usable. ${error.message}` };
    }
  }

  return { action: 'skip', reason: 'not_production_or_preview' };
}

/**
 * Settings the app reads with a silent fallback. The code falls back to
 * http://localhost:3000 when NEXT_PUBLIC_APP_URL is missing, which would send
 * emails and OAuth redirects to localhost, so a production build refuses it.
 * The other two only degrade a feature and are reported as warnings.
 */
export function checkProductionEnv(env) {
  const errors = [];
  const warnings = [];
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') return { errors, warnings };

  const appUrl = usable(env, 'NEXT_PUBLIC_APP_URL');
  if (!appUrl) {
    errors.push('Production build: set NEXT_PUBLIC_APP_URL to the public https URL (for example https://sineva.id). Without it links in emails and OAuth redirects point at localhost.');
  } else if (!appUrl.startsWith('https://')) {
    errors.push('Production build: NEXT_PUBLIC_APP_URL must be an https URL.');
  }
  const cron = usable(env, 'CRON_SECRET');
  if (!cron || cron.length < 16) {
    warnings.push('CRON_SECRET is not set (or shorter than 16 characters): the scheduled jobs (Inbox expiry, job tick) will answer 401 and never run.');
  }
  if (!usable(env, 'EMAIL_SERVER_HOST')) {
    warnings.push('EMAIL_SERVER_HOST is not set: the app uses a sender that sends nothing, so verification and invitation emails are not delivered.');
  }
  return { errors, warnings };
}

/** Reads `prisma migrate status` output. Anything unexpected throws: the gate fails closed. */
export function parseMigrationStatus(output) {
  if (/(have|has) failed|failed to apply/i.test(output)) {
    throw new Error('A migration has failed in this database; resolve it by hand before deploying.');
  }
  if (/migration history .* different|history .* diverge/i.test(output)) {
    throw new Error('The migration history of the database differs from the repository; resolve it by hand before deploying.');
  }
  const found = /(\d+) migrations? found/i.exec(output);
  const total = found ? Number(found[1]) : null;

  if (/Database schema is up to date/i.test(output)) return { total, pending: [] };

  const lines = output.split('\n').map((line) => line.trim());
  const start = lines.findIndex((line) => /following migrations? (have|has) not yet been applied/i.test(line));
  if (start === -1) throw new Error('Could not read the migration status output; not migrating.');
  const pending = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\d{14}_[A-Za-z0-9_]+$/.test(line)) break;
    pending.push(line);
  }
  if (pending.length === 0) throw new Error('Could not read the pending migrations from the status output; not migrating.');
  return { total, pending };
}

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Kinds of data-destroying statements in a migration. */
export function findDestructive(sql) {
  const kinds = new Set();
  for (const statement of stripSqlComments(sql).split(';')) {
    if (/\bDROP\s+TABLE\b/i.test(statement)) kinds.add('DROP TABLE');
    if (/\bDROP\s+COLUMN\b/i.test(statement)) kinds.add('DROP COLUMN');
    if (/\bDROP\s+SCHEMA\b/i.test(statement)) kinds.add('DROP SCHEMA');
    if (/\bTRUNCATE\b/i.test(statement)) kinds.add('TRUNCATE');
    if (/\bDELETE\s+FROM\b/i.test(statement) && !/\bWHERE\b/i.test(statement)) {
      kinds.add('DELETE FROM without WHERE');
    }
  }
  return [...kinds];
}

/**
 * Scans only the pending migrations. Already-applied ones are history and are
 * never rescanned, so an old `DROP TABLE` does not block a later deploy.
 */
export function gatePendingMigrations(migrationsDir, pending) {
  const blocked = [];
  for (const name of pending) {
    const sqlPath = join(migrationsDir, name, 'migration.sql');
    if (!existsSync(sqlPath)) throw new Error(`Pending migration ${name} has no migration.sql in the repository.`);
    const kinds = findDestructive(readFileSync(sqlPath, 'utf8'));
    if (kinds.length === 0) continue;
    const markerPath = join(migrationsDir, name, APPROVAL_MARKER);
    const approved =
      existsSync(markerPath) && readFileSync(markerPath, 'utf8').trim().length >= MIN_REASON_LENGTH;
    if (!approved) blocked.push({ name, kinds });
  }
  return { blocked };
}

/** Removes each URL, its user and its password from text before it is printed. */
export function redact(text, urls) {
  const secrets = new Set();
  for (const raw of urls) {
    if (!raw) continue;
    secrets.add(raw);
    try {
      const url = new URL(raw);
      for (const part of [url.username, url.password]) {
        if (part.length >= 4) {
          secrets.add(part);
          secrets.add(decodeURIComponent(part));
        }
      }
    } catch {
      // Not a URL: the raw value is already covered above.
    }
  }
  let out = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    out = out.split(secret).join('[redacted]');
  }
  return out;
}
