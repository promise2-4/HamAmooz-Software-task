import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api/client";
import { ClusterIcon } from "../components/Icons";

export function LoginPage() {
  const { authenticated, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (authenticated) return <Navigate to="/clusters" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not connect to the backend.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-page"><section className="login-panel"><div className="login-brand"><span className="brand-mark large"><ClusterIcon /></span><span><strong>Hemmasian</strong><small>Infrastructure workspace</small></span></div><div className="login-copy"><span className="eyebrow">Cluster operations</span><h1>A clear view of every workload.</h1><p>Manage Kubernetes namespaces and applications from one focused workspace.</p></div><div className="login-decoration"><span /><span /><span /></div></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><span className="eyebrow">Welcome back</span><h2>Sign in to your console</h2><p>Use your Django administrator credentials.</p>{error && <div className="form-error">{error}</div>}<label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required autoFocus /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="button primary wide" disabled={busy}>{busy ? "Connecting..." : "Continue"}</button><small className="security-note">Credentials are kept only for this browser session.</small></form></section></main>;
}
