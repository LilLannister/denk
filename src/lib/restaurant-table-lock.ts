import type { Prisma } from "../generated/prisma/client";

export async function lockRestaurantTable(
  transaction: Prisma.TransactionClient,
  restaurantTableId: string,
) {
  const tables = await transaction.$queryRaw<
    Array<{
      id: string;
      restaurantId: string;
      isActive: boolean;
    }>
  >`
    SELECT "id", "restaurantId", "isActive"
    FROM "restaurant_table"
    WHERE "id" = ${restaurantTableId}
    FOR UPDATE
  `;

  return tables[0] ?? null;
}
