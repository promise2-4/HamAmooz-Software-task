export interface Cluster {
  id: number;
  name: string;
  addr: string;
  created_at: string;
  updated_at: string;
}

export interface Namespace {
  id: number;
  cluster: number;
  name: string;
  status: string;
  created_at: string;
}

export interface AppResource {
  id: number;
  namespace: number;
  name: string;
  image: string;
  replicas: number;
  cpu_request: string;
  memory_request: string;
  created_at: string;
  updated_at: string;
  ready?: boolean;
  ready_replicas?: number;
  status_error?: string;
}

export interface AppPayload {
  namespace?: number;
  name?: string;
  image: string;
  replicas: number;
  cpu_request: string;
  memory_request: string;
}
