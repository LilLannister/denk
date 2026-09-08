import { z } from "zod";

import { InvalidMoneyAmountError, addMinorUnits } from "./money";
import { lockOpenTableSession } from "./open-table-session-lock";
import { prisma } from "./prisma";
import { requireRestaurantMembership } from "./staff-authorization";

const maximumDatabaseInteger = 2_147_483_647;

const addBillItemSchema = z.object({
  userId: z.string().min(1),
  restaurantTableId: z.string().min(1),
  catalogItemId: z.string().min(1),
  quantity: z.number().int().positive().max(maximumDatabaseInteger),
});

const updateBillItemQuantitySchema = z.object({
  userId: z.string().min(1),
  restaurantTableId: z.string().min(1),
  billItemId: z.string().min(1),
  quantity: z.number().int().positive().max(maximumDatabaseInteger),
});

const removeBillItemSchema = z.object({
  userId: z.string().min(1),
  restaurantTableId: z.string().min(1),
  billItemId: z.string().min(1),
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

export class BillItemNotFoundError extends Error {
  constructor() {
    super("Bill item was not found");
    this.name = "BillItemNotFoundError";
  }
}

async function requireAuthorizedRestaurantTable({
  userId,
  restaurantTableId,
}: {
  userId: string;
  restaurantTableId: string;
}) {
  const restaurantTable = await prisma.restaurantTable.findUnique({
    where: {
      id: restaurantTableId,
    },
    select: {
      restaurantId: true,
    },
  });

  if (!restaurantTable) {
    throw new BillItemTableNotFoundError();
  }

  await requireRestaurantMembership(userId, restaurantTable.restaurantId);

  return restaurantTable;
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

  const restaurantTable = await requireAuthorizedRestaurantTable({
    userId: parsedInput.data.userId,
    restaurantTableId: parsedInput.data.restaurantTableId,
  });

  return prisma.$transaction(async (transaction) => {
    const openSession = await lockOpenTableSession(
      transaction,
      parsedInput.data.restaurantTableId,
    );

    if (!openSession) {
      throw new BillItemTableSessionNotOpenError();
    }

    const currentSession = await transaction.tableSession.findUniqueOrThrow({
      where: {
        id: openSession.id,
      },
      select: {
        id: true,
        billItems: {
          select: {
            quantity: true,
            unitPriceMinor: true,
          },
        },
      },
    });

    const catalogItem = await transaction.catalogItem.findFirst({
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
      const currentTotalMinor = currentSession.billItems.reduce(
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

    return transaction.billItem.create({
      data: {
        tableSessionId: currentSession.id,
        catalogItemId: catalogItem.id,
        name: catalogItem.name,
        quantity: parsedInput.data.quantity,
        unitPriceMinor: catalogItem.unitPriceMinor,
      },
    });
  });
}

export async function updateBillItemQuantity(input: {
  userId: string;
  restaurantTableId: string;
  billItemId: string;
  quantity: number;
}) {
  const parsedInput = updateBillItemQuantitySchema.safeParse(input);

  if (!parsedInput.success) {
    throw new InvalidBillItemError();
  }

  await requireAuthorizedRestaurantTable({
    userId: parsedInput.data.userId,
    restaurantTableId: parsedInput.data.restaurantTableId,
  });

  return prisma.$transaction(async (transaction) => {
    const openSession = await lockOpenTableSession(
      transaction,
      parsedInput.data.restaurantTableId,
    );

    if (!openSession) {
      throw new BillItemTableSessionNotOpenError();
    }

    const currentSession = await transaction.tableSession.findUniqueOrThrow({
      where: {
        id: openSession.id,
      },
      select: {
        billItems: {
          select: {
            id: true,
            quantity: true,
            unitPriceMinor: true,
          },
        },
      },
    });

    const billItem = currentSession.billItems.find(
      (item) => item.id === parsedInput.data.billItemId,
    );

    if (!billItem) {
      throw new BillItemNotFoundError();
    }

    try {
      const updatedLineTotalMinor =
        parsedInput.data.quantity * billItem.unitPriceMinor;

      if (!Number.isSafeInteger(updatedLineTotalMinor)) {
        throw new InvalidBillItemError();
      }

      currentSession.billItems.reduce((total, item) => {
        const lineTotalMinor =
          item.id === billItem.id
            ? updatedLineTotalMinor
            : item.quantity * item.unitPriceMinor;

        return addMinorUnits(total, lineTotalMinor);
      }, 0);
    } catch (error) {
      if (error instanceof InvalidMoneyAmountError) {
        throw new InvalidBillItemError();
      }

      throw error;
    }

    return transaction.billItem.update({
      where: {
        id: billItem.id,
      },
      data: {
        quantity: parsedInput.data.quantity,
      },
    });
  });
}

export async function removeBillItem(input: {
  userId: string;
  restaurantTableId: string;
  billItemId: string;
}) {
  const parsedInput = removeBillItemSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new InvalidBillItemError();
  }

  await requireAuthorizedRestaurantTable({
    userId: parsedInput.data.userId,
    restaurantTableId: parsedInput.data.restaurantTableId,
  });

  return prisma.$transaction(async (transaction) => {
    const openSession = await lockOpenTableSession(
      transaction,
      parsedInput.data.restaurantTableId,
    );

    if (!openSession) {
      throw new BillItemTableSessionNotOpenError();
    }

    const billItem = await transaction.billItem.findFirst({
      where: {
        id: parsedInput.data.billItemId,
        tableSessionId: openSession.id,
      },
      select: {
        id: true,
      },
    });

    if (!billItem) {
      throw new BillItemNotFoundError();
    }

    return transaction.billItem.delete({
      where: {
        id: billItem.id,
      },
    });
  });
}
