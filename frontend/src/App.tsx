import { Navigate, Outlet, RouterProvider, createBrowserRouter } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { AppDetailPage } from "./pages/AppDetailPage";
import { AppsPage } from "./pages/AppsPage";
import { ClustersPage } from "./pages/ClustersPage";
import { LoginPage } from "./pages/LoginPage";
import { NamespacesPage } from "./pages/NamespacesPage";

function ProtectedRoute() {
  const { authenticated } = useAuth();
  return authenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [{
      element: <Layout />,
      children: [
        { path: "/clusters", element: <ClustersPage /> },
        { path: "/clusters/:clusterId/namespaces", element: <NamespacesPage /> },
        { path: "/clusters/:clusterId/namespaces/:namespaceId", element: <AppsPage /> },
        { path: "/apps/:appId", element: <AppDetailPage /> },
      ],
    }],
  },
  { path: "*", element: <Navigate to="/clusters" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
