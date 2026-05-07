import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const deny = await requireApiAuth(request);
  if (deny) {
    return deny;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("remote_jid" in body) ||
    typeof (body as { remote_jid: unknown }).remote_jid !== "string"
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const remote_jid = (body as { remote_jid: string }).remote_jid.trim();
  if (!remote_jid) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  await prisma.user.update({
    where: { remote_jid },
    data: { interaction_date: null },
  });

  return NextResponse.json({ ok: true });
}
