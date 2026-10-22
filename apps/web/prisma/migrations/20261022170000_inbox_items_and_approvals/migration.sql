-- CreateTable
CREATE TABLE "platform"."inbox_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "recipient_user_id" UUID,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "agent_slug" TEXT,
    "title" TEXT NOT NULL,
    "summary_key" TEXT NOT NULL,
    "summary_params" JSONB NOT NULL DEFAULT '{}',
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "dedupe_key" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."inbox_item_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inbox_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_item_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "inbox_item_id" UUID NOT NULL,
    "agent_slug" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "run_id" TEXT,
    "upstream_approval_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "guardrail_reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "awaiting_revision" BOOLEAN NOT NULL DEFAULT false,
    "change_request" TEXT,
    "claimed_by" UUID,
    "claimed_decision" TEXT,
    "claimed_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "resume_delivered_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."approval_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."input_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "inbox_item_id" UUID NOT NULL,
    "agent_slug" TEXT NOT NULL,
    "source_id" TEXT,
    "run_id" TEXT,
    "upstream_request_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "form_schema" JSONB NOT NULL,
    "answer" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMPTZ(6),
    "answered_by" UUID,
    "answered_at" TIMESTAMPTZ(6),
    "resume_delivered_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_items_workspace_id_kind_state_created_at_idx" ON "platform"."inbox_items"("workspace_id", "kind", "state", "created_at");

-- CreateIndex
CREATE INDEX "inbox_items_workspace_id_recipient_user_id_state_idx" ON "platform"."inbox_items"("workspace_id", "recipient_user_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_items_workspace_id_dedupe_key_key" ON "platform"."inbox_items"("workspace_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "inbox_item_reads_user_id_idx" ON "platform"."inbox_item_reads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_item_reads_inbox_item_id_user_id_key" ON "platform"."inbox_item_reads"("inbox_item_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_inbox_item_id_key" ON "platform"."approvals"("inbox_item_id");

-- CreateIndex
CREATE INDEX "approvals_workspace_id_status_expires_at_idx" ON "platform"."approvals"("workspace_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "approvals_status_expires_at_idx" ON "platform"."approvals"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_workspace_id_upstream_approval_id_key" ON "platform"."approvals"("workspace_id", "upstream_approval_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_revisions_approval_id_revision_key" ON "platform"."approval_revisions"("approval_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "input_requests_inbox_item_id_key" ON "platform"."input_requests"("inbox_item_id");

-- CreateIndex
CREATE INDEX "input_requests_status_due_at_idx" ON "platform"."input_requests"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "input_requests_workspace_id_upstream_request_id_key" ON "platform"."input_requests"("workspace_id", "upstream_request_id");

-- AddForeignKey
ALTER TABLE "platform"."inbox_items" ADD CONSTRAINT "inbox_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."inbox_item_reads" ADD CONSTRAINT "inbox_item_reads_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "platform"."inbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."approvals" ADD CONSTRAINT "approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."approvals" ADD CONSTRAINT "approvals_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "platform"."inbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."approval_revisions" ADD CONSTRAINT "approval_revisions_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "platform"."approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."input_requests" ADD CONSTRAINT "input_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."input_requests" ADD CONSTRAINT "input_requests_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "platform"."inbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
