"use client";

import { useActionState } from "react";

import { joinTableAction } from "./actions";
import type { JoinTableState } from "./actions";

const initialJoinTableState: JoinTableState = {
  status: "idle",
};

export function JoinTableForm({ publicTableId }: { publicTableId: string }) {
  const [state, formAction, isPending] = useActionState(
    joinTableAction,
    initialJoinTableState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input name="publicTableId" type="hidden" value={publicTableId} />

      <label className="block">
        <span className="text-sm font-medium">Six-digit join code</span>
        <input
          className="mt-1 w-full rounded border px-3 py-2 font-mono text-xl tracking-widest"
          name="joinCode"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
      </label>

      <button
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        type="submit"
        disabled={isPending}
      >
        {isPending ? "Joining…" : "Join table"}
      </button>

      {state.status === "error" ? (
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
