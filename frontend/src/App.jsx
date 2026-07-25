import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./Layout.jsx";
import { useAuth } from "./AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Leagues from "./pages/Leagues.jsx";
import LeagueDetail from "./pages/LeagueDetail.jsx";
import Profile from "./pages/Profile.jsx";
import Settings from "./pages/Settings.jsx";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted">טוען...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/leagues" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/leagues" element={<Leagues />} />
        <Route
          path="/leagues/:leagueId"
          element={
            <ProtectedRoute>
              <LeagueDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Layout>
  );
}
