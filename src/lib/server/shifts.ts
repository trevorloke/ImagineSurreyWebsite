import "server-only";
import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { people, shifts, volunteerTasks } from "@/lib/db/schema";
import { addDays } from "@/lib/shifts";

export type RosterPerson = { id: string; name: string; email: string; phone: string | null; neighbourhood: string | null };

const personColumns = {
  id: people.id,
  firstName: people.firstName,
  lastName: people.lastName,
  email: people.email,
  phone: people.phone,
  neighbourhood: people.neighbourhood,
};

function toRoster(p: { id: string; firstName: string | null; lastName: string | null; email: string; phone: string | null; neighbourhood: string | null }): RosterPerson {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email;
  return { id: p.id, name, email: p.email, phone: p.phone, neighbourhood: p.neighbourhood };
}

export async function loadTasks(db: Db) {
  return db.select().from(volunteerTasks).orderBy(asc(volunteerTasks.sortOrder), asc(volunteerTasks.name));
}

export async function loadWeekShifts(db: Db, sunday: string) {
  return db
    .select({ id: shifts.id, personId: shifts.personId, date: shifts.date, slot: shifts.slot, taskId: shifts.taskId })
    .from(shifts)
    .where(and(gte(shifts.date, sunday), lte(shifts.date, addDays(sunday, 6))));
}

/** People who said they'd volunteer, plus anyone already on a shift this week. */
export async function loadRoster(db: Db, sunday: string): Promise<RosterPerson[]> {
  const scheduled = db
    .select({ personId: shifts.personId })
    .from(shifts)
    .where(and(gte(shifts.date, sunday), lte(shifts.date, addDays(sunday, 6))));
  const rows = await db
    .select(personColumns)
    .from(people)
    .where(or(eq(people.interestVolunteer, true), inArray(people.id, scheduled)))
    .orderBy(asc(people.firstName), asc(people.lastName))
    .limit(2000);
  return rows.map(toRoster);
}

/** Find anyone in the database by name or email, to schedule someone not yet on the roster. */
export async function searchPeople(db: Db, query: string): Promise<RosterPerson[]> {
  const like = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select(personColumns)
    .from(people)
    .where(
      or(
        sql`${people.email} ilike ${like}`,
        sql`coalesce(${people.firstName}, '') || ' ' || coalesce(${people.lastName}, '') ilike ${like}`,
      ),
    )
    .orderBy(asc(people.firstName))
    .limit(20);
  return rows.map(toRoster);
}
