ALTER TABLE "messages"
ADD COLUMN "read_at" TIMESTAMP(3);

CREATE INDEX "messages_conversation_id_read_at_idx"
ON "messages"("conversation_id", "read_at");
