import { addMinorUnits } from "./money";
import { prisma } from "./prisma";

export async function getStaffWorkspaceProjection(userId: string) {
  const memberships = await prisma.restaurantMembership.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
      role: true,
      restaurant: {
        select: {
          name: true,
          tables: {
            select: {
              id: true,
              name: true,
              publicId: true,
              currentSession: {
                select: {
                  billItems: {
                    select: {
                      id: true,
                      name: true,
                      quantity: true,
                      unitPriceMinor: true,
                    },
                    orderBy: {
                      createdAt: "asc",
                    },
                  },
                },
              },
            },
            orderBy: {
              name: "asc",
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return memberships.map((membership) => ({
    id: membership.id,
    role: membership.role,
    restaurant: {
      name: membership.restaurant.name,
      tables: membership.restaurant.tables.map((table) => {
        if (!table.currentSession) {
          return {
            id: table.id,
            name: table.name,
            publicId: table.publicId,
            currentSession: null,
          };
        }

        const billItems = table.currentSession.billItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          lineTotalMinor: item.quantity * item.unitPriceMinor,
        }));

        const totalMinor = billItems.reduce(
          (total, item) => addMinorUnits(total, item.lineTotalMinor),
          0,
        );

        return {
          id: table.id,
          name: table.name,
          publicId: table.publicId,
          currentSession: {
            billItems,
            totalMinor,
          },
        };
      }),
    },
  }));
}

export type StaffWorkspaceProjection = Awaited<
  ReturnType<typeof getStaffWorkspaceProjection>
>;
