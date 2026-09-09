import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "./prisma";

let restaurantId: string;
let tableSessionId: string;
let otherTableSessionId: string;
let billItemId: string;
let otherBillItemId: string;
let guestSessionId: string;
let otherGuestSessionId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Allocation Schema Restaurant ${suffix}`,
    },
  });

  const restaurantTable = await prisma.restaurantTable.create({
    data: {
      restaurantId: restaurant.id,
      name: `Allocation Table ${suffix}`,
    },
  });

  const otherRestaurantTable = await prisma.restaurantTable.create({
    data: {
      restaurantId: restaurant.id,
      name: `Other Allocation Table ${suffix}`,
    },
  });

  const tableSession = await prisma.tableSession.create({
    data: {
      restaurantTableId: restaurantTable.id,
      joinCodeDigest: `allocation-code-${suffix}`,
      joinCodeExpiresAt: new Date("2026-09-10T12:00:00.000Z"),
    },
  });

  const otherTableSession = await prisma.tableSession.create({
    data: {
      restaurantTableId: otherRestaurantTable.id,
      joinCodeDigest: `other-allocation-code-${suffix}`,
      joinCodeExpiresAt: new Date("2026-09-10T12:00:00.000Z"),
    },
  });

  const billItem = await prisma.billItem.create({
    data: {
      tableSessionId: tableSession.id,
      name: "Tea",
      quantity: 3,
      unitPriceMinor: 2_550,
    },
  });

  const otherBillItem = await prisma.billItem.create({
    data: {
      tableSessionId: otherTableSession.id,
      name: "Coffee",
      quantity: 2,
      unitPriceMinor: 7_500,
    },
  });

  const guestSession = await prisma.guestSession.create({
    data: {
      tableSessionId: tableSession.id,
      tokenHash: `allocation-token-${suffix}`,
      expiresAt: new Date("2026-09-10T12:00:00.000Z"),
    },
  });

  const otherGuestSession = await prisma.guestSession.create({
    data: {
      tableSessionId: otherTableSession.id,
      tokenHash: `other-allocation-token-${suffix}`,
      expiresAt: new Date("2026-09-10T12:00:00.000Z"),
    },
  });

  restaurantId = restaurant.id;
  tableSessionId = tableSession.id;
  otherTableSessionId = otherTableSession.id;
  billItemId = billItem.id;
  otherBillItemId = otherBillItem.id;
  guestSessionId = guestSession.id;
  otherGuestSessionId = otherGuestSession.id;
});

afterEach(async () => {
  await prisma.billItemAllocation.deleteMany({
    where: {
      tableSessionId: {
        in: [tableSessionId, otherTableSessionId],
      },
    },
  });

  await prisma.restaurant.delete({
    where: {
      id: restaurantId,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("whole-item allocation schema", () => {
  it("stores a positive whole-unit allocation", async () => {
    const allocation = await prisma.billItemAllocation.create({
      data: {
        tableSessionId,
        billItemId,
        guestSessionId,
        quantity: 2,
      },
      include: {
        billItem: true,
        guestSession: true,
      },
    });

    expect(allocation).toMatchObject({
      tableSessionId,
      billItemId,
      guestSessionId,
      quantity: 2,
      billItem: {
        id: billItemId,
        tableSessionId,
        unitPriceMinor: 2_550,
      },
      guestSession: {
        id: guestSessionId,
        tableSessionId,
      },
    });
  });

  it("allows different guests to claim the same bill item", async () => {
    const secondGuest = await prisma.guestSession.create({
      data: {
        tableSessionId,
        tokenHash: `second-allocation-token-${randomUUID()}`,
        expiresAt: new Date("2026-09-10T12:00:00.000Z"),
      },
    });

    await prisma.billItemAllocation.createMany({
      data: [
        {
          tableSessionId,
          billItemId,
          guestSessionId,
          quantity: 1,
        },
        {
          tableSessionId,
          billItemId,
          guestSessionId: secondGuest.id,
          quantity: 1,
        },
      ],
    });

    await expect(
      prisma.billItemAllocation.count({
        where: {
          billItemId,
        },
      }),
    ).resolves.toBe(2);
  });

  it("rejects a second allocation for the same guest and bill item", async () => {
    await prisma.billItemAllocation.create({
      data: {
        tableSessionId,
        billItemId,
        guestSessionId,
        quantity: 1,
      },
    });

    await expect(
      prisma.billItemAllocation.create({
        data: {
          tableSessionId,
          billItemId,
          guestSessionId,
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it.each([0, -1])("rejects allocation quantity %s", async (quantity) => {
    await expect(
      prisma.billItemAllocation.create({
        data: {
          tableSessionId,
          billItemId,
          guestSessionId,
          quantity,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects an allocation across different table sessions", async () => {
    await expect(
      prisma.billItemAllocation.create({
        data: {
          tableSessionId,
          billItemId,
          guestSessionId: otherGuestSessionId,
          quantity: 1,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.billItemAllocation.create({
        data: {
          tableSessionId: otherTableSessionId,
          billItemId: otherBillItemId,
          guestSessionId,
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it("prevents allocated bill items and guest sessions from being deleted", async () => {
    await prisma.billItemAllocation.create({
      data: {
        tableSessionId,
        billItemId,
        guestSessionId,
        quantity: 1,
      },
    });

    await expect(
      prisma.billItem.delete({
        where: {
          id: billItemId,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.guestSession.delete({
        where: {
          id: guestSessionId,
        },
      }),
    ).rejects.toThrow();
  });
});
