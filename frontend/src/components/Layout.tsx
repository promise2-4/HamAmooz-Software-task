import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useTheme } from "../theme";
import { ArrowBackIcon, ClusterIcon, LogoutIcon, MoonIcon, SunIcon } from "./Icons";

export function Layout() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isClusters = location.pathname.startsWith("/clusters") || location.pathname.startsWith("/apps");
  const isRoot = location.pathname === "/clusters";

  const goBack = () => {
    if (document.referrer.startsWith(window.location.origin) && window.history.length > 1) {
      navigate(-1);
      return;
    }

    const appList = location.pathname.match(/^\/clusters\/(\d+)\/namespaces\/\d+$/);
    if (appList) navigate(`/clusters/${appList[1]}/namespaces`);
    else navigate("/clusters");
  };

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
          <div><strong>Cluster workspace</strong><small>Backend API connected</small></div>
        </div>
        <button className="nav-link logout" onClick={logout}><LogoutIcon /> Sign out</button>
      </aside>
      <main className="main-content">
        <div className="workspace-toolbar">
          <button className="toolbar-button" onClick={goBack} disabled={isRoot} aria-label="Go back">
            <ArrowBackIcon /> <span>Back</span>
          </button>
          <button className="toolbar-button theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
