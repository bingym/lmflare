import { useState, useEffect, useCallback } from "react";
import { useRouteNavigate } from "../contexts/RouteTransition";
import { preloadRoute } from "../routes/lazyPages";
import { Card, Button, Typography, Space, Tag, Row, Col, Popconfirm, message, Spin, Empty, Tooltip } from "antd";
import PlusOutlined from "@ant-design/icons/es/icons/PlusOutlined";
import EditOutlined from "@ant-design/icons/es/icons/EditOutlined";
import DeleteOutlined from "@ant-design/icons/es/icons/DeleteOutlined";
import DatabaseOutlined from "@ant-design/icons/es/icons/DatabaseOutlined";
import CopyOutlined from "@ant-design/icons/es/icons/CopyOutlined";
import ApiOutlined from "@ant-design/icons/es/icons/ApiOutlined";
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  listModels,
  type ProviderDTO,
} from "../services/api";
import ProviderForm from "../components/ProviderForm";

const API_ENDPOINTS = [
  { path: "/v1/chat/completions", label: "Chat Completions", method: "POST" },
  { path: "/v1/responses", label: "Responses", method: "POST" },
  { path: "/v1/messages", label: "Messages (Anthropic)", method: "POST" },
] as const;

function getBaseUrl(): string {
  return window.location.origin;
}

function EndpointList() {
  const base = getBaseUrl();
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      message.success("已复制到剪贴板");
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <Card
      size="small"
      style={{ marginBottom: 20, background: "#fafafa", border: "1px solid #f0f0f0" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <ApiOutlined style={{ color: "#1677ff" }} />
        <Typography.Text strong>API Endpoints</Typography.Text>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {API_ENDPOINTS.map(({ path, label, method }) => {
          const url = `${base}${path}`;
          const isCopied = copied === url;
          return (
            <div
              key={path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                background: "#fff",
                border: "1px solid #f0f0f0",
              }}
            >
              <Tag
                color="blue"
                style={{ margin: 0, fontSize: 11, lineHeight: "20px", fontFamily: "monospace" }}
              >
                {method}
              </Tag>
              <code
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: "rgba(0,0,0,0.75)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {url}
              </code>
              <Typography.Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                {label}
              </Typography.Text>
              <Tooltip title={isCopied ? "已复制!" : "复制地址"}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined style={{ color: isCopied ? "#52c41a" : undefined }} />}
                  onClick={(e) => handleCopy(url, e)}
                />
              </Tooltip>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function Providers() {
  const { navigate } = useRouteNavigate();
  const [providers, setProviders] = useState<
    (ProviderDTO & { modelCount: number; enabledCount: number })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editing, setEditing] = useState<ProviderDTO | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProviders();
      const withCounts = await Promise.all(
        list.map(async (p) => {
          const models = await listModels(p.id);
          const enabledCount = models.filter((m) => m.enabled).length;
          return { ...p, modelCount: models.length, enabledCount };
        })
      );
      setProviders(withCounts);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (p: ProviderDTO, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(p);
    setFormOpen(true);
  };

  const handleFormOk = async (values: {
    name: string;
    slug: string;
    type: "openai" | "anthropic";
    endpoint: string;
    apiKey: string;
  }) => {
    setFormLoading(true);
    try {
      if (editing) {
        await updateProvider(editing.id, values);
        message.success("Provider updated");
      } else {
        await createProvider(values);
        message.success("Provider created");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProvider(id);
      message.success("Provider deleted");
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Providers
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          New Provider
        </Button>
      </div>

      <EndpointList />

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : providers.length === 0 ? (
        <Empty description="No providers yet">
          <Button type="primary" onClick={handleCreate}>
            Create your first provider
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {providers.map((p) => (
            <Col key={p.id} xs={24} sm={12} lg={8}>
              <Card
                className="hoverable-card"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => preloadRoute("models")}
                onFocus={() => preloadRoute("models")}
                onClick={() => navigate(`/providers/${p.id}/models`)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {p.name}
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {p.slug}
                    </Typography.Text>
                  </div>
                  <Tag color={p.type === "openai" ? "blue" : "orange"}>
                    {p.type === "openai" ? "OpenAI" : "Anthropic"}
                  </Tag>
                </div>
                <div style={{ marginTop: 12, color: "rgba(0,0,0,0.45)", fontSize: 13 }}>
                  {p.endpoint}
                </div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Space size={4}>
                    <DatabaseOutlined style={{ color: "rgba(0,0,0,0.45)" }} />
                    <Typography.Text type="secondary">
                      {p.enabledCount}/{p.modelCount} 已启用
                    </Typography.Text>
                  </Space>
                  <Space size={4}>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(e) => handleEdit(p, e)}
                    />
                    <Popconfirm
                      title="Delete this provider?"
                      description="All associated models will also be removed."
                      onConfirm={() => handleDelete(p.id)}
                      onCancel={(e) => e?.stopPropagation()}
                      onPopupClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <ProviderForm
        open={formOpen}
        editing={editing}
        onCancel={() => setFormOpen(false)}
        onOk={handleFormOk}
        loading={formLoading}
      />
    </div>
  );
}
