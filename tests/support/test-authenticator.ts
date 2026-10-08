import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

// Test-only software authenticator. Assertions use real P-256 signatures and
// pass through the same SimpleWebAuthn verifier as browser-created credentials.
function cbor(value: unknown): Buffer {
  const head = (major: number, length: number) => length < 24 ? Buffer.from([(major << 5) | length])
    : length < 256 ? Buffer.from([(major << 5) | 24, length]) : Buffer.from([(major << 5) | 25, length >> 8, length & 255]);
  if (typeof value === "number") return head(value >= 0 ? 0 : 1, value >= 0 ? value : -1 - value);
  if (typeof value === "string") { const bytes = Buffer.from(value); return Buffer.concat([head(3, bytes.length), bytes]); }
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (value instanceof Map) return Buffer.concat([head(5, value.size), ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)])]);
  throw new Error("Unsupported test CBOR value");
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest();
const b64 = (value: Buffer) => value.toString("base64url");

export class TestAuthenticator {
  readonly id = b64(randomBytes(32));
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  private counter = 0;
  constructor() { const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }); this.privateKey = pair.privateKey; this.publicKey = pair.publicKey; }
  registration(challenge: string, origin = "http://localhost:3001", rpId = "localhost", uv = true, clientData: Record<string, unknown> = {}) {
    const jwk = this.publicKey.export({ format: "jwk" });
    const key = new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]);
    const id = Buffer.from(this.id, "base64url");
    const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
    const authData = Buffer.concat([hash(rpId), Buffer.from([uv ? 0x45 : 0x41]), Buffer.alloc(4), Buffer.alloc(16), length, id, cbor(key)]);
    const publicKey = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
    return { id: this.id, rawId: this.id, type: "public-key" as const,
      response: { clientDataJSON: b64(Buffer.from(JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false, ...clientData }))),
        attestationObject: b64(cbor(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]))),
        authenticatorData: b64(authData), transports: ["internal" as const], publicKeyAlgorithm: -7, publicKey: b64(publicKey) },
      clientExtensionResults: {}, authenticatorAttachment: "platform" as const };
  }
  assertion(challenge: string, userId: string, options: { origin?: string; rpId?: string; uv?: boolean; counter?: number; badSignature?: boolean; clientData?: Record<string, unknown>; rawClientData?: Buffer } = {}) {
    const counterValue = options.counter ?? this.counter + 1;
    this.counter = Math.max(this.counter, counterValue);
    const counter = Buffer.alloc(4); counter.writeUInt32BE(counterValue);
    const authData = Buffer.concat([hash(options.rpId ?? "localhost"), Buffer.from([options.uv === false ? 1 : 5]), counter]);
    const clientData = options.rawClientData ?? Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: options.origin ?? "http://localhost:3001", crossOrigin: false, ...options.clientData }));
    const signature = sign("sha256", Buffer.concat([authData, hash(clientData)]), this.privateKey);
    if (options.badSignature) signature[signature.length - 1] ^= 1;
    return { id: this.id, rawId: this.id, type: "public-key" as const,
      response: { clientDataJSON: b64(clientData), authenticatorData: b64(authData), signature: b64(signature), userHandle: b64(Buffer.from(userId)) },
      clientExtensionResults: {}, authenticatorAttachment: "platform" as const };
  }
}
