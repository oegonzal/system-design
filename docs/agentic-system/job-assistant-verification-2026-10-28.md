# The job assistant on the memory runtime: what the offline verification found

_As of 28 Oct 2026, 09:10 UTC._ This page reports plan Step 6 of the move of the job assistant's memory onto the
agentic-memory runtime: an offline replay of recorded form pages against a memory space seeded for a verification
tenant, with no live session involved. The live flow ran on the loop's own memory (`brain: loop`) until the go-live
of 30 Oct 2026 (plan step 7); this page records the state before it.

## What was set up

- **The space.** The strategy at [`strategies/job-assistant/strategy.json`](strategies/job-assistant/strategy.json)
  (four semantic registers: `profile_fact`, `profile_story`, `claim_boundary`, `standing_answer`) was judged once by
  the loop as run `2026-10-27T23-52-55-161-d2f2e4-quality` and bound by name as `job-assistant`. The compile report
  shows no problems and no warnings; the space declares the scope keys `tenant`, `project`, `user`, `unit`.
- **The verification tenant `verify-20261028`.** Seeded on 28 Oct 2026 between 00:09 and 06:49 UTC with:
  - the résumé (8 chunks), the standing-answers notes (14 chunks) and the studio export (4 chunks), each chunk one
    judged digest applied once: 179 facts, 32 stories, 15 claim boundaries;
  - 96 recorded operator answers taught again through the memory brain as deterministic facts (98 answers found in
    16 session dumps; 2 refused because the value exceeded the 1,000-character ceiling, both long free-text stories).
    A second teach pass left all 96 unchanged and refused the same 2, so teaching is idempotent.
- **The replay.** `browser-session replay-fields` over every recorded session dump, with a judged sample and a
  retraction check: 577 fields over 182 of 219 recorded pages. Of the 37 pages not replayed, 35 hold only field
  shapes recorded before 8 Oct 2026 that the current reader refuses, and 2 recorded no run.

## The acceptance table

| Measure (plan Step 6)                                        | Bar                                 | Result                                                                    | Verdict                |
| ------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| Unit leak: an item recalled under another unit of work       | 0                                   | 0 over 182 pages                                                          | met                    |
| Tenant leak: an item from another tenant                     | 0                                   | 0                                                                         | met                    |
| Teach idempotency: second pass all unchanged                 | 100 %                               | 96 of 96 unchanged, 2 refused both times                                  | met                    |
| Retraction: an invalidated record never recalled again       | 0 recalled after                    | 20 closed, 0 recalled after, 20 shown closed by their history             | met                    |
| Recall latency per page                                      | p90 at or under the recorded p90    | p50 410 ms, p90 939 ms (recorded p50 885 ms, p90 1,461 ms)                | met                    |
| Judged sample: filled at least as often, asked no more often | filled ≥ recorded, asked ≤ recorded | 36 pages judged: filled 163 vs 109 recorded, asked 84 vs 138 recorded     | met                    |
| Judged sample: typed values differing from the operator's    | 0                                   | 8 strict mismatches, broken down below                                    | **read the breakdown** |
| Cited evidence found again                                   | ≥ 95 %                              | 29 of 436 (6.7 %): 16 by identity, 16 by contained words, 0 word-for-word | **measure not valid**  |

## The two rows that need reading

**The eight mismatches.** The replay types a value through the shipped judge and holds it to the operator's recorded
answer where one exists; "wrong" is a strict text inequality. Of the eight:

- six are equivalent or formatting differences: "Immediately" against "ASAP"; the street address with proper casing
  and the country added; a trailing period; two long free-text answers that say the same experience in other words;
- one is more accurate than the operator's answer: to "Do you reside in CST or EST?" the operator had typed "Yes", the
  memory brain typed "No", which is true for a Long Beach, California address;
- one is a real miss: a marketing e-mail opt-in that the operator declined was typed as "Yes". The recorded run had
  typed "Yes" too, and the operator's "No" was never taught (it reached the session on a channel the settings keep
  untaught), so neither memory held the preference.

**Why "cited evidence found again" is not the right measure.** The recorded runs cited texts the loop's digest wrote
in its own words; the space holds texts another digest wrote from the same documents. Two paraphrases of one fact
never match word for word, so this measure can only find taught answers (by their question's identity) or facts
whose wording happens to be contained. The judged sample is the parity measure that holds: the memory brain filled
more and asked less on the same pages.

## What the judged sample also shows

Verdicts over the 36 judged pages: 87 fields filled the same, 68 filled now that were asked before, 62 asked the same,
22 asked now that were filled before, 8 mismatches.

The 22 "asked now" fields are worth a look before a live run: they are mostly yes-or-no experience questions, the
salary expectation, the state of residence, work eligibility and the demographic questions, each recalled with
evidence (13 to 24 items on the page) and judged admitted, yet routed to the operator; in 13 of them a critic withheld
one location. A live session would ask the operator these once and teach the answers, after which the standing
answer carries them; whether that is acceptable for the first supervised session is the owner's call.

## What is not covered by this verification

- No page was shown to a browser: the replay proves retrieval, isolation, idempotency, retraction, latency and the
  judge's verdicts on recorded pages, not the page effects of typing.
- The judged sample is 36 pages, drawn evenly across the dumps, not the whole record.
- The subscription's session limit interrupted the first seeding attempt (16 digests ended "no-rubric" because every
  model call was refused); those chunks were posted again after the reset and the empty digests were retracted.

## How to reproduce

From a checkout whose `packages/browser-session/config/engine.json` names `"brain": "memory"` (the worktree used
here; the shipped file named `loop` until 30 Oct 2026), with the env names `MEMORY_TENANT`, `AGENTIC_SYSTEM_URL` set:

```
pnpm browser-session teach-again --sessions static/sessions --tenant verify-20261028 --subject "<name>"
pnpm browser-session replay-fields --sessions static/sessions --tenant verify-20261028 --judge --sample 40 --retract 20 --out <dir>
```

The rows and report of the run above are kept outside the repository (the session's scratch directory,
`replays/2026-10-28T09-00-48-196-6727e0/`).

## What is left, in order

1. **Commit** the landed change (it sits uncommitted in the shared checkout; a peer session waits on it).
2. **Step 7, the owner's call:** seed the live tenant the same way (documents through the space sink, answers through
   `teach-again`), set `"brain": "memory"` in the shipped `engine.json`, and run one supervised session; the rollback
   is the one-word edit back.
3. **Step 8, after Step 7:** the cutover deletion of the loop's form and document memory paths, as the plan lists.
4. Five items deferred to a later shared window: a declared width for the teaching reference; a route to free a space
   name; a named form-memory recall step; the document-digest memory shape exported from contracts; a measured
   similarity floor for the semantic recall route.
