import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BillItemTableNotFoundError,
  BillItemTableSessionNotOpenError,
  InvalidBillItemError,
  addBillItem,
} from "./bill-item";
import { prisma } from "./prisma";
import { RestaurantAccessDeniedError } from "./staff-authorization";

let restaurantId: string;
let restaurantTableId: string;
let userId: string;
let otherUserId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Bill Item Restaurant ${suffix}`,
      tables: {
        create: {
          name: `Table ${suffix}`,
          currentSession: {
            create: {
              joinCodeDigest: `bill-item-digest-${suffix}`,
              joinCodeExpiresAt: new Date(Date.now() + 60_000),
            },
          },
        },
      },
    },
    include: {
      tables: true,
    },
  });

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: "Bill Item Staff",
      email: `bill-item-staff-${suffix}@example.com`,
    },
  });

  const otherUser = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: "Other Staff",
      email: `other-bill-item-staff-${suffix}@example.com`,
    },
  });

  await prisma.restaurantMembership.create({
    data: {
      restaurantId: restaurant.id,
      userId: user.id,
      role: "STAFF",
    },
  });

  restaurantId = restaurant.id;
  restaurantTableId = restaurant.tables[0].id;
  userId = user.id;
  otherUserId = otherUser.id;
});

afterEach(async () => {
  await prisma.restaurant.delete({
    where: {
      id: restaurantId,
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

describe("adding bill items", () => {
  it("allows assigned staff to add an item to the open table session", async () => {
    const billItem = await addBillItem({
      userId,
      restaurantTableId,
      name: "  Shared breakfast  ",
      quantity: 2,
      unitPriceMinor: 12_550,
    });

    expect(billItem).toMatchObject({
      name: "Shared breakfast",
      quantity: 2,
      unitPriceMinor: 12_550,
    });
  });

  it("rejects staff who are not assigned to the restaurant", async () => {
    await expect(
      addBillItem({
        userId: otherUserId,
        restaurantTableId,
        name: "Unauthorized item",
        quantity: 1,
        unitPriceMinor: 1_000,
      }),
    ).rejects.toThrow(RestaurantAccessDeniedError);

    expect(
      await prisma.billItem.count({
        where: {
          tableSession: {
            restaurantTableId,
          },
        },
      }),
    ).toBe(0);
  });

  it("rejects an unknown table", async () => {
    await expect(
      addBillItem({
        userId,
        restaurantTableId: randomUUID(),
        name: "Unknown table item",
        quantity: 1,
        unitPriceMinor: 1_000,
      }),
    ).rejects.toThrow(BillItemTableNotFoundError);
  });

  it("rejects a table without an open session", async () => {
    const tableWithoutSession = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        name: `Closed Table ${randomUUID()}`,
      },
    });

    await expect(
      addBillItem({
        userId,
        restaurantTableId: tableWithoutSession.id,
        name: "Closed table item",
        quantity: 1,
        unitPriceMinor: 1_000,
      }),
    ).rejects.toThrow(BillItemTableSessionNotOpenError);
  });

  it("rejects an item that would make the bill total unsafe", async () => {
    await addBillItem({
      userId,
      restaurantTableId,
      name: "Large item one",
      quantity: 2_000_000_000,
      unitPriceMinor: 4_000_000,
    });

    await expect(
      addBillItem({
        userId,
        restaurantTableId,
        name: "Large item two",
        quantity: 2_000_000_000,
        unitPriceMinor: 4_000_000,
      }),
    ).rejects.toThrow(InvalidBillItemError);

    expect(
      await prisma.billItem.count({
        where: {
          tableSession: {
            restaurantTableId,
          },
        },
      }),
    ).toBe(1);
  });

  it.each([
    { name: "", quantity: 1, unitPriceMinor: 100 },
    { name: "Invalid quantity", quantity: 0, unitPriceMinor: 100 },
    { name: "Invalid price", quantity: 1, unitPriceMinor: 0 },
    { name: "Fractional quantity", quantity: 1.5, unitPriceMinor: 100 },
    {
      name: "Unsafe line total",
      quantity: 2_147_483_647,
      unitPriceMinor: 2_147_483_647,
    },
  ])("rejects invalid item details", async (input) => {
    await expect(
      addBillItem({
        userId,
        restaurantTableId,
        ...input,
      }),
    ).rejects.toThrow(InvalidBillItemError);
  });
});
