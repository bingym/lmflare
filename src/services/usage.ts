export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

const ZERO_USAGE: TokenUsage = { prompt_tokens: 0, completion_tokens: 0 };

export function extractUsageFromJSON(body: Record<string, unknown>): TokenUsage {
  const usage = body.usage as Record<string, unknown> | undefined;
  if (!usage) return ZERO_USAGE;
  return {
    prompt_tokens: (usage.prompt_tokens as number) ?? (usage.input_tokens as number) ?? 0,
    completion_tokens: (usage.completion_tokens as number) ?? (usage.output_tokens as number) ?? 0,
  };
}

/**
 * Wraps a streaming SSE response body to extract usage data from the last chunk.
 * Returns a new readable stream (pass-through) and a promise that resolves with usage.
 */
export function wrapStreamForUsage(
  readable: ReadableStream<Uint8Array>
): { stream: ReadableStream<Uint8Array>; usage: Promise<TokenUsage> } {
  const decoder = new TextDecoder();
  let buffer = "";
  let extracted: TokenUsage | null = null;

  let resolveUsage: (u: TokenUsage) => void;
  const usage = new Promise<TokenUsage>((resolve) => {
    resolveUsage = resolve;
  });

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);

      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (parsed.usage) {
            extracted = extractUsageFromJSON(parsed);
          }
        } catch {
          // skip
        }
      }
    },
    flush() {
      resolveUsage(extracted ?? ZERO_USAGE);
    },
  });

  return {
    stream: readable.pipeThrough(transform),
    usage,
  };
}
