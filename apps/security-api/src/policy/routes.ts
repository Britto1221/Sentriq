import type { FastifyInstance, FastifyReply, FastifyRequest, RouteHandlerMethod } from "fastify";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { evaluationRequestSchema, stepUpOptionsInputSchema, stepUpVerifyInputSchema } from "@sentriq/shared";
import { authenticateApplication, type ApplicationScope } from "../app";
import { AuthenticationError } from "../auth/service";
import { digestToken, type Database } from "../db/index";
import type { ApiConfig } from "../config";
import { createPolicyService, PolicyUnavailableError } from "./service";

export async function registerPolicyRoutes(app: FastifyInstance, database: Database, config: ApiConfig) {
  const service = createPolicyService(database, config);
  const scope = (request: FastifyRequest) => request.applicationScope as ApplicationScope;
  const opaque = (request: FastifyRequest) => typeof request.headers["x-sentriq-session-token"] === "string" ? request.headers["x-sentriq-session-token"] : undefined;
  const error = (request: FastifyRequest, reply: FastifyReply, status: number, code: string) => reply.code(status).send({ error: { code, message: "Request rejected", correlationId: request.id } });
  const handler = <T>(schema: z.ZodType<T>, fn: (input: T, request: FastifyRequest) => Promise<unknown>): RouteHandlerMethod => async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return error(request, reply, 400, "INVALID_REQUEST");
    try { return await fn(parsed.data, request); }
    catch (cause) {
      if (cause instanceof AuthenticationError) return error(request, reply, 401, "UNAUTHORIZED");
      if (cause instanceof PolicyUnavailableError) return error(request, reply, 403, "POLICY_UNAVAILABLE");
      throw cause;
    }
  };
  await app.register(async (routes) => {
    routes.addHook("onRequest", async (_request, reply) => { reply.header("cache-control", "no-store"); });
    routes.addHook("preValidation", async (request, reply) => {
      request.applicationScope = await authenticateApplication(database, request);
      if (!request.applicationScope) return error(request, reply, 401, "UNAUTHORIZED");
    });
    const limiter = routes.createRateLimit({ max: Math.min(config.rateLimitMax, 100), timeWindow: 60_000, keyGenerator: (request) => `${request.applicationScope?.applicationId}:${digestToken(request.ip)}` });
    routes.addHook("preHandler", async (request, reply) => {
      const limited = await limiter(request);
      if (!limited.isAllowed && limited.isExceeded) { reply.header("retry-after", limited.ttlInSeconds); return error(request, reply, 429, "RATE_LIMITED"); }
    });
    routes.post("/evaluations", handler(evaluationRequestSchema, (input, request) => service.evaluate(scope(request), input, opaque(request), request.id)));
    routes.post("/step-up/options", handler(stepUpOptionsInputSchema, (input, request) => service.options(scope(request), input.challengeId, input.origin, opaque(request))));
    routes.post("/step-up/verify", handler(stepUpVerifyInputSchema, (input, request) => service.verify(scope(request), input.challengeId, input.response as AuthenticationResponseJSON, opaque(request), request.id)));
  }, { prefix: "/v1" });
}
