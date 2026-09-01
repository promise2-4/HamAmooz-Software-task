import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { AppForm } from "../components/AppForm";
import { ArrowIcon, BoxIcon, LayersIcon, PlusIcon, RefreshIcon, TrashIcon } from "../components/Icons";
import { ConfirmDialog, EmptyState, ErrorState, Modal, PageLoader, StatusBadge } from "../components/UI";
import type { AppPayload, AppResource, Cluster, Namespace } from "../types";

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
  const [cluster, setCluster] = useState<Cluster>();
  const [namespace, setNamespace] = useState<Namespace>();
  const [apps, setApps] = useState<AppResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<AppResource>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const namespaceRecord = await api.namespace(namespaceId);
      const [clusterRecord, appRecords] = await Promise.all([api.cluster(clusterId), api.apps(namespaceId)]);
      setNamespace(namespaceRecord);
      setCluster(clusterRecord);
      setApps(appRecords);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Applications could not be loaded.");
    } finally { setLoading(false); }
  }, [clusterId, namespaceId]);

  useEffect(() => { void load(); }, [load]);

  const createApp = async (payload: AppPayload) => {
    setBusy(true);
    setFormError("");
    try {
      await api.createApp({ ...payload, namespace: namespaceId });
      setShowCreate(false);
      await load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "The application could not be created.");
    } finally { setBusy(false); }
  };

  const deleteApp = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteApp(deleting.id);
      setDeleting(undefined);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The application could not be deleted.");
      setDeleting(undefined);
    } finally { setBusy(false); }
  };

  return <div className="page"><nav className="breadcrumbs"><Link to="/clusters">Clusters</Link><i>/</i><Link to={`/clusters/${clusterId}/namespaces`}>{cluster?.name ?? "Cluster"}</Link><i>/</i><strong>{namespace?.name ?? "Namespace"}</strong></nav><header className="page-header"><div><span className="eyebrow">Namespace workspace</span><h1>{namespace?.name ?? "Applications"}</h1><p>Deploy and inspect the workloads running in this namespace.</p></div><div className="header-actions"><button className="button secondary" onClick={() => void load()}><RefreshIcon /> Refresh</button><button className="button primary" onClick={() => setShowCreate(true)}><PlusIcon /> Deploy app</button></div></header>{loading ? <PageLoader label="Loading applications" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : apps.length === 0 ? <EmptyState icon={<BoxIcon />} title="No applications deployed" description="Deploy a container image to create the first workload." action={<button className="button primary" onClick={() => setShowCreate(true)}><PlusIcon /> Deploy app</button>} /> : <section className="resource-grid app-grid">{apps.map((app) => <article className="resource-card app-card" key={app.id}><div className="resource-card-top"><span className="resource-icon"><BoxIcon /></span><StatusBadge status={appStatus(app)} /></div><div><h2>{app.name}</h2><p className="mono truncate">{app.image}</p></div><div className="mini-metrics"><div><span>Ready pods</span><strong>{app.ready_replicas ?? 0} / {app.replicas}</strong></div><div><span>CPU</span><strong>{app.cpu_request || "Not set"}</strong></div><div><span>Memory</span><strong>{app.memory_request || "Not set"}</strong></div></div><div className="card-footer"><button className="icon-button danger-ghost" onClick={() => setDeleting(app)} aria-label={`Delete ${app.name}`}><TrashIcon /></button><Link className="card-link" to={`/apps/${app.id}?cluster=${clusterId}`}>View details <ArrowIcon /></Link></div></article>)}</section>}{showCreate && <Modal title="Deploy application" eyebrow={`Namespace: ${namespace?.name ?? namespaceId}`} onClose={() => setShowCreate(false)}><AppForm submitLabel="Deploy application" busy={busy} error={formError} onSubmit={createApp} onCancel={() => setShowCreate(false)} /></Modal>}{deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} description="The Kubernetes Deployment and its backend record will be removed. This action cannot be undone." busy={busy} onConfirm={deleteApp} onClose={() => setDeleting(undefined)} />}</div>;
}
