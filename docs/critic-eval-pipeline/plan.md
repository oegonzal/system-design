How the critic-eval pipeline works today

The full loop, end to end:

1. Submit — POST /sessions/:id/revisions validates the graph shape (400) and references (422), then in one transaction writes the revision, an evaluation row (queued), and an eval_job row in a Postgres-backed queue.
2. Claim — the eval-worker's poller ticks every second, first re-queueing stale jobs (locked >5 min), then claiming one job atomically via FOR UPDATE SKIP LOCKED.
3. Facts — the runner loads revision + prompt and flattens the prompt into PromptFacts: archetype, difficulty, scale targets, the set of NFR kinds only (statements and targets like "p99 ≤ 300ms" are dropped on the floor), and functional requirements as one lowercased keyword blob.
4. Deterministic engine — a pure function runs 18 rules across 7 dimensions over a graph index (BFS reachability, path-avoiding-kinds). Each violated rule emits a finding with a teaching message and sometimes a GraphPatch suggestion (the ghost previews you accept on canvas).
5. Scoring — every dimension starts at 100 and subtracts severity weights (critical 40, high 25, medium 12, low 5, info 0), floored at 0. Overall = weighted mean; grades A≥90 / B≥75 / C≥60 / D≥45.
6. Critic — if ANTHROPIC_API_KEY is set (and not EVAL_DETERMINISTIC), the LLM gets the serialized graph + rule findings and may add at most 4 annotate-only findings (source='llm'). It can never move a score, and it never even sees the NFR list.
7. Persist + poll — findings replace (not append) in one transaction; the UI polls GET /revisions/:id/evaluation every 1.2s.

Why your grades are too high — the receipts

Your instinct is exactly right, and it's structural, not tuning:

- Absence is free. Scoring only subtracts from 100, so a design is punished for what it does wrong, never for what it fails to demonstrate. The smoking gun: an empty canvas scores 100/A — that's literally asserted in the engine tests. The naive 3-box analytics design (client → service → db) scores 90.7/A because only 3 rules can fire on it; 4 of 7 dimensions sit untouched at 100.
- The catalog is sparse and prompt-blind. Only 5 of 18 rules read prompt context. difficulty is read by zero rules — an advanced prompt at 100× RPS is graded identically to intro. 7 of 8 NFR kinds (consistency, durability, throughput, cost, security, observability…) are never consulted. Two of five archetypes have no rules at all.
- Saturation hides depth. max(0, …) means the third critical in a dimension zeroes it and the fourth is invisible.
- The critic can't compensate — 4 findings max, score-inert, NFR-blind.
- Inputs are shallow. Node config has 5 possible keys (2 are dead — nothing reads cache strategy/ttlSeconds), and nothing anywhere models roles, operations, or what an edge actually carries — so rules couldn't judge responsibility design even if they existed.

The ideation menu

A. Scoring core — my recommendation is a hybrid coverage model: a deterministic deriveExpectations(promptFacts) produces a per-dimension checklist of capabilities the design must demonstrate (flash-sale standard: ingress protection, write buffering, read scaling, failover, async decoupling…; advanced adds multi-region, exactly-once/idempotency, DR). Dimension score = coverage earned − violation penalties, plus grade caps (any critical caps you at C, two at D) and hardened bands. Unmet expectations become findings with ghost-fix suggestions, so the existing teaching UX carries over — and an empty canvas becomes an F naturally, because it demonstrates nothing. Alternative: keep the subtractive model and just add "absence rules" + caps (less invasive, but uncovered dimensions still default to perfect).

B. Rule catalog 18 → ~60: per-NFR-kind packs, archetype packs for the two uncovered archetypes, difficulty-gated strictness, quantitative checks (declared replicas vs. required RPS), plus graph-index upgrades (edge-kind-aware traversal, cycles, hop counts) to make harsher predicates expressible.

C. Machine-readable NFRs + a coverage UI: structure NfrItem.target (the generator already computes the numbers — it just renders them to prose), give findings a back-reference to the NFR/expectation they prove unmet, and add a "Requirements coverage" checklist to the feedback panel so you see what you haven't addressed, not just what you got wrong.

D. Critic intensity (composable): richer input (full NFRs + rubric, cap 4→10); a separate LLM-graded "depth & justification" axis shown beside the deterministic score (keeps scores deterministic/comparable); an adversarial scenario pass ("a region dies mid-on-sale — walk the failure") producing failure-story findings. I'd avoid letting the LLM move the deterministic score itself — you lose revision-to-revision comparability.

E. Blocks library 16 → ~40, categorized — clients/edge, traffic & routing, compute, data (warehouse, lake, kv, time-series, vector…), messaging (CDC, saga/workflow engine…), coordination (locks, id-gen, feature flags, secrets), identity, observability, external. Two real constraints surfaced: every kind needs an AA-contrast color pair × 4 accents × 2 modes (35+ distinguishable hues is genuinely hard → category-colored chips with per-kind icons is the better axis), and kinds without rules are invisible to grading — so library size and rule coverage need to move together, or new kinds get explicit LLM-only treatment.

F. API / roles / actions — the strongest shape: structured contracts on the existing elements, not a new "API" node. Nodes gain responsibilities (roles) and operations ({name, kind: command|query|event, idempotent?}) — services/gateways declare endpoints, topics/queues declare event/message types — and edges gain carries: {operation, protocol} referencing the target's ops. That unlocks a whole class of role-based rules (SRP violations, unspecified interactions penalized at higher difficulty, non-idempotent consumers on at-least-once queues, queries on the write path) and gives the critic real material to judge boundaries. Needs new sibling fields on the contracts (the config bag is typed flat-scalar), size caps (config is currently unbounded straight into the DB and critic prompt), and update-edge/remove-node patch ops.

I've drafted all of this with file-level pointers into the plan file. Four decisions shape everything downstream:

Eval Intensity Overhaul · 41-Kind Block Library · API/Role Modeling — Final Plan

▎ Supersedes the executed scaffold plan. Designed 2026-08-28 from three reconciled
▎ Plan-agent designs (eval architecture, blocks library, interface contracts) after
▎ user axis decisions.

Context

The deterministic eval engine grades over-simplistic diagrams far too generously —
structurally, not by tuning: scoreDimensions starts every dimension at 100 and only
subtracts, so an empty canvas scores 100/A (asserted in engine.spec.ts:119-124) and
the naive 3-box analytics fixture scores 90.7/A. Only 5 of 19 rules read prompt
context; difficulty is read by zero rules; NFR statements/targets are dropped before
rules run; 2 of 5 archetypes have no rules; the LLM critic is capped at 4 findings,
score-inert, and never sees the NFR list. The palette has 16 kinds (flat list) and
nothing models roles/operations/interfaces.

User decisions (2026-08-28):

1. Scoring: hybrid coverage + violations + grade caps (naive 3-box → D/F, empty → F).
2. Critic: richer input + more findings; separate LLM depth axis; adversarial
   scenario pass; LLM never moves the deterministic score.
3. Architectural requirement (user verbatim): "Assure critic/eval/scoring strategies
   are composable, extensible, declarative, and configurable such that it is easy to
   make combinations of critic/eval/scoring strategies and deterministic decisions
   based on artifacts and evidence."
4. Blocks: ~40 distinct kinds, categorized palette, category coloring + per-kind icons.
5. API modeling: full contracts — node responsibilities + operations, edges declare
   carried operations; unspecified interfaces penalized at standard/advanced.

---

Workstream A — Composable eval core (packages/eval-worker)

A.1 Pass architecture (the composability requirement)

New layout under packages/eval-worker/src/engine/:
core/ types.ts (PromptFacts+, PassContext, EvalPass) · artifacts.ts (evidence union)
profile.ts (EvalProfile/ScoringPolicy + validateProfile) · aggregator.ts (pure)
orchestrator.ts (runs passes serially in profile order)
passes/ rules/ (rules.pass.ts + packs/* + severity-policy.ts)
expectations/ (expectations.pass.ts + types.ts + banks/*)
depth/ (depth.pass.ts + zod schema + prompt)
scenarios/ (scenarios.pass.ts + scenario-table.ts + zod schema)
critic/ (existing free-form critic moved here as a pass)
profiles/ default.profile.ts (default@2.0.0) · index.ts registry
serialization/graph-text.ts (ONE token-guarded serializer for all 3 LLM passes)

- EvalPass { id, mode: 'deterministic'|'llm', run(ctx): Promise<EvidenceArtifact[]> };
  never throws — LLM passes resolve to DiagnosticsArtifact {skipped, reason: 'llm-disabled'|'llm-failed'|'token-clipped'}.
- Evidence artifacts (the ONLY currency): FindingsArtifact (findings +
  countsAsViolation, expectationId?, nfrId?), CoverageArtifact (every applicable
  expectation met/unmet + evidence node/edge ids), AxisArtifact (depth: score,
  subScores, summary, model), ScenarioArtifact (reports: verdict
  survives|degrades|fails + story + weakestNodeIds), AnnotationArtifact (free critic),
  DiagnosticsArtifact.
- EvalProfile { id, version, passes: [{pass, enabled, options}], scoring: ScoringPolicy }.
  Types in packages/contracts/src/lib/eval-profile.ts; instances in
  eval-worker profiles/ (scoring policy is engine behavior, not wire contract).
  Every evaluation persists profile_id+profile_version.
- Aggregator is pure: only Findings+Coverage artifacts feed score math; Axis/Scenario/
  Annotation pass through untouched — unit test injects a fake axis score 0 and asserts
  identical dimension scores (structural proof LLM can't move the grade).
- Determinism: deterministic passes are pure fns of (graph, facts); orchestrator runs
  serially; aggregator re-sorts findings with today's comparator; permutation test.

A.2 Expectation system + scoring v2

Expectation { id ≤60, dimension, weight, severityIfUnmet, nfrKind?, minDifficulty, archetypes|'all', appliesWhen?, title, teach(facts), satisfiedBy(ctx)→{met, evidence ids}, suggest?(ctx)→GraphPatch }. Unmet ⇒ finding source:'expectation', with ghost-fix
suggestion where feasible (reuses existing findings UI + ghost preview).

Scoring math (profile default@2.0.0):

- Dimension base = 100·Σ(w·met)/Σ(w) over applicable expectations (empty set ⇒ 100).
- Violation penalty (rule findings only — unmet expectations already cut the base; no
  double jeopardy): severities {critical 35, high 22, medium 10, low 4, info 0} with
  geometric decay 0.7 per extra finding in the dimension (replaces the hard floor).
- score_d = round1(max(0, base − pen)); overall = weighted mean (weights unchanged).
- Suppressions (one lesson, one finding): rule finding dropped when its paired
  expectation is unmet — pairs incl. single-db-no-replica↔exp.fst.db-failover,
  no-queue-for-spike↔write-spike-buffer, no-cache-read-heavy↔read-cache,
  no-gateway↔edge-front-door, no-rate-limit↔rate-limit-edge, queue-no-dlq↔dlq-on-queues.
- Bands hardened: A≥92, B≥82, C≥68, D≥50. Grade caps (deterministic findings only):
  ≥1 critical → ≤C; ≥2 critical → ≤D (numeric score stands; DTO carries capApplied).
- ENGINE_VERSION → '2.0.0' (update pins: scoring.spec.ts:81, poller.spec.ts:117,
  studio-ui/src/testing/fixtures.ts:182).

Banks: banks/core.ts (universal: entry-service critical, durable-store-reachable
critical) + full flash-sale bank (intro: edge-front-door, stateless-scale-out,
db-failover, write-spike-buffer, async-worker-drain, read-cache; standard adds:
rate-limit-edge, dlq-on-queues, low-latency-read-path, cdn-static, waiting-room,
oversell-guard, order-pipeline-observed, payment-isolation; advanced adds: multi-region,
idempotent-checkout, cost-scale-down, hot-partition-mitigation) + banks for
media-streaming, workflow-automation, realtime-analytics, dag-orchestration (~10-12
each across tiers; the two currently-ruleless archetypes get full coverage). Full bank
specs were designed — see plan-agent report in session transcript; ids follow
exp.<archetype-abbr>.<slug>.

Calibration table (flash-sale standard, fixture facts) — asserted verbatim by new
engine/calibration.spec.ts [EVAL-5]:

┌─────────────────────────────────────────────────────┬─────────┬───────────────────────────┐
│ Design │ Overall │ Grade │
├─────────────────────────────────────────────────────┼─────────┼───────────────────────────┤
│ Empty canvas │ 0.0 │ F │
├─────────────────────────────────────────────────────┼─────────┼───────────────────────────┤
│ Naive 3-box (naive-flash-sale.graph.json) │ 20.0 │ F │
├─────────────────────────────────────────────────────┼─────────┼───────────────────────────┤
│ Naive + accepted replica (e2e rev 2) │ 25.6 │ F (strictly > 20.0 ✓ e2e) │
├─────────────────────────────────────────────────────┼─────────┼───────────────────────────┤
│ Solid fixture │ 86.5 │ B │
├─────────────────────────────────────────────────────┼─────────┼───────────────────────────┤
│ Excellent (solid + waiting-room + CDN + monitoring) │ 100.0 │ A │
└─────────────────────────────────────────────────────┴─────────┴───────────────────────────┘

E2E survival: unmet exp.fst.db-failover keeps the exact title 'Single database
with no replica' + identical replica patch, so practice-loop.spec + evaluation-feedback
selectors/highlight/ghost-accept pass unmodified; score-strictly-increases holds (20.0→25.6).

A.3 Contracts / DB / plumbing

- evaluations.ts: FINDING_SOURCES += 'expectation'; FindingDto += expectationId/nfrId/
  scenarioId (null); EvaluationDto += axes: EvalAxisDto[] (generic axes array — the
  extensible choice), scenarios: ScenarioReportDto[], profileId/profileVersion,
  capApplied. New eval-profile.ts for shared types. UI SOURCE_LABEL += expectation→'coverage'.
- Keep 7 dimensions (decision): observability-NFR expectations map to reliability,
  cost-NFR to scalability; nfrId badge carries the teaching signal. Avoids
  finding_dimension_check migration, weight renorm, meter sprawl, empty-dimension inflation.
- Migrations (hand-written DDL): (1) finding += expectation_id varchar(60), nfr_id
  varchar(60), scenario_id varchar(40); source check re-add w/ 'expectation'.
  (2) evaluation += evidence jsonb, axes jsonb, profile_id varchar(40), profile_version
  varchar(20), cap_applied jsonb. Entities mirror w/ satisfies Contracts.*.
- Evidence persistence: full ordered artifact list in evaluation.evidence (audit
  trail); findings stay normalized (UI click-to-highlight depends on them).
- Runner: PromptFacts += nfrs: NfrFact[] (id, kind, statement, target, targetSpec) —
  statements/targets no longer dropped; legacy prompt rows get ${kind}-${i} fallback ids.
- Generator v2: NfrItem += id + targetSpec {metric, op, value, unit} (additive; prose
  kept); requirement-banks entries get literal ids + targetSpec from ARCHETYPE_BASELINES;
  GENERATOR_VERSION 1.0.0→2.0.0; enrichment fence untouched.
- UI: cap badge in score-summary; coverage badge in findings-list; depth-axis meter
  block ("AI-assessed — does not affect the grade", null-safe when LLM off); scenarios
  list; ghost preview support for update-edge/remove-node ops.

A.4 LLM passes

- Free critic pass: cap 4→10 findings, maxTokens 8192, prompt now includes full NFR
  block + ops/responsibilities via shared serializer; dedup list includes unmet expectations.
- Depth axis pass: zod {depthScore 0-100, subScores {tradeoffArticulation,
  bottleneckAwareness, failureDesign, dataFlowClarity}, summary ≤1200}; rubric grades
  mechanism-depth beyond the deterministic checklist (coverage ledger included so it
  grades beyond coverage). Emits AxisArtifact 'depth'.
- Scenario pass: deterministic scenario-table selection per archetype×difficulty
  (flash-sale: thundering-herd / +hot-partition / +region-loss; media: viral-title /
  +cdn-node-loss / +region-loss; workflow: third-party-outage / +poison-workflow /
  +region-loss; analytics: ingest-burst / +hot-partition / +region-loss; dag:
  worker-crash / +scheduler-crash / +split-brain). zod schema enum-locks scenarioId to
  the selection (LLM narrates, never invents). fails→high / degrades→medium advisory
  findings (source 'llm', scenarioId set, ids clamped to real nodes); full reports in
  evidence + EvaluationDto.scenarios.
- serialization/graph-text.ts: one deterministic serializer (nodes+config clipped
  200 chars, ≤6 ops/node w/ elision, edges+carries, full NFR block, scale, rubric);
  hard clip 24k chars ⇒ DiagnosticsArtifact 'token-clipped'.

A.5 Rule catalog expansion (19 → ~62 core + ops pack)

GraphIndex additions first: edgeKinds filter option on traversal, hopCount,
longestChain, hasCycle, components, edgesBetween, producersOf/consumersOf,
opsOf/carriedOps (safe [] on legacy graphs).

New packs (ids ≤60 chars; full predicates in session transcript; each rule spec'd with
trigger/non-trigger pairs): reliability+ (single-service-instance, replica-not-wired,
single-gateway-advanced, circuit-breaker-missing, deep-sync-no-timeouts,
scheduler-single-point, queue-producer-overload) · capacity (quantitative:
capacity-replicas-insufficient w/ PER_REPLICA_RPS table, db-write-bottleneck,
worker-pool-underscaled, no-sharding-hot-writes, hot-partition-risk) · performance+
(deep-sync-chain, origin-serves-media, replica-unused-for-reads) · consistency
(dual-write-no-outbox, no-idempotent-consumers, cache-no-invalidation,
replica-receives-writes, multi-writer-inventory) · durability (queue-not-durable,
no-backup-strategy, ack-before-persist, stream-no-retention) · observability
(nothing-monitored, queue-depth-unwatched, dlq-unmonitored, no-tracing-many-services —
dimension reliability; satisfied by observability NODES per reconciliation R5) ·
cost (no-autoscaling, storage-no-tiering, overengineered-intro) · security+
(edge-hits-data-layer, gateway-no-auth, secrets-unmanaged, client-writes-queue) ·
workflow pack (no-intake-buffer critical, no-executor-worker critical,
worker-sync-third-party, run-state-not-durable, no-delay-scheduler,
no-tenant-partitioning) · dag pack (no-scheduler critical, no-worker-pool critical,
scheduler-does-the-work, no-state-checkpoint, progress-only-in-queue, sync-dispatch,
dynamic-fanout-sync) · hygiene+ (sync-cycle, disconnected-clusters, duplicate-edges,
decorative-canvas critical) · plus new-kind rules from the blocks catalog's rule-hooks
column (websocket/batch-job/pub-sub/cdc/payment-provider misuse etc.) folded into the
matching packs as kinds land.

Difficulty-gated strictness via declarative severity-policy.ts (profile options),
e.g. queue-no-dlq medium@standard/high@advanced.

---

Workstream B — Blocks library: 41 kinds, 11 categories (contracts + design-system + studio-ui)

- Catalog: 16 existing unchanged (slugs+labels stable → stored graphs untouched) + 25
  new: websocket-gateway, service-mesh (traffic) · serverless-function, batch-job
  (compute) · kv-store, time-series-db, vector-db (data) · pub-sub, cdc-connector
  (outbox folded in), notification-service (messaging) · stream-processor,
  data-warehouse, data-lake, ml-inference (analytics) · workflow-engine,
  distributed-lock, id-generator, config-service (coordination) · auth-service,
  secrets-manager, waf (security) · monitoring, logging, tracing (observability —
  annotation nodes, presence-graded, never path hops) · payment-provider (external).
  Explicit folds: document/wide-column DB → database config.engine; DLQ → queue knob;
  reverse-proxy → load-balancer; feature-flag → config-service; one client kind.
- Categories: NODE_KIND_CATEGORIES (11, ordered) + NODE_KIND_CATEGORY satisfies Record<NodeKind, CategoryId> + kindsInCategory() helper — all in contracts
  canvas.ts; NODE_KINDS tuple reordered by category w/ comment headers (safe: no
  consumer is index-based). Contracts spec: category ids valid + every category non-empty.
- Colors become category-driven (semantic.ts): CATEGORY_COLORS (11 IntentPairs
  anchored to existing hues — database green #1d7a4b, cache amber, queue orange stay;
  2 new hues: security deep rose, observability deep plum) + empty per-kind override
  table; nodeKind/nodeKindFg maps DERIVED (override ?? category) so read-sites
  don't change; add nodeKindCategory role. 9 of 16 kinds shift hue (visual re-theme
  only — color was never persisted). contrast.spec: per-kind test auto-grows; add
  category-pair AA test + override-differs test; key-set/mode-independence tests kept.
- Icons: 25 new hand-drawn SVGs in the existing style (16-grid, stroke 1.4,
  currentColor; glyph concepts designed per kind — see transcript); no icon dependency.
  Split node-icons.tsx per category if the file-size review rule trips.
- Palette: visible category sections (section + sticky h3 heading + category color
  dot; flat li per kind inside per-category ul → listitem count === NODE_KINDS.length so
  palette.spec passes); testid discipline: category wrappers use blocks- prefix
  (palette- reserved for kind buttons — e2e ^="palette-" count gate). Filter
  TextField blocks-filter: case-insensitive substring over label/slug/category, hides
  empty categories, role="status" empty message, Escape clears; default state shows
  everything so e2e [UX-1] unchanged. No accordion (toBeVisible gate).
- Config knobs: full per-kind table designed (database engine/sharding/consistency;
  queue delivery(at-least-once|at-most-once|exactly-once)/ordering/maxRetries; cache
  eviction; lb algorithm; gateway authMode; external-api timeoutMs/retries/
  circuitBreaker; ~40 kinds' knobs — canonical vocabulary, see reconciliation R4).
  node-config-fields.tsx stays the single switch(kind) seam.
- Kind select: optgroup per category, option text = DEFAULT_NODE_LABELS (values stay
  slugs — e2e selectOption by value unaffected).
- Stories/tests: sd-node group stories → one per category (11); colors.stories
  restyled by category + stale "sixteen" docstring fixed; palette [UX-4] specs
  (headings, filter narrows, Escape restores); properties stories for novel forms;
  criteria += UX-4 "Palette blocks are grouped into visible categories and filterable
  by name" (same commit as claiming tests).

---

Workstream C — Interface modeling: responsibilities / operations / carries

- Wire model (contracts canvas.ts + new interfaces.ts):
  OPERATION_KINDS = ['command','query','event','stream']; NodeOperation {name ≤60, kind, idempotent?, notes? ≤140}; CanvasNode += responsibilities?: string[] (≤6×60), operations?: NodeOperation[] (≤12); CanvasEdge += carries?: string[] (≤8) — plain
  op-name strings (protocol deferred; deliberate). Caps: CANVAS_MAX_TOTAL_OPERATIONS
  400 (graph-validator) + config retrofit caps (20 keys, key ≤40, string value ≤120).
- Ownership rule (resolveInterfaceOwner, one pure fn used by UI/validator/critic/
  rules): channel endpoint owns (queue/topic edges carry the channel's message types);
  else callee (target) owns; storage/edge-infra kinds own nothing (no carries editor).
- INTERFACE_CAPABILITIES satisfies Record<NodeKind, {role: api|channel|storage|
  edge-infra|passive, operationKinds, editorLabel}> — compile-gates the 41-kind
  expansion into classifying every new kind (pub-sub→channel ['event'];
  stream-processor/ml-inference/auth-service/notification-service→api;
  websocket-gateway→api ['command','stream']; monitoring/logging/tracing→passive; etc.).
- Dangling carries = low-severity eval finding, NOT 422 (editing-flow decision);
  422 reserved for structural abuse: dup op names per node, dup carries entries,
  ▎ 400 total ops.
- DTO: NodeOperationDto nested @ValidateNested; array caps; ScalarRecordConstraint
  closes the unbounded-config hole (400 on nested objects — enforces documented invariant).
- Patches: GRAPH_PATCH_OPS += update-edge {set: kind|label|carries} + remove-node
  (drops incident edges); update-node set widened += responsibilities|operations;
  set = whole replacement. applySuggestionPatch + toGhostElements (add-edge ghosts
  carry carries for the preview pill).
- UI: reusable operations-editor (rows: name/kind-select-limited-to-capability/
  idempotent/notes/remove; dup warning; cap counter), responsibilities-editor (chips +
  Enter-to-add), edge-carries-field (checkbox list from resolved owner's declared ops;
  unresolved entries = warning badges; free-add allowed) — wired into properties-panel
  "Interface" h3 section driven by INTERFACE_CAPABILITIES; queue gains delivery knob.
  Store: updateNode widened (shallow merge suffices); updateEdge rebuild literal MUST
  add carries passthrough (silent-erase hazard, regression spec). graph-io emits new
  fields only when non-empty (old graphs re-serialize byte-identical). sd-node Meta +=
  '· N ops/types · N roles'; sd-edge pill: carries render wins, label fallback.
- Critic serialization: roles=[…] ops=[command placeOrder idem; …+N more]
  carries=[…] lines; ≤8 ops/node serialized.
- Rules enabled (merged with eval plan's ops pack → single packs/ops.ts,
  feature-detected on any node declaring operations): hygiene.unspecified-interface
  (medium@standard/high@advanced — the headline "roles and actions are graded" rule; no
  auto-suggestion, author must design), hygiene.dangling-carries,
  hygiene.unreferenced-operation, hygiene.srp-overload, hygiene.responsibility-overlap,
  messaging.sync-edge-carries-event (first update-edge patch consumer),
  messaging.async-edge-carries-query, messaging.non-idempotent-consumer (delivery ≠
  at-most-once), messaging.event-published-nowhere, messaging.command-message-fanout,
  performance.query-on-write-path, security.ungated-commands,
  hygiene.op-kind-mismatch, data.non-idempotent-client-command,
  hygiene.chatty-interface, ops.stream-op-no-stream-node, ops.command-into-two-stores.
- Criteria: UX-5 "Components declare operations/responsibilities and connections
  carry them" (blocks takes UX-4) + e2e requirements/interface-modeling.spec.ts +
  canvas.page.ts additions (addOperation, toggleCarry, expectEdgePill, expectNodeMeta).

---

Cross-plan reconciliations (binding)

R1. patches.ts lands ONCE with the union: update-edge set includes carries;
update-node set includes responsibilities/operations; remove-node included.
R2. Ops rules: single merged catalog in packs/ops.ts (list above) — interface plan's
R1-R15 ∪ eval plan's 53-59, one id namespace, severity-policy for difficulty gating.
R3. Queue delivery knob: 3-option select (incl. exactly-once) per blocks table;
non-idempotent-consumer fires when ≠ at-most-once.
R4. Blocks knob table is the canonical config vocabulary; eval rules/expectations
adapt to it (autoscaling not autoscale; sharding!=='none' not sharded;
authMode!=='none' not auth). Small additions to blocks table where eval needs them:
worker.idempotent, service/database region + database.multiRegion + backups,
cache.invalidation, gateway.admissionControl. Calibration spec is the arbiter.
R5. Observability/security expectations satisfied by the NEW NODE KINDS (monitoring/
logging/tracing/auth-service/secrets-manager/waf presence), not config flags —
this is how new kinds become graded, answering "kinds invisible to grading".
R6. Criterion ids: UX-4 = palette categories/filter (Workstream B); UX-5 = interface
modeling (C); EVAL-4..8 as listed in A.
R7. e2e continuity: exp.fst.db-failover keeps title 'Single database with no replica' + identical patch; naive→replica scores 20.0→25.6 (strictly increasing preserved).
R8. INTERFACE_CAPABILITIES + NODE_KIND_CATEGORY are both satisfies-gated — kind batches
must fill both tables in the same commit as the tuple entry.

Master phasing (each step green; conventional commits)

Order optimizes user-visible value: grades get honest FIRST.

1. A: GraphIndex extensions (+tests) — pure, independent.
2. A: Pass architecture seam — legacy@1.0.0 profile encodes today's exact behavior;
   engine.ts becomes orchestrator façade; every existing spec passes byte-identical.
3. A: Expectations + scoring v2 — core+flash-sale banks, default@2.0.0, ENGINE_VERSION
   2.0.0, calibration spec, e2e verified. ← the grade fix lands here.
4. A: Contracts/DB/plumbing — finding/evaluation migrations, evidence/axes/profile
   persistence, mapper, UI cap+coverage badges, fixtures.
5. A: Generator v2 — NFR ids + targetSpec, PromptFacts.nfrs.
6. B: Categories for existing 16 — category tables, derived colors (re-theme),
   contrast additions, colors story.
7. B: Categorized palette + filter (+UX-4 criterion/specs) → B: properties optgroups.
8. B: Kind batches (one commit per category: traffic, compute, data, messaging,
   analytics, coordination, security, observability+external) — each fills tuple +
   category map + colors + icon + label + capability row + config fields + stories.
9. B: Knob enrichment for existing kinds (canonical vocabulary incl. R4 additions).
10. A: Rule-pack expansion (capacity, consistency, durability, observability, cost,
    security+, hygiene+, reliability+, workflow, dag + banks for remaining 4 archetypes
    - new-kind rules + severity-policy + goldens per archetype).
11. C: Interface contracts — wire model + interfaces.ts + patches union → DTO
    validation + config retrofit → UI data layer (graph-io/store/types) → editors +
    panel wiring → visuals (sd-node meta, sd-edge pill) → e2e + UX-5.
12. A+C: LLM passes — shared serializer (ops-aware), critic pass upgrade (cap 10),
    depth axis + UI block (EVAL-6), scenario pass + UI (EVAL-7).
13. C→A: ops pack (feature-detected) + ops-aware expectation upgrades.
14. Sweep: stale docstrings, file-size splits, full gate run.

Verification

- pnpm exec nx run-many -t lint typecheck test build --all + pnpm db:migrate:check
  - pnpm test:stories + pnpm test:tooling after each phase.
- Calibration: nx run eval-worker:test --testPathPattern=calibration asserts the
  score table (empty 0/F · naive 20/F · naive+replica 25.6/F · solid 86.5/B ·
  excellent 100/A).
- Aggregator proofs: permutation determinism; injected-axis no-op; band edges; decay
  math (35/24.5/17.15); cap matrix.
- Live loop: reset db → generate flash-sale prompt → submit naive 3-box → expect F w/
  coverage findings incl. 'Single database with no replica' → accept replica → resubmit
  → higher-but-still-F → build solid design → B → add waiting-room/CDN/monitoring → A.
  With ANTHROPIC_API_KEY: depth axis + scenario stories render, deterministic score
  unchanged vs EVAL_DETERMINISTIC run of the same graph.
- e2e suite 14/14 + new [UX-4]/[UX-5]/[EVAL-*] specs; criteria coverage gate green;
  headed run-through script re-run for visual QA.

Risks

1. Calibration drift as packs land → calibration.spec is the anchor; re-verify at each
   pack commit (phase 10 explicitly re-runs it).
2. Palette visual density at 41 kinds → sticky headings + filter; storybook smoke + axe
   gate both modes.
3. Knob-vocabulary mismatches between rules and UI → R4 canonical rule + a
   config-vocabulary spec (rules' read keys ⊆ blocks table keys per kind) if drift appears.
4. LLM pass latency (3 calls) → passes run serially post-deterministic; UI already
   shows deterministic verdict when axes are null; consider parallelizing LLM passes
   inside the orchestrator later (artifact list order kept stable by pass id).
5. Suppression correctness (double-jeopardy vs lost lessons) → aggregator suppression
   unit tests per pair; coverage entry still records the unmet expectation.
