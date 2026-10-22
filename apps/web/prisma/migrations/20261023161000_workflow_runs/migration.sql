-- CreateTable
CREATE TABLE "platform"."workflow_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "version_id" UUID,
    "version_number" INTEGER,
    "draft_revision" INTEGER,
    "engine_run_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "started_by" UUID NOT NULL,
    "trigger_type" TEXT NOT NULL DEFAULT 'manual',
    "routine_id" UUID,
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "definition" JSONB NOT NULL,
    "credits_estimated" INTEGER,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "last_event_seq" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."workflow_run_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "step_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "step_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "progress_current" INTEGER,
    "progress_total" INTEGER,
    "output_preview" TEXT,
    "trace" JSONB,
    "error_code" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "approval_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_run_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."workflow_run_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "applied" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_run_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_runs_engine_run_id_key" ON "platform"."workflow_runs"("engine_run_id");

-- CreateIndex
CREATE INDEX "workflow_runs_workspace_id_created_at_idx" ON "platform"."workflow_runs"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_runs_workflow_id_created_at_idx" ON "platform"."workflow_runs"("workflow_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_runs_workspace_id_status_idx" ON "platform"."workflow_runs"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_run_steps_run_id_step_key_key" ON "platform"."workflow_run_steps"("run_id", "step_key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_run_events_run_id_event_id_key" ON "platform"."workflow_run_events"("run_id", "event_id");

-- AddForeignKey
ALTER TABLE "platform"."workflow_runs" ADD CONSTRAINT "workflow_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "platform"."workflows"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."workflow_runs" ADD CONSTRAINT "workflow_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "platform"."workflow_versions"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "platform"."workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."workflow_run_events" ADD CONSTRAINT "workflow_run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "platform"."workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."workflow_run_events" ADD CONSTRAINT "workflow_run_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
