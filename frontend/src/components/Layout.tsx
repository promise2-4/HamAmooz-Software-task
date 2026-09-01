import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { ClusterIcon, LogoutIcon } from "./Icons";

export function Layout() {
  const { logout } = useAuth();
  const location = useLocation();
  const isClusters = location.pathname.startsWith("/clusters") || location.pathname.startsWith("/apps");

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" to="/clusters">
          <span className="brand-mark"><ClusterIcon /></span>
          <span><strong>Hemmasian</strong><small>Cluster console</small></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className={isClusters ? "nav-link active" : "nav-link"} to="/clusters">
            <ClusterIcon /> Infrastructure
          </Link>
        </nav>
        <div className="sidebar-note">
          <span className="signal"><i /></span>
          <div><strong>Local workspace</strong><small>API on port 8000</small></div>
        </div>
        <button className="nav-link logout" onClick={logout}><LogoutIcon /> Sign out</button>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  );
}
