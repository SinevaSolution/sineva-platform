-- Vault database role separation (ADR-0036 decision 5, plan gate G4).
--
-- OPERATOR-RUN, NOT A PRISMA MIGRATION. Roles are cluster objects and
-- `prisma migrate deploy` also runs on developer databases, where this must not
-- happen. Never run it against the local development database.
--
-- Run once per environment after the migration `vault_and_connections` has been
-- deployed, and again after any later migration that touches `vault_secrets`.
-- Run as a superuser (or the owner of the table), with psql variables:
--
--   psql "$ADMIN_DATABASE_URL" \
--     -v app_role=sineva_app -v vault_role=sineva_vault -v owner_role=sineva_migrator \
--     -f apps/web/prisma/ops/vault_roles.sql
--
-- Roles the operator creates beforehand, with passwords from the secret store:
--   owner_role  runs `prisma migrate deploy` and owns the tables. Must differ from
--               app_role: a table owner always keeps its privileges.
--   app_role    the role in DATABASE_URL. Reads and writes every platform table
--               except vault_secrets.
--   vault_role  the role in VAULT_DATABASE_URL. Has privileges on vault_secrets only.
--
-- Result: a SQL injection or a leaked DATABASE_URL cannot read ciphertext or
-- wrapped keys, and without the KEK (held by the process, ADR-0036) the rows are
-- useless anyway. Verification: `vault_roles.int.test.ts` runs this file against a
-- throwaway cluster and asserts both directions.

ALTER TABLE platform.vault_secrets OWNER TO :"owner_role";

REVOKE ALL ON TABLE platform.vault_secrets FROM PUBLIC;
REVOKE ALL ON TABLE platform.vault_secrets FROM :"app_role";

GRANT USAGE ON SCHEMA platform TO :"vault_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform.vault_secrets TO :"vault_role";
