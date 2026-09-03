import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { SignOutButton } from "./sign-out-button";
import { OpenTableSessionForm } from "./open-table-session-form";

import { formatMinorUnits } from "@/lib/money";

import { AddBillItemForm } from "./add-bill-item-form";

export default async function StaffPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/staff/sign-in");
  }

  const memberships = await prisma.restaurantMembership.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      restaurant: {
        include: {
          tables: {
            include: {
              currentSession: {
                include: {
                  billItems: {
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

  if (memberships.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Access unavailable</h1>
        <p className="mt-2 text-gray-600">
          Your account is not assigned to a restaurant.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Staff workspace</h1>
      <p className="mt-2 text-gray-600">Signed in as {session.user.email}</p>

      <div className="mt-4">
        <SignOutButton />
      </div>

      <div className="mt-8 space-y-6">
        {memberships.map((membership) => (
          <section className="rounded-lg border p-5" key={membership.id}>
            <h2 className="text-xl font-medium">
              {membership.restaurant.name}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Role: {membership.role}
            </p>

            <h3 className="mt-5 font-medium">Tables</h3>
            <ul className="mt-2 list-inside list-disc">
              {membership.restaurant.tables.map((table) => (
                <li className="py-2" key={table.id}>
                  <span>{table.name}</span>
                  <a
                    aria-label={`Open guest page for ${table.name}`}
                    className="ml-3 text-sm underline"
                    href={`/table/${table.publicId}`}
                  >
                    Guest table page
                  </a>
                  <OpenTableSessionForm
                    restaurantTableId={table.id}
                    hasOpenSession={Boolean(table.currentSession)}
                  />
                  {table.currentSession ? (
                    <div className="mt-4">
                      <h4 className="font-medium">Current bill</h4>

                      {table.currentSession.billItems.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-600">
                          No bill items yet.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {table.currentSession.billItems.map((item) => (
                            <li className="text-sm" key={item.id}>
                              {item.quantity} × {item.name} at{" "}
                              {formatMinorUnits(item.unitPriceMinor)}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="mt-3 font-medium">
                        Total:{" "}
                        {formatMinorUnits(
                          table.currentSession.billItems.reduce(
                            (total, item) =>
                              total + item.quantity * item.unitPriceMinor,
                            0,
                          ),
                        )}
                      </p>

                      <AddBillItemForm restaurantTableId={table.id} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
