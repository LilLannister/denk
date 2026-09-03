"use client";

import { useActionState } from "react";

import {
  openTableSessionAction,
  rotateTableSessionJoinCodeAction,
} from "./actions";
import type { OpenTableSessionState } from "./actions";

const initialState: OpenTableSessionState = {
  status: "idle",
};

function JoinCodeResult({ state }: { state: OpenTableSessionState }) {
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

export function OpenTableSessionForm({
  restaurantTableId,
  hasOpenSession,
}: {
  restaurantTableId: string;
  hasOpenSession: boolean;
}) {
  const [openState, openAction, isOpening] = useActionState(
    openTableSessionAction,
    initialState,
  );

  const [rotateState, rotateAction, isRotating] = useActionState(
    rotateTableSessionJoinCodeAction,
    initialState,
  );

  if (openState.status === "success") {
    return <JoinCodeResult state={openState} />;
  }

  if (rotateState.status === "success") {
    return <JoinCodeResult state={rotateState} />;
  }

  if (hasOpenSession) {
    return (
      <div className="mt-2">
        <p className="text-sm text-gray-600">Session open</p>

        <form action={rotateAction} className="mt-2">
          <input
            name="restaurantTableId"
            type="hidden"
            value={restaurantTableId}
          />

          <button
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            type="submit"
            disabled={isRotating}
          >
            {isRotating ? "Generating…" : "Generate new join code"}
          </button>

          {rotateState.status === "error" ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {rotateState.message}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <form action={openAction} className="mt-2">
      <input name="restaurantTableId" type="hidden" value={restaurantTableId} />

      <button
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        type="submit"
        disabled={isOpening}
      >
        {isOpening ? "Opening…" : "Open bill"}
      </button>

      {openState.status === "error" ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {openState.message}
        </p>
      ) : null}
    </form>
  );
}
