-- AlterTable
ALTER TABLE "organizations"
  DROP COLUMN IF EXISTS "chatwoot_account_id";

-- AlterTable
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "chatwoot_user_id",
  DROP COLUMN IF EXISTS "password_hash";
