import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { InvalidMoneyAmountError } from "./money";
import { prisma } from "./prisma";
import { getStaffWorkspaceProjection } from "./staff-workspace";

let userId: string;
let restaurantId: string;
let otherRestaurantId: string;
let openTableSessionId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: "Staff Workspace User",
      email: `staff-workspace-${suffix}@denk.test`,
      emailVerified: true,
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Assigned Restaurant ${suffix}`,
    },
  });

  const otherRestaurant = await prisma.restaurant.create({
    data: {
      name: `Unassigned Restaurant ${suffix}`,
    },
  });

  await prisma.restaurantMembership.create({
    data: {
      userId: user.id,
      restaurantId: restaurant.id,
      role: "STAFF",
    },
  });

  const openTable = await prisma.restaurantTable.create({
    data: {
      restaurantId: restaurant.id,
      name: "Table A",
    },
  });

  await prisma.restaurantTable.create({
    data: {
      restaurantId: restaurant.id,
      name: "Table B",
    },
  });

  await prisma.restaurantTable.create({
    data: {
      restaurantId: otherRestaurant.id,
      name: "Hidden Table",
    },
  });

  const openTableSession = await prisma.tableSession.create({
    data: {
      restaurantTableId: openTable.id,
      joinCodeDigest: `staff-workspace-digest-${suffix}`,
      joinCodeExpiresAt: new Date(Date.now() + 60_000),
      billItems: {
        create: [
          {
            name: "First item",
            quantity: 2,
            unitPriceMinor: 1_250,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            name: "Second item",
            quantity: 3,
            unitPriceMinor: 200,
            createdAt: new Date("2026-01-01T00:00:01.000Z"),
          },
        ],
      },
    },
  });

  userId = user.id;
  restaurantId = restaurant.id;
  otherRestaurantId = otherRestaurant.id;
  openTableSessionId = openTableSession.id;
});

afterEach(async () => {
  await prisma.restaurant.deleteMany({
    where: {
      id: {
        in: [restaurantId, otherRestaurantId],
      },
    },
  });

  await prisma.user.delete({
    where: {
      id: userId,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("staff workspace projection", () => {
  it("returns ordered tables, bill items, and exact totals", async () => {
    const projection = await getStaffWorkspaceProjection(userId);

    expect(projection).toHaveLength(1);
    expect(projection[0]).toMatchObject({
      role: "STAFF",
      restaurant: {
        tables: [
          {
            name: "Table A",
            currentSession: {
              billItems: [
                {
                  name: "First item",
                  quantity: 2,
                  unitPriceMinor: 1_250,
                  lineTotalMinor: 2_500,
                },
                {
                  name: "Second item",
                  quantity: 3,
                  unitPriceMinor: 200,
                  lineTotalMinor: 600,
                },
              ],
              totalMinor: 3_100,
            },
          },
          {
            name: "Table B",
            currentSession: null,
          },
        ],
      },
    });
  });

  it("returns only active catalog items in deterministic category order", async () => {
    const pizzaCategory = await prisma.catalogCategory.create({
      data: {
        restaurantId,
        key: "pizza",
        name: "Pizza",
        sortOrder: 10,
      },
    });

    const dessertCategory = await prisma.catalogCategory.create({
      data: {
        restaurantId,
        key: "desserts",
        name: "Desserts",
        sortOrder: 30,
      },
    });

    const hiddenCategory = await prisma.catalogCategory.create({
      data: {
        restaurantId,
        key: "hidden",
        name: "Hidden",
        sortOrder: 20,
      },
    });

    await prisma.catalogItem.createMany({
      data: [
        {
          restaurantId,
          categoryId: pizzaCategory.id,
          key: "pepperoni",
          name: "Pepperoni",
          unitPriceMinor: 30_000,
          isActive: true,
          sortOrder: 20,
        },
        {
          restaurantId,
          categoryId: pizzaCategory.id,
          key: "margherita",
          name: "Margherita",
          unitPriceMinor: 25_000,
          isActive: true,
          sortOrder: 10,
        },
        {
          restaurantId,
          categoryId: dessertCategory.id,
          key: "cheesecake",
          name: "Cheesecake",
          unitPriceMinor: 15_000,
          isActive: true,
          sortOrder: 10,
        },
        {
          restaurantId,
          categoryId: dessertCategory.id,
          key: "inactive-dessert",
          name: "Inactive Dessert",
          unitPriceMinor: 10_000,
          isActive: false,
          sortOrder: 5,
        },
        {
          restaurantId,
          categoryId: hiddenCategory.id,
          key: "inactive-hidden-item",
          name: "Inactive Hidden Item",
          unitPriceMinor: 10_000,
          isActive: false,
          sortOrder: 10,
        },
      ],
    });

    const projection = await getStaffWorkspaceProjection(userId);

    expect(projection[0].restaurant.catalogCategories).toMatchObject([
      {
        key: "pizza",
        name: "Pizza",
        items: [
          {
            key: "margherita",
            name: "Margherita",
            unitPriceMinor: 25_000,
          },
          {
            key: "pepperoni",
            name: "Pepperoni",
            unitPriceMinor: 30_000,
          },
        ],
      },
      {
        key: "desserts",
        name: "Desserts",
        items: [
          {
            key: "cheesecake",
            name: "Cheesecake",
            unitPriceMinor: 15_000,
          },
        ],
      },
    ]);

    expect(
      projection[0].restaurant.catalogCategories.some(
        (category) => category.key === "hidden",
      ),
    ).toBe(false);

    expect(
      projection[0].restaurant.catalogCategories
        .flatMap((category) => category.items)
        .some((item) => item.key === "inactive-dessert"),
    ).toBe(false);
  });

  it("does not expose restaurants without a membership", async () => {
    const projection = await getStaffWorkspaceProjection(userId);

    expect(projection).toHaveLength(1);
    expect(projection[0].restaurant.name).toContain("Assigned Restaurant");
    expect(
      projection.some((membership) =>
        membership.restaurant.name.includes("Unassigned Restaurant"),
      ),
    ).toBe(false);
  });

  it("returns an empty projection for a user without memberships", async () => {
    await expect(getStaffWorkspaceProjection(randomUUID())).resolves.toEqual(
      [],
    );
  });

  it("rejects an unsafe stored aggregate total", async () => {
    await prisma.billItem.createMany({
      data: [
        {
          tableSessionId: openTableSessionId,
          name: "Large item one",
          quantity: 2_000_000_000,
          unitPriceMinor: 4_000_000,
        },
        {
          tableSessionId: openTableSessionId,
          name: "Large item two",
          quantity: 2_000_000_000,
          unitPriceMinor: 4_000_000,
        },
      ],
    });

    await expect(getStaffWorkspaceProjection(userId)).rejects.toThrow(
      InvalidMoneyAmountError,
    );
  });
});
