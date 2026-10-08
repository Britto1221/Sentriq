import { SentriqApiError } from "@sentriq/sdk";
import { stepUpVerifyInputSchema } from "@sentriq/shared";
import { actionGrantCookieName, actionGrantCookiePath, getNorthstarProtectedContext, isProtectedContext, jsonReply, readJsonBody, rejected } from "@/server/northstar-protected";

export async function POST(request: Request): Promise<Response> {
  const context = await getNorthstarProtectedContext(request);
  if (!isProtectedContext(context)) return context;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const input = body as Record<string, unknown>;
  const actionId = input.actionId;
  const { actionId: _action, ...verifyInput } = input;
  if (actionId !== "data.export" && actionId !== "account.delete" && actionId !== "session.revoke" && actionId !== "passkey.remove") return rejected(400, "INVALID_REQUEST", "The verification response could not be completed.");
  const parsed = stepUpVerifyInputSchema.safeParse(verifyInput);
  if (!parsed.success) return rejected(400, "INVALID_REQUEST", "The verification response could not be completed.");
  try {
    const result = await context.client.stepUpVerify(parsed.data, context.sessionToken);
    const name = actionGrantCookieName(context.applicationId, actionId);
    const cookie = `${name}=${result.stepUpGrantId}; Path=${actionGrantCookiePath(actionId)}; HttpOnly; SameSite=Strict; Max-Age=60${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
    return jsonReply(200, { verified: true, expiresAt: result.expiresAt }, { "set-cookie": cookie });
  } catch (error) {
    if (error instanceof SentriqApiError && error.status === 401) return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    if (error instanceof SentriqApiError && error.status === 429) return rejected(429, "RATE_LIMITED", "Too many attempts. Wait and try again.");
    return rejected(403, "VERIFICATION_FAILED", "Verification could not be completed. Try the protected action again.");
  }
}
