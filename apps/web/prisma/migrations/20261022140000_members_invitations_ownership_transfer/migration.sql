-- AlterTable
ALTER TABLE "platform"."workspace_invitations" ADD COLUMN     "expired_logged_at" TIMESTAMPTZ(6),
ADD COLUMN     "last_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "revoked_at" TIMESTAMPTZ(6),
ADD COLUMN     "scope_agent_slugs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "platform"."ownership_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ownership_transfers_token_hash_key" ON "platform"."ownership_transfers"("token_hash");

-- CreateIndex
CREATE INDEX "ownership_transfers_workspace_id_idx" ON "platform"."ownership_transfers"("workspace_id");

-- AddForeignKey
ALTER TABLE "platform"."ownership_transfers" ADD CONSTRAINT "ownership_transfers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."ownership_transfers" ADD CONSTRAINT "ownership_transfers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."ownership_transfers" ADD CONSTRAINT "ownership_transfers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express partial unique indexes (same approach as
-- "workspace_members_one_owner_idx" in 20261021200500_identity_and_tenancy).

-- At most one pending invitation per workspace and address. Re-inviting
-- replaces that row in place, so the old link dies with the old token hash.
-- Rows that predate this index could hold duplicates; the older ones are
-- revoked first so the index can be built.
UPDATE "platform"."workspace_invitations" AS older
SET "revoked_at" = CURRENT_TIMESTAMP
WHERE older."accepted_at" IS NULL
  AND older."revoked_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "platform"."workspace_invitations" AS newer
    WHERE newer."workspace_id" = older."workspace_id"
      AND lower(newer."email") = lower(older."email")
      AND newer."accepted_at" IS NULL
      AND newer."revoked_at" IS NULL
      AND (newer."created_at", newer."id") > (older."created_at", older."id")
  );

CREATE UNIQUE INDEX "workspace_invitations_one_pending_idx"
  ON "platform"."workspace_invitations" ("workspace_id", lower("email"))
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

-- At most one open ownership transfer per workspace.
CREATE UNIQUE INDEX "ownership_transfers_one_open_idx"
  ON "platform"."ownership_transfers" ("workspace_id")
  WHERE "accepted_at" IS NULL AND "cancelled_at" IS NULL;
