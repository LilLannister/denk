import type { Prisma } from "../generated/prisma/client";

export async function lockOpenTableSession(
  transaction: Prisma.TransactionClient,
  restaurantTableId: string,
) {
  const sessions = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "table_session"
    WHERE "restaurantTableId" = ${restaurantTableId}
      AND "closedAt" IS NULL
    FOR UPDATE
  `;

  return sessions[0] ?? null;
}
