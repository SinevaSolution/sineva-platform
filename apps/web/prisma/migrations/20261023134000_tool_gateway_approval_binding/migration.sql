-- AlterTable
ALTER TABLE "platform"."tool_gateway_calls" ADD COLUMN     "approval_id" UUID,
ADD COLUMN     "authorization" JSONB,
ADD COLUMN     "connection_id" UUID,
ADD COLUMN     "tool_name" VARCHAR(128) NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "tool_gateway_calls_approval_id_key" ON "platform"."tool_gateway_calls"("approval_id");

-- AddForeignKey
ALTER TABLE "platform"."tool_gateway_calls" ADD CONSTRAINT "tool_gateway_calls_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "platform"."connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."tool_gateway_calls" ADD CONSTRAINT "tool_gateway_calls_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "platform"."approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

