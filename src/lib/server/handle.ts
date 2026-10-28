import "server-only";
import { error } from "./api";

/** Turn thrown errors into JSON responses; log anything unexpected. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    return error("Something went wrong on our end. Please try again, or email hello@imaginesurrey.ca.", 500);
  }
}

/** Starbase said no: its sentence and the field it names, for the form. */
export function refused(data: { error?: string; field?: string }, status: number): Response {
  const fields = data.field && data.field !== "form" ? { [data.field]: data.error ?? "Please check this field" } : undefined;
  return error(data.error ?? "Please check the highlighted fields.", status >= 500 ? 502 : 422, fields);
}
