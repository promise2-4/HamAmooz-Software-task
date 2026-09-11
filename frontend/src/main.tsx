import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { AutoRefreshProvider } from "./autoRefresh";
import { AuthProvider } from "./auth";
import { queryClient } from "./queryClient";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AutoRefreshProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AutoRefreshProvider>
    </QueryClientProvider>
  </StrictMode>,
);
