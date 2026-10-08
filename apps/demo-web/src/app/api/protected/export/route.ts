import { SentriqApiError } from "@sentriq/sdk";
import { actionGrantCookieName, actionGrantCookiePath, getNorthstarProtectedContext, isProtectedContext, jsonReply, readCookie, readJsonBody, rejected } from "@/server/northstar-protected";

const grantMaxAge = 60;

function clearGrantCookie(name: string): string {
  return `${name}=; Path=${actionGrantCookiePath("data.export")}; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function mapError(error: unknown): Response {
  if (error instanceof SentriqApiError) {
    if (error.status === 401) return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    if (error.status === 403) return rejected(403, "POLICY_DENIED", "The security policy did not approve this export.");
    if (error.status === 429) return rejected(429, "RATE_LIMITED", "Too many requests. Wait and try again.");
  }
  return rejected(503, "SECURITY_UNAVAILABLE", "The security service could not verify this export. Try again later.");
}

export async function POST(request: Request): Promise<Response> {
  const context = await getNorthstarProtectedContext(request);
  if (!isProtectedContext(context)) return context;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (Object.keys(body as object).some((key) => key !== "format")) return rejected(400, "INVALID_REQUEST", "The request could not be completed.");
  const format = (body as { format?: unknown }).format;
  if (format !== "json" && format !== "csv") return rejected(400, "INVALID_REQUEST", "Choose a supported export format.");

  const cookieName = actionGrantCookieName(context.applicationId, "data.export");
  const grant = readCookie(request, cookieName);
  try {
    const result = await context.client.evaluate({
      applicationId: context.applicationId,
      userId: context.user.id,
      sessionId: context.session.id,
      actionId: "data.export",
      resourceId: context.resourceId,
      ...(grant ? { stepUpGrantId: grant } : {}),
    }, context.sessionToken);

    if (result.decision === "STEP_UP") {
      return jsonReply(428, { decision: result.decision, challengeId: result.stepUpChallengeId, reasonCode: result.reasonCode, correlationId: result.correlationId }, grant ? { "set-cookie": clearGrantCookie(cookieName) } : undefined);
    }
    if (result.decision !== "ALLOW") return jsonReply(403, { error: { code: "POLICY_DENIED", message: "The security policy did not approve this export." } }, grant ? { "set-cookie": clearGrantCookie(cookieName) } : undefined);

    // The download is built from the authenticated account record returned by the verified API session.
    const payload = { subject: { id: context.user.id, email: context.user.email, displayName: context.user.displayName }, createdAt: new Date().toISOString() };
    const headers: Record<string, string> = { "content-disposition": `attachment; filename="northstar-account-export.${format}"` };
    if (format === "csv") {
      const esc = (value: string) => `"${value.replaceAll('"', '""')}"`;
      const csv = ["field,value", `id,${esc(payload.subject.id)}`, `email,${esc(payload.subject.email)}`, `displayName,${esc(payload.subject.displayName)}`, `createdAt,${esc(payload.createdAt)}`].join("\r\n");
      headers["content-type"] = "text/csv; charset=utf-8";
      if (grant) headers["set-cookie"] = clearGrantCookie(cookieName);
      return new Response(csv, { status: 200, headers });
    }
    headers["content-type"] = "application/json; charset=utf-8";
    headers["cache-control"] = "no-store";
    if (grant) headers["set-cookie"] = clearGrantCookie(cookieName);
    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (error) { return mapError(error); }
}

export const GET = () => rejected(405, "METHOD_NOT_ALLOWED", "This route only accepts export requests.");
