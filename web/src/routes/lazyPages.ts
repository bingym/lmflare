import { lazy, type ComponentType } from "react";

export const routePreloaders = {
  providers: () => import("../pages/Providers"),
  models: () => import("../pages/Models"),
  apps: () => import("../pages/Apps"),
  chat: () => import("../pages/Chat"),
  usage: () => import("../pages/Usage"),
} as const;

export type RoutePreloadKey = keyof typeof routePreloaders;

const preloaded = new Set<RoutePreloadKey>();

export function preloadRoute(key: RoutePreloadKey): void {
  if (preloaded.has(key)) return;
  preloaded.add(key);
  void routePreloaders[key]();
}

function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  return lazy(loader);
}

export const Providers = lazyPage(routePreloaders.providers);
export const Models = lazyPage(routePreloaders.models);
export const Apps = lazyPage(routePreloaders.apps);
export const Chat = lazyPage(routePreloaders.chat);
export const Usage = lazyPage(routePreloaders.usage);

export const NAV_PRELOAD: Record<string, RoutePreloadKey> = {
  providers: "providers",
  apps: "apps",
  chat: "chat",
  usage: "usage",
};
