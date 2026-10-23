import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { volunteerTasks } from "@/lib/db/schema";
import { error, json } from "@/lib/server/api";
import { adminOnly, readJson } from "@/lib/server/admin-api";
import { createTaskSchema } from "@/lib/shift-validation";
import { fieldErrors } from "@/lib/validation";

export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = createTaskSchema.safeParse(await readJson(req));
  if (!parsed.success) return error("Check the task.", 422, fieldErrors(parsed.error));
  const [row] = await getDb()
    .insert(volunteerTasks)
    .values({ ...parsed.data, sortOrder: sql`coalesce((select max(sort_order) + 1 from volunteer_tasks), 0)` })
    .onConflictDoNothing()
    .returning();
  return row ? json(row) : error("There's already a task with that name.", 409);
}
