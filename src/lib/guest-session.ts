import { parseEnvironment } from "./env";
import { generateGuestToken, hashGuestToken } from "./guest-token";
import { verifyJoinCode } from "./join-code";
import { prisma } from "./prisma";

const GUEST_SESSION_LIFETIME_MS = 12 * 60 * 60 * 1_000;

export class GuestJoinDeniedError extends Error {
  constructor() {
    super("Guest join denied");
    this.name = "GuestJoinDeniedError";
  }
}

export async function joinTableSession({
  publicTableId,
  joinCode,
  now = new Date(),
}: {
  publicTableId: string;
  joinCode: string;
  now?: Date;
}) {
  const restaurantTable = await prisma.restaurantTable.findUnique({
    where: {
      publicId: publicTableId,
    },
    include: {
      currentSession: true,
    },
  });

  const tableSession = restaurantTable?.currentSession;

  if (!restaurantTable || !tableSession) {
    throw new GuestJoinDeniedError();
  }

  const environment = parseEnvironment(process.env);

  const codeIsValid =
    tableSession.joinCodeExpiresAt > now &&
    verifyJoinCode(
      joinCode,
      tableSession.joinCodeDigest,
      environment.BETTER_AUTH_SECRET,
    );

  if (!codeIsValid) {
    throw new GuestJoinDeniedError();
  }

  const token = generateGuestToken();

  const guestSession = await prisma.guestSession.create({
    data: {
      tableSessionId: tableSession.id,
      tokenHash: hashGuestToken(token),
      expiresAt: new Date(now.getTime() + GUEST_SESSION_LIFETIME_MS),
    },
  });

  return {
    token,
    guestSession,
    restaurantTable,
  };
}

export async function getGuestTableAccess({
  publicTableId,
  token,
  now = new Date(),
}: {
  publicTableId: string;
  token: string;
  now?: Date;
}) {
  const guestSession = await prisma.guestSession.findUnique({
    where: {
      tokenHash: hashGuestToken(token),
    },
    include: {
      tableSession: {
        include: {
          restaurantTable: true,
          billItems: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
    },
  });

  if (
    !guestSession ||
    guestSession.revokedAt ||
    guestSession.expiresAt <= now ||
    guestSession.tableSession.restaurantTable.publicId !== publicTableId
  ) {
    return null;
  }

  return guestSession;
}
