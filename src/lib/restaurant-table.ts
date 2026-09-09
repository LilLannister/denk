import { z } from "zod";

import { prisma } from "./prisma";
import { lockRestaurantTable } from "./restaurant-table-lock";
import { requireRestaurantAdmin } from "./staff-authorization";

const tableNameSchema = z.string().trim().min(1).max(120);

const createRestaurantTableSchema = z.object({
  userId: z.string().min(1),
  restaurantId: z.string().min(1),
  name: tableNameSchema,
});

const renameRestaurantTableSchema = z.object({
  userId: z.string().min(1),
  restaurantTableId: z.string().min(1),
  name: tableNameSchema,
});

const setRestaurantTableActiveSchema = z.object({
  userId: z.string().min(1),
  restaurantTableId: z.string().min(1),
  isActive: z.boolean(),
});

export class InvalidRestaurantTableError extends Error {
  constructor() {
    super("Restaurant table details are invalid");
    this.name = "InvalidRestaurantTableError";
  }
}

export class ManagedRestaurantTableNotFoundError extends Error {
  constructor() {
    super("Restaurant table was not found");
    this.name = "ManagedRestaurantTableNotFoundError";
  }
}

export class RestaurantTableNameConflictError extends Error {
  constructor() {
    super("A table with this name already exists");
    this.name = "RestaurantTableNameConflictError";
  }
}

export class RestaurantTableHasOpenSessionError extends Error {
  constructor() {
    super("A table with an open session cannot be deactivated");
    this.name = "RestaurantTableHasOpenSessionError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requireAdminForTable({
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
    throw new ManagedRestaurantTableNotFoundError();
  }

  await requireRestaurantAdmin(userId, restaurantTable.restaurantId);

  return restaurantTable;
}

export async function createRestaurantTable(input: {
  userId: string;
  restaurantId: string;
  name: string;
}) {
  const parsedInput = createRestaurantTableSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new InvalidRestaurantTableError();
  }

  await requireRestaurantAdmin(
    parsedInput.data.userId,
    parsedInput.data.restaurantId,
  );

  try {
    return await prisma.restaurantTable.create({
      data: {
        restaurantId: parsedInput.data.restaurantId,
        name: parsedInput.data.name,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new RestaurantTableNameConflictError();
    }

    throw error;
  }
}

export async function renameRestaurantTable(input: {
  userId: string;
  restaurantTableId: string;
  name: string;
}) {
  const parsedInput = renameRestaurantTableSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new InvalidRestaurantTableError();
  }

  await requireAdminForTable({
    userId: parsedInput.data.userId,
    restaurantTableId: parsedInput.data.restaurantTableId,
  });

  try {
    return await prisma.$transaction(async (transaction) => {
      const restaurantTable = await lockRestaurantTable(
        transaction,
        parsedInput.data.restaurantTableId,
      );

      if (!restaurantTable) {
        throw new ManagedRestaurantTableNotFoundError();
      }

      if (
        (
          await transaction.restaurantTable.findUniqueOrThrow({
            where: {
              id: restaurantTable.id,
            },
            select: {
              name: true,
            },
          })
        ).name === parsedInput.data.name
      ) {
        return transaction.restaurantTable.findUniqueOrThrow({
          where: {
            id: restaurantTable.id,
          },
        });
      }

      return transaction.restaurantTable.update({
        where: {
          id: restaurantTable.id,
        },
        data: {
          name: parsedInput.data.name,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new RestaurantTableNameConflictError();
    }

    throw error;
  }
}

export async function setRestaurantTableActive(input: {
  userId: string;
  restaurantTableId: string;
  isActive: boolean;
}) {
  const parsedInput = setRestaurantTableActiveSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new InvalidRestaurantTableError();
  }

  await requireAdminForTable({
    userId: parsedInput.data.userId,
    restaurantTableId: parsedInput.data.restaurantTableId,
  });

  return prisma.$transaction(async (transaction) => {
    const restaurantTable = await lockRestaurantTable(
      transaction,
      parsedInput.data.restaurantTableId,
    );

    if (!restaurantTable) {
      throw new ManagedRestaurantTableNotFoundError();
    }

    if (restaurantTable.isActive === parsedInput.data.isActive) {
      return transaction.restaurantTable.findUniqueOrThrow({
        where: {
          id: restaurantTable.id,
        },
      });
    }

    if (!parsedInput.data.isActive) {
      const openSession = await transaction.tableSession.findFirst({
        where: {
          restaurantTableId: restaurantTable.id,
          closedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (openSession) {
        throw new RestaurantTableHasOpenSessionError();
      }
    }

    return transaction.restaurantTable.update({
      where: {
        id: restaurantTable.id,
      },
      data: {
        isActive: parsedInput.data.isActive,
      },
    });
  });
}
