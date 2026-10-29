# Daily Do's

A simple daily to-do reminder. Two parts:

- `reminders.py` + `tasks.json`: a script that picks the tasks due today and sends them to your phone (via [ntfy](https://ntfy.sh)) and/or email.
- `web/index.html`: a checklist page with a done tracker. It is written for claude.ai Artifacts (it uses the artifact `db` capability for storage), so it is not a standalone site.

## Task format

`tasks.json` is a list of `{"task": "...", "when": "..."}`. `when` can be `daily`, `weekdays`, `weekends`, day names (`mon,wed,fri`), a date (`2026-11-03`), or a day of the month (`day:15`).

## Run it

```
python3 reminders.py
```

Notification settings are environment variables. Set only what you use:

| Variable | Purpose |
| --- | --- |
| `NTFY_TOPIC` | Push to the ntfy app (pick a hard-to-guess topic name) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_TO` | Email |

With neither set, the list prints to the terminal.

## Run it daily on GitHub

`.github/workflows/daily-reminder.yml` runs the script every day at 13:00 UTC. Add the variables above under Settings > Secrets and variables > Actions, then edit `tasks.json` in the repo to change your tasks. The schedule is in UTC, so it shifts an hour when daylight saving ends.
