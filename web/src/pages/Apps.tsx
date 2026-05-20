import { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Button,
  Card,
  Row,
  Col,
  Input,
  Modal,
  Form,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  message,
  Spin,
  Empty,
} from "antd";
import PlusOutlined from "@ant-design/icons/es/icons/PlusOutlined";
import DeleteOutlined from "@ant-design/icons/es/icons/DeleteOutlined";
import KeyOutlined from "@ant-design/icons/es/icons/KeyOutlined";
import CopyOutlined from "@ant-design/icons/es/icons/CopyOutlined";
import SyncOutlined from "@ant-design/icons/es/icons/SyncOutlined";
import EyeOutlined from "@ant-design/icons/es/icons/EyeOutlined";
import EyeInvisibleOutlined from "@ant-design/icons/es/icons/EyeInvisibleOutlined";
import {
  listApps,
  createApp,
  deleteApp,
  rotateKey,
  type AppDTO,
} from "../services/api";

function SecretKeyDisplay({ secretKey }: { secretKey: string }) {
  const [visible, setVisible] = useState(false);

  const masked = secretKey.slice(0, 10) + "..." + secretKey.slice(-4);

  const handleCopy = () => {
    navigator.clipboard.writeText(secretKey);
    message.success("Copied to clipboard");
  };

  return (
    <Space size={4}>
      <code style={{ fontSize: 12, background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>
        {visible ? secretKey : masked}
      </code>
      <Tooltip title={visible ? "Hide" : "Show"}>
        <Button
          type="text"
          size="small"
          icon={visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={() => setVisible(!visible)}
        />
      </Tooltip>
      <Tooltip title="Copy">
        <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopy} />
      </Tooltip>
    </Space>
  );
}

export default function Apps() {
  const [apps, setApps] = useState<AppDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [rotatingIds, setRotatingIds] = useState<Set<string>>(new Set());
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setApps(await listApps());
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (values: { name: string }) => {
    setCreateLoading(true);
    try {
      await createApp(values.name);
      message.success("App created");
      setCreateOpen(false);
      form.resetFields();
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteApp(id);
      message.success("App deleted");
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleRotate = async (id: string) => {
    setRotatingIds((prev) => new Set(prev).add(id));
    try {
      await rotateKey(id);
      message.success("Key rotated");
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Rotate failed");
    } finally {
      setRotatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Apps
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          New App
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : apps.length === 0 ? (
        <Empty description="No apps yet">
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            Create your first app
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {apps.map((app) => (
            <Col key={app.id} xs={24} sm={12} lg={8}>
              <Card className="hoverable-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {app.name}
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Created {new Date(app.createdAt).toLocaleDateString()}
                    </Typography.Text>
                  </div>
                  <Tag color={app.secretKey ? "green" : "default"}>
                    {app.secretKey ? "Active" : "No Key"}
                  </Tag>
                </div>

                <div style={{ marginTop: 16 }}>
                  {app.secretKey ? (
                    <div>
                      <SecretKeyDisplay secretKey={app.secretKey} />
                      {app.keyCreatedAt && (
                        <div style={{ marginTop: 4 }}>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            Key created {new Date(app.keyCreatedAt).toLocaleString()}
                          </Typography.Text>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      No secret key generated yet
                    </Typography.Text>
                  )}
                </div>

                <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
                  <Button
                    icon={app.secretKey ? <SyncOutlined /> : <KeyOutlined />}
                    size="small"
                    loading={rotatingIds.has(app.id)}
                    onClick={() => handleRotate(app.id)}
                  >
                    {app.secretKey ? "Rotate Key" : "Generate Key"}
                  </Button>
                  <Popconfirm
                    title="Delete this app?"
                    description="The associated key will also be invalidated."
                    onConfirm={() => handleDelete(app.id)}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="New App"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createLoading}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="App Name"
            rules={[{ required: true, message: "Required" }]}
          >
            <Input placeholder="e.g. My Chat App" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
