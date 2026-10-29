# Daily Do's

A daily checklist you install on your phone's home screen, with a push notification each morning listing what's left to do.

- `docs/` is the app (served by GitHub Pages). Tasks and check-offs are saved on the phone only.
- `worker/` is a small Cloudflare Worker that sends the daily push. It stores only your phone's push address, never your tasks. The notification text is built on the phone.
- `reminders.py`, `tasks.example.json`, and `.github/workflows/daily-reminder.yml` are an older, optional way to get reminders through ntfy or email. You can ignore or delete them.

## 1. Publish the app

1. Settings > Pages > Deploy from a branch > `main` and `/docs` > Save.
2. On your phone, open `https://<your-username>.github.io/daily-dos/`.
3. iPhone: Share > Add to Home Screen, then open the app from the Home Screen. Android: menu > Install app.

## 2. Deploy the push Worker

You need a free Cloudflare account and Node.js on a computer.

```
cd worker
npx wrangler login
npx wrangler kv namespace create SUBS
```

Copy the `id` it prints into `worker/wrangler.toml` (replace `REPLACE_WITH_KV_ID`). If your GitHub username isn't `aiontrust`, also change `ALLOWED_ORIGIN` and `VAPID_SUBJECT` there. Then:

```
npx wrangler secret put SETUP_KEY     # type any long random phrase; you'll enter it once in the app
npx wrangler deploy
```

`deploy` prints your Worker address (`https://daily-dos-push.<your-subdomain>.workers.dev`).

## 3. Turn on reminders

Open the app from the Home Screen, scroll to Morning reminder, enter the Worker address and setup key, pick a time, and tap Turn on reminders. Allow notifications when asked, then tap Send a test.

Notes:
- iPhone needs iOS 16.4 or later, and the app must be opened from the Home Screen icon.
- The Worker checks hourly and sends once a day at your chosen hour in your phone's time zone, including after daylight saving changes.
- The notification lists tasks still unchecked for today. If nothing is left, it says so (iOS requires every push to show something).
- Tasks live in the phone's browser storage. The Home Screen app and a Safari tab keep separate lists, and nothing syncs between devices.

## Tests

```
node worker/test.mjs
```

## Optional: ntfy / email script

`reminders.py` reads tasks from the `TASKS_JSON` environment variable or a local `tasks.json` (git-ignored; see `tasks.example.json`) and sends today's list through ntfy (`NTFY_TOPIC`) or email (`SMTP_*`, `EMAIL_TO`). The included workflow runs it daily on GitHub using Actions secrets.
