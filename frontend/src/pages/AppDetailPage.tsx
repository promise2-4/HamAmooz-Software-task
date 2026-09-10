import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth";
import { AppForm } from "../components/AppForm";
import { BoxIcon, EditIcon, RefreshIcon, TrashIcon } from "../components/Icons";
import { ConfirmDialog, ErrorState, Metric, Modal, PageLoader, StatusBadge } from "../components/UI";
import type { AppPayload, AppResource, Cluster, Namespace } from "../types";

function appStatus(app: AppResource) {
  if (app.status_error) return "Not Ready";
  if (app.ready) return "Running";
  return (app.ready_replicas ?? 0) > 0 ? "Not Ready" : "Pending";
}

export function AppDetailPage() {
  const { isAdmin } = useAuth();
  const appId = Number(useParams().appId);
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<AppResource>();
  const [namespace, setNamespace] = useState<Namespace>();
  const [cluster, setCluster] = useState<Cluster>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const appRecord = await api.app(appId);
      const namespaceRecord = await api.namespace(appRecord.namespace);
      const clusterRecord = await api.cluster(namespaceRecord.cluster);
      setApp(appRecord);
      setNamespace(namespaceRecord);
      setCluster(clusterRecord);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Application details could not be loaded.");
    } finally { setLoading(false); }
  }, [appId]);

  useEffect(() => { void load(); }, [load]);

  const update = async (payload: AppPayload) => {
    setBusy(true);
    setFormError("");
    try {
      await api.updateApp(appId, payload);
      setEditing(false);
      await load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "The application could not be updated.");
    } finally { setBusy(false); }
  };

  const remove = async (event: FormEvent) => {
    event.preventDefault();
    if (!app || !namespace) return;
    setBusy(true);
    try {
      await api.deleteApp(app.id);
      const clusterId = cluster?.id ?? Number(search.get("cluster"));
      navigate(`/clusters/${clusterId}/namespaces/${namespace.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The application could not be deleted.");
      setConfirmDelete(false);
    } finally { setBusy(false); }
  };

  if (loading) return <div className="page"><PageLoader label="Loading application details" /></div>;
  if (error || !app || !namespace || !cluster) return <div className="page"><ErrorState message={error || "Application not found."} onRetry={() => void load()} /></div>;

  const status = appStatus(app);
  return <div className="page"><nav className="breadcrumbs"><Link to="/clusters">Clusters</Link><i>/</i><Link to={`/clusters/${cluster.id}/namespaces`}>{cluster.name}</Link><i>/</i><Link to={`/clusters/${cluster.id}/namespaces/${namespace.id}`}>{namespace.name}</Link><i>/</i><strong>{app.name}</strong></nav><header className="detail-hero"><div className="detail-title"><span className="resource-icon large"><BoxIcon /></span><div><span className="eyebrow">Application #{app.id}</span><h1>{app.name}</h1><p className="mono">{app.image}</p></div></div><StatusBadge status={status} /></header><div className="detail-actions"><button className="button secondary" onClick={() => void load()}><RefreshIcon /> Refresh status</button>{isAdmin && <button className="button secondary" onClick={() => setEditing(true)}><EditIcon /> Edit settings</button>}{isAdmin && <button className="button danger-outline" onClick={() => setConfirmDelete(true)}><TrashIcon /> Delete app</button>}</div><section className="detail-grid"><article className="panel span-two"><div className="panel-heading"><div><span className="eyebrow">Live workload</span><h2>Deployment health</h2></div><StatusBadge status={status} /></div><div className="health-visual"><div className={`health-ring ${app.ready ? "healthy" : "waiting"}`}><strong>{app.ready_replicas ?? 0}</strong><span>of {app.replicas}</span></div><div><h3>{app.ready ? "All replicas are ready" : "Waiting for replicas"}</h3><p>{app.status_error || "Status is read directly from the Kubernetes Deployment."}</p></div></div></article><article className="panel"><span className="eyebrow">Placement</span><h2>Resource scope</h2><dl className="definition-list"><div><dt>Cluster</dt><dd>{cluster.name}</dd></div><div><dt>Namespace</dt><dd>{namespace.name}</dd></div><div><dt>Deployment</dt><dd>{app.name}</dd></div></dl></article><article className="panel span-three"><span className="eyebrow">Configuration</span><h2>Requested resources</h2><div className="metric-grid"><Metric label="Container image" value={app.image} detail="Current deployment image" /><Metric label="Replicas" value={app.replicas} detail={`${app.ready_replicas ?? 0} currently ready`} /><Metric label="CPU request" value={app.cpu_request || "Not set"} detail="Per container" /><Metric label="Memory request" value={app.memory_request || "Not set"} detail="Per container" /></div></article></section>{isAdmin && editing && <Modal title="Edit application" eyebrow={app.name} onClose={() => setEditing(false)}><AppForm initial={app} submitLabel="Save changes" busy={busy} error={formError} onSubmit={update} onCancel={() => setEditing(false)} /></Modal>}{isAdmin && confirmDelete && <ConfirmDialog title={`Delete ${app.name}?`} description="The Kubernetes Deployment and its backend record will be removed permanently." busy={busy} onConfirm={remove} onClose={() => setConfirmDelete(false)} />}</div>;
}
