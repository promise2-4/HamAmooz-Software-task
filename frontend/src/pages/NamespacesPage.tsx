import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth";
import { useAutoRefresh } from "../autoRefresh";
import {
  ArrowIcon,
  BoxIcon,
  LayersIcon,
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
import type { Namespace } from "../types";

export function NamespacesPage() {
  const clusterId = Number(useParams().clusterId);
  const { isAdmin } = useAuth();
  const { interval } = useAutoRefresh();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<Namespace>();

  const clusterQuery = useQuery({
    queryKey: ["cluster", clusterId],
    queryFn: () => api.cluster(clusterId),
    refetchInterval: interval,
  });
  const namespacesQuery = useQuery({
    queryKey: ["namespaces", clusterId],
    queryFn: () => api.namespaces(clusterId),
    refetchInterval: interval,
  });
  const appQueries = useQueries({
    queries: (namespacesQuery.data ?? []).map((namespace) => ({
      queryKey: ["apps", namespace.id],
      queryFn: () => api.apps(namespace.id),
      refetchInterval: interval,
    })),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createNamespace(clusterId, name),
    onSuccess: async () => {
      setShowCreate(false);
      setNewName("");
      await queryClient.invalidateQueries({
        queryKey: ["namespaces", clusterId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNamespace(id),
    onSuccess: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({
        queryKey: ["namespaces", clusterId],
      });
    },
  });

  const refresh = async () => {
    await Promise.all([
      clusterQuery.refetch(),
      namespacesQuery.refetch(),
      ...appQueries.map((query) => query.refetch()),
    ]);
  };

  const createNamespace = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    try {
      await createMutation.mutateAsync(newName);
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : "The namespace could not be created.",
      );
    }
  };

  const deleteNamespace = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
    } catch {
      setDeleting(undefined);
    }
  };

  const namespaces = (namespacesQuery.data ?? []).map((namespace, index) => ({
    ...namespace,
    appCount: appQueries[index]?.data?.length ?? null,
  }));
  const error =
    clusterQuery.error ?? namespacesQuery.error ?? deleteMutation.error;
  const isRefreshing = clusterQuery.isFetching || namespacesQuery.isFetching;
  const isBusy = createMutation.isPending || deleteMutation.isPending;

  return (
    <div className="page">
      <nav className="breadcrumbs">
        <Link to="/clusters">Clusters</Link>
        <i>/</i>
        <strong>{clusterQuery.data?.name ?? "Cluster"}</strong>
      </nav>
      <header className="page-header">
        <div>
          <span className="eyebrow">Cluster workspace</span>
          <h1>{clusterQuery.data?.name ?? "Namespaces"}</h1>
          <p>Namespaces keep applications and resources clearly separated.</p>
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
              <PlusIcon /> New namespace
            </button>
          )}
        </div>
      </header>

      {namespacesQuery.isPending && !namespacesQuery.data ? (
        <PageLoader label="Loading namespaces" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refresh()} />
      ) : namespaces.length === 0 ? (
        <EmptyState
          icon={<LayersIcon />}
          title="No usable namespaces"
          description={
            isAdmin
              ? "Create the first namespace for this cluster."
              : "There are no namespaces available to view."
          }
          action={
            isAdmin ? (
              <button
                className="button primary"
                onClick={() => setShowCreate(true)}
              >
                <PlusIcon /> New namespace
              </button>
            ) : undefined
          }
        />
      ) : (
        <section className="table-card">
          <div className="table-head">
            <span>Name</span>
            <span>Status</span>
            <span>Applications</span>
            <span>Created</span>
            <span />
          </div>
          {namespaces.map((namespace) => (
            <div className="table-row" key={namespace.id}>
              <Link
                className="resource-name"
                to={`/clusters/${clusterId}/namespaces/${namespace.id}`}
              >
                <span className="resource-icon small">
                  <LayersIcon />
                </span>
                <div>
                  <strong>{namespace.name}</strong>
                  <small>Namespace #{namespace.id}</small>
                </div>
              </Link>
              <StatusBadge status={namespace.status} />
              <span className="count-cell">
                <BoxIcon /> {namespace.appCount ?? "—"}
              </span>
              <span className="muted">
                {new Date(namespace.created_at).toLocaleDateString()}
              </span>
              <div className="row-actions">
                {isAdmin && (
                  <button
                    className="icon-button danger-ghost"
                    onClick={() => setDeleting(namespace)}
                    aria-label={`Delete ${namespace.name}`}
                  >
                    <TrashIcon />
                  </button>
                )}
                <Link
                  className="icon-button"
                  to={`/clusters/${clusterId}/namespaces/${namespace.id}`}
                  aria-label={`Open ${namespace.name}`}
                >
                  <ArrowIcon />
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}

      {isAdmin && showCreate && (
        <Modal
          title="Create namespace"
          eyebrow="New Kubernetes scope"
          onClose={() => setShowCreate(false)}
        >
          <form className="resource-form" onSubmit={createNamespace}>
            {formError && <div className="form-error">{formError}</div>}
            <label>
              Namespace name
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="production-web"
                pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?"
                maxLength={63}
                required
                autoFocus
              />
              <small>Use a valid Kubernetes DNS label.</small>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={isBusy}>
                {isBusy ? "Creating..." : "Create namespace"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {isAdmin && deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="This removes the namespace and all resources inside it from Kubernetes. This action cannot be undone."
          busy={isBusy}
          onConfirm={deleteNamespace}
          onClose={() => setDeleting(undefined)}
        />
      )}
    </div>
  );
}
