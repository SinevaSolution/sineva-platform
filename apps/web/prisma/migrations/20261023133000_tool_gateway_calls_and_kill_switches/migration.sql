-- CreateTable
CREATE TABLE "platform"."tool_gateway_calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "run_id" VARCHAR(64) NOT NULL,
    "call_id" VARCHAR(128) NOT NULL,
    "idempotency_hash" VARCHAR(71) NOT NULL,
    "payload_hash" VARCHAR(71) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'executing',
    "response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_gateway_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."kill_switches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" VARCHAR(32) NOT NULL,
    "target" VARCHAR(128) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled_by" VARCHAR(128) NOT NULL,
    "enabled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kill_switches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tool_gateway_calls_workspace_id_user_id_run_id_idempotency__key" ON "platform"."tool_gateway_calls"("workspace_id", "user_id", "run_id", "idempotency_hash");

-- CreateIndex
CREATE UNIQUE INDEX "tool_gateway_calls_workspace_id_user_id_run_id_call_id_key" ON "platform"."tool_gateway_calls"("workspace_id", "user_id", "run_id", "call_id");

-- CreateIndex
CREATE UNIQUE INDEX "kill_switches_scope_target_key" ON "platform"."kill_switches"("scope", "target");

-- AddForeignKey
ALTER TABLE "platform"."tool_gateway_calls" ADD CONSTRAINT "tool_gateway_calls_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."tool_gateway_calls" ADD CONSTRAINT "tool_gateway_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

