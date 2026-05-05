"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export async function clearInteractionDate(formData: FormData) {
  await requireSession();

  const remote_jid = formData.get("remote_jid");
  if (typeof remote_jid !== "string" || !remote_jid.trim()) {
    return;
  }
  await prisma.user.update({
    where: { remote_jid },
    data: { interaction_date: null },
  });
  revalidatePath("/");
}
