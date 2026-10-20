# Turn carrier scan events into one live parcel timeline

**Archetype:** parcel-tracking · **Difficulty:** standard

## Scenario

An online retailer ships through four delivery carriers. Three of them push scan events over webhooks as a parcel moves; the fourth publishes an hourly CSV export of everything it scanned. Shoppers open a tracking page from a signed link in their shipping email and expect one timeline per parcel — label created, in transit, out for delivery, delivered — with an estimated delivery time, regardless of carrier. The operations team wants an exceptions view listing every parcel with no scan for 48 hours so they can chase the carrier before the shopper complains. Design the service that produces the timeline, the estimate and the exceptions view.

## Functional requirements

1. A shopper who follows a signed tracking link sees one timeline for that parcel, newest scan first, with the carrier's own event text preserved.
2. The estimated delivery time is recomputed on every new scan and shown beside the latest status.
3. Scans from the webhook carriers appear on the timeline within one minute; scans from the CSV carrier appear within an hour of the export.
4. The exceptions view lists every parcel whose last scan is older than 48 hours and is not yet delivered.
5. After a carrier outage, a replay of the missed events reconstructs each timeline without duplicating scans that already arrived.

## Non-functional requirements

| Kind         | Requirement                                                  | Target                  |
| ------------ | ------------------------------------------------------------ | ----------------------- |
| latency      | The tracking page loads fast under everyday traffic          | p99 ≤ 250 ms            |
| availability | The tracking page stays up through a carrier outage          | 99.9% for reads         |
| consistency  | Webhook carriers reach the timeline quickly                  | freshness ≤ 60 s        |
| consistency  | The CSV carrier reaches the timeline within its export cycle | freshness ≤ 3,600 s     |
| security     | A link never reveals a parcel other than its own             | zero cross-parcel reads |
| durability   | Timelines are kept for returns and disputes                  | retained 2 years        |

## Scale targets

| Metric           | Target  |
| ---------------- | ------- |
| Concurrent users | 5,000   |
| Requests/sec     | 400     |
| Read:write       | 95:5    |
| Data retention   | 2 years |

## Constraints

- Carriers send duplicate scans and deliver events out of order; a "delivered" scan can arrive before the "out for delivery" one.
- Each carrier's API is rate-limited to 10 requests per second per key, and the CSV export can only be fetched whole.
