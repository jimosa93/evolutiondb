import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const GLOBAL_KEY = "global";

function toResponse(setting: { available: boolean; updatedAt: Date }) {
  return {
    available: setting.available,
    updatedAt: setting.updatedAt.toISOString(),
  };
}

export async function GET() {
  const setting = await prisma.availabilitySetting.findUnique({
    where: { key: GLOBAL_KEY },
  });

  if (!setting) {
    return NextResponse.json(
      { error: "Availability setting is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(toResponse(setting), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: NextRequest) {
  const deny = await requireApiAuth(request);
  if (deny) return deny;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const available =
    typeof body === "object" && body !== null && "available" in body
      ? (body as { available?: unknown }).available
      : undefined;

  if (typeof available !== "boolean") {
    return NextResponse.json(
      { error: "available must be a boolean" },
      { status: 400 },
    );
  }

  const setting = await prisma.availabilitySetting.upsert({
    where: { key: GLOBAL_KEY },
    update: { available },
    create: { key: GLOBAL_KEY, available },
  });

  return NextResponse.json(toResponse(setting), {
    headers: { "Cache-Control": "no-store" },
  });
}
