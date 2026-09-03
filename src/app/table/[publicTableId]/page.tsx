import { cookies } from "next/headers";

import { getGuestBillProjection } from "@/lib/guest-session";
import { GUEST_SESSION_COOKIE_NAME } from "@/lib/guest-session-cookie";
import { formatTryAmount } from "@/lib/money";

import { JoinTableForm } from "./join-table-form";

export default async function GuestTablePage({
  params,
}: {
  params: Promise<{ publicTableId: string }>;
}) {
  const { publicTableId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_SESSION_COOKIE_NAME)?.value;

  const bill = token
    ? await getGuestBillProjection({
        publicTableId,
        token,
      })
    : null;

  if (!bill) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <section className="w-full">
          <h1 className="text-2xl font-semibold">Join table</h1>
          <p className="mt-2 text-sm text-gray-600">
            {token
              ? "Your guest access has expired or is unavailable. Enter the current code to join again."
              : "Enter the code shown by the restaurant staff."}
          </p>

          <JoinTableForm publicTableId={publicTableId} />
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{bill.tableName}</h1>
      <p className="mt-2 text-sm text-gray-600">Shared bill</p>

      {bill.items.length === 0 ? (
        <p className="mt-8 text-gray-600">No bill items yet.</p>
      ) : (
        <ul className="mt-8 divide-y">
          {bill.items.map((item, index) => (
            <li
              className="flex justify-between gap-4 py-3"
              key={`${item.name}-${index}`}
            >
              <span>
                {item.quantity} × {item.name}
              </span>
              <span className="shrink-0 text-right">
                {formatTryAmount(item.lineTotalMinor)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-right font-semibold">
        Total: {formatTryAmount(bill.totalMinor)}
      </p>
    </main>
  );
}
