/**
 * KV-backed secret key store for fast proxy-path authentication.
 * KV key: the secret key string (e.g. "sk-lmf-abc123")
 * KV value: the app id
 */

export async function putKey(
  kv: KVNamespace,
  secretKey: string,
  appId: string
): Promise<void> {
  await kv.put(secretKey, appId);
}

export async function lookupKey(
  kv: KVNamespace,
  secretKey: string
): Promise<string | null> {
  return kv.get(secretKey);
}

export async function removeKey(
  kv: KVNamespace,
  secretKey: string
): Promise<void> {
  await kv.delete(secretKey);
}

export function generateSecretKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sk-lmf-${hex}`;
}
