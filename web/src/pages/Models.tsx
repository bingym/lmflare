import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
} from "antd";
import {
  ArrowLeftOutlined,
  PlusOutlined,
  MinusOutlined,
  SearchOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  listProviders,
  listModels,
  fetchRemoteModels,
  addModels,
  removeModel,
  type ProviderDTO,
  type ModelDTO,
  type RemoteModelDTO,
} from "../services/api";

export default function Models() {
  const { id: providerId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [provider, setProvider] = useState<ProviderDTO | null>(null);
  const [localModels, setLocalModels] = useState<ModelDTO[]>([]);
  const [remoteModels, setRemoteModels] = useState<RemoteModelDTO[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [search, setSearch] = useState("");
  const [operating, setOperating] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(null);

  const localModelIds = useMemo(
    () => new Set(localModels.map((m) => m.modelId)),
    [localModels]
  );

  const filteredRemote = useMemo(() => {
    if (!search) return remoteModels;
    const q = search.toLowerCase();
    return remoteModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.owned_by && m.owned_by.toLowerCase().includes(q))
    );
  }, [remoteModels, search]);

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
      setFetchError(err instanceof Error ? err.message : "Failed to fetch remote models");
    } finally {
      setLoadingRemote(false);
    }
  }, [providerId]);

  useEffect(() => {
    loadProvider();
    loadLocal();
    loadRemote();
  }, [loadProvider, loadLocal, loadRemote]);

  const handleAdd = async (modelId: string) => {
    if (!providerId) return;
    setOperating((prev) => new Set(prev).add(modelId));
    try {
      await addModels(providerId, [modelId]);
      await loadLocal();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Add failed");
    } finally {
      setOperating((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

  const handleRemove = async (modelId: string) => {
    if (!providerId) return;
    setOperating((prev) => new Set(prev).add(modelId));
    try {
      await removeModel(providerId, modelId);
      await loadLocal();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setOperating((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

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
          { title: provider?.name ?? "..." },
          { title: "Models" },
        ]}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/providers")}
          >
            Back
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {provider?.name ?? "..."} — Models
          </Typography.Title>
        </Space>
        <Button
          icon={<SyncOutlined spin={loadingRemote} />}
          onClick={loadRemote}
          loading={loadingRemote}
        >
          Refresh Remote
        </Button>
      </div>

      {fetchError && (
        <Alert
          type="error"
          message="Failed to fetch remote models"
          description={fetchError}
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Input
        prefix={<SearchOutlined />}
        placeholder="Search models..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        style={{ marginBottom: 16, maxWidth: 400 }}
      />

      {loadingRemote && remoteModels.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" tip="Fetching models from upstream..." />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <Typography.Text type="secondary">
              {filteredRemote.length} remote model{filteredRemote.length !== 1 ? "s" : ""}
              {" · "}
              {localModels.length} added
            </Typography.Text>
          </div>
          <List
            dataSource={filteredRemote}
            locale={{ emptyText: "No models found" }}
            renderItem={(item) => {
              const isAdded = localModelIds.has(item.id);
              const isOperating = operating.has(item.id);

              return (
                <List.Item
                  style={{
                    padding: "8px 12px",
                    background: isAdded ? "#f6ffed" : "white",
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                  actions={[
                    isAdded ? (
                      <Button
                        key="remove"
                        type="text"
                        danger
                        size="small"
                        icon={<MinusOutlined />}
                        loading={isOperating}
                        onClick={() => handleRemove(item.id)}
                      />
                    ) : (
                      <Button
                        key="add"
                        type="text"
                        size="small"
                        icon={<PlusOutlined />}
                        loading={isOperating}
                        onClick={() => handleAdd(item.id)}
                        style={{ color: "#52c41a" }}
                      />
                    ),
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={8}>
                        <span style={{ fontFamily: "monospace", fontSize: 13 }}>
                          {item.id}
                        </span>
                        {isAdded && (
                          <Tag color="green" style={{ fontSize: 11 }}>
                            Added
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      item.owned_by ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {item.owned_by}
                        </Typography.Text>
                      ) : undefined
                    }
                  />
                </List.Item>
              );
            }}
          />
        </>
      )}
    </div>
  );
}
