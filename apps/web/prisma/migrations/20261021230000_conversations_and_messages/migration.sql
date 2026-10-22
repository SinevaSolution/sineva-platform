-- DropTable: drop empty legacy chat_messages and chat_sessions (DOM-5)
DROP TABLE IF EXISTS "platform"."chat_messages" CASCADE;
DROP TABLE IF EXISTS "platform"."chat_sessions" CASCADE;

-- CreateTable: platform.conversations
CREATE TABLE "platform"."conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'hub',
    "agent_slug" TEXT,
    "title" TEXT,
    "title_source" TEXT,
    "pinned_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "origin_message_id" UUID,
    "origin_channel" TEXT DEFAULT 'web',
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform.messages
CREATE TABLE "platform"."messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "agent_slug" TEXT,
    "content" TEXT NOT NULL,
    "mentions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "finish_reason" TEXT,
    "run_id" TEXT,
    "channel" TEXT DEFAULT 'web',
    "client_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "platform"."conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "platform"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "conversations_workspace_id_user_id_last_message_at_idx" ON "platform"."conversations"("workspace_id", "user_id", "last_message_at");
CREATE INDEX "conversations_workspace_id_kind_idx" ON "platform"."conversations"("workspace_id", "kind");
CREATE INDEX "conversations_workspace_id_agent_slug_idx" ON "platform"."conversations"("workspace_id", "agent_slug");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "platform"."messages"("conversation_id", "created_at");
CREATE INDEX "messages_conversation_id_client_message_id_idx" ON "platform"."messages"("conversation_id", "client_message_id");
