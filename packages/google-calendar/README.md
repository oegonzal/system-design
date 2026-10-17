# google-calendar

The owner's calendar as tools, and missions over them that the quality loop decides step by step. A Nest service on `:3009` (`GOOGLE_CALENDAR_PORT`); its source on the bus is `google-calendar`, carried to the Telegram bot the notifications service binds to `GOOGLECALENDAR_TELEGRAM_API_KEY` and `GOOGLECALENDAR_TELEGRAM_BOT_ID`.

```bash
pnpm google-calendar authorize                         # once, if gmail has not: consent for every Google scope; writes static/google/oauth-token.json
pnpm google-calendar:serve                             # the service; needs the loop (:3003) and the bus (:3005)
pnpm google-calendar run --goal packages/google-calendar/goals/smoke-week.md --max-steps 4   # one mission from the command line
curl -s localhost:3009/tools | jq '.data[].name'       # the nine tools
curl -s -X POST localhost:3009/tools/suggest_time -H 'content-type: application/json' -d '{"arguments":{"attendees":[],"durationMinutes":30,"windowStart":"2026-10-20T00:00:00Z","windowEnd":"2026-10-21T00:00:00Z","count":null}}' | jq .data.summary
```

The tools: `list_calendars`, `list_events`, `search_events`, `get_event`, `suggest_time` (reads; the slot finder is deterministic over free/busy, inside the working hours, days and time zone of `config/scheduling/standard.json`); `create_event`, `update_event`, `respond_to_event` (writes that tell the people on the event) and `delete_event` (irreversible). Every write waits for the operator's yes on Telegram before it runs. With the mailbox service up (`GMAIL_URL`, mounted by `config/peers/standard.json`), its tools join every session.

Layout: `src/calendar` (the port, and the Calendar REST adapter over `@sysdesign/google-kit`: calendars, events, free/busy, the sync token with a 410 read as a fresh start), `src/tools` (the nine tools over the port and the slot finder, each answering in words a plan reads), `src/watch` (the change watcher: an event created, changed or cancelled and an invitation waiting said on the bus and told on Telegram, one notice per poll), `src/app` (the composition root: `ToolSessionModule` from `@sysdesign/tool-session` serves `/sessions` and `/tools`), `config/` (session rails, the watcher, the peers, the scheduling rules, the calendar's sizes and recovery). The settings are read once from `config/engine.json`; the environment is read only in `src/config.ts`.

What it says on the bus: `google-calendar.event.created`, `google-calendar.event.updated`, `google-calendar.event.cancelled`, `google-calendar.invitation.received`, and the tool-session topics for every mission it runs.
