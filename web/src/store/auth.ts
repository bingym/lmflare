import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { login as apiLogin, clearToken, isLoggedIn } from "../services/api";
import React from "react";

interface AuthContextValue {
  loggedIn: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

  const login = useCallback(async (username: string, password: string) => {
    await apiLogin(username, password);
    setLoggedIn(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setLoggedIn(false);
  }, []);

  return React.createElement(
    AuthContext.Provider,
    { value: { loggedIn, login, logout } },
    children
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
