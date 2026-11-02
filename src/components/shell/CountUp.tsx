"use client";

import { useEffect, useRef, useState } from "react";

const format = (n: number) => n.toLocaleString("en-CA");

/**
 * A number that counts up once, the first time it scrolls into view. The
 * server renders the final value (so it reads correctly without scripts) and
 * screen readers only ever get the final value; under reduced motion it never
 * animates.
 */
export function CountUp({ value, durationMs = 1200, className }: { value: number; durationMs?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") return;
    let frame = 0;
    setShown(0);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          // Ease out so the last digits settle gently.
          setShown(Math.round(value * (1 - (1 - t) ** 3)));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      setShown(value);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className={["countup", className].filter(Boolean).join(" ")} data-value={value}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="visually-hidden">{format(value)}</span>
    </span>
  );
}
