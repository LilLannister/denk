import { parseEnvironment } from "./env";
import { digestJoinCode, generateJoinCode } from "./join-code";
import { prisma } from "./prisma";
import { requireRestaurantMembership } from "./staff-authorization";

const JOIN_CODE_LIFETIME_MS = 15 * 60 * 1_000;

export class RestaurantTableNotFoundError extends Error {
  constructor() {
    super("Restaurant table not found");
    this.name = "RestaurantTableNotFoundError";
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
      id: true,
      restaurantId: true,
    },
  });

  if (!restaurantTable) {
    throw new RestaurantTableNotFoundError();
  }

  await requireRestaurantMembership(userId, restaurantTable.restaurantId);

  const existingSession = await prisma.tableSession.findUnique({
    where: {
      restaurantTableId,
    },
  });

  if (existingSession) {
    throw new TableSessionAlreadyOpenError();
  }

  const environment = parseEnvironment(process.env);
  const joinCode = generateJoinCode();

  try {
    const tableSession = await prisma.tableSession.create({
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
  } catch (error) {
    // The database uniqueness constraint also protects against simultaneous opens.
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
      currentSession: {
        select: {
          id: true,
          joinCodeDigest: true,
        },
      },
    },
  });

  if (!restaurantTable) {
    throw new RestaurantTableNotFoundError();
  }

  await requireRestaurantMembership(userId, restaurantTable.restaurantId);

  if (!restaurantTable.currentSession) {
    throw new TableSessionNotOpenError();
  }

  const environment = parseEnvironment(process.env);

  let joinCode = generateJoinCode();
  let joinCodeDigest = digestJoinCode(joinCode, environment.BETTER_AUTH_SECRET);

  while (joinCodeDigest === restaurantTable.currentSession.joinCodeDigest) {
    joinCode = generateJoinCode();
    joinCodeDigest = digestJoinCode(joinCode, environment.BETTER_AUTH_SECRET);
  }

  const tableSession = await prisma.tableSession.update({
    where: {
      id: restaurantTable.currentSession.id,
    },
    data: {
      joinCodeDigest,
      joinCodeExpiresAt: new Date(now.getTime() + JOIN_CODE_LIFETIME_MS),
    },
  });

  return {
    tableSession,
    joinCode,
  };
}
