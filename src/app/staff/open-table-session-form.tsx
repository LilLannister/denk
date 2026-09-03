"use client";

import { useActionState } from "react";

import { openTableSessionAction } from "./actions";
import type { OpenTableSessionState } from "./actions";

const initialOpenTableSessionState: OpenTableSessionState = {
  status: "idle",
};

export function OpenTableSessionForm({
  restaurantTableId,
  hasOpenSession,
}: {
  restaurantTableId: string;
  hasOpenSession: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    openTableSessionAction,
    initialOpenTableSessionState,
  );

  if (state.status === "success") {
    return (
      <div className="mt-2" aria-live="polite">
        <p className="text-sm text-green-700">{state.message}</p>
        <p className="mt-1 font-mono text-2xl tracking-widest">
          {state.joinCode}
        </p>
        <p className="mt-1 text-xs text-gray-600">
          Save this code now. It is not stored in readable form.
        </p>
      </div>
    );
  }

  if (hasOpenSession) {
    return <p className="mt-2 text-sm text-gray-600">Session open</p>;
  }

  return (
    <form action={formAction} className="mt-2">
      <input name="restaurantTableId" type="hidden" value={restaurantTableId} />

      <button
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        type="submit"
        disabled={isPending}
      >
        {isPending ? "Opening…" : "Open bill"}
      </button>

      {state.status === "error" ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
