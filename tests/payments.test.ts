// The pure rules behind checkout and the limit, and the request plumbing the
// public money routes share. Nothing here touches the database or Stripe.
import { describe, expect, it, vi } from "vitest";
import { allocateRefund, checkAnnualLimit, membershipTerm, recurringStatusFor, remainingMonthlyPayments } from "@/lib/contributions";

vi.mock("server-only", () => ({}));
const { overLimitMessage } = await import("@/lib/server/limits");
const { splitPublicFormExtras } = await import("@/lib/server/payments");
const { NextRequest } = await import("next/server");

const LIMIT = 142970;

describe("remainingMonthlyPayments (what an active monthly gift still reserves)", () => {
  it("counts this month's payment until it has arrived", () => {
    expect(remainingMonthlyPayments(0, false)).toBe(12);
    expect(remainingMonthlyPayments(0, true)).toBe(11);
    expect(remainingMonthlyPayments(10, false)).toBe(2);
    expect(remainingMonthlyPayments(10, true)).toBe(1);
  });
  it("never goes negative in December", () => {
    expect(remainingMonthlyPayments(11, true)).toBe(0);
  });
});

describe("checkAnnualLimit with monthly gifts already running", () => {
  const base = { yearToDate: {}, committed: {}, limitCents: LIMIT, monthIndex: 10 };

  it("refuses a new monthly gift that would not fit beside the active ones for a full year", () => {
    // $119 a month alone fits ($1,428 a year); beside an active $10 a month it would be $1,548.
    expect(checkAnnualLimit({ ...base, frequency: "monthly", slateAmounts: { council: 11900 } }).ok).toBe(true);
    const r = checkAnnualLimit({ ...base, frequency: "monthly", slateAmounts: { council: 11900 }, monthlyActive: { council: 1000 } });
    expect(r).toMatchObject({ ok: false, slate: "council" });
  });

  it("allows a second monthly gift that fits for a full year", () => {
    expect(checkAnnualLimit({ ...base, frequency: "monthly", slateAmounts: { council: 5000 }, monthlyActive: { council: 6000 } }).ok).toBe(true);
    expect(checkAnnualLimit({ ...base, frequency: "monthly", slateAmounts: { council: 6000 }, monthlyActive: { council: 6000 } }).ok).toBe(false);
  });

  it("only counts the active gifts for the same slate", () => {
    expect(checkAnnualLimit({ ...base, frequency: "monthly", slateAmounts: { council: 11900 }, monthlyActive: { school_board: 11900 } }).ok).toBe(true);
  });

  it("does not apply the full-year rule to one-time gifts", () => {
    expect(checkAnnualLimit({ ...base, frequency: "one_time", slateAmounts: { council: 100000 }, monthlyActive: { council: 11900 } }).ok).toBe(true);
  });
});

describe("allocateRefund (reconciling with what Stripe says is refunded)", () => {
  const rows = [
    { id: "sb", slate: "school_board" as const, amountCents: 142970, refundedCents: 0, createdAt: new Date(1) },
    { id: "c", slate: "council" as const, amountCents: 142970, refundedCents: 0, createdAt: new Date(2) },
  ];

  it("takes a partial refund off council first", () => {
    expect(allocateRefund(rows, 50000)).toEqual([{ id: "c", refundedCents: 50000, fullyRefunded: false }]);
  });

  it("fills council then spills into the school board slate", () => {
    expect(allocateRefund(rows, 200000)).toEqual([
      { id: "c", refundedCents: 142970, fullyRefunded: true },
      { id: "sb", refundedCents: 57030, fullyRefunded: false },
    ]);
  });

  it("only adds the difference when some of it is already recorded", () => {
    const partly = [
      { ...rows[1], refundedCents: 50000 },
      { ...rows[0], refundedCents: 0 },
    ];
    expect(allocateRefund(partly, 50000)).toEqual([]);
    expect(allocateRefund(partly, 60000)).toEqual([{ id: "c", refundedCents: 60000, fullyRefunded: false }]);
  });

  it("treats our own pending over-limit refund as already returned", () => {
    const pending = [{ id: "c", slate: "council" as const, amountCents: 1000, refundedCents: 0, refundPendingCents: 1000 }];
    expect(allocateRefund(pending, 1000)).toEqual([]);
  });

  it("marks a row refunded only when nothing of it is left", () => {
    const one = [{ id: "c", slate: "council" as const, amountCents: 5000, refundedCents: 0 }];
    expect(allocateRefund(one, 4999)).toEqual([{ id: "c", refundedCents: 4999, fullyRefunded: false }]);
    expect(allocateRefund(one, 5000)).toEqual([{ id: "c", refundedCents: 5000, fullyRefunded: true }]);
  });

  it("never allocates more than the rows hold, and nothing for a smaller figure than recorded", () => {
    const one = [{ id: "c", slate: "council" as const, amountCents: 5000, refundedCents: 5000 }];
    expect(allocateRefund(one, 9000)).toEqual([]);
    expect(allocateRefund(one, 100)).toEqual([]);
  });
});

describe("recurringStatusFor", () => {
  it("cancels gifts Stripe has stopped collecting on and keeps past_due active", () => {
    expect(recurringStatusFor("canceled")).toBe("cancelled");
    expect(recurringStatusFor("unpaid")).toBe("cancelled");
    expect(recurringStatusFor("paused")).toBe("cancelled");
    expect(recurringStatusFor("past_due")).toBeNull();
    expect(recurringStatusFor("active")).toBe("active");
    expect(recurringStatusFor("something_new")).toBeNull();
  });
});

describe("membershipTerm", () => {
  const now = new Date("2026-11-02T18:00:00Z");

  it("starts a first membership now and runs it for a year", () => {
    expect(membershipTerm(null, now)).toEqual({ startsAt: now, expiresAt: new Date("2027-11-02T18:00:00Z") });
  });

  it("extends an active membership from when it ends, however far off", () => {
    const expiry = new Date("2027-06-01T07:00:00Z");
    expect(membershipTerm(expiry, now)).toEqual({ startsAt: expiry, expiresAt: new Date("2028-06-01T07:00:00Z") });
  });

  it("ignores an expiry already in the past", () => {
    expect(membershipTerm(new Date("2026-01-01T08:00:00Z"), now).startsAt).toEqual(now);
  });
});

describe("overLimitMessage", () => {
  it("names the limit and the slate but never what this person has given", () => {
    expect(overLimitMessage("school_board", LIMIT)).toBe(
      "That would take you over this year's $1,429.70 contribution limit for our school board slate. Try a smaller amount, or email hello@imaginesurrey.ca if you think this is a mistake.",
    );
    expect(overLimitMessage("council", LIMIT)).toContain("for our city council slate.");
  });
});

describe("splitPublicFormExtras", () => {
  const request = (body: unknown) =>
    new NextRequest("http://localhost/api/membership", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.1.2.3" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("lifts source and ref out of the body and leaves the rest for the strict schema", async () => {
    const { request: rest, extras } = await splitPublicFormExtras(request({ email: "a@example.com", source: " flyer ", ref: "abc123", website: "" }));
    expect(extras).toEqual({ source: "flyer", ref: "abc123" });
    expect(await rest.json()).toEqual({ email: "a@example.com", website: "" });
    expect(rest.headers.get("x-forwarded-for")).toBe("10.1.2.3");
    expect(rest.method).toBe("POST");
  });

  it("ignores extras that are the wrong shape", async () => {
    const { request: rest, extras } = await splitPublicFormExtras(request({ email: "a@example.com", source: "x".repeat(41), ref: 12 }));
    expect(extras).toEqual({});
    expect(await rest.json()).toEqual({ email: "a@example.com" });
  });

  it("passes a body that isn't JSON through for the usual error", async () => {
    const { request: rest, extras } = await splitPublicFormExtras(request("not json"));
    expect(extras).toEqual({});
    await expect(rest.json()).rejects.toThrow();
  });
});
