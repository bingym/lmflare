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
  Switch,
  Table,
  Segmented,
  message,
  Spin,
  Empty,
} from "antd";
import PlusOutlined from "@ant-design/icons/es/icons/PlusOutlined";
import DeleteOutlined from "@ant-design/icons/es/icons/DeleteOutlined";
import EditOutlined from "@ant-design/icons/es/icons/EditOutlined";
import KeyOutlined from "@ant-design/icons/es/icons/KeyOutlined";
import CopyOutlined from "@ant-design/icons/es/icons/CopyOutlined";
import SyncOutlined from "@ant-design/icons/es/icons/SyncOutlined";
import EyeOutlined from "@ant-design/icons/es/icons/EyeOutlined";
import EyeInvisibleOutlined from "@ant-design/icons/es/icons/EyeInvisibleOutlined";
import CheckCircleOutlined from "@ant-design/icons/es/icons/CheckCircleOutlined";
import StopOutlined from "@ant-design/icons/es/icons/StopOutlined";
import AppstoreOutlined from "@ant-design/icons/es/icons/AppstoreOutlined";
import UnorderedListOutlined from "@ant-design/icons/es/icons/UnorderedListOutlined";
import {
  listApps,
  createApp,
  deleteApp,
  rotateKey,
  updateAppEnabled,
  updateAppName,
  type AppDTO,
} from "../services/api";

type ViewMode = "card" | "list";
const LS_KEY = "lmflare-apps-view";

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
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingApp, setEditingApp] = useState<AppDTO | null>(null);
  const [rotatingIds, setRotatingIds] = useState<Set<string>>(new Set());
  const [form] = Form.useForm();
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
      setApps(await listApps());
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreateForm = () => {
    setEditingApp(null);
    form.resetFields();
    setFormOpen(true);
  };

  const openEditForm = (app: AppDTO) => {
    setEditingApp(app);
    form.setFieldsValue({ name: app.name });
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: { name: string }) => {
    setFormLoading(true);
    try {
      if (editingApp) {
        const updated = await updateAppName(editingApp.id, values.name);
        setApps((prev) => prev.map((a) => (a.id === editingApp.id ? updated : a)));
        message.success("App updated");
      } else {
        await createApp(values.name);
        message.success("App created");
        await load();
      }
      setFormOpen(false);
      setEditingApp(null);
      form.resetFields();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setFormLoading(false);
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

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const updated = await updateAppEnabled(id, enabled);
      setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
      message.success(enabled ? "App enabled" : "App disabled");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update");
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

  const listColumns = [
    {
      title: "Name",
      key: "name",
      render: (_: unknown, app: AppDTO) => (
        <div>
          <Typography.Text strong>{app.name}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Created {new Date(app.createdAt).toLocaleDateString()}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 100,
      render: (_: unknown, app: AppDTO) => (
        <Switch
          size="small"
          checked={app.enabled}
          onChange={(v) => handleToggleEnabled(app.id, v)}
        />
      ),
    },
    {
      title: "Secret Key",
      key: "key",
      render: (_: unknown, app: AppDTO) =>
        app.secretKey ? (
          <SecretKeyDisplay secretKey={app.secretKey} />
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>—</Typography.Text>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 220,
      render: (_: unknown, app: AppDTO) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditForm(app)}
          />
          <Button
            icon={app.secretKey ? <SyncOutlined /> : <KeyOutlined />}
            size="small"
            loading={rotatingIds.has(app.id)}
            onClick={() => handleRotate(app.id)}
          >
            {app.secretKey ? "Rotate" : "Generate"}
          </Button>
          <Popconfirm
            title="Delete this app?"
            description="The associated key will also be invalidated."
            onConfirm={() => handleDelete(app.id)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Apps
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateForm}>
            New App
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : apps.length === 0 ? (
        <Empty description="No apps yet">
          <Button type="primary" onClick={openCreateForm}>
            Create your first app
          </Button>
        </Empty>
      ) : viewMode === "list" ? (
        <Table
          dataSource={apps}
          columns={listColumns}
          rowKey="id"
          size="small"
          pagination={false}
        />
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
                  <Space size={4}>
                    <Tag
                      icon={app.enabled ? <CheckCircleOutlined /> : <StopOutlined />}
                      color={app.enabled ? "green" : "default"}
                    >
                      {app.enabled ? "Enabled" : "Disabled"}
                    </Tag>
                    <Tooltip title="Edit name">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEditForm(app)}
                      />
                    </Tooltip>
                  </Space>
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

                <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Space size={8}>
                    <Tooltip title={app.enabled ? "Disable" : "Enable"}>
                      <Switch
                        size="small"
                        checked={app.enabled}
                        onChange={(checked) => handleToggleEnabled(app.id, checked)}
                      />
                    </Tooltip>
                    <Button
                      icon={app.secretKey ? <SyncOutlined /> : <KeyOutlined />}
                      size="small"
                      loading={rotatingIds.has(app.id)}
                      onClick={() => handleRotate(app.id)}
                    >
                      {app.secretKey ? "Rotate Key" : "Generate Key"}
                    </Button>
                  </Space>
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
        title={editingApp ? "Edit App" : "New App"}
        open={formOpen}
        onCancel={() => {
          setFormOpen(false);
          setEditingApp(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={formLoading}
      >
        <Form form={form} layout="vertical" onFinish={handleFormSubmit} style={{ marginTop: 16 }}>
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
