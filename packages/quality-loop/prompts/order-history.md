# Prompt — Unify online and in-store orders behind one history

**Archetype:** order-history-integration · **Difficulty:** standard

## Scenario

A retail brand sells online through a hosted storefront platform and in stores through a separate point-of-sale system. Online orders live in the storefront platform, which exposes a GraphQL admin API and sends webhooks when an order changes. In-store sales live in the point-of-sale vendor's system, which only answers REST calls and sends nothing. Shoppers sign in to the storefront's account area and expect one Order History list that shows both kinds of orders, newest first, with status and line items. Design the service that produces that list.

## Functional requirements

1. A signed-in shopper sees one Order History list inside the storefront account area.
2. Online orders and in-store sales appear in that one list, newest first, each with status, date, total and line items.
3. A new online order appears in the list within one minute of being placed.
4. A new in-store sale appears in the list within five minutes of the sale.
5. A signed-in shopper sees only their own orders; a guest sees none and is refused before any lookup.

## Non-functional requirements

| Kind         | Requirement                                             | Target                    |
| ------------ | ------------------------------------------------------- | ------------------------- |
| latency      | The history page loads fast under everyday traffic      | p99 ≤ 300 ms              |
| availability | The read path stays up through a vendor outage          | 99.9% for reads           |
| consistency  | Online orders reach the list quickly                    | freshness ≤ 60 s          |
| consistency  | In-store sales reach the list within the polling budget | freshness ≤ 300 s         |
| security     | No shopper can ever read another shopper's orders       | zero cross-customer reads |
| durability   | The full order history is retained                      | retained indefinitely     |

## Scale targets

| Metric           | Target  |
| ---------------- | ------- |
| Concurrent users | 2,000   |
| Requests/sec     | 150     |
| Read:write       | 98:2    |
| p99 latency      | 300 ms  |
| Availability     | 99.9    |
| Data retention   | forever |
