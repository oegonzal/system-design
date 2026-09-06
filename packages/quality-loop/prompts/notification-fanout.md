# Prompt — Fan out account notifications to email, push and in-app without double-sending

**Archetype:** notification-fanout · **Difficulty:** standard

## Scenario

A subscription app emits account events — a payment failed, an invoice is ready, a sign-in happened from a new device. Every event must reach each channel the user has enabled (email, mobile push, in-app inbox) exactly once, respect the user's quiet hours in their own time zone, and land in an in-app inbox that remembers what was read. Security events must go out immediately even during quiet hours. Product managers edit the message templates themselves. Design the service that turns an account event into the right deliveries.

## Functional requirements

1. A user chooses, per channel, which event categories they want; a disabled channel receives nothing.
2. Deliveries due during a user's quiet hours are held and sent when the window ends, in the user's time zone.
3. Security events bypass quiet hours and go to every enabled channel at once.
4. The in-app inbox lists a user's notifications newest first with an unread count, and marking one read is reflected on every device.
5. For every event, the user's support history shows each channel's delivery status: queued, sent, failed, or suppressed with the reason.

## Non-functional requirements

| Kind         | Requirement                                               | Target                      |
| ------------ | --------------------------------------------------------- | --------------------------- |
| latency      | An event outside quiet hours reaches the provider quickly | p99 ≤ 5 s event → hand-off  |
| availability | The inbox stays readable through a provider outage        | 99.95% for reads            |
| consistency  | No user receives the same notification twice on a channel | zero duplicate sends        |
| durability   | A provider outage loses nothing                           | 24 h of buffered deliveries |
| security     | A user only ever reads their own inbox                    | zero cross-user reads       |
| durability   | The inbox history is kept                                 | retained 90 days            |

## Scale targets

| Metric           | Target     |
| ---------------- | ---------- |
| Concurrent users | 20,000     |
| Events/sec       | 1,200 peak |
| Read:write       | 80:20      |
| p99 latency      | 5 s        |
| Availability     | 99.95      |
| Data retention   | 90 days    |

## Constraints

- The email and push providers fail intermittently and rate-limit per tenant; retries are the normal case, not the exception.
- Templates are edited by non-engineers and must not require a deploy to change.
