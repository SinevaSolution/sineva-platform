-- Durable jobs (ADR-0038).

-- CreateTable
CREATE TABLE "platform"."jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "run_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "idempotency_key" TEXT,
    "concurrency_key" TEXT,
    "workspace_id" UUID,
    "locked_by" TEXT,
    "lease_expires_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_status_run_at_idx" ON "platform"."jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "jobs_workspace_id_idx" ON "platform"."jobs"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_job_type_idempotency_key_key" ON "platform"."jobs"("job_type", "idempotency_key");


-- Single-flight: at most one running job per concurrency key. Prisma schema syntax
-- cannot express a partial unique index, so it is written here by hand (the same
-- way as workspace_members_one_owner_idx). A claim that loses the race gets a
-- unique violation and tries the next candidate.
CREATE UNIQUE INDEX "jobs_one_running_per_key_idx" ON "platform"."jobs" ("concurrency_key") WHERE "status" = 'running' AND "concurrency_key" IS NOT NULL;
