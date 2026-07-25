import json
import os
import urllib.error
import urllib.request

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


def send_reset_email(to_email: str, token: str) -> None:
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"

    if not RESEND_API_KEY:
        print(f"[dev] Password reset link for {to_email}: {reset_link}")
        return

    html = (
        "<p>שלום,</p>"
        "<p>לחצו על הקישור הבא כדי לאפס את הסיסמה שלכם בליגת חובבים:</p>"
        f'<p><a href="{reset_link}">{reset_link}</a></p>'
        "<p>הקישור תקף לשעה אחת. אם לא ביקשתם איפוס סיסמה, אפשר להתעלם מהמייל הזה.</p>"
    )

    payload = json.dumps(
        {
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": "איפוס סיסמה - ליגת חובבים",
            "html": html,
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "league-app/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
        print(f"[resend] reset email sent to {to_email}")
    except urllib.error.HTTPError as e:
        print(f"[resend] failed to send email to {to_email}: {e.code} {e.read().decode()}")
    except urllib.error.URLError as e:
        print(f"[resend] failed to reach Resend API for {to_email}: {e}")
