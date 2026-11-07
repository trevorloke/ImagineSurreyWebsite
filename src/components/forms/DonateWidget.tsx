import "server-only";
import { currentLimit } from "@/lib/server/limits";
import { DonateWidgetCard } from "./DonateWidgetCard";

/**
 * The home page "Chip in" card, with this year's contribution limit (the
 * stored figure for the Pacific year, so it changes on January 1 by itself).
 * `limitCents` is accepted for older callers and ignored.
 */
export async function DonateWidget({ monthlyNote, clubNote }: { limitCents?: number; monthlyNote?: string; clubNote?: string }) {
  const { year, cents } = await currentLimit();
  return <DonateWidgetCard limitCents={cents} year={year} monthlyNote={monthlyNote} clubNote={clubNote} />;
}
