import { useState, useEffect, useCallback } from "react";
import { useRouteNavigate } from "../contexts/RouteTransition";
import { preloadRoute } from "../routes/lazyPages";
import { Card, Button, Typography, Space, Tag, Row, Col, Popconfirm, message, Spin, Empty, Table, Segmented } from "antd";
import PlusOutlined from "@ant-design/icons/es/icons/PlusOutlined";
import EditOutlined from "@ant-design/icons/es/icons/EditOutlined";
import DeleteOutlined from "@ant-design/icons/es/icons/DeleteOutlined";
import DatabaseOutlined from "@ant-design/icons/es/icons/DatabaseOutlined";
import AppstoreOutlined from "@ant-design/icons/es/icons/AppstoreOutlined";
import UnorderedListOutlined from "@ant-design/icons/es/icons/UnorderedListOutlined";
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  listModels,
  type ProviderDTO,
  type ProviderType,
} from "../services/api";
import ProviderForm from "../components/ProviderForm";

type ViewMode = "card" | "list";
const LS_KEY = "lmflare-providers-view";

function typeTag(type: ProviderType) {
  switch (type) {
    case "openai": return <Tag color="blue">OpenAI</Tag>;
    case "openai-responses": return <Tag color="geekblue">OpenAI Responses</Tag>;
    case "anthropic": return <Tag color="orange">Anthropic</Tag>;
    default: return <Tag>{type}</Tag>;
  }
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
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(LS_KEY) as ViewMode) || "card"
  );

  const handleViewChange = (v: ViewMode) => {
    setViewMode(v);
    localStorage.setItem(LS_KEY, v);
  };

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
    type: ProviderType;
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

  const listColumns = [
    {
      title: "Name",
      key: "name",
      render: (_: unknown, p: (typeof providers)[0]) => (
        <div>
          <Typography.Text strong>{p.name}</Typography.Text>
          <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{p.slug}</Typography.Text></div>
        </div>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 160,
      render: (t: ProviderType) => typeTag(t),
    },
    {
      title: "Endpoint",
      dataIndex: "endpoint",
      key: "endpoint",
      ellipsis: true,
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>{v}</Typography.Text>
      ),
    },
    {
      title: "Models",
      key: "models",
      width: 130,
      render: (_: unknown, p: (typeof providers)[0]) => (
        <Space size={4}>
          <DatabaseOutlined style={{ color: "rgba(0,0,0,0.45)" }} />
          <Typography.Text type="secondary">{p.enabledCount}/{p.modelCount}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 80,
      render: (_: unknown, p: (typeof providers)[0]) => (
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
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Providers
        </Typography.Title>
        <Space size={8}>
          <Segmented
            size="small"
            value={viewMode}
            onChange={(v) => handleViewChange(v as ViewMode)}
            options={[
              { value: "card", icon: <AppstoreOutlined /> },
              { value: "list", icon: <UnorderedListOutlined /> },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            New Provider
          </Button>
        </Space>
      </div>

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
      ) : viewMode === "list" ? (
        <Table
          dataSource={providers}
          columns={listColumns}
          rowKey="id"
          size="small"
          pagination={false}
          onRow={(p) => ({
            style: { cursor: "pointer" },
            onClick: (e) => {
              if ((e.target as HTMLElement).closest("button, .ant-popover, .ant-btn")) return;
              navigate(`/providers/${p.id}/models`);
            },
            onMouseEnter: () => preloadRoute("models"),
          })}
        />
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
                  {typeTag(p.type)}
                </div>
                <div style={{ marginTop: 12, color: "rgba(0,0,0,0.45)", fontSize: 13 }}>
                  {p.endpoint}
                </div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Space size={4}>
                    <DatabaseOutlined style={{ color: "rgba(0,0,0,0.45)" }} />
                    <Typography.Text type="secondary">
                      {p.enabledCount}/{p.modelCount} enabled
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
