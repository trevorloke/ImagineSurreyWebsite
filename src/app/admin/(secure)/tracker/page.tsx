import Link from "next/link";
import { StatusBadge } from "@/components/tracker/PromiseList";
import { todayInSurrey } from "@/lib/shifts";
import { countByStatus, PROMISE_STATUSES } from "@/lib/tracker";
import { loadTracker } from "@/lib/server/tracker";
import { addAnnouncement, addPromise, addUpdate, deleteAnnouncement, deletePromise, deleteUpdate, editPromise, setStatus } from "./actions";

const textarea = { padding: 12, minHeight: 72 } as const;

export default async function AdminTracker() {
  const { promises, announcements } = await loadTracker();
  const today = todayInSurrey();
  const counts = countByStatus(promises.map((p) => p.status));

  return (
    <div className="stack" style={{ gap: 40 }}>
      <div className="stack" style={{ gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          <h1 className="h3" style={{ fontSize: 30 }}>
            Promise tracker
          </h1>
          <Link href="/tracker" className="text-link" target="_blank">
            View public page ↗
          </Link>
        </div>
        <p className="body" style={{ maxWidth: 860 }}>
          Score a promise when the record exists: add an update with the date, what happened and a link to the record, and pick the new status. Updates
          show on the public page, newest first. New commitments go in the announcements log, or as a new promise if they can be scored.
        </p>
        <div className="btn-row" style={{ gap: 8 }}>
          {PROMISE_STATUSES.map((s) => (
            <span key={s.id} className="status-badge" style={{ background: s.color, color: s.text }}>
              {counts[s.id]} {s.label}
            </span>
          ))}
        </div>
      </div>

      <section className="stack" style={{ gap: 12 }}>
        {promises.map((p) => (
          <details key={p.id} className="card card--white" style={{ padding: 0 }}>
            <summary style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", padding: "16px 20px", cursor: "pointer" }}>
              <strong style={{ fontSize: 20, color: "var(--navy)", minWidth: 28 }}>{p.number}</strong>
              <StatusBadge status={p.status} />
              <span style={{ flex: "1 1 300px", fontWeight: 700 }}>{p.title}</span>
              <span className="small">
                {p.area} · {p.updates.length} update{p.updates.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="stack" style={{ gap: 20, padding: "0 20px 20px" }}>
              <form action={addUpdate} className="form-card form-card--surface" style={{ padding: 18, gap: 12 }}>
                <h3 className="h3" style={{ fontSize: 18 }}>
                  Add an update
                </h3>
                <input type="hidden" name="promiseId" value={p.id} />
                <div className="form-row">
                  <div className="field">
                    <label htmlFor={`d-${p.id}`}>Date</label>
                    <input id={`d-${p.id}`} name="date" type="date" className="input" defaultValue={today} required />
                  </div>
                  <div className="field">
                    <label htmlFor={`s-${p.id}`}>New status</label>
                    <select id={`s-${p.id}`} name="status" className="input" defaultValue="">
                      <option value="">Keep as {PROMISE_STATUSES.find((s) => s.id === p.status)?.label}</option>
                      {PROMISE_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`n-${p.id}`}>What happened</label>
                  <textarea id={`n-${p.id}`} name="note" className="input" style={textarea} required maxLength={2000} />
                </div>
                <div className="field">
                  <label htmlFor={`u-${p.id}`}>Link to the record (council minutes, bylaw, news story)</label>
                  <input id={`u-${p.id}`} name="url" type="url" className="input" placeholder="https://" />
                </div>
                {p.testKept && (
                  <p className="small">
                    <strong>Kept:</strong> {p.testKept} <strong>Partly:</strong> {p.testPartly} <strong>Broken:</strong> {p.testBroken}
                  </p>
                )}
                <button type="submit" className="btn btn--red" style={{ alignSelf: "flex-start" }}>
                  Add update
                </button>
              </form>

              {p.updates.length > 0 && (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {p.updates.map((u) => (
                        <tr key={u.id}>
                          <td>{u.date}</td>
                          <td>{u.status && <StatusBadge status={u.status} />}</td>
                          <td style={{ whiteSpace: "normal" }}>
                            {u.note} {u.url && <a href={u.url}>link</a>}
                          </td>
                          <td>
                            <form action={deleteUpdate}>
                              <input type="hidden" name="id" value={u.id} />
                              <button className="link-button is-danger">Delete</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <form action={setStatus} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <input type="hidden" name="id" value={p.id} />
                <label htmlFor={`fix-${p.id}`} className="small">
                  Correct the status without an update:
                </label>
                <select id={`fix-${p.id}`} name="status" className="input" defaultValue={p.status} style={{ width: "auto", minHeight: 38 }}>
                  {PROMISE_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn--outline" style={{ minHeight: 38 }}>
                  Save
                </button>
              </form>

              <details>
                <summary className="link-button">Edit wording and delivery test</summary>
                <form action={editPromise} className="stack" style={{ gap: 10, marginTop: 12 }}>
                  <input type="hidden" name="id" value={p.id} />
                  {(
                    [
                      ["title", "Promise", p.title],
                      ["specifics", "Specifics and conditions", p.specifics],
                      ["area", "Area", p.area],
                      ["testKept", "Kept means", p.testKept ?? ""],
                      ["testPartly", "Partly kept means", p.testPartly ?? ""],
                      ["testBroken", "Broken means", p.testBroken ?? ""],
                      ["testRecord", "Record to check", p.testRecord ?? ""],
                    ] as const
                  ).map(([name, label, value]) => (
                    <div key={name} className="field">
                      <label htmlFor={`${name}-${p.id}`}>{label}</label>
                      {name === "area" ? (
                        <input id={`${name}-${p.id}`} name={name} className="input" defaultValue={value} required maxLength={40} />
                      ) : (
                        <textarea id={`${name}-${p.id}`} name={name} className="input" style={textarea} defaultValue={value} required={name === "title"} />
                      )}
                    </div>
                  ))}
                  <div className="btn-row" style={{ gap: 10 }}>
                    <button className="btn btn--navy">Save changes</button>
                  </div>
                </form>
                <form action={deletePromise} style={{ marginTop: 12 }}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="link-button is-danger">Delete this promise and its updates</button>
                </form>
              </details>
            </div>
          </details>
        ))}
      </section>

      <section className="stack" style={{ gap: 12 }}>
        <h2 className="h3" style={{ fontSize: 24 }}>
          Add a new promise
        </h2>
        <form action={addPromise} className="form-card form-card--surface">
          <div className="field">
            <label htmlFor="np-title">Promise</label>
            <input id="np-title" name="title" className="input" required maxLength={400} />
          </div>
          <div className="field">
            <label htmlFor="np-specifics">Specifics and conditions</label>
            <textarea id="np-specifics" name="specifics" className="input" style={textarea} />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="np-area">Area</label>
              <input id="np-area" name="area" className="input" required list="areas" maxLength={40} />
              <datalist id="areas">
                {[...new Set(promises.map((p) => p.area))].map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="np-src">Where it was made</label>
              <input id="np-src" name="sourceLabel" className="input" placeholder="e.g. Council meeting, Nov 2, 2026" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="np-url">Link</label>
            <input id="np-url" name="sourceUrl" type="url" className="input" placeholder="https://" />
          </div>
          <button type="submit" className="btn btn--red" style={{ alignSelf: "flex-start" }}>
            Add promise #{promises.length ? Math.max(...promises.map((p) => p.number)) + 1 : 1}
          </button>
        </form>
      </section>

      <section className="stack" style={{ gap: 12 }}>
        <h2 className="h3" style={{ fontSize: 24 }}>
          Announcements log
        </h2>
        <form action={addAnnouncement} className="form-card form-card--surface">
          <div className="form-row">
            <div className="field">
              <label htmlFor="na-date">Date</label>
              <input id="na-date" name="date" type="date" className="input" defaultValue={today} required />
            </div>
            <div className="field">
              <label htmlFor="na-title">Announcement</label>
              <input id="na-title" name="title" className="input" required maxLength={300} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="na-commitments">Commitments or claims made</label>
            <textarea id="na-commitments" name="commitments" className="input" style={textarea} required />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="na-src">Source</label>
              <input id="na-src" name="sourceLabel" className="input" placeholder="e.g. Surrey Now-Leader, Nov 3, 2026" />
            </div>
            <div className="field">
              <label htmlFor="na-url">Link</label>
              <input id="na-url" name="sourceUrl" type="url" className="input" placeholder="https://" />
            </div>
          </div>
          <button type="submit" className="btn btn--red" style={{ alignSelf: "flex-start" }}>
            Add announcement
          </button>
        </form>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id}>
                  <td>{a.dateLabel}</td>
                  <td style={{ whiteSpace: "normal" }}>
                    <strong>{a.title}</strong>
                  </td>
                  <td>
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="link-button is-danger">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
