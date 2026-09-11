import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RouteProtegee({ children, permissionRequise }) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return <p>Chargement...</p>;
  if (!user) return <Navigate to="/connexion" replace />;
  if (permissionRequise && !hasPermission(permissionRequise)) {
    return <p>Acces reserve. Cette page necessite la permission "{permissionRequise}".</p>;
  }

  return children;
}
