import { describe, expect, it } from "vitest";
import { keyDates } from "@/content/tracker";
import { countByStatus, PROMISE_STATUSES } from "@/lib/tracker";

describe("promise tracker", () => {
  it("counts promises by status, every status present", () => {
    const counts = countByStatus(["kept", "kept", "broken", "not_started"]);
    expect(counts.kept).toBe(2);
    expect(counts.broken).toBe(1);
    expect(counts.not_started).toBe(1);
    expect(counts.in_progress).toBe(0);
    expect(Object.keys(counts).sort()).toEqual(PROMISE_STATUSES.map((s) => s.id).sort());
  });
  it("lists the key dates in order", () => {
    const starts = keyDates.map((d) => d.start);
    expect([...starts].sort()).toEqual(starts);
  });
});
