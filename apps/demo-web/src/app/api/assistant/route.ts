import { NextRequest, NextResponse } from "next/server";
import {
  getSensitiveMessage,
  getUnavailableMessage,
  parseAssistantRequest,
  type AssistantLocale,
} from "@/lib/sentriq-assistant";
import { answerWithAssistant } from "@/server/assistant-service";
import { assistantClientKey, AssistantRateLimiter } from "@/server/assistant-rate-limit";
import { assistantProviderMode, configuredOpenAIAssistantProvider } from "@/server/openai-assistant-provider";
import type { AssistantProvider } from "@/server/assistant-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new AssistantRateLimiter();
const maxRequestBytes = 7_000;
let providerLoaded = false;
let cachedProvider: AssistantProvider | null = null;

function getConfiguredProvider(): AssistantProvider | null {
  if (!providerLoaded) {
    cachedProvider = configuredOpenAIAssistantProvider();
    providerLoaded = true;
  }
  return cachedProvider;
}

function requestLocale(value: unknown): AssistantLocale {
  return value === "ta" ? "ta" : "en";
}

export async function GET() {
  return NextResponse.json({ mode: assistantProviderMode(), provider: assistantProviderMode() === "openai" ? "OpenAI" : "offline" }, {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Use the assistant form to send a text question." }, { status: 415, headers: { "cache-control": "no-store" } });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxRequestBytes) {
    return NextResponse.json({ error: "Please shorten your message and try again." }, { status: 413, headers: { "cache-control": "no-store" } });
  }

  let raw: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > maxRequestBytes) {
      return NextResponse.json({ error: "Please shorten your message and try again." }, { status: 413, headers: { "cache-control": "no-store" } });
    }
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "The message could not be read. Please try again." }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const parsed = parseAssistantRequest(raw);
  if (!parsed.ok) {
    if (parsed.reason === "sensitive") {
      const locale = raw && typeof raw === "object" ? requestLocale((raw as { locale?: unknown }).locale) : "en";
      return NextResponse.json({ text: getSensitiveMessage(locale), mode: "offline" }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "Please use English or Tamil and keep the message under 600 characters." }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const provider = parsed.value.offlineOnly ? null : getConfiguredProvider();
  const acquired = limiter.acquire(assistantClientKey(request.headers), provider !== null);
  if (!acquired.ok) {
    if (acquired.reason === "budget" || acquired.reason === "busy") {
      const result = await answerWithAssistant(parsed.value, null);
      return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: getUnavailableMessage(parsed.value.locale) }, {
      status: 429,
      headers: { "cache-control": "no-store", "retry-after": "60" },
    });
  }

  try {
    const result = await answerWithAssistant(parsed.value, provider);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } finally {
    acquired.release();
  }
}
