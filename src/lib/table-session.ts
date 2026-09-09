import { parseEnvironment } from "./env";
import { digestJoinCode, generateJoinCode } from "./join-code";
import { prisma } from "./prisma";
import { requireRestaurantMembership } from "./staff-authorization";
import { lockOpenTableSession } from "./open-table-session-lock";
import { lockRestaurantTable } from "./restaurant-table-lock";

const JOIN_CODE_LIFETIME_MS = 15 * 60 * 1_000;

export class RestaurantTableNotFoundError extends Error {
  constructor() {
    super("Restaurant table not found");
    this.name = "RestaurantTableNotFoundError";
  }
}

export class RestaurantTableInactiveError extends Error {
  constructor() {
    super("Restaurant table is inactive");
    this.name = "RestaurantTableInactiveError";
  }
}

export class TableSessionAlreadyOpenError extends Error {
  constructor() {
    super("A session is already open for this table");
    this.name = "TableSessionAlreadyOpenError";
  }
}

export class TableSessionNotOpenError extends Error {
  constructor() {
    super("No session is open for this table");
    this.name = "TableSessionNotOpenError";
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

export async function openTableSession({
  userId,
  restaurantTableId,
  now = new Date(),
}: {
  userId: string;
  restaurantTableId: string;
  now?: Date;
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
    throw new RestaurantTableNotFoundError();
  }

  await requireRestaurantMembership(userId, restaurantTable.restaurantId);

  const environment = parseEnvironment(process.env);
  const joinCode = generateJoinCode();

  try {
    return await prisma.$transaction(async (transaction) => {
      const lockedTable = await lockRestaurantTable(
        transaction,
        restaurantTableId,
      );

      if (!lockedTable) {
        throw new RestaurantTableNotFoundError();
      }

      if (!lockedTable.isActive) {
        throw new RestaurantTableInactiveError();
      }

      const existingSession = await transaction.tableSession.findFirst({
        where: {
          restaurantTableId,
          closedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (existingSession) {
        throw new TableSessionAlreadyOpenError();
      }

      const tableSession = await transaction.tableSession.create({
        data: {
          restaurantTableId,
          joinCodeDigest: digestJoinCode(
            joinCode,
            environment.BETTER_AUTH_SECRET,
          ),
          joinCodeExpiresAt: new Date(now.getTime() + JOIN_CODE_LIFETIME_MS),
        },
      });

      return {
        tableSession,
        joinCode,
      };
    });
  } catch (error) {
    // The partial unique database index remains the final protection
    // against more than one open session.
    if (isUniqueConstraintError(error)) {
      throw new TableSessionAlreadyOpenError();
    }

    throw error;
  }
}

export async function rotateTableSessionJoinCode({
  userId,
  restaurantTableId,
  now = new Date(),
}: {
  userId: string;
  restaurantTableId: string;
  now?: Date;
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
    throw new RestaurantTableNotFoundError();
  }

  await requireRestaurantMembership(userId, restaurantTable.restaurantId);

  const environment = parseEnvironment(process.env);

  return prisma.$transaction(async (transaction) => {
    const currentSession = await lockOpenTableSession(
      transaction,
      restaurantTableId,
    );

    if (!currentSession) {
      throw new TableSessionNotOpenError();
    }

    const existingSession = await transaction.tableSession.findUniqueOrThrow({
      where: {
        id: currentSession.id,
      },
      select: {
        joinCodeDigest: true,
      },
    });

    let joinCode = generateJoinCode();
    let joinCodeDigest = digestJoinCode(
      joinCode,
      environment.BETTER_AUTH_SECRET,
    );

    while (joinCodeDigest === existingSession.joinCodeDigest) {
      joinCode = generateJoinCode();
      joinCodeDigest = digestJoinCode(joinCode, environment.BETTER_AUTH_SECRET);
    }

    const updateResult = await transaction.tableSession.updateMany({
      where: {
        id: currentSession.id,
        closedAt: null,
      },
      data: {
        joinCodeDigest,
        joinCodeExpiresAt: new Date(now.getTime() + JOIN_CODE_LIFETIME_MS),
      },
    });

    if (updateResult.count !== 1) {
      throw new TableSessionNotOpenError();
    }

    const tableSession = await transaction.tableSession.findUniqueOrThrow({
      where: {
        id: currentSession.id,
      },
    });

    return {
      tableSession,
      joinCode,
    };
  });
}

export async function closeTableSession({
  userId,
  restaurantTableId,
  now = new Date(),
}: {
  userId: string;
  restaurantTableId: string;
  now?: Date;
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
    throw new RestaurantTableNotFoundError();
  }

  await requireRestaurantMembership(userId, restaurantTable.restaurantId);

  return prisma.$transaction(async (transaction) => {
    const currentSession = await lockOpenTableSession(
      transaction,
      restaurantTableId,
    );

    if (!currentSession) {
      throw new TableSessionNotOpenError();
    }

    const closeResult = await transaction.tableSession.updateMany({
      where: {
        id: currentSession.id,
        closedAt: null,
      },
      data: {
        closedAt: now,
        joinCodeExpiresAt: now,
      },
    });

    if (closeResult.count !== 1) {
      throw new TableSessionNotOpenError();
    }

    await transaction.guestSession.updateMany({
      where: {
        tableSessionId: currentSession.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    return transaction.tableSession.findUniqueOrThrow({
      where: {
        id: currentSession.id,
      },
    });
  });
}
