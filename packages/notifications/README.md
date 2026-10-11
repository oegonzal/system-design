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

A prompt (`interaction.prompted`) declares how it is answered — lettered choices, free text within a length, slash commands — and every channel reads a reply with the contracts' `readReply`, so `b` means the same everywhere. The dispatcher, an ordinary subscriber of the bus, delivers each prompt once per channel, and shows on every message it sent how the prompt ended: an answer (`interaction.answered`, published by the service), a withdrawal by its asker (`interaction.withdrawn`), or its expiry. A reply resolves to the prompt whose message it replies to, else to the one prompt open on its address.

## Layout

`src/bus/` → `src/interactions/` → `src/channels/<id>/`, each reaching the one below only through its `index.ts` or `channels/port.ts`; `src/layers.spec.ts` holds every file to that. A channel is its own folder plus one line in `channels/index.ts`: its settings join the `channels` kind and its variables join the declared environment.

## Configuration

`config/engine.json` chooses one file per kind — `bus`, `interactions`, `channels` — under `config/<kind>/`; every value lives in those files, and each field's meaning is said beside its schema. `channels/none.json` runs the bus alone. `src/config.ts` declares every variable the service reads and is the only file that reads the environment; a chosen channel missing a variable it requires refuses boot by name.

Tables: `bus_event`, `bus_subscription`, `interaction`, `interaction_delivery` (migration `Migration20261011100001_notifications`).
