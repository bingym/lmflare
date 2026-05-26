import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useRouteNavigate } from "../contexts/RouteTransition";
import {
  Typography,
  Button,
  Input,
  List,
  Tag,
  Space,
  Spin,
  message,
  Breadcrumb,
  Alert,
  Modal,
  Switch,
  Table,
  Descriptions,
  Card,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import ArrowLeftOutlined from "@ant-design/icons/es/icons/ArrowLeftOutlined";
import PlusOutlined from "@ant-design/icons/es/icons/PlusOutlined";
import MinusOutlined from "@ant-design/icons/es/icons/MinusOutlined";
import SearchOutlined from "@ant-design/icons/es/icons/SearchOutlined";
import SyncOutlined from "@ant-design/icons/es/icons/SyncOutlined";
import CopyOutlined from "@ant-design/icons/es/icons/CopyOutlined";
import ApiOutlined from "@ant-design/icons/es/icons/ApiOutlined";
import {
  listProviders,
  listModels,
  fetchRemoteModels,
  addModels,
  removeModel,
  setModelEnabled,
  updateProvider,
  type ProviderDTO,
  type ProviderType,
  type ModelDTO,
  type RemoteModelDTO,
} from "../services/api";
import EditOutlined from "@ant-design/icons/es/icons/EditOutlined";
import ProviderForm from "../components/ProviderForm";

function maskApiKey(key: string): string {
  if (!key || key.length <= 10) return "****";
  return `${key.slice(0, 5)}........${key.slice(-4)}`;
}

function modelFamilyLetter(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes("deepseek")) return "D";
  if (id.includes("glm")) return "G";
  if (id.includes("qwen")) return "Q";
  return modelId.slice(0, 1).toUpperCase();
}

export default function Models() {
  const { id: providerId } = useParams<{ id: string }>();
  const { navigate } = useRouteNavigate();

  const [provider, setProvider] = useState<ProviderDTO | null>(null);
  const [localModels, setLocalModels] = useState<ModelDTO[]>([]);
  const [remoteModels, setRemoteModels] = useState<RemoteModelDTO[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [remoteSearch, setRemoteSearch] = useState("");
  const [operating, setOperating] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editFormLoading, setEditFormLoading] = useState(false);

  const localModelIds = useMemo(
    () => new Set(localModels.map((m) => m.modelId)),
    [localModels]
  );

  const enabledCount = useMemo(
    () => localModels.filter((m) => m.enabled).length,
    [localModels]
  );

  const filteredLocal = useMemo(() => {
    if (!localSearch.trim()) return localModels;
    const q = localSearch.toLowerCase();
    return localModels.filter((m) => m.modelId.toLowerCase().includes(q));
  }, [localModels, localSearch]);

  const filteredRemote = useMemo(() => {
    if (!remoteSearch.trim()) return remoteModels;
    const q = remoteSearch.toLowerCase();
    return remoteModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.owned_by && m.owned_by.toLowerCase().includes(q))
    );
  }, [remoteModels, remoteSearch]);

  const loadProvider = useCallback(async () => {
    if (!providerId) return;
    const providers = await listProviders();
    const p = providers.find((x) => x.id === providerId) ?? null;
    setProvider(p);
  }, [providerId]);

  const loadLocal = useCallback(async () => {
    if (!providerId) return;
    const models = await listModels(providerId);
    setLocalModels(models);
  }, [providerId]);

  const loadRemote = useCallback(async () => {
    if (!providerId) return;
    setLoadingRemote(true);
    setFetchError(null);
    try {
      const models = await fetchRemoteModels(providerId);
      setRemoteModels(models);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to fetch remote models"
      );
    } finally {
      setLoadingRemote(false);
    }
  }, [providerId]);

  useEffect(() => {
    loadProvider();
    loadLocal();
  }, [loadProvider, loadLocal]);

  const withOp = async (key: string, fn: () => Promise<void>) => {
    setOperating((prev) => new Set(prev).add(key));
    try {
      await fn();
    } finally {
      setOperating((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleAddRemote = (modelId: string) =>
    withOp(`add:${modelId}`, async () => {
      if (!providerId) return;
      await addModels(providerId, [modelId]);
      await loadLocal();
      message.success("Added");
    }).catch((err) => {
      message.error(err instanceof Error ? err.message : "Failed to add");
    });

  const handleRemove = (modelId: string) =>
    withOp(`rm:${modelId}`, async () => {
      if (!providerId) return;
      await removeModel(providerId, modelId);
      await loadLocal();
      message.success("Removed");
    }).catch((err) => {
      message.error(err instanceof Error ? err.message : "Failed to remove");
    });

  const handleManualAdd = () => {
    const name = manualName.trim();
    if (!name || !providerId) {
      message.warning("Please enter model name");
      return;
    }
    void withOp("manual-add", async () => {
      await addModels(providerId, [name]);
      await loadLocal();
      setManualName("");
      setAddModalOpen(false);
      message.success("Added");
    }).catch((err) => {
      message.error(err instanceof Error ? err.message : "Failed to add");
    });
  };

  const handleToggleEnabled = (modelId: string, enabled: boolean) => {
    if (!providerId) return;
    void withOp(`en:${modelId}`, async () => {
      const updated = await setModelEnabled(providerId, modelId, enabled);
      setLocalModels((prev) =>
        prev.map((m) => (m.modelId === modelId ? updated : m))
      );
    }).catch((err) => {
      message.error(err instanceof Error ? err.message : "Failed to update");
      void loadLocal();
    });
  };

  const handleEditProvider = async (values: {
    name: string;
    slug: string;
    type: ProviderType;
    endpoint: string;
    apiKey: string;
  }) => {
    if (!provider) return;
    setEditFormLoading(true);
    try {
      await updateProvider(provider.id, values);
      message.success("Provider updated");
      setEditFormOpen(false);
      await loadProvider();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditFormLoading(false);
    }
  };

  const openManageModal = () => {
    setManageModalOpen(true);
    setRemoteSearch("");
    void loadRemote();
  };

  const typeLabel =
    provider?.type === "anthropic"
      ? "Anthropic / Messages"
      : provider?.type === "openai-responses"
        ? "OpenAI / Responses"
        : "OpenAI / Chat Completions";

  const remoteColumns: ColumnsType<RemoteModelDTO> = [
    {
      title: "Model Name",
      dataIndex: "id",
      key: "id",
      render: (id: string) => (
        <span style={{ fontFamily: "monospace", fontSize: 13 }}>{id}</span>
      ),
    },
    {
      title: "Actions",
      key: "op",
      width: 100,
      align: "right",
      render: (_, row) => {
        const added = localModelIds.has(row.id);
        const busy = operating.has(`add:${row.id}`);
        return added ? (
          <Tag color="green">Added</Tag>
        ) : (
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            loading={busy}
            onClick={() => void handleAddRemote(row.id)}
          >
            Add
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            title: (
              <a onClick={() => navigate("/providers")}>Providers</a>
            ),
          },
          { title: provider?.name ?? "…" },
          { title: "Models" },
        ]}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/providers")}
        />
        <Typography.Title level={4} style={{ margin: 0, flex: 1 }}>
          {provider?.name ?? "…"}
        </Typography.Title>
        <Space size={8}>
          {provider && (
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => setEditFormOpen(true)}
            >
              Edit
            </Button>
          )}
          <Tag color="green">{typeLabel}</Tag>
          <Tag>{localModels.length} local models</Tag>
          <Tag color="blue">{enabledCount} enabled</Tag>
        </Space>
      </div>

      {provider && (
        <>
          <Card
            size="small"
            style={{ marginBottom: 16, background: "#fafafa", border: "1px solid #f0f0f0" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <ApiOutlined style={{ color: "#1677ff" }} />
              <Typography.Text strong>API Endpoints</Typography.Text>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(provider.type === "anthropic"
                ? [{ path: "/v1/messages", label: "Messages (Anthropic)", method: "POST" }]
                : provider.type === "openai-responses"
                  ? [{ path: "/v1/responses", label: "Responses", method: "POST" }]
                  : [{ path: "/v1/chat/completions", label: "Chat Completions", method: "POST" }]
              ).map(({ path, label, method }) => {
                const url = `${window.location.origin}${path}`;
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
                    <Tooltip title="Copy">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          message.success("Copied to clipboard");
                        }}
                      />
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </Card>

          <Descriptions
            bordered
            size="small"
            column={1}
            style={{ marginBottom: 20 }}
          >
            <Descriptions.Item label="Upstream Endpoint">
              <Typography.Text copyable style={{ fontFamily: "monospace", fontSize: 13 }}>
                {provider.endpoint.replace(/\/+$/, "")}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="API Key">
              <Typography.Text
                copyable={{ text: provider.apiKey }}
                style={{ fontFamily: "monospace", fontSize: 13 }}
              >
                {maskApiKey(provider.apiKey)}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        </>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Typography.Title level={5} style={{ margin: 0 }}>
          Models
        </Typography.Title>
        <Space wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search local models"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setManualName("");
              setAddModalOpen(true);
            }}
          >
            Add
          </Button>
          <Button onClick={openManageModal}>Manage</Button>
        </Space>
      </div>

      <List
        dataSource={filteredLocal}
        locale={{ emptyText: "No local models, click \"Add\" to manually input, or \"Manage\" to sync from upstream" }}
        renderItem={(item) => {
          const busy = operating.has(`rm:${item.modelId}`);
          return (
            <List.Item
              style={{
                padding: "10px 12px",
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                marginBottom: 8,
              }}
              actions={[
                <Switch
                  key="en"
                  checkedChildren="On"
                  unCheckedChildren="Off"
                  checked={item.enabled}
                  onChange={(v) => handleToggleEnabled(item.modelId, v)}
                  disabled={operating.has(`en:${item.modelId}`)}
                />,
                <Button
                  key="rm"
                  type="text"
                  danger
                  size="small"
                  icon={<MinusOutlined />}
                  loading={busy}
                  onClick={() => void handleRemove(item.modelId)}
                />,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "#e6f4ff",
                      color: "#1677ff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                    }}
                  >
                    {modelFamilyLetter(item.modelId)}
                  </div>
                }
                title={
                  <Typography.Text
                    copyable={{
                      text: `${provider?.slug ?? ""}/${item.modelId}`,
                      tooltips: ["Copy model name", "Copied"],
                    }}
                    style={{ fontFamily: "monospace", fontSize: 14 }}
                  >
                    {item.modelId}
                  </Typography.Text>
                }
              />
            </List.Item>
          );
        }}
      />

      <Modal
        title={`Add Model · ${provider?.name ?? ""}`}
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: "100%" }} size="middle">
          <Input
            placeholder="Enter model name"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            onPressEnter={() => handleManualAdd()}
          />
          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            loading={operating.has("manual-add")}
            onClick={() => handleManualAdd()}
          >
            Add
          </Button>
        </Space>
      </Modal>

      {provider && (
        <ProviderForm
          open={editFormOpen}
          editing={provider}
          onCancel={() => setEditFormOpen(false)}
          onOk={handleEditProvider}
          loading={editFormLoading}
        />
      )}

      <Modal
        title={`Remote Models · ${provider?.name ?? ""}`}
        open={manageModalOpen}
        onCancel={() => {
          setManageModalOpen(false);
          setFetchError(null);
        }}
        width={720}
        footer={null}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: "100%" }} size="middle">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search model name"
              value={remoteSearch}
              onChange={(e) => setRemoteSearch(e.target.value)}
              allowClear
              style={{ flex: 1, minWidth: 200 }}
            />
            <Button
              icon={<SyncOutlined spin={loadingRemote} />}
              onClick={() => void loadRemote()}
              loading={loadingRemote}
            >
              Refresh
            </Button>
          </div>
          {fetchError && (
            <Alert type="error" title={fetchError} showIcon closable onClose={() => setFetchError(null)} />
          )}
          {loadingRemote && remoteModels.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Spin description="Fetching remote models from upstream..." />
            </div>
          ) : (
            <Table
              size="small"
              rowKey="id"
              columns={remoteColumns}
              dataSource={filteredRemote}
              pagination={{ pageSize: 12, showSizeChanger: false }}
              locale={{ emptyText: "No remote models or no matches found" }}
            />
          )}
        </Space>
      </Modal>
    </div>
  );
}
