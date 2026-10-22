-- CreateTable
CREATE TABLE "platform"."squads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "lead_type" TEXT NOT NULL DEFAULT 'sino',
    "lead_agent_slug" TEXT,
    "template_slug" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "limits" JSONB,
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."squad_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "squad_id" UUID NOT NULL,
    "agent_slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "added_by" UUID,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."squad_access_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "squad_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_access_overrides_pkey" PRIMARY KEY ("id")
);

-- AlterTable: kind is already free text (hub | room); `squad` needs no backfill.
ALTER TABLE "platform"."conversations" ADD COLUMN     "squad_id" UUID;

-- CreateIndex
CREATE INDEX "squads_workspace_id_status_idx" ON "platform"."squads"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "squad_members_squad_id_agent_slug_key" ON "platform"."squad_members"("squad_id", "agent_slug");

-- CreateIndex
CREATE UNIQUE INDEX "squad_access_overrides_squad_id_user_id_key" ON "platform"."squad_access_overrides"("squad_id", "user_id");

-- CreateIndex
CREATE INDEX "conversations_squad_id_idx" ON "platform"."conversations"("squad_id");

-- AddForeignKey
ALTER TABLE "platform"."conversations" ADD CONSTRAINT "conversations_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "platform"."squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."squads" ADD CONSTRAINT "squads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."squad_members" ADD CONSTRAINT "squad_members_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "platform"."squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."squad_access_overrides" ADD CONSTRAINT "squad_access_overrides_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "platform"."squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
