import type { ProxyTarget } from "./base";

/**
 * Forward an Anthropic Messages request to an Anthropic upstream.
 */
export async function proxyToAnthropic(
  target: ProxyTarget,
  body: Record<string, unknown>,
  isStreaming: boolean
): Promise<Response> {
  const url = `${target.endpoint.replace(/\/+$/, "")}/v1/messages`;
  const upstreamBody = { ...body, model: target.modelId };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": target.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(upstreamBody),
  });

  if (isStreaming && resp.body) {
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  return new Response(resp.body, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Convert an OpenAI chat/completions request to Anthropic Messages format,
 * send to an Anthropic upstream, then convert the response back.
 */
export async function openaiToAnthropic(
  target: ProxyTarget,
  body: Record<string, unknown>,
  isStreaming: boolean
): Promise<Response> {
  const anthropicBody = convertOpenAIToAnthropicRequest(body, target.modelId);
  const url = `${target.endpoint.replace(/\/+$/, "")}/v1/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": target.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(anthropicBody),
  });

  if (isStreaming && resp.body) {
    const transformed = transformAnthropicStreamToOpenAI(resp.body, target.modelId);
    return new Response(transformed, {
      status: resp.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  const anthropicResp = (await resp.json()) as Record<string, unknown>;
  const openaiResp = convertAnthropicToOpenAIResponse(anthropicResp);
  return new Response(JSON.stringify(openaiResp), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}

function convertOpenAIToAnthropicRequest(
  body: Record<string, unknown>,
  modelId: string
): Record<string, unknown> {
  const openaiMessages = body.messages as {
    role: string;
    content: unknown;
  }[];

  let system: string | undefined;
  const messages: { role: string; content: unknown }[] = [];

  for (const msg of openaiMessages) {
    if (msg.role === "system") {
      system = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    } else {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }
  }

  const result: Record<string, unknown> = {
    model: modelId,
    messages,
    stream: body.stream ?? false,
    max_tokens: (body.max_tokens as number) || 4096,
  };

  if (system) result.system = system;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.stop) result.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];

  return result;
}

function convertAnthropicToOpenAIResponse(
  resp: Record<string, unknown>
): Record<string, unknown> {
  const content = resp.content as { type: string; text?: string }[] | undefined;
  const textParts = content?.filter((c) => c.type === "text").map((c) => c.text ?? "") ?? [];
  const text = textParts.join("");
  const usage = resp.usage as { input_tokens?: number; output_tokens?: number } | undefined;

  const stopReason = resp.stop_reason as string | null;
  let finishReason = "stop";
  if (stopReason === "max_tokens") finishReason = "length";
  else if (stopReason === "tool_use") finishReason = "tool_calls";

  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: resp.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: usage?.input_tokens ?? 0,
      completion_tokens: usage?.output_tokens ?? 0,
      total_tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    },
  };
}

function transformAnthropicStreamToOpenAI(
  readable: ReadableStream<Uint8Array>,
  modelId: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  const chatId = `chatcmpl-${crypto.randomUUID()}`;

  return new ReadableStream({
    async start(controller) {
      const reader = readable.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event = JSON.parse(data) as Record<string, unknown>;
              const type = event.type as string;

              if (type === "content_block_delta") {
                const delta = event.delta as { type?: string; text?: string } | undefined;
                if (delta?.type === "text_delta" && delta.text) {
                  const chunk = {
                    id: chatId,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: modelId,
                    choices: [
                      {
                        index: 0,
                        delta: { content: delta.text },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
                  );
                }
              } else if (type === "message_delta") {
                const delta = event.delta as { stop_reason?: string } | undefined;
                let finishReason = "stop";
                if (delta?.stop_reason === "max_tokens") finishReason = "length";

                const chunk = {
                  id: chatId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: modelId,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: finishReason,
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
                );
              } else if (type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            } catch {
              // skip unparseable
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}
