"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, formatDay, formatWeekRange, SLOTS, TASK_PALETTE, textColorFor, type Slot } from "@/lib/shifts";

export type Task = { id: string; name: string; color: string };
export type Person = { id: string; name: string; email: string; phone: string | null; neighbourhood: string | null };
export type Shift = { id: string; personId: string; date: string; slot: Slot; taskId: string | null };

// What's being dragged, carried in dataTransfer.
const DRAG_TYPE = "application/x-imagine-surrey";
type DragPayload = { kind: "person"; id: string } | { kind: "shift"; id: string } | { kind: "task"; id: string };

const UNASSIGNED = { color: "#E3E7EF", text: "#0F1E33" };

async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

export function ShiftBoard({
  sunday,
  today,
  initialShifts,
  initialTasks,
  initialRoster,
}: {
  sunday: string;
  today: string;
  initialShifts: Shift[];
  initialTasks: Task[];
  initialRoster: Person[];
}) {
  const [shifts, setShifts] = useState(initialShifts);
  const [tasks, setTasks] = useState(initialTasks);
  const [roster, setRoster] = useState(initialRoster);
  // The task new shifts get: pick a colour, then drag names in.
  const [brush, setBrush] = useState<string | null>(initialTasks[0]?.id ?? null);
  // Tap-to-place, for touch screens and keyboards: pick a name, then a slot.
  const [picked, setPicked] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Person[]>([]);

  // Notes like "already on that shift" clear themselves; errors stay until dismissed.
  useEffect(() => {
    if (message?.tone !== "info") return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  // A new week arrives from the server when navigating.
  useEffect(() => setShifts(initialShifts), [initialShifts]);
  useEffect(() => setRoster(initialRoster), [initialRoster]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(sunday, i)), [sunday]);
  const people = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const countByPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) m.set(s.personId, (m.get(s.personId) ?? 0) + 1);
    return m;
  }, [shifts]);

  function fail(err: unknown) {
    setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
  }

  // ── Shift changes (optimistic, rolled back on failure) ──

  async function place(personId: string, date: string, slot: Slot) {
    // Someone dragged straight from the search results joins the roster.
    const found = searchResults.find((p) => p.id === personId);
    if (found && !people.has(personId)) setRoster((list) => [...list, found].sort((a, b) => a.name.localeCompare(b.name)));
    const existing = shifts.find((s) => s.personId === personId && s.date === date && s.slot === slot);
    if (existing) {
      setMessage({ tone: "info", text: `${people.get(personId)?.name ?? "They"} is already on that shift.` });
      return;
    }
    const temp: Shift = { id: `temp-${crypto.randomUUID()}`, personId, date, slot, taskId: brush };
    setShifts((list) => [...list, temp]);
    try {
      const saved = await api<Shift>("/api/admin/shifts", "POST", { personId, date, slot, taskId: brush });
      setShifts((list) => list.map((s) => (s.id === temp.id ? saved : s)));
    } catch (err) {
      setShifts((list) => list.filter((s) => s.id !== temp.id));
      fail(err);
    }
  }

  async function update(id: string, change: Partial<Pick<Shift, "date" | "slot" | "taskId">>) {
    const before = shifts.find((s) => s.id === id);
    if (!before) return;
    const after = { ...before, ...change };
    if (shifts.some((s) => s.id !== id && s.personId === after.personId && s.date === after.date && s.slot === after.slot)) {
      setMessage({ tone: "info", text: `${people.get(before.personId)?.name ?? "They"} is already on that shift.` });
      return;
    }
    setShifts((list) => list.map((s) => (s.id === id ? after : s)));
    try {
      await api(`/api/admin/shifts/${id}`, "PATCH", change);
    } catch (err) {
      setShifts((list) => list.map((s) => (s.id === id ? before : s)));
      fail(err);
    }
  }

  async function remove(id: string) {
    const before = shifts.find((s) => s.id === id);
    if (!before) return;
    setShifts((list) => list.filter((s) => s.id !== id));
    setMenu(null);
    try {
      await api(`/api/admin/shifts/${id}`, "DELETE");
    } catch (err) {
      setShifts((list) => [...list, before]);
      fail(err);
    }
  }

  async function copyLastWeek() {
    const from = addDays(sunday, -7);
    if (!confirm(`Copy last week's shifts into this week? Shifts already here stay as they are.`)) return;
    try {
      const { copied } = await api<{ copied: number }>("/api/admin/shifts/copy-week", "POST", { from, to: sunday });
      setMessage({ tone: "info", text: copied ? `Copied ${copied} shift${copied === 1 ? "" : "s"} from last week.` : "Nothing new to copy from last week." });
      if (copied) window.location.reload();
    } catch (err) {
      fail(err);
    }
  }

  // ── Drag and drop ──

  function startDrag(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = payload.kind === "shift" ? "move" : "copy";
    setMenu(null);
  }

  function readDrag(e: React.DragEvent): DragPayload | null {
    try {
      return JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
    } catch {
      return null;
    }
  }

  function dropOnCell(e: React.DragEvent, date: string, slot: Slot) {
    e.preventDefault();
    setHover(null);
    const payload = readDrag(e);
    if (payload?.kind === "person") place(payload.id, date, slot);
    if (payload?.kind === "shift") update(payload.id, { date, slot });
  }

  // ── Tap to place ──

  function tapCell(date: string, slot: Slot) {
    if (picked) {
      place(picked, date, slot);
      return;
    }
    setMenu(null);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicked(null);
        setMenu(null);
      }
    };
    // Close an open shift menu when clicking anywhere else.
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".shift-chip-wrap")) setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  // ── Roster search beyond the volunteer list ──

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(searchTimer.current);
    const q = filter.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        setSearchResults(await api<Person[]>(`/api/admin/people?q=${encodeURIComponent(q)}`, "GET"));
      } catch {
        setSearchResults([]);
      }
    }, 250);
  }, [filter]);

  const q = filter.trim().toLowerCase();
  const visibleRoster = roster.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q));
  const others = searchResults.filter((p) => !people.has(p.id));

  function addToRoster(p: Person) {
    setRoster((list) => [...list, p].sort((a, b) => a.name.localeCompare(b.name)));
    setFilter("");
    setPicked(p.id);
  }

  function rosterChip(p: Person, extra = false) {
    const count = countByPerson.get(p.id) ?? 0;
    return (
      <li key={p.id}>
        <button
          type="button"
          draggable
          onDragStart={(e) => startDrag(e, { kind: "person", id: p.id })}
          onClick={() => (extra ? addToRoster(p) : setPicked(picked === p.id ? null : p.id))}
          className="roster-name"
          aria-pressed={picked === p.id}
          title={[p.email, p.phone, p.neighbourhood].filter(Boolean).join(" · ")}
        >
          <span className="roster-label">{p.name}</span>
          {extra ? <span className="roster-meta">add</span> : count > 0 && <span className="roster-count" aria-label={`${count} shifts this week`}>{count}</span>}
        </button>
      </li>
    );
  }

  const brushTask = brush ? taskById.get(brush) : undefined;

  return (
    <div className="shift-board">
      <div className="shift-toolbar">
        <div className="week-nav">
          <Link href={`/admin/shifts?week=${addDays(sunday, -7)}`} className="btn btn--outline" aria-label="Previous week">
            ←
          </Link>
          <h2 className="week-title">{formatWeekRange(sunday)}</h2>
          <Link href={`/admin/shifts?week=${addDays(sunday, 7)}`} className="btn btn--outline" aria-label="Next week">
            →
          </Link>
          <Link href="/admin/shifts" className="text-link" style={{ fontSize: 15 }}>
            This week
          </Link>
        </div>
        <div className="btn-row no-print" style={{ gap: 10 }}>
          <button type="button" className="btn btn--outline" onClick={copyLastWeek}>
            Copy last week
          </button>
          <button type="button" className="btn btn--outline" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <TaskPalette
        tasks={tasks}
        setTasks={setTasks}
        brush={brush}
        setBrush={setBrush}
        onDragTask={(e, id) => startDrag(e, { kind: "task", id })}
        onError={fail}
      />

      <p className="shift-help no-print" aria-live="polite">
        {picked ? (
          <>
            <strong>{people.get(picked)?.name}</strong> is picked. Tap a shift to add them{brushTask ? ` for ${brushTask.name}` : ""}, or press Esc.
          </>
        ) : (
          <>
            Drag a name onto a shift{brushTask ? (
              <>
                {" "}
                to add them for <strong>{brushTask.name}</strong>
              </>
            ) : null}
            . Drag shifts to move them, drag a colour onto a shift to change its task, or drag a shift back to the list to remove it. On a phone, tap a name then a shift.
          </>
        )}
      </p>
      {message && (
        <div role={message.tone === "error" ? "alert" : "status"} className={`alert ${message.tone === "info" ? "alert--note" : ""} no-print`}>
          <span aria-hidden="true" className="alert-icon">
            !
          </span>
          <span style={{ flex: 1 }}>{message.text}</span>
          <button type="button" className="link-button" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="shift-layout">
        <aside
          className={`roster no-print ${hover === "roster" ? "is-drop" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setHover("roster");
          }}
          onDragLeave={() => setHover(null)}
          onDrop={(e) => {
            e.preventDefault();
            setHover(null);
            const payload = readDrag(e);
            if (payload?.kind === "shift") remove(payload.id);
          }}
          aria-label="Volunteers"
        >
          <h3 className="roster-title">Volunteers</h3>
          <input className="input" type="search" placeholder="Find or add someone" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a volunteer" />
          <ul className="roster-list">{visibleRoster.map((p) => rosterChip(p))}</ul>
          {visibleRoster.length === 0 && !q && <p className="small">No volunteers yet. People who tick “Volunteering” when they join appear here. Search to add anyone else.</p>}
          {others.length > 0 && (
            <>
              <p className="small" style={{ marginTop: 12 }}>
                Others in the database
              </p>
              <ul className="roster-list">{others.map((p) => rosterChip(p, true))}</ul>
            </>
          )}
          <p className="small roster-drop-hint">Drop a shift here to remove it.</p>
        </aside>

        <div className="shift-grid-wrap">
          <div className="shift-grid" role="grid" aria-label={`Shifts for the week of ${formatWeekRange(sunday)}`}>
            <div className="shift-corner" />
            {days.map((d) => {
              const { weekday, date } = formatDay(d);
              return (
                <div key={d} className={`shift-day ${d === today ? "is-today" : ""}`} role="columnheader">
                  <span className="shift-weekday">{weekday}</span>
                  <span className="shift-date">{date}</span>
                </div>
              );
            })}
            {SLOTS.map((slot) => (
              <div key={slot.id} style={{ display: "contents" }} role="row">
                <div className="shift-slot" role="rowheader">
                  <span className="shift-slot-name">{slot.label}</span>
                  <span className="shift-slot-hours">{slot.hours}</span>
                </div>
                {days.map((d) => {
                  const key = `${d}|${slot.id}`;
                  const here = shifts.filter((s) => s.date === d && s.slot === slot.id);
                  return (
                    <div
                      key={key}
                      role="gridcell"
                      aria-label={`${formatDay(d).weekday} ${slot.label}: ${here.length} scheduled`}
                      className={`shift-cell ${hover === key ? "is-drop" : ""} ${picked ? "is-pickable" : ""} ${d === today ? "is-today" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (hover !== key) setHover(key);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(null);
                      }}
                      onDrop={(e) => dropOnCell(e, d, slot.id)}
                      onClick={(e) => {
                        if (e.target === e.currentTarget) tapCell(d, slot.id);
                      }}
                    >
                      {here.map((s) => {
                        const task = s.taskId ? taskById.get(s.taskId) : undefined;
                        const bg = task?.color ?? UNASSIGNED.color;
                        const fg = task ? textColorFor(task.color) : UNASSIGNED.text;
                        const person = people.get(s.personId);
                        return (
                          <div key={s.id} className="shift-chip-wrap">
                            <button
                              type="button"
                              draggable
                              className="shift-chip"
                              style={{ background: bg, color: fg }}
                              onDragStart={(e) => startDrag(e, { kind: "shift", id: s.id })}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                const payload = readDrag(e);
                                if (payload?.kind === "task") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setHover(null);
                                  update(s.id, { taskId: payload.id });
                                }
                              }}
                              onClick={() => setMenu(menu === s.id ? null : s.id)}
                              aria-haspopup="menu"
                              aria-expanded={menu === s.id}
                              title={task ? `${person?.name}: ${task.name}` : `${person?.name}: no task yet`}
                            >
                              <span className="shift-chip-name">{person?.name ?? "Someone"}</span>
                              {task && <span className="shift-chip-task">{task.name}</span>}
                            </button>
                            {menu === s.id && (
                              <div className="shift-menu" role="menu" aria-label={`Change ${person?.name}'s shift`}>
                                {tasks.map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={s.taskId === t.id}
                                    className="shift-menu-item"
                                    onClick={() => {
                                      update(s.id, { taskId: t.id });
                                      setMenu(null);
                                    }}
                                  >
                                    <span className="swatch-dot" style={{ background: t.color }} />
                                    {t.name}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={s.taskId === null}
                                  className="shift-menu-item"
                                  onClick={() => {
                                    update(s.id, { taskId: null });
                                    setMenu(null);
                                  }}
                                >
                                  <span className="swatch-dot" style={{ background: UNASSIGNED.color }} />
                                  No task
                                </button>
                                <hr />
                                {person?.phone && (
                                  <a className="shift-menu-item" href={`tel:${person.phone}`}>
                                    Call {person.phone}
                                  </a>
                                )}
                                {person && (
                                  <a className="shift-menu-item" href={`mailto:${person.email}`}>
                                    Email {person.email}
                                  </a>
                                )}
                                <button type="button" role="menuitem" className="shift-menu-item is-danger" onClick={() => remove(s.id)}>
                                  Remove from shift
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {picked && (
                        <button type="button" className="shift-add no-print" onClick={() => tapCell(d, slot.id)}>
                          + Add here
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskPalette({
  tasks,
  setTasks,
  brush,
  setBrush,
  onDragTask,
  onError,
}: {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  brush: string | null;
  setBrush: (id: string | null) => void;
  onDragTask: (e: React.DragEvent, id: string) => void;
  onError: (err: unknown) => void;
}) {
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TASK_PALETTE[0]);

  function open(task: Task | "new") {
    setEditing(task);
    setName(task === "new" ? "" : task.name);
    const used = new Set(tasks.map((t) => t.color));
    setColor(task === "new" ? (TASK_PALETTE.find((c) => !used.has(c)) ?? TASK_PALETTE[0]) : task.color);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing === "new") {
        const created = await api<Task>("/api/admin/tasks", "POST", { name, color });
        setTasks((list) => [...list, created]);
        setBrush(created.id);
      } else if (editing) {
        const updated = await api<Task>(`/api/admin/tasks/${editing.id}`, "PATCH", { name, color });
        setTasks((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      }
      setEditing(null);
    } catch (err) {
      onError(err);
    }
  }

  async function del(task: Task) {
    if (!confirm(`Delete “${task.name}”? Shifts with this task stay on the calendar without a colour.`)) return;
    try {
      await api(`/api/admin/tasks/${task.id}`, "DELETE");
      setTasks((list) => list.filter((t) => t.id !== task.id));
      if (brush === task.id) setBrush(null);
      setEditing(null);
      // Shifts that had this task now show uncoloured; reload to reflect it.
      window.location.reload();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <div className="task-palette">
      <span className="task-palette-label">Task</span>
      <div role="radiogroup" aria-label="Task for new shifts" className="task-list">
        {tasks.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={brush === t.id}
            draggable
            onDragStart={(e) => onDragTask(e, t.id)}
            onClick={() => setBrush(t.id)}
            onDoubleClick={() => open(t)}
            className="task-pill"
            style={{ background: t.color, color: textColorFor(t.color) }}
            title="Click to use for new shifts. Drag onto a shift to recolour it. Double-click to edit."
          >
            {t.name}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={brush === null} onClick={() => setBrush(null)} className="task-pill" style={{ background: UNASSIGNED.color, color: UNASSIGNED.text }}>
          No task
        </button>
      </div>
      <div className="btn-row no-print" style={{ gap: 8, marginLeft: "auto" }}>
        {brush && tasks.find((t) => t.id === brush) && (
          <button type="button" className="link-button" onClick={() => open(tasks.find((t) => t.id === brush)!)}>
            Edit task
          </button>
        )}
        <button type="button" className="link-button" onClick={() => open("new")}>
          + New task
        </button>
      </div>

      {editing && (
        <form className="task-editor no-print" onSubmit={save}>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="task-name">Task name</label>
            <input id="task-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
          </div>
          <fieldset className="group" style={{ flex: "1 1 280px" }}>
            <legend>Colour</legend>
            <div className="color-choices">
              {TASK_PALETTE.map((c) => (
                <label key={c} className="color-choice" style={{ background: c }} title={c}>
                  <input type="radio" name="task-color" value={c} checked={color === c} onChange={() => setColor(c)} className="visually-hidden" />
                  <span aria-hidden="true" style={{ color: textColorFor(c) }}>
                    {color === c ? "✓" : ""}
                  </span>
                  <span className="visually-hidden">{c}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="btn-row" style={{ gap: 8, alignItems: "flex-end" }}>
            <button type="submit" className="btn btn--navy">
              {editing === "new" ? "Add task" : "Save"}
            </button>
            <button type="button" className="btn btn--outline" onClick={() => setEditing(null)}>
              Cancel
            </button>
            {editing !== "new" && (
              <button type="button" className="link-button is-danger" onClick={() => del(editing)}>
                Delete task
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
