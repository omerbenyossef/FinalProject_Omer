"""Verifying the token Google hands the browser.

The sign-in button never gives us a password. It gives the browser a short
lived JWT that Google signed, and the browser passes it here. Our job is to
check that signature against Google's own public keys — anything else, such as
trusting an email address the client claims, would let anyone sign in as
anyone by typing the right address.
"""

import json
import os
import time
import urllib.request

from fastapi import HTTPException
from jose import jwt, JWTError

# The same id the button is drawn with, on the browser's side. It is public.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

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
