# Decide in under a millisecond whether a call is over its quota

**Archetype:** quota-enforcement · **Difficulty:** standard

## Scenario

A public API sits behind a fleet of gateway processes in three regions. Every customer holds a plan that grants a number of requests per minute and a smaller number of expensive search calls per hour, and a customer who exceeds either must be refused with a header telling them when to retry. A handful of customers send two orders of magnitude more traffic than everyone else, and their keys land on whichever gateway process the load balancer picked. The product team changes plan limits from an admin screen and expects the new limit to take effect without a deploy. When the store that holds the counters is unreachable, the gateway must still decide something, and the business would rather serve a few free requests than refuse paying customers. Design the service that makes the allow-or-refuse decision.

## Functional requirements

1. A gateway process decides allow or refuse for a request key before the request is forwarded, and returns the remaining allowance with the decision.
2. Two limits apply to the same key at once — requests per minute and expensive calls per hour — and either can refuse.
3. A refused caller receives the time at which its allowance next permits a request.
4. A plan limit changed in the admin screen applies to new decisions within a minute, with no restart.
5. Allowances are enforced across all gateway processes in all regions, not per process.

## Non-functional requirements

| Kind         | Requirement                                              | Target                  |
| ------------ | -------------------------------------------------------- | ----------------------- |
| latency      | The decision is invisible inside the request path        | p99 ≤ 1 ms              |
| availability | Decisions continue while the counter store is degraded   | 99.99% for decisions    |
| correctness  | A customer is not refused below its granted allowance    | zero false refusals     |
| consistency  | Allowance spent in one region is visible in the others   | convergence ≤ 2 s       |
| security     | One customer cannot observe or spend another's allowance | zero cross-tenant reads |
| cost         | Enforcement is cheap relative to the call it guards      | ≤ 5% of request cost    |

## Scale targets

| Metric            | Target    |
| ----------------- | --------- |
| Customers         | 40,000    |
| Decisions/sec     | 250,000   |
| Hottest key share | 8% of all |
| Gateway processes | 600       |
| Regions           | 3         |
| p99 latency       | 1 ms      |
| Availability      | 99.99     |

## Constraints

- Over-counting is worse than under-counting: refusing a paying customer inside its allowance is a support ticket, while a small overshoot during a partition is acceptable.
- The gateway processes are stateless and are replaced continuously by the deployment system, so nothing may rely on a process outliving a minute.
