import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth";
import { useAutoRefresh } from "../autoRefresh";
import { AppForm } from "../components/AppForm";
import {
  ArrowIcon,
  BoxIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from "../components/Icons";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  PageLoader,
  StatusBadge,
} from "../components/UI";
import type { AppPayload, AppResource } from "../types";

function appStatus(app: AppResource) {
  if (app.status_error) return "Not Ready";
  if (app.ready) return "Running";
  if ((app.ready_replicas ?? 0) === 0) return "Pending";
  return "Not Ready";
}

export function AppsPage() {
  const { clusterId: clusterValue, namespaceId: namespaceValue } = useParams();
  const clusterId = Number(clusterValue);
  const namespaceId = Number(namespaceValue);
  const { isAdmin } = useAuth();
  const { interval } = useAutoRefresh();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<AppResource>();

  const clusterQuery = useQuery({
    queryKey: ["cluster", clusterId],
    queryFn: () => api.cluster(clusterId),
    refetchInterval: interval,
  });
  const namespaceQuery = useQuery({
    queryKey: ["namespace", namespaceId],
    queryFn: () => api.namespace(namespaceId),
    refetchInterval: interval,
  });
  const appsQuery = useQuery({
    queryKey: ["apps", namespaceId],
    queryFn: () => api.apps(namespaceId),
    refetchInterval: interval,
  });

  const createMutation = useMutation({
    mutationFn: (payload: AppPayload) =>
      api.createApp({ ...payload, namespace: namespaceId }),
    onSuccess: async () => {
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ["apps", namespaceId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteApp(id),
    onSuccess: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: ["apps", namespaceId] });
    },
  });

  const createApp = async (payload: AppPayload) => {
    setFormError("");
    try {
      await createMutation.mutateAsync(payload);
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : "The application could not be created.",
      );
    }
  };

  const deleteApp = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
    } catch {
      setDeleting(undefined);
    }
  };

  const refresh = async () => {
    await Promise.all([
      clusterQuery.refetch(),
      namespaceQuery.refetch(),
      appsQuery.refetch(),
    ]);
  };

  const apps = appsQuery.data ?? [];
  const error =
    clusterQuery.error ??
    namespaceQuery.error ??
    appsQuery.error ??
    deleteMutation.error;
  const isRefreshing =
    clusterQuery.isFetching ||
    namespaceQuery.isFetching ||
    appsQuery.isFetching;
  const isBusy = createMutation.isPending || deleteMutation.isPending;

  return (
    <div className="page">
      <nav className="breadcrumbs">
        <Link to="/clusters">Clusters</Link>
        <i>/</i>
        <Link to={`/clusters/${clusterId}/namespaces`}>
          {clusterQuery.data?.name ?? "Cluster"}
        </Link>
        <i>/</i>
        <strong>{namespaceQuery.data?.name ?? "Namespace"}</strong>
      </nav>
      <header className="page-header">
        <div>
          <span className="eyebrow">Namespace workspace</span>
          <h1>{namespaceQuery.data?.name ?? "Applications"}</h1>
          <p>Deploy and inspect the workloads running in this namespace.</p>
        </div>
        <div className="header-actions">
          <button
            className="button secondary"
            onClick={() => void refresh()}
            disabled={isRefreshing}
          >
            <RefreshIcon /> {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          {isAdmin && (
            <button
              className="button primary"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon /> Deploy app
            </button>
          )}
        </div>
      </header>

      {appsQuery.isPending && !appsQuery.data ? (
        <PageLoader label="Loading applications" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refresh()} />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<BoxIcon />}
          title="No applications deployed"
          description={
            isAdmin
              ? "Deploy a container image to create the first workload."
              : "There are no applications available to view."
          }
          action={
            isAdmin ? (
              <button
                className="button primary"
                onClick={() => setShowCreate(true)}
              >
                <PlusIcon /> Deploy app
              </button>
            ) : undefined
          }
        />
      ) : (
        <section className="resource-grid app-grid">
          {apps.map((app) => (
            <article className="resource-card app-card" key={app.id}>
              <div className="resource-card-top">
                <span className="resource-icon">
                  <BoxIcon />
                </span>
                <StatusBadge status={appStatus(app)} />
              </div>
              <div>
                <h2>{app.name}</h2>
                <p className="mono truncate">{app.image}</p>
              </div>
              <div className="mini-metrics">
                <div>
                  <span>Ready pods</span>
                  <strong>
                    {app.ready_replicas ?? 0} / {app.replicas}
                  </strong>
                </div>
                <div>
                  <span>CPU</span>
                  <strong>{app.cpu_request || "Not set"}</strong>
                </div>
                <div>
                  <span>Memory</span>
                  <strong>{app.memory_request || "Not set"}</strong>
                </div>
              </div>
              <div className="card-footer">
                {isAdmin && (
                  <button
                    className="icon-button danger-ghost"
                    onClick={() => setDeleting(app)}
                    aria-label={`Delete ${app.name}`}
                  >
                    <TrashIcon />
                  </button>
                )}
                <Link
                  className="card-link"
                  to={`/apps/${app.id}?cluster=${clusterId}`}
                >
                  View details <ArrowIcon />
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}

      {isAdmin && showCreate && (
        <Modal
          title="Deploy application"
          eyebrow={`Namespace: ${namespaceQuery.data?.name ?? namespaceId}`}
          onClose={() => setShowCreate(false)}
        >
          <AppForm
            submitLabel="Deploy application"
            busy={isBusy}
            error={formError}
            onSubmit={createApp}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}
      {isAdmin && deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="The Kubernetes Deployment and its backend record will be removed. This action cannot be undone."
          busy={isBusy}
          onConfirm={deleteApp}
          onClose={() => setDeleting(undefined)}
        />
      )}
    </div>
  );
}
