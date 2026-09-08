"use client";

import { useActionState } from "react";

import {
  closeTableSessionAction,
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

  const [closeState, closeAction, isClosing] = useActionState(
    closeTableSessionAction,
    initialState,
  );

  if (hasOpenSession) {
    return (
      <div className="mt-2">
        {openState.status === "success" ? (
          <JoinCodeResult state={openState} />
        ) : null}

        {rotateState.status === "success" ? (
          <JoinCodeResult state={rotateState} />
        ) : null}

        {openState.status !== "success" && rotateState.status !== "success" ? (
          <p className="text-sm text-gray-600">Session open</p>
        ) : null}

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
        <form
          action={closeAction}
          className="mt-2"
          onSubmit={(event) => {
            if (
              !window.confirm(
                "Close this bill? Guests will immediately lose access.",
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

          <button
            className="rounded border border-red-700 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
            type="submit"
            disabled={isClosing}
          >
            {isClosing ? "Closing…" : "Close bill"}
          </button>

          {closeState.status === "error" ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {closeState.message}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {closeState.status === "success" ? (
        <p className="mb-2 text-sm text-green-700" role="status">
          {closeState.message}
        </p>
      ) : null}

      <form action={openAction}>
        <input
          name="restaurantTableId"
          type="hidden"
          value={restaurantTableId}
        />

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
    </div>
  );
}
