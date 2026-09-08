-- DropIndex
DROP INDEX "table_session_restaurantTableId_key";

-- AlterTable
ALTER TABLE "table_session" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "table_session_restaurantTableId_createdAt_idx" ON "table_session"("restaurantTableId", "createdAt");

-- A table may have many closed sessions but at most one open session
CREATE UNIQUE INDEX "table_session_one_open_per_table_idx"
ON "table_session"("restaurantTableId")
WHERE "closedAt" IS NULL;