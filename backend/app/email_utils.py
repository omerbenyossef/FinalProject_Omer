"""Outgoing mail.

There are two ways out and the order matters. Render blocks outbound SMTP, so
smtplib cannot reach Gmail from the deployed service however correct the
credentials are — it fails at the socket, not at the login. Anything sent from
production therefore goes over HTTPS through Resend; SMTP stays for a local
machine, where it works and needs no third party.

Nothing calls this at the moment: signing in goes through Google, so there are
no passwords and nothing to reset. It is kept because working out that SMTP is
blocked, and reaching for an HTTP sender instead, is the whole cost here — the
sending itself is twenty lines.
"""

import json
import os
import smtplib
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
# Resend will send from its own test address without any setup, but only to the
# address that owns the Resend account. Reaching anybody else needs a domain
# verified with them, and RESEND_FROM pointed at it.
RESEND_FROM = os.environ.get("RESEND_FROM", "Rally <onboarding@resend.dev>")
RESEND_ENDPOINT = "https://api.resend.com/emails"

SMTP_TIMEOUT = 10
HTTP_TIMEOUT = 10


def email_configured() -> bool:
    """Whether there is any way at all to send mail. Callers that have to reach
    the user some other way when there isn't ask this rather than reading the
    credentials themselves."""
    return bool(RESEND_API_KEY or (GMAIL_ADDRESS and GMAIL_APP_PASSWORD))


def _send_via_resend(to_email: str, subject: str, html: str) -> bool:
    payload = json.dumps(
        {"from": RESEND_FROM, "to": [to_email], "subject": subject, "html": html}
    ).encode("utf-8")
    request = urllib.request.Request(
        RESEND_ENDPOINT,
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            if 200 <= response.status < 300:
                print(f"[resend] sent to {to_email}")
                return True
            print(f"[resend] unexpected status {response.status} for {to_email}")
            return False
    except urllib.error.HTTPError as e:
        # Worth reading in the log rather than guessing: 403 here is almost
        # always "that from-address belongs to a domain you have not verified",
        # which looks nothing like a broken API key but fails just as totally.
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")[:300]
        except Exception:
            pass
        print(f"[resend] refused for {to_email}: {e.code} {body}")
        return False
    except (urllib.error.URLError, OSError, ValueError) as e:
        print(f"[resend] could not reach the API for {to_email}: {e}")
        return False


def _send_via_gmail(to_email: str, subject: str, html: str) -> bool:
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = GMAIL_ADDRESS
    message["To"] = to_email
    message.attach(MIMEText(html, "html", "utf-8"))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=SMTP_TIMEOUT) as server:
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_ADDRESS, [to_email], message.as_string())
        print(f"[gmail] sent to {to_email}")
        return True
    except smtplib.SMTPException as e:
        print(f"[gmail] refused to send to {to_email}: {e}")
        return False
    except OSError as e:
        # This is what a host that blocks outbound SMTP looks like.
        print(f"[gmail] could not reach Gmail SMTP for {to_email}: {e}")
        return False


def send_email(to_email: str, subject: str, html: str) -> bool:
    """Returns whether it went. A caller must not fail the request over a false:
    whether mail left the building is not something the person on the other end
    can do anything about, and saying so out loud tells a stranger which
    addresses are registered."""
    if RESEND_API_KEY and _send_via_resend(to_email, subject, html):
        return True
    if GMAIL_ADDRESS and GMAIL_APP_PASSWORD and _send_via_gmail(to_email, subject, html):
        return True
    if not email_configured():
        print(f"[dev] no mail configured; nothing sent to {to_email}")
    return False
