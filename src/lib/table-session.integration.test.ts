import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyJoinCode } from "./join-code";
import { prisma } from "./prisma";
import { RestaurantAccessDeniedError } from "./staff-authorization";
import {
  RestaurantTableInactiveError,
  RestaurantTableNotFoundError,
  TableSessionAlreadyOpenError,
  TableSessionNotOpenError,
  closeTableSession,
  openTableSession,
  rotateTableSessionJoinCode,
} from "./table-session";

let userId: string;
let otherUserId: string;
let restaurantId: string;
let otherRestaurantId: string;
let restaurantTableId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: "Authorized Staff",
      email: `authorized-${suffix}@denk.test`,
      emailVerified: true,
    },
  });

  const otherUser = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: "Other Staff",
      email: `other-${suffix}@denk.test`,
      emailVerified: true,
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Session Restaurant ${suffix}`,
    },
  });

  const otherRestaurant = await prisma.restaurant.create({
    data: {
      name: `Other Session Restaurant ${suffix}`,
    },
  });

  const restaurantTable = await prisma.restaurantTable.create({
    data: {
      name: `Table ${suffix}`,
      restaurantId: restaurant.id,
    },
  });

  await prisma.restaurantMembership.createMany({
    data: [
      {
        userId: user.id,
        restaurantId: restaurant.id,
        role: "STAFF",
      },
      {
        userId: otherUser.id,
        restaurantId: otherRestaurant.id,
        role: "STAFF",
      },
    ],
  });

  userId = user.id;
  otherUserId = otherUser.id;
  restaurantId = restaurant.id;
  otherRestaurantId = otherRestaurant.id;
  restaurantTableId = restaurantTable.id;
});

afterEach(async () => {
  await prisma.billItemAllocation.deleteMany({
    where: {
      billItem: {
        tableSession: {
          restaurantTable: {
            restaurantId: {
              in: [restaurantId, otherRestaurantId],
            },
          },
        },
      },
    },
  });

  await prisma.restaurant.deleteMany({
    where: {
      id: {
        in: [restaurantId, otherRestaurantId],
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: {
        in: [userId, otherUserId],
      },
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("opening a table session", () => {
  it("creates a session and returns its readable join code once", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");

    const result = await openTableSession({
      userId,
      restaurantTableId,
      now,
    });

    expect(result.joinCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(result.tableSession.restaurantTableId).toBe(restaurantTableId);
    expect(result.tableSession.joinCodeDigest).not.toBe(result.joinCode);
    expect(result.tableSession.joinCodeExpiresAt).toEqual(
      new Date("2026-09-03T12:15:00.000Z"),
    );
    expect(
      verifyJoinCode(
        result.joinCode,
        result.tableSession.joinCodeDigest,
        process.env.BETTER_AUTH_SECRET!,
      ),
    ).toBe(true);
  });

  it("rejects staff assigned only to another restaurant", async () => {
    await expect(
      openTableSession({
        userId: otherUserId,
        restaurantTableId,
      }),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);

    expect(
      await prisma.tableSession.findFirst({
        where: {
          restaurantTableId,
          closedAt: null,
        },
      }),
    ).toBeNull();
  });

  it("rejects an unknown table", async () => {
    await expect(
      openTableSession({
        userId,
        restaurantTableId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(RestaurantTableNotFoundError);
  });

  it("rejects opening a second session for the same table", async () => {
    await openTableSession({
      userId,
      restaurantTableId,
    });

    await expect(
      openTableSession({
        userId,
        restaurantTableId,
      }),
    ).rejects.toBeInstanceOf(TableSessionAlreadyOpenError);
  });

  it("allows only one of two simultaneous open requests", async () => {
    const results = await Promise.allSettled([
      openTableSession({
        userId,
        restaurantTableId,
      }),
      openTableSession({
        userId,
        restaurantTableId,
      }),
    ]);

    const successfulResults = results.filter(
      (result) => result.status === "fulfilled",
    );
    const rejectedResults = results.filter(
      (result) => result.status === "rejected",
    );

    expect(successfulResults).toHaveLength(1);
    expect(rejectedResults).toHaveLength(1);

    const rejectedResult = rejectedResults[0];

    if (rejectedResult?.status === "rejected") {
      expect(rejectedResult.reason).toBeInstanceOf(
        TableSessionAlreadyOpenError,
      );
    }
  });

  it("rejects opening a session for an inactive table", async () => {
    await prisma.restaurantTable.update({
      where: {
        id: restaurantTableId,
      },
      data: {
        isActive: false,
      },
    });

    await expect(
      openTableSession({
        userId,
        restaurantTableId,
      }),
    ).rejects.toBeInstanceOf(RestaurantTableInactiveError);

    await expect(
      prisma.tableSession.count({
        where: {
          restaurantTableId,
        },
      }),
    ).resolves.toBe(0);
  });
});

it("rotates the join code without replacing the table session", async () => {
  const opened = await openTableSession({
    userId,
    restaurantTableId,
    now: new Date("2026-09-03T12:00:00.000Z"),
  });

  const guestSession = await prisma.guestSession.create({
    data: {
      tableSessionId: opened.tableSession.id,
      tokenHash: `rotation-test-${randomUUID()}`,
      expiresAt: new Date("2026-09-04T00:00:00.000Z"),
    },
  });

  const rotated = await rotateTableSessionJoinCode({
    userId,
    restaurantTableId,
    now: new Date("2026-09-03T12:05:00.000Z"),
  });

  expect(rotated.tableSession.id).toBe(opened.tableSession.id);
  expect(rotated.tableSession.joinCodeExpiresAt).toEqual(
    new Date("2026-09-03T12:20:00.000Z"),
  );

  expect(
    verifyJoinCode(
      opened.joinCode,
      rotated.tableSession.joinCodeDigest,
      process.env.BETTER_AUTH_SECRET!,
    ),
  ).toBe(false);

  expect(
    verifyJoinCode(
      rotated.joinCode,
      rotated.tableSession.joinCodeDigest,
      process.env.BETTER_AUTH_SECRET!,
    ),
  ).toBe(true);

  expect(
    await prisma.guestSession.findUnique({
      where: {
        id: guestSession.id,
      },
    }),
  ).not.toBeNull();
});

it("rejects rotation by staff from another restaurant", async () => {
  await openTableSession({
    userId,
    restaurantTableId,
  });

  await expect(
    rotateTableSessionJoinCode({
      userId: otherUserId,
      restaurantTableId,
    }),
  ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
});

it("rejects rotation when no table session is open", async () => {
  await expect(
    rotateTableSessionJoinCode({
      userId,
      restaurantTableId,
    }),
  ).rejects.toBeInstanceOf(TableSessionNotOpenError);
});

describe("closing and reopening a table session", () => {
  it("closes the session and immediately expires its join code", async () => {
    const opened = await openTableSession({
      userId,
      restaurantTableId,
    });

    const closedAt = new Date("2026-09-08T12:00:00.000Z");

    const closed = await closeTableSession({
      userId,
      restaurantTableId,
      now: closedAt,
    });

    expect(closed).toMatchObject({
      id: opened.tableSession.id,
      restaurantTableId,
      closedAt,
      joinCodeExpiresAt: closedAt,
    });
  });

  it("preserves bill history and revokes active guest sessions", async () => {
    const opened = await openTableSession({
      userId,
      restaurantTableId,
    });

    const billItem = await prisma.billItem.create({
      data: {
        tableSessionId: opened.tableSession.id,
        name: "Historical item",
        quantity: 2,
        unitPriceMinor: 12_500,
      },
    });

    const activeGuestSession = await prisma.guestSession.create({
      data: {
        tableSessionId: opened.tableSession.id,
        tokenHash: `active-close-test-${randomUUID()}`,
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    });

    const previousRevocation = new Date("2026-09-07T12:00:00.000Z");

    const alreadyRevokedGuestSession = await prisma.guestSession.create({
      data: {
        tableSessionId: opened.tableSession.id,
        tokenHash: `revoked-close-test-${randomUUID()}`,
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
        revokedAt: previousRevocation,
      },
    });

    const closedAt = new Date("2026-09-08T12:00:00.000Z");

    await closeTableSession({
      userId,
      restaurantTableId,
      now: closedAt,
    });

    await expect(
      prisma.billItem.findUnique({
        where: {
          id: billItem.id,
        },
      }),
    ).resolves.not.toBeNull();

    await expect(
      prisma.guestSession.findUniqueOrThrow({
        where: {
          id: activeGuestSession.id,
        },
      }),
    ).resolves.toMatchObject({
      revokedAt: closedAt,
    });

    await expect(
      prisma.guestSession.findUniqueOrThrow({
        where: {
          id: alreadyRevokedGuestSession.id,
        },
      }),
    ).resolves.toMatchObject({
      revokedAt: previousRevocation,
    });
  });

  it("reopens the table with a new session and retains the closed session", async () => {
    const first = await openTableSession({
      userId,
      restaurantTableId,
    });

    const closedAt = new Date("2026-09-08T12:00:00.000Z");

    await closeTableSession({
      userId,
      restaurantTableId,
      now: closedAt,
    });

    const second = await openTableSession({
      userId,
      restaurantTableId,
    });

    expect(second.tableSession.id).not.toBe(first.tableSession.id);

    const sessions = await prisma.tableSession.findMany({
      where: {
        restaurantTableId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      id: first.tableSession.id,
      closedAt,
    });
    expect(sessions[1]).toMatchObject({
      id: second.tableSession.id,
      closedAt: null,
    });
  });

  it("rejects closure by staff from another restaurant", async () => {
    await openTableSession({
      userId,
      restaurantTableId,
    });

    await expect(
      closeTableSession({
        userId: otherUserId,
        restaurantTableId,
      }),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);

    await expect(
      prisma.tableSession.findFirstOrThrow({
        where: {
          restaurantTableId,
          closedAt: null,
        },
      }),
    ).resolves.toBeDefined();
  });

  it("rejects closing an unknown table", async () => {
    await expect(
      closeTableSession({
        userId,
        restaurantTableId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(RestaurantTableNotFoundError);
  });

  it("rejects closing a table without an open session", async () => {
    await expect(
      closeTableSession({
        userId,
        restaurantTableId,
      }),
    ).rejects.toBeInstanceOf(TableSessionNotOpenError);
  });

  it("allows only one of two simultaneous close requests", async () => {
    await openTableSession({
      userId,
      restaurantTableId,
    });

    const results = await Promise.allSettled([
      closeTableSession({
        userId,
        restaurantTableId,
      }),
      closeTableSession({
        userId,
        restaurantTableId,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    const rejected = results.filter((result) => result.status === "rejected");

    expect(rejected).toHaveLength(1);

    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toBeInstanceOf(TableSessionNotOpenError);
    }

    await expect(
      prisma.tableSession.count({
        where: {
          restaurantTableId,
          closedAt: null,
        },
      }),
    ).resolves.toBe(0);
  });

  it("rejects join-code rotation after closure", async () => {
    await openTableSession({
      userId,
      restaurantTableId,
    });

    await closeTableSession({
      userId,
      restaurantTableId,
    });

    await expect(
      rotateTableSessionJoinCode({
        userId,
        restaurantTableId,
      }),
    ).rejects.toBeInstanceOf(TableSessionNotOpenError);
  });

  it("preserves allocations as historical records when closing", async () => {
    const opened = await openTableSession({
      userId,
      restaurantTableId,
    });

    const billItem = await prisma.billItem.create({
      data: {
        tableSessionId: opened.tableSession.id,
        name: "Allocated item",
        quantity: 2,
        unitPriceMinor: 10_000,
      },
    });

    const guestSession = await prisma.guestSession.create({
      data: {
        tableSessionId: opened.tableSession.id,
        tokenHash: `allocated-close-${randomUUID()}`,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });

    const allocation = await prisma.billItemAllocation.create({
      data: {
        tableSessionId: opened.tableSession.id,
        billItemId: billItem.id,
        guestSessionId: guestSession.id,
        quantity: 1,
      },
    });

    const closedAt = new Date("2026-09-10T12:00:00.000Z");

    await expect(
      closeTableSession({
        userId,
        restaurantTableId,
        now: closedAt,
      }),
    ).resolves.toMatchObject({
      id: opened.tableSession.id,
      closedAt,
      joinCodeExpiresAt: closedAt,
    });

    await expect(
      prisma.tableSession.findUniqueOrThrow({
        where: {
          id: opened.tableSession.id,
        },
        select: {
          closedAt: true,
          guestSessions: {
            where: {
              id: guestSession.id,
            },
            select: {
              revokedAt: true,
            },
          },
          billItems: {
            where: {
              id: billItem.id,
            },
            select: {
              allocations: {
                select: {
                  id: true,
                  quantity: true,
                },
              },
            },
          },
        },
      }),
    ).resolves.toEqual({
      closedAt,
      guestSessions: [
        {
          revokedAt: closedAt,
        },
      ],
      billItems: [
        {
          allocations: [
            {
              id: allocation.id,
              quantity: 1,
            },
          ],
        },
      ],
    });
  });
});
