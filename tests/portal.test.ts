import { describe, expect, it } from "vitest";
import { LOCALE_IDS, LOCALES, mergeTracking, nextMilestone, pacificWeek, roomLeftCents, safeMemberNext } from "@/lib/engagement";

describe("safeMemberNext", () => {
  it("keeps relative paths on this site", () => {
    expect(safeMemberNext("/me")).toBe("/me");
    expect(safeMemberNext("/me/preferences?tab=1#sms")).toBe("/me/preferences?tab=1#sms");
    expect(safeMemberNext("/stats", "/")).toBe("/stats");
  });

  it("refuses anything that could leave the site", () => {
    expect(safeMemberNext("//evil.example")).toBe("/me");
    expect(safeMemberNext("https://evil.example/me")).toBe("/me");
    expect(safeMemberNext("/\\evil.example")).toBe("/me");
    expect(safeMemberNext("javascript:alert(1)")).toBe("/me");
    expect(safeMemberNext("me")).toBe("/me");
    expect(safeMemberNext("/me\nSet-Cookie: x")).toBe("/me");
    expect(safeMemberNext("")).toBe("/me");
    expect(safeMemberNext(undefined)).toBe("/me");
    expect(safeMemberNext(42)).toBe("/me");
    expect(safeMemberNext("/" + "a".repeat(600))).toBe("/me");
  });

  it("uses the fallback given", () => {
    expect(safeMemberNext(null, "/")).toBe("/");
  });
});

describe("nextMilestone", () => {
  it("is the goal until the goal is reached", () => {
    expect(nextMilestone(0, 1000)).toBe(1000);
    expect(nextMilestone(999, 1000)).toBe(1000);
  });
  it("then the next multiple of 500 above the count, so the bar never reads done", () => {
    expect(nextMilestone(1000, 1000)).toBe(1500);
    expect(nextMilestone(1200, 1000)).toBe(1500);
    expect(nextMilestone(1500, 1000)).toBe(2000);
    expect(nextMilestone(2501, 2500)).toBe(3000);
  });
  it("works without a goal", () => {
    expect(nextMilestone(0, null)).toBe(500);
    expect(nextMilestone(499, undefined)).toBe(500);
    expect(nextMilestone(500, null)).toBe(1000);
  });
});

describe("pacificWeek", () => {
  it("runs Sunday to Saturday around any day of the week", () => {
    // November 1, 2026 is a Sunday.
    expect(pacificWeek("2026-11-01")).toEqual({ start: "2026-11-01", end: "2026-11-07" });
    expect(pacificWeek("2026-11-04")).toEqual({ start: "2026-11-01", end: "2026-11-07" });
    expect(pacificWeek("2026-11-07")).toEqual({ start: "2026-11-01", end: "2026-11-07" });
    expect(pacificWeek("2026-11-08")).toEqual({ start: "2026-11-08", end: "2026-11-14" });
  });
  it("crosses month and year ends", () => {
    expect(pacificWeek("2027-01-01")).toEqual({ start: "2026-12-27", end: "2027-01-02" });
  });
});

describe("roomLeftCents", () => {
  const LIMIT = 142970;
  it("is the whole limit for someone who has given nothing", () => {
    expect(roomLeftCents("council", { yearToDate: {}, committed: {}, monthIndex: 0 }, LIMIT)).toBe(LIMIT);
  });
  it("is what the donate form would still accept", () => {
    expect(roomLeftCents("council", { yearToDate: { council: 20000 }, committed: {}, monthIndex: 5 }, LIMIT)).toBe(122970);
    expect(roomLeftCents("school_board", { yearToDate: { council: 20000 }, committed: {}, monthIndex: 5 }, LIMIT)).toBe(LIMIT);
  });
  it("counts the rest of the year's monthly payments as already spoken for", () => {
    expect(roomLeftCents("council", { yearToDate: { council: 0 }, committed: { council: 11900 * 11 }, monthIndex: 0 }, LIMIT)).toBe(12070);
  });
  it("never goes below zero", () => {
    expect(roomLeftCents("council", { yearToDate: { council: 150000 }, committed: {}, monthIndex: 11 }, LIMIT)).toBe(0);
  });
});

describe("mergeTracking", () => {
  it("writes what the link carries", () => {
    expect(mergeTracking(null, { ref: "ABCD2345" })).toBe("ref=ABCD2345");
    expect(mergeTracking(null, { source: "flyer-newton" })).toBe("source=flyer-newton");
    expect(mergeTracking(null, { ref: "ABCD2345", source: "whatsapp" })).toBe("ref=ABCD2345&source=whatsapp");
  });
  it("keeps the referral when a later link only carries a source, and vice versa", () => {
    expect(mergeTracking("ref=ABCD2345", { source: "email-nov" })).toBe("ref=ABCD2345&source=email-nov");
    expect(mergeTracking("source=email-nov", { ref: "ABCD2345" })).toBe("ref=ABCD2345&source=email-nov");
    expect(mergeTracking("ref=OLD12345", { ref: "NEW12345" })).toBe("ref=NEW12345");
  });
  it("is stable, so an unchanged cookie is not rewritten", () => {
    expect(mergeTracking("ref=ABCD2345&source=whatsapp", { ref: "ABCD2345", source: "whatsapp" })).toBe("ref=ABCD2345&source=whatsapp");
  });
  it("drops anything that is not a plain tag", () => {
    expect(mergeTracking(null, { ref: "bad;value", source: "<script>" })).toBeNull();
    expect(mergeTracking("ref=ABCD2345", { source: "a b" })).toBe("ref=ABCD2345");
    expect(mergeTracking(null, {})).toBeNull();
  });
});

describe("locales", () => {
  it("offers the six languages, each labelled in its own script", () => {
    expect(LOCALE_IDS).toEqual(["en", "pa", "hi", "zh-Hans", "zh-Hant", "tl"]);
    const labels = Object.fromEntries(LOCALES.map((l) => [l.id, l.label]));
    expect(labels.pa).toBe("ਪੰਜਾਬੀ");
    expect(labels.hi).toBe("हिन्दी");
    expect(labels["zh-Hans"]).toBe("简体中文");
    expect(labels["zh-Hant"]).toBe("繁體中文");
  });
});
