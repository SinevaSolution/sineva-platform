-- Library collections carry "Who can use this" (ADR-0033). The statements up to
-- the backfill come from `prisma migrate diff` (schema to schema).

-- AlterTable
ALTER TABLE "platform"."library_documents" ADD COLUMN     "access_inherited" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "platform"."library_folder_scopes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "folder_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_folder_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_folder_scopes_workspace_id_scope_type_scope_ref_idx" ON "platform"."library_folder_scopes"("workspace_id", "scope_type", "scope_ref");

-- CreateIndex
CREATE UNIQUE INDEX "library_folder_scopes_folder_id_scope_type_scope_ref_key" ON "platform"."library_folder_scopes"("folder_id", "scope_type", "scope_ref");

-- AddForeignKey
ALTER TABLE "platform"."library_folder_scopes" ADD CONSTRAINT "library_folder_scopes_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "platform"."library_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."library_folder_scopes" ADD CONSTRAINT "library_folder_scopes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing collection becomes Everyone, so nothing changes for current
-- data. Documents keep their own scopes (access_inherited defaults to false).
INSERT INTO "platform"."library_folder_scopes" ("folder_id", "workspace_id", "scope_type", "scope_ref")
SELECT "id", "workspace_id", 'workspace', "workspace_id"::text
FROM "platform"."library_folders";
