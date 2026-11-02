"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { adminAction } from "@/lib/server/actions";
import { parseSessionCookie, PASSWORD_MIN_LENGTH, SESSION_COOKIE, type Permission } from "@/lib/server/admin-auth";
import { audit } from "@/lib/server/audit";
import { changeOwnPassword, renameSelf, signOutEverywhere } from "@/lib/server/staff";

// Handlers write their own audit entry (entity "admin_user" + the signed-in
// id); adminAction's auditAction argument is left out so there is one entry
// per action, not two. Passwords are never logged.

// Any signed-in admin may manage their own account: requireAdmin() skips the
// role check when no permission is given.
const ANY_ADMIN = undefined as unknown as Permission;

async function currentSessionId(): Promise<string | null> {
  return parseSessionCookie((await cookies()).get(SESSION_COOKIE)?.value)?.id ?? null;
}

export const renameAction = adminAction(ANY_ADMIN, z.object({ name: z.string().trim().min(1, "Enter your name").max(80) }), async (data, { user }) => {
  await renameSelf(getDb(), user.id, data.name);
  await audit(user, "account.rename", { from: user.name, to: data.name }, "admin_user", user.id);
  revalidatePath("/admin", "layout");
  return "Name saved.";
});

export const changePasswordAction = adminAction(
  ANY_ADMIN,
  z
    .object({
      currentPassword: z.string().max(200).optional().default(""),
      password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(200),
      confirm: z.string().max(200),
    })
    .refine((d) => d.password === d.confirm, { path: ["confirm"], error: "The two passwords don't match" }),
  async (data, { user }) => {
    await changeOwnPassword(getDb(), user.id, data.currentPassword, data.password, await currentSessionId());
    await audit(user, "account.password", {}, "admin_user", user.id);
    return "Password changed. Any other sessions have been signed out.";
  },
);

export const signOutEverywhereAction = adminAction(ANY_ADMIN, z.object({}), async (_data, { user }) => {
  await signOutEverywhere(getDb(), user.id);
  await audit(user, "account.signout-all", {}, "admin_user", user.id);
  (await cookies()).delete(SESSION_COOKIE);
  return { ok: true, message: "Signed out everywhere.", redirect: "/admin/login?signedout=1" };
});
