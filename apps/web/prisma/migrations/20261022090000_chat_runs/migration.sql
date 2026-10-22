-- CreateTable
CREATE TABLE "platform"."chat_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_message_id" UUID NOT NULL,
    "run_handle" TEXT NOT NULL,
    "agent_slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "upstream_run_id" TEXT,
    "upstream_session_id" TEXT,
    "assistant_message_id" UUID,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_runs_run_handle_key" ON "platform"."chat_runs"("run_handle");

-- CreateIndex
CREATE INDEX "chat_runs_workspace_id_conversation_id_created_at_idx" ON "platform"."chat_runs"("workspace_id", "conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_run_id_idx" ON "platform"."messages"("run_id");

-- AddForeignKey
ALTER TABLE "platform"."chat_runs" ADD CONSTRAINT "chat_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."chat_runs" ADD CONSTRAINT "chat_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "platform"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."chat_runs" ADD CONSTRAINT "chat_runs_user_message_id_fkey" FOREIGN KEY ("user_message_id") REFERENCES "platform"."messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

