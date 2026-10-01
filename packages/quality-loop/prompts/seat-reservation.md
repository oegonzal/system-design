# Hold and sell seats without ever overselling

**Archetype:** inventory-contention · **Difficulty:** standard

## Scenario

A ticketing platform sells numbered seats for concerts. When a popular show goes on sale, tens of thousands of people arrive in the same second and compete for the same few thousand seats. A buyer picks seats from a map, which places a hold while they enter payment details, and the hold expires if they take too long so the seats return to the pool. Payment is taken by an external provider that occasionally takes twenty seconds to answer and sometimes answers after the hold would have expired. The promoter releases extra blocks of seats mid-sale, and a seat sold twice is a legal problem, not merely a support ticket. Design the service that holds, releases and sells the seats.

## Functional requirements

1. A buyer selecting seats receives an exclusive hold on exactly those seats, or a clear refusal naming which are gone.
2. A hold expires after a fixed window and the seats become available to others without manual intervention.
3. Payment authorised before expiry converts the hold to a sale; payment authorised after expiry must not sell a seat someone else now holds.
4. The seat map a buyer sees reflects holds and sales quickly enough that most selections succeed.
5. A promoter releasing an additional block makes those seats holdable without interrupting the sale in progress.
6. Every seat has at most one sale, provable after the fact from the record.

## Non-functional requirements

| Kind         | Requirement                                             | Target                  |
| ------------ | ------------------------------------------------------- | ----------------------- |
| correctness  | No seat is ever sold twice                              | zero double sales       |
| latency      | A hold attempt answers while the buyer is still looking | p99 ≤ 500 ms            |
| availability | The sale survives the loss of an application node       | 99.95% during on-sale   |
| consistency  | The seat map reflects a hold quickly                    | freshness ≤ 2 s         |
| durability   | Sales and their payment references are kept             | retained 3 years        |
| security     | A buyer cannot hold or release another buyer's seats    | zero cross-buyer action |

## Scale targets

| Metric            | Target    |
| ----------------- | --------- |
| Seats per show    | 60,000    |
| On-sale arrivals  | 80,000    |
| Hold attempts/sec | 12,000    |
| Hold window       | 8 minutes |
| Read:write        | 85:15     |
| p99 latency       | 500 ms    |
| Availability      | 99.95     |

## Constraints

- Demand is bursty and entirely predictable in timing: an on-sale is a scheduled event, and the system is nearly idle between them.
- The payment provider's authorisation is the only source of truth for whether money was taken, and it cannot be asked to cancel synchronously.
