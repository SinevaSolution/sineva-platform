-- CreateTable
CREATE TABLE "platform"."audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" VARCHAR(32) NOT NULL,
    "actor_id" TEXT NOT NULL,
    "on_behalf_of_user_id" TEXT,
    "action" VARCHAR(128) NOT NULL,
    "target_type" VARCHAR(64),
    "target_id" TEXT,
    "outcome" VARCHAR(16) NOT NULL DEFAULT 'allowed',
    "reason_code" VARCHAR(128),
    "request_id" TEXT,
    "run_id" TEXT,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "change" JSONB,
    "metadata" JSONB,
    "prev_hash" VARCHAR(64),
    "hash" VARCHAR(64),

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_occurred_at_idx" ON "platform"."audit_events"("workspace_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_action_occurred_at_idx" ON "platform"."audit_events"("workspace_id", "action", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_actor_id_occurred_at_idx" ON "platform"."audit_events"("actor_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_request_id_idx" ON "platform"."audit_events"("request_id");

-- CreateIndex
CREATE INDEX "audit_events_run_id_idx" ON "platform"."audit_events"("run_id");

-- The enum-like columns stay VARCHAR (platform convention), but the log is
-- evidence, so the database refuses values the writer never produces. This
-- also makes a malformed row fail the surrounding transaction.
ALTER TABLE "platform"."audit_events"
    ADD CONSTRAINT "audit_events_actor_type_check"
    CHECK ("actor_type" IN ('user', 'specialist', 'system', 'support', 'mcp_client'));

ALTER TABLE "platform"."audit_events"
    ADD CONSTRAINT "audit_events_outcome_check"
    CHECK ("outcome" IN ('allowed', 'denied', 'error'));
