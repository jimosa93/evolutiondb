import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "evolution_admin_session";

function encodeSecret(): Uint8Array | null {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd?.trim()) {
    return null;
  }
  return new TextEncoder().encode(pwd);
}

export async function createSessionToken(): Promise<string> {
  const secret = encodeSecret();
  if (!secret) {
    throw new Error("ADMIN_PASSWORD is not configured");
  }
  return new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const secret = encodeSecret();
  if (!secret || !token?.trim()) {
    return false;
  }
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}
