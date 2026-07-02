import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function RequireAuth({ children }) {
  const { isAuthReady, isLoggedIn } = useAuth();

  if (!isAuthReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-white text-sm font-bold text-gray-500">
        Checking session...
      </div>
    );
  }

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return children;
}
