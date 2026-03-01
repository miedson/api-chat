ALTER TABLE "conversations"
ADD COLUMN "external_thread_id" TEXT;

CREATE INDEX "conversations_channel_connection_id_external_thread_id_idx"
ON "conversations"("channel_connection_id", "external_thread_id");
