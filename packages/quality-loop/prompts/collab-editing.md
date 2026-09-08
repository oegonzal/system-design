# Prompt — Keep one document consistent while many people type into it

**Archetype:** realtime-collaboration · **Difficulty:** hard

## Scenario

A product team writes specifications together in a browser editor. Several people commonly have the same document open, typing in different paragraphs, and occasionally in the same sentence. Each editor shows where the others' cursors are and who is present. Someone on a train loses connectivity, keeps typing for ten minutes, and reconnects expecting their work to survive and to merge with whatever the others did meanwhile. A document accumulates months of edits and someone eventually asks to see what it looked like before a particular meeting, or to restore that version. Two editors typing into the same sentence must both end up looking at the same text, and neither may silently lose a character. Design the service that keeps the editors in agreement.

## Functional requirements

1. An edit made by one editor appears in the others' views within the propagation target.
2. Two editors changing the same paragraph simultaneously converge on one text that contains both intentions, with no lost character and no duplicated one.
3. An editor who works offline and reconnects has their edits merged rather than discarded or forced to overwrite.
4. Each editor sees who else is present and roughly where their cursor is.
5. Any past state of the document can be retrieved, and any past state can be made current.
6. A document with a year of edit history opens as quickly as a new one.

## Non-functional requirements

| Kind         | Requirement                                              | Target                   |
| ------------ | -------------------------------------------------------- | ------------------------ |
| latency      | A local keystroke is never blocked on the server         | p99 ≤ 16 ms local echo   |
| consistency  | Every editor of a document converges on the same text    | convergence ≤ 250 ms     |
| durability   | An acknowledged edit survives a server restart           | zero acknowledged loss   |
| availability | Editing continues while the presence channel is degraded | 99.9% for edit sessions  |
| security     | Only invited collaborators read or edit a document       | zero unauthorised access |
| correctness  | Reconnecting after an outage never silently drops work   | zero dropped offline ops |

## Scale targets

| Metric               | Target    |
| -------------------- | --------- |
| Documents            | 2,000,000 |
| Concurrent editors   | 30,000    |
| Editors per document | up to 40  |
| Operations/sec       | 20,000    |
| Read:write           | 60:40     |
| p99 convergence      | 250 ms    |
| Data retention       | forever   |

## Constraints

- Clients are browsers on unreliable networks; a connection may drop mid-operation and reconnect to a different server.
- Server-side merge must not require holding every document in memory, because most of the two million are idle at any moment.
