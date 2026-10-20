# Replace a legacy inventory system without stopping the warehouse

**Archetype:** strangler-migration · **Difficulty:** hard

## Scenario

You own the replacement of a fifteen-year-old inventory system. Pickers in six warehouses use scanners that speak its protocol; the storefront learns stock levels from a nightly batch it exports; its database schema cannot change. The replacement must go live one site at a time, be reversible within an hour at any site, and never lose or double-count a movement. Design the migration and the system that ends up running.

## Functional requirements

1. Both systems run while the migration lasts; a movement recorded in either is visible in both.
2. One site cuts over to the new system and can be cut back, without the other sites noticing.
3. Counts are reconciled daily per site, and every difference is explained or raised.
4. Scanners keep working through every phase, on their existing protocol.
5. The storefront keeps learning stock levels, and learns them sooner once a site is cut over.

## Domain and data

- A stock movement is counted exactly once, whichever system first recorded it.
- Each site has one system of record for its stock at any moment, and the migration changes which.
- Lots and locations keep their identities across both systems so a reconciliation can join them.

## Interfaces

- An adapter faces the scanners with the legacy protocol and translates it to the new system's commands.
- A change feed replaces the nightly export for the storefront once a site is cut over; the export keeps running for the sites that are not.
- The reconciliation report is a contract of its own: per site, per lot, the two counts and the difference.

## Non-functional requirements

| Kind         | Requirement                                             | Target              |
| ------------ | ------------------------------------------------------- | ------------------- |
| durability   | No movement is lost or counted twice across the cutover | zero                |
| availability | A site's cutover is reversible                          | within one hour     |
| consistency  | A cut-over site's stock reaches the storefront          | within five minutes |

## Decisions to make

- Strangle by site or by capability, and what each costs when a lot moves between a migrated site and one that is not.
- Backfill the legacy history into the new system, or start each site fresh and keep the old system for history.
- Which system is the master for a site during each phase, and how the adapter knows.

## Constraints

- The legacy database schema cannot change.
- The warehouses run twenty-four hours a day, six days a week; the seventh is maintenance.
