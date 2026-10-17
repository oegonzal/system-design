# gmail

The owner's mailbox as tools, and missions over them that the quality loop decides step by step. A Nest service on `:3008` (`GMAIL_PORT`); its source on the bus is `gmail`, carried to the Telegram bot the notifications service binds to `GMAIL_TELEGRAM_API_KEY` and `GMAIL_TELEGRAM_BOT_ID`.

```bash
pnpm gmail authorize                                   # once: consent for every Google scope; writes static/google/oauth-token.json
pnpm gmail:serve                                       # the service; needs the loop (:3003) and the bus (:3005)
pnpm gmail run --goal packages/gmail/goals/smoke-inbox.md --max-steps 4   # one mission from the command line
curl -s localhost:3008/tools | jq '.data[].name'       # the ten tools
curl -s -X POST localhost:3008/tools/search_threads -H 'content-type: application/json' -d '{"arguments":{"query":"newer_than:7d","max":null}}' | jq .data.summary
```

The tools: `search_threads`, `get_message`, `get_thread` (reads); `create_draft` (a draft, never a send — a reply joins its thread and defaults to the original's sender and subject), `list_drafts`, `list_labels`, `label_message`, `label_thread`, `unlabel_message`, `unlabel_thread`. None asks the operator first: nothing here reaches anyone. With the calendar service up (`GOOGLE_CALENDAR_URL`, mounted by `config/peers/standard.json`), its tools join every session, so one mission can read a thread, pick a time and draft the reply — `goals/meeting-from-thread.md`.

Layout: `src/mailbox` (the port, and the Gmail REST adapter over `@sysdesign/google-kit`: MIME to text, RFC 822 for drafts, labels by name, the inbox history), `src/tools` (the ten tools over the port, each answering in words a plan reads), `src/watch` (the inbox watcher: new mail said on the bus as `gmail.message.received` and told on Telegram, one notice per poll), `src/app` (the composition root: `ToolSessionModule` from `@sysdesign/tool-session` serves `/sessions` and `/tools`), `config/` (session rails, the watcher, the peers, the mailbox's sizes and recovery). The settings are read once from `config/engine.json`; the environment is read only in `src/config.ts`.

What it says on the bus: `gmail.message.received`, `gmail.draft.created`, `gmail.labels.changed`, and the tool-session topics for every mission it runs.
