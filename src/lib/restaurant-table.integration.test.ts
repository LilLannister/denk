import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "./prisma";
import {
  InvalidRestaurantTableError,
  ManagedRestaurantTableNotFoundError,
  RestaurantTableHasOpenSessionError,
  RestaurantTableNameConflictError,
  createRestaurantTable,
  renameRestaurantTable,
  setRestaurantTableActive,
} from "./restaurant-table";
import { RestaurantAccessDeniedError } from "./staff-authorization";
import {
  RestaurantTableInactiveError,
  closeTableSession,
  openTableSession,
} from "./table-session";

let adminUserId: string;
let staffUserId: string;
let otherAdminUserId: string;
let restaurantId: string;
let otherRestaurantId: string;
let restaurantTableId: string;
let secondRestaurantTableId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const [adminUser, staffUser, otherAdminUser] = await Promise.all([
    prisma.user.create({
      data: {
        id: randomUUID(),
        name: "Table Admin",
        email: `table-admin-${suffix}@denk.test`,
        emailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        id: randomUUID(),
        name: "Table Staff",
        email: `table-staff-${suffix}@denk.test`,
        emailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        id: randomUUID(),
        name: "Other Table Admin",
        email: `other-table-admin-${suffix}@denk.test`,
        emailVerified: true,
      },
    }),
  ]);

  const [restaurant, otherRestaurant] = await Promise.all([
    prisma.restaurant.create({
      data: {
        name: `Table Management Restaurant ${suffix}`,
        tables: {
          create: [
            {
              name: `Table A ${suffix}`,
            },
            {
              name: `Table B ${suffix}`,
            },
          ],
        },
      },
      include: {
        tables: {
          orderBy: {
            name: "asc",
          },
        },
      },
    }),
    prisma.restaurant.create({
      data: {
        name: `Other Table Management Restaurant ${suffix}`,
      },
    }),
  ]);

  await prisma.restaurantMembership.createMany({
    data: [
      {
        userId: adminUser.id,
        restaurantId: restaurant.id,
        role: "ADMIN",
      },
      {
        userId: staffUser.id,
        restaurantId: restaurant.id,
        role: "STAFF",
      },
      {
        userId: otherAdminUser.id,
        restaurantId: otherRestaurant.id,
        role: "ADMIN",
      },
    ],
  });

  adminUserId = adminUser.id;
  staffUserId = staffUser.id;
  otherAdminUserId = otherAdminUser.id;
  restaurantId = restaurant.id;
  otherRestaurantId = otherRestaurant.id;
  restaurantTableId = restaurant.tables[0].id;
  secondRestaurantTableId = restaurant.tables[1].id;
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
        in: [adminUserId, staffUserId, otherAdminUserId],
      },
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("creating restaurant tables", () => {
  it("allows Admin to create an active table with a stable public identity", async () => {
    const table = await createRestaurantTable({
      userId: adminUserId,
      restaurantId,
      name: "  Patio  ",
    });

    expect(table).toMatchObject({
      restaurantId,
      name: "Patio",
      isActive: true,
    });
    expect(table.publicId).not.toBe("");
  });

  it("rejects Staff from creating a table", async () => {
    await expect(
      createRestaurantTable({
        userId: staffUserId,
        restaurantId,
        name: "Patio",
      }),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
  });

  it("rejects an Admin from another restaurant", async () => {
    await expect(
      createRestaurantTable({
        userId: otherAdminUserId,
        restaurantId,
        name: "Patio",
      }),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
  });

  it("rejects a duplicate table name within the restaurant", async () => {
    const existingTable = await prisma.restaurantTable.findUniqueOrThrow({
      where: {
        id: restaurantTableId,
      },
    });

    await expect(
      createRestaurantTable({
        userId: adminUserId,
        restaurantId,
        name: existingTable.name,
      }),
    ).rejects.toBeInstanceOf(RestaurantTableNameConflictError);
  });

  it.each(["", "   ", "x".repeat(121)])(
    "rejects invalid table name %j",
    async (name) => {
      await expect(
        createRestaurantTable({
          userId: adminUserId,
          restaurantId,
          name,
        }),
      ).rejects.toBeInstanceOf(InvalidRestaurantTableError);
    },
  );

  it("enforces the trimmed-name rule in PostgreSQL", async () => {
    await expect(
      prisma.restaurantTable.create({
        data: {
          restaurantId,
          name: " Untrimmed table ",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("renaming restaurant tables", () => {
  it("renames a table without changing its identity or public ID", async () => {
    const originalTable = await prisma.restaurantTable.findUniqueOrThrow({
      where: {
        id: restaurantTableId,
      },
    });

    const renamedTable = await renameRestaurantTable({
      userId: adminUserId,
      restaurantTableId,
      name: "  Main dining room  ",
    });

    expect(renamedTable).toMatchObject({
      id: originalTable.id,
      publicId: originalTable.publicId,
      restaurantId,
      name: "Main dining room",
      isActive: true,
    });
  });

  it("rejects Staff from renaming a table", async () => {
    await expect(
      renameRestaurantTable({
        userId: staffUserId,
        restaurantTableId,
        name: "Renamed table",
      }),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
  });

  it("rejects an Admin from another restaurant", async () => {
    await expect(
      renameRestaurantTable({
        userId: otherAdminUserId,
        restaurantTableId,
        name: "Renamed table",
      }),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
  });

  it("rejects an unknown table", async () => {
    await expect(
      renameRestaurantTable({
        userId: adminUserId,
        restaurantTableId: randomUUID(),
        name: "Renamed table",
      }),
    ).rejects.toBeInstanceOf(ManagedRestaurantTableNotFoundError);
  });

  it("rejects a duplicate name within the restaurant", async () => {
    const secondTable = await prisma.restaurantTable.findUniqueOrThrow({
      where: {
        id: secondRestaurantTableId,
      },
    });

    await expect(
      renameRestaurantTable({
        userId: adminUserId,
        restaurantTableId,
        name: secondTable.name,
      }),
    ).rejects.toBeInstanceOf(RestaurantTableNameConflictError);
  });
});

describe("changing restaurant table activation", () => {
  it("deactivates and reactivates a table without changing its identity", async () => {
    const originalTable = await prisma.restaurantTable.findUniqueOrThrow({
      where: {
        id: restaurantTableId,
      },
    });

    const inactiveTable = await setRestaurantTableActive({
      userId: adminUserId,
      restaurantTableId,
      isActive: false,
    });

    expect(inactiveTable).toMatchObject({
      id: originalTable.id,
      publicId: originalTable.publicId,
      isActive: false,
    });

    const reactivatedTable = await setRestaurantTableActive({
      userId: adminUserId,
      restaurantTableId,
      isActive: true,
    });

    expect(reactivatedTable).toMatchObject({
      id: originalTable.id,
      publicId: originalTable.publicId,
      isActive: true,
    });
  });

  it("treats repeated activation changes as idempotent", async () => {
    const firstResult = await setRestaurantTableActive({
      userId: adminUserId,
      restaurantTableId,
      isActive: true,
    });

    const secondResult = await setRestaurantTableActive({
      userId: adminUserId,
      restaurantTableId,
      isActive: true,
    });

    expect(secondResult).toMatchObject({
      id: firstResult.id,
      publicId: firstResult.publicId,
      isActive: true,
    });
  });

  it("rejects Staff from changing activation", async () => {
    await expect(
      setRestaurantTableActive({
        userId: staffUserId,
        restaurantTableId,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
  });

  it("rejects an Admin from another restaurant", async () => {
    await expect(
      setRestaurantTableActive({
        userId: otherAdminUserId,
        restaurantTableId,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
  });

  it("rejects deactivation while a session is open", async () => {
    await openTableSession({
      userId: staffUserId,
      restaurantTableId,
    });

    await expect(
      setRestaurantTableActive({
        userId: adminUserId,
        restaurantTableId,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(RestaurantTableHasOpenSessionError);

    await expect(
      prisma.restaurantTable.findUniqueOrThrow({
        where: {
          id: restaurantTableId,
        },
      }),
    ).resolves.toMatchObject({
      isActive: true,
    });
  });

  it("retains closed session history across deactivation and reactivation", async () => {
    const openedSession = await openTableSession({
      userId: staffUserId,
      restaurantTableId,
    });

    await closeTableSession({
      userId: staffUserId,
      restaurantTableId,
    });

    await setRestaurantTableActive({
      userId: adminUserId,
      restaurantTableId,
      isActive: false,
    });

    await setRestaurantTableActive({
      userId: adminUserId,
      restaurantTableId,
      isActive: true,
    });

    await expect(
      prisma.tableSession.findUnique({
        where: {
          id: openedSession.tableSession.id,
        },
      }),
    ).resolves.toMatchObject({
      restaurantTableId,
      closedAt: expect.any(Date),
    });
  });

  it("serializes simultaneous session opening and deactivation", async () => {
    const results = await Promise.allSettled([
      openTableSession({
        userId: staffUserId,
        restaurantTableId,
      }),
      setRestaurantTableActive({
        userId: adminUserId,
        restaurantTableId,
        isActive: false,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    const rejectedResults = results.filter(
      (result) => result.status === "rejected",
    );

    expect(rejectedResults).toHaveLength(1);

    if (rejectedResults[0]?.status === "rejected") {
      expect(
        rejectedResults[0].reason instanceof RestaurantTableInactiveError ||
          rejectedResults[0].reason instanceof
            RestaurantTableHasOpenSessionError,
      ).toBe(true);
    }

    const [table, openSessionCount] = await Promise.all([
      prisma.restaurantTable.findUniqueOrThrow({
        where: {
          id: restaurantTableId,
        },
      }),
      prisma.tableSession.count({
        where: {
          restaurantTableId,
          closedAt: null,
        },
      }),
    ]);

    if (table.isActive) {
      expect(openSessionCount).toBe(1);
    } else {
      expect(openSessionCount).toBe(0);
    }
  });
});
