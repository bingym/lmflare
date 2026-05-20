export function RouteProgress({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="route-progress" role="progressbar" aria-label="Loading...">
      <div className="route-progress-bar" />
    </div>
  );
}

/** 路由懒加载时的内容区骨架屏 */
export function PageFallback() {
  return (
    <div className="page-fallback" aria-busy="true" aria-label="Loading...">
      <div className="page-fallback-toolbar">
        <div className="skeleton-block skeleton-title" />
        <div className="skeleton-block skeleton-btn" />
      </div>
      <div className="page-fallback-grid">
        <div className="skeleton-block skeleton-card" />
        <div className="skeleton-block skeleton-card" />
        <div className="skeleton-block skeleton-card" />
      </div>
      <div className="page-fallback-lines">
        <div className="skeleton-block skeleton-line" />
        <div className="skeleton-block skeleton-line" />
        <div className="skeleton-block skeleton-line short" />
      </div>
    </div>
  );
}
