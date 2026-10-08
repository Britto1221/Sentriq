import { NextResponse, type NextRequest } from "next/server";
import { authenticatedAccount, clearTransactionCookie, requireSameOrigin, sessionCookie } from "../../../server/http";
import { getIntegrationRuntime } from "../../../server/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const rejected = requireSameOrigin(request, integration);
  if (rejected) return rejected;
  const current = await authenticatedAccount(request, integration);
  if (current) await integration.storage.revokeSession(current.token);
  const response = NextResponse.json({ message: "Signed out." });
  clearTransactionCookie(response, sessionCookie, integration);
  return response;
}
