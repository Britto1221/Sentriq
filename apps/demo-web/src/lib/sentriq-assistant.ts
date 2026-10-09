export type AssistantLocale = "en" | "ta";
export type AssistantPage = "register" | "login" | "recovery" | "device-link" | "passkeys" | "settings";
export type AssistantMessage = { role: "user" | "assistant"; content: string };
export type AssistantChatRequest = {
  locale: AssistantLocale;
  page: AssistantPage;
  messages: AssistantMessage[];
  offlineOnly: boolean;
};
export type AssistantSecretKind = "recovery-code" | "one-time-code" | "credential";
export type AssistantParseResult =
  | { ok: true; value: AssistantChatRequest }
  | { ok: false; reason: "invalid" | "sensitive" };

const pages = new Set<AssistantPage>(["register", "login", "recovery", "device-link", "passkeys", "settings"]);
const recoveryCode = /(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{32}(?![A-Za-z0-9_-])/;
const oneTimeCode = /(?:^|\D)\d{6,8}(?!\d)/;
const credentialAssignment = /(?:password|passphrase|passcode|otp|one[- ]time code|verification code|recovery code)\s*(?:is|:|=)\s*\S+/i;
const bearerCredential = /\bbearer\s+\S+/i;
const apiCredential = /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/i;
const jwtCredential = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/;

export function classifyAssistantSecret(value: string): AssistantSecretKind | null {
  if (recoveryCode.test(value) || credentialAssignment.test(value) && /recovery code/i.test(value)) return "recovery-code";
  if (oneTimeCode.test(value) || /(?:otp|one[- ]time code|verification code)\s*(?:is|:|=)\s*\S+/i.test(value)) return "one-time-code";
  if (credentialAssignment.test(value) || bearerCredential.test(value) || apiCredential.test(value) || jwtCredential.test(value)) return "credential";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function parseAssistantRequest(value: unknown): AssistantParseResult {
  if (!isRecord(value) || !hasOnlyKeys(value, ["locale", "page", "messages", "offlineOnly"])) return { ok: false, reason: "invalid" };
  if ((value.locale !== "en" && value.locale !== "ta") || typeof value.page !== "string" || !pages.has(value.page as AssistantPage)) {
    return { ok: false, reason: "invalid" };
  }
  if (value.offlineOnly !== undefined && typeof value.offlineOnly !== "boolean") return { ok: false, reason: "invalid" };
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 8) return { ok: false, reason: "invalid" };
  const messages: AssistantMessage[] = [];
  let totalLength = 0;
  for (const candidate of value.messages) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["role", "content"]) ||
      (candidate.role !== "user" && candidate.role !== "assistant") ||
      typeof candidate.content !== "string" || candidate.content.trim().length < 1 || candidate.content.length > 600) {
      return { ok: false, reason: "invalid" };
    }
    totalLength += candidate.content.length;
    if (totalLength > 2_400) return { ok: false, reason: "invalid" };
    if (classifyAssistantSecret(candidate.content)) return { ok: false, reason: "sensitive" };
    messages.push({ role: candidate.role, content: candidate.content.trim() });
  }
  if (!messages.some(({ role }) => role === "user")) return { ok: false, reason: "invalid" };
  return { ok: true, value: { locale: value.locale, page: value.page as AssistantPage, messages, offlineOnly: value.offlineOnly === true } };
}

export function redactAssistantMessage(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, "[identifier]")
    .replace(/\+?\d[\d ()-]{7,}\d/g, "[phone]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .slice(0, 600);
}

const offline = {
  en: {
    secret: "For your safety, I did not send or keep that message. Never put a recovery code, one-time code, password, or sign-in link in chat. Enter a recovery code only in the secure recovery form.",
    login: "To sign in: 1) open the sign-in page, 2) choose “Continue with passkey,” 3) follow the prompt on your phone or computer, and 4) confirm with the device method it offers, such as fingerprint, face unlock, PIN, or a security key. That check happens on your device; Northstar does not receive your fingerprint or face data.",
    passkey: "A passkey is a sign-in credential protected by your device or passkey provider. Your device may ask for a fingerprint, face unlock, or PIN to use it. That local check unlocks the passkey; the website verifies a cryptographic response and never receives biometric data.",
    cancelled: "If the passkey prompt was cancelled or did not open, return to sign in and try again. Keep the browser open while the prompt is active. If this device has no passkey for your account, try another registered or synced passkey, use an already signed-in device, or open account recovery.",
    lost: "First try another device that may have your synced passkey. If you are already signed in on another device, you can start a new-phone request there. Otherwise open the secure recovery form and use one saved, unused recovery code. A code works only in that form and only once.",
    code: "Please do not share the code here. Open the secure recovery form and enter one unused recovery code only in its labeled field. After it is accepted, follow the page to register a replacement passkey. Used codes cannot be used again.",
    forgotCode: "First check the password manager or securely stored offline copy where you saved the six setup codes. Do not ask anyone to accept a code in chat. If you cannot use any passkey and cannot find an unused recovery code, this demo has no secure way to restore access.",
    unavailable: "If you cannot use any registered or synced passkey and have no unused recovery code, this demo cannot securely restore the account. It has no email-only reset or support bypass. Do not trust anyone who offers to bypass verification.",
    device: "To connect a new phone without a QR code: start the request on the new phone, then open the approval inbox on your existing device, such as your current phone or tablet. Compare the short code on both screens. Approve only a request you started, and complete the fresh passkey prompt. The new phone then creates its own passkey; no key is copied between devices.",
    unexpected: "Reject the request and do not complete the passkey prompt. Approve only a new-device request that you personally started and whose comparison code matches on both devices.",
    manage: "Open Security settings to review your registered passkeys. Renaming or removing a passkey requires the site's verification steps. Keep at least one usable passkey or recovery method; never approve a prompt you did not start.",
    register: "To create an account, open the registration page and follow the prompts to create a passkey. Save the six recovery codes shown at setup in a password manager or a securely stored offline copy. Each code is secret and can be used once.",
    bypass: "I cannot bypass sign-in, approve a device, or change account security. Use a registered passkey or the secure recovery flow; the server checks these steps independently of this chat.",
    failure: "I could not reach the live assistant, so these offline instructions are being used. Try signing in with a passkey, or open the secure recovery form if you have lost access. The assistant cannot inspect your account or change its security.",
    general: "I can explain passkeys, sign-in, account recovery, adding a phone, and passkey settings. I cannot look up private account details or perform security actions. Never share passwords, one-time codes, or recovery codes in chat.",
  },
  ta: {
    secret: "உங்கள் பாதுகாப்புக்காக அந்தச் செய்தியை நான் அனுப்பவோ சேமிக்கவோ இல்லை. மீட்புக் குறியீடு, ஒருமுறை குறியீடு, கடவுச்சொல் அல்லது உள்நுழைவு இணைப்பை உரையாடலில் பகிர வேண்டாம். மீட்புக் குறியீட்டை பாதுகாப்பான மீட்புப் படிவத்தில் மட்டும் உள்ளிடவும்.",
    login: "உள்நுழைய: 1) உள்நுழைவு பக்கத்தைத் திறக்கவும், 2) “Passkey மூலம் தொடரவும்” என்பதைத் தேர்ந்தெடுக்கவும், 3) கைபேசி அல்லது கணினியில் வரும் அறிவுறுத்தலைப் பின்பற்றவும், 4) கைரேகை, முகஅடையாளம், PIN அல்லது பாதுகாப்புச் சாவி போன்ற சாதன முறை மூலம் உறுதிப்படுத்தவும். இந்தச் சரிபார்ப்பு உங்கள் சாதனத்திலேயே நடக்கும்; உங்கள் கைரேகை அல்லது முகத் தரவை Northstar பெறாது.",
    passkey: "Passkey என்பது உங்கள் சாதனம் அல்லது Passkey வழங்குநர் பாதுகாக்கும் உள்நுழைவு முறை. அதைப் பயன்படுத்த கைரேகை, முகஅடையாளம் அல்லது PIN கேட்கப்படலாம். அந்தச் சரிபார்ப்பு சாதனத்திலேயே நடக்கும்; இணையதளம் குறியாக்கப்பட்ட பதிலை மட்டுமே சரிபார்க்கும், உயிரியல் தரவைப் பெறாது.",
    cancelled: "Passkey அறிவுறுத்தலை ரத்து செய்திருந்தால் அல்லது அது திறக்கவில்லை என்றால், மீண்டும் உள்நுழைவு பக்கத்திற்குச் சென்று முயற்சிக்கவும். அறிவுறுத்தல் திறந்திருக்கும் போது உலாவியை மூட வேண்டாம். இந்தச் சாதனத்தில் உங்கள் Passkey இல்லையெனில், பதிவு செய்த அல்லது ஒத்திசைக்கப்பட்ட மற்றொரு Passkey-ஐ முயற்சிக்கவும்; ஏற்கெனவே உள்நுழைந்த சாதனத்தைப் பயன்படுத்தவும்; அல்லது கணக்கு மீட்பைத் திறக்கவும்.",
    lost: "முதலில் ஒத்திசைக்கப்பட்ட Passkey இருக்கக்கூடிய மற்றொரு சாதனத்தை முயற்சிக்கவும். வேறு சாதனத்தில் ஏற்கெனவே உள்நுழைந்திருந்தால், அங்கிருந்து புதிய கைபேசி கோரிக்கையைத் தொடங்கலாம். இல்லையெனில் பாதுகாப்பான மீட்புப் படிவத்தைத் திறந்து, சேமித்துப் பயன்படுத்தாத ஒரு மீட்புக் குறியீட்டை உள்ளிடவும். ஒவ்வொரு குறியீடும் ஒருமுறை மட்டுமே பயன்படும்.",
    code: "குறியீட்டை இங்கே பகிர வேண்டாம். பாதுகாப்பான மீட்புப் படிவத்தைத் திறந்து, பயன்படுத்தாத ஒரு மீட்புக் குறியீட்டை குறிக்கப்பட்ட புலத்தில் மட்டும் உள்ளிடவும். அது ஏற்றுக்கொள்ளப்பட்டதும் புதிய Passkey-ஐப் பதிவு செய்யும் படிகளைப் பின்பற்றவும். பயன்படுத்திய குறியீட்டை மீண்டும் பயன்படுத்த முடியாது.",
    forgotCode: "அமைப்பில் காட்டப்பட்ட ஆறு குறியீடுகளைச் சேமித்த கடவுச்சொல் மேலாளர் அல்லது பாதுகாப்பான அச்சுப் பிரதியை முதலில் பாருங்கள். யாரிடமும் உரையாடலில் குறியீட்டை ஏற்கச் சொல்ல வேண்டாம். எந்த Passkey-யையும் பயன்படுத்த முடியாமல், பயன்படுத்தாத மீட்புக் குறியீடும் கிடைக்கவில்லை என்றால், இந்தச் செய்முறையில் அணுகலைப் பாதுகாப்பாக மீட்டெடுக்க முடியாது.",
    unavailable: "பதிவு செய்த அல்லது ஒத்திசைக்கப்பட்ட Passkey-ஐப் பயன்படுத்த முடியாமல், பயன்படுத்தாத மீட்புக் குறியீடும் இல்லையெனில், இந்தச் செய்முறையில் கணக்கை பாதுகாப்பாக மீட்டெடுக்க முடியாது. மின்னஞ்சல் மட்டும் கொண்டு மீட்டெடுக்கும் வழியோ பாதுகாப்பைத் தாண்டும் வழியோ இல்லை.",
    device: "QR குறியீடு இல்லாமல் புதிய கைபேசியை இணைக்க: புதிய கைபேசியில் கோரிக்கையைத் தொடங்கவும். பின்னர் ஏற்கெனவே உள்நுழைந்த உங்கள் சாதனத்தில், உதாரணமாக தற்போதைய கைபேசி அல்லது டேப்லெட்டில், ஒப்புதல் பெட்டியைத் திறக்கவும். இரு திரைகளிலும் உள்ள குறுகிய குறியீடு ஒன்றாக உள்ளதா பாருங்கள். நீங்கள் தொடங்கிய கோரிக்கையை மட்டும் ஒப்புதல் அளித்து, புதிய Passkey அறிவுறுத்தலை முடிக்கவும். புதிய கைபேசி தனக்கென Passkey உருவாக்கும்; எந்தச் சாவியும் நகலெடுக்கப்படாது.",
    unexpected: "கோரிக்கையை நிராகரித்து, Passkey அறிவுறுத்தலைத் தொடர வேண்டாம். நீங்கள் தொடங்கிய புதிய சாதனக் கோரிக்கையையும் இரு சாதனங்களிலும் பொருந்தும் குறியீட்டையும் மட்டுமே ஒப்புதல் அளிக்கவும்.",
    manage: "பதிவு செய்த Passkey-களைப் பார்க்க பாதுகாப்பு அமைப்புகளைத் திறக்கவும். Passkey-ஐ மாற்ற அல்லது நீக்க தளத்தின் சரிபார்ப்பு படிகள் தேவை. குறைந்தது ஒரு பயன்படுத்தக்கூடிய Passkey அல்லது மீட்பு முறையை வைத்திருக்கவும். நீங்கள் தொடங்காத அறிவுறுத்தலை ஒருபோதும் ஒப்புதல் அளிக்க வேண்டாம்.",
    register: "கணக்கை உருவாக்க, பதிவு பக்கத்தைத் திறந்து Passkey உருவாக்கும் படிகளைப் பின்பற்றவும். அமைப்பில் காட்டப்படும் ஆறு மீட்புக் குறியீடுகளையும் கடவுச்சொல் மேலாளரில் அல்லது பாதுகாப்பாக வைத்துள்ள அச்சுப் பிரதியில் சேமிக்கவும். ஒவ்வொரு குறியீடும் ரகசியமானது; ஒருமுறை மட்டுமே பயன்படும்.",
    bypass: "உள்நுழைவைத் தாண்டவோ, சாதனத்தை ஒப்புதல் அளிக்கவோ, கணக்குப் பாதுகாப்பை மாற்றவோ என்னால் முடியாது. பதிவு செய்த Passkey அல்லது பாதுகாப்பான மீட்பு முறையைப் பயன்படுத்தவும்; இந்த உரையாடலிலிருந்து தனியாக சேவையகம் அவற்றைச் சரிபார்க்கும்.",
    failure: "நேரடி உதவியாளரை அணுக முடியவில்லை; எனவே இந்த இணையமில்லா வழிகாட்டலைப் பயன்படுத்துகிறேன். Passkey மூலம் உள்நுழைய முயற்சிக்கவும் அல்லது அணுகலை இழந்தால் பாதுகாப்பான மீட்புப் படிவத்தைத் திறக்கவும். உங்கள் கணக்கைப் பார்க்கவோ பாதுகாப்பை மாற்றவோ உதவியாளரால் முடியாது.",
    general: "Passkey, உள்நுழைவு, கணக்கு மீட்பு, புதிய கைபேசி இணைப்பு மற்றும் Passkey அமைப்புகளை விளக்க முடியும். தனிப்பட்ட கணக்கு விவரங்களைப் பார்க்கவோ பாதுகாப்புச் செயல்களைச் செய்யவோ முடியாது. கடவுச்சொல், ஒருமுறை குறியீடு அல்லது மீட்புக் குறியீட்டை உரையாடலில் பகிர வேண்டாம்.",
  },
} as const;

export type OfflineReplyKind = keyof typeof offline.en;

export function getSensitiveMessage(locale: AssistantLocale): string {
  return offline[locale].secret;
}

export function getUnavailableMessage(locale: AssistantLocale): string {
  return offline[locale].failure;
}

export function getOfflineAssistantReply(message: string, locale: AssistantLocale, page: AssistantPage): string {
  const text = message.trim().toLocaleLowerCase(locale === "ta" ? "ta-IN" : "en-US");
  let kind: OfflineReplyKind;
  if (/\b(ignore|bypass|disable|override).{0,60}\b(login|security|authentication|passkey|policy)\b|let me in|approve (?:the )?request/i.test(text) || /பாதுகாப்பைத் தாண்ட|உள்நுழைவைக் தாண்ட|ஒப்புதல் அளி/.test(text)) kind = "bypass";
  else if (/unexpected|didn't start|did not start|not me|unknown request|not expecting|எதிர்பாராத|நான் தொடங்கவில்லை/.test(text)) kind = "unexpected";
  else if (/\b(?:what|which|show|tell me|look up|check).{0,50}\b(?:email|account id|recovery status|sessions?|registered passkeys?)\b/i.test(text)) kind = "general";
  else if (/forgot|cannot find|can't find|lost all|no longer have|கிடைக்கவில்லை|மறந்துவிட்டேன்/.test(text) && /code|குறியீடு|passkey|கைப்பேசி|phone|கைபேசி/.test(text)) kind = "forgotCode";
  else if (/no passkey|no recovery|no backup|lost all.*(?:code|குறியீடு)|all.*codes|எதுவும் இல்லை|குறியீடுகள் இல்லை/.test(text)) kind = "unavailable";
  else if (page === "device-link" && /new phone|add.*device|qr|புதிய கைபேசி|புதிய சாதனம்/.test(text)) kind = "device";
  else if (/lost|stolen|new phone|another phone|phone|mobile|device|கைபேசி|தொலைந்த|புதிய சாதனம்|புதிய கைபேசி/.test(text)) kind = page === "device-link" && /unexpected|didn't start|not me/.test(text) ? "unexpected" : "lost";
  else if (/recovery code|backup code|மீட்பு குறியீடு/.test(text)) kind = "code";
  else if (/cancel|closed|fingerprint.*not|face id.*not|didn't work|did not work|ரத்து|செயல்படவில்லை/.test(text)) kind = "cancelled";
  else if (/remove|delete.*passkey|passkey.*delete|நீக்க|அகற்ற/.test(text)) kind = "manage";
  else if (/passkey|fingerprint|face id|authenticator|பாஸ்கீ|கைரேகை/.test(text)) kind = "passkey";
  else if (/\bregister\b|\bcreate(?: an)? account\b|\bsign up\b|கணக்கு.*உருவாக்க|பதிவு/.test(text) || page === "register") kind = "register";
  else if (/log.?in|sign.?in|login|உள்நுழை/.test(text) || page === "login") kind = "login";
  else if (page === "device-link") kind = "device";
  else kind = "general";
  return offline[locale][kind];
}
