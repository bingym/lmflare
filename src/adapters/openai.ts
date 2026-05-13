import type { ProxyTarget } from "./base";

/**
 * Forward an OpenAI-style request to an OpenAI-compatible upstream.
 * Handles both /v1/chat/completions and /v1/responses.
 */
export async function proxyToOpenAI(
  target: ProxyTarget,
  path: string,
  body: Record<string, unknown>,
  isStreaming: boolean
): Promise<Response> {
  const url = `${target.endpoint.replace(/\/+$/, "")}${path}`;
  const upstreamBody: Record<string, unknown> = { ...body, model: target.modelId };

  if (isStreaming) {
    upstreamBody.stream_options = { include_usage: true };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.apiKey}`,
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
 * Convert an Anthropic Messages request to OpenAI chat/completions format,
 * send to an OpenAI-compatible upstream, then convert the response back.
 */
export async function anthropicToOpenAI(
  target: ProxyTarget,
  body: Record<string, unknown>,
  isStreaming: boolean
): Promise<Response> {
  const openaiBody = convertAnthropicToOpenAIRequest(body, target.modelId);
  const url = `${target.endpoint.replace(/\/+$/, "")}/v1/chat/completions`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.apiKey}`,
    },
    body: JSON.stringify(openaiBody),
  });

  if (isStreaming && resp.body) {
    const transformed = transformOpenAIStreamToAnthropic(resp.body);
    return new Response(transformed, {
      status: resp.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  const openaiResp = (await resp.json()) as Record<string, unknown>;
  const anthropicResp = convertOpenAIToAnthropicResponse(openaiResp);
  return new Response(JSON.stringify(anthropicResp), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}

function convertAnthropicToOpenAIRequest(
  body: Record<string, unknown>,
  modelId: string
): Record<string, unknown> {
  const messages: unknown[] = [];
  const anthropicMessages = body.messages as {
    role: string;
    content: unknown;
  }[];

  if (body.system) {
    messages.push({ role: "system", content: body.system });
  }

  for (const msg of anthropicMessages) {
    messages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content:
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content),
    });
  }

  const result: Record<string, unknown> = {
    model: modelId,
    messages,
    stream: body.stream ?? false,
  };

  if (body.max_tokens) result.max_tokens = body.max_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.stop_sequences) result.stop = body.stop_sequences;

  return result;
}

function convertOpenAIToAnthropicResponse(
  resp: Record<string, unknown>
): Record<string, unknown> {
  const choices = (resp.choices as { message?: { content?: string; role?: string }; finish_reason?: string }[]) ?? [];
  const choice = choices[0];
  const content = choice?.message?.content ?? "";
  const usage = resp.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;

  return {
    id: resp.id ?? `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: content }],
    model: resp.model,
    stop_reason: choice?.finish_reason === "stop" ? "end_turn" : choice?.finish_reason ?? null,
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    },
  };
}

function transformOpenAIStreamToAnthropic(
  readable: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let sentStart = false;
  let contentIndex = 0;

  return new ReadableStream({
    async start(controller) {
      const reader = readable.getReader();

      // Send message_start event
      const startEvent = {
        type: "message_start",
        message: {
          id: `msg_${crypto.randomUUID()}`,
          type: "message",
          role: "assistant",
          content: [],
          model: "",
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      };

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
            if (data === "[DONE]") {
              controller.enqueue(
                encoder.encode(
                  `event: message_delta\ndata: ${JSON.stringify({
                    type: "message_delta",
                    delta: { stop_reason: "end_turn" },
                    usage: { output_tokens: contentIndex },
                  })}\n\n`
                )
              );
              controller.enqueue(
                encoder.encode(
                  `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`
                )
              );
              continue;
            }

            try {
              const chunk = JSON.parse(data) as {
                choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
              };
              const delta = chunk.choices?.[0]?.delta;

              if (!sentStart) {
                controller.enqueue(
                  encoder.encode(
                    `event: message_start\ndata: ${JSON.stringify(startEvent)}\n\n`
                  )
                );
                controller.enqueue(
                  encoder.encode(
                    `event: content_block_start\ndata: ${JSON.stringify({
                      type: "content_block_start",
                      index: 0,
                      content_block: { type: "text", text: "" },
                    })}\n\n`
                  )
                );
                sentStart = true;
              }

              if (delta?.content) {
                contentIndex++;
                controller.enqueue(
                  encoder.encode(
                    `event: content_block_delta\ndata: ${JSON.stringify({
                      type: "content_block_delta",
                      index: 0,
                      delta: { type: "text_delta", text: delta.content },
                    })}\n\n`
                  )
                );
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}
