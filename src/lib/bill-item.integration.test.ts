import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BillItemCatalogItemUnavailableError,
  BillItemTableNotFoundError,
  BillItemTableSessionNotOpenError,
  InvalidBillItemError,
  addBillItem,
} from "./bill-item";
import { prisma } from "./prisma";
import { RestaurantAccessDeniedError } from "./staff-authorization";

let restaurantId: string;
let otherRestaurantId: string;
let restaurantTableId: string;
let catalogItemId: string;
let inactiveCatalogItemId: string;
let largeCatalogItemId: string;
let maximumPriceCatalogItemId: string;
let otherRestaurantCatalogItemId: string;
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
          tableSessions: {
            create: {
              joinCodeDigest: `bill-item-digest-${suffix}`,
              joinCodeExpiresAt: new Date(Date.now() + 60_000),
            },
          },
        },
      },
      catalogCategories: {
        create: {
          key: `food-${suffix}`,
          name: "Food",
          sortOrder: 10,
          items: {
            create: [
              {
                key: `shared-breakfast-${suffix}`,
                name: "Shared breakfast",
                unitPriceMinor: 12_550,
                sortOrder: 10,
              },
              {
                key: `inactive-${suffix}`,
                name: "Inactive item",
                unitPriceMinor: 1_000,
                isActive: false,
                sortOrder: 20,
              },
              {
                key: `large-${suffix}`,
                name: "Large item",
                unitPriceMinor: 4_000_000,
                sortOrder: 30,
              },
              {
                key: `maximum-price-${suffix}`,
                name: "Maximum price item",
                unitPriceMinor: 2_147_483_647,
                sortOrder: 40,
              },
            ],
          },
        },
      },
    },
    include: { tables: true, catalogCategories: { include: { items: true } } },
  });
  const otherRestaurant = await prisma.restaurant.create({
    data: {
      name: `Other Bill Item Restaurant ${suffix}`,
      catalogCategories: {
        create: {
          key: `other-food-${suffix}`,
          name: "Other food",
          sortOrder: 10,
          items: {
            create: {
              key: `other-item-${suffix}`,
              name: "Other restaurant item",
              unitPriceMinor: 2_000,
              sortOrder: 10,
            },
          },
        },
      },
    },
    include: { catalogCategories: { include: { items: true } } },
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
    data: { restaurantId: restaurant.id, userId: user.id, role: "STAFF" },
  });

  const items = restaurant.catalogCategories[0].items;
  restaurantId = restaurant.id;
  otherRestaurantId = otherRestaurant.id;
  restaurantTableId = restaurant.tables[0].id;
  catalogItemId = items.find((item) => item.name === "Shared breakfast")!.id;
  inactiveCatalogItemId = items.find(
    (item) => item.name === "Inactive item",
  )!.id;
  largeCatalogItemId = items.find((item) => item.name === "Large item")!.id;
  maximumPriceCatalogItemId = items.find(
    (item) => item.name === "Maximum price item",
  )!.id;
  otherRestaurantCatalogItemId =
    otherRestaurant.catalogCategories[0].items[0].id;
  userId = user.id;
  otherUserId = otherUser.id;
});

afterEach(async () => {
  await prisma.restaurant.deleteMany({
    where: { id: { in: [restaurantId, otherRestaurantId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const countBillItems = () =>
  prisma.billItem.count({ where: { tableSession: { restaurantTableId } } });

describe("adding bill items", () => {
  it("copies the selected catalog item into the open bill", async () => {
    const billItem = await addBillItem({
      userId,
      restaurantTableId,
      catalogItemId,
      quantity: 2,
    });
    expect(billItem).toMatchObject({
      catalogItemId,
      name: "Shared breakfast",
      quantity: 2,
      unitPriceMinor: 12_550,
    });
  });

  it("preserves the bill snapshot after the catalog item changes", async () => {
    const billItem = await addBillItem({
      userId,
      restaurantTableId,
      catalogItemId,
      quantity: 2,
    });
    await prisma.catalogItem.update({
      where: { id: catalogItemId },
      data: { name: "Updated breakfast", unitPriceMinor: 15_000 },
    });
    await expect(
      prisma.billItem.findUniqueOrThrow({ where: { id: billItem.id } }),
    ).resolves.toMatchObject({
      catalogItemId,
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
        catalogItemId,
        quantity: 1,
      }),
    ).rejects.toThrow(RestaurantAccessDeniedError);
    expect(await countBillItems()).toBe(0);
  });

  it("rejects an unknown table", async () => {
    await expect(
      addBillItem({
        userId,
        restaurantTableId: randomUUID(),
        catalogItemId,
        quantity: 1,
      }),
    ).rejects.toThrow(BillItemTableNotFoundError);
  });

  it("rejects a table without an open session", async () => {
    const table = await prisma.restaurantTable.create({
      data: { restaurantId, name: `Closed Table ${randomUUID()}` },
    });
    await expect(
      addBillItem({
        userId,
        restaurantTableId: table.id,
        catalogItemId,
        quantity: 1,
      }),
    ).rejects.toThrow(BillItemTableSessionNotOpenError);
  });

  it.each([
    ["unknown", () => randomUUID()],
    ["inactive", () => inactiveCatalogItemId],
    ["another restaurant's", () => otherRestaurantCatalogItemId],
  ])("rejects an %s catalog item", async (_description, getItemId) => {
    await expect(
      addBillItem({
        userId,
        restaurantTableId,
        catalogItemId: getItemId(),
        quantity: 1,
      }),
    ).rejects.toThrow(BillItemCatalogItemUnavailableError);
    expect(await countBillItems()).toBe(0);
  });

  it("rejects an item that would make the bill total unsafe", async () => {
    await addBillItem({
      userId,
      restaurantTableId,
      catalogItemId: largeCatalogItemId,
      quantity: 2_000_000_000,
    });
    await expect(
      addBillItem({
        userId,
        restaurantTableId,
        catalogItemId: largeCatalogItemId,
        quantity: 2_000_000_000,
      }),
    ).rejects.toThrow(InvalidBillItemError);
    expect(await countBillItems()).toBe(1);
  });

  it("allows only one of two additions that would jointly make the bill total unsafe", async () => {
    const results = await Promise.allSettled([
      addBillItem({
        userId,
        restaurantTableId,
        catalogItemId: largeCatalogItemId,
        quantity: 2_000_000_000,
      }),
      addBillItem({
        userId,
        restaurantTableId,
        catalogItemId: largeCatalogItemId,
        quantity: 2_000_000_000,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    const rejected = results.filter((result) => result.status === "rejected");

    expect(rejected).toHaveLength(1);

    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toBeInstanceOf(InvalidBillItemError);
    }

    await expect(
      prisma.billItem.count({
        where: {
          tableSession: {
            restaurantTableId,
          },
        },
      }),
    ).resolves.toBe(1);
  });

  it.each([
    { catalogItemId: "", quantity: 1 },
    { catalogItemId: "valid", quantity: 0 },
    { catalogItemId: "valid", quantity: 1.5 },
    { catalogItemId: "valid", quantity: 2_147_483_648 },
  ])("rejects invalid input", async (input) => {
    await expect(
      addBillItem({
        userId,
        restaurantTableId,
        catalogItemId:
          input.catalogItemId === "valid" ? catalogItemId : input.catalogItemId,
        quantity: input.quantity,
      }),
    ).rejects.toThrow(InvalidBillItemError);
  });

  it("rejects an unsafe catalog-backed line total", async () => {
    await expect(
      addBillItem({
        userId,
        restaurantTableId,
        catalogItemId: maximumPriceCatalogItemId,
        quantity: 2_147_483_647,
      }),
    ).rejects.toThrow(InvalidBillItemError);
  });
});
