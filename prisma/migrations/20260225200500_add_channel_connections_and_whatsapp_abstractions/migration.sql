-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('whatsapp');

-- CreateEnum
CREATE TYPE "ChannelProviderType" AS ENUM ('evolution', 'whatsapp_cloud');

-- CreateEnum
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('pending_qr', 'connected', 'disconnected', 'failed');

-- CreateTable
CREATE TABLE "channel_connections" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "kind" "ChannelKind" NOT NULL DEFAULT 'whatsapp',
    "provider" "ChannelProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "provider_external_id" TEXT,
    "provider_instance_key" TEXT,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'pending_qr',
    "qr_code_base64" TEXT,
    "qr_code_expires_at" TIMESTAMP(3),
    "webhook_secret" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "conversations"
ADD COLUMN "channel_connection_id" INTEGER,
ADD COLUMN "external_contact_id" TEXT,
ADD COLUMN "external_contact_name" TEXT;

-- AlterTable
ALTER TABLE "messages"
ADD COLUMN "external_author" TEXT,
ADD COLUMN "external_message_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "channel_connections_public_id_key" ON "channel_connections"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_connections_provider_provider_instance_key_key" ON "channel_connections"("provider", "provider_instance_key");

-- CreateIndex
CREATE INDEX "channel_connections_organization_id_kind_status_idx" ON "channel_connections"("organization_id", "kind", "status");

-- CreateIndex
CREATE INDEX "conversations_channel_connection_id_external_contact_id_idx" ON "conversations"("channel_connection_id", "external_contact_id");

-- CreateIndex
CREATE INDEX "messages_external_message_id_idx" ON "messages"("external_message_id");

-- AddForeignKey
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
