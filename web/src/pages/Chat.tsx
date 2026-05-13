import { useState, useEffect, useCallback, useRef } from "react";
import {
  Typography,
  Select,
  Input,
  Button,
  Space,
  Switch,
  message,
  Spin,
  Empty,
} from "antd";
import { SendOutlined, ClearOutlined, BulbOutlined } from "@ant-design/icons";
import { listApps, type AppDTO } from "../services/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  reasoningContent?: string;
}

interface ModelItem {
  id: string;
  owned_by: string;
}

export default function Chat() {
  const [apps, setApps] = useState<AppDTO[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | undefined>();
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    shouldAutoScroll.current = atBottom;
  };

  useEffect(() => {
    if (shouldAutoScroll.current) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const selectedAppKey = apps.find((a) => a.id === selectedApp)?.secretKey;

  const loadApps = useCallback(async () => {
    try {
      const list = await listApps();
      setApps(list);
      const withKey = list.find((a) => a.secretKey);
      if (withKey) setSelectedApp(withKey.id);
    } catch {
      message.error("加载 Apps 失败");
    }
  }, []);

  const loadModels = useCallback(async (apiKey: string) => {
    try {
      const resp = await fetch("/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as { data?: ModelItem[] };
      const list = json.data ?? [];
      setModels(list);
      if (list.length > 0 && !list.find((m) => m.id === selectedModel)) {
        setSelectedModel(list[0].id);
      }
    } catch {
      message.error("加载模型列表失败");
      setModels([]);
    }
  }, [selectedModel]);

  useEffect(() => {
    void loadApps().finally(() => setLoadingInit(false));
  }, [loadApps]);

  useEffect(() => {
    if (selectedAppKey) {
      void loadModels(selectedAppKey);
    } else {
      setModels([]);
    }
  }, [selectedAppKey, loadModels]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !selectedModel || !selectedAppKey) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    shouldAutoScroll.current = true;

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${selectedAppKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          enable_thinking: thinkingEnabled,
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let accumulatedReasoning = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload) as {
              choices?: { delta?: { content?: string; reasoning_content?: string } }[];
            };
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.reasoning_content) {
              accumulatedReasoning += delta.reasoning_content;
            }
            if (delta?.content) {
              accumulated += delta.content;
            }
            if (delta?.content || delta?.reasoning_content) {
              const snapContent = accumulated;
              const snapReasoning = accumulatedReasoning;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: snapContent,
                  ...(snapReasoning && { reasoningContent: snapReasoning }),
                };
                return next;
              });
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      message.error(
        "请求失败: " + ((err as Error).message || "Unknown error")
      );
      setMessages((prev) => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === "assistant" && !next[next.length - 1].content) {
          next.pop();
        }
        return next;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleClear = () => {
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (loadingInit) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const noKey = apps.length > 0 && !apps.some((a) => a.secretKey);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 48px)",
        maxHeight: "calc(100vh - 48px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 0 12px",
          borderBottom: "1px solid #f0f0f0",
          flexWrap: "wrap",
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          Chat
        </Typography.Title>
        <Select
          placeholder="选择 App"
          value={selectedApp}
          onChange={setSelectedApp}
          style={{ width: 180 }}
          options={apps
            .filter((a) => a.secretKey)
            .map((a) => ({ label: a.name, value: a.id }))}
          notFoundContent="无可用 App"
        />
        <Select
          placeholder="选择模型"
          value={selectedModel}
          onChange={setSelectedModel}
          style={{ width: 300 }}
          showSearch
          optionFilterProp="label"
          options={models.map((m) => ({ label: m.id, value: m.id }))}
          notFoundContent={selectedAppKey ? "无可用模型" : "请先选择 App"}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <BulbOutlined style={{ color: thinkingEnabled ? "#faad14" : undefined }} />
          <Switch
            size="small"
            checked={thinkingEnabled}
            onChange={setThinkingEnabled}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            思考
          </Typography.Text>
        </div>
        <Button
          icon={<ClearOutlined />}
          onClick={handleClear}
          disabled={messages.length === 0}
        >
          清空
        </Button>
      </div>

      {noKey && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <Empty description="请先在 Apps 页面生成一个 Secret Key" />
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 0",
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "rgba(0,0,0,0.25)",
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 16 }}>
              选择模型，开始对话
            </Typography.Text>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent:
                  msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  maxWidth: "75%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  background:
                    msg.role === "user" ? "#1677ff" : "#f5f5f5",
                  color: msg.role === "user" ? "#fff" : "inherit",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.6,
                  fontSize: 14,
                }}
              >
                {msg.reasoningContent && (
                  <details
                    style={{
                      marginBottom: 8,
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "rgba(250,173,20,0.08)",
                      border: "1px solid rgba(250,173,20,0.25)",
                      fontSize: 13,
                      color: "rgba(0,0,0,0.65)",
                    }}
                  >
                    <summary style={{ cursor: "pointer", color: "#faad14", fontWeight: 500, userSelect: "none" }}>
                      思考过程
                    </summary>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {msg.reasoningContent}
                    </div>
                  </details>
                )}
                {msg.content}
                {msg.role === "assistant" && loading && i === messages.length - 1 && (
                  <span className="chat-cursor" />
                )}
              </div>
            </div>
          ))
        )}
        <div ref={listEndRef} />
      </div>

      <div
        style={{
          borderTop: "1px solid #f0f0f0",
          padding: "12px 0 0",
        }}
      >
        <Space.Compact style={{ width: "100%" }}>
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedModel ? "输入消息，Enter 发送，Shift+Enter 换行" : "请先选择模型"
            }
            disabled={!selectedModel || !selectedAppKey}
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ borderRadius: "8px 0 0 8px" }}
          />
          {loading ? (
            <Button
              danger
              onClick={handleStop}
              style={{ height: "auto", borderRadius: "0 8px 8px 0" }}
            >
              停止
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => void handleSend()}
              disabled={!input.trim() || !selectedModel || !selectedAppKey}
              style={{ height: "auto", borderRadius: "0 8px 8px 0" }}
            >
              发送
            </Button>
          )}
        </Space.Compact>
      </div>
    </div>
  );
}
