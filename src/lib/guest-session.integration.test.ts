import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyGuestToken } from "./guest-token";
import { digestJoinCode } from "./join-code";
import { prisma } from "./prisma";

import {
  GuestJoinDeniedError,
  getGuestBillProjection,
  joinTableSession,
} from "./guest-session";

const joinCode = "ABCD2345";
const otherJoinCode = "WXYZ6789";
const secret = process.env.BETTER_AUTH_SECRET!;

let restaurantId: string;
let restaurantTableId: string;
let publicTableId: string;
let tableSessionId: string;
let otherPublicTableId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Guest Session Restaurant ${suffix}`,
    },
  });

  const restaurantTable = await prisma.restaurantTable.create({
    data: {
      name: `Guest Table ${suffix}`,
      restaurantId: restaurant.id,
    },
  });

  const otherRestaurantTable = await prisma.restaurantTable.create({
    data: {
      name: `Other Guest Table ${suffix}`,
      restaurantId: restaurant.id,
    },
  });

  const tableSession = await prisma.tableSession.create({
    data: {
      restaurantTableId: restaurantTable.id,
      joinCodeDigest: digestJoinCode(joinCode, secret),
      joinCodeExpiresAt: new Date("2026-09-03T13:00:00.000Z"),
    },
  });

  await prisma.tableSession.create({
    data: {
      restaurantTableId: otherRestaurantTable.id,
      joinCodeDigest: digestJoinCode(otherJoinCode, secret),
      joinCodeExpiresAt: new Date("2026-09-03T13:00:00.000Z"),
    },
  });

  restaurantId = restaurant.id;
  restaurantTableId = restaurantTable.id;
  publicTableId = restaurantTable.publicId;
  tableSessionId = tableSession.id;
  otherPublicTableId = otherRestaurantTable.publicId;
});

afterEach(async () => {
  await prisma.restaurant.delete({
    where: {
      id: restaurantId,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("guest table-session joining", () => {
  it("creates an anonymous guest session for a valid code", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");

    const result = await joinTableSession({
      publicTableId,
      joinCode,
      now,
    });

    expect(result.restaurantTable.id).toBe(restaurantTableId);
    expect(result.guestSession.tableSessionId).toBe(tableSessionId);
    expect(result.guestSession.tokenHash).not.toBe(result.token);
    expect(result.guestSession.expiresAt).toEqual(
      new Date("2026-09-04T00:00:00.000Z"),
    );
    expect(verifyGuestToken(result.token, result.guestSession.tokenHash)).toBe(
      true,
    );
  });

  it("returns only the explicit bill projection with exact totals", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");

    const joined = await joinTableSession({
      publicTableId,
      joinCode,
      now,
    });

    await prisma.billItem.createMany({
      data: [
        {
          tableSessionId,
          name: "Shared breakfast",
          quantity: 2,
          unitPriceMinor: 12_550,
          createdAt: new Date("2026-09-03T12:01:00.000Z"),
        },
        {
          tableSessionId,
          name: "Tea",
          quantity: 1,
          unitPriceMinor: 500,
          createdAt: new Date("2026-09-03T12:02:00.000Z"),
        },
      ],
    });

    const bill = await getGuestBillProjection({
      publicTableId,
      token: joined.token,
      now,
    });

    expect(bill).toEqual({
      tableName: expect.stringMatching(/^Guest Table /),
      items: [
        {
          name: "Shared breakfast",
          quantity: 2,
          unitPriceMinor: 12_550,
          lineTotalMinor: 25_100,
        },
        {
          name: "Tea",
          quantity: 1,
          unitPriceMinor: 500,
          lineTotalMinor: 500,
        },
      ],
      totalMinor: 25_600,
    });
  });

  it("rejects an incorrect join code", async () => {
    await expect(
      joinTableSession({
        publicTableId,
        joinCode: "00000000",
        now: new Date("2026-09-03T12:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(GuestJoinDeniedError);
  });

  it("rejects an expired join code", async () => {
    await expect(
      joinTableSession({
        publicTableId,
        joinCode,
        now: new Date("2026-09-03T13:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(GuestJoinDeniedError);
  });

  it("rejects an unknown public table", async () => {
    await expect(
      joinTableSession({
        publicTableId: randomUUID(),
        joinCode,
        now: new Date("2026-09-03T12:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(GuestJoinDeniedError);
  });

  it("does not accept one table's code for another table", async () => {
    await expect(
      joinTableSession({
        publicTableId: otherPublicTableId,
        joinCode,
        now: new Date("2026-09-03T12:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(GuestJoinDeniedError);
  });

  it("allows a valid guest token to access its table", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");

    const joined = await joinTableSession({
      publicTableId,
      joinCode,
      now,
    });

    const access = await getGuestBillProjection({
      publicTableId,
      token: joined.token,
      now,
    });

    expect(access).toEqual({
      tableName: expect.stringMatching(/^Guest Table /),
      items: [],
      totalMinor: 0,
    });
  });

  it("rejects an incorrect guest token", async () => {
    const access = await getGuestBillProjection({
      publicTableId,
      token: "incorrect-guest-token",
      now: new Date("2026-09-03T12:00:00.000Z"),
    });

    expect(access).toBeNull();
  });

  it("rejects a guest token for another table", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");

    const joined = await joinTableSession({
      publicTableId,
      joinCode,
      now,
    });

    const access = await getGuestBillProjection({
      publicTableId: otherPublicTableId,
      token: joined.token,
      now,
    });

    expect(access).toBeNull();
  });

  it("rejects an expired guest session", async () => {
    const joined = await joinTableSession({
      publicTableId,
      joinCode,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });

    const access = await getGuestBillProjection({
      publicTableId,
      token: joined.token,
      now: new Date("2026-09-04T00:00:00.000Z"),
    });

    expect(access).toBeNull();
  });

  it("rejects a revoked guest session", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");

    const joined = await joinTableSession({
      publicTableId,
      joinCode,
      now,
    });

    await prisma.guestSession.update({
      where: {
        id: joined.guestSession.id,
      },
      data: {
        revokedAt: now,
      },
    });

    const access = await getGuestBillProjection({
      publicTableId,
      token: joined.token,
      now,
    });

    expect(access).toBeNull();
  });
});
