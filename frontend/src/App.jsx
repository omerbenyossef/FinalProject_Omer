import { useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./Layout.jsx";
import Splash from "./Splash.jsx";
import Loading from "./Loading.jsx";
import { useAuth } from "./AuthContext.jsx";
import SignIn from "./pages/SignIn.jsx";
import SignUp from "./pages/SignUp.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Leagues from "./pages/Leagues.jsx";
import OpenLeagues from "./pages/OpenLeagues.jsx";
import LeaguePreview from "./pages/LeaguePreview.jsx";
import JoinByCode from "./pages/JoinByCode.jsx";
import FriendlyNew from "./pages/FriendlyNew.jsx";
import LeagueDetail from "./pages/LeagueDetail.jsx";
import LeagueManage from "./pages/LeagueManage.jsx";
import RoundDetail from "./pages/RoundDetail.jsx";
import LeagueRounds from "./pages/LeagueRounds.jsx";
import Profile from "./pages/Profile.jsx";
import Home from "./pages/Home.jsx";
import OpenMatches from "./pages/OpenMatches.jsx";
import PendingConfirm from "./pages/PendingConfirm.jsx";
import Notifications from "./pages/Notifications.jsx";
import Invites from "./pages/Invites.jsx";
import Rankings from "./pages/Rankings.jsx";
import Settings from "./pages/Settings.jsx";
import HeadToHead from "./pages/HeadToHead.jsx";
import PlayerProfile from "./pages/PlayerProfile.jsx";
import ProposeSchedule from "./pages/ProposeSchedule.jsx";
import MatchSchedule from "./pages/MatchSchedule.jsx";
import ConfirmResult from "./pages/ConfirmResult.jsx";
import CorrectScore from "./pages/CorrectScore.jsx";
import Operator from "./pages/Operator.jsx";

// loading138b.md: the app-wide Loading overlay already covers this whole
// window (it's the same auth loading flag), so there's nothing useful to
// paint here — rendering nothing avoids a flash of stale skeleton content
// underneath it. The early return still matters: without it, `!user`
// would be true for an instant even for an already-logged-in visitor
// (their token just hasn't been validated yet) and this would redirect
// them to /signin prematurely.
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return null;
  }
  if (!user) {
    const redirectTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?redirect=${redirectTo}`} replace />;
  }
  return children;
}

// operatoroverview113a.md — internal-only screen, gated on the operator account
function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return null;
  }
  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  if (!user.is_admin) {
    return <Navigate to="/profile" replace />;
  }
  return children;
}

export default function App() {
  // Plain component state, not localStorage — the splash is meant to run
  // on every cold start of the app, never on an in-app route navigation
  // (this state lives for the lifetime of this mount, same as the rest of
  // the app shell). Layout/Routes mount immediately underneath so auth and
  // data fetching aren't blocked waiting on the animation.
  const { loading: authLoading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [showLoading, setShowLoading] = useState(false);

  // loading138b.md: splash always plays its fixed 2.6s regardless of
  // whether auth has resolved yet; only if it's still pending once splash
  // ends does the loading screen pick up and cover the gap until it is.
  function handleSplashDone() {
    setShowSplash(false);
    if (authLoading) setShowLoading(true);
  }

  return (
    <>
      {showSplash && <Splash onDone={handleSplashDone} />}
      {showLoading && <Loading ready={!authLoading} onDone={() => setShowLoading(false)} />}
      <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/profile" replace />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/leagues" element={<Leagues />} />
        <Route
          path="/needs-you"
          element={
            <ProtectedRoute>
              <OpenMatches />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/open"
          element={
            <ProtectedRoute>
              <OpenLeagues />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/join-by-code"
          element={
            <ProtectedRoute>
              <JoinByCode />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invites"
          element={
            <ProtectedRoute>
              <Invites />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId/preview"
          element={
            <ProtectedRoute>
              <LeaguePreview />
            </ProtectedRoute>
          }
        />
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
              <Home />
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
          path="/players/:playerId"
          element={
            <ProtectedRoute>
              <PlayerProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matches/:matchId/schedule"
          element={
            <ProtectedRoute>
              <ProposeSchedule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matches/:matchId"
          element={
            <ProtectedRoute>
              <MatchSchedule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matches/:matchId/pending"
          element={
            <ProtectedRoute>
              <PendingConfirm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matches/:matchId/confirm"
          element={
            <ProtectedRoute>
              <ConfirmResult />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matches/:matchId/correct"
          element={
            <ProtectedRoute>
              <CorrectScore />
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
        <Route
          path="/ops"
          element={
            <AdminRoute>
              <Operator />
            </AdminRoute>
          }
        />
      </Routes>
      </Layout>
    </>
  );
}
