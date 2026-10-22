-- CreateTable
CREATE TABLE "platform"."message_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "run_id" TEXT,
    "call_id" TEXT,
    "position" INTEGER NOT NULL,
    "card_type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "provider_slug" TEXT,
    "connection_id" UUID,
    "approval_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "fallback_text" TEXT,
    "payload_hash" TEXT,
    "validation_status" TEXT NOT NULL,
    "rejected_code" TEXT,
    "search_text" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "data_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_cards_conversation_id_position_idx" ON "platform"."message_cards"("conversation_id", "position");

-- CreateIndex
CREATE INDEX "message_cards_approval_id_idx" ON "platform"."message_cards"("approval_id");

-- CreateIndex
CREATE INDEX "message_cards_workspace_id_conversation_id_idx" ON "platform"."message_cards"("workspace_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_cards_message_id_position_key" ON "platform"."message_cards"("message_id", "position");

-- AddForeignKey
ALTER TABLE "platform"."message_cards" ADD CONSTRAINT "message_cards_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "platform"."messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."message_cards" ADD CONSTRAINT "message_cards_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "platform"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."message_cards" ADD CONSTRAINT "message_cards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
