-- CreateTable
CREATE TABLE "platform"."business_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "display_name" TEXT,
    "legal_name" TEXT,
    "industry" TEXT,
    "city" TEXT,
    "province" TEXT,
    "languages" JSONB,
    "website_url" TEXT,
    "social_handles" JSONB,
    "business_hours" JSONB,
    "brand_voice" JSONB,
    "audience" TEXT,
    "goals" JSONB,
    "field_meta" JSONB NOT NULL DEFAULT '{}',
    "confirmed_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."business_offerings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_amount" BIGINT,
    "price_currency" TEXT NOT NULL DEFAULT 'IDR',
    "url" TEXT,
    "position" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user',
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."business_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user',
    "confirmed_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."business_profile_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_paths" JSONB NOT NULL DEFAULT '[]',
    "change_kind" TEXT NOT NULL,
    "restored_from" INTEGER,
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."onboarding_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "flow" TEXT NOT NULL DEFAULT 'owner',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "skipped_steps" JSONB NOT NULL DEFAULT '[]',
    "dismissed_tasks" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."profile_scans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "result" JSONB,
    "error_code" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profile_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."workspace_checklist_state" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "source" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_checklist_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_workspace_id_key" ON "platform"."business_profiles"("workspace_id");

-- CreateIndex
CREATE INDEX "business_offerings_workspace_id_position_idx" ON "platform"."business_offerings"("workspace_id", "position");

-- CreateIndex
CREATE INDEX "business_policies_workspace_id_kind_idx" ON "platform"."business_policies"("workspace_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "business_profile_versions_workspace_id_version_key" ON "platform"."business_profile_versions"("workspace_id", "version");

-- CreateIndex
CREATE INDEX "onboarding_states_user_id_idx" ON "platform"."onboarding_states"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_states_workspace_id_user_id_key" ON "platform"."onboarding_states"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "profile_scans_workspace_id_created_at_idx" ON "platform"."profile_scans"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_checklist_state_workspace_id_item_key_key" ON "platform"."workspace_checklist_state"("workspace_id", "item_key");

-- AddForeignKey
ALTER TABLE "platform"."business_profiles" ADD CONSTRAINT "business_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."business_offerings" ADD CONSTRAINT "business_offerings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."business_policies" ADD CONSTRAINT "business_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."business_profile_versions" ADD CONSTRAINT "business_profile_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."onboarding_states" ADD CONSTRAINT "onboarding_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."onboarding_states" ADD CONSTRAINT "onboarding_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."profile_scans" ADD CONSTRAINT "profile_scans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."workspace_checklist_state" ADD CONSTRAINT "workspace_checklist_state_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
