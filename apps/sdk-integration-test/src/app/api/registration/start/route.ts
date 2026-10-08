import { NextResponse, type NextRequest } from "next/server";
import { allowEmailRequest } from "../../../../server/rate-limit";
import { getIntegrationRuntime } from "../../../../server/runtime";
import { badInput, requireSameOrigin } from "../../../../server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const rejected = requireSameOrigin(request, integration);
  if (rejected) return rejected;
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Configure a verified email sender before enabling registration." }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return badInput(); }
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).email !== "string") return badInput();
  const email = ((body as { email: string }).email).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badInput();
  if (!allowEmailRequest(email)) return NextResponse.json({ error: "Please wait before requesting another verification code." }, { status: 429 });
  try {
    await integration.storage.startEmailVerification(email);
    return NextResponse.json({ message: "If this address can be registered, a verification code is ready in the local development inbox." }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_RATE_LIMITED") return NextResponse.json({ error: "Please wait before requesting another verification code." }, { status: 429 });
    return NextResponse.json({ error: "Email verification is temporarily unavailable." }, { status: 503 });
  }
}
