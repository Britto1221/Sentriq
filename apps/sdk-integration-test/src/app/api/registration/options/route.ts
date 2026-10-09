import { NextResponse, type NextRequest } from "next/server";
import { pendingRegistrationCookie, requireSameOrigin } from "../../../../server/http";
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
  try {
    const result = await integration.passkeys.registrationOptions({ account, origin: integration.origin, registrationContext: token });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Passkey registration could not be started." }, { status: 400 });
  }
}
