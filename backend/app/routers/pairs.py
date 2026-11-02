"""Pairs — the thing that plays padel.

A player signs up alone and answers the level questionnaire alone, and then
finds somebody to play with. From the moment two people pair up, the pair is
what joins leagues, carries a rating and keeps a history; one person can be in
several pairs at once, each with a different partner and each its own world.
"""

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user
from ..rating_utils import get_rating, round_to_half, seed_pair_level

router = APIRouter(prefix="/pairs", tags=["pairs"])

# How far apart two players' own levels may be and still be offered to each
# other as partners. Padel tolerates a gap better than singles does — the
# stronger player can cover more court — but past this the weaker one stops
# enjoying it.
PARTNER_LEVEL_WINDOW = 1.0
CANDIDATE_LIMIT = 30
# Of that limit, how many places are held for players who have not rated this
# sport. Without a reserve the rated-first sort buries them: the moment there
# are thirty padel players, the tennis friend this player actually wants to ask
# falls off the end of the list and can only be found by typing their name.
UNRATED_RESERVE = 10

LIVE_STATUSES = (models.PairStatus.pending, models.PairStatus.active)


def _ordered(a: int, b: int) -> tuple[int, int]:
    """The same two people are always the same row, whichever of them asked."""
    return (a, b) if a < b else (b, a)


def _mine(user_id: int):
    return or_(models.Pair.player_a_id == user_id, models.Pair.player_b_id == user_id)


def _load(db: Session, pair_id: int, user_id: int) -> models.Pair:
    pair = (
        db.query(models.Pair)
        .options(joinedload(models.Pair.player_a), joinedload(models.Pair.player_b))
        .filter(models.Pair.id == pair_id)
        .first()
    )
    if not pair or user_id not in pair.member_ids:
        # Not "forbidden": whether a pair exists between two other people is
        # not this caller's business either.
        raise HTTPException(status_code=404, detail="הצמד לא נמצא")
    return pair


def _out(pair: models.Pair, user_id: int, db: Session) -> schemas.PairOut:
    me_first = pair.player_a_id == user_id
    partner = pair.player_b if me_first else pair.player_a
    return schemas.PairOut(
        id=pair.id,
        sport_id=pair.sport_id,
        status=pair.status,
        level=round(pair.level, 2) if pair.level is not None else None,
        provisional=pair.provisional,
        matches_played=pair.matches_played,
        partner=schemas.PairPlayerOut.model_validate(partner),
        proposed_by_me=pair.proposed_by == user_id,
        created_at=pair.created_at,
        accepted_at=pair.accepted_at,
    )


@router.get("", response_model=list[schemas.PairOut])
def my_pairs(
    sport_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Every pair this player is in or has been asked about, newest first.
    Both directions of a pending invitation come back here: the screen tells
    them apart by proposed_by_me."""
    pairs = (
        db.query(models.Pair)
        .options(joinedload(models.Pair.player_a), joinedload(models.Pair.player_b))
        .filter(
            models.Pair.sport_id == sport_id,
            _mine(current_user.id),
            models.Pair.status.in_(LIVE_STATUSES),
        )
        .order_by(models.Pair.status, models.Pair.id.desc())
        .all()
    )
    return [_out(p, current_user.id, db) for p in pairs]


@router.get("/candidates", response_model=list[schemas.PairCandidateOut])
def candidates(
    sport_id: int,
    q: str = "",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Who this player could ask. Near their own level, in their own area,
    and not already paired with them."""
    my_rating = get_rating(db, current_user.id, sport_id)

    taken = {
        p.other_player_id(current_user.id)
        for p in db.query(models.Pair)
        .filter(
            models.Pair.sport_id == sport_id,
            _mine(current_user.id),
            models.Pair.status.in_(LIVE_STATUSES),
        )
        .all()
    }

    query = (
        db.query(models.User)
        .filter(
            models.User.id != current_user.id,
            # A closed account is anonymised rather than removed, so it would
            # otherwise sit here as "Deleted user", invitable.
            models.User.deleted_at.is_(None),
            # Demo players exist for one screenshot and must never be
            # reachable by a real one.
            models.User.is_demo.isnot(True),
        )
    )
    text = q.strip()
    if text:
        query = query.filter(models.User.name.ilike(f"%{text}%"))
    people = query.order_by(models.User.name).limit(200).all()

    ratings = {
        r.user_id: r
        for r in db.query(models.PlayerRating)
        .filter(
            models.PlayerRating.sport_id == sport_id,
            models.PlayerRating.user_id.in_([u.id for u in people]) if people else False,
        )
        .all()
    }

    out: list[schemas.PairCandidateOut] = []
    for person in people:
        if person.id in taken:
            continue
        rating = ratings.get(person.id)
        # Somebody who plays tennis here but has never answered the padel
        # questionnaire is still a real person this player may well want as a
        # partner — more likely, in fact, than a stranger. They come through
        # with no level, marked, and the pair simply cannot enter a league
        # until they answer it.
        if rating is None:
            out.append(
                schemas.PairCandidateOut(
                    user=schemas.PairPlayerOut.model_validate(person),
                    level=None,
                    provisional=False,
                    same_area=bool(
                        person.area and current_user.area and person.area == current_user.area
                    ),
                    level_gap=None,
                    rated=False,
                )
            )
            continue
        gap = (
            abs(round_to_half(rating.level) - round_to_half(my_rating.level))
            if my_rating
            else 0.0
        )
        if not text and gap > PARTNER_LEVEL_WINDOW:
            continue
        out.append(
            schemas.PairCandidateOut(
                user=schemas.PairPlayerOut.model_validate(person),
                level=round(rating.level, 2),
                provisional=rating.provisional,
                same_area=bool(
                    person.area and current_user.area and person.area == current_user.area
                ),
                level_gap=round(gap, 2),
                rated=True,
            )
        )

    # Rated players first, closest in level, nearby ones ahead of far ones —
    # the things that decide whether playing together is any fun. The unrated
    # go last rather than nowhere: they are a longer road, not a worse player.
    def order(c):
        return (
            c.level_gap if c.level_gap is not None else 99,
            not c.same_area,
            c.user.name or "",
        )

    rated = sorted([c for c in out if c.rated], key=order)
    unrated = sorted([c for c in out if not c.rated], key=order)

    # A name search is answering a question about one person, so it returns
    # whoever matches in whatever proportion they come; browsing is a list to
    # pick from, and both kinds belong in it.
    if text:
        return (rated + unrated)[:CANDIDATE_LIMIT]

    keep_unrated = unrated[:UNRATED_RESERVE]
    keep_rated = rated[: CANDIDATE_LIMIT - len(keep_unrated)]
    return keep_rated + keep_unrated


@router.post("", response_model=schemas.PairOut, status_code=201)
def propose_pair(
    payload: schemas.PairCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.partner_id == current_user.id:
        raise HTTPException(status_code=400, detail="אי אפשר להיות צמד עם עצמך")

    partner = (
        db.query(models.User)
        .filter(
            models.User.id == payload.partner_id,
            models.User.deleted_at.is_(None),
            models.User.is_demo.isnot(True),
        )
        .first()
    )
    if not partner:
        raise HTTPException(status_code=404, detail="השחקן לא נמצא")

    a, b = _ordered(current_user.id, payload.partner_id)
    existing = (
        db.query(models.Pair)
        .filter(
            models.Pair.sport_id == payload.sport_id,
            models.Pair.player_a_id == a,
            models.Pair.player_b_id == b,
            models.Pair.status.in_(LIVE_STATUSES),
        )
        .first()
    )
    if existing:
        if existing.status == models.PairStatus.active:
            raise HTTPException(status_code=400, detail="אתם כבר צמד")
        raise HTTPException(status_code=400, detail="כבר יש הצעה פתוחה ביניכם")

    pair = models.Pair(
        sport_id=payload.sport_id,
        player_a_id=a,
        player_b_id=b,
        proposed_by=current_user.id,
        status=models.PairStatus.pending,
    )
    db.add(pair)
    db.commit()
    db.refresh(pair)
    return _out(pair, current_user.id, db)


@router.post("/{pair_id}/accept", response_model=schemas.PairOut)
def accept_pair(
    pair_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pair = _load(db, pair_id, current_user.id)
    if pair.status != models.PairStatus.pending:
        raise HTTPException(status_code=400, detail="ההצעה כבר טופלה")
    if pair.proposed_by == current_user.id:
        raise HTTPException(status_code=400, detail="ההצעה ממתינה לשותף, לא לך")

    pair.status = models.PairStatus.active
    pair.accepted_at = datetime.utcnow()
    seed_pair_level(db, pair)
    db.commit()
    db.refresh(pair)
    return _out(pair, current_user.id, db)


@router.post("/{pair_id}/decline", response_model=schemas.MessageOut)
def decline_pair(
    pair_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Either side may call this: the one who was asked says no, the one who
    asked withdraws. Both leave the same row behind, which is what lets the
    two of them try again later."""
    pair = _load(db, pair_id, current_user.id)
    if pair.status != models.PairStatus.pending:
        raise HTTPException(status_code=400, detail="ההצעה כבר טופלה")
    pair.status = models.PairStatus.declined
    db.commit()
    return schemas.MessageOut(message="ההצעה נדחתה")


@router.delete("/{pair_id}", response_model=schemas.MessageOut)
def dissolve_pair(
    pair_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Breaking up keeps the row, the rating and the history: matches already
    played belong to the other three people in them too."""
    pair = _load(db, pair_id, current_user.id)
    if pair.status != models.PairStatus.active:
        raise HTTPException(status_code=400, detail="הצמד אינו פעיל")
    pair.status = models.PairStatus.dissolved
    pair.dissolved_at = datetime.utcnow()
    db.commit()
    return schemas.MessageOut(message="הצמד פורק")


# --- Inviting somebody who is not here yet --------------------------------
#
# The candidate list can only offer people who already have an account, and
# most of anybody's padel partners do not. These three endpoints mirror the
# friendly-match invite link exactly, because the problem is the same one: a
# link is a question, and the person answering it may need to make an account
# before they can answer.


@router.post("/invite-links", response_model=schemas.PairInviteLinkOut)
def create_pair_invite_link(
    payload: schemas.PairInviteLinkCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sport = db.query(models.Sport).filter(models.Sport.id == payload.sport_id).first()
    if not sport:
        raise HTTPException(status_code=404, detail="Sport not found")

    token = secrets.token_urlsafe(16)
    db.add(
        models.PairInviteLink(
            inviter_id=current_user.id, sport_id=payload.sport_id, token=token
        )
    )
    db.commit()
    return schemas.PairInviteLinkOut(token=token)


@router.get("/invite-links/{token}", response_model=schemas.PairInviteLinkInfoOut)
def describe_pair_invite_link(
    token: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Read a link without spending it, so the screen can say which of four
    things it is looking at: a real invitation, your own link, one already
    used, or a dead token."""
    link = (
        db.query(models.PairInviteLink).filter(models.PairInviteLink.token == token).first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="קישור ההזמנה לא תקין")
    return schemas.PairInviteLinkInfoOut(
        inviter_id=link.inviter_id,
        inviter_name=link.inviter.name if link.inviter else "",
        inviter_photo_url=link.inviter.photo_url if link.inviter else None,
        sport_id=link.sport_id,
        sport_name=link.sport.name if link.sport else "",
        used=bool(link.used),
        is_mine=link.inviter_id == current_user.id,
        pair_id=link.pair_id,
    )


@router.post("/invite-links/{token}/redeem", response_model=schemas.PairOut)
def redeem_pair_invite_link(
    token: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Lock the row before checking `used`, so two redemptions racing on the
    # same one-time token cannot both pass the check before either commits.
    link = (
        db.query(models.PairInviteLink)
        .filter(models.PairInviteLink.token == token)
        .with_for_update()
        .first()
    )
    if not link or link.used:
        raise HTTPException(status_code=404, detail="קישור ההזמנה לא תקין או שכבר נוצל")
    if link.inviter_id == current_user.id:
        raise HTTPException(status_code=400, detail="זה קישור ההזמנה שלך — שלח אותו למישהו אחר")

    a, b = _ordered(link.inviter_id, current_user.id)
    existing = (
        db.query(models.Pair)
        .filter(
            models.Pair.sport_id == link.sport_id,
            models.Pair.player_a_id == a,
            models.Pair.player_b_id == b,
            models.Pair.status.in_(LIVE_STATUSES),
        )
        .first()
    )
    if existing and existing.status == models.PairStatus.active:
        raise HTTPException(status_code=400, detail="אתם כבר צמד")

    if existing:
        # They already had an invitation open between them; opening the link
        # is an answer to it rather than a second one.
        pair = existing
    else:
        pair = models.Pair(
            sport_id=link.sport_id,
            player_a_id=a,
            player_b_id=b,
            proposed_by=link.inviter_id,
        )
        db.add(pair)

    # Active straight away: one of them consented by sending the link and the
    # other by opening it, which is the same two answers the in-app flow asks
    # for in two steps.
    pair.status = models.PairStatus.active
    pair.accepted_at = datetime.utcnow()
    link.used = True
    db.commit()
    db.refresh(pair)

    seed_pair_level(db, pair)
    link.pair_id = pair.id
    db.commit()
    db.refresh(pair)

    notify_user(
        db,
        link.inviter_id,
        "יש לך שותף",
        f"{current_user.name} אישר/ה את ההזמנה — אתם צמד",
        "/partners",
        title_en="You have a partner",
        body_en=f"{current_user.name} accepted — you are a pair",
    )
    return _out(pair, current_user.id, db)
