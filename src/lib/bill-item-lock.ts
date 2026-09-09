import type { Prisma } from "../generated/prisma/client";

export async function lockBillItem(
  transaction: Prisma.TransactionClient,
  {
    billItemId,
    tableSessionId,
  }: {
    billItemId: string;
    tableSessionId: string;
  },
) {
  const billItems = await transaction.$queryRaw<
    Array<{
      id: string;
      tableSessionId: string;
      quantity: number;
      unitPriceMinor: number;
    }>
  >`
    SELECT "id", "tableSessionId", "quantity", "unitPriceMinor"
    FROM "bill_item"
    WHERE "id" = ${billItemId}
      AND "tableSessionId" = ${tableSessionId}
    FOR UPDATE
  `;

  return billItems[0] ?? null;
}
