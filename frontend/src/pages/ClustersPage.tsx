import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAutoRefresh } from "../autoRefresh";
import { ArrowIcon, ClusterIcon, RefreshIcon } from "../components/Icons";
import {
  AutoRefreshControl,
  EmptyState,
  ErrorState,
  PageLoader,
  StatusBadge,
} from "../components/UI";

export function ClustersPage() {
  const { interval } = useAutoRefresh();
  const clustersQuery = useQuery({
    queryKey: ["clusters"],
    queryFn: api.clusters,
    refetchInterval: interval,
  });

  const namespaceQueries = useQueries({
    queries: (clustersQuery.data ?? []).map((cluster) => ({
      queryKey: ["namespaces", cluster.id],
      queryFn: () => api.namespaces(cluster.id),
      refetchInterval: interval,
    })),
  });

  const clusters = (clustersQuery.data ?? []).map((cluster, index) => ({
    ...cluster,
    namespaceCount: namespaceQueries[index]?.data?.length ?? null,
  }));

  const refresh = async () => {
    await Promise.all([
      clustersQuery.refetch(),
      ...namespaceQueries.map((query) => query.refetch()),
    ]);
  };

  const isRefreshing =
    clustersQuery.isFetching ||
    namespaceQueries.some((query) => query.isFetching);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Infrastructure overview</span>
          <h1>Clusters</h1>
          <p>Select a cluster to inspect its namespaces and applications.</p>
        </div>
        <div className="header-actions">
          <button
            className="button secondary"
            onClick={() => void refresh()}
            disabled={isRefreshing}
          >
            <RefreshIcon /> {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <AutoRefreshControl />
        </div>
      </header>

      <section className="summary-strip">
        <div>
          <span className="summary-icon">
            <ClusterIcon />
          </span>
          <div>
            <strong>{clusters.length}</strong>
            <small>registered clusters</small>
          </div>
        </div>
        <div>
          <span className="summary-dot success" />
          <div>
            <strong>{clusters.length}</strong>
            <small>available configurations</small>
          </div>
        </div>
      </section>

      {clustersQuery.isPending ? (
        <PageLoader label="Loading clusters" />
      ) : clustersQuery.isError ? (
        <ErrorState
          message={clustersQuery.error.message}
          onRetry={() => void refresh()}
        />
      ) : clusters.length === 0 ? (
        <EmptyState
          icon={<ClusterIcon />}
          title="No clusters registered"
          description="Create a cluster through the backend API, then refresh this page."
        />
      ) : (
        <section className="resource-grid">
          {clusters.map((cluster) => (
            <Link
              className="resource-card cluster-card"
              key={cluster.id}
              to={`/clusters/${cluster.id}/namespaces`}
            >
              <div className="resource-card-top">
                <span className="resource-icon">
                  <ClusterIcon />
                </span>
                <StatusBadge status="Configured" />
              </div>
              <div>
                <h2>{cluster.name}</h2>
                <p className="mono truncate">{cluster.addr}</p>
              </div>
              <div className="card-meta">
                <div>
                  <span>Namespaces</span>
                  <strong>{cluster.namespaceCount ?? "—"}</strong>
                </div>
                <div>
                  <span>Updated</span>
                  <strong>
                    {new Date(cluster.updated_at).toLocaleDateString()}
                  </strong>
                </div>
              </div>
              <span className="card-link">
                Open cluster <ArrowIcon />
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
