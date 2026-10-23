import Link from "next/link";
import { getDb } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { dashboardTotals, DATASETS, loadDataset, type Dataset } from "@/lib/server/admin-data";

const LABELS: Record<Dataset, string> = {
  members: "Members",
  contributions: "Contributions",
  monthly_donors: "Monthly donors",
  newsletter: "Newsletter",
  signatures: "Petitions & pledges",
  rsvps: "RSVPs",
  orders: "Shop orders",
};

function cell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleString("en-CA", { timeZone: "America/Vancouver" });
  if (key.endsWith("_cents") && typeof value === "number") return formatCents(value);
  if (typeof value === "boolean") return value ? "yes" : "";
  return String(value);
}

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const view = DATASETS.includes(sp.view as Dataset) ? (sp.view as Dataset) : "members";
  const db = getDb();
  const [totals, rows] = await Promise.all([dashboardTotals(db), loadDataset(db, view, 200)]);
  const columns = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="value">{totals.active_members}</div>
          <div className="label">Active members</div>
        </div>
        <div className="stat">
          <div className="value">{formatCents(Number(totals.raised_this_year_cents))}</div>
          <div className="label">Raised this year</div>
        </div>
        <div className="stat">
          <div className="value">{totals.monthly_donors}</div>
          <div className="label">Monthly donors</div>
        </div>
        <div className="stat">
          <div className="value">{totals.subscribers}</div>
          <div className="label">Newsletter</div>
        </div>
        <div className="stat">
          <div className="value">{totals.signatures}</div>
          <div className="label">Signatures</div>
        </div>
        <div className="stat">
          <div className="value">{totals.orders_to_fulfil}</div>
          <div className="label">Orders to ship</div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {DATASETS.map((d) => (
          <Link key={d} href={`/admin?view=${d}`} className={`btn ${d === view ? "btn--navy" : "btn--outline"}`} style={{ minHeight: 40 }}>
            {LABELS[d]}
          </Link>
        ))}
        <a href={`/api/admin/export/${view}`} className="btn btn--red" style={{ minHeight: 40, marginLeft: "auto" }}>
          Download all as CSV
        </a>
      </div>
      <p className="small" style={{ marginBottom: 12 }}>
        Showing the latest {rows.length} {LABELS[view].toLowerCase()}. The CSV has every row.
      </p>
      {rows.length === 0 ? (
        <p className="empty-state">Nothing here yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} scope="col">
                    {c.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{cell(c, r[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
