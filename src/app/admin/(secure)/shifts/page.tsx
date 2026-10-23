import { ShiftBoard } from "@/components/admin/ShiftBoard";
import { getDb } from "@/lib/db";
import { ISO_DATE_RE, todayInSurrey, weekStart } from "@/lib/shifts";
import { loadRoster, loadTasks, loadWeekShifts } from "@/lib/server/shifts";

export default async function ShiftsPage({ searchParams }: PageProps<"/admin/shifts">) {
  const { week } = await searchParams;
  const today = todayInSurrey();
  const sunday = weekStart(typeof week === "string" && ISO_DATE_RE.test(week) ? week : today);
  const db = getDb();
  const [shifts, tasks, roster] = await Promise.all([loadWeekShifts(db, sunday), loadTasks(db), loadRoster(db, sunday)]);

  return (
    <ShiftBoard
      key={sunday}
      sunday={sunday}
      today={today}
      initialShifts={shifts}
      initialTasks={tasks.map(({ id, name, color }) => ({ id, name, color }))}
      initialRoster={roster}
    />
  );
}
