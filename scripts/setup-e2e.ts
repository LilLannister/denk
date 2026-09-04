import "dotenv/config";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

import { parseEnvironment } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";
import { stage2Fixture } from "../tests/e2e/stage-2-fixture";

const environment = parseEnvironment(process.env);

if (environment.NODE_ENV === "production") {
  throw new Error("E2E setup must not run in production");
}

const setupAuth = betterAuth({
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    autoSignIn: false,
  },
});

async function main() {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: stage2Fixture.staffEmail,
    },
  });

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const result = await setupAuth.api.signUpEmail({
      body: {
        name: stage2Fixture.staffName,
        email: stage2Fixture.staffEmail,
        password: stage2Fixture.staffPassword,
      },
    });

    userId = result.user.id;
  }

  let restaurant = await prisma.restaurant.findFirst({
    where: {
      name: stage2Fixture.restaurantName,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name: stage2Fixture.restaurantName,
      },
    });
  }

  await prisma.restaurantMembership.upsert({
    where: {
      restaurantId_userId: {
        restaurantId: restaurant.id,
        userId,
      },
    },
    update: {
      role: "ADMIN",
    },
    create: {
      restaurantId: restaurant.id,
      userId,
      role: "ADMIN",
    },
  });

  const restaurantTable = await prisma.restaurantTable.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: stage2Fixture.tableName,
      },
    },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: stage2Fixture.tableName,
    },
  });

  const catalogCategory = await prisma.catalogCategory.upsert({
    where: {
      restaurantId_key: {
        restaurantId: restaurant.id,
        key: stage2Fixture.catalogCategoryKey,
      },
    },
    update: {
      name: stage2Fixture.catalogCategoryName,
      sortOrder: 10,
    },
    create: {
      restaurantId: restaurant.id,
      key: stage2Fixture.catalogCategoryKey,
      name: stage2Fixture.catalogCategoryName,
      sortOrder: 10,
    },
  });

  await prisma.catalogItem.upsert({
    where: {
      restaurantId_key: {
        restaurantId: restaurant.id,
        key: stage2Fixture.catalogItemKey,
      },
    },
    update: {
      categoryId: catalogCategory.id,
      name: stage2Fixture.catalogItemName,
      unitPriceMinor: stage2Fixture.catalogItemPriceMinor,
      isActive: true,
      sortOrder: 10,
    },
    create: {
      restaurantId: restaurant.id,
      categoryId: catalogCategory.id,
      key: stage2Fixture.catalogItemKey,
      name: stage2Fixture.catalogItemName,
      unitPriceMinor: stage2Fixture.catalogItemPriceMinor,
      sortOrder: 10,
    },
  });

  await prisma.tableSession.deleteMany({
    where: {
      restaurantTableId: restaurantTable.id,
    },
  });

  console.log("Stage 2 E2E fixture is ready.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
