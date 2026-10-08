import { NextResponse, type NextRequest } from "next/server";
import { requireSameOrigin } from "../../../../server/http";
import { getIntegrationRuntime } from "../../../../server/runtime";
import { allowEmailRequest, allowLoginAttempt } from "../../../../server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const rejected = requireSameOrigin(request, integration);
  if (rejected) return rejected;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Could not start passkey sign-in." }, { status: 400 }); }
  const email = body && typeof body === "object" && typeof (body as Record<string, unknown>).email === "string"
    ? (body as { email: string }).email.trim().toLowerCase() : "";
  if (email && !allowEmailRequest(email) || !allowLoginAttempt()) return NextResponse.json({ error: "Too many attempts. Wait a little, then try again." }, { status: 429 });
  try {
    // The email is a user-facing hint only. The verified credential's userHandle
    // determines the account; the browser cannot choose the session owner.
    return NextResponse.json(await integration.passkeys.authenticationOptions({ origin: integration.origin }));
  } catch {
    return NextResponse.json({ error: "Could not start passkey sign-in." }, { status: 400 });
  }
}
