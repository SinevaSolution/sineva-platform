// Vercel Build Command (ADR-0047): migrate the database, then build.
//
// Local and Docker builds keep using `npm run build`; this script changes
// nothing there because it only migrates when VERCEL=1. A failure of any step
// exits non-zero, so Vercel keeps serving the previous deployment.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  checkProductionEnv,
  decideMigration,
  gatePendingMigrations,
  parseMigrationStatus,
  redact,
} from './vercel_build_lib.mjs';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const migrationsDir = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const dryRun = process.env.VERCEL_BUILD_DRY_RUN === '1';
const log = (message) => console.log(`[vercel-build] ${message}`);

function fail(message) {
  console.error(`[vercel-build] ${message}`);
  process.exit(1);
}

// Runs the Prisma CLI against the migration URL only. Output is captured and
// redacted: Prisma can echo connection details in its errors.
function prisma(args, url) {
  const result = spawnSync('npx', ['prisma', ...args], {
    cwd: webDir,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  const output = redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`, [url]);
  return { status: result.status, output };
}

const envCheck = checkProductionEnv(process.env);
for (const warning of envCheck.warnings) console.warn(`[vercel-build] WARNING: ${warning}`);
if (envCheck.errors.length > 0) fail(envCheck.errors.join('\n'));

const decision = decideMigration(process.env);

if (decision.action === 'fail') fail(decision.message);

if (decision.action === 'skip') {
  const why = {
    not_vercel: 'not a Vercel build',
    preview_without_database: 'preview build without PREVIEW_DATABASE_URL',
    not_production_or_preview: `VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}`,
  }[decision.reason];
  log(`Skipping migrations (${why}).`);
} else if (dryRun) {
  log(`Dry run: would check status, gate destructive changes and run migrate deploy with ${decision.source} (schema=platform).`);
} else {
  log(`Migrating with ${decision.source} (schema=platform).`);

  const status = prisma(['migrate', 'status'], decision.url);
  let parsed;
  try {
    parsed = parseMigrationStatus(status.output);
  } catch (error) {
    fail(error.message);
  }

  if (parsed.pending.length === 0) {
    log('No pending migrations.');
  } else {
    log(`Pending migrations (${parsed.pending.length}):`);
    for (const name of parsed.pending) log(`  ${name}`);

    // A database with no history has every migration pending and nothing to
    // lose: the gate protects data that exists.
    const fresh = parsed.total !== null && parsed.total === parsed.pending.length;
    if (fresh) {
      log('Empty database (every migration pending): destructive-change gate not applied.');
    } else {
      const { blocked } = (() => {
        try {
          return gatePendingMigrations(migrationsDir, parsed.pending);
        } catch (error) {
          return fail(error.message);
        }
      })();
      if (blocked.length > 0) {
        for (const { name, kinds } of blocked) {
          console.error(`[vercel-build] BLOCKED ${name}: ${kinds.join(', ')}`);
        }
        fail('Destructive migration without approval. Add APPROVED_DESTRUCTIVE.md with the reason to that migration folder, or make the change backward compatible (expand, then contract).');
      }
    }

    const deploy = prisma(['migrate', 'deploy'], decision.url);
    if (deploy.status !== 0) {
      console.error(deploy.output);
      fail('prisma migrate deploy failed; the build is stopped and the previous deployment stays live.');
    }
    for (const line of deploy.output.split('\n')) {
      if (/^(Applying migration|The following migration|All migrations have been successfully applied)/.test(line.trim())) {
        log(line.trim());
      }
    }
  }
}

if (dryRun) {
  log('Dry run: next build not started.');
} else {
  const build = spawnSync('npm', ['run', 'build'], { cwd: webDir, stdio: 'inherit' });
  process.exit(build.status ?? 1);
}
