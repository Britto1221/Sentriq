import { NextResponse, type NextRequest } from "next/server";
import { authenticatedAccount, sessionCookie, clearTransactionCookie } from "../../../server/http";
import { getIntegrationRuntime } from "../../../server/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const current = await authenticatedAccount(request, integration);
  if (!current) {
    const response = NextResponse.json({ error: "Sign in with a passkey to continue." }, { status: 401 });
    if (request.cookies.has(sessionCookie)) clearTransactionCookie(response, sessionCookie, integration);
    return response;
  }
  return NextResponse.json({ account: { id: current.account.id, email: current.account.email, displayName: current.account.displayName } });
}
