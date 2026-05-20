import { Form, Input, Select, Modal } from "antd";
import type { ProviderDTO } from "../services/api";

interface Props {
  open: boolean;
  editing: ProviderDTO | null;
  onCancel: () => void;
  onOk: (values: {
    name: string;
    slug: string;
    type: "openai" | "anthropic";
    endpoint: string;
    apiKey: string;
  }) => Promise<void>;
  loading: boolean;
}

export default function ProviderForm({ open, editing, onCancel, onOk, loading }: Props) {
  const [form] = Form.useForm();

  const handleOpen = () => {
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        slug: editing.slug,
        type: editing.type,
        endpoint: editing.endpoint,
        apiKey: editing.apiKey,
      });
    } else {
      form.resetFields();
    }
  };

  return (
    <Modal
      title={editing ? "Edit Provider" : "New Provider"}
      open={open}
      onCancel={onCancel}
      afterOpenChange={(visible) => { if (visible) handleOpen(); }}
      onOk={() => form.submit()}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onOk}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: "Required" }]}
        >
          <Input placeholder="e.g. OpenAI Official" />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Slug"
          rules={[
            { required: true, message: "Required" },
            { pattern: /^[a-z0-9-]+$/, message: "Lowercase alphanumeric and hyphens only" },
          ]}
          tooltip="Used as route prefix, e.g. 'openai' → openai/gpt-4o"
        >
          <Input placeholder="e.g. openai" />
        </Form.Item>
        <Form.Item
          name="type"
          label="API Type"
          rules={[{ required: true, message: "Required" }]}
        >
          <Select
            placeholder="Select API type"
            options={[
              { value: "openai", label: "OpenAI Compatible" },
              { value: "anthropic", label: "Anthropic" },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="endpoint"
          label="Endpoint"
          rules={[{ required: true, message: "Required" }]}
        >
          <Input placeholder="e.g. https://api.openai.com" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[{ required: true, message: "Required" }]}
        >
          <Input.Password placeholder="sk-..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
