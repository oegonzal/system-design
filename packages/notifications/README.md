# notifications

The project's event bus, and the channels that put prompts in front of people and bring their answers back as events. A Nest service on :3005 (`NOTIFICATIONS_PORT`).

```bash
pnpm notifications:serve        # build in watch mode and serve, reading .env
curl localhost:3005/health
```

## The bus

Declared topics only (`NOTIFICATION_TOPICS` in `@sysdesign/contracts`): a publish names its topic, its source and a payload that topic's schema accepts, and the bus refuses anything else. A topic the service alone publishes — an answer to a prompt — is refused to every client.

| Route                                        | What it does                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /events` `{topic, source, payload}`    | publish; `201 {data: EventEnvelope}`                                               |
| `PUT /subscriptions/:name` `{topics}`        | create a named cursor at the head, or replace its topics and keep its cursor       |
| `GET /subscriptions/:name/events?waitMs&max` | the events past the cursor, oldest first; waits up to `waitMs` when there are none |
| `POST /subscriptions/:name/ack` `{seq}`      | move the cursor forward to `seq`; never back                                       |
| `DELETE /subscriptions/:name`                | remove it                                                                          |

Delivery is at least once: a pull hands out the same events until they are acknowledged. Events commit in seq order (one advisory lock from seq to commit), so a cursor never passes an event still being written. The sweep forgets an event only once it is past its retention and behind every cursor, and removes subscriptions idle past their age.

## Interactions

A prompt (`interaction.prompted`) declares how it is answered — lettered choices, free text within a length, slash commands — and every channel reads a reply with the contracts' `readReply`, so `b` means the same everywhere. The dispatcher, an ordinary subscriber of the bus, delivers each prompt once on every channel instance that carries its publisher — the event's `source` — and shows on every message it sent how the prompt ended: an answer (`interaction.answered`, published by the service), a withdrawal by its asker (`interaction.withdrawn`), or its expiry. A prompt no instance carries is opened all the same, with a warning, so an answer given elsewhere still closes it. A reply resolves to the prompt whose message it replies to, else to the one prompt open on its address, on the channel it came by — two bots reaching one person at one chat id never answer each other's prompts.

The browser session publishes a second family for whoever keeps a record of its units beyond it — `session.started`, `session.unit.opened`, `session.unit.closed`, `session.ended` — declared in the contracts like any other topic, each carrying the session, the subject, the unit by the id its row has and its declared identity; the bus knows nothing more of them than their schemas. govcon publishes a third — `govcon.award.ending`, `govcon.pulse.above-band` — from its daily spending warm, and puts the digest of them to a person as a prompt.

## Telegram

The first channel kind (`src/channels/telegram/`). It long-polls the Bot API, so no public URL is needed. `config/channels/telegram.json` runs it as one bot per purpose — browser-session's job-application questions on one, govcon's digests on another — and each instance binds its own variables: its bot's token, that bot's username, and the one chat it serves. While an instance's chat is unset it answers `/start` with the chat id to set, and delivers nothing; once set, every other chat is ignored. An instance whose token belongs to another bot than the username it binds refuses to start, and two instances bound to one token refuse boot: Telegram takes one poller per token, and a second is refused. A token is never logged. A prompt arrives as a message with a button per letter (up to `maxChoiceButtons`; past that the letters are typed) and per command; a button sends exactly what typing it would. Pairing steps are in the root `RUNBOOK.md`.

## Layout

`src/bus/` → `src/interactions/` → `src/channels/<id>/`, each reaching the one below only through its `index.ts` or `channels/port.ts`; `src/layers.spec.ts` holds every file to that. A channel kind is its own folder plus one line in `channels/index.ts`; the chosen channels file runs it as instances, each binding a variable to every key the kind declares and naming the publishers it carries.

## Configuration

`config/engine.json` chooses one file per kind — `bus`, `interactions`, `channels` — under `config/<kind>/`; every value lives in those files, and each field's meaning is said beside its schema. `channels/telegram.json` runs every bot (the engine file's choice, for this machine); `channels/telegram-cloud.json` runs the two bots the studio on AWS carries — govcon's and the browser session's — for a deployment that must not poll the bots this machine keeps polling (Telegram takes one poller per token); `channels/none.json` runs the bus alone. `NOTIFICATIONS_CHANNELS` names the channels file to run instead of the engine file's choice — `NOTIFICATIONS_CHANNELS=telegram-cloud` — and a name with no file behind it refuses boot. `src/config.ts` is the only file that reads the environment: the service's own variables (`NOTIFICATIONS_PORT`, `NOTIFICATIONS_CHANNELS`), and every variable the chosen channels file binds. An instance missing a variable its kind requires, or two instances bound to one token, refuse boot by name. The Tiltfile and the test config read the variable names from the channels files too, so none is listed twice.

Tables: `bus_event`, `bus_subscription`, `interaction`, `interaction_delivery` (migration `Migration20261011100001_notifications`).
