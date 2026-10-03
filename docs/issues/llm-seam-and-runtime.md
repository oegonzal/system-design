# The LLM seam and the runtime — `SEAM`

Scope: `packages/llm` (the one model seam), how services boot, the
pre-commit hook and CI. Conventions and the index are in
[README.md](./README.md).

---

### SEAM-1 · The no-op client is still wired in

**Status** closed · **Closed by** `17f9e8a feat(llm,quality-loop): the loop boots only with a model provider` · **Where** `packages/llm/src/create-client.ts`, `packages/quality-loop/src/boot.ts`

**What.** `create-client.ts` returns `NoopLlmClient` when `ANTHROPIC_API_KEY`
is missing or `QUALITY_LOOP_DETERMINISTIC=1`, and `NoopEmbeddingClient` when
`OPENAI_API_KEY` is missing. The quality loop's runs module resolves its
client the same way: a key, the subscription route under
`QUALITY_LOOP_AUTH=claude-code`, else no-op — silently, with the run
recording `llm-disabled` diagnostics and the controller escalating for lack
of criteria. The README describes the studio as "no-op without a key".

The requirement says otherwise: the assumption is that a model is
available; if it is not, the pipeline fails at its precondition, because the
only evidence wanted is a model's. (The studio's half of this — a rules engine
grading in the model's place — closed with STUDIO-8; the loop's silent no-op
path is what remains.)

**Evidence.** `create-client.ts` lines 21–22, 42, 52, 100, 105, 160–161;
the boot comment at `runs.module.ts` lines 33–35; the escalation path in
ENG-2's run when a sample went missing shows what a partial no-op looks like
in a record.

**Recommendation.** A boot precondition that throws, naming the variable it
wanted, in every process that will call a model — server, worker, CLI.
Fakes stay where they belong: `fakeLlm` in `core/testing/` already covers
the loop's specs. The deterministic-only grading path is STUDIO-8; the
Playwright suite depends on it and needs recorded responses before the flag
can go.

**How it closed.** `NoopLlmClient`, `LlmClient.enabled`, `QUALITY_LOOP_DETERMINISTIC`
and every `!enabled` branch (`llm-disabled`, `producer-unavailable`,
`classifier-disabled`) are gone. `resolveQualityLoopProvider` returns the
API-key or Claude Code route or throws `MissingModelProviderError`, whose
message names both variables; `main.ts` runs `preflight(argv, env)` before
`NestFactory` for `serve` and `run` and exits 1 with that message, and
`replay` boots a `ReplayModule` with no client and no janitor. Availability
is read from the constructed client (`LlmModelDto { model }` on `/health`
and every run), never re-derived from the environment; `POST /criteria` is
503 whenever derivation yields no criteria. The embeddings tier stays
optional (`DisabledEmbeddingClient('no-key')`), and `LlmAvailabilityDto`
describes only it. Fakes stay in specs: `fakeLlm` for the loop, and one
`FakeLoop` (`packages/studio-testing`) behind the studio API's client fake
and the e2e stub.

**Verify.** `[QL-22]` in `packages/llm/src/create-client.spec.ts`,
`packages/quality-loop/src/boot.spec.ts` and `replay.module.spec.ts`;
`git grep NoopLlmClient packages` returns nothing; the only mention of
`QUALITY_LOOP_DETERMINISTIC` in `packages/` is the spec proving it is no
longer read.

---

### SEAM-2 · No retry on a schema miss

**Status** closed · **Closed by** `8af8916 feat(llm): the seam salvages` · **Where** `packages/llm/src/claude-agent-client.ts`, `parseStructured`; `packages/contracts/src/lib/bounds.ts`, `parseLenient`

**Closed.** A reply is read through the salvage ladder: a string past its
target is kept whole and recorded as an overrun (prose past three times the
target is cut at a word boundary with ` […]`), a list past its ceiling is
trimmed by whole items, an unasked-for key is stripped — none of them a miss.
Only a structural fault refuses the reply, and the next attempt inside the
same call is asked again with every fault named in the one wording
(`describeIssue`) and, when it is at most 60,000 characters, the reply as
written (`LlmRetryPolicy.feedback`). A turn that ended without a result is
still read from its transcript. Two lanes stay open for later: the SDK's
structured-output mode, which would have the provider constrain the reply to
the schema at the cost of the seam's own salvage record, and its `taskBudget`
(alpha today) as a per-turn output bound in place of the declared
`maxTokens`.

**What.** The subscription client asks for one JSON object and validates it
against the request's schema. Two kinds of excess are repaired — a
`too_big` on a bounded string or array is clamped, unasked-for keys are
stripped (`a12f01f`) — and anything else is `null`: the exchange records
`schema-miss` and the sample is lost. There is no second attempt with the
validation issues fed back.

**Evidence.** `claude-agent-client.ts` lines 140–160 and 296–297; the lost
sample in run `2026-09-09T04-28-14-876-293eda` (ENG-2) escalated a whole
memory orchestration.

**Recommendation.** One bounded retry: on a miss, re-issue the same request
with the schema issues appended as a short instruction, record it as a
second exchange carrying `attempt: 2`, and only then return `null`. Keep it
at one — a second retry re-bills for diminishing return, and the
`schema-miss` outcome must stay observable.

**Verify.** The `schema-miss` share of `exchanges` across runs before and
after, read from the run rows; a spec with a canned miss then a canned hit
records two exchanges and one report.

---

### SEAM-3 · No temperature, seed or memoisation at the seam

**Status** open · **Severity** medium · **Where** `packages/llm/src/claude-agent-client.ts`

**What.** The seam has one transport, Claude Code through the Agent SDK, and
its options take no `temperature`, `seed` or `top_p`: every lens samples at
Claude Code's default, and nothing in `packages/llm` can pin it. No response
is memoised (ENG-7), so no experiment can hold the judges fixed.

**Evidence.** `grep -ri temperature packages/llm/src` is empty, and the Agent
SDK's `Options` declares none of the three; the retired gap analysis, §2.4
and §3.3.

**Recommendation.** Memoisation per ENG-7 is the lever the transport leaves:
a replayed response is the only judge that holds still. Persist the per-lens
model id on the report so a judge change is visible in the record, and read
the spread the seam cannot pin from the `calibration` orchestrator, which
reports it per goal. Should a transport that takes a temperature ever join the
seam, set 0 there and record it on the exchange.

---

### SEAM-4 · The boot sweep interrupts in-flight runs from any process

**Status** closed · **Closed by** `0c36180 feat(db,quality-loop): a running row is alive while its heartbeat is fresh; a late close tells the truth` (the fix is ENG-10's) · **Where** `modules/janitor/`, `modules/runs/runs.service.ts`

**What.** Every process that boots `AppModule` sweeps `running` rows to
`interrupted`, the CLI included. Running `pnpm quality-loop:run` while the
server has a memory run in flight fails that run. Quality runs have carried
the property since `d0c92e3`.

**Evidence.** memory-runs §11.

**Recommendation.** Sweep only in the server role, or replace the boot-time
sweep with a heartbeat lease (`lastSeenAt` on the run row, renewed by the
owning process) and sweep only expired leases. The second also survives two
servers.

**How it closed.** The second option: `heartbeat_at` on `quality_run` and
`orchestration_run`, written at open, on every exchange and by a ticker
every `staleAfterMs / 3` while `perform` runs; `RunJanitor` sweeps at boot
and on an interval only rows whose heartbeat is older than
`QUALITY_LOOP_RUN_STALE_AFTER_MS` (default 600000), and only in processes
that run models — `replay` boots without it. A CLI run beside the server
leaves the server's run `running`.

**Verify.** `[QL-13]` "a run whose heartbeat went stale is failed at boot;
one still heartbeating is left alone" (`modules/runs/runs.spec.ts`) and
`[QL-16]` in `orchestrations-http.spec.ts`; `[QL-22]` on the replay module
never sweeping.

---

### SEAM-5 · The pre-commit review runs no critics on the subscription route

**Status** closed (2026-09-30) · **Severity** medium · **Where** `.githooks/pre-commit` step 4, `tooling/code-review`

**Resolution.** The review no longer has a key gate or a CLI of its own: it
reaches Claude Code through `@sysdesign/llm`, the same subscription-login
check and the same withheld credentials the quality loop boots on, via the
Agent SDK (the JSON Schema is still enforced by the API, the budget still
capped per call). A machine's `claude login` runs the critics locally; CI
passes the `CLAUDE_CODE_OAUTH_TOKEN` secret from `claude setup-token`, and a
fork PR without secrets runs the rules alone, saying so. Every knob the
review reads is declared once in `tooling/code-review/config.ts`, and its
spec fails on any the hook or the CI job uses without declaring. Verified
live: `pnpm review:code --base=61bbed0 --profile=quick` sent 7 of 7 files to
the readability critic on the subscription; with no login (and an API key
set) the critics were skipped with the reason and the rules still ran.

What follows is the issue as it was found.

**What.** The hook's fourth step runs the code review with the quick
profile. Its critics need `ANTHROPIC_API_KEY`; without one they are skipped
and only the four deterministic rules run (`boundaries`, `export-surface`,
`file-size`, `theme-guard`). On the subscription route every commit in this
repository has been reviewed by rules alone.

**Evidence.** Every hook run this month reports the critics skipped;
`tooling/code-review/rules/`.

**Recommendation.** Route the review through the same `claude-code` auth
path `packages/llm` already implements for the quality loop, so the critics
run on the subscription; keep `SKIP_REVIEW=1` as the escape hatch.

**Verify.** A staged change with a known boundary violation and a known
design smell is refused by the critic, not only by the rule.

---

### SEAM-6 · CI never calls a model; no judge-regression harness

**Status** open · **Severity** medium · **Where** `.github/workflows/ci.yml`, `core/testing/`

**What.** CI runs lint, typecheck, unit, tooling, build, Storybook smoke and
the studio's Playwright journey. No stage calls a model, and no harness
measures whether the lenses still find what they found — a prompt or model
change is verified by hand, if at all.

**Evidence.** `ci.yml`; the retired gap analysis, §2.4 and §3.8.

**Recommendation.** Two layers. Recorded-response regression through
`fakeLlm`: each persona's canned reports become fixtures, and a prompt change
that alters what the normaliser confirms fails a spec. An opt-in live harness
(a script, not CI) that runs the lenses N times over the fixtures and reports
item variance and agreement with pinned expectations, so judge drift is a
number.

**Progress (2026-09-22).** The live half exists as two orchestrators over a
shared panel (`docs/pipelines/orchestrators.md`): `calibration` runs one goal
k times and reports the spread, `second-opinion` holds one artifact fixed and
reports where fresh panels disagree with the recorded verdict and each other.
Both write a `PanelReportDto` on the record; nothing yet turns it into a
regression fixture or runs in CI.

**Verify.** The regression suite runs in CI without a model login; the live
harness writes its table to `docs/pipelines`.
