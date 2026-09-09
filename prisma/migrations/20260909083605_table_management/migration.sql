-- AlterTable
ALTER TABLE "restaurant_table"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AddCheckConstraint
ALTER TABLE "restaurant_table"
ADD CONSTRAINT "restaurant_table_name_check"
CHECK (
    "name" = btrim("name")
    AND char_length("name") BETWEEN 1 AND 120
);

-- CreateIndex
CREATE INDEX "restaurant_table_restaurantId_isActive_idx"
ON "restaurant_table"("restaurantId", "isActive");