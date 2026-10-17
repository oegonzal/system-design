# Tool session — the live recipe

The specs prove the pieces against fakes: the `tool-step` pipeline over
scripted plans, the session loop over scripted runs, each service over a
mailbox or a calendar in memory. This is the order to prove them against the
real loop, the real bus, a real mailbox and a real calendar, once, on this
machine. Each step names what to read afterwards; stop at the first that does
not hold.

## 0. The stack

```bash
pnpm quality-loop:serve                                  # :3003, signed in (claude login)
curl -s localhost:3003/pipelines | jq -r '.data[].id'    # lists tool-step
pnpm notifications:serve                                 # :3005, telegram.gmail and telegram.google-calendar bound (RUNBOOK: the Telegram channel)
pnpm gmail authorize                                     # once: the consent; static/google/oauth-token.json
pnpm gmail:serve                                         # :3008 — logs each settings file it read, the loop, the bus and its peer
pnpm google-calendar:serve                               # :3009 — likewise
```

A service refuses to boot by name without the OAuth client in `.env`, without
a grant, or with a grant that lacks its scope (the refusal names the
`authorize` command). A peer a session cannot reach fails that session's
start by name, not the service.

## 1. The tools, directly

```bash
curl -s localhost:3008/tools | jq -r '.data[] | "\(.name) \(.effect) \(.approval)"'   # ten; none asks first
curl -s localhost:3009/tools | jq -r '.data[] | "\(.name) \(.effect) \(.approval)"'   # nine; the four writes ask first
curl -s -X POST localhost:3008/tools/search_threads -H 'content-type: application/json' \
  -d '{"arguments":{"query":"newer_than:7d","max":3}}' | jq -r .data.summary
curl -s -X POST localhost:3009/tools/suggest_time -H 'content-type: application/json' \
  -d '{"arguments":{"attendees":[],"durationMinutes":30,"windowStart":"<tomorrow>T00:00:00Z","windowEnd":"<the day after>T00:00:00Z","count":null}}' | jq -r .data.summary
curl -s -X POST localhost:3009/tools/get_event -H 'content-type: application/json' -d '{"arguments":{"eventId":1}}'   # 400, with the issues
```

Read: each summary names the ids a later call takes (`thread t…`,
`slot 1: …`); the slots sit inside the working hours, days and time zone of
`packages/google-calendar/config/scheduling/standard.json`; and a direct call
of an approval-gated tool runs without asking — approval is the session's,
not the tool's. `POST /tools/:name` is the door the other service's sessions
mount these tools through; `GET /tools` lists a service's own tools only.

## 2. A read-only mission

```bash
pnpm gmail run --goal packages/gmail/goals/smoke-inbox.md --max-steps 4
pnpm google-calendar run --goal packages/google-calendar/goals/smoke-week.md --max-steps 4
```

Read: exit 0, the session `complete` by the mission's own cause
(`mission-complete`, `week-reported`), one line per step as it ends; one
`tool-step` run per step at
`curl -s 'localhost:3003/runs?pipeline=tool-step' | jq '.data[] | {runId, finalDecision}'`;
in a run's dump (`static/runs/<runId>/01-goal.md`) the goal carries the
mission verbatim, `## Now` with the time as your clock shows it, weekday included, and in UTC, `## Tools` grouped
by provider (`From gmail:`, `From google-calendar:`), the observations of the
calls before, and the index the validators read; `tool-session.finished` on
the bus (`GET :3005/subscriptions/<probe>/events`) and a `Noted` message on
the service's bot with the ending. A plan the validators cut shows in the next
step's goal under `## Objections to answer` at `call.N`, and the history line
for the cut call leads with `not-executed`.

## 3. The cross-service mission

```bash
pnpm gmail run --goal packages/gmail/goals/meeting-from-thread.md --max-steps 8 --max-minutes 20
```

Read: the thread from `search_threads`, then the slots from the calendar
peer's `suggest_time`, in the goal's `## Observations`; then the calendar bot
asks whether to create the event, `yes` / `no`. `no` leaves the calendar
unchanged, the call reads `refused`, and the session ends `stopped` by the
mission's `declined`. `yes` creates the event — `google-calendar.event.created`
on the bus, the invitation at the attendee — and the next step's `create_draft`
leaves a draft in Gmail, never sent, said as `gmail.draft.created`. A question
the plan asks arrives on the gmail bot with its options lettered; the answer
is the next step's observation, led by `[operator]`.

## 4. The watchers

Send yourself an email from another account: within one poll of
`packages/gmail/config/watch/standard.json` (60 s) the gmail bot says
`1 new message` and the bus holds `gmail.message.received`. Invite the account
to an event from another calendar: within one poll of the calendar's
(120 s) the calendar bot says `1 calendar change` (`Invitation: … from …`) and
the bus holds `google-calendar.invitation.received`. Nothing from before the
service started is told, and nothing twice.

## 5. Pin the caps

From the runs above, `pnpm measure:bounds` writes
`packages/quality-loop/src/pipelines/tool-step/measured.json`; `[QL-33][QL-49]`
then hold the declared caps against it, and the seeded caps in that pipeline's
`definition.spec.ts` come out.
