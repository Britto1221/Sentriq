import { NextResponse, type NextRequest } from "next/server";
import { getIntegrationRuntime } from "../../../server/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "The local inbox is disabled." }, { status: 404 });
  const integration = await getIntegrationRuntime();
  if (request.headers.get("origin") && request.headers.get("origin") !== integration.origin) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  const email = request.nextUrl.searchParams.get("email") ?? "";
  if (!email || email.length > 254) return NextResponse.json({ error: "No verification message is available." }, { status: 404 });
  const message = integration.storage.getDevelopmentEmailCode(email);
  return message ? NextResponse.json({ code: message.code, expiresAt: message.expiresAt }) : NextResponse.json({ error: "No verification message is available." }, { status: 404 });
}
