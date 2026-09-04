"use client";

import { useActionState, useEffect, useRef } from "react";

import { formatTryAmount } from "@/lib/money";
import type { StaffCatalogCategory } from "@/lib/staff-workspace";

import { addBillItemAction, type AddBillItemState } from "./actions";

const initialState: AddBillItemState = {
  status: "idle",
};

export function AddBillItemForm({
  catalogCategories,
  restaurantTableId,
}: {
  catalogCategories: StaffCatalogCategory[];
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
          htmlFor={`catalog-item-${restaurantTableId}`}
        >
          Catalog item
        </label>
        <select
          className="mt-1 w-full rounded border px-3 py-2"
          id={`catalog-item-${restaurantTableId}`}
          name="catalogItemId"
          required
        >
          {catalogCategories.map((category) => (
            <optgroup key={category.key} label={category.name}>
              {category.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {formatTryAmount(item.unitPriceMinor)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
