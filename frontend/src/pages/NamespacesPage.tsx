import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ArrowIcon, BoxIcon, LayersIcon, PlusIcon, RefreshIcon, TrashIcon } from "../components/Icons";
import { ConfirmDialog, EmptyState, ErrorState, Modal, PageLoader, StatusBadge } from "../components/UI";
import type { Cluster, Namespace } from "../types";

interface NamespaceRow extends Namespace { appCount: number | null }

export function NamespacesPage() {
  const clusterId = Number(useParams().clusterId);
  const [cluster, setCluster] = useState<Cluster>();
  const [namespaces, setNamespaces] = useState<NamespaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<NamespaceRow>();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [clusterRecord, records] = await Promise.all([api.cluster(clusterId), api.namespaces(clusterId)]);
      setCluster(clusterRecord);
      setNamespaces(records.map((namespace) => ({ ...namespace, appCount: null })));
      void Promise.allSettled(records.map(async (namespace) => ({
        id: namespace.id,
        count: (await api.apps(namespace.id)).length,
      }))).then((results) => {
        const counts = new Map(
          results
            .filter((result): result is PromiseFulfilledResult<{ id: number; count: number }> => result.status === "fulfilled")
            .map((result) => [result.value.id, result.value.count]),
        );
        setNamespaces((current) => current.map((namespace) => ({
          ...namespace,
          appCount: counts.get(namespace.id) ?? namespace.appCount,
        })));
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Namespaces could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => { void load(); }, [load]);

  const createNamespace = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await api.createNamespace(clusterId, newName);
      setShowCreate(false);
      setNewName("");
      await load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "The namespace could not be created.");
    } finally { setBusy(false); }
  };

  const deleteNamespace = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteNamespace(deleting.id);
      setDeleting(undefined);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The namespace could not be deleted.");
      setDeleting(undefined);
    } finally { setBusy(false); }
  };

  return <div className="page"><nav className="breadcrumbs"><Link to="/clusters">Clusters</Link><i>/</i><strong>{cluster?.name ?? "Cluster"}</strong></nav><header className="page-header"><div><span className="eyebrow">Cluster workspace</span><h1>{cluster?.name ?? "Namespaces"}</h1><p>Namespaces keep applications and resources clearly separated.</p></div><div className="header-actions"><button className="button secondary" onClick={() => void load()}><RefreshIcon /> Refresh</button><button className="button primary" onClick={() => setShowCreate(true)}><PlusIcon /> New namespace</button></div></header>{loading ? <PageLoader label="Loading namespaces" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : namespaces.length === 0 ? <EmptyState icon={<LayersIcon />} title="No usable namespaces" description="Create the first namespace for this cluster." action={<button className="button primary" onClick={() => setShowCreate(true)}><PlusIcon /> New namespace</button>} /> : <section className="table-card"><div className="table-head"><span>Name</span><span>Status</span><span>Applications</span><span>Created</span><span /></div>{namespaces.map((namespace) => <div className="table-row" key={namespace.id}><Link className="resource-name" to={`/clusters/${clusterId}/namespaces/${namespace.id}`}><span className="resource-icon small"><LayersIcon /></span><div><strong>{namespace.name}</strong><small>Namespace #{namespace.id}</small></div></Link><StatusBadge status={namespace.status} /><span className="count-cell"><BoxIcon /> {namespace.appCount}</span><span className="muted">{new Date(namespace.created_at).toLocaleDateString()}</span><div className="row-actions"><button className="icon-button danger-ghost" onClick={() => setDeleting(namespace)} aria-label={`Delete ${namespace.name}`}><TrashIcon /></button><Link className="icon-button" to={`/clusters/${clusterId}/namespaces/${namespace.id}`} aria-label={`Open ${namespace.name}`}><ArrowIcon /></Link></div></div>)}</section>}{showCreate && <Modal title="Create namespace" eyebrow="New Kubernetes scope" onClose={() => setShowCreate(false)}><form className="resource-form" onSubmit={createNamespace}>{formError && <div className="form-error">{formError}</div>}<label>Namespace name<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="production-web" pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?" maxLength={63} required autoFocus /><small>Use a valid Kubernetes DNS label.</small></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Creating..." : "Create namespace"}</button></div></form></Modal>}{deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} description="This removes the namespace and all resources inside it from Kubernetes. This action cannot be undone." busy={busy} onConfirm={deleteNamespace} onClose={() => setDeleting(undefined)} />}</div>;
}
