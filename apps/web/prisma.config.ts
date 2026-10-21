import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env files itself. `process.loadEnvFile` (Node 24)
// avoids adding dotenv, and never overrides a variable that is already set, so
// a real shell/CI env always wins. Missing files are expected (CI, containers).
for (const envFile of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // no such file: fall through to whatever is in process.env
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not `env('DATABASE_URL')`: that helper throws when the variable is unset,
    // and every Prisma CLI command loads this file. `prisma generate` needs no
    // database, and `build`/`typecheck` run it in CI and Docker builds where no
    // DATABASE_URL exists. Commands that do connect (migrate, db seed) fail on
    // the empty URL with their own error.
    url: process.env.DATABASE_URL ?? '',
  },
});
