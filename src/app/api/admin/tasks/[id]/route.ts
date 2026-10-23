import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { volunteerTasks } from "@/lib/db/schema";
import { error, json } from "@/lib/server/api";
import { adminOnly, isUniqueViolation, readJson } from "@/lib/server/admin-api";
import { updateTaskSchema } from "@/lib/shift-validation";

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/tasks/[id]">) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = updateTaskSchema.safeParse(await readJson(req));
  if (!parsed.success) return error("Check the task.", 422);
  try {
    const [row] = await getDb().update(volunteerTasks).set(parsed.data).where(eq(volunteerTasks.id, id)).returning();
    return row ? json(row) : error("That task no longer exists.", 404);
  } catch (err) {
    if (isUniqueViolation(err)) return error("There's already a task with that name.", 409);
    throw err;
  }
}

// Shifts with this task stay on the calendar, uncoloured.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/tasks/[id]">) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { id } = await ctx.params;
  await getDb().delete(volunteerTasks).where(eq(volunteerTasks.id, id));
  return json({ ok: true });
}
