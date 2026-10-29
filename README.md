# Daily Do's

A simple daily to-do reminder. Two parts:

- `reminders.py` + `tasks.json`: a script that picks the tasks due today and sends them to your phone (via [ntfy](https://ntfy.sh)) and/or email.
- `docs/`: a checklist web app with a done tracker, installable to a phone home screen. It saves to the device's browser storage, so it works offline and needs no server.

## Task format

Tasks are a JSON list (see `tasks.example.json`) of `{"task": "...", "when": "..."}`. `when` can be `daily`, `weekdays`, `weekends`, day names (`mon,wed,fri`), a date (`2026-11-03`), or a day of the month (`day:15`).

## Run it

Copy `tasks.example.json` to `tasks.json` and edit it (`tasks.json` is git-ignored, so it never gets committed), then:

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

`.github/workflows/daily-reminder.yml` runs the script every day at 13:00 UTC. Add the variables above under Settings > Secrets and variables > Actions. Also add a secret named `TASKS_JSON` containing your task list (the same JSON as `tasks.example.json`). Secret values are hidden even in a public repo, so your tasks stay private. To change tasks, paste the new JSON into that secret. The schedule is in UTC, so it shifts an hour when daylight saving ends.

## Put the checklist on your phone (GitHub Pages)

1. In the repo, go to Settings > Pages. Under Build and deployment, choose Deploy from a branch, pick `main` and the `/docs` folder, and save.
2. Open `https://<your-username>.github.io/daily-dos/` on your phone.
3. iPhone: Share > Add to Home Screen. Android: menu > Install app or Add to Home screen.

Tasks and check-offs are stored on that device only. A home screen app and the same page in a browser tab keep separate lists, and nothing syncs between devices. The page can't push notifications by itself, so use the daily workflow above for the morning reminder.
