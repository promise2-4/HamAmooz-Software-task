import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ArrowIcon, ClusterIcon, RefreshIcon } from "../components/Icons";
import { EmptyState, ErrorState, PageLoader, StatusBadge } from "../components/UI";
import type { Cluster } from "../types";

interface ClusterRow extends Cluster { namespaceCount: number }

export function ClustersPage() {
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const records = await api.clusters();
      const rows = await Promise.all(records.map(async (cluster) => ({
        ...cluster,
        namespaceCount: (await api.namespaces(cluster.id)).length,
      })));
      setClusters(rows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Clusters could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="page"><header className="page-header"><div><span className="eyebrow">Infrastructure overview</span><h1>Clusters</h1><p>Select a cluster to inspect its namespaces and applications.</p></div><button className="button secondary" onClick={() => void load()}><RefreshIcon /> Refresh</button></header><section className="summary-strip"><div><span className="summary-icon"><ClusterIcon /></span><div><strong>{clusters.length}</strong><small>registered clusters</small></div></div><div><span className="summary-dot success" /><div><strong>{clusters.length}</strong><small>available configurations</small></div></div></section>{loading ? <PageLoader label="Loading clusters" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : clusters.length === 0 ? <EmptyState icon={<ClusterIcon />} title="No clusters registered" description="Create a cluster through the backend API, then refresh this page." /> : <section className="resource-grid">{clusters.map((cluster) => <Link className="resource-card cluster-card" key={cluster.id} to={`/clusters/${cluster.id}/namespaces`}><div className="resource-card-top"><span className="resource-icon"><ClusterIcon /></span><StatusBadge status="Configured" /></div><div><h2>{cluster.name}</h2><p className="mono truncate">{cluster.addr}</p></div><div className="card-meta"><div><span>Namespaces</span><strong>{cluster.namespaceCount}</strong></div><div><span>Updated</span><strong>{new Date(cluster.updated_at).toLocaleDateString()}</strong></div></div><span className="card-link">Open cluster <ArrowIcon /></span></Link>)}</section>}</div>;
}
