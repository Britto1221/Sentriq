import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthenticatedUser, AuthSession } from "@/lib/auth-client";
import { handleAuthProxy } from "./auth-proxy";

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthenticatedUser>;
  return typeof user.id === "string" && (user.email === undefined || user.email === null || typeof user.email === "string") && typeof user.displayName === "string"
    && (user.role === "user" || user.role === "developer" || user.role === "admin")
    && typeof user.applicationId === "string" && typeof user.passkeyEnrollmentRequired === "boolean";
}

export async function currentNorthstarSession(): Promise<AuthSession | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  const origin = process.env.NORTHSTAR_PUBLIC_ORIGIN ?? "http://localhost:3001";
  const response = await handleAuthProxy(new Request(`${origin}/api/auth/session`, { headers: { cookie } }), ["session"]);
  if (!response.ok) return null;
  let payload: unknown;
  try { payload = await response.json(); } catch { return null; }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { user?: unknown; session?: unknown };
  if (!isAuthenticatedUser(record.user) || !record.session || typeof record.session !== "object") return null;
  const session = record.session as { id?: unknown; expiresAt?: unknown };
  if (typeof session.id !== "string" || typeof session.expiresAt !== "string") return null;
  return { user: record.user, session: { id: session.id, expiresAt: session.expiresAt } };
}

export async function requireNorthstarSession(): Promise<AuthSession> {
  const session = await currentNorthstarSession();
  if (!session) redirect("/login");
  return session;
}
