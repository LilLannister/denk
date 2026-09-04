import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CatalogImportRestaurantNotFoundError,
  InvalidCatalogImportError,
  importCatalog,
} from "./catalog-import";
import { prisma } from "./prisma";

let restaurantId: string;
let otherRestaurantId: string;

function createCatalogDocument() {
  return {
    schemaVersion: "1.0.0",
    categories: [
      {
        key: "pizza",
        name: "Pizza",
        sortOrder: 10,
        items: [
          {
            key: "margherita",
            name: "Margherita",
            unitPrice: "250.00",
            sortOrder: 10,
            active: true,
          },
          {
            key: "pepperoni",
            name: "Pepperoni",
            unitPrice: "300.00",
            sortOrder: 20,
            active: true,
          },
        ],
      },
      {
        key: "beverages",
        name: "Beverages",
        sortOrder: 20,
        items: [
          {
            key: "tea",
            name: "Tea",
            unitPrice: "25.50",
            sortOrder: 10,
            active: true,
          },
        ],
      },
    ],
  };
}

beforeEach(async () => {
  const suffix = randomUUID();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Catalog Import Restaurant ${suffix}`,
    },
  });

  const otherRestaurant = await prisma.restaurant.create({
    data: {
      name: `Other Catalog Import Restaurant ${suffix}`,
    },
  });

  restaurantId = restaurant.id;
  otherRestaurantId = otherRestaurant.id;
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

describe("catalog importing", () => {
  it("creates categorized items with exact prices", async () => {
    const result = await importCatalog({
      restaurantId,
      document: createCatalogDocument(),
    });

    expect(result).toEqual({
      categories: {
        created: 2,
        updated: 0,
        unchanged: 0,
      },
      items: {
        created: 3,
        updated: 0,
        unchanged: 0,
      },
    });

    const categories = await prisma.catalogCategory.findMany({
      where: {
        restaurantId,
      },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });

    expect(categories).toMatchObject([
      {
        key: "pizza",
        name: "Pizza",
        sortOrder: 10,
        items: [
          {
            key: "margherita",
            name: "Margherita",
            unitPriceMinor: 25_000,
            isActive: true,
            sortOrder: 10,
          },
          {
            key: "pepperoni",
            name: "Pepperoni",
            unitPriceMinor: 30_000,
            isActive: true,
            sortOrder: 20,
          },
        ],
      },
      {
        key: "beverages",
        name: "Beverages",
        sortOrder: 20,
        items: [
          {
            key: "tea",
            name: "Tea",
            unitPriceMinor: 2_550,
            isActive: true,
            sortOrder: 10,
          },
        ],
      },
    ]);
  });

  it("is exactly idempotent for unchanged data", async () => {
    const document = createCatalogDocument();

    await importCatalog({
      restaurantId,
      document,
    });

    const preservedTimestamp = new Date("2020-01-01T00:00:00.000Z");

    await prisma.catalogCategory.updateMany({
      where: {
        restaurantId,
      },
      data: {
        updatedAt: preservedTimestamp,
      },
    });

    await prisma.catalogItem.updateMany({
      where: {
        restaurantId,
      },
      data: {
        updatedAt: preservedTimestamp,
      },
    });

    const result = await importCatalog({
      restaurantId,
      document,
    });

    expect(result).toEqual({
      categories: {
        created: 0,
        updated: 0,
        unchanged: 2,
      },
      items: {
        created: 0,
        updated: 0,
        unchanged: 3,
      },
    });

    const categoryTimestamps = await prisma.catalogCategory.findMany({
      where: {
        restaurantId,
      },
      select: {
        updatedAt: true,
      },
    });

    const itemTimestamps = await prisma.catalogItem.findMany({
      where: {
        restaurantId,
      },
      select: {
        updatedAt: true,
      },
    });

    expect(
      categoryTimestamps.every(
        ({ updatedAt }) => updatedAt.getTime() === preservedTimestamp.getTime(),
      ),
    ).toBe(true);

    expect(
      itemTimestamps.every(
        ({ updatedAt }) => updatedAt.getTime() === preservedTimestamp.getTime(),
      ),
    ).toBe(true);
  });

  it("updates category and item business values", async () => {
    const document = createCatalogDocument();

    await importCatalog({
      restaurantId,
      document,
    });

    document.categories[0].name = "Pizzas";
    document.categories[0].sortOrder = 30;
    document.categories[0].items[0].name = "Classic Margherita";
    document.categories[0].items[0].unitPrice = "275.50";
    document.categories[0].items[0].sortOrder = 40;
    document.categories[0].items[0].active = false;

    const result = await importCatalog({
      restaurantId,
      document,
    });

    expect(result).toEqual({
      categories: {
        created: 0,
        updated: 1,
        unchanged: 1,
      },
      items: {
        created: 0,
        updated: 1,
        unchanged: 2,
      },
    });

    await expect(
      prisma.catalogItem.findUniqueOrThrow({
        where: {
          restaurantId_key: {
            restaurantId,
            key: "margherita",
          },
        },
        include: {
          category: true,
        },
      }),
    ).resolves.toMatchObject({
      key: "margherita",
      name: "Classic Margherita",
      unitPriceMinor: 27_550,
      isActive: false,
      sortOrder: 40,
      category: {
        key: "pizza",
        name: "Pizzas",
        sortOrder: 30,
      },
    });
  });

  it("moves an item between categories without replacing its identity", async () => {
    const document = createCatalogDocument();

    await importCatalog({
      restaurantId,
      document,
    });

    const originalItem = await prisma.catalogItem.findUniqueOrThrow({
      where: {
        restaurantId_key: {
          restaurantId,
          key: "tea",
        },
      },
    });

    const tea = document.categories[1].items[0];
    document.categories[1].items = [];
    document.categories[0].items.push(tea);

    const result = await importCatalog({
      restaurantId,
      document,
    });

    const movedItem = await prisma.catalogItem.findUniqueOrThrow({
      where: {
        restaurantId_key: {
          restaurantId,
          key: "tea",
        },
      },
      include: {
        category: true,
      },
    });

    expect(result.items).toEqual({
      created: 0,
      updated: 1,
      unchanged: 2,
    });
    expect(movedItem.id).toBe(originalItem.id);
    expect(movedItem.category.key).toBe("pizza");
  });

  it("leaves omitted categories and items unchanged", async () => {
    const document = createCatalogDocument();

    await importCatalog({
      restaurantId,
      document,
    });

    const partialDocument = {
      schemaVersion: "1.0.0",
      categories: [
        {
          key: "pizza",
          name: "Pizza",
          sortOrder: 10,
          items: [
            {
              key: "margherita",
              name: "Margherita",
              unitPrice: "250.00",
              sortOrder: 10,
              active: true,
            },
          ],
        },
      ],
    };

    await importCatalog({
      restaurantId,
      document: partialDocument,
    });

    await expect(
      prisma.catalogCategory.count({
        where: {
          restaurantId,
        },
      }),
    ).resolves.toBe(2);

    await expect(
      prisma.catalogItem.count({
        where: {
          restaurantId,
        },
      }),
    ).resolves.toBe(3);

    await expect(
      prisma.catalogItem.findUniqueOrThrow({
        where: {
          restaurantId_key: {
            restaurantId,
            key: "pepperoni",
          },
        },
      }),
    ).resolves.toMatchObject({
      isActive: true,
      unitPriceMinor: 30_000,
    });
  });

  it("keeps imports isolated by restaurant", async () => {
    const document = createCatalogDocument();

    await importCatalog({
      restaurantId,
      document,
    });

    await importCatalog({
      restaurantId: otherRestaurantId,
      document,
    });

    const firstRestaurantItems = await prisma.catalogItem.findMany({
      where: {
        restaurantId,
      },
      orderBy: {
        key: "asc",
      },
    });

    const otherRestaurantItems = await prisma.catalogItem.findMany({
      where: {
        restaurantId: otherRestaurantId,
      },
      orderBy: {
        key: "asc",
      },
    });

    expect(firstRestaurantItems).toHaveLength(3);
    expect(otherRestaurantItems).toHaveLength(3);
    expect(otherRestaurantItems.map(({ key }) => key)).toEqual(
      firstRestaurantItems.map(({ key }) => key),
    );
    expect(
      otherRestaurantItems.every(
        (item) =>
          !firstRestaurantItems.some((firstItem) => firstItem.id === item.id),
      ),
    ).toBe(true);
  });
  it("rejects an unknown restaurant without writing catalog data", async () => {
    await expect(
      importCatalog({
        restaurantId: randomUUID(),
        document: createCatalogDocument(),
      }),
    ).rejects.toBeInstanceOf(CatalogImportRestaurantNotFoundError);

    expect(
      await prisma.catalogCategory.count({
        where: {
          restaurantId,
        },
      }),
    ).toBe(0);

    expect(
      await prisma.catalogItem.count({
        where: {
          restaurantId,
        },
      }),
    ).toBe(0);
  });

  it("rejects invalid input before writing catalog data", async () => {
    const invalidDocument = {
      ...createCatalogDocument(),
      schemaVersion: "2.0.0",
    };

    await expect(
      importCatalog({
        restaurantId,
        document: invalidDocument,
      }),
    ).rejects.toBeInstanceOf(InvalidCatalogImportError);

    expect(
      await prisma.catalogCategory.count({
        where: {
          restaurantId,
        },
      }),
    ).toBe(0);

    expect(
      await prisma.catalogItem.count({
        where: {
          restaurantId,
        },
      }),
    ).toBe(0);
  });
});
