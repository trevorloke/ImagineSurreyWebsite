"use client";

import { useEffect, useRef } from "react";
import type { ActionState } from "@/lib/server/actions";

/** Shows a server action's result and moves focus to it so it is announced. */
export function Notice({ state }: { state: ActionState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) ref.current?.focus();
  }, [state]);
  if (!state) return null;
  if (state.ok) {
    if (!state.message) return null;
    return (
      <div ref={ref} tabIndex={-1} role="status" className="alert alert--note" style={{ outline: "none" }}>
        <span aria-hidden="true" className="alert-icon">
          ✓
        </span>
        <span>{state.message}</span>
      </div>
    );
  }
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="alert" style={{ outline: "none" }}>
      <span aria-hidden="true" className="alert-icon">
        !
      </span>
      <span>
        {state.error}
        {state.fields && Object.keys(state.fields).length > 0 && (
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {Object.entries(state.fields).map(([field, message]) => (
              <li key={field}>
                <strong>{field}</strong>: {message}
              </li>
            ))}
          </ul>
        )}
      </span>
    </div>
  );
}

/** The error for one field from an action state, for `error={fieldError(state, "title")}`. */
export function fieldError(state: ActionState, name: string): string | undefined {
  return state && !state.ok ? state.fields?.[name] : undefined;
}
