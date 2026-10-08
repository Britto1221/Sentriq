import { NextResponse, type NextRequest } from "next/server";
import type { AuthenticationResponseJSON } from "@sentriq/core";
import { requireSameOrigin, sessionCookie, setTransactionCookie } from "../../../../server/http";
import { getIntegrationRuntime } from "../../../../server/runtime";
import { allowLoginAttempt } from "../../../../server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const rejected = requireSameOrigin(request, integration);
  if (rejected) return rejected;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Passkey sign-in could not be verified." }, { status: 400 }); }
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).challengeId !== "string" || !("response" in body)) {
    return NextResponse.json({ error: "Passkey sign-in could not be verified." }, { status: 400 });
  }
  const responseBody = body as { challengeId: string; response: AuthenticationResponseJSON };
  if (!allowLoginAttempt()) {
    return NextResponse.json({ error: "Too many attempts. Wait a little, then try again." }, { status: 429 });
  }
  try {
    const verified = await integration.passkeys.authenticationVerify(responseBody);
    const response = NextResponse.json({ message: "Signed in with your passkey." });
    setTransactionCookie(response, sessionCookie, verified.session.id, integration, Math.floor((verified.session.expiresAt.getTime() - Date.now()) / 1000));
    return response;
  } catch {
    return NextResponse.json({ error: "Passkey sign-in could not be verified. Check your passkey and try again." }, { status: 401 });
  }
}
