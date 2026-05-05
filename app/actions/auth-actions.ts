"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME, createSessionToken } from "@/lib/auth-session";

export async function loginAction(formData: FormData) {
  const password = formData.get("password");
  const expected = process.env.ADMIN_PASSWORD;
  if (
    !expected ||
    typeof password !== "string" ||
    password !== expected
  ) {
    redirect("/login?error=invalid");
  }

  const token = await createSessionToken();
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  redirect("/");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
