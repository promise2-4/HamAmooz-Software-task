import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth";
import { useAutoRefresh } from "../autoRefresh";
import { AppForm } from "../components/AppForm";
import { BoxIcon, EditIcon, RefreshIcon, TrashIcon } from "../components/Icons";
import {
  AutoRefreshControl,
  ConfirmDialog,
  ErrorState,
  Metric,
  Modal,
  PageLoader,
  StatusBadge,
} from "../components/UI";
import type { AppPayload, AppResource } from "../types";

function appStatus(app: AppResource) {
  if (app.status_error) return "Not Ready";
  if (app.ready) return "Running";
  return (app.ready_replicas ?? 0) > 0 ? "Not Ready" : "Pending";
}

export function AppDetailPage() {
  const appId = Number(useParams().appId);
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { interval } = useAutoRefresh();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const appQuery = useQuery({
    queryKey: ["app", appId],
    queryFn: () => api.app(appId),
    refetchInterval: interval,
  });
  const namespaceId = appQuery.data?.namespace;
  const namespaceQuery = useQuery({
    queryKey: ["namespace", namespaceId],
    queryFn: () => api.namespace(namespaceId!),
    enabled: Boolean(namespaceId),
    refetchInterval: interval,
  });
  const clusterId = namespaceQuery.data?.cluster;
  const clusterQuery = useQuery({
    queryKey: ["cluster", clusterId],
    queryFn: () => api.cluster(clusterId!),
    enabled: Boolean(clusterId),
    refetchInterval: interval,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: AppPayload) => api.updateApp(appId, payload),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app", appId] }),
        queryClient.invalidateQueries({ queryKey: ["apps", namespaceId] }),
      ]);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteApp(appId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["app", appId] });
      navigate(`/clusters/${clusterId}/namespaces/${namespaceId}`);
    },
  });

  const update = async (payload: AppPayload) => {
    setFormError("");
    try {
      await updateMutation.mutateAsync(payload);
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : "The application could not be updated.",
      );
    }
  };

  const remove = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await deleteMutation.mutateAsync();
    } catch {
      setConfirmDelete(false);
    }
  };

  const refresh = async () => {
    await Promise.all([
      appQuery.refetch(),
      namespaceQuery.refetch(),
      clusterQuery.refetch(),
    ]);
  };

  const app = appQuery.data;
  const namespace = namespaceQuery.data;
  const cluster = clusterQuery.data;
  const error =
    appQuery.error ??
    namespaceQuery.error ??
    clusterQuery.error ??
    deleteMutation.error;
  const isRefreshing =
    appQuery.isFetching || namespaceQuery.isFetching || clusterQuery.isFetching;
  const fallbackClusterId = Number(search.get("cluster"));
  const isLoadingDependencies =
    appQuery.isPending ||
    (Boolean(namespaceId) && namespaceQuery.isPending) ||
    (Boolean(clusterId) && clusterQuery.isPending);

  if (isLoadingDependencies && (!app || !namespace || !cluster)) {
    return (
      <div className="page">
        <PageLoader label="Loading application details" />
      </div>
    );
  }
  if (error || !app || !namespace || !cluster) {
    return (
      <div className="page">
        <ErrorState
          message={
            error?.message || "Application details are not available yet."
          }
          onRetry={() => void refresh()}
        />
      </div>
    );
  }

  const status = appStatus(app);
  const busy = updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="page">
      <nav className="breadcrumbs">
        <Link to="/clusters">Clusters</Link>
        <i>/</i>
        <Link to={`/clusters/${cluster.id || fallbackClusterId}/namespaces`}>
          {cluster.name}
        </Link>
        <i>/</i>
        <Link to={`/clusters/${cluster.id}/namespaces/${namespace.id}`}>
          {namespace.name}
        </Link>
        <i>/</i>
        <strong>{app.name}</strong>
      </nav>
      <header className="detail-hero">
        <div className="detail-title">
          <span className="resource-icon large">
            <BoxIcon />
          </span>
          <div>
            <span className="eyebrow">Application #{app.id}</span>
            <h1>{app.name}</h1>
            <p className="mono">{app.image}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </header>
      <div className="detail-actions">
        <button
          className="button secondary"
          onClick={() => void refresh()}
          disabled={isRefreshing}
        >
          <RefreshIcon /> {isRefreshing ? "Refreshing..." : "Refresh status"}
        </button>
        <AutoRefreshControl />
        {isAdmin && (
          <button className="button secondary" onClick={() => setEditing(true)}>
            <EditIcon /> Edit settings
          </button>
        )}
        {isAdmin && (
          <button
            className="button danger-outline"
            onClick={() => setConfirmDelete(true)}
          >
            <TrashIcon /> Delete app
          </button>
        )}
      </div>
      <section className="detail-grid">
        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Live workload</span>
              <h2>Deployment health</h2>
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="health-visual">
            <div className={`health-ring ${app.ready ? "healthy" : "waiting"}`}>
              <strong>{app.ready_replicas ?? 0}</strong>
              <span>of {app.replicas}</span>
            </div>
            <div>
              <h3>
                {app.ready ? "All replicas are ready" : "Waiting for replicas"}
              </h3>
              <p>
                {app.status_error ||
                  "Status is read directly from the Kubernetes Deployment."}
              </p>
            </div>
          </div>
        </article>
        <article className="panel">
          <span className="eyebrow">Placement</span>
          <h2>Resource scope</h2>
          <dl className="definition-list">
            <div>
              <dt>Cluster</dt>
              <dd>{cluster.name}</dd>
            </div>
            <div>
              <dt>Namespace</dt>
              <dd>{namespace.name}</dd>
            </div>
            <div>
              <dt>Deployment</dt>
              <dd>{app.name}</dd>
            </div>
          </dl>
        </article>
        <article className="panel span-three">
          <span className="eyebrow">Configuration</span>
          <h2>Requested resources</h2>
          <div className="metric-grid">
            <Metric
              label="Container image"
              value={app.image}
              detail="Current deployment image"
            />
            <Metric
              label="Replicas"
              value={app.replicas}
              detail={`${app.ready_replicas ?? 0} currently ready`}
            />
            <Metric
              label="CPU request"
              value={app.cpu_request || "Not set"}
              detail="Per container"
            />
            <Metric
              label="Memory request"
              value={app.memory_request || "Not set"}
              detail="Per container"
            />
          </div>
        </article>
      </section>

      {isAdmin && editing && (
        <Modal
          title="Edit application"
          eyebrow={app.name}
          onClose={() => setEditing(false)}
        >
          <AppForm
            initial={app}
            submitLabel="Save changes"
            busy={busy}
            error={formError}
            onSubmit={update}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
      {isAdmin && confirmDelete && (
        <ConfirmDialog
          title={`Delete ${app.name}?`}
          description="The Kubernetes Deployment and its backend record will be removed permanently."
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
