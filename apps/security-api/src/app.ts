import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import Fastify, { LogController, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { digestToken, verifyDatabase, type Database } from "./db/index";
import type { ApiConfig } from "./config";
import { registerAuthRoutes } from "./auth/routes";
import type { EmailSender } from "./auth/service";
import { registerPolicyRoutes } from "./policy/routes";

export interface ApplicationScope { tenantId: string; applicationId: string }
declare module "fastify" {
  interface FastifyRequest { applicationScope: ApplicationScope | null }
}

export async function authenticateApplication(database: Database, request: FastifyRequest): Promise<ApplicationScope | null> {
  const header = request.headers.authorization;
  const sdkKey = request.headers["x-sentriq-api-key"];
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (header && !bearer) return null;
  if (sdkKey !== undefined && typeof sdkKey !== "string") return null;
  if (bearer && sdkKey && bearer !== sdkKey) return null;
  const apiKey = bearer ?? sdkKey;
  if (!apiKey || !/^[A-Za-z0-9_-]{32,256}$/.test(apiKey)) return null;
  const result = await database.client.query<{ tenant_id: string; application_id: string }>(
    "SELECT tenant_id,application_id FROM application_api_keys WHERE digest=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())",
    [digestToken(apiKey)],
  );
  const row = result.rows[0];
  const claimedApplication = request.headers["x-sentriq-application-id"];
  if (claimedApplication !== undefined && claimedApplication !== row?.application_id) return null;
  return row ? { tenantId: row.tenant_id, applicationId: row.application_id } : null;
}

export async function buildApp(options: { database: Database; config: ApiConfig; logStream?: Writable; emailSender?: EmailSender }) {
  const app = Fastify({
    trustProxy: false, requestIdHeader: false, genReqId: () => randomUUID(), bodyLimit: 16_384,
    logController: new LogController({ disableRequestLogging: true }),
    logger: {
      level: options.config.logLevel,
      ...(options.logStream ? { stream: options.logStream } : {}),
      // Request/error serializers are allowlists: URLs, headers, bodies and error strings can contain credentials.
      serializers: {
        req: (request: FastifyRequest) => ({ method: request.method, id: request.id }),
        res: (response: { statusCode: number }) => ({ statusCode: response.statusCode }),
        err: () => ({ type: "Error", message: "[REDACTED]", stack: "[REDACTED]" }),
      },
      redact: {
        paths: ["password", "passwordHash", "apiKey", "token", "cookie", "recoveryCode", "challenge", "publicKey", "privateKey", "authorization", "req.headers", "req.body", "headers", "body", "*.password", "*.token", "*.apiKey", "*.recoveryCode", "*.challenge", "*.publicKey", "*.privateKey"],
        censor: "[REDACTED]",
      },
    },
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  app.decorateRequest("applicationScope", null);
  app.addHook("onRequest", async (request, reply) => { reply.header("x-correlation-id", request.id); });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info({ method: request.method, route: request.routeOptions.url ?? "unmatched", statusCode: reply.statusCode }, "request completed");
  });
  const errorPayload = (code: string, message: string, id: string) => ({ error: { code, message, correlationId: id } });
  app.setErrorHandler((error, request, reply) => {
    const status = typeof (error as { statusCode?: number }).statusCode === "number" ? (error as { statusCode: number }).statusCode : 500;
    const safeStatus = status >= 400 && status < 500 ? status : 500;
    const code = safeStatus === 429 ? "RATE_LIMITED" : safeStatus === 400 ? "INVALID_REQUEST" : "INTERNAL_ERROR";
    request.log.warn({ statusCode: safeStatus }, "request rejected");
    reply.code(safeStatus).send(errorPayload(code, safeStatus === 500 ? "Request unavailable" : "Request rejected", request.id));
  });
  await app.register(rateLimit, { max: options.config.rateLimitMax, timeWindow: options.config.rateLimitWindowMs, skipOnError: false });
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (request, reply) => {
    reply.code(404).send(errorPayload("NOT_FOUND", "Route not found", request.id));
  });
  app.get("/health", { schema: { querystring: { type: "object", properties: {}, additionalProperties: false } } }, async (_request, reply) => {
    try {
      await verifyDatabase(options.database.client);
      return { status: "ok" };
    }
    catch { reply.code(503); return { status: "unavailable" }; }
  });
  app.get("/v1/auth/context", { preHandler: async (request, reply) => {
    request.applicationScope = await authenticateApplication(options.database, request);
    if (!request.applicationScope) return reply.code(401).send(errorPayload("UNAUTHORIZED", "Authentication required", request.id));
  } }, async (request) => {
    // Caller-supplied tenant/application query values are deliberately ignored.
    return z.object({ tenantId: z.string(), applicationId: z.string() }).parse(request.applicationScope);
  });
  await registerAuthRoutes(app, options.database, options.config, options.emailSender);
  await registerPolicyRoutes(app, options.database, options.config);
  return app;
}
