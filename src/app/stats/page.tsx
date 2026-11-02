import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { Counter } from "@/components/engage/Counter";
import { GoalBar } from "@/components/engage/GoalBar";
import { formatEventTime } from "@/lib/dates";
import { publicStats, STATS_REVALIDATE_SECONDS, TOWN_CENTRE_MINIMUM, TOWN_CENTRES } from "@/lib/server/stats";
import { formatWeekRange } from "@/lib/shifts";
import "./stats.css";

export const metadata: Metadata = {
  title: "Live numbers",
  description: "How many people have joined, signed and shown up for Imagine Surrey, counted honestly and refreshed every five minutes.",
};

export const revalidate = 300;

export default async function StatsPage() {
  const stats = await publicStats();
  const tiles = [
    { label: "Members", value: stats.members, note: "Paid and current." },
    { label: "Pledge signers", value: stats.pledge, note: "Distinct email addresses." },
    { label: "Petition signers", value: stats.petition, note: "Distinct email addresses." },
    { label: "Newsletter subscribers", value: stats.newsletter, note: "Confirmed addresses only." },
    { label: "Volunteers", value: stats.volunteers, note: "People who asked to help." },
    { label: "Shifts this week", value: stats.shiftsThisWeek, note: formatWeekRange(stats.week.start) + "." },
    { label: "Monthly donors", value: stats.monthlyDonors, note: "Active monthly gifts." },
  ];

  return (
    <>
      <PageHead title="The numbers, live" eyebrow="Counted honestly">
        Real counts from our own records, refreshed every {STATS_REVALIDATE_SECONDS / 60} minutes. They go down as well as up. <Link href="#how-we-count" style={{ color: "#fff" }}>How we count</Link> is published below.
      </PageHead>

      <section className="section">
        <div className="container stack" style={{ gap: 40 }}>
          <ul className="stat-tiles" aria-label="Live numbers">
            {tiles.map((t) => (
              <li className="stat-tile" key={t.label}>
                <span className="stat-tile__value">
                  <Counter value={t.value} />
                </span>
                <span className="stat-tile__label">{t.label}</span>
                <p className="stat-tile__note">{t.note}</p>
              </li>
            ))}
          </ul>

          <div className="goal-grid">
            {stats.campaigns.map((c) => (
              <section className="card card--white" key={c.slug} aria-labelledby={`goal-${c.slug}`}>
                <h2 id={`goal-${c.slug}`}>{c.title}</h2>
                <GoalBar count={c.count} goal={c.goal} label={`${c.title}: ${c.kind === "pledge" ? "pledges" : "signatures"}`} unit={c.kind === "pledge" ? "pledges" : "signatures"} />
                <p>
                  <Link href={`/act/${c.slug}`}>{c.kind === "pledge" ? "Sign the pledge" : "Sign the petition"}</Link>
                </p>
              </section>
            ))}
          </div>

          <section className="stats-section" aria-labelledby="towns-h">
            <h2 id="towns-h">By town centre</h2>
            <div className="table-wrap">
              <table className="table stats-table">
                <caption>
                  Town centres come from each signer&apos;s postal code. A town centre is shown once it has at least {TOWN_CENTRE_MINIMUM} signers, so nobody on a quiet street can be picked out.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Town centre</th>
                    {stats.campaigns.map((c) => (
                      <th scope="col" key={c.slug}>
                        {c.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TOWN_CENTRES.map((town) => (
                    <tr key={town}>
                      <th scope="row">{town}</th>
                      {stats.campaigns.map((c) => {
                        const n = c.byTownCentre[town];
                        return <td key={c.slug}>{typeof n === "number" ? n.toLocaleString("en-CA") : `under ${TOWN_CENTRE_MINIMUM}`}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="stats-section" id="how-we-count" aria-labelledby="how-h">
            <h2 id="how-h">How we count</h2>
            <ul className="how-we-count">
              <li>
                <strong>Distinct people.</strong> Pledge and petition signers are counted by email address, so signing twice counts once. Members and monthly donors are one per person.
              </li>
              <li>
                <strong>Confirmed only.</strong> Newsletter subscribers are addresses that clicked the confirmation link. Members are paid and current. Monthly donors have an active gift.
              </li>
              <li>
                <strong>Refreshed every {STATS_REVALIDATE_SECONDS / 60} minutes.</strong> Each number is a fresh count of our records, not a running total.
              </li>
              <li>
                <strong>Declines are shown.</strong> When a membership lapses, a monthly gift ends or someone unsubscribes, the number goes down. Nothing is rounded up.
              </li>
              <li>
                <strong>Town centres.</strong> From each signer&apos;s postal code; shown only once a town centre has {TOWN_CENTRE_MINIMUM} or more signers.
              </li>
              <li>
                <strong>Shifts this week.</strong> Volunteer shifts scheduled, confirmed or attended in the current Sunday-to-Saturday week, Pacific time.
              </li>
              <li>
                <strong>Corrections.</strong> If we find an error in how something was counted, we fix it and note it here.
              </li>
            </ul>
            <p className="small">
              Last refreshed {formatEventTime(new Date(stats.generatedAt))} Pacific time. The same numbers are available as JSON at <code>/api/stats</code>.
            </p>
          </section>
        </div>
      </section>
    </>
  );
}
