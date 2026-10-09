import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { assistantProviderTimeoutMs, createOpenAIAssistantProvider, readAssistantProviderConfig, verifiedOpenAIModel } from "./openai-assistant-provider";

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv;
}

describe("OpenAI Responses provider configuration", () => {
  it("requires the verified preferred model and server key", () => {
    expect(readAssistantProviderConfig(env({}))).toBeNull();
    expect(readAssistantProviderConfig(env({ OPENAI_API_KEY: "server-secret" }))).toBeNull();
    expect(readAssistantProviderConfig(env({ OPENAI_API_KEY: "server-secret", OPENAI_MODEL: "another-model" }))).toBeNull();
    expect(readAssistantProviderConfig(env({ OPENAI_API_KEY: "server-secret", OPENAI_MODEL: verifiedOpenAIModel })))
      .toMatchObject({ model: "gpt-6-luna", maxOutputTokens: 350 });
  });

  it("clamps output tokens and does not expose the key in provider configuration", () => {
    const config = readAssistantProviderConfig(env({ OPENAI_API_KEY: "server-secret", OPENAI_MODEL: verifiedOpenAIModel, OPENAI_MAX_OUTPUT_TOKENS: "1200" }));
    expect(config).toEqual({ apiKey: "server-secret", model: verifiedOpenAIModel, maxOutputTokens: 500 });
    expect(assistantProviderTimeoutMs).toBe(8_000);
    const noTokens = readAssistantProviderConfig(env({ OPENAI_API_KEY: "server-secret", OPENAI_MODEL: verifiedOpenAIModel, OPENAI_MAX_OUTPUT_TOKENS: "0" }));
    expect(noTokens?.maxOutputTokens).toBe(350);
  });

  it("uses the Responses API without tools or provider-side conversation storage", async () => {
    const retrieve = vi.fn(async () => ({ id: verifiedOpenAIModel }));
    const create = vi.fn(async (_request: unknown) => ({ output_text: "Choose the passkey button and follow your device prompt." }));
    const client = { models: { retrieve }, responses: { create } } as unknown as OpenAI;
    const provider = createOpenAIAssistantProvider(client, { apiKey: "server-secret", model: verifiedOpenAIModel, maxOutputTokens: 300 });
    const text = await provider.generateResponse({
      messages: ["I do not know how to sign in"],
      context: { page: "login", locale: "en" },
    });
    expect(text).toContain("device prompt");
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith(verifiedOpenAIModel, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const request = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).toMatchObject({ model: verifiedOpenAIModel, max_output_tokens: 300, store: false });
    expect(request).not.toHaveProperty("tools");
    expect(String(request.instructions)).toMatch(/cannot.*authenticate/i);
    expect(String(request.instructions)).toMatch(/never.*recovery codes.*chat/i);
    expect(JSON.stringify(request)).not.toContain("server-secret");
  });

  it("does not send an inference request when model access verification fails", async () => {
    const retrieve = vi.fn(async () => { throw new Error("not authorized"); });
    const create = vi.fn(async (_request: unknown) => ({ output_text: "This must not be used." }));
    const client = { models: { retrieve }, responses: { create } } as unknown as OpenAI;
    const provider = createOpenAIAssistantProvider(client, { apiKey: "server-secret", model: verifiedOpenAIModel, maxOutputTokens: 300 });
    await expect(provider.generateResponse({ messages: ["Help"], context: { page: "login", locale: "en" } })).rejects.toThrow();
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
});
