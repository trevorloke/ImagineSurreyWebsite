import { describe, expect, it } from "vitest";
import { keyDates } from "@/content/tracker";
import { seedAnnouncements, seedPromises, seedTests } from "@/content/tracker-seed";
import { countByStatus } from "@/lib/tracker";

describe("promise tracker seed", () => {
  it("has the 26 promises, numbered 1 to 26", () => {
    expect(seedPromises.map((p) => p.number)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });
  it("cites a linked source for every promise", () => {
    for (const p of seedPromises) {
      expect(p.sources.length, `promise ${p.number}`).toBeGreaterThan(0);
      for (const s of p.sources) expect(s.url, `promise ${p.number}: ${s.label}`).toMatch(/^https:\/\//);
    }
  });
  it("gives each delivery test to existing promises, at most once each", () => {
    const covered = seedTests.flatMap((t) => t.promises);
    expect(new Set(covered).size).toBe(covered.length);
    for (const n of covered) expect(n).toBeGreaterThanOrEqual(1);
    expect(covered.length).toBe(18);
  });
  it("lists the eight announcements newest first", () => {
    expect(seedAnnouncements).toHaveLength(8);
    const dates = seedAnnouncements.map((a) => a.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
  it("keeps key dates in order, with one hard deadline", () => {
    const starts = keyDates.map((d) => d.start);
    expect([...starts].sort()).toEqual(starts);
    expect(keyDates.filter((d) => d.hard)).toHaveLength(1);
  });
});

describe("countByStatus", () => {
  it("counts every status, including zeros", () => {
    expect(countByStatus(["kept", "broken", "kept"])).toEqual({ not_started: 0, in_progress: 0, partly_kept: 0, kept: 2, broken: 1 });
  });
});
