import { parseEnvironment } from "./env";
import { generateGuestToken, hashGuestToken } from "./guest-token";
import { verifyJoinCode } from "./join-code";
import { InvalidMoneyAmountError, addMinorUnits } from "./money";
import { prisma } from "./prisma";
import { lockOpenTableSession } from "./open-table-session-lock";

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
  });

  if (!restaurantTable) {
    throw new GuestJoinDeniedError();
  }

  const environment = parseEnvironment(process.env);

  return prisma.$transaction(async (transaction) => {
    const openSession = await lockOpenTableSession(
      transaction,
      restaurantTable.id,
    );

    if (!openSession) {
      throw new GuestJoinDeniedError();
    }

    const tableSession = await transaction.tableSession.findUniqueOrThrow({
      where: {
        id: openSession.id,
      },
    });

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

    const guestSession = await transaction.guestSession.create({
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
  });
}

export async function getGuestBillProjection({
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
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
      tableSession: {
        select: {
          closedAt: true,
          restaurantTable: {
            select: {
              publicId: true,
              name: true,
            },
          },
          billItems: {
            select: {
              id: true,
              name: true,
              quantity: true,
              unitPriceMinor: true,
              allocations: {
                select: {
                  guestSessionId: true,
                  quantity: true,
                },
              },
            },
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
    guestSession.tableSession.closedAt ||
    guestSession.tableSession.restaurantTable.publicId !== publicTableId
  ) {
    return null;
  }

  const items = guestSession.tableSession.billItems.map((item) => {
    const claimedQuantity = item.allocations.reduce((total, allocation) => {
      const nextTotal = total + allocation.quantity;

      if (!Number.isSafeInteger(nextTotal) || nextTotal > item.quantity) {
        throw new InvalidMoneyAmountError();
      }

      return nextTotal;
    }, 0);

    const currentGuestClaimedQuantity = item.allocations
      .filter((allocation) => allocation.guestSessionId === guestSession.id)
      .reduce((total, allocation) => {
        const nextTotal = total + allocation.quantity;

        if (!Number.isSafeInteger(nextTotal)) {
          throw new InvalidMoneyAmountError();
        }

        return nextTotal;
      }, 0);

    const lineTotalMinor = addMinorUnits(
      0,
      item.quantity * item.unitPriceMinor,
    );

    const claimedMinor = addMinorUnits(
      0,
      claimedQuantity * item.unitPriceMinor,
    );

    const currentGuestLineTotalMinor = addMinorUnits(
      0,
      currentGuestClaimedQuantity * item.unitPriceMinor,
    );

    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor,
      claimedQuantity,
      availableQuantity: item.quantity - claimedQuantity,
      currentGuestClaimedQuantity,
      claimedMinor,
      currentGuestLineTotalMinor,
    };
  });

  return {
    tableName: guestSession.tableSession.restaurantTable.name,
    items,
    totalMinor: items.reduce(
      (total, item) => addMinorUnits(total, item.lineTotalMinor),
      0,
    ),
    claimedMinor: items.reduce(
      (total, item) => addMinorUnits(total, item.claimedMinor),
      0,
    ),
    remainingMinor: items.reduce(
      (total, item) =>
        addMinorUnits(total, item.lineTotalMinor - item.claimedMinor),
      0,
    ),
    currentGuestPayableMinor: items.reduce(
      (total, item) => addMinorUnits(total, item.currentGuestLineTotalMinor),
      0,
    ),
  };
}
