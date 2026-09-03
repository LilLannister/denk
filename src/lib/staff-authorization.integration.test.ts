import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "./prisma";
import {
  RestaurantAccessDeniedError,
  requireRestaurantAdmin,
  requireRestaurantMembership,
} from "./staff-authorization";

let userId: string;
let restaurantId: string;
let otherRestaurantId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: "Authorization Test User",
      email: `authorization-${suffix}@denk.test`,
      emailVerified: true,
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Authorized Restaurant ${suffix}`,
    },
  });

  const otherRestaurant = await prisma.restaurant.create({
    data: {
      name: `Other Restaurant ${suffix}`,
    },
  });

  await prisma.restaurantMembership.create({
    data: {
      userId: user.id,
      restaurantId: restaurant.id,
      role: "STAFF",
    },
  });

  userId = user.id;
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

  await prisma.user.delete({
    where: {
      id: userId,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("staff restaurant authorization", () => {
  it("allows a member to access their restaurant", async () => {
    const membership = await requireRestaurantMembership(userId, restaurantId);

    expect(membership.restaurantId).toBe(restaurantId);
    expect(membership.userId).toBe(userId);
  });

  it("rejects access to another restaurant", async () => {
    await expect(
      requireRestaurantMembership(userId, otherRestaurantId),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
  });

  it("rejects STAFF from an ADMIN operation", async () => {
    await expect(
      requireRestaurantAdmin(userId, restaurantId),
    ).rejects.toBeInstanceOf(RestaurantAccessDeniedError);
  });

  it("allows ADMIN to perform an ADMIN operation", async () => {
    await prisma.restaurantMembership.update({
      where: {
        restaurantId_userId: {
          userId,
          restaurantId,
        },
      },
      data: {
        role: "ADMIN",
      },
    });

    const membership = await requireRestaurantAdmin(userId, restaurantId);

    expect(membership.role).toBe("ADMIN");
  });
});
