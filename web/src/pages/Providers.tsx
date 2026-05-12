import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Typography, Space, Tag, Row, Col, Popconfirm, message, Spin, Empty } from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  listModels,
  type ProviderDTO,
} from "../services/api";
import ProviderForm from "../components/ProviderForm";

export default function Providers() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<(ProviderDTO & { modelCount: number })[]>([]);
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
          return { ...p, modelCount: models.length };
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
                      {p.modelCount} model{p.modelCount !== 1 ? "s" : ""}
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
