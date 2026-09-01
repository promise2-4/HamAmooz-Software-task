import type { AppPayload, AppResource, Cluster, Namespace } from "../types";

const AUTH_KEY = "hemmasian-basic-auth";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function saveCredentials(username: string, password: string) {
  sessionStorage.setItem(AUTH_KEY, window.btoa(`${username}:${password}`));
}

export function clearCredentials() {
  sessionStorage.removeItem(AUTH_KEY);
}

export function hasCredentials() {
  return Boolean(sessionStorage.getItem(AUTH_KEY));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem(AUTH_KEY);
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Basic ${token}`);

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ApiError("The backend did not respond within 15 seconds.", 504);
    }
    throw new ApiError("Could not connect to the backend.", 503);
  }
  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.detail || Object.values(body).flat().join(" ") || "The request could not be completed.";
    throw new ApiError(String(message), response.status);
  }
  return body as T;
}

export const api = {
  verify: () => request<Cluster[]>("/api/clusters/"),
  clusters: () => request<Cluster[]>("/api/clusters/"),
  cluster: (id: number) => request<Cluster>(`/api/clusters/${id}/`),
  namespaces: (clusterId: number) => request<Namespace[]>(`/api/namespaces/?cluster_id=${clusterId}`),
  namespace: (id: number) => request<Namespace>(`/api/namespaces/${id}/`),
  createNamespace: (clusterId: number, name: string) =>
    request<Namespace>("/api/namespaces/", {
      method: "POST",
      body: JSON.stringify({ cluster_id: clusterId, name }),
    }),
  deleteNamespace: (id: number) => request<void>(`/api/namespaces/${id}/`, { method: "DELETE" }),
  apps: (namespaceId: number) => request<AppResource[]>(`/api/apps/?namespace_id=${namespaceId}`),
  app: (id: number) => request<AppResource>(`/api/apps/${id}/`),
  createApp: (payload: AppPayload) =>
    request<AppResource>("/api/apps/", { method: "POST", body: JSON.stringify(payload) }),
  updateApp: (id: number, payload: AppPayload) =>
    request<AppResource>(`/api/apps/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteApp: (id: number) => request<void>(`/api/apps/${id}/`, { method: "DELETE" }),
};
