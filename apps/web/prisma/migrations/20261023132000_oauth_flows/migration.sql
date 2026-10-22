-- CreateTable
CREATE TABLE "platform"."oauth_flows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_id" VARCHAR(64) NOT NULL,
    "connection_id" UUID,
    "owner_scope" VARCHAR(16) NOT NULL,
    "scope_bundle" VARCHAR(64) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state_hash" VARCHAR(64) NOT NULL,
    "nonce" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "session_hash" VARCHAR(64) NOT NULL,
    "return_to" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_flows_state_hash_key" ON "platform"."oauth_flows"("state_hash");

-- CreateIndex
CREATE INDEX "oauth_flows_workspace_id_user_id_idx" ON "platform"."oauth_flows"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "oauth_flows_expires_at_idx" ON "platform"."oauth_flows"("expires_at");

-- AddForeignKey
ALTER TABLE "platform"."oauth_flows" ADD CONSTRAINT "oauth_flows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."oauth_flows" ADD CONSTRAINT "oauth_flows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

