const secretLikeValue = /\b(api[_-]?key|token|secret|password|credential)\b(["']?\s*[:=]\s*["']?)[^\s,"']+/gi;
const windowsPath = /\b[A-Z]:\\(?:[^\s"'<>]+\\?)+/gi;
const unixPath = /(?<![\w:])\/(?:[^\s"'<>]+\/)*[^\s"'<>]*/g;

const knownMigrationErrors = new Set([
  "Invalid security API configuration",
  "Production requires an absolute persistent data directory and explicit TLS termination",
  "Applied migration checksum mismatch",
]);
const migrationChecksumMismatch = /^Applied migration checksum mismatch for [a-z0-9_]+: stored=[a-f0-9]{64}, expected=[a-f0-9]{64}$/;

export function describeMigrationFailure(phase: string, cause: unknown): string {
  const error = cause instanceof Error ? cause : undefined;
  const name = error?.name && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name) ? error.name : "UnknownError";
  const codeValue = cause && typeof cause === "object" && "code" in cause
    ? (cause as { code?: unknown }).code
    : undefined;
  const code = typeof codeValue === "string" && /^[A-Z0-9_:-]{1,40}$/.test(codeValue) ? ` code=${codeValue}` : "";
  const safeMessage = error?.message
    ? knownMigrationErrors.has(error.message)
      ? error.message
      : migrationChecksumMismatch.test(error.message)
        ? error.message
      : error.message.replace(secretLikeValue, "$1=[redacted]").replace(windowsPath, "[path]").replace(unixPath, "[path]").slice(0, 180)
    : "No error message available";

  return `Security API migration failed (phase=${phase}, error=${name}${code}): ${safeMessage}`;
}
