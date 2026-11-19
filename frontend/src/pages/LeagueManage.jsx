import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import LeagueRulesForm from "../LeagueRulesForm.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { leagueRuleLabels, formatDayMonth, nextSchedulePreview, roundDueDate } from "../matchUtils.js";
import { AddRoundConfirmSheet, LeaveLeagueConfirmSheet } from "./LeagueDetail.jsx";
import { SkeletonPageHeader } from "../Skeleton.jsx";

export default function LeagueManage() {
  const { leagueId } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [showAddRoundConfirm, setShowAddRoundConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  async function loadAll() {
    try {
      const [leagueData, membersData, matchesData] = await Promise.all([
        api.getLeague(leagueId),
        api.listMembers(leagueId),
        api.listAllMatches(leagueId),
      ]);
      setLeague(leagueData);
      setMembers(membersData);
      setAllMatches(matchesData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  const isCreator = !!(league && user && league.created_by === user.id);
  // Backend-wise, only the creator can edit rules or see the invite code
  // (get_invite_code requires membership); delete is the one action the
  // admin can also take, on any league, so that's what canAccess unlocks
  // for a non-creator admin — everything else below still checks isCreator.
  const canAccess = isCreator || !!user?.is_admin;
  // Leaving the league is a member's own setting, and this page is where the
  // settings are — so a plain member gets in too, with nothing but that.
  const isMember = !!(user && members.some((m) => m.id === user.id));

  useEffect(() => {
    if (league && user && !canAccess && !isMember) {
      navigate(`/leagues/${leagueId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, user, canAccess]);

  if (!league || (!canAccess && !isMember)) {
    return (
      <div>
        <SkeletonPageHeader />
      </div>
    );
  }

  const ruleLabels = leagueRuleLabels(league, t);
  const roundsCount = new Set(allMatches.map((m) => m.round_number).filter(Boolean)).size;
  // Adding a round to the schedule is an admin's job, so it lives here rather
  // than on the Matches tab, which is everyone's board for the round they are
  // playing right now.
  const nextRound = roundsCount + 1;
  const { pairs: nextPairs, roundsToCreate } = nextSchedulePreview(members, allMatches);
  const nextRoundDueDate = roundDueDate(
    league.schedule_started_at || new Date().toISOString(),
    nextRound + Math.max(roundsToCreate, 1) - 1,
    league.round_length_days
  );

  async function handleAddRound() {
    setBusy(true);
    setError("");
    try {
      await api.generateSchedule(leagueId);
      await loadAll();
      setShowAddRoundConfirm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(section) {
    setExpanded((cur) => (cur === section ? null : section));
  }

  async function handleLeaveLeague() {
    setBusy(true);
    setError("");
    try {
      await api.leaveLeague(leagueId);
      navigate("/leagues");
    } catch (err) {
      setError(err.message);
      setBusy(false);
      setShowLeaveConfirm(false);
    }
  }

  async function handleUpdateRules(rules) {
    await api.updateLeagueRules(leagueId, rules);
    await loadAll();
  }

  async function handleShareWhatsApp() {
    setInviteLoading(true);
    try {
      // A public league needs no token — the link is enough, and whoever opens
      // it joins from the league's own page if their level fits. A private one
      // is entered only through its invite link.
      let url = `${window.location.origin}/leagues/${leagueId}`;
      if (!league.is_open) {
        let token = inviteToken;
        if (!token) {
          const data = await api.createLeagueInviteLink(leagueId);
          token = data.token;
          setInviteToken(token);
        }
        url = `${window.location.origin}/leagues/invite/${token}`;
      }
      const message = t('בוא/י תצטרף/י לליגה "{name}" ב-Rally!\n{url}', { name: league.name, url });
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleDeleteLeague() {
    if (
      !window.confirm(
        t('למחוק את הליגה "{name}"? הפעולה תמחק גם את כל המשחקים והחברויות בה, ולא ניתנת לביטול.', {
          name: league.name,
        })
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.deleteLeague(leagueId);
      navigate("/leagues");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="page-head">
        <Link to={`/leagues/${leagueId}`} className="back-link">
          <ChevronIcon aria-hidden="true" />
          {t("חזרה לליגה")}
        </Link>
        <div className="page-title-row">
          <h1>{canAccess ? t("ניהול הליגה") : t("הגדרות הליגה")}</h1>
        </div>
        <div className="league-detail-meta">
          {t("{name} · הקמת אותה ב-{date}", {
            name: league.name,
            date: formatDayMonth(new Date(league.created_at)),
          })}
        </div>
      </header>

      {error && <p className="error">{t(error)}</p>}

      {!isCreator && canAccess && (
        <p className="muted">
          {t("אתה נכנס לכאן כמנהל המערכת — הליגה הזו אינה שלך, ואפשר רק למחוק אותה.")}
        </p>
      )}

      {isCreator && (
      <div className="manage-nav-list">
        <button type="button" className="manage-nav-row" onClick={() => toggle("rules")}>
          <div>
            <div className="manage-nav-title">{t("חוקי הליגה")}</div>
            <div className="manage-nav-status">
              {ruleLabels.bestOfLabel} · {ruleLabels.frequencyLabel}
              {league.is_open &&
                ` · ${t("NTRP {min}–{max}", {
                  min: (league.level_min ?? 1.5).toFixed(1),
                  max: (league.level_max ?? 5.5).toFixed(1),
                })}`}
            </div>
          </div>
          <ChevronIcon className="manage-nav-chevron chevron-icon" aria-hidden="true" />
        </button>
        {expanded === "rules" && (
          <div className="manage-panel">
            <LeagueRulesForm league={league} onUpdate={handleUpdateRules} onCancel={() => setExpanded(null)} />
          </div>
        )}

        <button type="button" className="manage-nav-row" onClick={() => toggle("players")}>
          <div>
            <div className="manage-nav-title">{t("שחקנים")}</div>
            <div className="manage-nav-status">{t("{n} שחקנים · הזמנה בקישור", { n: members.length })}</div>
          </div>
          <ChevronIcon className="manage-nav-chevron chevron-icon" aria-hidden="true" />
        </button>
        {expanded === "players" && (
          <div className="manage-panel">
            <ul className="manage-player-list">
              {members.map((m) => (
                <li key={m.id} className="manage-player-row">
                  <Avatar name={m.name} photoUrl={m.photo_url} size={28} />
                  <span>{m.name}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={handleShareWhatsApp}
              disabled={inviteLoading}
            >
              {inviteLoading ? t("טוען...") : t("שתף קישור הזמנה")}
            </button>
          </div>
        )}

        <Link to={`/leagues/${leagueId}?tab=matches`} className="manage-nav-row">
          <div>
            <div className="manage-nav-title">{t("לוח משחקים")}</div>
            <div className="manage-nav-status">
              {t("{rounds} מחזורים · {games} משחקים", { rounds: roundsCount, games: allMatches.length })}
            </div>
          </div>
          <ChevronIcon className="manage-nav-chevron chevron-icon" aria-hidden="true" />
        </Link>

        {isCreator && allMatches.length > 0 && nextPairs.length > 0 && (
          <button
            type="button"
            className="schedule-add-round-btn manage-add-round"
            onClick={() => setShowAddRoundConfirm(true)}
          >
            {roundsToCreate > 1
              ? t("+ {n} מחזורים", { n: roundsToCreate })
              : t("+ מחזור {n}", { n: nextRound })}
          </button>
        )}
      </div>
      )}

      {showAddRoundConfirm && (
        <AddRoundConfirmSheet
          nextRound={nextRound}
          roundsToCreate={roundsToCreate}
          pairs={nextPairs}
          dueDate={nextRoundDueDate}
          busy={busy}
          onConfirm={handleAddRound}
          onClose={() => setShowAddRoundConfirm(false)}
        />
      )}

      {isMember && (
        <button
          type="button"
          className="league-leave-chip manage-leave"
          onClick={() => setShowLeaveConfirm(true)}
        >
          {t("יציאה מהליגה")}
        </button>
      )}

      {showLeaveConfirm && (
        <LeaveLeagueConfirmSheet
          busy={busy}
          isCreator={isCreator}
          onConfirm={handleLeaveLeague}
          onClose={() => setShowLeaveConfirm(false)}
        />
      )}

      {canAccess && (
      <div className="danger-zone">
        <div className="danger-zone-title">{t("אזור מסוכן")}</div>
        <p className="danger-zone-text">
          {t("מחיקת הליגה תסיר לצמיתות את {n} המשחקים ואת כל החברויות בה. לא ניתן לשחזר.", {
            n: allMatches.length,
          })}
        </p>
        <button type="button" className="danger-zone-btn" onClick={handleDeleteLeague} disabled={busy}>
          {t("מחק את הליגה")}
        </button>
      </div>
      )}
    </div>
  );
}
