import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import LeagueRulesForm from "../LeagueRulesForm.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { leagueRuleLabels, formatDayMonth } from "../matchUtils.js";
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
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);

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

  useEffect(() => {
    if (league && user && !isCreator) {
      navigate(`/leagues/${leagueId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, user, isCreator]);

  if (!league || !isCreator) {
    return (
      <div>
        <SkeletonPageHeader />
      </div>
    );
  }

  const ruleLabels = leagueRuleLabels(league, t);
  const roundsCount = new Set(allMatches.map((m) => m.round_number).filter(Boolean)).size;

  function toggle(section) {
    setExpanded((cur) => (cur === section ? null : section));
  }

  async function handleUpdateRules(rules) {
    await api.updateLeagueRules(leagueId, rules);
    await loadAll();
  }

  async function handleShareWhatsApp() {
    setInviteLoading(true);
    try {
      let code = inviteCode;
      if (!code) {
        const data = await api.getInviteCode(leagueId);
        code = data.code;
        setInviteCode(code);
      }
      const url = `${window.location.origin}/leagues/${leagueId}?code=${code}`;
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
          <h1>{t("ניהול הליגה")}</h1>
        </div>
        <div className="league-detail-meta">
          {t("{name} · הקמת אותה ב-{date}", {
            name: league.name,
            date: formatDayMonth(new Date(league.created_at)),
          })}
        </div>
      </header>

      {error && <p className="error">{t(error)}</p>}

      <div className="manage-nav-list">
        <button type="button" className="manage-nav-row" onClick={() => toggle("rules")}>
          <div>
            <div className="manage-nav-title">{t("חוקי הליגה")}</div>
            <div className="manage-nav-status">
              {ruleLabels.bestOfLabel} · {ruleLabels.frequencyLabel}
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
                  <Avatar name={m.name} size={28} />
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
      </div>

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
    </div>
  );
}
