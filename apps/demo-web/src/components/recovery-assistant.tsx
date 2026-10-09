"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAccessPreferences, type LanguageCode } from "@sentriq/access";
import {
  classifyAssistantSecret,
  getOfflineAssistantReply,
  getSensitiveMessage,
  getUnavailableMessage,
  type AssistantMessage,
  type AssistantPage,
  type AssistantLocale,
} from "@/lib/sentriq-assistant";

type ChatMessage = AssistantMessage & { id: number; mode?: "openai" | "offline" | "welcome" };

const copy = {
  en: {
    launcher: "Need help signing in?",
    title: "Sentriq Assistant",
    welcome: "Hi! I can help you sign in, create a passkey, or recover your account. What are you trying to do?",
    liveDisclosure: "OpenAI is configured; model access is checked before a reply. Your message may be sent to OpenAI after email and phone-like text is removed. Chats are not saved by Sentriq. Never enter passwords, recovery codes, one-time codes, or sign-in links.",
    offlineDisclosure: "Offline guidance is active. Your question is not sent to an AI provider. Chats are not saved by Sentriq. Never enter passwords, recovery codes, one-time codes, or sign-in links.",
    trustNote: "This is general help, not account status. The server performs every sign-in, recovery, and security check.",
    input: "Type your question",
    placeholder: "For example: I lost my phone and cannot sign in",
    send: "Send question",
    close: "Close Sentriq Assistant",
    language: "Assistant language",
    loading: "Preparing a safe answer…",
    error: "I could not send that question. Here is offline guidance instead.",
    tooLong: "Please keep your question under 600 characters.",
    responseLabel: "Assistant conversation",
    aiLabel: "OpenAI response",
    configuredLabel: "OpenAI configured · access checked on request",
    offlineLabel: "Offline guidance",
    online: "Use OpenAI guidance",
    offline: "Use offline guidance",
    quick: "Quick help",
    login: "Help me log in",
    lost: "I lost my passkey",
    forgotCode: "I cannot find my recovery code",
    newPhone: "I have a new phone",
    fingerprint: "My fingerprint is not working",
    explain: "Explain passkeys",
    unexpected: "I received an unexpected request",
    tamil: "தமிழில் உதவி",
    links: "Open a secure page",
    signIn: "Sign in",
    recovery: "Account recovery",
    settings: "Passkey settings",
  },
  ta: {
    launcher: "உள்நுழைவுக்கு உதவி வேண்டுமா?",
    title: "Sentriq உதவியாளர்",
    welcome: "வணக்கம்! உள்நுழையவும், Passkey உருவாக்கவும் அல்லது கணக்கை மீட்கவும் உதவுகிறேன். உங்களுக்கு என்ன உதவி வேண்டும்?",
    liveDisclosure: "OpenAI அமைக்கப்பட்டுள்ளது; பதிலுக்கு முன் மாதிரி அணுகல் சரிபார்க்கப்படும். மின்னஞ்சல் மற்றும் தொலைபேசி எண் போன்ற உரை நீக்கப்பட்ட பிறகு உங்கள் செய்தி OpenAI-க்கு அனுப்பப்படலாம். Sentriq உரையாடலைச் சேமிக்காது. கடவுச்சொல், மீட்புக் குறியீடு, ஒருமுறை குறியீடு அல்லது உள்நுழைவு இணைப்பை உள்ளிட வேண்டாம்.",
    offlineDisclosure: "இணையமில்லா வழிகாட்டல் செயல்பாட்டில் உள்ளது. உங்கள் கேள்வி AI சேவைக்கு அனுப்பப்படாது. Sentriq உரையாடலைச் சேமிக்காது. கடவுச்சொல், மீட்புக் குறியீடு, ஒருமுறை குறியீடு அல்லது உள்நுழைவு இணைப்பை உள்ளிட வேண்டாம்.",
    trustNote: "இது பொதுவான உதவி; உங்கள் கணக்கு நிலையைப் பற்றியது அல்ல. உள்நுழைவு, மீட்பு மற்றும் பாதுகாப்புச் சரிபார்ப்புகளை சேவையகமே செய்கிறது.",
    input: "உங்கள் கேள்வியை எழுதவும்",
    placeholder: "எடுத்துக்காட்டு: என் கைபேசி தொலைந்துவிட்டது; உள்நுழைய முடியவில்லை",
    send: "கேள்வியை அனுப்பு",
    close: "Sentriq உதவியாளரை மூடு",
    language: "உதவியாளர் மொழி",
    loading: "பாதுகாப்பான பதிலைத் தயார் செய்கிறேன்…",
    error: "கேள்வியை அனுப்ப முடியவில்லை. இதற்குப் பதிலாக இணையமில்லா வழிகாட்டலை வழங்குகிறேன்.",
    tooLong: "கேள்வியை 600 எழுத்துகளுக்குள் வைத்திருக்கவும்.",
    responseLabel: "உதவியாளர் உரையாடல்",
    aiLabel: "OpenAI பதில்",
    configuredLabel: "OpenAI அமைக்கப்பட்டுள்ளது · கோரிக்கையில் அணுகல் சரிபார்க்கப்படும்",
    offlineLabel: "இணையமில்லா வழிகாட்டல்",
    online: "OpenAI வழிகாட்டலைப் பயன்படுத்து",
    offline: "இணையமில்லா வழிகாட்டலைப் பயன்படுத்து",
    quick: "விரைவு உதவி",
    login: "உள்நுழைய உதவி",
    lost: "என் Passkey கிடைக்கவில்லை",
    forgotCode: "மீட்புக் குறியீடு கிடைக்கவில்லை",
    newPhone: "என்னிடம் புதிய கைபேசி உள்ளது",
    fingerprint: "கைரேகை வேலை செய்யவில்லை",
    explain: "Passkey-ஐ விளக்கவும்",
    unexpected: "எதிர்பாராத கோரிக்கை வந்தது",
    tamil: "Switch to English",
    links: "பாதுகாப்பான பக்கத்தைத் திறக்கவும்",
    signIn: "உள்நுழைவு",
    recovery: "கணக்கு மீட்பு",
    settings: "Passkey அமைப்புகள்",
  },
} as const;

const questions = {
  login: "I don't know how to log in",
  lost: "I lost my phone and cannot use my passkey",
  forgotCode: "I cannot find my recovery code and do not have another passkey",
  newPhone: "I have a new phone and want to add it without a QR code",
  fingerprint: "My fingerprint is not working on the passkey prompt",
  explain: "What is a passkey?",
  unexpected: "I received a device approval request that I did not start",
} as const;

function assistantPage(pathname: string): AssistantPage {
  if (pathname.startsWith("/signup")) return "register";
  if (pathname.startsWith("/recover")) return "recovery";
  if (pathname.startsWith("/settings/security")) return "passkeys";
  if (pathname.startsWith("/login")) return "login";
  return "settings";
}

export function RecoveryAssistant() {
  const pathname = usePathname();
  const { preferences, setPreference } = useAccessPreferences();
  const locale = preferences.language === "ta" ? "ta" : "en";
  const words = copy[locale];
  const page = assistantPage(pathname);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [providerMode, setProviderMode] = useState<"openai" | "offline">("offline");
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [statusError, setStatusError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageId = useRef(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/assistant", { method: "GET", cache: "no-store", credentials: "omit" })
      .then(async (response) => response.ok ? response.json() as Promise<{ mode?: unknown }> : null)
      .then((result) => { if (active && result?.mode === "openai") setProviderMode("openai"); })
      .catch(() => { if (active) setProviderMode("offline"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAssistant();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // closeAssistant is stable for this listener's purpose; reopening installs a fresh handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function addAssistantMessage(content: string, mode: ChatMessage["mode"] = "offline") {
    messageId.current += 1;
    setMessages((current) => [...current, { id: messageId.current, role: "assistant", content, mode }]);
  }

  function closeAssistant() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  async function ask(value: string, pageOverride?: AssistantPage) {
    const prompt = value.trim();
    if (!prompt || busy) return;
    if (prompt.length > 600) { setLocalError(words.tooLong); return; }
    setQuestion("");
    setLocalError("");
    setStatusError("");

    if (classifyAssistantSecret(prompt)) {
      addAssistantMessage(getSensitiveMessage(locale));
      return;
    }

    const userMessage: ChatMessage = { id: ++messageId.current, role: "user", content: prompt };
    const next = [...messages, userMessage].slice(-8);
    setMessages(next);
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale: locale satisfies AssistantLocale,
          page: pageOverride ?? page,
          messages: next.map(({ role, content }) => ({ role, content })),
          offlineOnly: offlineOnly || providerMode !== "openai",
        }),
      });
      const result: unknown = await response.json();
      if (response.ok && result && typeof result === "object" && "text" in result && typeof result.text === "string") {
        const mode = "mode" in result && result.mode === "openai" ? "openai" : "offline";
        addAssistantMessage(result.text, mode);
      } else {
        setStatusError(words.error);
        addAssistantMessage(getOfflineAssistantReply(prompt, locale, pageOverride ?? page), "offline");
      }
    } catch {
      setStatusError(words.error);
      addAssistantMessage(getUnavailableMessage(locale), "offline");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  function setLocale(language: LanguageCode) {
    // Keep both auth-form progress and this conversation intact while preferences change.
    setPreference("language", language);
  }

  return <div className="sentriq-assistant-root">
    <button
      ref={triggerRef}
      className="assistant-launcher"
      type="button"
      aria-expanded={open}
      aria-controls="sentriq-assistant-panel"
      onClick={() => setOpen((value) => !value)}
    >{words.launcher}</button>
    {open ? <section id="sentriq-assistant-panel" className="assistant-panel" aria-labelledby="sentriq-assistant-title" aria-label={words.title}>
      <header className="assistant-header">
        <div><p className="page-kicker">SENTRIQ ACCESS</p><h2 id="sentriq-assistant-title">{words.title}</h2></div>
        <button className="assistant-close" type="button" aria-label={words.close} onClick={closeAssistant}>×</button>
      </header>
      <div className="assistant-settings-row">
        <label htmlFor="sentriq-assistant-language">{words.language}</label>
        <select id="sentriq-assistant-language" value={locale} onChange={(event) => setLocale(event.currentTarget.value as LanguageCode)}>
          <option value="en">English</option><option value="ta">தமிழ்</option>
        </select>
      </div>
      <p className="assistant-disclosure">{providerMode === "openai" && !offlineOnly ? words.liveDisclosure : words.offlineDisclosure}</p>
      <p className="assistant-trust-note">{words.trustNote}</p>
      {providerMode === "openai" ? <button className="assistant-mode-toggle" type="button" onClick={() => setOfflineOnly((value) => !value)}>
        {offlineOnly ? words.online : words.offline}
      </button> : null}
      <div className="assistant-quick-actions" aria-label={words.quick}>
        <p className="assistant-subheading">{words.quick}</p>
        <div className="assistant-chip-list">
          <button type="button" disabled={busy} onClick={() => void ask(questions.login, "login")}>{words.login}</button>
          <button type="button" disabled={busy} onClick={() => void ask(questions.lost, "recovery")}>{words.lost}</button>
          <button type="button" disabled={busy} onClick={() => void ask(questions.forgotCode, "recovery")}>{words.forgotCode}</button>
          <button type="button" disabled={busy} onClick={() => void ask(questions.newPhone, "device-link")}>{words.newPhone}</button>
          <button type="button" disabled={busy} onClick={() => void ask(questions.fingerprint, "login")}>{words.fingerprint}</button>
          <button type="button" disabled={busy} onClick={() => void ask(questions.explain, "login")}>{words.explain}</button>
          <button type="button" disabled={busy} onClick={() => void ask(questions.unexpected, "device-link")}>{words.unexpected}</button>
          <button type="button" onClick={() => setLocale(locale === "en" ? "ta" : "en")}>{words.tamil}</button>
        </div>
      </div>
      <div className="assistant-log" role="log" tabIndex={0} aria-live="polite" aria-relevant="additions text" aria-label={words.responseLabel}>
        <article className="assistant-message assistant-message-bot">
          <p>{words.welcome}</p>
          <small>{providerMode === "openai" && !offlineOnly ? words.configuredLabel : words.offlineLabel}</small>
        </article>
        {messages.map((message) => <article className={`assistant-message ${message.role === "user" ? "assistant-message-user" : "assistant-message-bot"}`} key={message.id}>
          <p>{message.content}</p>
          {message.role === "assistant" ? <small>{message.mode === "openai" ? words.aiLabel : words.offlineLabel}</small> : null}
        </article>)}
        {busy ? <p className="assistant-loading" role="status">{words.loading}</p> : null}
      </div>
      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor="sentriq-assistant-input">{words.input}</label>
        <textarea
          ref={inputRef}
          id="sentriq-assistant-input"
          rows={2}
          maxLength={600}
          autoComplete="off"
          aria-describedby={localError ? "sentriq-assistant-local-error" : statusError ? "sentriq-assistant-status-error" : undefined}
          value={question}
          placeholder={words.placeholder}
          onChange={(event) => { setQuestion(event.currentTarget.value); setLocalError(""); }}
        />
        {localError ? <p id="sentriq-assistant-local-error" className="assistant-error" role="alert">{localError}</p> : null}
        {statusError ? <p id="sentriq-assistant-status-error" className="assistant-error" role="status">{statusError}</p> : null}
        <button className="button button-primary" type="submit" disabled={!question.trim() || busy}>{busy ? words.loading : words.send}</button>
      </form>
      <nav className="assistant-links" aria-label={words.links}>
        <Link href="/login">{words.signIn}</Link>
        <Link href="/recover">{words.recovery}</Link>
        <Link href="/settings/security">{words.settings}</Link>
      </nav>
    </section> : null}
  </div>;
}
