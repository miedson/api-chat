-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'pending', 'resolved');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('incoming', 'outgoing', 'internal');

-- CreateTable
CREATE TABLE "conversations" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "subject" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "channel" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "sender_id" INTEGER,
    "content" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_public_id_key" ON "conversations"("public_id");

-- CreateIndex
CREATE INDEX "conversations_organization_id_status_idx" ON "conversations"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key" ON "conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_public_id_key" ON "messages"("public_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
