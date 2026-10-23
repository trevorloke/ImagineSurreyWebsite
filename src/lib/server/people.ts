import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { people } from "@/lib/db/schema";

type PersonFields = Partial<Omit<typeof people.$inferInsert, "id" | "email" | "createdAt" | "updatedAt">>;

/**
 * Find or create the person for an email address. Fields that are provided
 * overwrite what we have; fields left undefined keep their stored value.
 */
export async function upsertPerson(db: Db, email: string, fields: PersonFields = {}) {
  const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as PersonFields;
  const [row] = await db
    .insert(people)
    .values({ email: email.toLowerCase(), ...defined })
    .onConflictDoUpdate({ target: people.email, set: { ...defined, updatedAt: sql`now()` } })
    .returning();
  return row;
}

export async function findPersonByEmail(db: Db, email: string) {
  return db.query.people.findFirst({ where: eq(people.email, email.toLowerCase()) });
}
