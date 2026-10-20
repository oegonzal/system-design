# Expose an order-management API partners build on

**Archetype:** public-api · **Difficulty:** standard

## Scenario

You own the API through which a retailer's partners create orders, update shipments and query status. Some partners integrate well; others retry without idempotency keys, poll every second, and will not upgrade their integration for a year. The API must evolve without breaking them, must never create one order twice, and must tell a partner what went wrong in a form their code can act on. Design the API and the system behind it.

## Functional requirements

1. A partner creates an order, amends it until it is dispatched, and cancels it.
2. A partner records shipment updates against an order and reads the order's status history.
3. A partner learns of status changes without polling, and can fall back to polling when it must.
4. A partner tests against a sandbox that behaves like production and never touches real orders.

## Domain and data

- Order, line, shipment and status history are distinct records; a status change is appended, never overwritten.
- An amendment after dispatch is a new order that references the old one, not a change to it.
- A partner's idempotency key, with the request it keyed, is kept long enough to answer a late retry.

## Interfaces

- Idempotency keys on every create: the same key returns the first result, a different body under the same key is refused.
- Cursor pagination on every list; a version in every request; a deprecation policy that says how long an old version keeps working.
- Webhooks with retries and a signed payload, plus a poll endpoint that returns the same events.
- Errors carry a machine-readable reason and a human sentence, and never an internal detail.

## Non-functional requirements

| Kind        | Requirement                                    | Target            |
| ----------- | ---------------------------------------------- | ----------------- |
| latency     | A status read answers quickly                  | p99 ≤ 500 ms      |
| consistency | A status change reaches a partner's webhook    | within one minute |
| security    | A partner reads and writes only its own orders |                   |

## Scale targets

| Metric                 | Target                               |
| ---------------------- | ------------------------------------ |
| Partner requests, peak | 1,200 per second, most of them polls |

## Decisions to make

- Webhooks, or an event feed partners pull — and what each costs in delivery guarantees and partner effort.
- The version in the path or in a header, and how two versions share one data model.
- Strict validation that refuses a sloppy partner, or lenient parsing that accepts and warns — and who pays when the data is wrong.

## Constraints

- A partner cannot be made to upgrade for a year after a version is deprecated.
- One order may never be created twice, whatever a partner's client does.
