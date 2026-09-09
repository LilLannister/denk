"use client";

import { useActionState } from "react";

import {
  claimBillItemAction,
  releaseBillItemAction,
  type BillItemAllocationActionState,
} from "./actions";

const initialState: BillItemAllocationActionState = {
  status: "idle",
};

export function BillItemAllocationControls({
  availableQuantity,
  billItemId,
  currentGuestClaimedQuantity,
  itemName,
  publicTableId,
}: {
  availableQuantity: number;
  billItemId: string;
  currentGuestClaimedQuantity: number;
  itemName: string;
  publicTableId: string;
}) {
  const [claimState, claimAction, isClaiming] = useActionState(
    claimBillItemAction,
    initialState,
  );

  const [releaseState, releaseAction, isReleasing] = useActionState(
    releaseBillItemAction,
    initialState,
  );

  const isPending = isClaiming || isReleasing;

  return (
    <div className="mt-3">
      <p className="text-sm text-gray-600">
        Available: {availableQuantity} · Yours: {currentGuestClaimedQuantity}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <form action={claimAction}>
          <input name="publicTableId" type="hidden" value={publicTableId} />
          <input name="billItemId" type="hidden" value={billItemId} />
          <input name="quantity" type="hidden" value="1" />

          <button
            aria-label={`Claim one ${itemName}`}
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            disabled={isPending || availableQuantity === 0}
            type="submit"
          >
            {isClaiming ? "Claiming…" : "Claim one"}
          </button>
        </form>

        <form action={releaseAction}>
          <input name="publicTableId" type="hidden" value={publicTableId} />
          <input name="billItemId" type="hidden" value={billItemId} />
          <input name="quantity" type="hidden" value="1" />

          <button
            aria-label={`Release one ${itemName}`}
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            disabled={isPending || currentGuestClaimedQuantity === 0}
            type="submit"
          >
            {isReleasing ? "Releasing…" : "Release one"}
          </button>
        </form>
      </div>

      {claimState.message ? (
        <p
          className={
            claimState.status === "error"
              ? "mt-2 text-sm text-red-700"
              : "mt-2 text-sm text-green-700"
          }
          role={claimState.status === "error" ? "alert" : "status"}
        >
          {claimState.message}
        </p>
      ) : null}

      {releaseState.message ? (
        <p
          className={
            releaseState.status === "error"
              ? "mt-2 text-sm text-red-700"
              : "mt-2 text-sm text-green-700"
          }
          role={releaseState.status === "error" ? "alert" : "status"}
        >
          {releaseState.message}
        </p>
      ) : null}
    </div>
  );
}
