import os
import smtplib
from email.mime.text import MIMEText

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


def send_reset_email(to_email: str, token: str) -> None:
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"

    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        print(f"[dev] Password reset link for {to_email}: {reset_link}")
        return

    body = (
        "שלום,\n\n"
        "לחצו על הקישור הבא כדי לאפס את הסיסמה שלכם בליגת חובבים:\n"
        f"{reset_link}\n\n"
        "הקישור תקף לשעה אחת.\n"
        "אם לא ביקשתם איפוס סיסמה, אפשר להתעלם מהמייל הזה."
    )

    msg = MIMEText(body)
    msg["Subject"] = "איפוס סיסמה - ליגת חובבים"
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = to_email

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        server.send_message(msg)
