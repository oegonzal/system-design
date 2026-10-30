# Memory for a form-filling assistant that acts for one person

**Archetype:** agentic-memory · **Difficulty:** medium

## Scenario

An assistant fills application forms on web sites on behalf of one person, one unit of work (one
employer's posting) at a time, over many sessions. A judged answerer reads the form's fields and the
evidence recalled about the person, fills what the evidence supports and asks a human operator the
rest. The operator's answers must be kept so the same question is not asked twice, and the person's
own record (a résumé, notes, standing answers) must be the ground every filled value rests on.

## What the memory must do

- Hold the person's facts, the stories they can tell whole, and the bounds on what they may claim,
  as distinct kinds of evidence a judge can tell apart.
- Hold the operator's answers to the questions forms asked, each tied to the question as the form
  worded it, with who answered on which channel, so a re-answer supersedes and an answer given for
  one unit of work stays within it.
- Recall by meaning for a field's question, with the newest answer to the same question first, and
  never surface a memory of another person or another unit of work.
- Let the person retract a wrong memory and read the history of what replaced what.
- Keep documents and answers apart from any other agent's memories of the same person, while facts of
  the person remain visible to every agent acting for them.

## Constraints

- One relational source of truth with a derived, rebuildable vector projection.
- Nothing is deleted: a changed value supersedes the old one, a wrong one is invalidated, history stays.
- Every write carries its provenance; a judge is shown it beside the value.
