import type { FastifyInstance, FastifyReply, FastifyRequest, RouteHandlerMethod } from "fastify";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { registrationResponseSchema } from "@sentriq/shared";
import { z } from "zod";
import { authenticateApplication, type ApplicationScope } from "../app";
import { digestToken, type Database } from "../db/index";
import type { ApiConfig } from "../config";
import { AuthenticationError, createAuthService, sessionCookie } from "./service";

const accountId = z.string().trim().min(1).max(64);
const empty = z.object({}).strict();
const originInput = z.object({ origin: z.url().max(300), accountId: accountId.optional() }).strict();
const reclaimToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const bytes = z.string().regex(/^[A-Za-z0-9_-]+$/).min(1).max(12_000);
const authenticationResponse = z.object({ id: bytes, rawId: bytes, type: z.literal("public-key"),
  response: z.object({ clientDataJSON: bytes, authenticatorData: bytes, signature: bytes, userHandle: bytes }).strict(),
  clientExtensionResults: z.record(z.string(), z.unknown()), authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional() }).strict();

export async function registerAuthRoutes(app: FastifyInstance, database: Database, config: ApiConfig) {
  const service = await createAuthService(database, config);
  const scope = (request: FastifyRequest) => request.applicationScope as ApplicationScope;
  const opaque = (request: FastifyRequest) => {
    const value = request.headers["x-sentriq-session-token"];
    return typeof value === "string" ? value : undefined;
  };
  const error = (request: FastifyRequest, reply: FastifyReply, status: number, code: string) => reply.code(status).send({ error: { code, message: status === 401 ? "Authentication failed" : "Request rejected", correlationId: request.id } });
  const handler = <T>(schema: z.ZodType<T>, fn: (input: T, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>): RouteHandlerMethod => async (request, reply) => {
    const parsed = schema.safeParse(request.body ?? {});
    if (!parsed.success) return error(request, reply, 400, "INVALID_REQUEST");
    try { return await fn(parsed.data, request, reply); }
    catch (cause) {
      if (cause instanceof AuthenticationError) return error(request, reply, 401, "UNAUTHORIZED");
      throw cause;
    }
  };
  const deviceLinkToken = (request: FastifyRequest) => {
    const value = request.headers["x-sentriq-device-link-token"];
    return typeof value === "string" ? value : undefined;
  };
  const registrationToken = (request: FastifyRequest) => {
    const value = request.headers["x-sentriq-registration-token"];
    return typeof value === "string" ? value : undefined;
  };
  const issueCookie = (request: FastifyRequest, reply: FastifyReply, result: { opaque: string; user: unknown; recoveryCodes?: string[] }) => {
    reply.header("set-cookie", sessionCookie(scope(request).applicationId, config, result.opaque));
    return { user: result.user, ...(result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {}) };
  };
  await app.register(async (auth) => {
    auth.addHook("onRequest", async (_request, reply) => { reply.header("cache-control", "no-store"); });
    auth.addHook("preValidation", async (request, reply) => {
      request.applicationScope = await authenticateApplication(database, request);
      if (!request.applicationScope) return error(request, reply, 401, "UNAUTHORIZED");
    });
    // createRateLimit independently enforces this budget after the global IP limiter.
    // rateLimit() itself skips requests already checked by the global hook.
    const accountLimit = auth.createRateLimit({ max: 8, timeWindow: 60_000, keyGenerator: (request) => {
      const body = request.body as { accountId?: unknown } | undefined;
      const account = typeof body?.accountId === "string" ? body.accountId.trim() : "";
      return `${request.applicationScope?.applicationId}:${request.routeOptions.url}:${digestToken(account)}`;
    } });
    const signupLimit = auth.createRateLimit({ max: 8, timeWindow: 60_000, keyGenerator: (request) => `${request.applicationScope?.applicationId}:signup:${digestToken(request.ip)}` });
    const ipLimit = auth.createRateLimit({ max: Math.min(config.rateLimitMax, 100), timeWindow: 60_000,
      keyGenerator: (request) => `${request.applicationScope?.applicationId}:${request.routeOptions.url}:${digestToken(request.ip)}` });
    auth.addHook("preHandler", async (request, reply) => {
      const ip = await ipLimit(request);
      const body = request.body as { accountId?: unknown } | undefined;
      const account = typeof body?.accountId === "string" ? await accountLimit(request) : undefined;
      const signup = request.routeOptions.url?.endsWith("/registration/start") === true ? await signupLimit(request) : undefined;
      const exceeded = !ip.isAllowed && ip.isExceeded ? ip : account && !account.isAllowed && account.isExceeded ? account : signup && !signup.isAllowed && signup.isExceeded ? signup : undefined;
      if (exceeded) { reply.header("retry-after", exceeded.ttlInSeconds); return error(request, reply, 429, "RATE_LIMITED"); }
    });
    auth.post("/registration/start", handler(z.object({ displayName: z.string().trim().min(1).max(100), email: z.email().trim().toLowerCase().max(254).optional() }).strict(), (input, request) => service.registrationStart(scope(request), input.displayName, input.email, request.id)));
    auth.get("/session", handler(empty, (_input, request) => service.session(scope(request), opaque(request))));
    auth.get("/sessions", handler(empty, (_input, request) => service.sessions(scope(request), opaque(request))));
    auth.get("/credentials", handler(empty, (_input, request) => service.credentials(scope(request), opaque(request))));
    auth.post("/credentials/rename", handler(z.object({ credentialId: z.uuid(), displayName: z.string().trim().min(1).max(60) }).strict(), (input, request) =>
      service.renameCredential(scope(request), opaque(request), input.credentialId, input.displayName, request.id)));
    auth.post("/credentials/revoke", handler(z.object({ credentialId: z.uuid(), stepUpGrantId: reclaimToken }).strict(), (input, request) =>
      service.revokeCredential(scope(request), opaque(request), input.credentialId, input.stepUpGrantId, request.id)));
    auth.get("/events", handler(empty, (_input, request) => service.events(scope(request), opaque(request))));
    auth.post("/sessions/revoke", handler(z.object({ sessionId: z.uuid() }).strict(), (input, request) => service.revokeSession(scope(request), opaque(request), input.sessionId, request.id)));
    auth.post("/account/delete", handler(empty, async (_input, request, reply) => {
      const result = await service.deleteAccount(scope(request), opaque(request), request.id);
      reply.header("set-cookie", sessionCookie(scope(request).applicationId, config, "", true));
      return result;
    }));
    auth.post("/logout", handler(empty, async (_input, request, reply) => {
      const result = await service.logout(scope(request), opaque(request), request.id);
      reply.header("set-cookie", sessionCookie(scope(request).applicationId, config, "", true)); return result;
    }));
    auth.post("/webauthn/register/options", handler(originInput, (input, request) => service.registrationOptions(scope(request), input.origin, opaque(request), typeof request.headers["x-sentriq-registration-token"] === "string" ? request.headers["x-sentriq-registration-token"] : undefined)));
    auth.post("/webauthn/register/verify", handler(z.object({ challengeId: z.uuid(), response: registrationResponseSchema }).strict(),
      async (input, request, reply) => issueCookie(request, reply, await service.registrationVerify(scope(request), input.challengeId, input.response as RegistrationResponseJSON, opaque(request), typeof request.headers["x-sentriq-registration-token"] === "string" ? request.headers["x-sentriq-registration-token"] : undefined, request.id))));
    auth.post("/webauthn/login/options", handler(originInput, (input, request) => service.authenticationOptions(scope(request), input.origin, input.accountId)));
    auth.post("/webauthn/login/verify", handler(z.object({ challengeId: z.uuid(), response: authenticationResponse }).strict(), async (input, request, reply) =>
      issueCookie(request, reply, await service.authenticationVerify(scope(request), input.challengeId, input.response as AuthenticationResponseJSON, request.id, opaque(request)))));
    auth.post("/device-links/start", handler(z.object({ accountId }).strict(), (input, request) => service.deviceLinkStart(scope(request), input.accountId, request.id)));
    auth.get("/device-links/inbox", handler(empty, (_input, request) => service.deviceLinkInbox(scope(request), opaque(request))));
    auth.post("/device-links/status", handler(z.object({ requestId: z.uuid() }).strict(), (input, request) => service.deviceLinkStatus(scope(request), input.requestId, deviceLinkToken(request) ?? "")));
    auth.post("/device-links/approval/options", handler(z.object({ requestId: z.uuid(), origin: z.url().max(300) }).strict(), (input, request) => service.deviceLinkApprovalOptions(scope(request), input.requestId, input.origin, opaque(request))));
    auth.post("/device-links/approval/verify", handler(z.object({ requestId: z.uuid(), challengeId: z.uuid(), response: authenticationResponse }).strict(), (input, request) => service.deviceLinkApprove(scope(request), input.requestId, input.challengeId, input.response as AuthenticationResponseJSON, opaque(request), request.id)));
    auth.post("/device-links/reject", handler(z.object({ requestId: z.uuid() }).strict(), (input, request) => service.deviceLinkReject(scope(request), input.requestId, opaque(request), request.id)));
    auth.post("/device-links/registration/options", handler(z.object({ requestId: z.uuid(), origin: z.url().max(300) }).strict(), (input, request) => service.deviceLinkRegistrationOptions(scope(request), input.requestId, deviceLinkToken(request) ?? "", input.origin)));
    auth.post("/device-links/registration/verify", handler(z.object({ requestId: z.uuid(), challengeId: z.uuid(), response: registrationResponseSchema }).strict(), async (input, request, reply) =>
      issueCookie(request, reply, await service.deviceLinkRegistrationVerify(scope(request), input.requestId, deviceLinkToken(request) ?? "", input.challengeId, input.response as RegistrationResponseJSON, request.id))));
    auth.post("/device-links/cancel", handler(z.object({ requestId: z.uuid() }).strict(), (input, request) => service.deviceLinkCancel(scope(request), input.requestId, deviceLinkToken(request) ?? "")));
    auth.post("/reclaim/start", handler(z.object({ accountId }).strict(), (input, request) => service.reclaimStart(scope(request), input.accountId, request.id)));
    auth.post("/reclaim/verify", handler(z.object({ accountId, transaction: reclaimToken, recoveryCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }).strict(),
      (input, request) => service.reclaimVerify(scope(request), input, request.id)));
    auth.post("/reclaim/passkey/options", handler(z.object({ transaction: reclaimToken, origin: z.url().max(300) }).strict(),
      (input, request) => service.reclaimRegistrationOptions(scope(request), input.transaction, input.origin)));
    auth.post("/reclaim/passkey/verify", handler(z.object({ transaction: reclaimToken, challengeId: z.uuid(), response: registrationResponseSchema }).strict(),
      (input, request) => service.reclaimRegistrationVerify(scope(request), input.transaction, input.challengeId, input.response as RegistrationResponseJSON, request.id)));
    auth.post("/reclaim/cancel", handler(z.object({ transaction: reclaimToken }).strict(),
      (input, request) => service.reclaimCancel(scope(request), input.transaction)));
  }, { prefix: "/v1/auth" });
}
