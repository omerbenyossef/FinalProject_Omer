import base64
import binascii
import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import (
    create_access_token,
    get_current_user,
    hash_password,
    normalize_email,
    verify_password,
)
from ..database import get_db
from ..google_auth import fetch_profile_photo, verify_google_id_token
from ..email_utils import email_configured, send_reset_email
from ..match_cleanup import purge_match_references
from ..rate_limit import client_ip, forget, hit, limiter
from ..rating_utils import match_winner_id
from .matches import _auto_confirm_overdue

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_EXPIRE_HOURS = 1

# Handing the reset token back in the reply makes the address identification
# rather than verification: anyone who knows a registered address can take the
# account over, and the reply says which addresses are registered. That is only
# ever acceptable on a developer's machine, so it is off unless switched on,
# and it is never switched on by the mere absence of mail credentials — if mail
# is not configured the reset simply cannot be done, which is the lesser harm.
RESET_WITHOUT_EMAIL = os.environ.get("PASSWORD_RESET_WITHOUT_EMAIL", "0") == "1"


@router.post(
    "/register",
    response_model=schemas.Token,
    dependencies=[Depends(limiter("register", 10, 3600))],
)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    email = normalize_email(user_in.email)
    existing = db.query(models.User).filter(func.lower(models.User.email) == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        name=user_in.name,
        email=email,
        hashed_password=hash_password(user_in.password),
        area=user_in.area,
        travel_radius_km=user_in.travel_radius_km,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.post("/login", response_model=schemas.Token)
def login(request: Request, credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    # Two buckets: one stops a single machine working through many accounts,
    # the other stops many machines working through one account. Both are
    # generous enough that a person who has forgotten which password they used
    # will never meet them.
    email = normalize_email(credentials.email)
    by_caller = f"login-ip:{client_ip(request)}"
    by_account = f"login-email:{email}"
    hit(by_caller, 20, 900)
    hit(by_account, 10, 900)

    user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    forget(by_caller)
    forget(by_account)
    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.post(
    "/google",
    response_model=schemas.Token,
    dependencies=[Depends(limiter("google", 30, 3600))],
)
def google_sign_in(payload: schemas.GoogleSignIn, db: Session = Depends(get_db)):
    """One door for both signing up and signing in. Which of the two it is
    depends on whether we have seen this person before, and the answer is worth
    getting right: a second account for someone who already has one is how a
    player ended up able to invite themselves to a match.

    So the lookup goes by Google's own subject id first, and falls back to the
    email — which is how an account that was opened with a password gets
    adopted by the same person's Google sign-in rather than duplicated."""
    claims = verify_google_id_token(payload.credential)
    email = normalize_email(claims["email"])

    # Google sends the player's own photo along with their name. Taking it
    # means everyone who signs in this way arrives with a face rather than two
    # letters in a circle — which matters in an app whose whole point is that
    # you are about to go and meet this person.
    user = db.query(models.User).filter(models.User.google_sub == claims["sub"]).first()
    if not user:
        user = (
            db.query(models.User)
            .filter(func.lower(models.User.email) == email)
            .first()
        )
        if user:
            # Same verified address, so this is the same person coming in
            # through a different door. Link, don't duplicate.
            user.google_sub = claims["sub"]

    if not user:
        user = models.User(
            name=(claims.get("name") or email.split("@")[0]).strip(),
            email=email,
            google_sub=claims["sub"],
            # There is no password to store, and the column is NOT NULL in
            # production. A hash of something nobody knows keeps the schema as
            # it is and locks the password door, while "forgot password" still
            # works for anyone who later wants one — it goes to the address
            # Google just vouched for.
            hashed_password=hash_password(secrets.token_urlsafe(32)),
        )
        db.add(user)

    # Never over a photo they chose themselves: the one they picked is the one
    # they meant. Only the gap gets filled, and only the first time.
    if user.photo is None:
        photo = fetch_profile_photo(claims.get("picture"))
        if photo:
            user.photo = photo
            user.photo_updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=schemas.UserOut)
def update_profile(
    payload: schemas.UpdateProfileRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # settings114b.md: each identity row saves on its own, so only the field
    # actually sent gets applied — the others stay untouched.
    data = payload.dict(exclude_unset=True)
    if data.get("language") not in (None, "he", "en"):
        raise HTTPException(status_code=400, detail="שפה לא נתמכת")
    for field in ("name", "age", "area", "travel_radius_km", "language"):
        if field in data:
            setattr(current_user, field, data[field])
    # Finishing the intro is a one-way door — a client can say it happened,
    # never that it un-happened, and the first time it says so is the one that
    # counts (a later screen re-sending it shouldn't move the date).
    if data.get("intro_seen") and current_user.intro_seen_at is None:
        current_user.intro_seen_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/me/notifications", response_model=schemas.UserOut)
def update_notification_preferences(
    payload: schemas.UpdateNotificationPreferencesRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # result_to_confirm is always on and never sent from the client (settings114b.md).
    data = payload.dict(exclude_unset=True)
    if "time_proposals" in data:
        current_user.notify_time_proposals = data["time_proposals"]
    if "round_opens" in data:
        current_user.notify_round_opens = data["round_opens"]
    if "quiet_from" in data:
        current_user.quiet_hours_from = data["quiet_from"]
    if "quiet_to" in data:
        current_user.quiet_hours_to = data["quiet_to"]
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me/stats", response_model=schemas.UserStats)
def my_stats(
    sport_id: int | None = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _auto_confirm_overdue(db)
    membership_query = db.query(models.LeagueMembership).filter(
        models.LeagueMembership.user_id == current_user.id
    )
    if sport_id is not None:
        membership_query = membership_query.join(models.League).filter(
            models.League.sport_id == sport_id
        )
    leagues_count = membership_query.count()

    matches_query = db.query(models.Match).filter(
        or_(
            models.Match.player1_id == current_user.id,
            models.Match.player2_id == current_user.id,
        ),
        models.Match.status == models.MatchStatus.completed,
    )
    if sport_id is not None:
        matches_query = matches_query.outerjoin(models.League).filter(
            or_(
                models.League.sport_id == sport_id,
                models.Match.sport_id == sport_id,
            )
        )
    matches = matches_query.order_by(models.Match.played_at.desc()).all()

    # A match_winner_id() of None (sets *and* total games both tied — only
    # possible when a court-time cutoff ends a match early) counts toward
    # neither wins nor losses rather than a loss for both players.
    wins = 0
    losses = 0
    for match in matches:
        winner_id = match_winner_id(match)
        if winner_id is None:
            continue
        if winner_id == current_user.id:
            wins += 1
        else:
            losses += 1

    recent_matches = []
    for match in matches[:8]:
        i_am_player1 = match.player1_id == current_user.id
        opponent = match.player2 if i_am_player1 else match.player1
        won = match_winner_id(match) == current_user.id
        my_sets = [
            schemas.SetScore(
                player1_games=s["player1_games"] if i_am_player1 else s["player2_games"],
                player2_games=s["player2_games"] if i_am_player1 else s["player1_games"],
            )
            for s in (match.sets or [])
        ]
        recent_matches.append(
            schemas.RecentMatchEntry(
                opponent_id=opponent.id,
                opponent_name=opponent.name,
                my_sets=my_sets,
                won=won,
                kind=match.kind,
                league_name=match.league.name if match.league_id else None,
                played_at=match.played_at,
            )
        )

    return schemas.UserStats(
        leagues=leagues_count,
        matches_played=len(matches),
        wins=wins,
        losses=losses,
        recent_matches=recent_matches,
    )


@router.post("/change-password", response_model=schemas.MessageOut)
def change_password(
    payload: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="הסיסמה הנוכחית שגויה")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()

    return schemas.MessageOut(message="הסיסמה עודכנה בהצלחה")


@router.post("/change-email", response_model=schemas.UserOut)
def change_email(
    payload: schemas.ChangeEmailRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="הסיסמה הנוכחית שגויה")

    new_email = normalize_email(payload.new_email)
    existing = db.query(models.User).filter(func.lower(models.User.email) == new_email).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(status_code=400, detail="האימייל הזה כבר בשימוש")

    current_user.email = new_email
    db.commit()
    db.refresh(current_user)
    return current_user


def _delete_user_account(db: Session, user: models.User) -> None:
    """Anonymize-and-deactivate rather than hard-delete: the user's id is
    referenced as a foreign key all over (matches, league memberships,
    leagues they created), and other members' standings/match history need
    those rows to stay intact. Mirrors leave_league's own cleanup (drop
    pending matches + membership, keep completed ones) applied across every
    league at once, plus removing anything that's exclusively theirs."""
    mine = or_(models.Match.player1_id == user.id, models.Match.player2_id == user.id)

    membership_league_ids = [
        m.league_id
        for m in db.query(models.LeagueMembership).filter(models.LeagueMembership.user_id == user.id).all()
    ]

    # Which matches are going: this player's unplayed league matches, and
    # their unplayed friendlies. Collected as ids first because four other
    # tables point at matches.id, and those rows have to go before these do.
    doomed_ids: set[int] = set()
    if membership_league_ids:
        doomed_ids.update(
            r[0]
            for r in db.query(models.Match.id).filter(
                models.Match.league_id.in_(membership_league_ids),
                models.Match.status == models.MatchStatus.pending,
                mine,
            )
        )
    doomed_ids.update(
        r[0]
        for r in db.query(models.Match.id).filter(
            models.Match.kind == models.MatchKind.friendly,
            models.Match.status == models.MatchStatus.pending,
            mine,
        )
    )

    db.query(models.LeagueMembership).filter(models.LeagueMembership.user_id == user.id).delete(
        synchronize_session=False
    )

    if doomed_ids:
        ids = list(doomed_ids)
        # Five tables point at matches.id and a bulk delete() goes round the
        # ORM's cascades, so they are cleared first. See match_cleanup.
        purge_match_references(db, ids)
        db.query(models.Match).filter(models.Match.id.in_(ids)).delete(synchronize_session=False)

    db.query(models.PlayerRating).filter(models.PlayerRating.user_id == user.id).delete(synchronize_session=False)
    db.query(models.RatingSample).filter(models.RatingSample.user_id == user.id).delete(synchronize_session=False)
    db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user.id).delete(
        synchronize_session=False
    )
    db.query(models.FriendlyInviteLink).filter(
        models.FriendlyInviteLink.inviter_id == user.id, models.FriendlyInviteLink.used.is_(False)
    ).delete(synchronize_session=False)

    # Otherwise signing in with the same Google account would walk straight
    # back into the account that was just deleted.
    user.google_sub = None
    user.name = "Deleted user"
    user.email = f"deleted-{user.id}@deleted.rally.local"
    user.hashed_password = hash_password(secrets.token_urlsafe(32))
    user.age = None
    user.reset_token = None
    user.reset_token_expires = None
    user.deleted_at = datetime.utcnow()
    db.commit()


@router.delete("/me", response_model=schemas.MessageOut)
def delete_account(
    payload: schemas.DeleteAccountRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="הסיסמה שגויה")

    _delete_user_account(db, current_user)
    return schemas.MessageOut(message="החשבון נמחק בהצלחה")


# The client downscales to a small square before sending, so anything much
# larger than this is a client that didn't — refuse it rather than carry it in
# every row read.
MAX_PHOTO_BYTES = 300 * 1024
PHOTO_TYPES = ("image/jpeg", "image/png", "image/webp")


def _decode_data_url(data_url: str, max_bytes: int = MAX_PHOTO_BYTES) -> tuple[str, bytes]:
    """Splits "data:<type>;base64,<payload>" into its media type and bytes,
    raising a 400 for anything that isn't one of the image types we serve.
    The size ceiling is the caller's: an avatar is a small square, a venue
    picture is a wide strip, and they have no business sharing a limit."""
    prefix, _, payload = data_url.partition(",")
    if not payload or not prefix.startswith("data:") or not prefix.endswith(";base64"):
        raise HTTPException(status_code=400, detail="קובץ התמונה לא תקין")
    media_type = prefix[len("data:") : -len(";base64")]
    if media_type not in PHOTO_TYPES:
        raise HTTPException(status_code=400, detail="אפשר להעלות תמונה בפורמט JPEG, PNG או WebP")
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="קובץ התמונה לא תקין")
    if not raw:
        raise HTTPException(status_code=400, detail="קובץ התמונה לא תקין")
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail="התמונה גדולה מדי")
    return media_type, raw


@router.put("/me/photo", response_model=schemas.UserOut)
def set_my_photo(
    payload: schemas.PhotoUploadRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    media_type, raw = _decode_data_url(payload.data_url)
    # Re-encode from the bytes we validated, so what gets stored is only ever
    # something this endpoint could decode.
    current_user.photo = f"data:{media_type};base64," + base64.b64encode(raw).decode()
    current_user.photo_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me/photo", response_model=schemas.UserOut)
def delete_my_photo(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    current_user.photo = None
    current_user.photo_updated_at = None
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post(
    "/forgot-password",
    response_model=schemas.ForgotPasswordOut,
    dependencies=[Depends(limiter("forgot", 5, 3600))],
)
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Also on when mail simply isn't configured, so the flow can't dead-end
    # into a link that was never sent.
    user = (
        db.query(models.User)
        .filter(func.lower(models.User.email) == normalize_email(payload.email))
        .first()
    )
    if user:
        user.reset_token = secrets.token_urlsafe(32)
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=RESET_TOKEN_EXPIRE_HOURS)
        db.commit()
        if RESET_WITHOUT_EMAIL:
            return schemas.ForgotPasswordOut(
                message="אפשר להגדיר סיסמה חדשה", reset_token=user.reset_token
            )
        if email_configured():
            send_reset_email(user.email, user.reset_token)

    # The same sentence either way, whether or not the address is registered:
    # the difference is exactly what an attacker would be fishing for.
    return schemas.ForgotPasswordOut(
        message="אם קיים חשבון עם האימייל הזה, נשלח אליו מייל עם קישור לאיפוס הסיסמה"
    )


@router.post(
    "/reset-password",
    response_model=schemas.MessageOut,
    dependencies=[Depends(limiter("reset", 20, 3600))],
)
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(
            models.User.reset_token == payload.token,
            models.User.reset_token_expires > datetime.utcnow(),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=400, detail="קישור האיפוס אינו תקין או שפג תוקפו")

    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return schemas.MessageOut(message="הסיסמה עודכנה בהצלחה")
