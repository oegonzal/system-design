· The generator can't emit a prompt with only the PDF's requirements (it always adds a p99-latency NFR, an availability NFR, and extra FRs like refunds / re-sync / spend tile). How should the prompt be made? → Author it — new POST /api/prompts (Recommended)
· After the design reaches 100/A on the deterministic grader, also run one deep-eval pass (all five live critic lenses on your subscription, ~7 min)? It will score below 100 by construction (weakness-only), but it's the critics' verdict on the design. → Yes, one pass after the 100 (Recommended)

Deterministic score of 100/A is confirmed and saved. Now moving to the deep-eval pass, starting with a review of the 100-score run dump (all expectations met, no violations) and the current stack state.
The 100-confirm run passed all 22 applicable expectations with zero rule violations and one info finding, and all five LLM passes ran in deterministic mode. Now I'll restart the stack with the eval LLM live for the approved deep-eval pass.

The tab is open at http://localhost:4200/practice/8cf177bf-b96e-4e13-969f-7c535c9efc75 showing rev #2.
The stack is back on deterministic (EVAL_DETERMINISTIC=1, coach/suggesters still on the subscription).
Memory updated with the r7 round.

Added 6 lines, removed 3 lines

- LLM critic that reads the author's own words, the brief suggester. The
- deterministic grade never calls this; it reads {@link NarrationFacts}. Order
- is stable (overview, then rationales, then flows) and empty slots are
- dropped; returns null when nothing substantive remains.
- dropped; returns null when nothing substantive remains. Each slot keeps the
- reference it is keyed to — `[n-4]`, `[requirement #0]` — so a reader that
- also holds the graph can tie every sentence to the node it explains instead
- of guessing from labels.
  */
  export function narrationToProse(narration: DesignNarrative | null): string | null {
  if (narration === null) return null;

if (overview.length > 0) parts.push(overview);
for (const rationale of narration.componentRationales) {
const prose = rationale.prose.trim();
if (prose.length > 0) parts.push(prose);
if (prose.length > 0) parts.push(`[${rati
  }
  for (const flow of narration.flowNarrations
    const prose = flow.prose.trim();
    if (prose.length > 0) parts.push(prose);
    if (prose.length > 0) parts.push(`[requirement #${flow.requirementIndex}] ${prose}`);
}
const joined = parts.join('\n\n');
return joined.length > 0 ? joined : null;

Deep eval of the 100/A design: 92.4 / A

Session 8cf177bf…, rev #2 (same design as the deterministic 100), EVAL_DETERMINISTIC=0 EVAL_AUTH=claude-code, 376 s (critic 106 s · depth 73 s · narrative 53 s · workability 66 s · scenarios 72 s). Run dump: static/runs/2026-09-03T06-55-19-568-eb593d-eval/.

Scoring ledger (08-scoring.json) — every base and rule penalty identical to the 100 run; only the bounded graded subtraction moved:

┌─────────────┬──────┬────────────────┬───────────────┬───────┐
│ dimension │ base │ graded penalty │ items charged │ score │
├─────────────┼──────┼────────────────┼───────────────┼───────┤
│ data │ 100 │ −13.4 │ 5 │ 86.6 │
├─────────────┼──────┼────────────────┼───────────────┼───────┤
│ product │ 100 │ −9.4 │ 3 │ 90.6 │
├─────────────┼──────┼────────────────┼───────────────┼───────┤
│ security │ 100 │ −6.1 │ 2 │ 93.9 │
├─────────────┼──────┼────────────────┼───────────────┼───────┤
│ explanation │ 100 │ −5.3 │ 6 │ 94.7 │
├─────────────┼──────┼────────────────┼───────────────┼───────┤
│ hygiene │ 100 │ 0 │ 0 │ 100 │
└─────────────┴──────┴────────────────┴───────────────┴───────┘

All three invariants held: 16 of the 31 graded items were charged; the other 15 named reliability/performance/messaging — dimensions this prompt never assesses (no availability/latency NFR stated) — so they surfaced as findings but subtracted nothing. The critic's one critical item did not trip a grade cap (caps … count 0). Every dimension's subtraction stayed under the 20-point clamp.

Per lens: critic 9 (2 high) · evaluator.depth 8 (1 high) · critic.narrative 6 · evaluator.workability 6 (3 high) · evaluator.scenarios 2 (both "degrades"). Axes: depth 67, narrative 82, workability 67 (riskContainment 33, futureGain 100).

What the five lenses converged on — these are real gaps in my design, not rubric noise:

1. POS → Shopify customer identity resolution is never designed (critic critical, depth high, workability high). The store partitions on customer_id and reads are token-scoped, but a POS sale carries a loyalty id/email/phone — nothing maps it. Under-match drops in-store orders from the list; over-match leaks another shopper's orders. This is the defining hard problem of the take-home and the strongest single finding.
2. No backfill/reconciliation — only live feeds enter the store; pre-cutover orders and dropped webhooks become permanent holes despite "full history retained".
3. POS importer has no durable cursor — ordersSince has no high-water-mark store; restart re-scans or silently skips a window.
4. Sync Shopify enrichment (e-11) inside the indexer + terminal DLQ — a Shopify blip burns maxRetries 5 and parks real orders where nothing replays them. The webhook-replay scenario breaks exactly here.
5. 60 s cache TTL sits on top of a 60 s freshness bar with async, best-effort invalidation (flagged by four lenses).
6. Upsert has no version guard; lifecycle stops at received→indexed while both sources send changed orders.
7. Monitoring watches only the indexer — a stalled poller or dead webhook is invisible.
8. Narrative contradictions caught by critic.narrative: "freshness bounded by the queue" is false for the polled POS path; "keyed by source order id" vs the drawn customer_id partition key; authMode jwt vs Shopify's opaque customer token (depth/security).

The tab is open at http://localhost:4200/practice/8cf177bf-b96e-4e13-969f-7c535c9efc75 showing rev #2.
The stack is back on deterministic (EVAL_DETERMINISTIC=1, coach/suggesters still on the subscription).
Memory updated with the r7 round.

Flags

Every environment variable the project reads. Flags outside the LLM group are ordinary config, not behaviour switches.

┌────────────────────────────────────┬────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Flag │ Default │ What it does │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ EVAL_DETERMINISTIC │ unset (stack scripts and CI set 1) │ 1 swaps every LLM client for a no-op. Outranks a key. │
│ │ │ Also feeds the run dump's reason: deterministic. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ IMPROVER_DETERMINISTIC │ falls back to EVAL_DETERMINISTIC │ Same switch for the AI coach only. Lets you run │
│ │ │ deterministic grades with a live coach. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ ANTHROPIC_API_KEY │ unset │ Enables the API client for whichever path is not │
│ │ │ deterministic. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ EVAL_AUTH │ unset │ claude-code routes eval passes through your Claude │
│ │ │ Code login when no key is set. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ IMPROVER_AUTH │ unset │ Same as above for the coach. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ LLM_MODEL │ SDK default │ Model override for both clients. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ EVAL_POLL_INTERVAL_MS │ 1000 │ How often the worker polls for eval jobs. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ IMPROVE_POLL_INTERVAL_MS │ 2000 │ How often the worker polls for improvement runs. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ EVAL_STALE_RUNNING_MS │ agent timeout + 60s (eval), 300000 │ Reaper window before a running job's lock is treated │
│ │ (improver) │ as abandoned. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ EVAL_POLLER_DISABLED │ unset │ 1 stops both pollers from starting. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ EVAL_DUMP_DIR │ ./static/runs │ Where run dumps are written. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ WORKER_PORT / PORT │ 3002 / 3000 │ Worker and API listen ports. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ CORS_ORIGIN │ http://localhost:4200 │ API CORS allow-origin. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ NEXT_PUBLIC_API_URL │ http://localhost:3000/api │ UI's API base. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ DB_HOST DB_PORT DB_USERNAME │ localhost / 5432 / admin / admin / │ Postgres connection. Test configs default the name to │
│ DB_PASSWORD DB_NAME │ sysdesign │ sysdesign_test. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ BASE_URL / API_URL / DEMO / CI │ e2e only │ Playwright targets, demo mode, and whether to reuse a │
│ │ │ running server. │
├────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ SKIP_REVIEW │ unset │ 1 skips the commit-hook review pass. │
└────────────────────────────────────┴────────────────────────────────────┴────────────────────────────────────────────────────────┘

SWC_NODE_PROJECT and COREPACK_ENABLE_DOWNLOAD_PROMPT are set internally by the db scripts and setup script. They are not user knobs.

How a deterministic score is computed

"Only the rules engine grades" means the grade comes entirely from packages/eval-worker/src/engine/, which is pure code: no clock, no randomness, no I/O, stable sort keys everywhere. Under EVAL_DETERMINISTIC=1 the five LLM passes return a llm-disabled diagnostic before building a prompt, and the aggregator never uses diagnostics for math. So the steps below are the whole grade.

Inputs. The canvas graph (node kinds, config knobs, edges), the design brief (id references only), the narrative's typed projection, and a bag of prompt facts: archetype, difficulty, scale targets, the NFR list, the closed functional-capability vocabulary, and any workflow spec. No scoring predicate reads prose. A tooling spec fails the build if one does.

Step 1: rules subtract. Each rule is a predicate over the graph index plus facts. When it fires it emits a finding with a dimension, severity, affected node ids, and often a patch. Example from engine/rules/reliability.ts: if the prompt has an availability NFR, every database node with one instance and no replica neighbour yields a critical reliability finding. Every rule finding counts as a violation. The profile can re-grade severity per difficulty, so a queue without a dead-letter queue is worse at advanced than at intro.

Step 2: expectations earn. Each expectation applies only when its archetype, minimum difficulty, required NFR kind, and any extra predicate all match the prompt. It then returns met or unmet with evidence ids, and writes a coverage entry carrying its dimension and weight. An unmet expectation also emits a teaching finding, but that one does not subtract. The missing coverage already did.

Step 3: aggregate. The math lives in engine/core/aggregator.ts and reads constants from profile default@3.3.0.

1. Drop a rule finding when the profile pairs it with an expectation that is already unmet. One lesson, one charge.
2. Per dimension, base = 100 × met weight ÷ total weight over applicable expectations.
3. Sort that dimension's violations worst first, then by rule id and node ids. Subtract each at price × 0.7^position.
4. Dimension score = max(0, base − penalty), rounded to one decimal.
5. A dimension with zero applicable expectations and zero violations scores null and is excluded, so nothing unexamined is a free 100.
6. Overall = weighted mean over assessed dimensions, weights renormalised to their own sum.
7. Letter from bands, then cap. Caps read only deterministic findings.

Constants in the profile:

prices critical 35 · high 22 · medium 10 · low 4 · info 0
decay 0.7
weights scalability .1825 · explanation .17 · reliability .142
performance .1115 · data .1115 · product .10
messaging .071 · security .071 · hygiene .0405
bands A ≥ 92 · B ≥ 82 · C ≥ 68 · D ≥ 50 · else F
caps 1 critical → max C · 2 critical → max D
walkthrough missing (exp.nar.present unmet) → max C

Worked example for one dimension: reliability expectations met 3 of 4 by weight gives base 75. One critical and one medium violation subtract 35 + 10 × 0.7 = 42. Reliability scores 33.0, and the critical finding caps the letter at C regardless of the overall.

Why the result is byte-identical. Same graph and same prompt produce the same findings in the same order, the same coverage entries, and the same arithmetic against the same versioned constants. The aggregator also returns the ledger it computed from, so the trace in the run dump cannot disagree with the score. A calibration spec pins five reference designs to exact numbers, so any rubric change must move those pins on purpose.

When the eval LLM is live, a lens can add grounded weakness ordinals that subtract a bounded second term per dimension, at most 8 points per item and 20 per dimension. They never touch caps, and with the flag set that term is exactly zero.

LLM output enters the deterministic engine through exactly one door, and everything else it produces is display only. Here is the full path.

The port. Every LLM feature goes through packages/llm/src/llm-client.ts. It offers one method: a structured call with a zod schema, returning the validated object or null on refusal, parse failure, or API error. Callers must already hold a deterministic answer, so "no model" is never an error path.

What the five LLM passes get and give. Each pass runs after the two deterministic passes and receives the serialized design, the prompt facts, the narrative prose, and the prior artifacts. The critic, for instance, is handed the deterministic findings and told to report new insights only. A pass may return three artifact kinds, plus diagnostics when it is disabled, fails, or is clipped:

┌─────────────────┬───────────────────────────────┬────────────────────────────────────────────────────────────────┐
│ Kind │ Produced by │ Reaches the score? │
├─────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ graded-evidence │ all five lenses │ Yes, through one bounded scorer │
├─────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ axis │ depth, narrative, workability │ No. Displayed beside the grade │
├─────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ scenarios │ scenarios │ No directly. Each verdict is also converted to graded evidence │
└─────────────────┴───────────────────────────────┴────────────────────────────────────────────────────────────────┘

Grounding is enforced before the engine sees anything. The shared shape in engine/passes/graded-grounding.ts is spread into every lens's schema. A weakness carries four ordinals and ids, never a number:

- weakness magnitude and confidence, each one of none, low, medium, high.
- requirementId, a per-request z.enum over this prompt's NFR ids and workflow item ids.
- affectedComponents, a per-request enum over this canvas's node ids.
- dimension, chosen by the critic and depth lenses, fixed for the others. Narrative lands on explanation, scenarios on reliability, workability by a factor map. Scenario verdicts map survives to none, degrades to medium, fails to high.

After parsing, admitGrounding re-checks every id against the real prompt and graph and drops anything unknown. Then the orchestrator's mode gate strips any findings or coverage artifact an LLM pass tried to emit and records an llm-artifact-rejected diagnostic in its place.

The one door: a bounded, weakness-only subtraction. The aggregator routes by kind. Axes, scenarios, and diagnostics ride through to display. Only graded evidence reaches the scorer, per dimension:

w(level) none 0 · low 0.33 · medium 0.67 · high 1
list price 8 × w(weakness) × w(confidence)
order worst weakness first, then confidence, then ids
charge price × 0.7^position
clamp at most 20 points per dimension, scaled pro rata
score max(0, base − rule penalties − graded penalty)

A confident high weakness costs 8. A medium and medium one costs about 3.6. A hedged low costs under 1. Three constraints hold structurally: it can only lower, it only applies to a dimension the deterministic layer already assessed, and it never reaches the letter caps. Nothing an LLM says can turn a null dimension into a scored one or trip a cap.

What gets persisted. Each graded item is stored as a finding with source llm, titled by lens and requirement, so it shows up as a grounded improvement area with the rationale as its message. Axes and scenario reports are stored on the evaluation for the UI. The full ordered artifact list is stored as evidence for audit. One wrinkle: when the critic ran, its prose summary replaces the engine's composed summary as the evaluation headline. The numbers are still the engine's.

Two LLM uses outside the eval that still end at the deterministic engine:

- The AI coach proposes a whole candidate design. Off-vocabulary knobs are discarded, the graph must pass referential validation or the proposal is rejected, an invalid brief or narrative is dropped individually, and the survivor is re-scored with runEngine. That call is deterministic only, no LLM. A proposal persists only if the overall score strictly rises.
- The suggesters for bindings and interface options are enum-locked to gradeable vocabulary, each item is applied alone and validated, and none of it touches a grade until a human accepts it and submits.

Where the deep-eval iteration stands

Trajectory (session 8cf177bf…, one design revision per deep run, every one a deterministic 100/A first):

┌─────┬──────────────────────────────────────────────────────────────────┬────────────┬───────────────┐
│ rev │ design │ deep score │ charged items │
├─────┼──────────────────────────────────────────────────────────────────┼────────────┼───────────────┤
│ #2 │ r7 (the browser-built 100) │ 92.4 A │ 16 of 31 │
├─────┼──────────────────────────────────────────────────────────────────┼────────────┼───────────────┤
│ #3 │ r8 — every r7 finding answered │ 91.8 B │ 11 of 30 │
├─────┼──────────────────────────────────────────────────────────────────┼────────────┼───────────────┤
│ #4 │ r9 — honest cache-aside, identity/backfill/cursor/DLQ/monitoring │ 94.4 A │ 12 of 27 │
├─────┼──────────────────────────────────────────────────────────────────┼────────────┼───────────────┤
│ #5 │ r10 — link bootstrap, canonical key, tombstones, tiered sweeps │ 93.6 A │ 14 of 30 │
└─────┴──────────────────────────────────────────────────────────────────┴────────────┴───────────────┘

r10 is the first score on a corrected scorer, so it is not a regression from r9 — see below.

Three pipeline defects found and fixed along the way (all committed, all suites green):

- 7ab3e92 — every LLM pass read the narrative clipped at 2,000 chars; my 6.5k narrative was cut after the fifth component, and the critics charged for "unexplained" components they were never shown. The narrative now rides whole within the 24k document budget, and each slot is anchored ([n-4], [requirement #0]).
- 31c7446 — three predicates only recognised a cache with its own path to the DB, which forced the "Redis fetches from Postgres" arrow that two lenses correctly rejected. cacheFronts() now accepts cache-aside; calibration pins unchanged.
- 7fe55fb — the graded scorer's LEVEL_RANK was inverted: it charged the mildest item at full price and decayed the worst. The docs said worst-first; the only spec used identical items. Fixed and pinned.

Why it is not converging to 100, with numbers. Only items on deterministically-assessed dimensions subtract (here data/product/security/explanation/hygiene); one low/low item costs ~0.9 on its dimension. So 100 requires zero charged items from five lenses in a single run. Every round the lenses returned ~30 items regardless of what I fixed — each round one layer deeper (r10: version monotonicity, canonical-key uniqueness under partitioning, identity events sharing the order lane), and some mutually contradictory (drop hash partitioning vs. keep it with an identity table; draw the reconciler's link writes vs. keep the indexer the single writer). Depth and workability are prompted to "list the shallow spots / worst shortfalls", so they always list some. I also ran shadow lenses (a 5-agent workflow on the same system prompts) before each real run; they predicted the real findings well and still produced ~30 items per round. The design has meanwhile grown well past what the one-page take-home asks for.

Your call — I recommend the first:

1. Treat 100 as the deterministic rubric's score and give the deep eval a materiality policy: charge only medium+ weaknesses (or only weaknesses corroborated by ≥2 lenses), keep low items as surfaced advice. One profile change in default.profile.ts's gradedEvidence policy; I'd calibrate it on the four run dumps we now have.
2. Keep iterating the design as-is (~10 min per round; expect 93–96 with ±2 run-to-run variance, not 100).
3. Stop here: r10 is a strong design (deterministic 100, deep 93.6/A) and is the session's latest revision.

The stack is back on deterministic; the r10 design is scratchpad/r10-design.mjs and can be rebuilt click-by-click in the tab whenever you want.

Short answers first, then the detail.

- Deterministic mode means the grade is a pure function of the inputs. Rules and expectations run, the aggregator does the arithmetic, and the same design against the same prompt gives a byte-identical score every time. For grading, yes, no model participates. For the app as a whole, no: the default local stack keeps grading deterministic while the coach and both suggesters run live on your Claude login.
- 100 is reachable without a model, and only without one. A model can only subtract. So a deterministic 100 is the ceiling, and it means "nothing the rubric checks is missing", not "the design is good".
- EVAL_DETERMINISTIC governs grading. IMPROVER_DETERMINISTIC governs the coach and suggesters. Setting either to 0 permits a model; it does not turn one on. A key or a claude-code auth route still has to be present.

Why 100 is reachable deterministically. Each assessed dimension scores 100 × met weight ÷ total weight, minus rule penalties. Meet every applicable expectation and trigger no rule, and every dimension is 100, the overall is 100, the band is A, and no cap fires. Nothing structural prevents it. The aggregator specs assert an overall of 100 in three places, and the coach's loop stops with reason perfect the moment its best candidate reaches 100. What it takes in practice: every applicable expectation met, including the brief and narrative ones. The calibration table's "excellent design" is pinned at 80.5 and a C only because it submits no brief or narrative. Silence is graded. On a workflow prompt the product expectations must all be met too. Full marks also produce a specific summary sentence: nothing this rubric checks is missing, and cost, rollout, data modelling and operability sit outside what it can see.

Where a live model fits relative to that ceiling. Its five passes emit grounded weakness ordinals that subtract a bounded amount, at most 8 points per item and 20 per dimension, only from dimensions the deterministic layer already assessed, never past a letter cap. So a design that scores 100 deterministically might score lower under a live eval, never higher. That is the whole difference in the number.

EVAL_DETERMINISTIC=1 versus 0.

┌─────────────────────┬─────────────────────────────────────┬───────────────────────────────────────────────────────────────────────┐
│ │ =1 │ =0 and a key or EVAL_AUTH=claude-code │
├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Eval client │ no-op, even with a key exported │ live │
├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Passes that run │ rules, expectations │ rules, expectations, critic, depth, narrative, workability, scenarios │
├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Score sources │ base, rule penalties, caps │ the same, plus graded-evidence subtraction │
├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Persisted extras │ none │ axes, scenario reports, llm-source findings, critic model id │
├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Summary text │ the engine's composed sentence │ the critic's prose replaces it │
├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Run dump │ 06-llm/ empty, reason deterministic │ every prompt and response captured │
├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Time per submission │ milliseconds │ minutes, serial model calls │
├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Reproducible │ byte-identical │ no │
└─────────────────────┴─────────────────────────────────────┴─────────────────────────────────────────────┘

=1 also silences prompt enrichment, which uses the key-only client, and silences the coach and suggesters unless IMPROVER_DETERMINISTIC says otherwise. =0 with no key and no auth route is identical to =1 in effect.

IMPROVER_DETERMINISTIC=1 versus 0.

┌────────────┬──────────────────────────────────────────────────────┬───────────────────────────────────────────┬─────────────────────────────┐
│ │ =1 │ =0 and a key or IMPROVER_AUTH=claude-code │ unset │
├────────────┼──────────────────────────────────────────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
│ Coach │ start returns 409, availability reason deterministic │ proposes, one model call per iteration │ inherits EVAL_DETERMINISTIC │
├────────────┼──────────────────────────────────────────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
│ Suggesters │ empty list, model: null │ live proposals │ inherits │
├────────────┼──────────────────────────────────────────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
│ Grading │ unaffected │ unaffected │ unaffected │
└────────────┴──────────────────────────────────────────────────────┴───────────────────────────────────────────┴─────────────────────────────┘

The coach never grades with a model regardless of either flag. Every proposal is scored by the sync façade, which runs only the two deterministic passes, and is accepted only if the overall strictly rises. One subtlety follows: an accepted revision is then graded by the full eval pipeline as a normal job. Under the default stack, with EVAL_DETERMINISTIC=1 and IMPROVER_DETERMINISTIC=0, that persisted grade equals the coach's internal score. Under a deep eval, with both at 0 and a live eval client, the persisted grade can come in lower than what the coach computed, because the model passes subtract.

The four combinations.

┌──────┬────────────┬──────────────────────┬──────────────────────┬───────────────┬─────────────────┐
│ EVAL │ IMPROVER │ Grading │ Coach and suggesters │ Prompt polish │ Who uses it │
├──────┼────────────┼──────────────────────┼──────────────────────┼───────────────┼─────────────────┤
│ 1 │ unset or 1 │ deterministic │ off │ off │ CI, e2e, vitest │
├──────┼────────────┼──────────────────────┼──────────────────────┼───────────────┼─────────────────┤
│ 1 │ 0 │ deterministic │ live if auth present │ off │ pnpm stack:up │
├──────┼────────────┼──────────────────────┼──────────────────────┼───────────────┼─────────────────┤
│ 0 │ unset or 0 │ live if auth present │ live if auth present │ live if key │ deep eval │
├──────┼────────────┼──────────────────────┼──────────────────────┼───────────────┼─────────────────┤
│ 0 │ 1 │ live if auth present │ off │ live if key │ unusual │
└──────┴────────────┴──────────────────────┴──────────────────────┴───────────────┴─────────────────┘

Done. The gap analysis is at docs/pipeline-best-practices/gap-analysis.md (263 lines, prettier-clean, every file citation verified against the exact declaration line). No code was touched, nothing is committed, and the four decisions you made are recorded in project memory so future sessions start from them.

Your two direct questions.

"Permits a model" means the determinism flag is a veto checked first: 1 returns the no-op client regardless of anything else,
0 merely steps aside so the factory can look for a key and then the claude-code route, and with neither it still returns no-op.

Critic scoring is subtraction-only by construction:
the shared lens schema has no positive field,
the scorer only lowers already-assessed dimensions within a clamp,
and the caps never see LLM evidence.

What the doc establishes. Eight doctrine items are already met, and the headline rule (models produce evidence, the system decides) is enforced at the type, orchestration, arithmetic, and process levels. Seven substantive gaps remain, verified by an adversarial read-only audit:

- Coverage comes from archetype banks, not the prompt's contract. 65 of 95 expectations are pinned to one archetype, authored prompts inherit a rubric by picking an experience, and only latency and freshness targets are read numerically. The availability readers exist and are called by nothing.
- Critic and evaluator collapse into one weakness ordinal, so the deterministic rubric is the sole source of credit and also defines the ceiling.
- There is no controller. Confidence discounts a penalty and is then dropped at persistence, so the UI cannot show an uncertain grade.
- Judge robustness is containment, not measurement: one sample, no temperature, no memoisation, no drift or agreement tracking, CI never calls a model, and a critic re-raising a fired rule double-charges.
- The finding contract lacks defect type, fixability, stable ids, and schema versions. Two display leaks let the model author the summary sentence and the depth and narrative numbers.
- Lenses are code, not configuration, and run serially without needing to.
- Dumps capture everything and nothing reads them.

Direction, with your decisions folded in. Eight ranked moves, led by requirement-derived coverage with archetype optional, a criterion-shaped LLM artifact with polarity while the score stays weakness-only, and a hardened judge seam with temperature zero, content-hash memoisation, and n-sample agreement on by default. A human review queue, telemetry dashboards, and canary infrastructure are explicitly not recommended at single-user scale. The doc closes by noting that the moves need their own plan and deliberate calibration re-pinning before any code changes.

The no-op is a 15-line class, not an empty response. packages/llm/src/noop-client.ts implements the same LlmClient port as the real clients with three members: enabled = false, model = null, and a completeStructured that resolves to null without looking at the request. It never fabricates a schema-shaped object. Every consumer checks enabled first and skips prompt assembly entirely, so in deterministic mode no system prompt is even built. That is why the 06-llm/ folder in a run dump is empty rather than full of blank exchanges.

What each pipeline does when it holds one. The result is a typed "nothing happened", specific to the pipeline, never an empty critique.

┌─────────────────┬────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────┐
│ Pipeline │ Check │ What comes back instead of evidence │
├─────────────────┼────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
│ Eval, five LLM │ if (!ctx.llm.enabled) in each pass │ A diagnostics artifact with skipped: true, reason: 'llm-disabled'. No │
│ passes │ │ graded-evidence, axis, or scenarios artifact is produced at all. │
├─────────────────┼────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
│ Eval, runner │ eval-runner.service.ts:256 │ Manifest records llm: { enabled: false, model: null, reason: 'deterministic' }; │
│ and dump │ │ criticModel persists as null; the summary is the engine's composed sentence. │
├─────────────────┼────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
│ Coach │ improvement-runner.service.ts:79, │ The API refuses to start a run with 409 first; if a run is somehow claimed, it │
│ │ llm-proposer.ts:246 │ finalizes as failed with reason llm-unavailable. The proposer returns null. │
├─────────────────┼────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
│ Suggesters │ suggest-bindings.ts:49, │ return [], so the response is { proposals: [], model: null }. │
│ │ suggest-interface.ts:64 │ │
├─────────────────┼────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
│ Prompt │ enrich-prompt.ts:53 │ passThrough: the generator's own prose, llmEnriched: false. │
│ enrichment │ │ │
└─────────────────┴────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────┘

So the evidence array for a deterministic evaluation contains exactly two scoring artifacts (findings and coverage) plus five diagnostics. The aggregator's collect puts diagnostics in a bucket the math never reads.

Three kinds of "nothing" that look alike. The passes distinguish them by checking enabled before calling. llm-disabled means the no-op client. llm-failed means a live client returned null because the model refused, missed the schema, or the API errored. not-applicable means the pass had nothing to judge, such as no narrative submitted or no workflow spec on the prompt. Only the first is deterministic mode.

Files to study, in reading order.

The switch itself:

- packages/llm/src/llm-client.ts (the port), noop-client.ts, create-client.ts (the three factories and the improverEnv fallback), and create-client.spec.ts, which pins the precedence rules including "EVAL_DETERMINISTIC=1 outranks a key and claude-code".

EVAL_DETERMINISTIC=1 in the grading path:

- packages/eval-worker/src/modules/poller/poller.module.ts:17 binds the eval client.
- engine/core/orchestrator.ts runs the passes; engine/core/artifacts.ts defines DiagnosticsArtifact and its reasons.
- The five disabled checks: critic.pass.ts:21, depth.pass.ts:40, narrative.pass.ts:104, workability.pass.ts:100, scenarios.pass.ts:46.
- engine/core/aggregator.ts collect shows diagnostics riding along unscored.
- eval-runner.service.ts:252 llmStatus and dump/eval-dump.ts:322 show how the reason is recorded.
- Specs: poller.spec.ts runs a full job under EVAL_DETERMINISTIC=1 and asserts the engine summary and no model; orchestrator.spec.ts and the four *.pass.spec.ts files cover the disabled and failed branches.

IMPROVER_DETERMINISTIC=1 in the coach and suggesters:

- packages/eval-worker/src/modules/improver/improver.module.ts:16 binds the improver client; improvement-runner.service.ts:79 and proposers/llm-proposer.ts:246 are the checks; improver.spec.ts sets EVAL_DETERMINISTIC=1 and exercises the unavailable path.
- packages/studio-api/src/modules/improvement-runs/improvement-runs.service.ts availability() and the 409 in start().
- packages/studio-api/src/modules/llm/llm.module.ts and llm.token.ts bind the same factory as SUGGESTION_LLM; sessions.service.ts:129, :194, :229 report model: null; suggest-bindings.spec.ts and suggest-interface.spec.ts assert the empty list.
- packages/studio-e2e/src/requirements/ai-coach.spec.ts shows the UI when the coach is disabled.

Where the flags are set:

- scripts/stack.sh:18 (EVAL_DETERMINISTIC=1, IMPROVER_DETERMINISTIC=0, IMPROVER_AUTH=claude-code), .github/workflows/ci.yml:40, packages/studio-e2e/playwright.config.ts:85 and :94, packages/studio-api/vite.config.ts:24.

### TEMP BRAINSTORMING

- Have some premade prompts - to feed input to critic/eval pipelines
  - Pipeline for generating a prompt based on a high level user input description of what they want to system design

- Pipleine for deconstructing concrete requirements from the prompt text into function, non-functional, scale-targets, and product workflow requirements

- Pipeline for producers generating design artifacts + recalling passed learned facts
  - Need a component library / language for determining expertise on state and action space
  - Making a graph that is valid

- Pipeline to find weaknesses in design based on requirements and critic expertise
  - hardcode critic expert md files for now

- Evaluator to use lens type to judge/reconcile design input effectiveness against requirements
  - hardcode generic level evalautors in md files mainly for requirement judging
  - N times for variance and grounding expectations

- Pipeline for controller decisions
  - like aggregator.ts
  - should be a strategy service - plug-and-play with deterministic rules taking as inputs evidence and policy
- Pipeline for storing learings / rationales
  - system design vector db

## Priorities:

- Read other docs first in /docs folder + review determinsitic scoring paths by factor to understand the logic first + understand folder structure in monorepo
- Remove flag complexity - make llm be requirement (do not expect noOps) and if no llm then fail - also figure out files that do grading per dimension when only deterministic & what evidience they read if no evidence is being supplied from llm's (is this just based on binding validations?)
- Consolidate a project config file that feeds the global env vars so that there is a source of truth and to prevent headhunting them in the future

### NEXT PROMPT REQUIREMENTS

- removed all the 'llm-disabled' and no-op client support this was never an intention - assumption should be llm is working - if it isn't then throw error earlier in the pre-condition validations of the pipeline

How exactly is grading happening then when IMPROVER_DETERMINISTIC=1? how is evidence outputted of no llm's are being used to generate it? Also regarding "=1 also silences prompt enrichment, which uses the key-only client, and silences the coach and suggesters unless IMPROVER_DETERMINISTIC says otherwise. =0 with no key and no auth route is identical to =1 in effect." we should always have a key/subscription (eg. anthropic) else the whole pipeline should fail. It is either llm's are available from the start through valid api key / subscription or the whole pipeline should fail since I ONLY WANT EVIDENCE FROM LLM's and not hardcoded evidence.
Also do we really need archetypes? What are these for? Shouldn't we just stick to requirements from the prompt & prompt if needed should be themed in any arbitrary "archetype" chosen without needing to use archetype in logic -- we can instead just turn the prompt to listed rquirements and make the whole logic way simpler ultrathink

Regarding "What the doc establishes. Eight doctrine items are already met, and the headline rule (models produce evidence, the system decides) is enforced at the type, orchestration, arithmetic, and process levels."

Fix the following gaps:

- Coverage comes from archetype banks, not the prompt's contract. 65 of 95 expectations are pinned to one archetype, authored prompts inherit a rubric by picking an experience, and only latency and freshness targets are read numerically. The availability readers exist and are called by nothing. --- ESPECIALLY MAKE SURE WE COMPLETELY REMOVE ANY TRACE OF ARCHETYPE SINCE WE DO NOT NEED IT! IT IS OVERCOMPLICATING THE LOGIC. WE ONLY CARE ABOUT PROMPT REQUIREMENTS. AND A PROMPT CAN ESSENTIALLY REPRESENT AN "ARCHETYPE" THROUGH ITS REQUIREMENTS AND PRODUCT BUSINESS TYPE FOCUS.

- Critic and evaluator collapse into one weakness ordinal, so the deterministic rubric is the sole source of credit and also defines the ceiling.
- There is no controller. Confidence discounts a penalty and is then dropped at persistence, so the UI cannot show an uncertain grade.
- Judge robustness is containment, not measurement: one sample, no temperature, no memoisation, no drift or agreement tracking, CI never calls a model, and a critic re-raising a fired rule double-charges.
- The finding contract lacks defect type, fixability, stable ids, and schema versions. Two display leaks let the model author the summary sentence and the depth and narrative numbers.
- Lenses are code, not configuration, and run serially without needing to.
- Dumps capture everything and nothing reads them.

FOCUS FINAL DESIGN AND IMPLEMENTATION ON MAXIMUM CODE MAINTENANCE, REFACTORING FOR DRY AND REUSABILITY PRINCIPLES, IMPROVING EXISTING CODE INSTEAD OF ADDING MORE COMPLICATED LOC LOGIC, AND THE FOLLOWING:
led by requirement-derived coverage with archetype BEING COMPLETELY REMOVED FROM THE PROJECT RATHER THAN OPTIONAL***, a criterion-shaped LLM artifact with polarity while the score stays weakness-only, and a hardened judge seam with temperature zero, content-hash memoisation, and n-sample agreement on by default. A human review queue, telemetry dashboards, and canary infrastructure are explicitly not recommended at single-user scale. The doc closes by noting that the moves need their own plan and deliberate calibration re-pinning before any code changes.
