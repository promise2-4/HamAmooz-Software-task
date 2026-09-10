import { createContext, useContext, useState, type ReactNode } from "react";
import { api, clearCredentials, hasCredentials, loadUser, saveCredentials, saveUser } from "./api/client";
import type { AuthUser, RegistrationPayload } from "./types";

interface AuthContextValue {
  authenticated: boolean;
  user: AuthUser | null;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (payload: RegistrationPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadUser());
  const authenticated = hasCredentials() && user !== null;

  const login = async (username: string, password: string) => {
    saveCredentials(username, password);
    try {
      const profile = await api.me();
      saveUser(profile);
      setUser(profile);
    } catch (error) {
      clearCredentials();
      throw error;
    }
  };

  const register = async (payload: RegistrationPayload) => {
    await api.register(payload);
    await login(payload.username, payload.password);
  };

  const logout = () => {
    clearCredentials();
    setUser(null);
  };

  return <AuthContext.Provider value={{ authenticated, user, isAdmin: Boolean(user?.is_staff), login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
