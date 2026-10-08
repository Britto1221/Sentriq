import { SentriqApiError } from "@sentriq/sdk";
import { actionGrantCookieName, actionGrantCookiePath, getNorthstarProtectedContext, isProtectedContext, jsonReply, readCookie, readJsonBody, rejected } from "@/server/northstar-protected";
import { revokeNorthstarPasskey } from "@/server/auth-proxy";

function clearGrant(name: string): string {
  return `${name}=; Path=${actionGrantCookiePath("passkey.remove")}; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function POST(request: Request): Promise<Response> {
  const context = await getNorthstarProtectedContext(request);
  if (!isProtectedContext(context)) return context;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.credentialId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.credentialId)) {
    return rejected(400, "INVALID_REQUEST", "The passkey could not be removed.");
  }
  const credentialId = input.credentialId;
  const cookieName = actionGrantCookieName(context.applicationId, "passkey.remove");
  const grant = readCookie(request, cookieName);
  if (!grant) {
    try {
      const decision = await context.client.evaluate({
        applicationId: context.applicationId,
        userId: context.user.id,
        sessionId: context.session.id,
        actionId: "passkey.remove",
        resourceId: `passkey-${credentialId}`,
      }, context.sessionToken);
      if (decision.decision === "STEP_UP") return jsonReply(428, { decision: decision.decision, challengeId: decision.stepUpChallengeId, reasonCode: decision.reasonCode, correlationId: decision.correlationId });
      return jsonReply(403, { error: { code: "POLICY_DENIED", message: "A fresh passkey check is required before removing a passkey." } });
    } catch (error) {
      if (error instanceof SentriqApiError && error.status === 401) return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
      if (error instanceof SentriqApiError && error.status === 429) return rejected(429, "RATE_LIMITED", "Too many requests. Wait and try again.");
      return rejected(503, "SECURITY_UNAVAILABLE", "The security service could not verify this change.");
    }
  }

  try {
    const upstream = await revokeNorthstarPasskey(request, credentialId, grant);
    const headers = { "set-cookie": clearGrant(cookieName) };
    if (!upstream.ok) {
      const status = upstream.status === 401 ? 401 : upstream.status === 429 ? 429 : upstream.status === 403 ? 403 : 503;
      return jsonReply(status, { error: { code: status === 401 ? "UNAUTHORIZED" : status === 429 ? "RATE_LIMITED" : status === 403 ? "POLICY_DENIED" : "SECURITY_UNAVAILABLE", message: "The passkey could not be removed." } }, headers);
    }
    const payload: unknown = await upstream.json().catch(() => undefined);
    if (!payload || typeof payload !== "object" || (payload as { status?: unknown }).status !== "revoked") {
      return jsonReply(503, { error: { code: "SECURITY_UNAVAILABLE", message: "The passkey could not be removed." } }, headers);
    }
    return jsonReply(200, { status: "revoked" }, headers);
  } catch {
    return rejected(503, "SECURITY_UNAVAILABLE", "The security service could not verify this change.");
  }
}

export const GET = () => rejected(405, "METHOD_NOT_ALLOWED", "This route only accepts passkey removal requests.");
