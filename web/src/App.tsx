import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Typography, Skeleton } from "antd";
import {
  CloudServerOutlined,
  AppstoreOutlined,
  MessageOutlined,
  BarChartOutlined,
} from "@ant-design/icons";

const Providers = lazy(() => import("./pages/Providers"));
const Models = lazy(() => import("./pages/Models"));
const Apps = lazy(() => import("./pages/Apps"));
const Chat = lazy(() => import("./pages/Chat"));
const Usage = lazy(() => import("./pages/Usage"));

const { Content, Sider } = Layout;

function PageSkeleton() {
  return (
    <div style={{ padding: "8px 0" }}>
      <Skeleton active title={{ width: 120 }} paragraph={false} style={{ marginBottom: 24 }} />
      <Skeleton active paragraph={{ rows: 4 }} />
      <Skeleton active paragraph={{ rows: 3 }} style={{ marginTop: 32 }} />
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuKey = location.pathname.startsWith("/chat")
    ? "chat"
    : location.pathname.startsWith("/usage")
      ? "usage"
      : location.pathname.startsWith("/providers")
        ? "providers"
        : location.pathname.startsWith("/apps")
          ? "apps"
          : "providers";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider theme="light" width={200} style={{ borderRight: "1px solid #f0f0f0" }}>
        <div
          style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
          onClick={() => navigate("/providers")}
        >
          <img src="/favicon.svg" alt="LMFlare" style={{ width: 28, height: 28 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            LMFlare
          </Typography.Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[menuKey]}
          style={{ border: "none" }}
          items={[
            {
              key: "providers",
              icon: <CloudServerOutlined />,
              label: "Providers",
              onClick: () => navigate("/providers"),
            },
            {
              key: "apps",
              icon: <AppstoreOutlined />,
              label: "Apps",
              onClick: () => navigate("/apps"),
            },
            {
              key: "chat",
              icon: <MessageOutlined />,
              label: "Chat",
              onClick: () => navigate("/chat"),
            },
            {
              key: "usage",
              icon: <BarChartOutlined />,
              label: "Usage",
              onClick: () => navigate("/usage"),
            },
          ]}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, overflow: "auto" }}>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/providers" element={<Providers />} />
              <Route path="/providers/:id/models" element={<Models />} />
              <Route path="/apps" element={<Apps />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/usage" element={<Usage />} />
              <Route path="*" element={<Navigate to="/providers" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
