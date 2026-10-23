import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shifts } from "@/lib/db/schema";
import { error, json } from "@/lib/server/api";
import { adminOnly, isUniqueViolation, readJson } from "@/lib/server/admin-api";
import { updateShiftSchema } from "@/lib/shift-validation";

// Move a shift to another day or time, or change its task.
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/shifts/[id]">) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = updateShiftSchema.safeParse(await readJson(req));
  if (!parsed.success) return error("Invalid change.", 422);
  try {
    const [row] = await getDb()
      .update(shifts)
      .set(parsed.data)
      .where(eq(shifts.id, id))
      .returning({ id: shifts.id, personId: shifts.personId, date: shifts.date, slot: shifts.slot, taskId: shifts.taskId });
    return row ? json(row) : error("That shift no longer exists.", 404);
  } catch (err) {
    if (isUniqueViolation(err)) return error("They're already on that shift.", 409);
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/shifts/[id]">) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { id } = await ctx.params;
  await getDb().delete(shifts).where(eq(shifts.id, id));
  return json({ ok: true });
}
