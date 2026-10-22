-- CreateTable
CREATE TABLE "platform"."squad_turns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "squad_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "run_handle" TEXT NOT NULL,
    "lead_slug" TEXT NOT NULL,
    "direct_slug" TEXT,
    "ceiling_points" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "termination_reason" TEXT,
    "delegation_count" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "squad_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."squad_handoffs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "turn_id" UUID NOT NULL,
    "delegation_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "from_slug" TEXT NOT NULL,
    "to_slug" TEXT NOT NULL,
    "task_summary" TEXT NOT NULL,
    "parallel_group" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'working',
    "summary" TEXT,
    "error_code" TEXT,
    "points" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "squad_turns_run_handle_key" ON "platform"."squad_turns"("run_handle");

-- CreateIndex
CREATE INDEX "squad_turns_squad_id_created_at_idx" ON "platform"."squad_turns"("squad_id", "created_at");

-- CreateIndex
CREATE INDEX "squad_turns_conversation_id_idx" ON "platform"."squad_turns"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "squad_handoffs_turn_id_delegation_id_key" ON "platform"."squad_handoffs"("turn_id", "delegation_id");

-- AddForeignKey
ALTER TABLE "platform"."squad_turns" ADD CONSTRAINT "squad_turns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."squad_turns" ADD CONSTRAINT "squad_turns_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "platform"."squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."squad_turns" ADD CONSTRAINT "squad_turns_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "platform"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."squad_handoffs" ADD CONSTRAINT "squad_handoffs_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "platform"."squad_turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
