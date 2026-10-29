#!/usr/bin/env python3
"""Daily reminder sender.

Reads tasks from tasks.json and sends today's list by email and/or
phone push (via ntfy.sh). Run it once a day with cron or Task Scheduler.

tasks.json format (a list):
[
  {"task": "Take vitamins", "when": "daily"},
  {"task": "Take out trash", "when": "tue"},
  {"task": "Team standup", "when": "mon,wed,fri"},
  {"task": "Pay rent", "when": "2026-11-01"},
  {"task": "Water plants", "when": "weekdays"}
]

"when" can be: daily | weekdays | weekends | day names (mon,tue,...) |
a specific date (YYYY-MM-DD) | a day of month ("day:15").

Settings via environment variables (set only what you want to use):
  NTFY_TOPIC                      -> push to the ntfy app (pick a hard-to-guess name)
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_TO  -> email
If neither is set, the list just prints to the terminal.
"""

import json
import os
import smtplib
import sys
import urllib.request
from datetime import date
from email.message import EmailMessage
from pathlib import Path

TASKS_FILE = Path(__file__).with_name("tasks.json")
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def is_due(when: str, today: date) -> bool:
    day = DAYS[today.weekday()]
    for part in (p.strip().lower() for p in when.split(",")):
        if part == "daily":
            return True
        if part == "weekdays" and today.weekday() < 5:
            return True
        if part == "weekends" and today.weekday() >= 5:
            return True
        if part == day:
            return True
        if part == today.isoformat():
            return True
        if part.startswith("day:") and part[4:].isdigit() and int(part[4:]) == today.day:
            return True
    return False


def load_today(today: date) -> list[str]:
    tasks = json.loads(TASKS_FILE.read_text())
    return [t["task"] for t in tasks if is_due(t.get("when", "daily"), today)]


def send_ntfy(title: str, body: str) -> None:
    topic = os.environ["NTFY_TOPIC"]
    req = urllib.request.Request(
        f"https://ntfy.sh/{topic}",
        data=body.encode("utf-8"),
        headers={"Title": title},
    )
    urllib.request.urlopen(req, timeout=15)


def send_email(subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ["SMTP_USER"]
    msg["To"] = os.environ["EMAIL_TO"]
    msg.set_content(body)
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", 587))) as s:
        s.starttls()
        s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
        s.send_message(msg)


def main() -> int:
    today = date.today()
    items = load_today(today)
    title = f"To do today ({today:%a %b %d})"
    if not items:
        print("Nothing due today.")
        return 0
    body = "\n".join(f"- {t}" for t in items)

    print(f"{title}\n{body}")
    if os.environ.get("NTFY_TOPIC"):
        send_ntfy(title, body)
    if os.environ.get("SMTP_HOST") and os.environ.get("EMAIL_TO"):
        send_email(title, body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
