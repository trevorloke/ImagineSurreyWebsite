import { NextResponse, type NextRequest } from "next/server";
import { clearMemberSession } from "@/lib/server/member-auth";

export async function POST(req: NextRequest) {
  await clearMemberSession();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
