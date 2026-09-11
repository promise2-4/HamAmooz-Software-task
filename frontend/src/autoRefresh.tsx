import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const AUTO_REFRESH_KEY = "hemmasian-auto-refresh";

export type AutoRefreshInterval = false | 15_000 | 30_000 | 60_000;

interface AutoRefreshContextValue {
  interval: AutoRefreshInterval;
  setInterval: (interval: AutoRefreshInterval) => void;
}

const AutoRefreshContext = createContext<AutoRefreshContextValue | null>(null);

function loadInterval(): AutoRefreshInterval {
  const value = Number(localStorage.getItem(AUTO_REFRESH_KEY));
  return value === 15_000 || value === 30_000 || value === 60_000
    ? value
    : false;
}

export function AutoRefreshProvider({ children }: { children: ReactNode }) {
  const [interval, setInterval] = useState<AutoRefreshInterval>(loadInterval);

  useEffect(() => {
    if (interval) localStorage.setItem(AUTO_REFRESH_KEY, String(interval));
    else localStorage.removeItem(AUTO_REFRESH_KEY);
  }, [interval]);

  return (
    <AutoRefreshContext.Provider value={{ interval, setInterval }}>
      {children}
    </AutoRefreshContext.Provider>
  );
}

export function useAutoRefresh() {
  const value = useContext(AutoRefreshContext);
  if (!value)
    throw new Error("useAutoRefresh must be used inside AutoRefreshProvider.");
  return value;
}
