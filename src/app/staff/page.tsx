import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { SignOutButton } from "./sign-out-button";

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
                <li key={table.id}>{table.name}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
