import { describe, expect, it } from "vitest";
import { campaignShareLinks, nextAsks } from "@/app/act/links";
import { formatCount, milestonePercent, nextMilestone } from "@/app/act/milestone";

describe("milestones", () => {
  it("aims for the goal until it is reached", () => {
    expect(nextMilestone(0, 1000)).toBe(1000);
    expect(nextMilestone(999, 1000)).toBe(1000);
    expect(nextMilestone(0, 2500)).toBe(2500);
  });
  it("then aims for the next multiple of 500 above the count, never 'done'", () => {
    expect(nextMilestone(1000, 1000)).toBe(1500);
    expect(nextMilestone(1234, 1000)).toBe(1500);
    expect(nextMilestone(1500, 1000)).toBe(2000);
    expect(nextMilestone(2500, 2500)).toBe(3000);
    expect(nextMilestone(1000, 1000)).toBeGreaterThan(1000);
  });
  it("works without a goal", () => {
    expect(nextMilestone(0, null)).toBe(500);
    expect(nextMilestone(499, undefined)).toBe(500);
    expect(nextMilestone(500, 0)).toBe(1000);
  });
  it("reports progress as a clamped percentage", () => {
    expect(milestonePercent(0, 1000)).toBe(0);
    expect(milestonePercent(250, 1000)).toBe(25);
    expect(milestonePercent(999, 1000)).toBe(100);
    expect(milestonePercent(5, 0)).toBe(0);
    expect(formatCount(1234)).toBe("1,234");
  });
});

describe("share links", () => {
  const links = campaignShareLinks({ url: "https://imaginesurrey.ca/act/skytrain-south-surrey", text: "I signed. Add your name:" });
  it("tags every channel with its own source", () => {
    expect(decodeURIComponent(links.whatsapp)).toContain("/act/skytrain-south-surrey?source=share-whatsapp");
    expect(decodeURIComponent(links.sms)).toContain("source=share-sms");
    expect(decodeURIComponent(links.facebook)).toContain("source=share-facebook");
    expect(decodeURIComponent(links.x)).toContain("source=share-x");
    expect(decodeURIComponent(links.email)).toContain("source=share-email");
    expect(links.copy).toBe("https://imaginesurrey.ca/act/skytrain-south-surrey?source=share-copy");
  });
  it("puts the share text in the message", () => {
    expect(decodeURIComponent(links.whatsapp)).toContain("I signed. Add your name:");
  });
  it("tags the next asks with the campaign", () => {
    expect(nextAsks("skytrain-south-surrey").map((a) => a.href)).toEqual([
      "/join?source=act-skytrain-south-surrey",
      "/donate?source=act-skytrain-south-surrey",
      "/volunteer?source=act-skytrain-south-surrey",
    ]);
  });
});
