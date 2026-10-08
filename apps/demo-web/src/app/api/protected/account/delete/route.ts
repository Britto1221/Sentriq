import { SentriqApiError } from "@sentriq/sdk";
import { actionGrantCookieName, actionGrantCookiePath, getNorthstarProtectedContext, isProtectedContext, jsonReply, readCookie, readJsonBody, rejected } from "@/server/northstar-protected";
import { deleteNorthstarAccount } from "@/server/auth-proxy";

function clearGrant(name: string): string {
  return `${name}=; Path=${actionGrantCookiePath("account.delete")}; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function POST(request: Request): Promise<Response> {
  const context = await getNorthstarProtectedContext(request);
  if (!isProtectedContext(context)) return context;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (Object.keys(body as object).length !== 0) return rejected(400, "INVALID_REQUEST", "The request could not be completed.");

  const cookieName = actionGrantCookieName(context.applicationId, "account.delete");
  const grant = readCookie(request, cookieName);
  try {
    const decision = await context.client.evaluate({
      applicationId: context.applicationId,
      userId: context.user.id,
      sessionId: context.session.id,
      actionId: "account.delete",
      resourceId: context.resourceId,
      ...(grant ? { stepUpGrantId: grant } : {}),
    }, context.sessionToken);
    if (decision.decision === "STEP_UP") return jsonReply(428, { decision: decision.decision, challengeId: decision.stepUpChallengeId, reasonCode: decision.reasonCode, correlationId: decision.correlationId });
    if (decision.decision !== "ALLOW") return jsonReply(403, { error: { code: "POLICY_DENIED", message: "The security policy did not approve this account deletion." } }, grant ? { "set-cookie": clearGrant(cookieName) } : undefined);

    const result = await deleteNorthstarAccount(request);
    if (!result.ok) {
      const status = result.status === 401 ? 401 : result.status === 429 ? 429 : 503;
      return jsonReply(status, { error: { code: status === 401 ? "UNAUTHORIZED" : status === 429 ? "RATE_LIMITED" : "AUTH_UNAVAILABLE", message: "The account could not be deleted." } }, grant ? { "set-cookie": clearGrant(cookieName) } : undefined);
    }
    const responseHeaders = new Headers();
    const sessionCookie = result.headers.get("set-cookie");
    if (!sessionCookie) return rejected(503, "AUTH_UNAVAILABLE", "The account could not be deleted.");
    responseHeaders.append("set-cookie", sessionCookie);
    if (grant) responseHeaders.append("set-cookie", clearGrant(cookieName));
    return jsonReply(200, { status: "deleted" }, responseHeaders);
  } catch (error) {
    if (error instanceof SentriqApiError && error.status === 401) return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    if (error instanceof SentriqApiError && error.status === 429) return rejected(429, "RATE_LIMITED", "Too many requests. Wait and try again.");
    if (error instanceof SentriqApiError && error.status === 403) return rejected(403, "POLICY_DENIED", "The security policy did not approve this account deletion.");
    return rejected(503, "SECURITY_UNAVAILABLE", "The security service could not verify this deletion.");
  }
}

export const GET = () => rejected(405, "METHOD_NOT_ALLOWED", "This route only accepts deletion requests.");
