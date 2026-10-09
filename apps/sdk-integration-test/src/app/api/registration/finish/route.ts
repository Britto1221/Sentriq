import { NextResponse, type NextRequest } from "next/server";
import type { RegistrationResponseJSON } from "@sentriq/core";
import { clearTransactionCookie, pendingRegistrationCookie, requireSameOrigin } from "../../../../server/http";
import { getIntegrationRuntime } from "../../../../server/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const rejected = requireSameOrigin(request, integration);
  if (rejected) return rejected;
  const token = request.cookies.get(pendingRegistrationCookie)?.value;
  if (!token) return NextResponse.json({ error: "Start a new account registration before creating a passkey." }, { status: 401 });
  const account = await integration.storage.getPendingRegistration(token);
  if (!account) return NextResponse.json({ error: "The registration has expired. Start again." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "The passkey response could not be verified." }, { status: 400 }); }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "The passkey response could not be verified." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (typeof input.challengeId !== "string" || !("response" in input)) return NextResponse.json({ error: "The passkey response could not be verified." }, { status: 400 });
  try {
    await integration.passkeys.registrationVerify({ account, registrationContext: token, challengeId: input.challengeId, response: input.response as RegistrationResponseJSON });
    const response = NextResponse.json({ message: "Passkey created. Your account is ready." });
    clearTransactionCookie(response, pendingRegistrationCookie, integration);
    return response;
  } catch {
    return NextResponse.json({ error: "Passkey verification failed. Start the passkey step again." }, { status: 400 });
  }
}
