import {
  evaluationResultSchema,
  evaluationRequestSchema,
  stepUpOptionsInputSchema, stepUpOptionsResultSchema, stepUpVerifyInputSchema, stepUpVerifyResultSchema,
  type StepUpOptionsInput, type StepUpOptionsResult, type StepUpVerifyInput, type StepUpVerifyResult,
  reclaimStartInputSchema, reclaimStartResultSchema, reclaimVerifyInputSchema, reclaimVerifyResultSchema,
  reclaimRegistrationOptionsInputSchema, reclaimRegistrationOptionsResultSchema, reclaimRegistrationVerifyInputSchema, reclaimRegistrationVerifyResultSchema,
  reclaimCancelInputSchema, reclaimCancelResultSchema,
  type ReclaimStartInput, type ReclaimStartResult, type ReclaimVerifyInput, type ReclaimVerifyResult,
  type ReclaimRegistrationOptionsInput, type ReclaimRegistrationOptionsResult, type ReclaimRegistrationVerifyInput, type ReclaimRegistrationVerifyResult,
  type ReclaimCancelInput, type ReclaimCancelResult,
  errorResponseSchema,
  securityEventSchema,
  type EvaluationResult,
  type SecurityEvent,
} from "@sentriq/shared";
import { z } from "zod";
import type { ActionIdentifier } from "@sentriq/shared";

export type { EvaluationResult } from "@sentriq/shared";
export type { StepUpOptionsInput, StepUpOptionsResult, StepUpVerifyInput, StepUpVerifyResult } from "@sentriq/shared";
export type { ReclaimStartInput, ReclaimStartResult, ReclaimVerifyInput, ReclaimVerifyResult, ReclaimRegistrationOptionsInput, ReclaimRegistrationOptionsResult,
  ReclaimRegistrationVerifyInput, ReclaimRegistrationVerifyResult, ReclaimCancelInput, ReclaimCancelResult } from "@sentriq/shared";

export interface SentriqClientOptions {
  baseUrl: string;
  applicationId: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface EvaluateProtectedActionInput {
  applicationId: string;
  userId: string;
  sessionId: string;
  actionId: ActionIdentifier;
  resourceId: string;
  stepUpGrantId?: string;
}

export class SentriqApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;

  constructor(input: { status: number; code: string; message: string; correlationId?: string }) {
    super(input.message);
    this.name = "SentriqApiError";
    this.status = input.status;
    this.code = input.code;
    this.correlationId = input.correlationId;
  }
}

export class SentriqClient {
  readonly #baseUrl: string;
  readonly #applicationId: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: SentriqClientOptions, fetchImplementation: typeof fetch = globalThis.fetch) {
    if (typeof window !== "undefined") {
      throw new Error("SentriqClient is server-only. Call it from a trusted server route.");
    }
    const parsed = new URL(options.baseUrl);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)))) {
      throw new Error("Sentriq API must use HTTPS outside localhost development.");
    }
    if (!/^[A-Za-z0-9_-]{24,256}$/.test(options.apiKey)) throw new Error("Sentriq API key is missing or invalid.");
    if (!/^[\x21-\x7e]{1,128}$/.test(options.applicationId)) throw new Error("Invalid application identifier.");
    const timeoutMs = options.timeoutMs ?? 3000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new Error("Timeout must be between 1 and 10000 milliseconds.");
    this.#baseUrl = parsed.toString().replace(/\/$/, "");
    this.#applicationId = options.applicationId;
    this.#apiKey = options.apiKey;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchImplementation;
  }

  async evaluate(input: EvaluateProtectedActionInput, sessionToken?: string): Promise<EvaluationResult> {
    const validated = this.#validate(evaluationRequestSchema, { ...input, applicationId: this.#applicationId });
    return this.#request("/v1/evaluations", evaluationResultSchema, {
      method: "POST",
      body: JSON.stringify(validated),
      sessionToken,
    });
  }

  async stepUpOptions(input: StepUpOptionsInput, sessionToken: string): Promise<StepUpOptionsResult> {
    return this.#request("/v1/step-up/options", stepUpOptionsResultSchema, { method: "POST", body: JSON.stringify(this.#validate(stepUpOptionsInputSchema, input)), sessionToken });
  }

  async stepUpVerify(input: StepUpVerifyInput, sessionToken: string): Promise<StepUpVerifyResult> {
    return this.#request("/v1/step-up/verify", stepUpVerifyResultSchema, { method: "POST", body: JSON.stringify(this.#validate(stepUpVerifyInputSchema, input)), sessionToken });
  }

  reclaimStart(input: ReclaimStartInput): Promise<ReclaimStartResult> {
    return this.#request("/v1/auth/reclaim/start", reclaimStartResultSchema, { method: "POST", body: JSON.stringify(this.#validate(reclaimStartInputSchema, input)) });
  }

  reclaimVerify(input: ReclaimVerifyInput): Promise<ReclaimVerifyResult> {
    return this.#request("/v1/auth/reclaim/verify", reclaimVerifyResultSchema, { method: "POST", body: JSON.stringify(this.#validate(reclaimVerifyInputSchema, input)) });
  }

  reclaimRegistrationOptions(input: ReclaimRegistrationOptionsInput): Promise<ReclaimRegistrationOptionsResult> {
    return this.#request("/v1/auth/reclaim/passkey/options", reclaimRegistrationOptionsResultSchema, { method: "POST", body: JSON.stringify(this.#validate(reclaimRegistrationOptionsInputSchema, input)) });
  }

  reclaimRegistrationVerify(input: ReclaimRegistrationVerifyInput): Promise<ReclaimRegistrationVerifyResult> {
    return this.#request("/v1/auth/reclaim/passkey/verify", reclaimRegistrationVerifyResultSchema, { method: "POST", body: JSON.stringify(this.#validate(reclaimRegistrationVerifyInputSchema, input)) });
  }

  reclaimCancel(input: ReclaimCancelInput): Promise<ReclaimCancelResult> {
    return this.#request("/v1/auth/reclaim/cancel", reclaimCancelResultSchema, { method: "POST", body: JSON.stringify(this.#validate(reclaimCancelInputSchema, input)) });
  }

  #validate<T>(schema: z.ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new SentriqApiError({ status: 400, code: "INVALID_REQUEST", message: "Invalid security request." });
    return parsed.data;
  }

  async listEvents(sessionToken: string): Promise<SecurityEvent[]> {
    return this.#request("/v1/auth/events", z.array(securityEventSchema), {
      method: "GET",
      sessionToken,
    });
  }

  async #request<T>(
    path: string,
    responseSchema: z.ZodType<T>,
    init: { method: "GET" | "POST"; body?: string; sessionToken?: string },
  ): Promise<T> {
    if (init.sessionToken !== undefined && !/^[A-Za-z0-9_-]{1,256}$/.test(init.sessionToken)) {
      throw new SentriqApiError({ status: 400, code: "INVALID_REQUEST", message: "Invalid security request." });
    }
    const controller = new AbortController();
    const correlationId = crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new SentriqApiError({ status: 504, code: "UPSTREAM_TIMEOUT", message: "Sentriq did not respond in time.", correlationId }));
    }, this.#timeoutMs); });
    const headers = new Headers({
      "x-sentriq-api-key": this.#apiKey,
      "x-sentriq-application-id": this.#applicationId,
      "x-correlation-id": correlationId,
      accept: "application/json",
    });
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (init.sessionToken) headers.set("x-sentriq-session-token", init.sessionToken);
    try {
      const response = await Promise.race([this.#fetch(`${this.#baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body,
        signal: controller.signal,
        cache: "no-store",
      }), deadline]);
      const payload: unknown = await Promise.race([response.json().catch(() => undefined), deadline]);
      if (!response.ok) {
        const parsedError = errorResponseSchema.safeParse(payload);
        throw new SentriqApiError({
          status: response.status,
          code: parsedError.success ? parsedError.data.error.code : "UPSTREAM_ERROR",
          message: parsedError.success ? parsedError.data.error.message : "Sentriq security service rejected the request.",
          correlationId: parsedError.success ? parsedError.data.error.correlationId : correlationId,
        });
      }
      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new SentriqApiError({
          status: 502,
          code: "INVALID_UPSTREAM_RESPONSE",
          message: "Sentriq returned an invalid security response.",
          correlationId,
        });
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof SentriqApiError) throw error;
      if (controller.signal.aborted) {
        throw new SentriqApiError({ status: 504, code: "UPSTREAM_TIMEOUT", message: "Sentriq did not respond in time.", correlationId });
      }
      throw new SentriqApiError({ status: 503, code: "UPSTREAM_UNAVAILABLE", message: "Sentriq security service is unavailable.", correlationId });
    } finally {
      clearTimeout(timer!);
    }
  }
}

/** Create the server-side client for a host application's trusted route handlers. */
export function createSentriq(options: SentriqClientOptions): SentriqClient {
  return new SentriqClient(options);
}
