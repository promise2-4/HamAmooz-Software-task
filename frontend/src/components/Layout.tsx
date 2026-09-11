import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../auth";
import { useTheme } from "../theme";
import {
  ArrowBackIcon,
  BoxIcon,
  ClusterIcon,
  DetailIcon,
  LayersIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
  TopologyIcon,
} from "./Icons";

export function Layout() {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const isClusters =
    location.pathname.startsWith("/clusters") ||
    location.pathname.startsWith("/apps");
  const isRoot = location.pathname === "/clusters";
  const clusterMatch = location.pathname.match(/^\/clusters\/(\d+)/);
  const namespaceMatch = location.pathname.match(
    /^\/clusters\/(\d+)\/namespaces\/(\d+)/,
  );
  const appMatch = location.pathname.match(/^\/apps\/(\d+)/);
  const clusterId = clusterMatch?.[1] ?? search.get("cluster");
  const namespaceId = namespaceMatch?.[2] ?? search.get("namespace");

  const goBack = () => {
    if (
      document.referrer.startsWith(window.location.origin) &&
      window.history.length > 1
    ) {
      navigate(-1);
      return;
    }

    const appList = location.pathname.match(
      /^\/clusters\/(\d+)\/namespaces\/\d+$/,
    );
    if (appList) navigate(`/clusters/${appList[1]}/namespaces`);
    else navigate("/clusters");
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" to="/clusters">
          <span className="brand-mark">
            <ClusterIcon />
          </span>
          <span>
            <strong>Hemmasian</strong>
            <small>Cluster console</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link
            className={isClusters ? "nav-link active" : "nav-link"}
            to="/clusters"
          >
            <TopologyIcon /> Infrastructure
          </Link>
          <div className="nav-tree" aria-label="Infrastructure sections">
            <Link
              className={isRoot ? "tree-link active" : "tree-link"}
              to="/clusters"
            >
              <ClusterIcon />
              <span>Clusters</span>
            </Link>
            {clusterId && (
              <Link
                className={
                  clusterMatch && !namespaceId
                    ? "tree-link active"
                    : "tree-link"
                }
                to={`/clusters/${clusterId}/namespaces`}
              >
                <LayersIcon />
                <span>Namespaces</span>
              </Link>
            )}
            {clusterId && namespaceId && (
              <Link
                className={
                  namespaceMatch && !appMatch ? "tree-link active" : "tree-link"
                }
                to={`/clusters/${clusterId}/namespaces/${namespaceId}`}
              >
                <BoxIcon />
                <span>Applications</span>
              </Link>
            )}
            {appMatch && !namespaceId && (
              <span className="tree-link current">
                <BoxIcon />
                <span>Applications</span>
              </span>
            )}
            {appMatch && (
              <span className="tree-link active current" aria-current="page">
                <DetailIcon />
                <span>App details</span>
              </span>
            )}
          </div>
        </nav>
        <div className="sidebar-note">
          <span className="signal">
            <i />
          </span>
          <div>
            <strong>{user?.username ?? "Cluster workspace"}</strong>
            <small>{user?.role ?? "Backend API connected"}</small>
          </div>
        </div>
        <button className="nav-link logout" onClick={logout}>
          <LogoutIcon /> Sign out
        </button>
      </aside>
      <main className="main-content">
        <div className="workspace-toolbar">
          <button
            className="toolbar-button"
            onClick={goBack}
            disabled={isRoot}
            aria-label="Go back"
          >
            <ArrowBackIcon /> <span>Back</span>
          </button>
          <div className="toolbar-actions">
            <button
              className="toolbar-button theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <MoonIcon /> : <SunIcon />}
              <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
            </button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
