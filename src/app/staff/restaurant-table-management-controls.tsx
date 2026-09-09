"use client";

import { useActionState } from "react";

import {
  renameRestaurantTableAction,
  setRestaurantTableActiveAction,
  type RestaurantTableManagementState,
} from "./actions";

const initialState: RestaurantTableManagementState = {
  status: "idle",
};

export function RestaurantTableManagementControls({
  isActive,
  restaurantTableId,
  tableName,
}: {
  isActive: boolean;
  restaurantTableId: string;
  tableName: string;
}) {
  const [renameState, renameAction, isRenaming] = useActionState(
    renameRestaurantTableAction,
    initialState,
  );
  const [activationState, activationAction, isChangingActivation] =
    useActionState(setRestaurantTableActiveAction, initialState);

  const isPending = isRenaming || isChangingActivation;

  return (
    <div className="mt-3 space-y-2 rounded border p-3">
      <form action={renameAction} className="flex flex-wrap items-end gap-2">
        <input
          name="restaurantTableId"
          type="hidden"
          value={restaurantTableId}
        />

        <div className="min-w-48 flex-1">
          <label
            className="block text-xs"
            htmlFor={`table-name-${restaurantTableId}`}
          >
            Table name
          </label>
          <input
            key={tableName}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            defaultValue={tableName}
            id={`table-name-${restaurantTableId}`}
            maxLength={120}
            name="name"
            required
            type="text"
          />
        </div>

        <button
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={isPending}
          type="submit"
        >
          {isRenaming ? "Renaming…" : "Rename table"}
        </button>
      </form>

      <form
        action={activationAction}
        onSubmit={(event) => {
          if (
            isActive &&
            !window.confirm(
              `Deactivate ${tableName}? It cannot open bills until reactivated.`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input
          name="restaurantTableId"
          type="hidden"
          value={restaurantTableId}
        />
        <input name="isActive" type="hidden" value={String(!isActive)} />

        <button
          className={
            isActive
              ? "rounded border px-3 py-1 text-sm text-red-700 disabled:opacity-50"
              : "rounded border px-3 py-1 text-sm disabled:opacity-50"
          }
          disabled={isPending}
          type="submit"
        >
          {isChangingActivation
            ? "Updating status…"
            : isActive
              ? "Deactivate table"
              : "Reactivate table"}
        </button>
      </form>

      {renameState.message ? (
        <p
          className={
            renameState.status === "error"
              ? "text-sm text-red-700"
              : "text-sm text-green-700"
          }
          role={renameState.status === "error" ? "alert" : "status"}
        >
          {renameState.message}
        </p>
      ) : null}

      {activationState.message ? (
        <p
          className={
            activationState.status === "error"
              ? "text-sm text-red-700"
              : "text-sm text-green-700"
          }
          role={activationState.status === "error" ? "alert" : "status"}
        >
          {activationState.message}
        </p>
      ) : null}
    </div>
  );
}
