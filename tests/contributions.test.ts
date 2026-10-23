import { describe, expect, it } from "vitest";
import { checkAnnualLimit, excessOverLimit, pacificYearMonth, slateAmountsFor, starClubCents } from "@/lib/contributions";
import { formatCents } from "@/lib/money";

const LIMIT = 142970;

describe("formatCents", () => {
  it("drops cents on whole dollars and groups thousands", () => {
    expect(formatCents(5000)).toBe("$50");
    expect(formatCents(142970)).toBe("$1,429.70");
    expect(formatCents(285940)).toBe("$2,859.40");
    expect(formatCents(11900)).toBe("$119");
  });
});

describe("Star and Superstar clubs", () => {
  it("matches the design's amounts", () => {
    expect(starClubCents("one_time", LIMIT)).toBe(142970);
    expect(starClubCents("monthly", LIMIT)).toBe(11900);
  });
  it("splits Superstar across both slates", () => {
    expect(slateAmountsFor("superstar", "one_time", 0, LIMIT)).toEqual({ council: 142970, school_board: 142970 });
    expect(slateAmountsFor("star", "monthly", 0, LIMIT)).toEqual({ council: 11900 });
    expect(slateAmountsFor("standard", "one_time", 2500, LIMIT)).toEqual({ council: 2500 });
  });
});

describe("checkAnnualLimit", () => {
  const base = { yearToDate: {}, committed: {}, limitCents: LIMIT, monthIndex: 0 };

  it("allows the Star Club maximum for a new donor", () => {
    expect(checkAnnualLimit({ ...base, frequency: "one_time", slateAmounts: { council: LIMIT } }).ok).toBe(true);
  });

  it("refuses a gift that would cross the limit and says how much is left", () => {
    const r = checkAnnualLimit({ ...base, frequency: "one_time", slateAmounts: { council: 50000 }, yearToDate: { council: 100000 } });
    expect(r).toEqual({ ok: false, slate: "council", remainingCents: 42970 });
  });

  it("counts the rest of the year's payments for a monthly gift", () => {
    // In July there are six payments left: 6 × $119 = $714 fits beside $700.
    expect(checkAnnualLimit({ ...base, monthIndex: 6, frequency: "monthly", slateAmounts: { council: 11900 }, yearToDate: { council: 70000 } }).ok).toBe(true);
    // …but not beside $800.
    expect(checkAnnualLimit({ ...base, monthIndex: 6, frequency: "monthly", slateAmounts: { council: 11900 }, yearToDate: { council: 80000 } }).ok).toBe(false);
  });

  it("refuses a monthly gift bigger than a twelfth of the limit, even in December", () => {
    expect(checkAnnualLimit({ ...base, monthIndex: 11, frequency: "monthly", slateAmounts: { council: 12000 } }).ok).toBe(false);
  });

  it("counts payments already scheduled by an active monthly gift", () => {
    const r = checkAnnualLimit({ ...base, frequency: "one_time", slateAmounts: { council: 100000 }, committed: { council: 11900 * 11 } });
    expect(r.ok).toBe(false);
  });

  it("checks each slate separately", () => {
    const r = checkAnnualLimit({
      ...base,
      frequency: "one_time",
      slateAmounts: { council: LIMIT, school_board: LIMIT },
      yearToDate: { council: 0, school_board: 100 },
    });
    expect(r).toMatchObject({ ok: false, slate: "school_board" });
  });
});

describe("excessOverLimit", () => {
  it("returns only the part over the limit", () => {
    expect(excessOverLimit(140000, 5000, LIMIT)).toBe(2030);
    expect(excessOverLimit(0, 5000, LIMIT)).toBe(0);
    expect(excessOverLimit(LIMIT, 5000, LIMIT)).toBe(5000);
  });
});

describe("pacificYearMonth", () => {
  it("counts New Year's Eve evening in Surrey as the old year", () => {
    expect(pacificYearMonth(new Date("2027-01-01T05:00:00Z"))).toEqual({ year: 2026, monthIndex: 11 });
    expect(pacificYearMonth(new Date("2027-01-01T09:00:00Z"))).toEqual({ year: 2027, monthIndex: 0 });
  });
});
