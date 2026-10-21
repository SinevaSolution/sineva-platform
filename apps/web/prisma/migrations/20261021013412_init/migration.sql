-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateTable
CREATE TABLE "platform"."workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_slug" TEXT NOT NULL,
    "workspace_name" TEXT NOT NULL,
    "subscription_tier" TEXT NOT NULL DEFAULT 'growth',
    "monthly_token_quota" INTEGER NOT NULL DEFAULT 1000000,
    "monthly_tokens_consumed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."agent_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "agent_slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role_title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "short_description" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "model_name" TEXT NOT NULL DEFAULT 'sineva-core-v2',
    "avg_latency_ms" INTEGER NOT NULL DEFAULT 420,
    "active_sessions_count" INTEGER NOT NULL DEFAULT 0,
    "daily_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "accent_token" TEXT NOT NULL DEFAULT '--teal-500',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agent_slug" TEXT NOT NULL,
    "session_title" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "agent_slug" TEXT NOT NULL,
    "sender_role" TEXT NOT NULL,
    "message_text" TEXT NOT NULL,
    "reasoning_summary" TEXT,
    "suggested_actions" JSONB NOT NULL DEFAULT '[]',
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."storage_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "bucket_name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_workspace_slug_key" ON "platform"."workspaces"("workspace_slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "platform"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_agent_slug_key" ON "platform"."agent_configs"("agent_slug");

-- CreateIndex
CREATE UNIQUE INDEX "storage_objects_object_key_key" ON "platform"."storage_objects"("object_key");

-- AddForeignKey
ALTER TABLE "platform"."users" ADD CONSTRAINT "users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."agent_configs" ADD CONSTRAINT "agent_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."chat_sessions" ADD CONSTRAINT "chat_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "platform"."chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."storage_objects" ADD CONSTRAINT "storage_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
