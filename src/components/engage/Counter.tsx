"use client";

import { useEffect, useRef, useState } from "react";
import "./engage.css";

/**
 * A number that counts up once, when it scrolls into view. Renders the final
 * value on the server (so it is right without JavaScript), skips the
 * animation when the person prefers reduced motion, and keeps the digits
 * tabular so the layout doesn't jitter. Assistive technology reads the
 * final value only: the moving digits are hidden from it.
 *
 *   <Counter value={stats.members} />            // "1,234"
 *   <Counter value={stats.members} duration={800} className="display" />
 */
export function Counter({ value, duration = 1200, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || started.current) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined" || value <= 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (started.current || !entries.some((e) => e.isIntersecting)) return;
        started.current = true;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setShown(Math.round(value * eased));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        setShown(0);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={`counter ${className ?? ""}`}>
      <span className="visually-hidden">{value.toLocaleString("en-CA")}</span>
      <span aria-hidden="true">{shown.toLocaleString("en-CA")}</span>
    </span>
  );
}
