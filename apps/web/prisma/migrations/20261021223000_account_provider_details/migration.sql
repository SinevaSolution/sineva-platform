-- AlterTable
ALTER TABLE platform.accounts
  ADD COLUMN IF NOT EXISTS provider_email TEXT,
  ADD COLUMN IF NOT EXISTS provider_username TEXT;
