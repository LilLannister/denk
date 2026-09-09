/*
  Warnings:

  - A unique constraint covering the columns `[id,tableSessionId]` on the table `bill_item` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,tableSessionId]` on the table `guest_session` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "bill_item_allocation" (
    "id" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "billItemId" TEXT NOT NULL,
    "guestSessionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_item_allocation_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraint
ALTER TABLE "bill_item_allocation"
ADD CONSTRAINT "bill_item_allocation_quantity_check"
CHECK ("quantity" > 0);

-- CreateIndex
CREATE INDEX "bill_item_allocation_billItemId_idx" ON "bill_item_allocation"("billItemId");

-- CreateIndex
CREATE INDEX "bill_item_allocation_tableSessionId_idx" ON "bill_item_allocation"("tableSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_item_allocation_guestSessionId_billItemId_key" ON "bill_item_allocation"("guestSessionId", "billItemId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_item_id_tableSessionId_key" ON "bill_item"("id", "tableSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "guest_session_id_tableSessionId_key" ON "guest_session"("id", "tableSessionId");

-- AddForeignKey
ALTER TABLE "bill_item_allocation" ADD CONSTRAINT "bill_item_allocation_billItemId_tableSessionId_fkey" FOREIGN KEY ("billItemId", "tableSessionId") REFERENCES "bill_item"("id", "tableSessionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_item_allocation" ADD CONSTRAINT "bill_item_allocation_guestSessionId_tableSessionId_fkey" FOREIGN KEY ("guestSessionId", "tableSessionId") REFERENCES "guest_session"("id", "tableSessionId") ON DELETE RESTRICT ON UPDATE CASCADE;
