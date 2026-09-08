# Prompt — Move money between accounts and keep the ledger balanced

**Archetype:** payments-ledger · **Difficulty:** hard

## Scenario

A marketplace holds money on behalf of buyers, sellers and itself. A buyer's card payment lands in the platform's account, is held while the order is open, and is released to the seller when the order completes, minus a commission. Sellers withdraw their balance to a bank account through a payment provider that answers asynchronously and sometimes answers twice. The finance team receives a settlement file from the bank each morning listing what actually moved, and every line of it must be matched against what the platform believes moved. Buyers occasionally charge back a payment weeks later, which must reverse a transfer whose money has already been withdrawn. Design the service that records these movements and answers what any account is worth.

## Functional requirements

1. Every movement of money is recorded as a double-entry posting, and the sum of all postings for any transaction is zero.
2. A buyer's payment, a commission and a seller payout are three separate movements against the same order, each independently queryable.
3. Submitting the same transfer twice, from a retry or a duplicated provider callback, moves the money once.
4. A seller's available balance excludes funds still held against open orders, and is answerable at any instant.
5. Each line of the morning settlement file is matched to a recorded movement, and anything unmatched in either direction is surfaced for a human.
6. A chargeback reverses a completed transfer by posting compensating entries, never by deleting or editing the original.

## Non-functional requirements

| Kind         | Requirement                                             | Target                     |
| ------------ | ------------------------------------------------------- | -------------------------- |
| correctness  | The ledger balances after every committed transaction   | zero unbalanced postings   |
| consistency  | A balance read after a posting reflects that posting    | read-your-write on balance |
| latency      | A transfer is accepted or refused promptly              | p99 ≤ 400 ms               |
| availability | Payments keep being accepted while the provider is down | 99.95% for writes          |
| durability   | Postings are kept for audit and dispute                 | retained 7 years           |
| security     | No account holder can read or move another's money      | zero cross-account access  |

## Scale targets

| Metric           | Target  |
| ---------------- | ------- |
| Accounts         | 500,000 |
| Transfers/sec    | 300     |
| Peak transfers/s | 3,000   |
| Read:write       | 70:30   |
| p99 latency      | 400 ms  |
| Availability     | 99.95   |
| Data retention   | 7 years |

## Constraints

- The payment provider's callbacks arrive out of order, may repeat, and occasionally never arrive at all; its API is the only way to learn a withdrawal's real outcome.
- Money amounts are integer minor units in one of eleven currencies, and no transaction may mix currencies without an explicit recorded conversion.
