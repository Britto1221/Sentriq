import { NextResponse, type NextRequest } from "next/server";
import { authenticatedAccount } from "../../../server/http";
import { getIntegrationRuntime } from "../../../server/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const integration = await getIntegrationRuntime();
  const current = await authenticatedAccount(request, integration);
  if (!current) return NextResponse.json({ error: "Sign in to manage passkeys." }, { status: 401 });
  return NextResponse.json({ passkeys: await integration.storage.getCredentialSummaries(current.account.id) });
}
