"""Everything that points at a match, cleared in one place.

Five tables hold a foreign key on matches.id — time options, chat messages,
chat read markers, notifications, rating samples — plus friendly invite links.
Postgres enforces those keys; SQLite used to not, which is how two separate
deletes shipped broken: closing an account, and deleting a league. Both raised
in production and neither in development.

So this is a single function, and every path that destroys a match goes
through it. Adding a sixth table that references matches means adding one line
here rather than remembering three call sites.
"""

from sqlalchemy.orm import Session

from . import models


def purge_match_references(db: Session, match_ids) -> None:
    """Clear or release every row pointing at these matches. Does not delete
    the matches themselves — the caller does that, by whichever route suits it.

    A bulk .delete() bypasses the ORM's own cascades, so relationship
    cascade rules are not enough on their own; this works either way.
    """
    ids = [i for i in set(match_ids) if i is not None]
    if not ids:
        return

    # These have no meaning without their match.
    db.query(models.MatchTimeOption).filter(models.MatchTimeOption.match_id.in_(ids)).delete(
        synchronize_session=False
    )
    db.query(models.MatchMessage).filter(models.MatchMessage.match_id.in_(ids)).delete(
        synchronize_session=False
    )
    db.query(models.MatchChatRead).filter(models.MatchChatRead.match_id.in_(ids)).delete(
        synchronize_session=False
    )
    # A notification about a match that no longer exists points nowhere.
    db.query(models.Notification).filter(models.Notification.match_id.in_(ids)).delete(
        synchronize_session=False
    )

    # These two outlive the match: a rating sample is a point on someone's
    # history, and an invite link is a record of how they met. They keep their
    # row and let go of the reference.
    db.query(models.RatingSample).filter(models.RatingSample.match_id.in_(ids)).update(
        {models.RatingSample.match_id: None}, synchronize_session=False
    )
    db.query(models.FriendlyInviteLink).filter(models.FriendlyInviteLink.match_id.in_(ids)).update(
        {models.FriendlyInviteLink.match_id: None}, synchronize_session=False
    )
