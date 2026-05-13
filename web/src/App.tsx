import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Button, Typography } from "antd";
import {
  CloudServerOutlined,
  AppstoreOutlined,
  LogoutOutlined,
  MessageOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { useAuth } from "./store/auth";
import Login from "./pages/Login";
import Providers from "./pages/Providers";
import Models from "./pages/Models";
import Apps from "./pages/Apps";
import Chat from "./pages/Chat";
import Usage from "./pages/Usage";

const { Content, Sider } = Layout;

function AdminLayout() {
  const { logout } = useAuth();
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
        <div style={{ position: "absolute", bottom: 16, left: 0, width: "100%", padding: "0 16px" }}>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={() => { logout(); navigate("/login"); }}
            block
          >
            Logout
          </Button>
        </div>
      </Sider>
      <Layout>
        <Content style={{ padding: 24, overflow: "auto" }}>
          <Routes>
            <Route path="/providers" element={<Providers />} />
            <Route path="/providers/:id/models" element={<Models />} />
            <Route path="/apps" element={<Apps />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/usage" element={<Usage />} />
            <Route path="*" element={<Navigate to="/providers" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const { loggedIn } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loggedIn ? <Navigate to="/providers" replace /> : <Login />}
      />
      <Route
        path="/*"
        element={loggedIn ? <AdminLayout /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
