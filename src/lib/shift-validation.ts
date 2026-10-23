import { z } from "zod";
import { HEX_COLOR_RE, ISO_DATE_RE } from "./shifts";

const slot = z.enum(["morning", "afternoon", "evening"]);
const isoDate = z.string().regex(ISO_DATE_RE);
const taskId = z.uuid().nullable();

export const createShiftSchema = z.object({ personId: z.uuid(), date: isoDate, slot, taskId }).strict();
export const updateShiftSchema = z.object({ date: isoDate.optional(), slot: slot.optional(), taskId: taskId.optional() }).strict();
export const copyWeekSchema = z.object({ from: isoDate, to: isoDate }).strict();

const name = z.string().trim().min(1, "Give the task a name").max(40);
const color = z.string().regex(HEX_COLOR_RE, "Pick a colour");
export const createTaskSchema = z.object({ name, color }).strict();
export const updateTaskSchema = z.object({ name: name.optional(), color: color.optional() }).strict();
