const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    ALGORITHM,
    false,
    ["sign", "verify"]
  );
}

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + TOKEN_EXPIRY_SECONDS };

  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)).buffer as ArrayBuffer);
  const payloadB64 = base64url(enc.encode(JSON.stringify(fullPayload)).buffer as ArrayBuffer);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign(ALGORITHM.name, key, enc.encode(signingInput));

  return `${signingInput}.${base64url(sig)}`;
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const enc = new TextEncoder();
  const sigBytes = base64urlDecode(sigB64);

  const valid = await crypto.subtle.verify(
    ALGORITHM.name,
    key,
    sigBytes,
    enc.encode(signingInput)
  );
  if (!valid) return null;

  const payloadJson = new TextDecoder().decode(base64urlDecode(payloadB64));
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) return null;

  return payload;
}
