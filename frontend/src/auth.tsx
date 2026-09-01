import { createContext, useContext, useState, type ReactNode } from "react";
import { api, clearCredentials, hasCredentials, saveCredentials } from "./api/client";

interface AuthContextValue {
  authenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(hasCredentials());

  const login = async (username: string, password: string) => {
    saveCredentials(username, password);
    try {
      await api.verify();
      setAuthenticated(true);
    } catch (error) {
      clearCredentials();
      throw error;
    }
  };

  const logout = () => {
    clearCredentials();
    setAuthenticated(false);
  };

  return <AuthContext.Provider value={{ authenticated, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
