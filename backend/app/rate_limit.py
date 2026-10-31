"""A small cap on how often one caller may hit the doors that guard an account.

Without it, a password is only as good as the number of guesses someone is
willing to make, and nothing stopped them making a million. This is deliberately
a few lines held in memory rather than Redis: the service runs as a single
process, and a limiter that is occasionally forgotten on a restart is worth far
more than no limiter at all.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: dict[str, deque] = defaultdict(deque)

# A ceiling on the bookkeeping itself, so that a flood of distinct keys cannot
# turn the limiter into the memory leak that takes the service down.
_MAX_KEYS = 50_000


def client_ip(request: Request) -> str:
    """Render terminates TLS in front of us, so the socket address is theirs.
    The leftmost X-Forwarded-For entry is the caller — spoofable, but a caller
    who spoofs it is handing themselves a fresh bucket, not someone else's."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hit(key: str, limit: int, window_seconds: int) -> None:
    """Count one attempt against `key`; raise 429 once it is over the limit."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        if len(_hits) > _MAX_KEYS:
            _hits.clear()
        bucket = _hits[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="יותר מדי נסיונות. נסו שוב בעוד כמה דקות.",
                headers={"Retry-After": str(window_seconds)},
            )
        bucket.append(now)


def forget(key: str) -> None:
    """Clear a key's history. Called after a successful sign-in, so that a
    person who simply mistyped their password twice is not then locked out by
    their own successful attempt."""
    with _lock:
        _hits.pop(key, None)


def limiter(name: str, limit: int, window_seconds: int):
    """A FastAPI dependency that limits by caller address."""

    def dependency(request: Request) -> None:
        hit(f"{name}:{client_ip(request)}", limit, window_seconds)

    return dependency
