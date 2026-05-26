import { useState, useEffect, useCallback, useRef } from "react";
import {
  Typography,
  Select,
  Input,
  Button,
  Switch,
  message,
  Spin,
  Empty,
  Image,
} from "antd";
import SendOutlined from "@ant-design/icons/es/icons/SendOutlined";
import ClearOutlined from "@ant-design/icons/es/icons/ClearOutlined";
import BulbOutlined from "@ant-design/icons/es/icons/BulbOutlined";
import PictureOutlined from "@ant-design/icons/es/icons/PictureOutlined";
import CloseCircleFilled from "@ant-design/icons/es/icons/CloseCircleFilled";
import { listApps, type AppDTO } from "../services/api";

interface ImageAttachment {
  dataUrl: string;
  mediaType: string;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: ImageAttachment[];
  reasoningContent?: string;
}

interface ModelItem {
  id: string;
  owned_by: string;
}

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function fileToDataUrl(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ dataUrl: reader.result as string, mediaType: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildContentParts(text: string, images: ImageAttachment[]): ContentPart[] | string {
  if (images.length === 0) return text;
  const parts: ContentPart[] = images.map((img) => ({
    type: "image_url",
    image_url: { url: img.dataUrl },
  }));
  if (text) parts.push({ type: "text", text });
  return parts;
}

export default function Chat() {
  const [apps, setApps] = useState<AppDTO[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | undefined>();
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const addImages = useCallback(async (files: File[]) => {
    const valid = files.filter((f) => {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        message.warning(`Unsupported image format: ${f.name}`);
        return false;
      }
      if (f.size > MAX_IMAGE_SIZE) {
        message.warning(`Image too large: ${f.name} (max 20MB)`);
        return false;
      }
      return true;
    });
    if (valid.length === 0) return;
    const attachments = await Promise.all(valid.map(fileToDataUrl));
    setPendingImages((prev) => [...prev, ...attachments]);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void addImages(imageFiles);
      }
    },
    [addImages]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length > 0) void addImages(files);
    },
    [addImages]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const loadApps = useCallback(async () => {
    try {
      const list = await listApps();
      setApps(list);
      const withKey = list.find((a) => a.secretKey && a.enabled);
      if (withKey) setSelectedApp(withKey.id);
    } catch {
      message.error("Failed to load Apps");
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
      message.error("Failed to load model list");
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
    if ((!text && pendingImages.length === 0) || !selectedModel || !selectedAppKey) return;

    const images = [...pendingImages];
    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      ...(images.length > 0 && { images }),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingImages([]);
    setLoading(true);
    shouldAutoScroll.current = true;

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.images?.length
          ? buildContentParts(m.content, m.images)
          : m.content,
      }));

      const resp = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${selectedAppKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
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
        "Request failed: " + ((err as Error).message || "Unknown error")
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
          placeholder="Select App"
          value={selectedApp}
          onChange={setSelectedApp}
          style={{ width: 180 }}
          options={apps
            .filter((a) => a.secretKey && a.enabled)
            .map((a) => ({ label: a.name, value: a.id }))}
          notFoundContent="No available App"
        />
        <Select
          placeholder="Select Model"
          value={selectedModel}
          onChange={setSelectedModel}
          style={{ width: 300 }}
          showSearch
          optionFilterProp="label"
          options={(() => {
            const groups = new Map<string, ModelItem[]>();
            for (const m of models) {
              const key = m.owned_by || "Other";
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(m);
            }
            return Array.from(groups.entries()).map(([group, items]) => ({
              label: group,
              options: items.map((m) => ({ label: m.id, value: m.id })),
            }));
          })()}
          notFoundContent={selectedAppKey ? "No available Model" : "Please select an App"}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <BulbOutlined style={{ color: thinkingEnabled ? "#faad14" : undefined }} />
          <Switch
            size="small"
            checked={thinkingEnabled}
            onChange={setThinkingEnabled}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Thinking
          </Typography.Text>
        </div>
        <Button
          icon={<ClearOutlined />}
          onClick={handleClear}
          disabled={messages.length === 0}
        >
          Clear
        </Button>
      </div>

      {noKey && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <Empty description="Please generate a Secret Key in the Apps page" />
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
              Select a model, start conversation
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
                      Thinking Process
                    </summary>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {msg.reasoningContent}
                    </div>
                  </details>
                )}
                {msg.images && msg.images.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: msg.content ? 8 : 0 }}>
                    {msg.images.map((img, idx) => (
                      <Image
                        key={idx}
                        src={img.dataUrl}
                        alt={`image-${idx}`}
                        style={{ borderRadius: 8, maxHeight: 200, objectFit: "contain" }}
                        width="auto"
                      />
                    ))}
                  </div>
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
        style={{ borderTop: "1px solid #f0f0f0", padding: "12px 0 0" }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {pendingImages.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {pendingImages.map((img, idx) => (
              <div key={idx} style={{ position: "relative" }}>
                <img
                  src={img.dataUrl}
                  alt={`pending-${idx}`}
                  style={{
                    height: 64,
                    maxWidth: 120,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid #d9d9d9",
                  }}
                />
                <CloseCircleFilled
                  onClick={() => removePendingImage(idx)}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    fontSize: 16,
                    color: "rgba(0,0,0,0.45)",
                    cursor: "pointer",
                    background: "#fff",
                    borderRadius: "50%",
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void addImages(files);
            e.target.value = "";
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            icon={<PictureOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedModel || !selectedAppKey}
            style={{ height: "auto", borderRadius: 8, flexShrink: 0 }}
          />
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              selectedModel
                ? "Enter message, Shift+Enter to newline, paste/drag images"
                : "Please select a model"
            }
            disabled={!selectedModel || !selectedAppKey}
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ borderRadius: 8 }}
          />
          {loading ? (
            <Button
              danger
              onClick={handleStop}
              style={{ height: "auto", borderRadius: 8, flexShrink: 0 }}
            >
              Stop
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => void handleSend()}
              disabled={(!input.trim() && pendingImages.length === 0) || !selectedModel || !selectedAppKey}
              style={{ height: "auto", borderRadius: 8, flexShrink: 0 }}
            >
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
