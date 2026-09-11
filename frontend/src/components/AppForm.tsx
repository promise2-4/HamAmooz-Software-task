import { useState, type FormEvent } from "react";
import type { AppPayload, AppResource } from "../types";

export function AppForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: AppResource;
  submitLabel: string;
  busy: boolean;
  error?: string;
  onSubmit: (payload: AppPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [image, setImage] = useState(initial?.image ?? "nginx:1.27");
  const [replicas, setReplicas] = useState(initial?.replicas ?? 1);
  const [cpu, setCpu] = useState(initial?.cpu_request ?? "100m");
  const [memory, setMemory] = useState(initial?.memory_request ?? "128Mi");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit({
      name: initial ? undefined : name,
      image,
      replicas,
      cpu_request: cpu,
      memory_request: memory,
    });
  };

  return (
    <form className="resource-form" onSubmit={submit}>
      {error && <div className="form-error">{error}</div>}
      {!initial && (
        <label>
          Application name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="web"
            pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?"
            maxLength={63}
            required
          />
          <small>Lowercase letters, numbers and hyphens.</small>
        </label>
      )}
      <label>
        Container image
        <input
          value={image}
          onChange={(event) => setImage(event.target.value)}
          placeholder="nginx:1.27"
          required
        />
      </label>
      <div className="form-row">
        <label>
          Replicas
          <input
            type="number"
            min="1"
            max="20"
            value={replicas}
            onChange={(event) => setReplicas(Number(event.target.value))}
            required
          />
        </label>
        <label>
          CPU request
          <input
            value={cpu}
            onChange={(event) => setCpu(event.target.value)}
            placeholder="100m"
          />
        </label>
        <label>
          Memory request
          <input
            value={memory}
            onChange={(event) => setMemory(event.target.value)}
            placeholder="128Mi"
          />
        </label>
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
