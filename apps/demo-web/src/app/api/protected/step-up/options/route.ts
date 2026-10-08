import { SentriqApiError } from "@sentriq/sdk";
import { stepUpOptionsResultSchema } from "@sentriq/shared";
import { getNorthstarProtectedContext, isProtectedContext, jsonReply, readJsonBody, rejected } from "@/server/northstar-protected";

export async function POST(request: Request): Promise<Response> {
  const context = await getNorthstarProtectedContext(request);
  if (!isProtectedContext(context)) return context;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (Object.keys(body as object).length !== 1 || typeof (body as { challengeId?: unknown }).challengeId !== "string" || !/^[0-9a-f-]{36}$/i.test((body as { challengeId: string }).challengeId)) {
    return rejected(400, "INVALID_REQUEST", "The verification request could not be completed.");
  }
  const origin = process.env.NORTHSTAR_PUBLIC_ORIGIN ?? "http://localhost:3001";
  try {
    const result = await context.client.stepUpOptions({ challengeId: (body as { challengeId: string }).challengeId, origin }, context.sessionToken);
    const parsed = stepUpOptionsResultSchema.safeParse(result);
    return parsed.success ? jsonReply(200, parsed.data) : rejected(503, "SECURITY_UNAVAILABLE", "Verification is temporarily unavailable.");
  } catch (error) {
    if (error instanceof SentriqApiError && error.status === 401) return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    if (error instanceof SentriqApiError && error.status === 403) return rejected(403, "VERIFICATION_UNAVAILABLE", "This verification request has expired. Try the protected action again.");
    return rejected(503, "SECURITY_UNAVAILABLE", "Verification is temporarily unavailable.");
  }
}
