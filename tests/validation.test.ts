import { describe, expect, it } from "vitest";
import { ageOn, neighbourhoodForPostalCode, normalizePostalCode } from "@/lib/neighbourhoods";
import { donationSchema, membershipSchema, signatureSchema } from "@/lib/validation";

const member = {
  firstName: "Asha",
  lastName: "Singh",
  email: "  Asha@Example.com ",
  address: "13450 104 Ave",
  city: "Surrey",
  postalCode: "v3t 1v8",
  neighbourhood: "Whalley",
  birthdate: "1990-04-12",
  citizenshipStatus: "Citizen",
  languages: ["English", "Punjabi"],
  consent: true,
};

describe("membershipSchema", () => {
  it("accepts a complete form and normalizes the email", () => {
    const r = membershipSchema.parse(member);
    expect(r.email).toBe("asha@example.com");
    expect(r.student).toBe(false);
  });
  it("requires consent", () => {
    expect(membershipSchema.safeParse({ ...member, consent: false }).success).toBe(false);
  });
  it("rejects unknown fields", () => {
    expect(membershipSchema.safeParse({ ...member, isAdmin: true }).success).toBe(false);
  });
});

describe("donationSchema", () => {
  const donation = {
    frequency: "one_time",
    tier: "standard",
    amountCents: 5000,
    firstName: "Asha",
    lastName: "Singh",
    email: "asha@example.com",
    address: "13450 104 Ave",
    city: "Surrey",
    postalCode: "V3T 1V8",
    attestCitizenOrPR: true,
    attestBcResident: true,
    attestOwnFunds: true,
  };
  it("accepts an eligible contributor", () => {
    expect(donationSchema.safeParse(donation).success).toBe(true);
  });
  it("requires a BC postal code", () => {
    expect(donationSchema.safeParse({ ...donation, postalCode: "M5V 2T6" }).success).toBe(false);
  });
  it("requires every eligibility attestation", () => {
    expect(donationSchema.safeParse({ ...donation, attestOwnFunds: false }).success).toBe(false);
  });
});

describe("signatureSchema", () => {
  it("only accepts known campaigns", () => {
    const sig = { campaign: "skytrain-south-surrey", firstName: "A", lastName: "B", email: "a@b.ca", postalCode: "V4A 1A1", consent: true };
    expect(signatureSchema.safeParse(sig).success).toBe(true);
    expect(signatureSchema.safeParse({ ...sig, campaign: "other" }).success).toBe(false);
  });
});

describe("neighbourhood helpers", () => {
  it("maps postal codes to town centres", () => {
    expect(neighbourhoodForPostalCode("v3w 2a1")).toBe("Newton");
    expect(neighbourhoodForPostalCode("V5K 0A1")).toBeUndefined();
    expect(normalizePostalCode("v3t1v8")).toBe("V3T 1V8");
  });
  it("computes age on a date", () => {
    expect(ageOn("2012-10-24", new Date(2026, 9, 23))).toBe(13);
    expect(ageOn("2012-10-23", new Date(2026, 9, 23))).toBe(14);
  });
});
