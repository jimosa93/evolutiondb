import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireApiAuth } from "@/lib/api-auth";
import { PAGE_SIZE } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

function buildWhere(
  q: string | null,
): Prisma.IntegrationSessionWhereInput | undefined {
  const trimmed = q?.trim();
  if (!trimmed) {
    return undefined;
  }
  return {
    remoteJid: {
      contains: trimmed,
      mode: "insensitive",
    },
  };
}

export async function GET(request: NextRequest) {
  const deny = await requireApiAuth(request);
  if (deny) {
    return deny;
  }

  const q = request.nextUrl.searchParams.get("q");
  let page = Math.max(
    1,
    parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1,
  );
  const where = buildWhere(q);
  const total = await prisma.integrationSession.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) {
    page = totalPages;
  }

  const sessions = await prisma.integrationSession.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      remoteJid: true,
      pushName: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      remoteJid: s.remoteJid,
      pushName: s.pushName,
      status: s.status,
      updatedAt: s.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
  });
}

export async function DELETE(request: NextRequest) {
  const deny = await requireApiAuth(request);
  if (deny) {
    return deny;
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { sessionId: id } }),
      prisma.integrationSession.delete({ where: { id } }),
    ]);
  } catch {
    return NextResponse.json(
      { error: "No se pudo eliminar la sesión." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
