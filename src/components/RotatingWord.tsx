"use client";

import { useEffect, useState } from "react";

export function RotatingWord({ words, intervalMs = 2600 }: { words: string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((i) => i + 1), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  const word = words[index % words.length];
  // The key remounts the span so the fade-in replays for each word.
  return (
    <span key={index} className="hero-word" aria-live="off">
      {word}
    </span>
  );
}
