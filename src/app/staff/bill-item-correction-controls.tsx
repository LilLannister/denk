"use client";

import { useActionState } from "react";

import {
  removeBillItemAction,
  updateBillItemQuantityAction,
  type BillItemCorrectionState,
} from "./actions";

const initialState: BillItemCorrectionState = {
  status: "idle",
};

export function BillItemCorrectionControls({
  billItemId,
  itemName,
  quantity,
  restaurantTableId,
}: {
  billItemId: string;
  itemName: string;
  quantity: number;
  restaurantTableId: string;
}) {
  const [updateState, updateAction, isUpdating] = useActionState(
    updateBillItemQuantityAction,
    initialState,
  );
  const [removeState, removeAction, isRemoving] = useActionState(
    removeBillItemAction,
    initialState,
  );

  const isPending = isUpdating || isRemoving;

  return (
    <div className="mt-2 space-y-2">
      <form action={updateAction} className="flex flex-wrap items-end gap-2">
        <input
          name="restaurantTableId"
          type="hidden"
          value={restaurantTableId}
        />
        <input name="billItemId" type="hidden" value={billItemId} />

        <div>
          <label
            className="block text-xs"
            htmlFor={`bill-item-quantity-${billItemId}`}
          >
            Quantity for {itemName}
          </label>
          <input
            key={quantity}
            className="mt-1 w-24 rounded border px-2 py-1 text-sm"
            defaultValue={quantity}
            id={`bill-item-quantity-${billItemId}`}
            max="2147483647"
            min="1"
            name="quantity"
            required
            step="1"
            type="number"
          />
        </div>

        <button
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={isPending}
          type="submit"
        >
          {isUpdating ? "Updating…" : "Update quantity"}
        </button>
      </form>

      <form
        action={removeAction}
        onSubmit={(event) => {
          if (!window.confirm(`Remove ${itemName} from this bill?`)) {
            event.preventDefault();
          }
        }}
      >
        <input
          name="restaurantTableId"
          type="hidden"
          value={restaurantTableId}
        />
        <input name="billItemId" type="hidden" value={billItemId} />

        <button
          className="rounded border px-3 py-1 text-sm text-red-700 disabled:opacity-50"
          disabled={isPending}
          type="submit"
        >
          {isRemoving ? "Removing…" : "Remove item"}
        </button>
      </form>

      {updateState.message ? (
        <p
          className={
            updateState.status === "error"
              ? "text-sm text-red-700"
              : "text-sm text-green-700"
          }
          role={updateState.status === "error" ? "alert" : "status"}
        >
          {updateState.message}
        </p>
      ) : null}

      {removeState.message ? (
        <p
          className={
            removeState.status === "error"
              ? "text-sm text-red-700"
              : "text-sm text-green-700"
          }
          role={removeState.status === "error" ? "alert" : "status"}
        >
          {removeState.message}
        </p>
      ) : null}
    </div>
  );
}
