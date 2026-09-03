import { cookies } from "next/headers";

import { getGuestTableAccess } from "@/lib/guest-session";
import { GUEST_SESSION_COOKIE_NAME } from "@/lib/guest-session-cookie";

import { JoinTableForm } from "./join-table-form";
import { formatMinorUnits } from "@/lib/money";

export default async function GuestTablePage({
  params,
}: {
  params: Promise<{ publicTableId: string }>;
}) {
  const { publicTableId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_SESSION_COOKIE_NAME)?.value;

  const access = token
    ? await getGuestTableAccess({
        publicTableId,
        token,
      })
    : null;

  if (!access) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <section className="w-full">
          <h1 className="text-2xl font-semibold">Join table</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter the code shown by the restaurant staff.
          </p>

          <JoinTableForm publicTableId={publicTableId} />
        </section>
      </main>
    );
  }

  const billItems = access.tableSession.billItems;
  const totalMinor = billItems.reduce(
    (total, item) => total + item.quantity * item.unitPriceMinor,
    0,
  );

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold">
        {access.tableSession.restaurantTable.name}
      </h1>
      <p className="mt-2 text-sm text-gray-600">Shared bill</p>

      {billItems.length === 0 ? (
        <p className="mt-8 text-gray-600">No bill items yet.</p>
      ) : (
        <ul className="mt-8 divide-y">
          {billItems.map((item) => (
            <li className="flex justify-between gap-4 py-3" key={item.id}>
              <span>
                {item.quantity} × {item.name}
              </span>
              <span className="shrink-0 text-right">
                {formatMinorUnits(item.quantity * item.unitPriceMinor)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-right font-semibold">
        Total: {formatMinorUnits(totalMinor)}
      </p>
    </main>
  );
}
