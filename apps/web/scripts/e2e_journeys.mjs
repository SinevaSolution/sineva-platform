#!/usr/bin/env node
// Runs the browser journeys (e2e/journeys) against a TEMPORARY production build.
//
// What it starts, all on free ports and all removed afterwards:
//   - a throwaway Postgres and Redis container (never the shared `sineva_platform`)
//   - the fake Google/GitHub identity provider (e2e/support/fake_idp.mjs)
//   - `next start` of the production build in apps/web/.next (never `next dev`,
//     never port 3001)
// It reuses the local Mailpit (SMTP 1025, HTTP 8025) for invitation and
// verification emails; every test uses addresses unique to the run.
//
// Usage (from apps/web, after `npx next build --webpack`):
//   node scripts/e2e_journeys.mjs [--build] [playwright args...]
//
// Gotcha: the app reads its configuration from the environment only in
// production, so this script passes every value explicitly. The secrets are
// random per run and match no dev default (the app refuses dev defaults in
// production).
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeIdp } from '../e2e/support/fake_idp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Run Next through node directly: signalling an `npx` wrapper would leave the
// real server process running after the script exits.
const nextBin = path.resolve(webDir, '../../node_modules/next/dist/bin/next');
const args = process.argv.slice(2);
const shouldBuild = args.includes('--build');
const playwrightArgs = args.filter((a) => a !== '--build');
const runId = crypto.randomBytes(3).toString('hex');
const cleanups = [];

function log(message) {
  process.stdout.write(`[journeys] ${message}\n`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function sh(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(' ')} failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return (result.stdout ?? '').trim();
}

async function waitFor(label, probe, timeoutMs = 60_000) {
  const started = Date.now();
  for (;;) {
    try {
      if (await probe()) return;
    } catch {
      // not ready yet
    }
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function teardown() {
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch (error) {
      log(`cleanup problem: ${error instanceof Error ? error.message : error}`);
    }
  }
  cleanups.length = 0;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    teardown().finally(() => process.exit(130));
  });
}

async function main() {
  // Mailpit is the one shared piece: fail early with a clear message.
  try {
    const info = await fetch('http://127.0.0.1:8025/api/v1/info');
    if (!info.ok) throw new Error(String(info.status));
  } catch {
    throw new Error(
      'Mailpit is not reachable on http://127.0.0.1:8025 (SMTP 1025). Start it first.',
    );
  }

  if (shouldBuild || !fs.existsSync(path.join(webDir, '.next', 'BUILD_ID'))) {
    // `--experimental-build-mode compile` skips the route-type validation that a
    // webpack build adds (the app's route wrappers take an optional request, which
    // that validator rejects; Turbopack, the real build, does not generate it).
    // Types are checked by `npm run typecheck`, not here. Webpack, not Turbopack,
    // because a worktree's symlinked node_modules breaks Turbopack.
    log('building the production bundle (next build --webpack, compile mode)');
    sh(process.execPath, [nextBin, 'build', '--webpack', '--experimental-build-mode', 'compile'], {
      cwd: webDir,
      stdio: 'inherit',
    });
  }

  const [pgPort, redisPort, appPort, idpPort] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
    freePort(),
  ]);
  if (appPort === 3001) throw new Error('refusing to use port 3001');

  const pgPassword = crypto.randomBytes(18).toString('hex');
  const pgName = `sineva-journeys-pg-${runId}`;
  const redisName = `sineva-journeys-redis-${runId}`;
  const database = 'sineva_journeys_test';

  log(`starting throwaway Postgres on ${pgPort} and Redis on ${redisPort}`);
  sh('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    pgName,
    '-e',
    `POSTGRES_PASSWORD=${pgPassword}`,
    '-e',
    `POSTGRES_DB=${database}`,
    '-p',
    `127.0.0.1:${pgPort}:5432`,
    'postgres:17-alpine',
  ]);
  cleanups.push(() => sh('docker', ['rm', '-f', pgName]));
  sh('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    redisName,
    '-p',
    `127.0.0.1:${redisPort}:6379`,
    'redis:7.4-alpine',
  ]);
  cleanups.push(() => sh('docker', ['rm', '-f', redisName]));

  await waitFor('postgres', () => {
    const r = spawnSync('docker', ['exec', pgName, 'pg_isready', '-U', 'postgres', '-d', database]);
    return r.status === 0;
  });
  // pg_isready answers during the image's init restart; confirm with a real query.
  await waitFor('postgres query', () => {
    const r = spawnSync('docker', [
      'exec',
      pgName,
      'psql',
      '-U',
      'postgres',
      '-d',
      database,
      '-c',
      'select 1',
    ]);
    return r.status === 0;
  });

  const databaseUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/${database}?schema=platform`;
  const dbEnv = { ...process.env, DATABASE_URL: databaseUrl };
  // The seed accounts share one password, written in the seed script itself.
  const seedSource = fs.readFileSync(path.join(webDir, 'prisma', 'seed.ts'), 'utf8');
  const seedPassword = /scryptSync\('([^']+)'/.exec(seedSource)?.[1];
  if (!seedPassword) throw new Error('Could not read the seed password from prisma/seed.ts');

  log('applying migrations and seeding the throwaway database');
  sh('npx', ['prisma', 'migrate', 'deploy'], { cwd: webDir, env: dbEnv });
  sh('npx', ['prisma', 'db', 'seed'], { cwd: webDir, env: dbEnv });
  // The seed accounts use Indonesian; the journeys read English copy.
  sh('docker', [
    'exec',
    pgName,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-c',
    "update platform.users set locale = 'en'",
  ]);

  log(`starting the fake identity provider on ${idpPort}`);
  const idp = await startFakeIdp(idpPort);
  cleanups.push(() => idp.close());

  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const appUrl = `http://127.0.0.1:${appPort}`;
  const appEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_APP_URL: appUrl,
    NEXT_PUBLIC_API_BASE_URL: `${appUrl}/api/v1`,
    DATABASE_URL: databaseUrl,
    REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
    S3_ENDPOINT: 'http://127.0.0.1:8333',
    S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:8333',
    S3_ACCESS_KEY_ID: crypto.randomBytes(10).toString('hex'),
    S3_SECRET_ACCESS_KEY: crypto.randomBytes(20).toString('hex'),
    AI_ENGINE_INTERNAL_URL: 'http://127.0.0.1:9',
    AI_ENGINE_INTERNAL_API_KEY: crypto.randomBytes(16).toString('hex'),
    AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
    INTERNAL_CONTEXT_SIGNING_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    INTERNAL_CONTEXT_KID: 'k1',
    EMAIL_SERVER_HOST: '127.0.0.1',
    EMAIL_SERVER_PORT: '1025',
    EMAIL_FROM: 'Sineva <noreply@sineva.id>',
    GOOGLE_CLIENT_ID: `journeys-google-${runId}`,
    GOOGLE_CLIENT_SECRET: crypto.randomBytes(12).toString('hex'),
    GITHUB_CLIENT_ID: `journeys-github-${runId}`,
    GITHUB_CLIENT_SECRET: crypto.randomBytes(12).toString('hex'),
    OAUTH_TEST_IDP_URL: `http://127.0.0.1:${idpPort}`,
    OAUTH_TEST_IDP_ALLOW: 'true',
    ENTITLEMENTS_MODE: 'open',
  };

  log(`starting next start on ${appPort}`);
  const logFile = fs.openSync(path.join(webDir, 'test-results-journeys-server.log'), 'w');
  const server = spawn(
    process.execPath,
    [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(appPort)],
    {
      cwd: webDir,
      env: appEnv,
      stdio: ['ignore', logFile, logFile],
    },
  );
  cleanups.push(
    () =>
      new Promise((resolve) => {
        server.once('exit', resolve);
        server.kill('SIGTERM');
        setTimeout(() => server.kill('SIGKILL'), 5000);
      }),
  );
  await waitFor('the app', async () => (await fetch(`${appUrl}/sign-in`)).ok, 90_000);

  log('running the journeys');
  // Asynchronous on purpose: the fake identity provider lives in this process
  // and must keep answering while the browser tests run.
  const child = spawn(
    'npx',
    ['playwright', 'test', '-c', 'playwright.journeys.config.ts', ...playwrightArgs],
    {
      cwd: webDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: appUrl,
        JOURNEYS_DATABASE_URL: databaseUrl.replace('?schema=platform', ''),
        JOURNEYS_IDP_URL: `http://127.0.0.1:${idpPort}`,
        JOURNEYS_RUN_ID: runId,
        JOURNEYS_PG_CONTAINER: pgName,
        JOURNEYS_PG_DATABASE: database,
        JOURNEYS_SEED_PASSWORD: seedPassword,
      },
    },
  );
  return await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
}

let code = 1;
try {
  code = await main();
} catch (error) {
  log(`failed: ${error instanceof Error ? error.message : error}`);
} finally {
  await teardown();
  log('temporary containers and server stopped');
}
process.exit(code);
