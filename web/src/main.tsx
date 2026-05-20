import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import { RouteTransitionProvider } from "./contexts/RouteTransition";
import App from "./App";
import "./global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 6,
        },
        components: {
          Card: {
            boxShadow: "none",
            boxShadowSecondary: "none",
            boxShadowTertiary: "none",
          },
        },
      }}
    >
      <BrowserRouter>
        <RouteTransitionProvider>
          <App />
        </RouteTransitionProvider>
      </BrowserRouter>
    </ConfigProvider>
  </StrictMode>
);
