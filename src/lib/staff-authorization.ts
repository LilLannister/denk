import { prisma } from "./prisma";

export class RestaurantAccessDeniedError extends Error {
  constructor() {
    super("Restaurant access denied");
    this.name = "RestaurantAccessDeniedError";
  }
}

export async function requireRestaurantMembership(
  userId: string,
  restaurantId: string,
) {
  const membership = await prisma.restaurantMembership.findUnique({
    where: {
      restaurantId_userId: {
        restaurantId,
        userId,
      },
    },
    include: {
      restaurant: true,
    },
  });

  if (!membership) {
    throw new RestaurantAccessDeniedError();
  }

  return membership;
}

export async function requireRestaurantAdmin(
  userId: string,
  restaurantId: string,
) {
  const membership = await requireRestaurantMembership(userId, restaurantId);

  if (membership.role !== "ADMIN") {
    throw new RestaurantAccessDeniedError();
  }

  return membership;
}
