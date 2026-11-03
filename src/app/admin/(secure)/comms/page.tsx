import { desc } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { emailCampaigns } from "@/lib/db/schema";
import { describeAudience, parseAudience } from "@/lib/email/audience";
import { StatusBadge } from "@/components/admin/comms/StatusBadge";
import { requireAdmin } from "@/lib/server/admin-auth";
import { campaignProgressAll, commsTotals } from "@/lib/server/comms";
import "./comms.css";

const when = (d: Date) => d.toLocaleString("en-CA", { timeZone: "America/Vancouver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function CommsHome() {
  await requireAdmin("comms");
  const db = getDb();
  const [rows, progress, totals] = await Promise.all([db.select().from(emailCampaigns).orderBy(desc(emailCampaigns.updatedAt)).limit(100), campaignProgressAll(db), commsTotals(db)]);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="comms-head">
        <h1 className="h3">Email &amp; texts</h1>
        <div className="comms-toolbar">
          <Link href="/admin/comms/new" className="btn btn--red">
            New email campaign
          </Link>
          <Link href="/admin/comms/sms" className="btn btn--navy">
            Send a text
          </Link>
          <Link href="/admin/comms/log" className="btn btn--outline">
            Log
          </Link>
        </div>
      </div>

      <div className="stats" style={{ marginBottom: 0 }}>
        <div className="stat">
          <div className="value">{totals.confirmed}</div>
          <div className="label">Confirmed subscribers</div>
        </div>
        <div className="stat">
          <div className="value">{totals.pending}</div>
          <div className="label">Awaiting confirmation</div>
        </div>
        <div className="stat">
          <div className="value">{totals.unsubscribed}</div>
          <div className="label">Unsubscribed</div>
        </div>
        <div className="stat">
          <div className="value">{totals.sms_opt_ins}</div>
          <div className="label">Said yes to texts</div>
        </div>
        <div className="stat">
          <div className="value">{totals.queued}</div>
          <div className="label">Emails queued</div>
        </div>
        <div className="stat">
          <div className="value">{totals.failed}</div>
          <div className="label">Emails failed</div>
        </div>
      </div>

      <section className="stack" style={{ gap: 12 }}>
        <h2 className="h3" style={{ fontSize: 22 }}>
          Campaigns
        </h2>
        {rows.length === 0 ? (
          <p className="empty-state">No campaigns yet. Start with “New email campaign”: write it in Markdown, pick an audience, send yourself a test, then send.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Status</th>
                  <th scope="col">Audience</th>
                  <th scope="col">Recipients</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Failed</th>
                  <th scope="col">Queued</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const p = progress.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td className="wrap">
                        <Link href={`/admin/comms/${c.id}`} className="text-link">
                          {c.subject}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="wrap">{describeAudience(parseAudience(c.audience))}</td>
                      <td>{c.status === "draft" ? "—" : c.recipientCount}</td>
                      <td>{p?.sent ?? c.sentCount}</td>
                      <td>{p ? p.failed + p.skipped : c.failedCount}</td>
                      <td>{p?.queued ?? 0}</td>
                      <td>{when(c.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
