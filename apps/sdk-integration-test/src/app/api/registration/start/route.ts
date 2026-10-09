import { NextResponse, type NextRequest } from "next/server";
import { allowSignupRequest } from "../../../../server/rate-limit";
import { getIntegrationRuntime } from "../../../../server/runtime";
import { badInput, pendingRegistrationCookie, requireSameOrigin, setTransactionCookie } from "../../../../server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const rejected = requireSameOrigin(request, integration);
  if (rejected) return rejected;
  if (!allowSignupRequest(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local")) return NextResponse.json({ error: "Please wait before creating another account." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return badInput(); }
  if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || typeof (body as Record<string, unknown>).displayName !== "string") return badInput();
  const displayName = (body as { displayName: string }).displayName.trim();
  if (!displayName || displayName.length > 100) return badInput();
  try {
    const created = await integration.storage.createAccount({ displayName });
    const response = NextResponse.json({ message: "Account created. Next, create a passkey.", accountId: created.account.id });
    setTransactionCookie(response, pendingRegistrationCookie, created.enrollmentToken, integration, 10 * 60);
    return response;
  } catch {
    return NextResponse.json({ error: "Account registration could not be started." }, { status: 503 });
  }
}
