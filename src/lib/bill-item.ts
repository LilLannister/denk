import { z } from "zod";

import { InvalidMoneyAmountError, addMinorUnits } from "./money";
import { prisma } from "./prisma";
import { requireRestaurantMembership } from "./staff-authorization";

const maximumDatabaseInteger = 2_147_483_647;

const addBillItemSchema = z.object({
  userId: z.string().min(1),
  restaurantTableId: z.string().min(1),
  catalogItemId: z.string().min(1),
  quantity: z.number().int().positive().max(maximumDatabaseInteger),
});

export class InvalidBillItemError extends Error {
  constructor() {
    super("Bill item details are invalid");
    this.name = "InvalidBillItemError";
  }
}

export class BillItemTableNotFoundError extends Error {
  constructor() {
    super("Restaurant table was not found");
    this.name = "BillItemTableNotFoundError";
  }
}

export class BillItemTableSessionNotOpenError extends Error {
  constructor() {
    super("Restaurant table does not have an open session");
    this.name = "BillItemTableSessionNotOpenError";
  }
}

export class BillItemCatalogItemUnavailableError extends Error {
  constructor() {
    super("Catalog item is unavailable");
    this.name = "BillItemCatalogItemUnavailableError";
  }
}

export async function addBillItem(input: {
  userId: string;
  restaurantTableId: string;
  catalogItemId: string;
  quantity: number;
}) {
  const parsedInput = addBillItemSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new InvalidBillItemError();
  }

  const restaurantTable = await prisma.restaurantTable.findUnique({
    where: {
      id: parsedInput.data.restaurantTableId,
    },
    select: {
      restaurantId: true,
      currentSession: {
        select: {
          id: true,
          billItems: {
            select: {
              quantity: true,
              unitPriceMinor: true,
            },
          },
        },
      },
    },
  });

  if (!restaurantTable) {
    throw new BillItemTableNotFoundError();
  }

  await requireRestaurantMembership(
    parsedInput.data.userId,
    restaurantTable.restaurantId,
  );

  if (!restaurantTable.currentSession) {
    throw new BillItemTableSessionNotOpenError();
  }

  const catalogItem = await prisma.catalogItem.findFirst({
    where: {
      id: parsedInput.data.catalogItemId,
      restaurantId: restaurantTable.restaurantId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      unitPriceMinor: true,
    },
  });

  if (!catalogItem) {
    throw new BillItemCatalogItemUnavailableError();
  }

  try {
    const currentTotalMinor = restaurantTable.currentSession.billItems.reduce(
      (total, item) =>
        addMinorUnits(total, item.quantity * item.unitPriceMinor),
      0,
    );

    const newLineTotalMinor =
      parsedInput.data.quantity * catalogItem.unitPriceMinor;

    if (!Number.isSafeInteger(newLineTotalMinor)) {
      throw new InvalidBillItemError();
    }

    addMinorUnits(currentTotalMinor, newLineTotalMinor);
  } catch (error) {
    if (error instanceof InvalidMoneyAmountError) {
      throw new InvalidBillItemError();
    }

    throw error;
  }

  return prisma.billItem.create({
    data: {
      tableSessionId: restaurantTable.currentSession.id,
      catalogItemId: catalogItem.id,
      name: catalogItem.name,
      quantity: parsedInput.data.quantity,
      unitPriceMinor: catalogItem.unitPriceMinor,
    },
  });
}
