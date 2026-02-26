-- AlterTable
ALTER TABLE "conversations"
ADD COLUMN "assigned_to_id" INTEGER;

-- CreateIndex
CREATE INDEX "conversations_organization_id_assigned_to_id_status_idx"
ON "conversations"("organization_id", "assigned_to_id", "status");

-- AddForeignKey
ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_assigned_to_id_fkey"
FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
