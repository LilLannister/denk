import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyJoinCode } from "./join-code";
import { prisma } from "./prisma";
import { RestaurantAccessDeniedError } from "./staff-authorization";
import {
  RestaurantTableNotFoundError,
  TableSessionAlreadyOpenError,
  openTableSession,
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

    expect(result.joinCode).toMatch(/^\d{6}$/);
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
      await prisma.tableSession.findUnique({
        where: {
          restaurantTableId,
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
});
