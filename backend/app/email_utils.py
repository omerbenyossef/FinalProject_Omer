import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


def send_reset_email(to_email: str, token: str) -> None:
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"

    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        print(f"[dev] Password reset link for {to_email}: {reset_link}")
        return

    html = (
        "<p>שלום,</p>"
        "<p>לחצו על הקישור הבא כדי לאפס את הסיסמה שלכם ב-Rally:</p>"
        f'<p><a href="{reset_link}">{reset_link}</a></p>'
        "<p>הקישור תקף לשעה אחת. אם לא ביקשתם איפוס סיסמה, אפשר להתעלם מהמייל הזה.</p>"
    )

    message = MIMEMultipart("alternative")
    message["Subject"] = "איפוס סיסמה - Rally"
    message["From"] = GMAIL_ADDRESS
    message["To"] = to_email
    message.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_ADDRESS, [to_email], message.as_string())
        print(f"[gmail] reset email sent to {to_email}")
    except smtplib.SMTPException as e:
        print(f"[gmail] failed to send email to {to_email}: {e}")
    except OSError as e:
        print(f"[gmail] failed to reach Gmail SMTP for {to_email}: {e}")
