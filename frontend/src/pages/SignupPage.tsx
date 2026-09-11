import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth";
import { ClusterIcon, MoonIcon, SunIcon } from "../components/Icons";
import { useTheme } from "../theme";

export function SignupPage() {
  const { authenticated, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (authenticated) return <Navigate to="/clusters" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await register({
        username,
        email,
        password,
        password_confirm: passwordConfirm,
      });
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "The account could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <button
        className="login-theme-toggle toolbar-button"
        onClick={toggleTheme}
        type="button"
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      >
        {theme === "light" ? <MoonIcon /> : <SunIcon />}
        <span>{theme === "light" ? "Dark" : "Light"}</span>
      </button>
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark large">
            <ClusterIcon />
          </span>
          <span>
            <strong>Hemmasian</strong>
            <small>Infrastructure workspace</small>
          </span>
        </div>
        <div className="login-copy">
          <span className="eyebrow">Shared visibility</span>
          <h1>Explore the cluster with confidence.</h1>
          <p>
            Create a viewer account to inspect clusters, namespaces, and
            workloads. Administrative changes remain protected.
          </p>
        </div>
        <div className="login-decoration">
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form signup-form" onSubmit={submit}>
          <span className="eyebrow">Create account</span>
          <h2>Join the workspace</h2>
          <p>New accounts receive read-only access.</p>
          {error && <div className="form-error">{error}</div>}
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={150}
              required
              autoFocus
            />
          </label>
          <label>
            Email <small>Optional</small>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button className="button primary wide" disabled={busy}>
            {busy ? "Creating account..." : "Create account"}
          </button>
          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
