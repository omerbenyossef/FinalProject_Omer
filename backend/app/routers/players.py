from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from .matches import _auto_confirm_overdue

router = APIRouter(prefix="/players", tags=["players"])

RANKINGS_MIN_MATCHES_FOR_RECORD = 5
RANKINGS_PAGE_LIMIT = 50


@router.get("/rankings", response_model=schemas.RankingsOut)
def rankings(
    sport_id: int,
    sort: str = "ntrp",
    cursor: Optional[str] = None,
    limit: int = RANKINGS_PAGE_LIMIT,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if sort not in ("ntrp", "record"):
        raise HTTPException(status_code=400, detail="Invalid sort")
    _auto_confirm_overdue(db)

    ratings = (
        db.query(models.PlayerRating)
        .options(joinedload(models.PlayerRating.user))
        .filter(models.PlayerRating.sport_id == sport_id)
        .all()
    )
    rating_by_user = {r.user_id: r for r in ratings}
    user_ids = list(rating_by_user.keys())

    matches = (
        db.query(models.Match)
        .outerjoin(models.League)
        .filter(
            models.Match.status == models.MatchStatus.completed,
            or_(models.League.sport_id == sport_id, models.Match.sport_id == sport_id),
            or_(models.Match.player1_id.in_(user_ids), models.Match.player2_id.in_(user_ids)),
        )
        .all()
        if user_ids
        else []
    )

    record = {uid: {"wins": 0, "losses": 0} for uid in user_ids}
    for m in matches:
        player1_won = m.player1_score > m.player2_score
        if m.player1_id in record:
            record[m.player1_id]["wins" if player1_won else "losses"] += 1
        if m.player2_id in record:
            record[m.player2_id]["losses" if player1_won else "wins"] += 1

    entries = []
    for uid in user_ids:
        rating = rating_by_user[uid]
        wins = record[uid]["wins"]
        losses = record[uid]["losses"]
        played = wins + losses
        entries.append(
            {
                "id": uid,
                "display_name": rating.user.name,
                "ntrp": rating.level,
                "wins": wins,
                "losses": losses,
                "matches_played": played,
                "win_pct": round(wins / played * 100) if played else 0,
            }
        )

    if sort == "record":
        entries = [e for e in entries if e["matches_played"] >= RANKINGS_MIN_MATCHES_FOR_RECORD]
        entries.sort(key=lambda e: (-e["win_pct"], -e["matches_played"], e["id"]))
    else:
        entries.sort(key=lambda e: (-e["ntrp"], -e["win_pct"], e["id"]))

    for i, e in enumerate(entries):
        e["rank"] = i + 1

    total = len(entries)
    try:
        offset = max(0, int(cursor)) if cursor else 0
    except ValueError:
        offset = 0
    page = entries[offset : offset + limit]
    next_cursor = str(offset + limit) if offset + limit < total else None

    me_entry = next((e for e in entries if e["id"] == current_user.id), None)
    if me_entry:
        me_out = schemas.RankingsMeOut(
            rank=me_entry["rank"],
            display_name=me_entry["display_name"],
            ntrp=me_entry["ntrp"],
            wins=me_entry["wins"],
            losses=me_entry["losses"],
            win_pct=me_entry["win_pct"],
            matches_played=me_entry["matches_played"],
        )
    else:
        my_rating = rating_by_user.get(current_user.id)
        my_record = record.get(current_user.id, {"wins": 0, "losses": 0})
        played = my_record["wins"] + my_record["losses"]
        me_out = schemas.RankingsMeOut(
            rank=None,
            display_name=current_user.name,
            ntrp=my_rating.level if my_rating else None,
            wins=my_record["wins"],
            losses=my_record["losses"],
            win_pct=round(my_record["wins"] / played * 100) if played else 0,
            matches_played=played,
        )

    return schemas.RankingsOut(
        total=total,
        me=me_out,
        players=[schemas.RankingsPlayerOut(**e) for e in page],
        next_cursor=next_cursor,
        min_matches=RANKINGS_MIN_MATCHES_FOR_RECORD,
    )


@router.get("/{opponent_id}/head-to-head", response_model=schemas.HeadToHeadOut)
def head_to_head(
    opponent_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    opponent = db.query(models.User).filter(models.User.id == opponent_id).first()
    if not opponent:
        raise HTTPException(status_code=404, detail="Player not found")

    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.league))
        .filter(
            models.Match.status == models.MatchStatus.completed,
            or_(
                and_(
                    models.Match.player1_id == current_user.id,
                    models.Match.player2_id == opponent_id,
                ),
                and_(
                    models.Match.player1_id == opponent_id,
                    models.Match.player2_id == current_user.id,
                ),
            ),
        )
        .order_by(models.Match.played_at.desc())
        .all()
    )

    wins = 0
    losses = 0
    match_list = []
    for m in matches:
        i_am_player1 = m.player1_id == current_user.id
        my_score = m.player1_score if i_am_player1 else m.player2_score
        opponent_score = m.player2_score if i_am_player1 else m.player1_score

        sets = m.sets
        if sets and not i_am_player1:
            sets = [
                {"player1_games": s["player2_games"], "player2_games": s["player1_games"]}
                for s in sets
            ]

        if my_score > opponent_score:
            wins += 1
        else:
            losses += 1

        match_list.append(
            schemas.HeadToHeadMatch(
                id=m.id,
                kind=m.kind,
                league_id=m.league_id,
                league_name=m.league.name if m.league_id else None,
                my_score=my_score,
                opponent_score=opponent_score,
                sets=sets,
                played_at=m.played_at,
            )
        )

    return schemas.HeadToHeadOut(opponent=opponent, wins=wins, losses=losses, matches=match_list)
