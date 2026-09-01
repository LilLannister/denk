import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "./prisma";

let restaurantId: string;
let tableSessionId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Integration Restaurant ${suffix}`,
    },
  });

  restaurantId = restaurant.id;

  const restaurantTable = await prisma.restaurantTable.create({
    data: {
      name: `Table ${suffix}`,
      restaurantId,
    },
  });

  const tableSession = await prisma.tableSession.create({
    data: {
      restaurantTableId: restaurantTable.id,
      joinCodeDigest: `integration-digest-${suffix}`,
      joinCodeExpiresAt: new Date(Date.now() + 60_000),
    },
  });

  tableSessionId = tableSession.id;
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

describe("Prisma database foundation", () => {
  it("round-trips an exact integer minor-unit price", async () => {
    const billItem = await prisma.billItem.create({
      data: {
        tableSessionId,
        name: "Shared breakfast",
        quantity: 2,
        unitPriceMinor: 12_550,
      },
    });

    expect(billItem.quantity).toBe(2);
    expect(billItem.unitPriceMinor).toBe(12_550);
  });

  it("rejects a non-positive bill-item quantity", async () => {
    await expect(
      prisma.billItem.create({
        data: {
          tableSessionId,
          name: "Invalid quantity",
          quantity: 0,
          unitPriceMinor: 1_000,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a non-positive bill-item price", async () => {
    await expect(
      prisma.billItem.create({
        data: {
          tableSessionId,
          name: "Invalid price",
          quantity: 1,
          unitPriceMinor: 0,
        },
      }),
    ).rejects.toThrow();
  });
});
