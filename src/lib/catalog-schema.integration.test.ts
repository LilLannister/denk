import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "./prisma";

let restaurantId: string;
let otherRestaurantId: string;
let categoryId: string;
let otherCategoryId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Catalog Restaurant ${suffix}`,
    },
  });

  const otherRestaurant = await prisma.restaurant.create({
    data: {
      name: `Other Catalog Restaurant ${suffix}`,
    },
  });

  const category = await prisma.catalogCategory.create({
    data: {
      restaurantId: restaurant.id,
      key: "food",
      name: "Food",
      sortOrder: 10,
    },
  });

  const otherCategory = await prisma.catalogCategory.create({
    data: {
      restaurantId: otherRestaurant.id,
      key: "food",
      name: "Food",
      sortOrder: 10,
    },
  });

  restaurantId = restaurant.id;
  otherRestaurantId = otherRestaurant.id;
  categoryId = category.id;
  otherCategoryId = otherCategory.id;
});

afterEach(async () => {
  await prisma.restaurant.deleteMany({
    where: {
      id: {
        in: [restaurantId, otherRestaurantId],
      },
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("catalog schema", () => {
  it("stores a categorized catalog item with safe defaults", async () => {
    const item = await prisma.catalogItem.create({
      data: {
        restaurantId,
        categoryId,
        key: "shared-breakfast",
        name: "Shared Breakfast",
        unitPriceMinor: 12_550,
        sortOrder: 10,
      },
      include: {
        category: true,
      },
    });

    expect(item).toMatchObject({
      restaurantId,
      categoryId,
      key: "shared-breakfast",
      name: "Shared Breakfast",
      unitPriceMinor: 12_550,
      isActive: true,
      sortOrder: 10,
      category: {
        key: "food",
        name: "Food",
      },
    });
  });

  it("allows the same category key in different restaurants", async () => {
    const categories = await prisma.catalogCategory.findMany({
      where: {
        key: "food",
        restaurantId: {
          in: [restaurantId, otherRestaurantId],
        },
      },
    });

    expect(categories).toHaveLength(2);
  });

  it("rejects duplicate category keys within one restaurant", async () => {
    await expect(
      prisma.catalogCategory.create({
        data: {
          restaurantId,
          key: "food",
          name: "Another Food Category",
          sortOrder: 20,
        },
      }),
    ).rejects.toThrow();
  });

  it.each([
    {
      description: "an empty key",
      key: "",
      name: "Invalid Category",
      sortOrder: 20,
    },
    {
      description: "an uppercase key",
      key: "Drinks",
      name: "Invalid Category",
      sortOrder: 20,
    },
    {
      description: "a key containing spaces",
      key: "soft drinks",
      name: "Invalid Category",
      sortOrder: 20,
    },
    {
      description: "a key containing underscores",
      key: "soft_drinks",
      name: "Invalid Category",
      sortOrder: 20,
    },
    {
      description: "a key containing repeated hyphens",
      key: "soft--drinks",
      name: "Invalid Category",
      sortOrder: 20,
    },
    {
      description: "a key longer than 64 characters",
      key: "a".repeat(65),
      name: "Invalid Category",
      sortOrder: 20,
    },
    {
      description: "an empty name",
      key: "invalid-empty-name",
      name: "",
      sortOrder: 20,
    },
    {
      description: "an untrimmed name",
      key: "invalid-untrimmed-name",
      name: " Invalid Category ",
      sortOrder: 20,
    },
    {
      description: "a name longer than 120 characters",
      key: "invalid-long-name",
      name: "a".repeat(121),
      sortOrder: 20,
    },
    {
      description: "a negative sort order",
      key: "invalid-sort-order",
      name: "Invalid Category",
      sortOrder: -1,
    },
  ])("rejects category data with $description", async (input) => {
    await expect(
      prisma.catalogCategory.create({
        data: {
          restaurantId,
          key: input.key,
          name: input.name,
          sortOrder: input.sortOrder,
        },
      }),
    ).rejects.toThrow();
  });

  it("keeps item keys unique across the restaurant", async () => {
    const secondCategory = await prisma.catalogCategory.create({
      data: {
        restaurantId,
        key: "breakfast",
        name: "Breakfast",
        sortOrder: 20,
      },
    });

    await prisma.catalogItem.create({
      data: {
        restaurantId,
        categoryId,
        key: "tea",
        name: "Tea",
        unitPriceMinor: 500,
        sortOrder: 10,
      },
    });

    await expect(
      prisma.catalogItem.create({
        data: {
          restaurantId,
          categoryId: secondCategory.id,
          key: "tea",
          name: "Breakfast Tea",
          unitPriceMinor: 600,
          sortOrder: 10,
        },
      }),
    ).rejects.toThrow();
  });

  it("allows the same item key in different restaurants", async () => {
    await prisma.catalogItem.create({
      data: {
        restaurantId,
        categoryId,
        key: "tea",
        name: "Tea",
        unitPriceMinor: 500,
        sortOrder: 10,
      },
    });

    await expect(
      prisma.catalogItem.create({
        data: {
          restaurantId: otherRestaurantId,
          categoryId: otherCategoryId,
          key: "tea",
          name: "Tea",
          unitPriceMinor: 700,
          sortOrder: 10,
        },
      }),
    ).resolves.toMatchObject({
      restaurantId: otherRestaurantId,
      key: "tea",
    });
  });

  it("rejects a category owned by another restaurant", async () => {
    await expect(
      prisma.catalogItem.create({
        data: {
          restaurantId,
          categoryId: otherCategoryId,
          key: "cross-restaurant-item",
          name: "Cross Restaurant Item",
          unitPriceMinor: 1_000,
          sortOrder: 10,
        },
      }),
    ).rejects.toThrow();
  });

  it.each([
    {
      description: "an empty key",
      key: "",
      name: "Invalid Item",
      unitPriceMinor: 100,
      sortOrder: 20,
    },
    {
      description: "an uppercase key",
      key: "Cola",
      name: "Invalid Item",
      unitPriceMinor: 100,
      sortOrder: 20,
    },
    {
      description: "a key containing spaces",
      key: "soft drink",
      name: "Invalid Item",
      unitPriceMinor: 100,
      sortOrder: 20,
    },
    {
      description: "a key containing repeated hyphens",
      key: "soft--drink",
      name: "Invalid Item",
      unitPriceMinor: 100,
      sortOrder: 20,
    },
    {
      description: "a key longer than 64 characters",
      key: "a".repeat(65),
      name: "Invalid Item",
      unitPriceMinor: 100,
      sortOrder: 20,
    },
    {
      description: "an empty name",
      key: "invalid-empty-name",
      name: "",
      unitPriceMinor: 100,
      sortOrder: 20,
    },
    {
      description: "an untrimmed name",
      key: "invalid-untrimmed-name",
      name: " Invalid Item ",
      unitPriceMinor: 100,
      sortOrder: 20,
    },
    {
      description: "a name longer than 120 characters",
      key: "invalid-long-name",
      name: "a".repeat(121),
      unitPriceMinor: 100,
      sortOrder: 20,
    },
    {
      description: "a zero price",
      key: "invalid-zero-price",
      name: "Invalid Item",
      unitPriceMinor: 0,
      sortOrder: 20,
    },
    {
      description: "a negative price",
      key: "invalid-negative-price",
      name: "Invalid Item",
      unitPriceMinor: -1,
      sortOrder: 20,
    },
    {
      description: "a negative sort order",
      key: "invalid-sort-order",
      name: "Invalid Item",
      unitPriceMinor: 100,
      sortOrder: -1,
    },
  ])("rejects catalog item data with $description", async (input) => {
    await expect(
      prisma.catalogItem.create({
        data: {
          restaurantId,
          categoryId,
          key: input.key,
          name: input.name,
          unitPriceMinor: input.unitPriceMinor,
          sortOrder: input.sortOrder,
        },
      }),
    ).rejects.toThrow();
  });

  it("preserves bill snapshots when a catalog item is deleted", async () => {
    const catalogItem = await prisma.catalogItem.create({
      data: {
        restaurantId,
        categoryId,
        key: "snapshot-item",
        name: "Original Catalog Name",
        unitPriceMinor: 2_500,
        sortOrder: 10,
      },
    });

    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        name: "Snapshot Table",
      },
    });

    const tableSession = await prisma.tableSession.create({
      data: {
        restaurantTableId: table.id,
        joinCodeDigest: `catalog-schema-digest-${randomUUID()}`,
        joinCodeExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const billItem = await prisma.billItem.create({
      data: {
        tableSessionId: tableSession.id,
        catalogItemId: catalogItem.id,
        name: "Original Catalog Name",
        quantity: 2,
        unitPriceMinor: 2_500,
      },
    });

    await prisma.catalogItem.delete({
      where: {
        id: catalogItem.id,
      },
    });

    await expect(
      prisma.billItem.findUniqueOrThrow({
        where: {
          id: billItem.id,
        },
      }),
    ).resolves.toMatchObject({
      catalogItemId: null,
      name: "Original Catalog Name",
      quantity: 2,
      unitPriceMinor: 2_500,
    });
  });
});
