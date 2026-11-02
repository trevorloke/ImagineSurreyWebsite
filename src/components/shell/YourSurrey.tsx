"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AREA_COOKIE, AREA_STORAGE_KEY, areaCookieString, areaForPostalCode, type Area } from "./area";

/**
 * "Your area ▾": a postal code picks the visitor's town centre, which is kept
 * in a cookie (and localStorage) so the home page can show what's near them.
 * Nothing is sent anywhere: the postal code never leaves the browser.
 */
export function YourSurrey({ current }: { current: Area | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [postal, setPostal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const panelId = `${id}-panel`;
  const inputId = `${id}-postal`;
  const errorId = `${id}-error`;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
    toggleRef.current?.focus();
  }

  function save(area: Area | null) {
    try {
      if (area) localStorage.setItem(AREA_STORAGE_KEY, area);
      else localStorage.removeItem(AREA_STORAGE_KEY);
    } catch {
      // Storage can be blocked; the cookie is what the page reads.
    }
    document.cookie = area ? areaCookieString(area) : `${AREA_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    setOpen(false);
    setPostal("");
    // Back on the chip, which now names the area, so focus isn't lost with the panel.
    toggleRef.current?.focus();
    startTransition(() => router.refresh());
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = areaForPostalCode(postal);
    if (!result.ok) {
      setError(result.message);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    save(result.area);
  }

  return (
    <div className="your-surrey">
      <button
        ref={toggleRef}
        type="button"
        className="area-chip"
        aria-expanded={open}
        aria-controls={panelId}
        aria-busy={pending || undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        {current ? (
          <span>
            Your area: <strong>{current}</strong>
          </span>
        ) : (
          <span>Your area</span>
        )}
        <span aria-hidden="true" className="area-chip-caret">
          ▾
        </span>
      </button>
      <div id={panelId} className="area-panel" hidden={!open} onKeyDown={(e) => e.key === "Escape" && close()}>
        <form onSubmit={onSubmit} noValidate className="area-form">
          <label htmlFor={inputId} className="field-label">
            Your postal code
          </label>
          <div className="area-row">
            <input
              ref={inputRef}
              id={inputId}
              name="postalCode"
              className="input"
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              autoComplete="postal-code"
              inputMode="text"
              maxLength={7}
              placeholder="V3W 1A1"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : `${id}-hint`}
            />
            <button type="submit" className="btn btn--navy">
              Show my area
            </button>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="field-error">
              {error}
            </p>
          ) : (
            <p id={`${id}-hint`} className="hint">
              Stays in this browser. We only use it to pick your town centre.
            </p>
          )}
          {current && (
            <button type="button" className="link-button" onClick={() => save(null)}>
              Forget my area
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
