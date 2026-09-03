"use client";

import { useActionState, useEffect, useRef } from "react";

import { addBillItemAction, type AddBillItemState } from "./actions";

const initialState: AddBillItemState = {
  status: "idle",
};

export function AddBillItemForm({
  restaurantTableId,
}: {
  restaurantTableId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    addBillItemAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-4 space-y-3 rounded border p-4"
    >
      <input name="restaurantTableId" type="hidden" value={restaurantTableId} />

      <div>
        <label
          className="block text-sm"
          htmlFor={`item-name-${restaurantTableId}`}
        >
          Item name
        </label>
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          id={`item-name-${restaurantTableId}`}
          name="name"
          maxLength={120}
          required
        />
      </div>

      <div>
        <label
          className="block text-sm"
          htmlFor={`item-quantity-${restaurantTableId}`}
        >
          Quantity
        </label>
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          id={`item-quantity-${restaurantTableId}`}
          name="quantity"
          type="number"
          min="1"
          step="1"
          defaultValue="1"
          required
        />
      </div>

      <div>
        <label
          className="block text-sm"
          htmlFor={`item-price-${restaurantTableId}`}
        >
          Unit price (TRY)
        </label>
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          id={`item-price-${restaurantTableId}`}
          name="unitPrice"
          type="text"
          inputMode="decimal"
          placeholder="12.50"
          required
        />
      </div>

      <button
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        type="submit"
        disabled={isPending}
      >
        {isPending ? "Adding…" : "Add item"}
      </button>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-sm text-red-700"
              : "text-sm text-green-700"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
