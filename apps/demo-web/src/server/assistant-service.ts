import {
  classifyAssistantSecret,
  getOfflineAssistantReply,
  getSensitiveMessage,
  type AssistantChatRequest,
  type AssistantLocale,
  type AssistantPage,
  redactAssistantMessage,
} from "../lib/sentriq-assistant";

export interface AssistantProviderInput {
  messages: string[];
  context: { page: AssistantPage; locale: AssistantLocale };
}

export interface AssistantProvider {
  generateResponse(input: AssistantProviderInput): Promise<string>;
}

export interface AssistantAnswer {
  text: string;
  mode: "openai" | "offline";
}

const unsafeIntent = /\b(ignore|disregard|override|forget).{0,80}\b(instructions|rules|system|previous)\b|\b(?:reveal|show|return).{0,50}\b(?:account data|secrets?|api key|recovery codes?)\b|\b(bypass|disable|override).{0,60}\b(login|security|authentication|passkey|policy)\b|let me in|approve (?:the )?request|விதிகளைப் புறக்கணி|பாதுகாப்பைத் தாண்ட/i;
const privateAccountLookup = /\b(?:what|which|show|tell me|look up|check).{0,50}\b(?:email|account id|recovery status|sessions?|registered passkeys?)\b/i;
const secretSolicitation = /\b(?:send|share|paste|tell me|provide|enter|type)\b.{0,50}\b(?:recovery code|one[- ]time code|verification code|password|passcode)\b/i;
const tamilSecretSolicitation = /(?:பகிர|ஒட்ட|அனுப்பு|உள்ளிட|சொல்ல).{0,45}(?:மீட்பு குறியீடு|ஒருமுறை குறியீடு|கடவுச்சொல்)/;
const maximumAnswerCharacters = 1_000;

function fallback(request: AssistantChatRequest): AssistantAnswer {
  const latestUserMessage = [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return { text: getOfflineAssistantReply(latestUserMessage, request.locale, request.page), mode: "offline" };
}

export async function answerWithAssistant(
  request: AssistantChatRequest,
  provider: AssistantProvider | null,
): Promise<AssistantAnswer> {
  const userMessages = request.messages.filter((message) => message.role === "user").slice(-3);
  const latest = userMessages.at(-1)?.content ?? "";
  if (unsafeIntent.test(latest) || privateAccountLookup.test(latest)) return fallback(request);
  if (!provider || request.offlineOnly) return fallback(request);

  const messages = userMessages.map(({ content }) => redactAssistantMessage(content)).filter(Boolean);
  if (!messages.length) return fallback(request);

  try {
    const generated = await provider.generateResponse({
      messages,
      context: { page: request.page, locale: request.locale },
    });
    const text = generated.trim();
    if (!text || text.length > maximumAnswerCharacters) return fallback(request);
    if (classifyAssistantSecret(text) || secretSolicitation.test(text) || tamilSecretSolicitation.test(text)) {
      return { text: getSensitiveMessage(request.locale), mode: "offline" };
    }
    // The UI renders this only as a React text node; model output never becomes HTML or an action.
    return { text, mode: "openai" };
  } catch {
    // Provider exceptions can include request details. Do not log or return them.
    return fallback(request);
  }
}
