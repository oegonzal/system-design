# Take a firehose of metrics and answer dashboard queries over it

**Archetype:** time-series-store · **Difficulty:** hard

## Scenario

An infrastructure team runs an agent on every host and container in its estate. Each agent pushes numeric samples every ten seconds, tagged with host, service, environment, region and whatever labels the owning team invented that week. Engineers open dashboards that draw a dozen charts at once, each asking for an aggregate over a window that may be the last fifteen minutes or the last quarter. A deploy that adds a request-id label to a metric can multiply the number of distinct series by a thousand overnight and has twice filled the disks. Older data is queried far less than recent data but must remain answerable for capacity planning, and the storage bill is now larger than the compute bill it measures. Design the service that accepts the samples and answers the queries.

## Functional requirements

1. An agent's batch of samples is accepted and becomes queryable within the freshness target.
2. A dashboard query asks for one aggregate over one metric, filtered by labels, bucketed into intervals across a window.
3. Samples arriving late, out of order, or duplicated land in the correct bucket without double-counting.
4. Data older than the raw retention window is still answerable at a coarser resolution rather than lost.
5. A metric whose label cardinality explodes is contained without dropping the rest of the estate's data.
6. An engineer can list which metrics and label keys exist before writing a query.

## Non-functional requirements

| Kind         | Requirement                                                    | Target                 |
| ------------ | -------------------------------------------------------------- | ---------------------- |
| latency      | A dashboard of twelve charts feels immediate                   | p95 ≤ 800 ms           |
| consistency  | A pushed sample becomes queryable quickly                      | freshness ≤ 30 s       |
| availability | Ingest keeps accepting while queries are degraded              | 99.9% for writes       |
| durability   | Recent data survives the loss of a storage node                | zero loss within 24 h  |
| cost         | Storage grows sub-linearly with retention                      | ≤ 2x raw for 13 months |
| correctness  | An aggregate over a window is stable once the window is closed | no drift after 5 min   |

## Scale targets

| Metric              | Target     |
| ------------------- | ---------- |
| Active series       | 20,000,000 |
| Samples/sec         | 4,000,000  |
| Dashboard queries/s | 400        |
| Raw retention       | 15 days    |
| Rolled-up retention | 13 months  |

## Constraints

- Agents cannot be upgraded in step with the service and will keep sending the current wire format for at least a year.
- A query may legitimately touch a year of data, and the team will not accept a hard refusal for expensive queries — only a slower answer or a coarser one.
