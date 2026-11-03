import { describe, expect, it, vi } from "vitest";
import { OUTSIDE_SURREY, TOWN_CENTRE_MINIMUM, townCentreFor } from "@/lib/neighbourhoods";

vi.mock("server-only", () => ({}));
const { latestTownCentres, townCentreCounts } = await import("@/lib/server/campaigns");
const { COUNTER_MINIMUM } = await import("@/lib/server/neighbourhoods");
const stats = await import("@/lib/server/stats");

describe("townCentreFor", () => {
  it("keeps a stored town centre", () => {
    expect(townCentreFor("Newton", "V3T 1V8")).toBe("Newton");
    expect(townCentreFor(OUTSIDE_SURREY, null)).toBe(OUTSIDE_SURREY);
  });
  it("falls back to the postal code, then Outside Surrey", () => {
    expect(townCentreFor(null, "V3T 1V8")).toBe("Whalley");
    expect(townCentreFor(null, "V3T")).toBe("Whalley");
    expect(townCentreFor("Somewhere odd", "V3T1V8")).toBe("Whalley");
    expect(townCentreFor(null, "V6B 1A1")).toBe(OUTSIDE_SURREY);
    expect(townCentreFor(null, null)).toBe(OUTSIDE_SURREY);
  });
});

describe("public town-centre thresholds", () => {
  it("are the same everywhere", () => {
    expect(TOWN_CENTRE_MINIMUM).toBe(10);
    expect(COUNTER_MINIMUM).toBe(TOWN_CENTRE_MINIMUM);
    expect(stats.TOWN_CENTRE_MINIMUM).toBe(TOWN_CENTRE_MINIMUM);
  });
});

describe("campaign town-centre counts", () => {
  const groups = [
    { neighbourhood: "Newton", fsa: "V3W", n: 6 },
    { neighbourhood: null, fsa: "V3W", n: 4 }, // Newton by postal code: 10 in all
    { neighbourhood: "Whalley", fsa: "V3T", n: 9 },
    { neighbourhood: null, fsa: "V6B", n: 30 }, // Outside Surrey: never a town centre row
  ];
  it("files signers like /stats and hides town centres under 10", () => {
    expect(townCentreCounts(groups)).toEqual([{ neighbourhood: "Newton", count: 10 }]);
  });
  it("only names town centres that are shown in the latest list", () => {
    const shown = new Set(["Newton"]);
    const latest = [
      { neighbourhood: "Whalley", postalCode: "V3T 1V8" },
      { neighbourhood: null, postalCode: "V3W 2A1" },
      { neighbourhood: "Newton", postalCode: "V3W 2A1" },
      { neighbourhood: null, postalCode: "V6B 1A1" },
    ];
    expect(latestTownCentres(latest, shown)).toEqual(["Newton"]);
    expect(latestTownCentres(latest, new Set())).toEqual([]);
  });
});
