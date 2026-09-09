import { cookies } from "next/headers";

import { getGuestBillProjection } from "@/lib/guest-session";
import { GUEST_SESSION_COOKIE_NAME } from "@/lib/guest-session-cookie";
import { formatTryAmount } from "@/lib/money";

import { JoinTableForm } from "./join-table-form";
import { BillItemAllocationControls } from "./bill-item-allocation-controls";

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
          {bill.items.map((item) => (
            <li className="py-4" key={item.id}>
              <div className="flex justify-between gap-4">
                <span>
                  {item.quantity} × {item.name}
                </span>
                <span className="shrink-0 text-right">
                  {formatTryAmount(item.lineTotalMinor)}
                </span>
              </div>

              <p className="mt-1 text-sm text-gray-600">
                Claimed: {item.claimedQuantity} of {item.quantity}
              </p>

              <BillItemAllocationControls
                availableQuantity={item.availableQuantity}
                billItemId={item.id}
                currentGuestClaimedQuantity={item.currentGuestClaimedQuantity}
                itemName={item.name}
                publicTableId={publicTableId}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 space-y-1 border-t pt-4 text-right">
        <p>Bill total: {formatTryAmount(bill.totalMinor)}</p>
        <p>Claimed: {formatTryAmount(bill.claimedMinor)}</p>
        <p>Remaining: {formatTryAmount(bill.remainingMinor)}</p>
        <p className="text-lg font-semibold">
          Your share: {formatTryAmount(bill.currentGuestPayableMinor)}
        </p>
      </div>
    </main>
  );
}
