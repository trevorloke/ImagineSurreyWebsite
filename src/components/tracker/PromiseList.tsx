"use client";

import { useEffect, useMemo, useState } from "react";
import { PROMISE_STATUSES, STATUS_BY_ID, type PromiseStatus } from "@/lib/tracker";

export type TrackerSource = { label: string; url?: string };

export type PublicPromise = {
  id: string;
  number: number;
  title: string;
  specifics: string;
  area: string;
  status: PromiseStatus;
  sources: TrackerSource[];
  testKept: string | null;
  testPartly: string | null;
  testBroken: string | null;
  testRecord: string | null;
  updates: { id: string; date: string; status: PromiseStatus | null; note: string; url: string | null }[];
};

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function StatusBadge({ status }: { status: PromiseStatus }) {
  const s = STATUS_BY_ID[status];
  return (
    <span className="status-badge" style={{ background: s.color, color: s.text }}>
      {s.label}
    </span>
  );
}

export function SourceLinks({ sources }: { sources: TrackerSource[] }) {
  return (
    <>
      {sources.map((s, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.label}
            </a>
          ) : (
            s.label
          )}
        </span>
      ))}
    </>
  );
}

export function PromiseList({ promises }: { promises: PublicPromise[] }) {
  const [status, setStatus] = useState<PromiseStatus | "all">("all");
  const [area, setArea] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const areas = useMemo(() => [...new Set(promises.map((p) => p.area))].sort(), [promises]);

  // A link to /tracker#promise-10 opens that promise.
  useEffect(() => {
    const m = /^#promise-(\d+)$/.exec(window.location.hash);
    if (m) {
      setOpen(new Set([Number(m[1])]));
      requestAnimationFrame(() => document.getElementById(`promise-${m[1]}`)?.scrollIntoView({ block: "start" }));
    }
  }, []);

  const q = query.trim().toLowerCase();
  const shown = promises.filter(
    (p) =>
      (status === "all" || p.status === status) &&
      (area === "all" || p.area === area) &&
      (!q || `${p.title} ${p.specifics} ${p.area}`.toLowerCase().includes(q)),
  );

  const toggle = (n: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="tracker-filters">
        <div className="field" style={{ flex: "1 1 240px" }}>
          <label htmlFor="tracker-search">Search promises</label>
          <input id="tracker-search" type="search" className="input input--search" placeholder="Hospital, pools, police…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="field" style={{ flex: "0 1 200px" }}>
          <label htmlFor="tracker-area">Area</label>
          <select id="tracker-area" className="input" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="all">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Filter by status" className="status-filter">
          <button type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")}>
            All
          </button>
          {PROMISE_STATUSES.map((s) => (
            <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
              <span className="swatch-dot" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="small" aria-live="polite">
        Showing {shown.length} of {promises.length} promises.
      </p>

      <ol className="promise-list">
        {shown.map((p) => {
          const isOpen = open.has(p.number);
          const hasTest = Boolean(p.testKept);
          return (
            <li key={p.id} id={`promise-${p.number}`} className={`promise-card status-${p.status}`}>
              <div className="promise-head">
                <span className="promise-number" aria-hidden="true">
                  {p.number}
                </span>
                <div className="promise-main">
                  <div className="promise-meta">
                    <StatusBadge status={p.status} />
                    <span className="promise-area">{p.area}</span>
                    {p.updates[0] && <span className="promise-updated">Updated {formatDate(p.updates[0].date)}</span>}
                  </div>
                  <h3 className="promise-title">
                    <span className="visually-hidden">Promise {p.number}: </span>
                    {p.title}
                  </h3>
                  {p.specifics && <p className="promise-specifics">{p.specifics}</p>}
                </div>
              </div>
              <button type="button" className="promise-toggle" aria-expanded={isOpen} aria-controls={`promise-${p.number}-detail`} onClick={() => toggle(p.number)}>
                {isOpen ? "Hide details" : hasTest ? "How it's scored, sources and updates" : "Sources and updates"}
                <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
              </button>
              {isOpen && (
                <div id={`promise-${p.number}-detail`} className="promise-detail">
                  {hasTest && (
                    <div>
                      <h4>How it&apos;s scored</h4>
                      <dl className="delivery-test">
                        <div>
                          <dt>
                            <StatusBadge status="kept" />
                          </dt>
                          <dd>{p.testKept}</dd>
                        </div>
                        <div>
                          <dt>
                            <StatusBadge status="partly_kept" />
                          </dt>
                          <dd>{p.testPartly}</dd>
                        </div>
                        <div>
                          <dt>
                            <StatusBadge status="broken" />
                          </dt>
                          <dd>{p.testBroken}</dd>
                        </div>
                      </dl>
                      {p.testRecord && (
                        <p className="small">
                          <strong>Record to check:</strong> {p.testRecord}
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <h4>Where it was promised</h4>
                    <p className="promise-sources">
                      <SourceLinks sources={p.sources} />
                    </p>
                  </div>
                  <div>
                    <h4>Updates</h4>
                    {p.updates.length === 0 ? (
                      <p className="small">No public record yet. We&apos;ll score this as soon as one exists.</p>
                    ) : (
                      <ol className="update-list">
                        {p.updates.map((u) => (
                          <li key={u.id}>
                            <span className="update-date">{formatDate(u.date)}</span>
                            {u.status && <StatusBadge status={u.status} />}
                            <span>
                              {u.note}
                              {u.url && (
                                <>
                                  {" "}
                                  <a href={u.url} target="_blank" rel="noopener noreferrer">
                                    Source
                                  </a>
                                </>
                              )}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                  <a className="small" href={`#promise-${p.number}`}>
                    Link to this promise
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {shown.length === 0 && <p className="empty-state">No promises match. Try clearing the filters.</p>}
    </div>
  );
}
