import { NextResponse, type NextRequest } from "next/server";
import { pendingRegistrationCookie, requireSameOrigin, setTransactionCookie } from "../../../../server/http";
import { getIntegrationRuntime } from "../../../../server/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const rejected = requireSameOrigin(request, integration);
  if (rejected) return rejected;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter the email address and code." }, { status: 400 }); }
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).email !== "string" || typeof (body as Record<string, unknown>).code !== "string") {
    return NextResponse.json({ error: "Enter the email address and code." }, { status: 400 });
  }
  const { email, code } = body as { email: string; code: string };
  if (email.length > 254 || code.length > 64 || !code.length) return NextResponse.json({ error: "The code could not be verified." }, { status: 400 });
  const result = await integration.storage.verifyEmailCode({ email: email.trim().toLowerCase(), code });
  if (!result) return NextResponse.json({ error: "The code could not be verified. Request a new code and try again." }, { status: 400 });
  if (!result.registrationToken) return NextResponse.json({ error: "This verified email already has a passkey. Continue with passkey sign-in." }, { status: 409 });
  const response = NextResponse.json({ message: "Email verified. Next, create a passkey on this device." });
  setTransactionCookie(response, pendingRegistrationCookie, result.registrationToken, integration, 10 * 60);
  return response;
}
