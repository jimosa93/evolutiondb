import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";

export function jsonUnauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireApiAuth(
  request: NextRequest,
): Promise<NextResponse | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) {
    return jsonUnauthorized();
  }
  return null;
}
