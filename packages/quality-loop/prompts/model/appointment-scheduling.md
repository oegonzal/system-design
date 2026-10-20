# Schedule appointments across time zones without double booking

**Archetype:** scheduling · **Difficulty:** standard

## Scenario

You own scheduling for clinics in several countries. Practitioners work rotating shifts with exceptions; sites keep different holidays and switch daylight-saving time on different dates; patients book in their own time zone and reschedule often; a cancellation should fill from a waitlist. Practitioners' external calendars are the truth about their absences. Design the model and the service that books without ever double booking.

## Functional requirements

1. Show a patient the available slots of a practitioner or a site, in the patient's time zone.
2. Book a slot, reschedule it and cancel it, telling everyone affected.
3. Define a practitioner's recurring availability with exceptions, and a site's hours and holidays.
4. Fill a cancelled slot from a waitlist in a fair order.
5. Keep practitioners' external calendars and the schedule in agreement.

## Domain and data

- Practitioner, site, availability rule, exception, slot and booking are distinct records; an availability rule produces slots, it is not one.
- A booking stores the instant it happens at and the time zone it was booked in, and never only a local wall-clock time.
- No two bookings may overlap for one practitioner, whatever two patients do at the same moment.

## Interfaces

- Availability is read by a contract that takes the viewer's time zone and returns instants, so the client never does the arithmetic.
- Booking, rescheduling and cancelling are commands keyed by slot and patient, so a retried command repeats nothing.
- External calendars are synchronised through a contract that says which side wins when both changed.

## Non-functional requirements

| Kind        | Requirement                                           | Target       |
| ----------- | ----------------------------------------------------- | ------------ |
| consistency | No double booking under concurrent requests           | zero         |
| latency     | An availability query answers while the patient waits | p99 ≤ 800 ms |
| security    | A patient sees only their own bookings                |              |

## Decisions to make

- Materialise slots from the rules ahead of time, or compute them on demand — and what each costs when a rule changes.
- Book with a lock on the slot, or optimistically and resolve the conflict — and what the loser sees.
- Where the daylight-saving rules live, and what happens to a booking made before a rule changed.

## Constraints

- A site's hours are defined in local time by its manager, who knows nothing of instants.
- A practitioner's external calendar is authoritative for their absences; the schedule follows it.
