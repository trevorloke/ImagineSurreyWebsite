import "server-only";
import { getStripe } from "@/lib/stripe";

/** Look up a completed Checkout session for a thank-you page. Never throws. */
export async function completedSession(sessionId: unknown) {
  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) return null;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return session.status === "complete" ? session : null;
  } catch {
    return null;
  }
}
