# Mission

Report the newest three threads of the last week: who wrote them and what they are about. Read only; write nothing, draft nothing, change no label.

## Procedure

1. Search the threads of the last week with the query `newer_than:7d`, asking for three at most.
2. Read nothing further: the search's own lines say who wrote each thread and what it is about.
3. Finish with `mission-complete`, saying in the detail which three threads were found and what each is about.

## Stop conditions

- mission-complete (complete): the newest threads of the last week are listed.
- mailbox-unreachable (stopped): the search failed twice in a row.

## Never do

- Never create a draft.
- Never put a label on anything or take one off.
