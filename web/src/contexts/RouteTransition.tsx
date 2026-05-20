import {
  createContext,
  useCallback,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router-dom";

type RouteTransitionContextValue = {
  isPending: boolean;
  navigate: (to: To, options?: NavigateOptions) => void;
};

const RouteTransitionContext = createContext<RouteTransitionContextValue | null>(
  null
);

export function RouteTransitionProvider({ children }: { children: ReactNode }) {
  const rrNavigate = useNavigate();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (to: To, options?: NavigateOptions) => {
      startTransition(() => rrNavigate(to, options));
    },
    [rrNavigate]
  );

  return (
    <RouteTransitionContext.Provider value={{ isPending, navigate }}>
      {children}
    </RouteTransitionContext.Provider>
  );
}

export function useRouteNavigate(): RouteTransitionContextValue {
  const ctx = useContext(RouteTransitionContext);
  if (!ctx) {
    throw new Error("useRouteNavigate must be used within RouteTransitionProvider");
  }
  return ctx;
}
