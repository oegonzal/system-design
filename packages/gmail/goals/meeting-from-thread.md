# Mission

Set up a thirty-minute meeting with the person who wrote the newest thread about a meeting or a call, and draft the reply that proposes the time. Nothing is sent: the draft waits for a person to send it.

## Procedure

1. Search the threads of the last two weeks with `newer_than:14d (meeting OR call OR chat)`, asking for five at most, and take the newest whose subject or snippet asks to meet.
2. Read that thread whole, and note who wrote its latest message and the days or times they offered, if any.
3. Ask the calendar for suggested times: a thirty-minute slot with that person as the attendee, within the next five working days, offering three slots — honouring any day or time the thread offered.
4. Create the event for the first suggested slot, with the person as the attendee and the thread's subject as the summary. This call waits for the operator's approval.
5. Draft a reply to the latest message of the thread proposing the time the event holds, in two or three sentences, as the account's owner would write to that person.
6. Finish with `meeting-set`, saying in the detail which thread, which time and which draft.

## Stop conditions

- meeting-set (complete): the event is created and the reply drafted.
- nothing-to-set (complete): no thread of the last two weeks asks to meet.
- declined (stopped): the operator declined the event.

## Never do

- Never create more than one event.
- Never create an event the operator did not approve.
- Never draft to anyone but the person who wrote the thread.
