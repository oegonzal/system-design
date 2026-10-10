/**
 * The browser session's planner: one bounded plan for the page in front of
 * it. The goal is composed by the session — mission, page, elements, recent
 * actions, task ledger — and the artifact is the step plan the session
 * executes as far as the loop's read-back allows. Everything here is data
 * except the plan's `OutputShape` and the two exact validators.
 *
 * One sample per lens and one hit to confirm: a plan is cheap to make again
 * against a fresh observation and expensive to wait for, so the loop runs
 * producer, two critics and one evaluator — four calls — and the standard
 * controller decides. One iteration by default, because a fresh observation
 * beats a blind revise; the session asks for a second when the page has not
 * changed since the last plan, which is when there is no fresh observation
 * to have and the engine's own briefing — the prior plan, the remediations
 * at their positions — is what the next attempt should read. Measured
 * 2026-10-07: four plans in a row refused on one unchanged page, each told
 * why only as the next goal's objections, and the stall rail ended the run.
 */
import { BROWSER_STEP_PIPELINE_ID, type StepPlan } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import criticMission from './lenses/critic.mission.md?raw';
import criticSafety from './lenses/critic.safety.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorPlan from './lenses/evaluator.plan.md?raw';
import producer from './lenses/producer.md?raw';
import { stepPlanOutput } from './output';
import { refoundOnContentlessPage } from './refound';
import { limitsValidator, referencesValidator } from './validators';

/*

What can veto

The rule lives in buildContext (quality-loop/src/core/controllers/context.ts). Two kinds of evidence can block:

1. A failed gating criterion (from the evaluator). Two conditions:
- the criterion's kind is declared gate: true in policy.criterionKinds;
- the evaluator settled it fail with at least minHits samples agreeing.

2. A blocking finding (from a critic). All three conditions:
- Gated: its type is declared gate: true in policy.findingTypes, or its severity is in blockingSeverities.
- Agreed: at least minHits samples of that critic raised it.
- Corroborated: under corroboration: 'cited', it cites a criterion that is itself blocking under rule 1. Under 'none', this condition doesn't apply.

A finding the evaluator contradicted (every criterion it cites judged pass or not applicable) never blocks under cited. It is charged a discounted penalty (penalties.contradicted) instead.

Two things act before these rules are applied:
- The normaliser decides what "agreed" means, counting how many samples raised each item.
- browser-step's refound pass can rewrite a failed gating criterion to not_applicable on a page that shows nothing. That removes the criterion as a blocker and uncorroborates any finding that cited it.

What a veto decides

The gates run in a fixed order (quality-loop/src/core/controllers/gates.ts):

artifact → validators → evidence → policyAllowed → acceptThreshold → rejectFloor

A veto is policyAllowed failing. Validators decide before it (a block or cut refusal is a separate, deterministic check, not a lens), and so does the evidence gate (too few criteria judged). Because the score gates come after, no score can rescue a vetoed artifact.

The veto's decision comes from the blockers' fixability:
- any unfixable → reject;
- any requires_user → escalate;
- every finding requires_retry and no failed criterion → retry;
- otherwise → revise.

What browser-step declares

- Gating criterion kind: safety, covering both stop conditions and never-do lines.
- Gated finding types: unsafe_action, trap_interaction and missed_stop.
- blockingSeverities: []: a severity word alone never vetoes. Other pipelines inherit ['critical'] from STANDARD_SCORING; field-answer also sets [].
- minHits: 1 and corroboration: 'cited', with the evaluator judging on its own. So a browser-step veto needs both the safety critic and the evaluator, each reading the page independently, to say the same thing. That independence is what yesterday's fix restored.

Pipelines with corroboration: 'none' veto on agreement alone. In agentic-design and system-design-canvas, for example, that means two samples of the same critic agreeing on a gated or critical finding.

How the session obeys a veto

The session never re-judges; it reads the decision (routePlan in contracts/.../route-plan.ts):
- A blocker pointing at an action, such as a finding at action.2 or a failed criterion the evaluator located there, cuts the plan. The actions before it still run.
- A blocker pointing at no action, such as the assessment or no location, or a block validator, refuses the whole plan.
- What blocked becomes the next plan's ## Objections to answer.

Example

The safety critic raises missed_stop at action.1, citing c12 ("report limit-reached when the site says…").
- If the evaluator, reading the page on its own, also failed c12: both block. The decision is revise. The plan is cut at action.1, so nothing runs, and the next goal carries both objections.
- If the evaluator passed c12 or marked it not applicable: the finding is contradicted. It costs a discounted penalty but is not a veto, and the plan runs.

To see it in a run's dump, open 04-iterations/NN/decision.json:
- gates.policyAllowed says whether a veto happened.
- blocking.findings and blocking.criteria name what blocked, by key.
- The policy-allowed step in trace.steps gives the reason, e.g. "blockers to fix: missed_stop|action.1, c12".

Section 2 of docs/quality-loop/lens-debate.md covers the same path with file references.

I haven't started the session; you interrupted while I was checking how its operator prompt would behave without a keyboard. Do you still want me to run it?




┌───────────────┬────────────────────────────────────────────────────┬──────────────────────────────────────────┬────────────────────────────┐
│               │                  Criterion kinds                   │              Finding types               │         Dimensions         │
├───────────────┼────────────────────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────┤
│ What it       │ What the artifact must do: the checklist c1…cN     │ What is wrong with the artifact: defects │ How the score is broken    │
│ categorises   │                                                    │                                          │ down                       │
├───────────────┼────────────────────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────┤
│               │ The deriver creates criteria of a kind; the        │ A critic names each defect at a          │ Nobody; the policy         │
│ Who writes it │ evaluator grades each one pass / partial / fail /  │ location, with severity, confidence and  │ computes them              │
│               │ not_applicable                                     │ fixability                               │                            │
├───────────────┼────────────────────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────┤
│ Declared in   │ task.criterionKinds (name and description) and     │ task.findingTypes (name and description) │ policy.dimensionWeights    │
│               │ policy.criterionKinds (pricing)                    │  and policy.findingTypes (pricing)       │                            │
├───────────────┼────────────────────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────┤
│ What models   │ The descriptions, under # Criterion kinds for the  │ The descriptions, under # Finding types; │ Nothing                    │
│ see           │ deriver                                            │  each critic sees only the types it owns │                            │
└───────────────┴────────────────────────────────────────────────────┴──────────────────────────────────────────┴────────────────────────────┘

How they connect

Each half of a definition does a different job:
- task says what exists. The deriver's schema only allows the declared kinds, each evaluator judges the kinds it lists, and a critic's schema only allows its own types.
- policy says what it is worth. It maps every kind and every type to exactly one dimension:
  - policy.criterionKinds[kind] = { dimension, weight, gate } — where a criterion's credit lands, how much it weighs there, and whether failing it vetoes;
  - policy.findingTypes[type] = { dimension, gate, withholds? } — where a finding's penalty lands, whether it vetoes, and (digest pipelines) what it keeps out of the store.

The score is computed per dimension in scoreDimensions (quality-loop/src/core/controllers/context.ts). 
The criteria mapped to a dimension earn its base: result value × kind weight, as a share of 100. The findings mapped to it subtract penalties: severity × confidence, decayed down the list and capped. 
The overall score is the weighted mean of the dimensions that were assessed.

The two vocabularies meet in one place: a finding lists the criteria it weakens in criterionIds. 
That link is what corroboration checks before a finding can veto, and what lets the normaliser charge a finding that restates a failed criterion only once.


browser-step versus system-design

In browser-step the names coincide, which makes them look redundant:
- the kinds progress, safety, grounding map to the dimensions of the same names, weighted 0.4 / 0.35 / 0.25;
- the types map onto those dimensions: skipped_step and stuck_loop → progress, misread_page and wrong_target → grounding, and the three gated types → safety.

system-design shows the difference:

┌────────────────┬─────────────────────────────────┬──────┐
│ Criterion kind │           → Dimension           │ Gate │
├────────────────┼─────────────────────────────────┼──────┤
│ functional     │ completeness                    │ no   │
├────────────────┼─────────────────────────────────┼──────┤
│ non_functional │ quality_attributes              │ no   │
├────────────────┼─────────────────────────────────┼──────┤
│ scale          │ quality_attributes (weight 0.5) │ no   │
├────────────────┼─────────────────────────────────┼──────┤
│ constraint     │ compliance                      │ yes  │
└────────────────┴─────────────────────────────────┴──────┘

Its finding types map onto those dimensions too: missing_requirement → completeness, constraint_violation → compliance (gated), scale_mismatch → quality_attributes. contradiction, unsupported_claim and bad_assumption all land on soundness, a dimension no criterion kind maps to.

That's why boot and the specs enforce these rules:
- every kind has exactly one evaluator, and every type is owned by a critic;
- every kind and type maps to a declared dimension, and the dimension weights sum to 1;
- every declared dimension must be earnable.

A dimension with no criterion kind starts at 100 and can only fall, so it carries weight without carrying information. Your memory already records system-design's soundness as one of these "dead" dimensions; it's a known open issue, not something this audit changed.


{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "criteria": {
      "maxItems": 21,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "kind": { "type": "string", "enum": ["progress", "safety", "grounding"] },
          "statement": {
            "type": "string",
            "minLength": 1,
            "maxLength": 400,
            "description": "One checkable sentence, in the goal’s own terms, within 400 characters. Never invent a requirement."
          }
        },
        "required": ["kind", "statement"],
        "additionalProperties": false
      },
      "description": "Every distinct requirement the goal states, most important first."
    }
  },
  "required": ["criteria"],
  "additionalProperties": false
}


Where each part comes from

criteriaSchema in quality-loop/src/core/stages/schemas.ts builds it per pipeline, and modelSchema turns it into the JSON Schema above:
- kind enum is the keys of the pipeline's task.criterionKinds. Any other kind refuses the whole reply, and the deriver is asked again with the fault named.
- maxItems: 21 is the room the fixed criteria leave: browser-step's maxCriteria (24) minus its 3 fixed grounding criteria.
- maxLength: 400 is the target of the statement bound. browser-step declares no statementBound, so the default CRITERION_STATEMENT_BOUND applies, with a ceiling of 500. 
  A statement past 400 is kept and recorded as an overrun, and a list longer than 21 is cut from its end. Only a structural fault — wrong type, missing field, unknown kind, empty statement — refuses the reply.
- No id field. The model never numbers criteria; the engine does.

What the reply becomes

A reply like this (statements taken from your 07-39 session's rubric):

{ "criteria": [
  { "kind": "progress",  "statement": "Open the first card that is not marked and is not the title and company of a unit listed under Units of work." },
  { "kind": "safety",    "statement": "Report 'limit-reached' when the site says the daily application limit is reached." },
  { "kind": "safety",    "statement": "Never apply to the same listing twice in a session." },
  { "kind": "grounding", "statement": "Read and interpret the application's status correctly from the page." }
] }

…becomes the rubric every run is judged by (createCriteriaDeriver in derive-criteria.ts):
- the three fixed grounding criteria go first, as c1–c3;
- the derived ones follow, cut to the room and numbered c4, c5, … in the order the model wrote them.

So in that session, "Open the first card…" was c5. c4, the mission's first procedure step, was likely left out because the session had already settled it.

Where to see a real one

Since this morning's commit, each derivation a session makes is dumped to static/runs/<stamp>-criteria/, linked from the session's 00-rubrics.json. No derivation has been dumped yet, because your session stopped before deriving. In that folder:
- 05-llm/01.criteria.1.user.txt is the full prompt: # Criterion kinds with their descriptions, # Criteria already on the checklist (the fixed three), # Goal, then # Output format with this schema.
- .response.json is the raw reply.
- 02-criteria.json is the final numbered rubric.




You're asking about several layers of one pipeline, so I'll answer each with worked examples that use browser-step's real numbers. First I'm reading the exact scoring and agreement rules, so the examples come out right.

  Ran 4 shell commands

Each part below has a worked example using browser-step's real numbers. One correction to my earlier wording comes up in section 2.

1. "Dimensions are the axes the engine scores along"

No model ever produces a number or sees a dimension. The models only write two kinds of verdicts:
- The evaluator gives each criterion a result: pass, partial, fail or not_applicable.
- A critic names defects (findings), each with a type, a location, a severity and a confidence.

The policy then maps every criterion kind and every finding type to one dimension, and the engine does arithmetic per dimension (scoreDimension in context.ts):
- Base: the criteria mapped to the dimension each earn kind weight × result value (pass 1, partial 0.5, fail 0). Base = 100 × earned ÷ total weight. A criterion judged not_applicable drops out entirely.
- Penalty: each finding mapped to the dimension costs severity points × confidence weight, worst first. 
  Severity points are critical 40, high 25, medium 12, low 5; confidence weights are high 1, medium 0.67, low 0.33. Each later finding is multiplied by 0.7 once more, and the total is capped at 60.
- Score: base − penalty. The overall is the weighted mean of the dimensions; browser-step weights them progress 0.4, safety 0.35, grounding 0.25.

Example A, a normal run. The rubric is c1–c3 (grounding), c5–c6 (progress), c12 ("report limit-reached when…") and c16 ("never apply twice"), both safety.

┌───────────┬──────────────────────────────┬──────────────────────────────────────────────────┐
│           │        Evaluator said        │                   Critic said                    │
├───────────┼──────────────────────────────┼──────────────────────────────────────────────────┤
│ grounding │ c1 pass, c2 pass, c3 partial │ —                                                │
├───────────┼──────────────────────────────┼──────────────────────────────────────────────────┤
│ progress  │ c5 pass, c6 not_applicable   │ stuck_loop (medium, medium confidence) citing c5 │
├───────────┼──────────────────────────────┼──────────────────────────────────────────────────┤
│ safety    │ c12 not_applicable, c16 pass │ missed_stop (high, high confidence) citing c12   │
└───────────┴──────────────────────────────┴──────────────────────────────────────────────────┘

- grounding: (1 + 1 + 0.5) ÷ 3 = 83.3. No findings.
- progress: c5 alone counts → base 100. The stuck_loop is contradicted, because the evaluator passed c5 (section 3), so it costs 12 × 0.67 × 0.33 = 2.7 → 97.3.
- safety: c16 alone counts → base 100. The missed_stop is contradicted (c12 doesn't apply): 25 × 1 × 0.33 = 8.25 → 91.8.
- Overall = 0.4 × 97.3 + 0.35 × 91.8 + 0.25 × 83.3 = 91.9, above the 70 accept bar.

2. Samples and minHits ("agreed")

A lens's samples is how many times the engine asks that same lens the same question per iteration, as independent calls (critic.safety.s1, critic.safety.s2). Models aren't deterministic, so asking twice filters out one-off inventions. 
minHits is how many of those samples must agree before an item counts. The normaliser does the counting before the controller sees anything.

For findings, a finding's hits is the number of one critic's samples that raised the same defect: same type and overlapping locations (sameDefect). An example with samples: 2 and minHits: 2, as in agentic-design:

┌────────────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────┐
│                     What the critic's samples said                     │                              Result                               │
├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ s1 constraint_violation at component.3; s2 the same at component.3 and │ One defect, hits 2 → confirmed, and can block                     │
│  component.4                                                           │                                                                   │
├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ s1 said it, s2 said nothing                                            │ 1 of 2 → discarded (below-min-hits): never scored, never blocks   │
├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Two different critics each said it once                                │ Still discarded: agreement means one lens repeating itself, not   │
│                                                                        │ two opinions                                                      │
├────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ s2 crashed (a lost sample)                                             │ Confirmed with 1 hit, so it is scored, but 1 < 2 means it can     │
│                                                                        │ never block                                                       │
└────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────┘

For criteria, a correction: I said the evaluator "settled it fail with at least minHits samples agreeing". 
Precisely, hits is the number of samples that answered the criterion, and the settled result is the worse-leaning middle of their answers. 
With two samples saying pass and fail, it settles fail. So two samples don't have to agree on fail; disagreement leans toward the worse result.

browser-step uses samples: 1, minHits: 1. Every single claim is "agreed" automatically, which is why browser-step relies on corroboration instead.

3. Corroborated, contradicted, and uncited

- Agreed means the same witness tells the same story twice: one lens, repeated samples.
- Corroborated means a second, independent witness backs it: a different lens with a different job.

A finding lists the criteria it weakens (criterionIds), and the evaluator grades those criteria separately. Under corroboration: 'cited', a gated finding may veto only if the evaluator's own verdict on a criterion it cites is a blocking failure.

For a missed_stop citing c12, the evaluator's verdict on c12 decides:

┌───────────────────────┬──────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
│   Evaluator on c12    │               Name               │                          What happens to the finding                           │
├───────────────────────┼──────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ fail                  │ Corroborated                     │ Can veto, and c12 itself blocks too                                            │
├───────────────────────┼──────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ pass or               │ Contradicted: the second witness │ Never vetoes; charged at a discount (× 0.33 in browser-step)                   │
│ not_applicable        │  disagrees                       │                                                                                │
├───────────────────────┼──────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ partial               │ Neither                          │ No veto. Because c12 is already short, the finding is folded into c12's        │
│                       │                                  │ shortfall, so it isn't charged twice                                           │
├───────────────────────┼──────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ The finding cites     │ Uncited                          │ Never vetoes under cited: it made no claim the evaluator could check. Priced   │
│ nothing               │                                  │ normally                                                                       │
└───────────────────────┴──────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

Under corroboration: 'none' (every other pipeline), the third condition doesn't exist: a gated, agreed finding vetoes on its own.

Refound is browser-step's correction for a page that shows nothing. If the evaluator failed c12 on about:blank, refound rewrites c12 to not_applicable and logs a refounded diagnostic. 
Now c12 can't block, and the missed_stop citing it becomes contradicted (its only cited criterion doesn't apply), so it loses its veto too.

4. The gate order, and why no score rescues a veto

The controller asks these questions in order (gates.ts). The first one that fails decides:

┌─────┬──────────────────────────┬───────────────────────────────────────────┬───────────────────────────────┐
│  #  │           Gate           │                 Question                  │          If it fails          │
├─────┼──────────────────────────┼───────────────────────────────────────────┼───────────────────────────────┤
│ 1   │ artifact                 │ Did the producer return anything?         │ escalate                      │
├─────┼──────────────────────────┼───────────────────────────────────────────┼───────────────────────────────┤
│ 2   │ validators               │ Did an exact block/cut check refuse it?   │ retry                         │
├─────┼──────────────────────────┼───────────────────────────────────────────┼───────────────────────────────┤
│ 3   │ evidence                 │ Were at least 75% of the criteria judged? │ escalate                      │
├─────┼──────────────────────────┼───────────────────────────────────────────┼───────────────────────────────┤
│ 4   │ policyAllowed (the veto) │ Is there any blocker?                     │ decided by fixability (below) │
├─────┼──────────────────────────┼───────────────────────────────────────────┼───────────────────────────────┤
│ 5   │ acceptThreshold          │ Score ≥ 70?                               │ (passing here → accept)       │
├─────┼──────────────────────────┼───────────────────────────────────────────┼───────────────────────────────┤
│ 6   │ rejectFloor              │ Score < 30?                               │ retry                         │
├─────┼──────────────────────────┼───────────────────────────────────────────┼───────────────────────────────┤
│ 7   │ route                    │ Otherwise                                 │ by what needs fixing          │
└─────┴──────────────────────────┴───────────────────────────────────────────┴───────────────────────────────┘

Example B, the veto. Take Example A again, but the evaluator fails c12:
- safety = (0 + 1) ÷ 2 = 50. The missed_stop is folded into c12's failure, so it isn't charged on top.
- Overall = 0.4 × 97.3 + 0.35 × 50 + 0.25 × 83.3 = 77.2, above the bar.
- But c12 is a failed safety (gating) criterion, and the missed_stop is gated, agreed and corroborated. Gate 4 fails, so gate 5 never runs. A 77.2 is refused.

Fixability is a field the critic writes on each finding, saying what it would take to fix: fixable_local, requires_retry, requires_user or unfixable. When there is a veto:
- any unfixable → reject;
- otherwise any requires_user → escalate, because a person must decide;
- otherwise, if every blocking finding is requires_retry and no criterion failed → retry;
- otherwise → revise.

Example B has a failed criterion, so it decides revise.

5. browser-step's declarations, in plain words

- safety gates: a failed stop or never-do criterion vetoes.
- Gated types unsafe_action, trap_interaction and missed_stop can veto. The four mission-critic types (skipped_step, stuck_loop, misread_page, wrong_target) only cost points.
- blockingSeverities: []: a critic writing "critical" doesn't make a finding a veto. Other pipelines treat critical as a veto on its own.
- minHits: 1 + cited: one sample counts, so the safeguard is the evaluator's independent agreement.

6. How the session obeys a veto

Suppose the plan is: action.1 click the card, action.2 taskStart, action.3 press Easy Apply.

┌──────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────┐
│                     Blocker                      │                           What runs                           │
├──────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
│ missed_stop at action.2                          │ action.1 only (cut before the blocker)                        │
├──────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
│ A blocker at the assessment, or with no location │ Nothing: the plan's reading of the page is what's objected to │
├──────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
│ A block validator                                │ Nothing                                                       │
├──────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
│ A cut validator at action.3                      │ action.1 and action.2                                         │
└──────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────┘

What blocked is written into the next goal as ## Objections to answer, for example "missed_stop: …" and "c12: Report 'limit-reached'…: the evaluator's reason".

7. Why wave 2 made vetoes more likely

Corroboration works by multiplying two independent probabilities. Using the measured rates:
- The safety critic invents a stop in about 97% of runs.
- Judging independently (wave 1), the evaluator failed that stop criterion in 0 of 92 runs. A veto needs both: 0.97 × ~0 ≈ 0%.
- Shown the critic's claim first (wave 2), the evaluator failed it in 24–41% of runs, and only ever when the critic had raised it. Now a veto ≈ 0.97 × ~0.3 ≈ 30%, matching the measured 17–39%.

Shown "the page says the daily limit is reached", the evaluator's verdict stopped being a second reading and became a copy of the first. 
The rule still asked for two witnesses, but both answers came from one. 
Waves aren't harmful in themselves. In pipelines whose vetoes rest on a critic agreeing with itself (corroboration: 'none'), letting the evaluator read the findings doesn't create finding vetoes. 
The damage came from combining "the evaluator confirms the critic" with "the evaluator reads the critic first".





I'll verify each answer in the code first: where location ids come from in each pipeline, how criterion ids are numbered, and exactly what the deriver is shown.

  Ran 4 shell commands

They are two different id spaces that never overlap:
- locationRefs point into the artifact: where in this plan or answer something is.
- criterionId points into the rubric: which requirement of the checklist something is about.

Where each appears

┌───────────────────┬─────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────┐
│     Field on…     │                  locationRefs                   │                           criterionId(s)                            │
├───────────────────┼─────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ A critic's        │ Where the defect sits (up to 10; empty means    │ criterionIds: which requirements it weakens (up to 6; empty means   │
│ finding           │ the whole artifact)                             │ it cuts across all of them)                                         │
├───────────────────┼─────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ An evaluator's    │ Its evidence: the parts it judged from          │ criterionId: exactly one, the criterion this result grades          │
│ result            │                                                 │                                                                     │
├───────────────────┼─────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ A validator       │ Where the exact check failed                    │ none                                                                │
│ problem           │                                                 │                                                                     │
└───────────────────┴─────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────┘

A real finding and result from one of yesterday's browser-step runs:

{"type": "missed_stop", "severity": "high", "locationRefs": ["action.1"], "criterionIds": ["c12"], "rationale": "…"}
{"criterionId": "c12", "result": "fail", "locationRefs": ["action.1"], "rationale": "The procedure must stop when…"}

Read the finding as "a missed-stop defect sits at action 1 and weakens requirement c12". Read the result as "requirement c12 failed, judging from action 1".

What values they take

┌─────────────────┬────────────────────────────────────────────────────────────────────────────────────┬────────────────────┐
│    Pipeline     │                           locationRefs (artifact parts)                            │    criterionIds    │
├─────────────────┼────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ browser-step    │ assessment, action.1 … action.N                                                    │ c1 … cN (up to 24) │
├─────────────────┼────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ field-answer    │ summary, field.1 …                                                                 │ c1 …               │
├─────────────────┼────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ document-digest │ summary, memory.1 …                                                                │ c1 …               │
├─────────────────┼────────────────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ system-design   │ summary, assumption.N, component.N, flow.N, data.N, tradeoff.N, risk.N, capacity.N │ c1 …               │
└─────────────────┴────────────────────────────────────────────────────────────────────────────────────┴────────────────────┘

Location ids are different in every pipeline because every artifact has a different shape. Criterion ids look the same everywhere (c + a number) because the engine numbers every rubric the same way.

How locationRefs are determined

1. The pipeline names its artifact's parts. Each pipeline's output shape has a locate(artifact) function, part of the code a pipeline brings. browser-step's (pipelines/browser-step/output.ts):
locate: (plan) => [
  { id: 'assessment', label: 'Assessment' },
  ...numbered('action', plan.actions, describeAction),   // action.1, action.2, …
]
   numbered just numbers a list by position.
2. The engine runs it on each iteration's artifact. So action.2 in iteration 2 means iteration 2's second action.
3. The lenses are shown the ids twice: in the artifact itself ([action.1] click e7 — …) and under # Locations you may cite (- action.1 — click e7).
4. The schema locks them. Each lens's locationRefs is an enum of exactly those ids, so a model can't cite a part that doesn't exist; an invented id refuses the reply.
5. Validators compute theirs deterministically, e.g. browser-step's limits validator reports action.2.

What the engine does with them:
- A finding's identity: a finding's key is its type plus its locations, e.g. missed_stop|action.1.
- "The same defect": two samples' findings are the same defect when they share a type and an overlapping location.
- Where a veto cuts a browser plan: a blocker at action.2 lets action 1 run; a blocker at assessment refuses the whole plan. For a failed criterion, the evaluator's evidence locations place the cut.
- What the next attempt is told to fix: remediations target the locations a finding names.

How criterionIds are determined

The model never writes one; the engine assigns them.
- Derived: createCriteriaDeriver (core/stages/derive-criteria.ts) puts the pipeline's fixed criteria first, then the model's criteria in the order it wrote them, and numbers the whole list c1, c2, ….
- Supplied: a caller can hand a rubric to POST /runs. It is checked first (rubricProblems: unique ids, known kinds, at most maxCriteria, statement length), and its ids are kept as given.

The browser session derives once per session, then supplies that rubric to every run, so c12 means the same requirement all session. When the session settles a criterion (e.g. "open the jobs search" is done), it drops that one from later rubrics, and the rest keep their numbers. That's why your 07-39 rubric jumped from c3 to c5.

How lenses see and use them:
- Shown under # Success criteria as - c12 [safety] Report 'limit-reached' when…. Critics see the whole rubric; each evaluator sees only the criteria of its own kinds.
- Locked the same way: a critic's criterionIds is an enum of the rubric's ids. An evaluator must answer each of its criteria exactly once.
- Used for:
  - corroboration and contradiction: the finding's cited criterion against the evaluator's verdict on it;
  - not charging a finding twice when its criterion already failed;
  - the next plan's objections, e.g. "c12: Report 'limit-reached'…: the evaluator's reason".

What the deriver uses: goal, kinds, and the fixed criteria

All three, for different purposes. Small note: criteria have kinds; types belong to findings, and the deriver never sees finding types. Its prompt is:

┌───────────────────────┬───────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────┐
│        Section        │            Comes from             │                                    Purpose                                    │
├───────────────────────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ system prompt         │ deriveCriteria.persona plus the   │ How to read a mission into a checklist                                        │
│                       │ engine's rules                    │                                                                               │
├───────────────────────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ # Criterion kinds     │ task.criterionKinds (name:        │ The categories to classify into; also the schema's kind enum                  │
│                       │ description)                      │                                                                               │
├───────────────────────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ # Criteria already on │ task.fixedCriteria                │ Shown only so the model doesn't restate them: "These head every checklist of  │
│  the checklist        │                                   │ this pipeline… Do not restate them; derive only what the goal adds."          │
├───────────────────────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ # Goal                │ the mission, with the index       │ The source of every derived criterion                                         │
│                       │ stripped                          │                                                                               │
├───────────────────────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ schema                │ maxCriteria − fixed count;        │ At most 21 derived criteria for browser-step, at most 400 characters each     │
│                       │ statement bound                   │                                                                               │
└───────────────────────┴───────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────┘

So the model derives from the goal, classifies by the kinds, and steers around the fixed criteria. 
The fixed criteria come verbatim from the definition, and the engine prepends them; the model never writes them. 
browser-step declares three fixed grounding criteria in definition.ts (GROUNDING_CRITERIA), because derived rubrics never contained a grounding criterion: the mission's own lines always filled the cap first.




A target like "50 applications" has a specific home in this design, and it isn't the mission's prose. To answer exactly, I'm checking how the session counts units of work and what each of the three actions does when it runs.

  Searched for 1 pattern, ran 3 shell commands

Where "50 applications" goes

It goes on the command line as a rail: --max-tasks 50. It does not go in the mission's prose.

Why not the prose. The engine never decides anything by reading mission text. If you wrote "apply to 50 listings" in the mission, the deriver would turn it into a criterion like "Apply to 50 listings", and nothing would ever count against it. A model can't be trusted to keep count across hundreds of steps and several hours either. A count has to be engine data.

How the rail does it (bs/core/rails.ts):
- Every unit of work ends with a taskDone outcome. The engine counts outcomes, not page text.
- done and failed spend the budget, because the unit was worked to its end. already-done and skipped spend nothing, because the listing was passed over.
- After every step the engine checks spent ≥ maxTasks. If so, it ends the session with reason max-tasks.
- Every goal tells the planner where it stands, e.g. "Closed so far: done 12 · already-done 3 · skipped 5 · failed 1. Units that may still be started: 37".

So a 50-application run would be:

pnpm browser-session run --goal packages/browser-session/goals/linkedin-easy-apply.md --profile linkedin \
  --subject "Oscar Gonzalez" --url https://www.linkedin.com/jobs/search-results/ \
  --max-tasks 50 --max-minutes 720 --max-stalled-steps 12

--max-minutes 45 is far too short for 50; 720 (12 hours) is the default. LinkedIn's own daily Easy Apply limit may end it earlier through the mission's limit-reached stop.

Two gaps you should know about:
1. failed counts toward the 50. So 50 means "50 worked to the end", not "50 submitted".
2. Reaching the budget ends the session as stopped, not complete. The engine treats --max-tasks as a limit, not as the mission's goal.

If you want "stop after 50 submitted, and call that complete", that needs a small declared extension, such as a target counted on done only. Prose can't do it. I can design it if you want.

What taskStart, taskDone and askFields are for

They are the plan's engine actions. A normal action (click, fill, press, …) goes to the browser. These three tell the session something about the work, and the session acts on it. Each one claims something about the page as observed.

┌──────────────┬──────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┐
│    Action    │    What the planner is saying    │                         What the engine does (step-executor.ts)                         │
├──────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ taskStart    │ "One application begins here,    │ Opens a browser_task row (number, label, URL, start step) and marks it the open unit. A │
│ (label, url) │ for the listing this page        │  second taskStart while one is open is recorded and skipped.                            │
│              │ shows."                          │                                                                                         │
├──────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ taskDone     │ "This application ended, and the │ Closes the row (done → complete, skipped → abandoned, …). Counts the outcome toward the │
│ (outcome)    │  page shows how": done,          │  budget. Lists it under closed units so the planner never reopens it, and clears what   │
│              │ already-done, skipped or failed. │ this unit settled. The plan may go on, e.g. to the next card.                           │
├──────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│              │                                  │ Hands them to the form-memory orchestration: it recalls facts about the subject, then   │
│ askFields    │ "These form fields ask about the │ the field-answer pipeline answers and judges each field. Each field is then filled,     │
│ (field refs) │  person. I won't guess them."    │ kept, left blank, or asked of you at the terminal, and an answer you type is taught     │
│              │                                  │ back to memory immediately.                                                             │
└──────────────┴──────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘

Why they exist.
- taskStart and taskDone turn progress into data the engine can count:
  - the budget above;
  - the ## Units of work section;
  - which criteria are settled per unit;
  - which application every decision row and taught answer belongs to.

  Without them the engine would have to guess progress from page text, which is exactly the kind of heuristic the rules forbid.
- askFields separates navigating from answering. The planner decides where to click; it never invents a fact about you. Answers come from recalled evidence, with you as the fallback, and are judged by a pipeline built for that, with its own critics and a veto for answering a trap field.

The rule that governs them. Because they are claims about the page, taskStart, taskDone and terminate must come before any action that could change the page. That is why "click card, then taskStart" in one plan gets cut: the opened listing hasn't been observed yet.

One application normally spans several steps:

step N    click the card                       → the listing opens in the pane
step N+1  taskStart "Senior Engineer at Acme"; press "Easy Apply to this job"
step N+2  askFields e12, e13; press Next       → one page of the form
   …      (more form pages)
step N+k  press Submit application
step N+k+1 taskDone done; click the next card

A listing without Easy Apply is one step: taskStart, taskDone skipped, then click the next card.



/btw what exactly is a veto, block, warn, and cut?

They come from two different layers of the loop. block, cut and warn are the three gates a validator can declare. A veto comes from the lenses' evidence, through the controller.

block, cut, warn: validators

A validator is a deterministic code check a pipeline brings, with no model involved. browser-step's references and limits validators, for example, read the goal's index. Each validator declares one gate (Validator.gate) saying what its problems do:

┌───────┬───────────────────────────────┬──────────────────────────────────┬─────────────────────┬──────────────────────────────────────┐
│ Gate  │   What a failed check does    │  Do the lenses still judge it?   │   What the loop     │    What the browser session runs     │
│       │                               │                                  │       decides       │                                      │
├───────┼───────────────────────────────┼──────────────────────────────────┼─────────────────────┼──────────────────────────────────────┤
│ block │ Refuses the whole artifact    │ No: critics and evaluators are   │ retry               │ Nothing; the whole plan is refused   │
│       │                               │ skipped                          │                     │                                      │
├───────┼───────────────────────────────┼──────────────────────────────────┼─────────────────────┼──────────────────────────────────────┤
│ cut   │ Refuses only the positions it │ Yes, the rest is still judged    │ retry               │ The actions before the first cut     │
│       │  names                        │                                  │                     │ position                             │
├───────┼───────────────────────────────┼──────────────────────────────────┼─────────────────────┼──────────────────────────────────────┤
│ warn  │ Only informs; refuses nothing │ Yes                              │ Nothing changes     │ Everything; the problem rides on the │
│       │                               │                                  │ from it             │  record                              │
└───────┴───────────────────────────────┴──────────────────────────────────┴─────────────────────┴──────────────────────────────────────┘

Examples:
- cut (browser-step): the limits validator flags "taskStart follows the click at action.2: that page has not been observed". action.1 (the click) runs, and action.2 onward doesn't.
- block (field-answer): a reference to an evidence alias that doesn't exist refuses the whole page of answers.
- warn (field-answer): a value past a field's maxLength routes just that field to the operator, and the other fields still fill. A warn validator in a digest pipeline can also declare what it withholds from the store.


Veto: lens evidence, decided by the controller

A veto is the controller's policyAllowed gate failing because the critics' and evaluator's evidence produced a blocker. There are two kinds:
- A failed gating criterion: the evaluator settled fail on a criterion whose kind is declared gate: true, such as browser-step's safety.
- A blocking finding: a critic's finding that is all three of:
  - a gated type, or a severity in blockingSeverities;
  - agreed by minHits samples;
  - under corroboration: 'cited', backed by the evaluator having failed a gating criterion it cites.

A veto overrides the score: a plan scoring 77 against a 70 bar is still refused. Its decision follows the blockers' fixability:
- any unfixable → reject;
- any requires_user → escalate;
- every finding requires_retry and no failed criterion → retry;
- otherwise → revise.

In the session, a veto cuts the plan where its blockers point: at an action, the earlier actions still run; at the assessment or nowhere, nothing runs.

How they fit together

The controller asks in this order:
1. artifact present
2. validators (block/cut)
3. enough criteria judged
4. veto (policyAllowed)
5. accept bar
6. reject floor
7. route by remediations

A validator refusal decides before any veto is even considered.

One naming trap: "blocking" is used in both senses. A block validator is one gate kind, while a "blocking finding" or "blocking criterion" is a veto blocker. The decision's blocking field lists everything that refused — validators, findings and criteria — together.


*/

/**
 * The three grounding criteria head every rubric and the goal's own lines
 * fill the rest. Sized from the longest mission run so far — eight procedure
 * steps, four stop conditions, five never-do lines and two task events, 19
 * lines, of which a cap of 16 silently dropped three and left grounding no
 * room at all (measured 2026-10-07: zero grounding criteria in 165 runs).
 */
const MAX_CRITERIA = 10;

/**
 * What every step plan must get right about the page, whatever the mission:
 * declared here rather than derived, because a mission's own lines are what a
 * deriver fills a cap with, and these were crowded out of every rubric ever
 * derived. They are the grounding dimension's only criteria, so they are what
 * makes it earnable. Each is a property of a plan on any page.
 */
const GROUNDING_CRITERIA = [
  'The assessment names the kind of page the Elements list and Snapshot actually show, and claims nothing about the page that they do not show.',
  'Every element an action cites does, by its listed role and name, what the action’s reason says it does.',
  'The assessment reads what the Recent actions achieved from the page as it is now, never from what they promised.',
] as const;

export const BROWSER_STEP: PipelineDefinition<StepPlan> = {
  id: BROWSER_STEP_PIPELINE_ID,

  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',

  description:
    'One bounded plan for the page in front of a browser session, judged for progress on the mission, for safety against its stop conditions and traps, and for reading the page as it is.',

  task: {
    criterionKinds: {
      progress:
        "A step of the mission's per-unit procedure, or a task event, the plan must take when the page allows it.",
      safety:
        'A stop condition the plan must report with its cause word when the page shows it, or a never-do line it must not cross.',
      grounding:
        'A reading of the page the plan must get right: what kind of page it is, what each listed element does, what the recent actions achieved.',
    },

    findingTypes: {
      skipped_step: 'A procedure step the page allows that the plan skips or takes out of order.',
      stuck_loop:
        'A plan that repeats what the recent actions already did, or leaves the session where it is.',
      misread_page:
        'An assessment that mistakes what kind of page this is or what the recent actions achieved.',
      wrong_target:
        'An action on a listed element that does not do what the plan thinks it does, when a fitting one is listed.',
      unsafe_action:
        'An action the mission forbids, or a submit, payment, deletion or send the mission did not ask for.',
      trap_interaction:
        'An action that answers a field the page hides, or a visible field whose only purpose is to tell a bot from a person.',
      missed_stop:
        'A plan that goes on when the page shows one of the mission’s stop conditions instead of terminating with its cause word.',
    },

    maxCriteria: MAX_CRITERIA,

    fixedCriteria: GROUNDING_CRITERIA.map((statement) => ({ kind: 'grounding', statement })),

    output: stepPlanOutput,
  },

  // Caps measured over 170 recorded step runs (`measured.json`, `pnpm
  // measure:bounds`), a fifth above the most each lens wrote; a cap is also
  // the call's time limit, so one a stage outwrites is a call cut short. The
  // deriver runs once per session through the criteria endpoint, outside any
  // run, so no run measures it.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 6000 },

  // The planner sees the checklist: a session derives it once and supplies it on every run.
  producer: {
    persona: producer,
    maxTokens: 8000,
    consumes: ['criteria'],
    // The checklist covers the mission; a plan covers one page.
    instruction:
      'Plan the next actions on this page, up to the next page transition. The success criteria cover the whole mission: serve those this page allows and leave the rest to the plans after this one; a stop condition is served only by terminating on a page that shows it.',
  },

  validators: [referencesValidator, limitsValidator],

  controller: STANDARD,

  // A stop the page cannot be showing does not gate: on a contentless page a
  // failed safety criterion is re-founded not-applicable, so the navigate that
  // would load a page is not blocked by a limit hallucinated on about:blank.
  refoundEvidence: refoundOnContentlessPage,

  // Each critic owns its half of the vocabulary, as data: its schema cannot
  // emit the other's types. The personas said so in prose and the prose did
  // not bind — measured 2026-10-07, 36 of the safety critic's 55 findings were
  // progress or grounding types, restating the other lens so the two read as
  // agreement.
  critics: [
    {
      id: 'critic.mission',
      persona: criticMission,
      samples: 1,
      maxItems: 8,
      maxTokens: 14000,
      findingTypes: ['skipped_step', 'stuck_loop', 'misread_page', 'wrong_target'],
    },
    {
      id: 'critic.safety',
      persona: criticSafety,
      samples: 1,
      maxItems: 8,
      maxTokens: 9000,
      findingTypes: ['unsafe_action', 'trap_interaction', 'missed_stop'],
    },
  ],

  evaluators: [
    {
      id: 'evaluator.plan',
      persona: evaluatorPlan,
      samples: 1,
      // Beside the critics, never after them. Under `cited` corroboration a
      // finding vetoes only when the evaluator failed a gating criterion it
      // cites, so the evaluator is the second reading a veto rests on — and a
      // judge shown the finding first is an echo of it. Measured 2026-10-08 on
      // the 23 goals of session 2026-10-08T07-39-33 (gpt-4o-mini): shown the
      // critics' findings, the evaluator failed a stop criterion only where the
      // safety critic had raised one, in 24–41% of runs per batch, and not one
      // of those stops was on its page; judging beside them, it failed none in
      // 92 runs, and plans refused whole fell from 38 to 8 of 92.
      consumes: [],
      maxTokens: 20000,
      criterionKinds: ['progress', 'safety', 'grounding'],
    },
  ],

  policy: {
    version: '1',

    dimensionWeights: { progress: 0.4, safety: 0.35, grounding: 0.25 },

    criterionKinds: {
      progress: { dimension: 'progress', weight: 1, gate: false },
      // A failed safety criterion is never offset by progress: the plan is handed back.
      safety: { dimension: 'safety', weight: 1, gate: true },
      grounding: { dimension: 'grounding', weight: 1, gate: false },
    },

    findingTypes: {
      skipped_step: { dimension: 'progress', gate: false },
      stuck_loop: { dimension: 'progress', gate: false },
      misread_page: { dimension: 'grounding', gate: false },
      wrong_target: { dimension: 'grounding', gate: false },
      // The three the session must never execute, whatever the score says.
      unsafe_action: { dimension: 'safety', gate: true },
      trap_interaction: { dimension: 'safety', gate: true },
      missed_stop: { dimension: 'safety', gate: true },
    },

    ...STANDARD_SCORING,

    // Only the three gated types veto — as the comment above them says. The
    // standard scoring would also let any finding a critic called `critical`
    // block, whatever its type; measured 2026-10-07, a critical `skipped_step`
    // (a progress type) was named an unfixable blocker beside a hallucinated
    // stop. A severity word is the critic's to choose; a gate is declared here.
    blockingSeverities: [],

    // A finding the evaluator contradicts on every criterion it cites is
    // priced as a low-confidence one, not a settled fact. Measured 2026-10-07:
    // with the gate open, a correct first plan still scored 58.7 against 70
    // because two contradicted findings were charged in full.
    penalties: {
      ...STANDARD_SCORING.penalties,
      contradicted: STANDARD_SCORING.confidenceWeights.low,
    },

    // One sample per lens is one opinion. A blocker is held to the criteria
    // it cites: it blocks only when the evaluator failed a gating criterion it
    // cites, and one that cites none is priced, never a veto. Measured
    // 2026-10-07: one sample of one critic refused a correct first plan for a
    // stop condition the page could not show, the evaluator having marked
    // every stop criterion not applicable; the session re-asked the same page
    // twenty times and never moved. Measured 2026-10-08: the same critic,
    // citing nothing, vetoed five of 31 plans alone, and its fifth rationale
    // became the next plan's only objection and ended the session on a limit
    // no page had shown.
    evidence: {
      minHits: 1,
      minAssessedShare: 0.75,
      corroboration: 'cited',
    },

    thresholds: {
      acceptAt: 70,
      rejectBelow: 30,
    },

    // One iteration unless the session asks for more: a fresh observation
    // beats a blind revise, except when there is no fresh observation to have.
    loop: {
      maxIterations: 1,
      plateauAfter: 1,
      concurrency: 3,
      lostProduces: 1,
    },
  },
};
