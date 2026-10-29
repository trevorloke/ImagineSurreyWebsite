import type { NextRequest } from "next/server";
import { json, parseBody } from "@/lib/server/api";
import { handle, refused } from "@/lib/server/handle";
import { returnTo, write } from "@/lib/starbase";
import { membershipSchema } from "@/lib/validation";

type Joined = { url?: string; ok?: boolean; status?: "active" | "pledged" | "already_member"; expires_at?: string; instructions?: string };

// The join form → Starbase's membership roll. A fee goes through Stripe
// Checkout (Starbase books it as a contribution); the webhook on Starbase
// turns the membership active.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, membershipSchema, "membership");
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const r = await write<Joined>("/join", {
      first_name: d.firstName, last_name: d.lastName, email: d.email, phone: d.phone, address: d.address, city: d.city, postal: d.postalCode,
      neighbourhood: d.neighbourhood, birthdate: d.birthdate, citizenship: d.citizenshipStatus, gender: d.gender || "", languages: d.languages,
      student: d.student, campus: d.campus || "", issue: d.issue, interest_volunteer: d.interestVolunteer, interest_lawn_sign: d.interestLawnSign,
      consent: true, return: returnTo("/join/welcome", "/#join"),
    });
    if (r.status !== 200) return refused(r.data, r.status);
    if (r.data.url) return json({ status: "checkout", url: r.data.url });
    if (r.data.status === "already_member") return json({ status: "already_member", expiresAt: r.data.expires_at });
    if (r.data.status === "pledged") return json({ status: "pledged", instructions: r.data.instructions });
    return json({ status: "active" });
  });
}
