import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./Layout.jsx";
import { useAuth } from "./AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Leagues from "./pages/Leagues.jsx";
import FriendlyNew from "./pages/FriendlyNew.jsx";
import LeagueDetail from "./pages/LeagueDetail.jsx";
import LeagueManage from "./pages/LeagueManage.jsx";
import RoundDetail from "./pages/RoundDetail.jsx";
import LeagueRounds from "./pages/LeagueRounds.jsx";
import Profile from "./pages/Profile.jsx";
import Rankings from "./pages/Rankings.jsx";
import Settings from "./pages/Settings.jsx";
import HeadToHead from "./pages/HeadToHead.jsx";
import { SkeletonPageHeader, SkeletonHeroStat } from "./Skeleton.jsx";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div>
        <SkeletonPageHeader />
        <SkeletonHeroStat />
      </div>
    );
  }
  if (!user) {
    const redirectTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirectTo}`} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/profile" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/leagues" element={<Leagues />} />
        <Route
          path="/friendly/new"
          element={
            <ProtectedRoute>
              <FriendlyNew />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId"
          element={
            <ProtectedRoute>
              <LeagueDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId/rounds"
          element={
            <ProtectedRoute>
              <LeagueRounds />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId/rounds/:round"
          element={
            <ProtectedRoute>
              <RoundDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId/manage"
          element={
            <ProtectedRoute>
              <LeagueManage />
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
          path="/ranks"
          element={
            <ProtectedRoute>
              <Rankings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/head-to-head/:opponentId"
          element={
            <ProtectedRoute>
              <HeadToHead />
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
