# Carry a subscription through its whole life

**Archetype:** billing-lifecycle · **Difficulty:** hard

## Scenario

You own billing for a product sold as plans with seats and metered add-ons. Customers upgrade and downgrade mid-cycle and expect fair proration; a card that fails enters dunning rather than ending the service; a cancellation takes effect at the end of the paid period; an invoice, once issued, never changes — a correction is a credit note. One payment provider moves the money and tells you what happened by webhook, out of order and sometimes twice. Design the lifecycle and the service that runs it.

## Functional requirements

1. Start a subscription on a plan, change its plan or seats mid-cycle with proration, and cancel it effective at period end.
2. Issue an invoice at each period boundary from the subscription's history, and a credit note for any correction.
3. Retry a failed payment on a dunning schedule, telling the customer at each step, and end the service only when the schedule ends.
4. Meter add-on usage during a period and bill it in arrears on the next invoice.
5. Show the customer every invoice, payment attempt and credit note, newest first.

## Domain and data

- Customer, subscription, plan version, invoice, invoice line, payment attempt and credit note are distinct records; a plan change creates a new plan version rather than editing the old.
- An issued invoice is immutable; its total is reproducible from the subscription's history at issue time.
- A subscription moves through declared states — trialing, active, past due, cancelled, ended — and the state decides what the next period boundary does.

## Interfaces

- Provider webhooks arrive out of order and duplicated; each is applied exactly once and in the order of the events they describe.
- The customer-facing invoice API is paginated and versioned, so a billing portal built on it keeps working.
- Plan and seat changes are commands keyed by subscription and effective date, so a retry repeats nothing.

## Non-functional requirements

| Kind        | Requirement                                                        | Target |
| ----------- | ------------------------------------------------------------------ | ------ |
| durability  | No customer is charged twice for one period                        | zero   |
| consistency | An invoice total is reproducible from the history behind it        |        |
| security    | Card details never reach the system; only the provider's tokens do |        |

## Decisions to make

- Computed balances from the history, or stored balances updated as events arrive — and what each costs when a webhook arrives late.
- Bill metered usage in advance from an estimate, or in arrears from the meter — and who bears the surprise.
- Dunning as a scheduler that fires retries, or as a state machine that the next event advances.

## Constraints

- One external payment provider moves all money; its webhooks are the only word on whether a charge succeeded.
- Tax rates come from a vendor service with a rate limit; an invoice may not be issued with a stale rate.
