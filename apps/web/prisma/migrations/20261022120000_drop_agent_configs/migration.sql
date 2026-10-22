-- Drops the platform's own specialist table (ADR-0024). sineva-ai owns the
-- catalog and the platform presents it through a static manifest in code, so
-- nothing reads or writes this table any more.
--
-- Data: the rows are seed-only. prisma/seed.ts upserted the six default
-- specialists, and the only other writer was POST /api/v1/agents, which is
-- removed in the same change and which no UI called. Seeded metrics
-- (avg_latency_ms, daily_tokens_used, active_sessions_count) were invented, and
-- stale sino-* rows from older seeds (DOM-6) disappear with the table.
--
-- Before deploying to a database where that route may have been used:
--   SELECT agent_slug FROM platform.agent_configs
--   WHERE agent_slug NOT IN ('sinopeople','sinofinance','sinosales','sinosocial','sinohelp','sinoinsights');
-- An empty result means nothing is lost. The drop is not reversible: restoring
-- means re-running the init migration's CREATE TABLE and the old seed.
--
-- Generated with `prisma migrate diff` (previous schema to current schema).

-- DropForeignKey
ALTER TABLE "platform"."agent_configs" DROP CONSTRAINT "agent_configs_workspace_id_fkey";

-- DropTable
DROP TABLE "platform"."agent_configs";
