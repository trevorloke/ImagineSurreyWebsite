import { describe, expect, it } from "vitest";
import { AREA_COOKIE, areaCookieString, areaForPostalCode, areaSlug, LOCAL_COUNT_THRESHOLD, localCountText, parseArea } from "@/components/shell/area";
import { nav } from "@/content/site";
import { NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { defaultSettings } from "@/lib/settings";

describe("Your Surrey area", () => {
  it("reads only the six town centres from the cookie", () => {
    expect(parseArea("Newton")).toBe("Newton");
    expect(parseArea("South%20Surrey")).toBe("South Surrey");
    expect(parseArea("south surrey")).toBe("South Surrey");
    expect(parseArea("Outside Surrey")).toBeNull();
    expect(parseArea("'; drop table")).toBeNull();
    expect(parseArea("%E0%A4%A")).toBeNull();
    expect(parseArea(undefined)).toBeNull();
    expect(parseArea("")).toBeNull();
  });

  it("slugs each area for its neighbourhood page", () => {
    expect(areaSlug("South Surrey")).toBe("south-surrey");
    expect(areaSlug("Newton")).toBe("newton");
    for (const n of NEIGHBOURHOODS) expect(areaSlug(n)).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("maps a postal code to its town centre", () => {
    expect(areaForPostalCode("V3W 1A1")).toEqual({ ok: true, area: "Newton" });
    expect(areaForPostalCode("v4a1a1")).toEqual({ ok: true, area: "South Surrey" });
    expect(areaForPostalCode("  V3T 0A1 ")).toEqual({ ok: true, area: "Whalley" });
  });

  it("explains a missing, malformed or out-of-town postal code", () => {
    expect(areaForPostalCode("").ok).toBe(false);
    const bad = areaForPostalCode("12345");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/postal code/);
    const vancouver = areaForPostalCode("V6B 1A1");
    expect(vancouver.ok).toBe(false);
    if (!vancouver.ok) expect(vancouver.message).toMatch(/outside Surrey/);
  });

  it("stores the area for 30 days, site-wide, same-site lax", () => {
    const cookie = areaCookieString("South Surrey");
    expect(cookie.startsWith(`${AREA_COOKIE}=South%20Surrey;`)).toBe(true);
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("publishes local counts only from the threshold up", () => {
    expect(localCountText(LOCAL_COUNT_THRESHOLD - 1, "Newton", "sign the pledge")).toBe("Be one of the first in Newton to sign the pledge.");
    expect(localCountText(0, "Newton", "sign the pledge")).toMatch(/^Be one of the first/);
    expect(localCountText(LOCAL_COUNT_THRESHOLD, "Newton", "sign the pledge")).toBe("10 people in Newton have signed the pledge.");
    expect(localCountText(1234, "Guildford", "sign the SkyTrain petition")).toBe("1,234 people in Guildford have signed the SkyTrain petition.");
  });
});

describe("site shell", () => {
  it("navigates to the main sections, with Join on the home page anchor", () => {
    expect(nav.map((n) => n.href)).toEqual(["/tracker", "/volunteer", "/events", "/act", "/#join", "/news"]);
  });

  it("has settings defaults for every section the shell reads", () => {
    const s = defaultSettings();
    expect(s.seo.title).toBe("Imagine Surrey");
    expect(s.hero.words.length).toBeGreaterThan(1);
    expect(s.hero.primaryCta.href).toBe("/#join");
    expect(s.organize.ctaHref).toBe("/#join");
    expect(s.announcement.enabled).toBe(false);
    expect(s.footer.acknowledgement).toMatch(/Coast Salish/);
  });
});
