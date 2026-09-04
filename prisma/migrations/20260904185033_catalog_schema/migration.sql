-- AlterTable
ALTER TABLE "bill_item" ADD COLUMN     "catalogItemId" TEXT;

-- CreateTable
CREATE TABLE "catalog_category" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_item" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_item_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraints
ALTER TABLE "catalog_category"
ADD CONSTRAINT "catalog_category_key_format_check"
CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
ADD CONSTRAINT "catalog_category_key_length_check"
CHECK (char_length("key") <= 64),
ADD CONSTRAINT "catalog_category_name_check"
CHECK (
    "name" = btrim("name")
    AND char_length("name") BETWEEN 1 AND 120
),
ADD CONSTRAINT "catalog_category_sort_order_check"
CHECK ("sortOrder" >= 0);

ALTER TABLE "catalog_item"
ADD CONSTRAINT "catalog_item_key_format_check"
CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
ADD CONSTRAINT "catalog_item_key_length_check"
CHECK (char_length("key") <= 64),
ADD CONSTRAINT "catalog_item_name_check"
CHECK (
    "name" = btrim("name")
    AND char_length("name") BETWEEN 1 AND 120
),
ADD CONSTRAINT "catalog_item_unit_price_check"
CHECK ("unitPriceMinor" > 0),
ADD CONSTRAINT "catalog_item_sort_order_check"
CHECK ("sortOrder" >= 0);

-- CreateIndex
CREATE INDEX "catalog_category_restaurantId_sortOrder_idx" ON "catalog_category"("restaurantId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_category_restaurantId_key_key" ON "catalog_category"("restaurantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_category_id_restaurantId_key" ON "catalog_category"("id", "restaurantId");

-- CreateIndex
CREATE INDEX "catalog_item_categoryId_sortOrder_idx" ON "catalog_item"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "catalog_item_restaurantId_isActive_idx" ON "catalog_item"("restaurantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_item_restaurantId_key_key" ON "catalog_item"("restaurantId", "key");

-- CreateIndex
CREATE INDEX "bill_item_catalogItemId_idx" ON "bill_item"("catalogItemId");

-- AddForeignKey
ALTER TABLE "catalog_category" ADD CONSTRAINT "catalog_category_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_categoryId_restaurantId_fkey" FOREIGN KEY ("categoryId", "restaurantId") REFERENCES "catalog_category"("id", "restaurantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_item" ADD CONSTRAINT "bill_item_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
