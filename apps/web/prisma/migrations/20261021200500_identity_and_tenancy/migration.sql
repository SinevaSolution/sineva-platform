-- AlterTable: update platform.users
ALTER TABLE "platform"."users" DROP CONSTRAINT IF EXISTS "users_workspace_id_fkey";
ALTER TABLE "platform"."users" DROP COLUMN IF EXISTS "workspace_id";
ALTER TABLE "platform"."users" DROP COLUMN IF EXISTS "role";
ALTER TABLE "platform"."users" DROP COLUMN IF EXISTS "is_active";
ALTER TABLE "platform"."users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform"."users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);
ALTER TABLE "platform"."users" ADD COLUMN "preferred_name" TEXT;
ALTER TABLE "platform"."users" ADD COLUMN "salutation" TEXT;
ALTER TABLE "platform"."users" ADD COLUMN "phone_number" TEXT;
ALTER TABLE "platform"."users" ADD COLUMN "phone_verified_at" TIMESTAMPTZ(6);
ALTER TABLE "platform"."users" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'id';
ALTER TABLE "platform"."users" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';
ALTER TABLE "platform"."users" ADD COLUMN "about_me" TEXT;
ALTER TABLE "platform"."users" ADD COLUMN "use_profile_in_context" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform"."users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "platform"."users" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: update platform.workspaces
ALTER TABLE "platform"."workspaces" ADD COLUMN "owner_user_id" UUID;
ALTER TABLE "platform"."workspaces" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "platform"."workspaces" ADD COLUMN "status_reason" TEXT;
ALTER TABLE "platform"."workspaces" ADD COLUMN "trial_ends_at" TIMESTAMPTZ(6);
ALTER TABLE "platform"."workspaces" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';
ALTER TABLE "platform"."workspaces" ADD COLUMN "default_locale" TEXT NOT NULL DEFAULT 'id';
ALTER TABLE "platform"."workspaces" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "platform"."workspaces" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- CreateTable: platform.workspace_members
CREATE TABLE "platform"."workspace_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "specialist_scope" TEXT NOT NULL DEFAULT 'all',
    "job_title" TEXT,
    "department" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform.workspace_member_specialists
CREATE TABLE "platform"."workspace_member_specialists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "workspace_member_id" UUID NOT NULL,
    "agent_slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_member_specialists_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform.workspace_invitations
CREATE TABLE "platform"."workspace_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "inviter_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "specialist_scope" TEXT NOT NULL DEFAULT 'all',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform.accounts
CREATE TABLE "platform"."accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "refresh_token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "id_token" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform.sessions
CREATE TABLE "platform"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "token_hash" TEXT,
    "active_workspace_id" UUID,
    "fresh_until" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform.verifications
CREATE TABLE "platform"."verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform.platform_staff
CREATE TABLE "platform"."platform_staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "staff_role" TEXT NOT NULL,
    "assigned_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform.auth_login_attempts
CREATE TABLE "platform"."auth_login_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_login_attempts_pkey" PRIMARY KEY ("id")
);

-- Indexes & Constraints
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "platform"."workspace_members"("workspace_id", "user_id");
CREATE INDEX "workspace_members_workspace_id_idx" ON "platform"."workspace_members"("workspace_id");
CREATE INDEX "workspace_members_user_id_idx" ON "platform"."workspace_members"("user_id");
CREATE UNIQUE INDEX "workspace_members_one_owner_idx" ON "platform"."workspace_members" ("workspace_id") WHERE role = 'owner';

CREATE UNIQUE INDEX "workspace_member_specialists_workspace_member_id_agent_slug_key" ON "platform"."workspace_member_specialists"("workspace_member_id", "agent_slug");
CREATE INDEX "workspace_member_specialists_workspace_id_idx" ON "platform"."workspace_member_specialists"("workspace_id");
CREATE INDEX "workspace_member_specialists_workspace_member_id_idx" ON "platform"."workspace_member_specialists"("workspace_member_id");

CREATE UNIQUE INDEX "workspace_invitations_token_hash_key" ON "platform"."workspace_invitations"("token_hash");
CREATE INDEX "workspace_invitations_workspace_id_idx" ON "platform"."workspace_invitations"("workspace_id");
CREATE INDEX "workspace_invitations_email_idx" ON "platform"."workspace_invitations"("email");

CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "platform"."accounts"("provider_id", "account_id");
CREATE INDEX "accounts_user_id_idx" ON "platform"."accounts"("user_id");

CREATE UNIQUE INDEX "sessions_token_key" ON "platform"."sessions"("token");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "platform"."sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "platform"."sessions"("user_id");
CREATE INDEX "sessions_active_workspace_id_idx" ON "platform"."sessions"("active_workspace_id");

CREATE INDEX "verifications_identifier_idx" ON "platform"."verifications"("identifier");

CREATE UNIQUE INDEX "platform_staff_user_id_key" ON "platform"."platform_staff"("user_id");

CREATE INDEX "auth_login_attempts_identifier_idx" ON "platform"."auth_login_attempts"("identifier");
CREATE INDEX "auth_login_attempts_ip_address_idx" ON "platform"."auth_login_attempts"("ip_address");
CREATE INDEX "auth_login_attempts_attempted_at_idx" ON "platform"."auth_login_attempts"("attempted_at");

-- Foreign Keys
ALTER TABLE "platform"."workspaces" ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "platform"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform"."workspace_member_specialists" ADD CONSTRAINT "workspace_member_specialists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform"."workspace_member_specialists" ADD CONSTRAINT "workspace_member_specialists_workspace_member_id_fkey" FOREIGN KEY ("workspace_member_id") REFERENCES "platform"."workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform"."platform_staff" ADD CONSTRAINT "platform_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
