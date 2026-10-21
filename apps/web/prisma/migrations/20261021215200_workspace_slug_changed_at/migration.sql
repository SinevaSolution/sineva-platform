-- AlterTable: add slug_changed_at to platform.workspaces
ALTER TABLE "platform"."workspaces" ADD COLUMN IF NOT EXISTS "slug_changed_at" TIMESTAMPTZ(6);
