import { NextResponse, type NextRequest } from "next/server";
import type { IntegrationRuntime } from "./runtime";

export const pendingRegistrationCookie = "sentriq_pending_registration";
export const sessionCookie = "sdk_integration_session";

export function requireSameOrigin(request: NextRequest, runtime: IntegrationRuntime): NextResponse | null {
  if (request.headers.get("origin") !== runtime.origin) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  return null;
}

export function setTransactionCookie(response: NextResponse, name: string, value: string, runtime: IntegrationRuntime, maxAge: number): void {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: runtime.origin.startsWith("https://"),
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export function clearTransactionCookie(response: NextResponse, name: string, runtime: IntegrationRuntime): void {
  setTransactionCookie(response, name, "", runtime, 0);
}

export async function authenticatedAccount(request: NextRequest, runtime: IntegrationRuntime) {
  const token = request.cookies.get(sessionCookie)?.value;
  if (!token) return null;
  const session = await runtime.storage.getSessionByToken(token);
  if (!session || session.status !== "active") return null;
  const account = await runtime.storage.getAccountById(session.userId);
  return account?.active ? { account, token } : null;
}

export function badInput(): NextResponse {
  return NextResponse.json({ error: "Check the information and try again." }, { status: 400 });
}

export function genericFailure(status = 400): NextResponse {
  return NextResponse.json({ error: "The request could not be completed. Check the details and try again." }, { status });
}
