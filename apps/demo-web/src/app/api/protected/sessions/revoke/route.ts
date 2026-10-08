import { SentriqApiError } from "@sentriq/sdk";
import { actionGrantCookieName, actionGrantCookiePath, getNorthstarProtectedContext, isProtectedContext, jsonReply, readCookie, readJsonBody, rejected } from "@/server/northstar-protected";
import { revokeNorthstarSession } from "@/server/auth-proxy";

function clearGrant(name: string): string {
  return `${name}=; Path=${actionGrantCookiePath("session.revoke")}; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function POST(request: Request): Promise<Response> {
  const context = await getNorthstarProtectedContext(request);
  if (!isProtectedContext(context)) return context;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.sessionId)) {
    return rejected(400, "INVALID_REQUEST", "The session could not be revoked.");
  }
  const cookieName = actionGrantCookieName(context.applicationId, "session.revoke");
  const grant = readCookie(request, cookieName);
  try {
    const decision = await context.client.evaluate({
      applicationId: context.applicationId,
      userId: context.user.id,
      sessionId: context.session.id,
      actionId: "session.revoke",
      resourceId: context.resourceId,
      ...(grant ? { stepUpGrantId: grant } : {}),
    }, context.sessionToken);
    if (decision.decision === "STEP_UP") return jsonReply(428, { decision: "STEP_UP", challengeId: decision.stepUpChallengeId, reasonCode: decision.reasonCode, correlationId: decision.correlationId });
    if (decision.decision !== "ALLOW") return jsonReply(403, { error: { code: "POLICY_DENIED", message: "The security policy did not approve this session change." } }, grant ? { "set-cookie": clearGrant(cookieName) } : undefined);

    const result = await revokeNorthstarSession(request, input.sessionId);
    if (!result.ok) {
      const status = result.status === 401 ? 401 : result.status === 429 ? 429 : 400;
      return jsonReply(status, { error: { code: status === 401 ? "UNAUTHORIZED" : status === 429 ? "RATE_LIMITED" : "SESSION_UNAVAILABLE", message: "The session could not be revoked." } }, grant ? { "set-cookie": clearGrant(cookieName) } : undefined);
    }
    await result.body?.cancel();
    return jsonReply(200, { status: "revoked" }, grant ? { "set-cookie": clearGrant(cookieName) } : undefined);
  } catch (error) {
    if (error instanceof SentriqApiError && error.status === 401) return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    if (error instanceof SentriqApiError && error.status === 429) return rejected(429, "RATE_LIMITED", "Too many requests. Wait and try again.");
    if (error instanceof SentriqApiError && error.status === 403) return rejected(403, "POLICY_DENIED", "The security policy did not approve this session change.");
    return rejected(503, "SECURITY_UNAVAILABLE", "The security service could not verify this change.");
  }
}
