import { Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import CloudServerOutlined from "@ant-design/icons/es/icons/CloudServerOutlined";
import AppstoreOutlined from "@ant-design/icons/es/icons/AppstoreOutlined";
import MessageOutlined from "@ant-design/icons/es/icons/MessageOutlined";
import BarChartOutlined from "@ant-design/icons/es/icons/BarChartOutlined";
import { useRouteNavigate } from "./contexts/RouteTransition";
import { RouteProgress, PageFallback } from "./components/RouteLoading";
import {
  Providers,
  Models,
  Apps,
  Chat,
  Usage,
  NAV_PRELOAD,
  preloadRoute,
  type RoutePreloadKey,
} from "./routes/lazyPages";

const NAV_ITEMS = [
  { key: "providers", path: "/providers", icon: CloudServerOutlined, label: "Providers" },
  { key: "apps", path: "/apps", icon: AppstoreOutlined, label: "Apps" },
  { key: "chat", path: "/chat", icon: MessageOutlined, label: "Chat" },
  { key: "usage", path: "/usage", icon: BarChartOutlined, label: "Usage" },
] as const;

function resolveMenuKey(pathname: string): string {
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/usage")) return "usage";
  if (pathname.startsWith("/providers")) return "providers";
  if (pathname.startsWith("/apps")) return "apps";
  return "providers";
}

function resolvePreloadKey(pathname: string): RoutePreloadKey | null {
  if (pathname.startsWith("/providers/") && pathname.includes("/models")) {
    return "models";
  }
  return NAV_PRELOAD[resolveMenuKey(pathname)] ?? null;
}

export default function App() {
  const location = useLocation();
  const { navigate, isPending } = useRouteNavigate();
  const menuKey = resolveMenuKey(location.pathname);

  useEffect(() => {
    const key = resolvePreloadKey(location.pathname);
    if (!key) return;
    const run = () => preloadRoute(key);
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run);
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, 600);
    return () => clearTimeout(id);
  }, [location.pathname]);

  return (
    <div className="app-layout">
      <RouteProgress active={isPending} />
      <aside className="app-sider">
        <button
          type="button"
          className="app-brand"
          onClick={() => navigate("/providers")}
        >
          <img src="/favicon.svg" alt="LMFlare" width={28} height={28} />
          <span className="app-brand-title">LMFlare</span>
        </button>
        <nav className="app-nav">
          {NAV_ITEMS.map(({ key, path, icon: Icon, label }) => {
            const preloadKey = NAV_PRELOAD[key];
            return (
              <button
                key={key}
                type="button"
                className={`app-nav-item${menuKey === key ? " active" : ""}${isPending && menuKey === key ? " pending" : ""}`}
                onClick={() => navigate(path)}
                onMouseEnter={() => preloadRoute(preloadKey)}
                onFocus={() => preloadRoute(preloadKey)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className={`app-content${isPending ? " is-loading" : ""}`}>
        <Suspense fallback={<PageFallback />}>
          <div key={location.pathname} className="route-outlet">
            <Routes location={location}>
              <Route path="/providers" element={<Providers />} />
              <Route path="/providers/:id/models" element={<Models />} />
              <Route path="/apps" element={<Apps />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/usage" element={<Usage />} />
              <Route path="*" element={<Navigate to="/providers" replace />} />
            </Routes>
          </div>
        </Suspense>
      </main>
    </div>
  );
}
