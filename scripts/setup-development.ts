import "dotenv/config";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { z } from "zod";

import { parseEnvironment } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";

const setupEnvironmentSchema = z.object({
  DENK_SETUP_ADMIN_NAME: z.string().trim().min(1),
  DENK_SETUP_ADMIN_EMAIL: z.string().email(),
  DENK_SETUP_ADMIN_PASSWORD: z.string().min(8).max(128),
  DENK_SETUP_RESTAURANT_NAME: z.string().trim().min(1),
  DENK_SETUP_TABLE_NAME: z.string().trim().min(1),
});

const environment = parseEnvironment(process.env);
const setupEnvironment = setupEnvironmentSchema.parse(process.env);

if (environment.NODE_ENV === "production") {
  throw new Error("Development setup must not run in production");
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
      email: setupEnvironment.DENK_SETUP_ADMIN_EMAIL,
    },
  });

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    console.log("Development admin user already exists; password unchanged.");
  } else {
    const result = await setupAuth.api.signUpEmail({
      body: {
        name: setupEnvironment.DENK_SETUP_ADMIN_NAME,
        email: setupEnvironment.DENK_SETUP_ADMIN_EMAIL,
        password: setupEnvironment.DENK_SETUP_ADMIN_PASSWORD,
      },
    });

    userId = result.user.id;
    console.log("Created development admin user.");
  }

  let restaurant = await prisma.restaurant.findFirst({
    where: {
      name: setupEnvironment.DENK_SETUP_RESTAURANT_NAME,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name: setupEnvironment.DENK_SETUP_RESTAURANT_NAME,
      },
    });

    console.log("Created development restaurant.");
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

  await prisma.restaurantTable.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: setupEnvironment.DENK_SETUP_TABLE_NAME,
      },
    },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: setupEnvironment.DENK_SETUP_TABLE_NAME,
    },
  });

  console.log("Development setup is ready.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
