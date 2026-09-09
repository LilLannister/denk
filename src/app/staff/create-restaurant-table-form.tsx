"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createRestaurantTableAction,
  type RestaurantTableManagementState,
} from "./actions";

const initialState: RestaurantTableManagementState = {
  status: "idle",
};

export function CreateRestaurantTableForm({
  restaurantId,
}: {
  restaurantId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    createRestaurantTableAction,
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
      className="mt-4 space-y-2 rounded border p-4"
    >
      <input name="restaurantId" type="hidden" value={restaurantId} />

      <div>
        <label
          className="block text-sm"
          htmlFor={`new-table-name-${restaurantId}`}
        >
          New table name
        </label>
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          id={`new-table-name-${restaurantId}`}
          maxLength={120}
          name="name"
          required
          type="text"
        />
      </div>

      <button
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Creating…" : "Create table"}
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
