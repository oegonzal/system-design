```text
goal (the prompt .md)
  │
  ▼
deriveCriteria ──── consumes: goal
  │  produces 20 criteria (capability / contract / property / constraint)
  ▼
producer ────────── consumes: goal                        ← declared []
  │  never sees the criteria; on revise it gets remediations instead
  ▼
validators ──────── consume: artifact
  │  deterministic; a blocking failure ends the iteration here
  ▼
critics ×4 ──────── consume: goal + criteria + artifact + validation    (wave 1, in parallel)
  │  produce raw findings, 2 samples each
  ▼
normalize ───────── deterministic
  │  groups findings into defects, keeps only what two samples agreed on
  ▼
evaluators ×3 ───── consume: everything above + CONFIRMED defects      ← declared ['findings']  (wave 2)
  │  each defect arrives with the critic's one sentence; the evaluator
  │  is told "a criterion one of these names is at most partial unless
  │  you show the defect does not touch it"
  ▼
normalize ───────── deterministic, over both waves
  ▼
controller ──────── consumes: the ledger only — ids, enums, counts; no prose
  │  scores, gates, decision
  ▼
store ───────────── trace + lessons
```

The two rules that make it hang together:

- A persona declares, the engine schedules. consumes: [] means "I run in wave 1, from the artifact alone." consumes: ['findings'] means "run me after wave 1 and show me what it confirmed." The same declaration decides both when a lens runs and what it's shown — one source of truth, no special cases in the engine.
- The normaliser is the boundary between waves. A wave-2 lens never sees a raw report. It sees only what independent samples agreed on — so the system decides what counts as evidence before a model gets to weigh it, exactly as it already did before the controller.

What that changed in practice: the verification run passed 6 criteria and marked 14 partial, where the same prompt under the flat fan-out passed 20 of 20. The evaluator that had passed determinism was now shown the confirmed contradiction against the same mechanism, and didn't.

Pipelines such as agentic-design, design-prompt and field-answer put their evaluators in the second wave with `consumes: ['findings']`, so the evaluator measures with the critics' confirmed defects before it. The three digest pipelines, memory-recall, system-design, browser-step, tool-step and — since 2.4.0 (2026-11-10) — system-design-canvas declare `consumes: []` on every lens, so their critics and evaluators judge the artifact side by side. browser-step, tool-step and system-design-canvas must: under `corroboration: 'cited'` a finding vetoes only when the evaluator independently failed a gating criterion it cites, and boot refuses an evaluator of a gating kind that would read the findings first (`checkCorroboration`). Shown them, browser-step's evaluator echoed the safety critic's invented stops in up to 41% of runs; beside the critics it bore out none in 92.

Yes — one LLM call per run, before any iteration, with the model boxed in on every side.

What it's shown

- the pipeline's derive-criteria.md persona (for agentic-design: "a principal engineer reading a brief before a panel grades answers to it")
- the pipeline's criterion kinds with their one-line meanings — capability, contract, property, constraint
- the goal, verbatim

What it may answer
A schema-locked list of { kind, statement }: kind is an enum of exactly those four, statement is one checkable sentence in the goal's own words, at most maxCriteria (20). The engine's rule: "Extract the criteria the goal states or clearly implies. Never invent a requirement the goal does not support; never merge two distinct ones."

What the engine owns

- Ids. c1…cN are assigned positionally after the fact. The model never authors an identifier, so the policy can price a kind without trusting a name.
- The cap. Anything past maxCriteria is sliced off.
- Failure. A derivation the model fails → `llm-failed` diagnostic and no criteria, which the controller then escalates as "no criteria to judge against" rather than inventing a score. Same for a schema miss. There is no disabled model to fall through to: a process without a provider never boots.

Why this is the right split. The model does the one thing only a model can — read prose and say what it demands. Everything that matters downstream is deterministic: the kinds it may choose from are the pipeline's declaration, the ids are the engine's, and the count is capped. That's why the re-templated prompts landed so cleanly — each section maps onto one kind, so the deriver's job became classification rather than interpretation (cycle 1: 124 / 56 / 56 / 43, zero old-vocabulary kinds, stable across all 14 runs).

One consequence worth knowing: the criteria are derived once per run, not per iteration. A revised artifact is judged against the same contract the first draft was — which is what makes iterations comparable.

Honest answer requires separating three questions, and I can answer two of them from the dumps without any model calls. Mechanically it worked, and it moved the numbers — but "moved" isn't "judged better." The tests that distinguish those: did evaluators demote only criteria the critics named (evidence use) or everything (blanket harshness)? And on the criteria they kept passing despite a named defect, did they argue, or just comply? Privately, one read over the four scored runs and their cycle-1 twins covers all of it.

Ran 1 shell command

Yes — and the four checks below are the ones that separate "it worked" from "it just got harsher." All from the dumps, no model calls.

1. The evaluators demoted exactly what the critics named, and nothing else

```text
┌──────────────────────────────┬────────────┬─────────────────────────────────┐
│          criteria…           │  cycle 1   │            consumes             │
├──────────────────────────────┼────────────┼─────────────────────────────────┤
│ named by a confirmed finding │ 69/69 pass │ 16/74 pass — 57 partial, 1 fail │
├──────────────────────────────┼────────────┼─────────────────────────────────┤
│ not named by any finding     │ 10/10 pass │ 6/6 pass                        │
└──────────────────────────────┴────────────┴─────────────────────────────────┘
```

This is the decisive row. If the evaluators had merely become stricter — a tone effect from the new prompt, or the goal-only producer covering less — unnamed criteria would have dropped too. They didn't move at all. Every demotion lands on a criterion the panel had confirmed evidence against. That's evidence use, not harshness.

It also untangles the two levers I changed at once: the blind producer's cost would show up as unnamed criteria failing (artifact covers less). None did. So the artifact still meets the brief, and the entire shift comes from evaluators consuming findings.

2. The double-earn is gone by construction

```text
┌─────────────────────────────────────────────────────────────┬─────────┬──────────┐
│                                                             │ cycle 1 │ consumes │
├─────────────────────────────────────────────────────────────┼─────────┼──────────┤
│ confirmed findings reconciled to a criterion shortfall      │ 0 / 27  │ 29 / 29  │
├─────────────────────────────────────────────────────────────┼─────────┼──────────┤
│ priced as a separate penalty beside a full-credit criterion │ 27      │ 0        │
└─────────────────────────────────────────────────────────────┴─────────┴──────────┘
```

Every confirmed defect is now charged once, through the criterion it undermined. That's the coherence the abandoned "cap" hack was trying to force deterministically — achieved instead by giving the judge the evidence and letting the existing reconciliation do its job.

3. It's judgement, not obedience

The instruction was "at most partial unless you show the defect does not touch it." The 16 criteria that stayed pass despite a named defect carry exactly that argument — "the replay-handle defect concerns execution, not evidence readability", "the vocabulary-narrowness defect degrades signature but…". And the partials reason the defect through into the criterion's own terms — "no entry-point handle is recorded, so replay against a changed configuration cannot actually be executed" — rather than quoting the critic. Parroting was the risk you flagged; this sample shows judgement.

4. Every kind moves, and the gate didn't over-fire

capability 26 partial / 10 pass · contract 11 / 4 / 1 fail · property 12 / 4 · constraint 8 / 4. The gated constraint kind took partials, not fails — no false blocks.

What it did not settle

- n = 4 scored, unnamed n = 6. Direction unambiguous; effect size is a first estimate.
- Calibration. 1 fail in 80 — whether some partials should be fails needs human labels, per the doctrine. The rubric now discriminates; whether it discriminates correctly is the next measurement.
- Scores sit at 53–68, under acceptAt: 75. Every one-iteration run now ends revise. That's the loop working as designed, not a defect — but nothing will accept on a first draft anymore, and that's worth deciding on deliberately.
- 2 of 6 producers failed — pre-existing classes, but worth watching whether a goal-only producer trips them more often.

Iteration to iteration

The contract is derived once per run and never changes — every iteration is judged against the same 20 criteria, which is what makes iterations comparable.

```text
iteration 1   produce(initial)  → judge → decide → remediations
                                                      │
              keep as `best` if it beat the best so far (strict-better)
                                                      │
iteration 2   produce(revise)  ← best.artifact + best.remediations
              or produce(retry) ← best.remediations only ("start over, avoid these pitfalls")
                                → judge → decide → …
```

Three rules carry the state:

- The controller's decision is the next mode. revise → the producer gets its prior artifact back plus the remediations. retry → no prior, just the pitfalls. accept / reject / escalate → the loop stops.
- The producer always revises the best, not the last. A revision that scored worse is discarded; the next attempt starts again from the best iteration's artifact and its remediations. Two non-improving iterations in a row (plateauAfter) stop the loop.
- Judges never see the previous iteration. Critics and evaluators see the current artifact, fresh. Only the producer carries memory forward — and only as prior + remediations, never a score.

What a remediation is, and why it isn't the checklist

The controller selects what's actionable from the ledger — findings that are fixable, criteria that came back partial/fail, validator problems — worst first. Then hydrate attaches the panel's own words to each:

```text
┌──────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│        shortfall         │                                                 what the producer reads                                                  │
├──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ a confirmed finding      │ the critic's sentence — "temperature 0 makes the three-vote safeguard decorative (at: assumption.5, flow.4)"             │
├──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ a criterion partial/fail │ its statement plus the evaluator's reason — "determinism: pinned models are stated but the adjudication path re-samples" │
├──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ a validator problem      │ the validator's message                                                                                                  │
└──────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

So yes — on revise the producer does see criterion statements. But only the ones that fell short, each attached to why, each pointing at where.

The distinction: the checklist is the test; a remediation is the marked paper. A producer handed all 20 criteria up front writes one mechanism per line and the evaluators find one for every line — that was the 279/279. A producer handed "these three fell short, here's the panel's reasoning, here's where" has to fix a specific thing a specific judge found wanting. Same words, opposite effect: one is what the grader will look for, the other is what the grader found. Feedback after judgement is how the loop is supposed to teach; the answer key before it is how it was being gamed.
