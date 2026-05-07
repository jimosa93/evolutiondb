import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireApiAuth } from "@/lib/api-auth";
import { PAGE_SIZE } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

function buildWhere(q: string | null): Prisma.UserWhereInput | undefined {
  const trimmed = q?.trim();
  if (!trimmed) {
    return undefined;
  }
  return {
    remote_jid: {
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
  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) {
    page = totalPages;
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { remote_jid: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return NextResponse.json({
    users: users.map((u) => ({
      remote_jid: u.remote_jid,
      interaction_date: u.interaction_date?.toISOString() ?? null,
      contact_name: u.contact_name,
      createdAt: u.createdAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
  });
}
