"""Verifying the token Google hands the browser.

The sign-in button never gives us a password. It gives the browser a short
lived JWT that Google signed, and the browser passes it here. Our job is to
check that signature against Google's own public keys — anything else, such as
trusting an email address the client claims, would let anyone sign in as
anyone by typing the right address.
"""

import base64
import json
import os
import time
import urllib.request

from fastapi import HTTPException
from jose import jwt, JWTError

# The same id the button is drawn with, on the browser's side. It is public,
# but it is not decoration: a token is only accepted if Google addressed it to
# this exact app, which is what stops a token minted for some other site from
# being replayed here. GOOGLE_CLIENT_ID overrides it.
GOOGLE_CLIENT_ID = os.environ.get(
    "GOOGLE_CLIENT_ID",
    "803410034957-02cud2sjitn1ln67rdt2tup1j90jb8vk.apps.googleusercontent.com",
)

CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
# Google rotates these keys. An hour is well inside the rotation period and
# saves a round trip on every single sign-in.
CERTS_TTL = 3600
# Both spellings are in the wild, and Google's own docs accept either.
ISSUERS = ("https://accounts.google.com", "accounts.google.com")

_certs: dict | None = None
_certs_fetched_at = 0.0


def _fetch_certs(force: bool = False) -> dict:
    global _certs, _certs_fetched_at
    fresh = _certs is not None and time.time() - _certs_fetched_at < CERTS_TTL
    if fresh and not force:
        return _certs
    try:
        with urllib.request.urlopen(CERTS_URL, timeout=10) as response:
            _certs = json.loads(response.read())
            _certs_fetched_at = time.time()
    except Exception:
        # A network blip shouldn't invalidate keys we already hold.
        if _certs is None:
            raise HTTPException(status_code=503, detail="ההתחברות עם גוגל לא זמינה כרגע")
    return _certs


def _key_for(kid: str) -> dict:
    for key in _fetch_certs().get("keys", []):
        if key.get("kid") == kid:
            return key
    # An unknown kid usually means Google rotated since we last looked.
    for key in _fetch_certs(force=True).get("keys", []):
        if key.get("kid") == kid:
            return key
    raise HTTPException(status_code=401, detail="ההתחברות עם גוגל נכשלה")


def verify_google_id_token(credential: str) -> dict:
    """Returns the token's claims, or raises. Only ever called with whatever
    the client sent, so everything here is treated as hostile until the
    signature says otherwise."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="ההתחברות עם גוגל לא מוגדרת בשרת")
    try:
        header = jwt.get_unverified_header(credential)
        claims = jwt.decode(
            credential,
            _key_for(header.get("kid", "")),
            algorithms=["RS256"],
            audience=GOOGLE_CLIENT_ID,
            options={"verify_iss": False},  # checked below, against both spellings
        )
    except (JWTError, KeyError, AttributeError):
        raise HTTPException(status_code=401, detail="ההתחברות עם גוגל נכשלה")

    if claims.get("iss") not in ISSUERS:
        raise HTTPException(status_code=401, detail="ההתחברות עם גוגל נכשלה")
    if not claims.get("sub"):
        raise HTTPException(status_code=401, detail="ההתחברות עם גוגל נכשלה")
    # An unverified address is one Google itself won't vouch for, and this is
    # the only thing tying the account to a person.
    if not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="חשבון הגוגל הזה בלי אימייל מאומת")
    return claims


# Google hands back a URL, not an image, and the size is a suffix on it. The
# app stores square photos of 320px, so ask for one that size rather than the
# 96px thumbnail the token defaults to.
PHOTO_SIZE = 320
# A JPEG that size is tens of kilobytes; much past this is not the photo we
# asked for, and it would ride along in every read of that player's row.
MAX_PHOTO_BYTES = 300 * 1024
PHOTO_TYPES = ("image/jpeg", "image/png", "image/webp")


def fetch_profile_photo(url: str | None) -> str | None:
    """The signed-in player's Google photo, as a data URL ready to store — or
    None, for any reason at all.

    Fetched once and kept, rather than pointed at: a link to
    googleusercontent.com would tell Google every time anyone in the app looked
    at this player, and those URLs expire on Google's schedule, not ours.

    Nothing here may stop a sign-in. A photo is a nicety; being unable to get
    one is not a reason to refuse someone entry."""
    if not url:
        return None
    try:
        sized = url.split("=")[0] + f"=s{PHOTO_SIZE}-c" if "=" in url else url
        request = urllib.request.Request(sized, headers={"User-Agent": "Rally"})
        with urllib.request.urlopen(request, timeout=10) as response:
            media_type = (response.headers.get("Content-Type") or "").split(";")[0].strip()
            if media_type not in PHOTO_TYPES:
                return None
            raw = response.read(MAX_PHOTO_BYTES + 1)
        if not raw or len(raw) > MAX_PHOTO_BYTES:
            return None
        return f"data:{media_type};base64," + base64.b64encode(raw).decode()
    except Exception:
        return None
