import { useEffect, type FormEvent, type ReactNode } from "react";
import { AlertIcon } from "./Icons";

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll(" ", "-");
  const tone = normalized.includes("running") || normalized.includes("active") || normalized.includes("ready") && !normalized.includes("not")
    ? "success"
    : normalized.includes("failed") || normalized.includes("error")
      ? "danger"
      : normalized.includes("pending")
        ? "warning"
        : "neutral";
  return <span className={`status-badge ${tone}`}><i />{status}</span>;
}

export function PageLoader({ label = "Loading resources" }: { label?: string }) {
  return <div className="state-card loading-state" role="status" aria-live="polite"><div className="cluster-loader" aria-hidden="true"><span className="loader-core" /><span className="loader-node node-one" /><span className="loader-node node-two" /><span className="loader-node node-three" /></div><h3>{label}</h3><p>Connecting to the cluster and collecting the latest resources.</p><div className="loading-steps" aria-hidden="true"><i /><i /><i /></div></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="state-card error-state"><span className="state-icon"><AlertIcon /></span><h3>Something went wrong</h3><p>{message}</p>{onRetry && <button className="button secondary" onClick={onRetry}>Try again</button>}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="state-card empty-state"><span className="state-icon">{icon}</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Modal({ title, eyebrow, children, onClose }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</section></div>;
}

export function ConfirmDialog({ title, description, confirmLabel = "Delete", busy, onConfirm, onClose }: { title: string; description: string; confirmLabel?: string; busy?: boolean; onConfirm: (event: FormEvent) => void; onClose: () => void }) {
  return <Modal title={title} eyebrow="Please confirm" onClose={onClose}><form onSubmit={onConfirm}><p className="modal-copy">{description}</p><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" disabled={busy}>{busy ? "Deleting..." : confirmLabel}</button></div></form></Modal>;
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb">{items.map((item, index) => <span key={`${item.label}-${index}`}>{item.to ? <a href={item.to}>{item.label}</a> : <strong>{item.label}</strong>}{index < items.length - 1 && <i>/</i>}</span>)}</nav>;
}

export function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
