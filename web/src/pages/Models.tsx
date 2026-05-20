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
} from "antd";
import type { ColumnsType } from "antd/es/table";
import ArrowLeftOutlined from "@ant-design/icons/es/icons/ArrowLeftOutlined";
import PlusOutlined from "@ant-design/icons/es/icons/PlusOutlined";
import MinusOutlined from "@ant-design/icons/es/icons/MinusOutlined";
import SearchOutlined from "@ant-design/icons/es/icons/SearchOutlined";
import SyncOutlined from "@ant-design/icons/es/icons/SyncOutlined";
import {
  listProviders,
  listModels,
  fetchRemoteModels,
  addModels,
  removeModel,
  setModelEnabled,
  type ProviderDTO,
  type ModelDTO,
  type RemoteModelDTO,
} from "../services/api";

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
        err instanceof Error ? err.message : "拉取远程模型失败"
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
      message.success("已添加");
    }).catch((err) => {
      message.error(err instanceof Error ? err.message : "添加失败");
    });

  const handleRemove = (modelId: string) =>
    withOp(`rm:${modelId}`, async () => {
      if (!providerId) return;
      await removeModel(providerId, modelId);
      await loadLocal();
      message.success("已移除");
    }).catch((err) => {
      message.error(err instanceof Error ? err.message : "移除失败");
    });

  const handleManualAdd = () => {
    const name = manualName.trim();
    if (!name || !providerId) {
      message.warning("请输入模型名");
      return;
    }
    void withOp("manual-add", async () => {
      await addModels(providerId, [name]);
      await loadLocal();
      setManualName("");
      setAddModalOpen(false);
      message.success("已添加");
    }).catch((err) => {
      message.error(err instanceof Error ? err.message : "添加失败");
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
      message.error(err instanceof Error ? err.message : "更新失败");
      void loadLocal();
    });
  };

  const openManageModal = () => {
    setManageModalOpen(true);
    setRemoteSearch("");
    void loadRemote();
  };

  const typeLabel =
    provider?.type === "anthropic"
      ? "Anthropic / Messages"
      : "OpenAI / Compatible Chat";

  const remoteColumns: ColumnsType<RemoteModelDTO> = [
    {
      title: "模型名",
      dataIndex: "id",
      key: "id",
      render: (id: string) => (
        <span style={{ fontFamily: "monospace", fontSize: 13 }}>{id}</span>
      ),
    },
    {
      title: "操作",
      key: "op",
      width: 100,
      align: "right",
      render: (_, row) => {
        const added = localModelIds.has(row.id);
        const busy = operating.has(`add:${row.id}`);
        return added ? (
          <Tag color="green">已添加</Tag>
        ) : (
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            loading={busy}
            onClick={() => void handleAddRemote(row.id)}
          >
            添加
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
              <a onClick={() => navigate("/providers")}>提供商</a>
            ),
          },
          { title: provider?.name ?? "…" },
          { title: "模型" },
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
          <Tag color="green">{typeLabel}</Tag>
          <Tag>{localModels.length} 个本地模型</Tag>
          <Tag color="blue">{enabledCount} 个启用</Tag>
        </Space>
      </div>

      {provider && (
        <Descriptions
          bordered
          size="small"
          column={1}
          style={{ marginBottom: 20 }}
        >
          <Descriptions.Item label="API 地址">
            <Typography.Text copyable style={{ fontFamily: "monospace", fontSize: 13 }}>
              {provider.endpoint.replace(/\/+$/, "")}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="接口预览">
            <Typography.Text copyable style={{ fontFamily: "monospace", fontSize: 13 }}>
              {provider.type === "anthropic"
                ? `${provider.endpoint.replace(/\/+$/, "")}/v1/messages`
                : `${provider.endpoint.replace(/\/+$/, "")}/v1/chat/completions`}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="API 密钥">
            <Typography.Text
              copyable={{ text: provider.apiKey }}
              style={{ fontFamily: "monospace", fontSize: 13 }}
            >
              {maskApiKey(provider.apiKey)}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
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
          模型
        </Typography.Title>
        <Space wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索本地模型"
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
            添加
          </Button>
          <Button onClick={openManageModal}>管理</Button>
        </Space>
      </div>

      <List
        dataSource={filteredLocal}
        locale={{ emptyText: "暂无本地模型，可点击「添加」手动输入，或「管理」从上游同步" }}
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
                  checkedChildren="开"
                  unCheckedChildren="关"
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
                      tooltips: ["复制模型名", "已复制"],
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
        title={`添加模型 · ${provider?.name ?? ""}`}
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Input
            placeholder="输入 model name"
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
            添加
          </Button>
        </Space>
      </Modal>

      <Modal
        title={`远程模型 · ${provider?.name ?? ""}`}
        open={manageModalOpen}
        onCancel={() => {
          setManageModalOpen(false);
          setFetchError(null);
        }}
        width={720}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索模型名"
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
              重新拉取
            </Button>
          </div>
          {fetchError && (
            <Alert type="error" message={fetchError} showIcon closable onClose={() => setFetchError(null)} />
          )}
          {loadingRemote && remoteModels.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Spin tip="正在从上游获取模型列表…" />
            </div>
          ) : (
            <Table
              size="small"
              rowKey="id"
              columns={remoteColumns}
              dataSource={filteredRemote}
              pagination={{ pageSize: 12, showSizeChanger: false }}
              locale={{ emptyText: "无远程模型或未匹配搜索" }}
            />
          )}
        </Space>
      </Modal>
    </div>
  );
}
