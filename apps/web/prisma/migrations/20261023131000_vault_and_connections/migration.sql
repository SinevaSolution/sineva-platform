-- CreateTable
CREATE TABLE "platform"."connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "provider_id" VARCHAR(64) NOT NULL,
    "owner_scope" VARCHAR(16) NOT NULL DEFAULT 'workspace',
    "owner_user_id" UUID,
    "created_by_user_id" UUID,
    "auth_type" VARCHAR(32) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'connected',
    "scope_bundle" VARCHAR(64),
    "requested_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "granted_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "external_account_id" TEXT,
    "account_label" TEXT,
    "access_expires_at" TIMESTAMPTZ(6),
    "refresh_expires_at" TIMESTAMPTZ(6),
    "last_refreshed_at" TIMESTAMPTZ(6),
    "last_health_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(128),
    "secret_rotated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."connection_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "agent_slug" VARCHAR(64) NOT NULL,
    "access_level" VARCHAR(16) NOT NULL DEFAULT 'read',
    "approval_policy" VARCHAR(32) NOT NULL DEFAULT 'ask_every_time',
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."vault_secrets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_type" VARCHAR(32) NOT NULL,
    "owner_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider_id" VARCHAR(64) NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "dek_wrapped" BYTEA NOT NULL,
    "kek_id" VARCHAR(64) NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connections_workspace_id_provider_id_status_idx" ON "platform"."connections"("workspace_id", "provider_id", "status");

-- CreateIndex
CREATE INDEX "connections_status_access_expires_at_idx" ON "platform"."connections"("status", "access_expires_at");

-- CreateIndex
CREATE INDEX "connections_owner_user_id_idx" ON "platform"."connections"("owner_user_id");

-- CreateIndex
CREATE INDEX "connection_grants_workspace_id_idx" ON "platform"."connection_grants"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_grants_connection_id_agent_slug_key" ON "platform"."connection_grants"("connection_id", "agent_slug");

-- CreateIndex
CREATE INDEX "vault_secrets_workspace_id_idx" ON "platform"."vault_secrets"("workspace_id");

-- CreateIndex
CREATE INDEX "vault_secrets_kek_id_idx" ON "platform"."vault_secrets"("kek_id");

-- CreateIndex
CREATE UNIQUE INDEX "vault_secrets_owner_type_owner_id_key" ON "platform"."vault_secrets"("owner_type", "owner_id");

-- AddForeignKey
ALTER TABLE "platform"."connections" ADD CONSTRAINT "connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."connections" ADD CONSTRAINT "connections_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."connection_grants" ADD CONSTRAINT "connection_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."connection_grants" ADD CONSTRAINT "connection_grants_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "platform"."connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."vault_secrets" ADD CONSTRAINT "vault_secrets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active connection per provider account: a second connect of the same
-- external account by the same owner scope is a duplicate (the flow offers
-- reconnect instead). Revoked tombstones and connections with no external
-- account yet are exempt. Prisma schema syntax cannot express a partial
-- expression index, so it is written by hand, as workspace_members_one_owner_idx is.
CREATE UNIQUE INDEX "connections_active_account_idx" ON "platform"."connections" ("workspace_id", "provider_id", COALESCE("owner_user_id"::text, ''), "external_account_id") WHERE "status" <> 'revoked' AND "external_account_id" IS NOT NULL;

