# Platform and hygiene — `PLAT`

Scope: what the project's requirements name and the repository does not yet
carry — observability, hosting, local orchestration — plus the small things
that cost a reader time. Conventions and the index are in
[README.md](./README.md).

---

### PLAT-1 · No observability integration

**Status** open · **Severity** high · **Where** every Nest service

**What.** The requirements name Datadog and New Relic. Nothing in the
repository instruments for either, or for OpenTelemetry; there is no metrics
endpoint, and the numbers worth a dashboard exist only inside run rows.

**Evidence.** No `datadog`, `newrelic` or `@opentelemetry` dependency or
import under `packages/*/src`.

**Recommendation.** OpenTelemetry first, vendor second — the same
instrumentation exports to either. A trace per run with a span per exchange
(model, lens, sample, outcome, tokens, duration); metrics for the rates the
records already carry: `schema-miss` share of exchanges, escalations at the
`evidence` gate, admission ratio (`kept` over `memories`), model latency and
tokens per run. The Datadog or New Relic exporter is configuration.

**Verify.** A local collector shows one trace per orchestration with the
four steps as child spans; a dashboard plots the four rates from live runs.

---

### PLAT-2 · Nothing declared or deployed on AWS

**Status** open · **Severity** medium · **Where** infrastructure

**What.** The requirements name AWS hosted services and Lambda. The
repository has Tilt, Kubernetes manifests and a compose stack for local use,
and no cloud declaration.

**Evidence.** No AWS SDK, CDK, Terraform or serverless manifest in the
repository.

**Recommendation.** A memory orchestration runs 15–25 minutes and a quality
run 8–15; neither fits a Lambda invocation. Host the services as containers
(ECS on Fargate is the smallest step from the existing manifests) with RDS
Postgres and a managed vector store; reserve Lambda for short
request/response surfaces — prompt generation, retrieval report — if they
are split out. The boot-sweep property in SEAM-4 must be fixed before two
replicas run.

---

### PLAT-3 · Tilt covers the studio but not the vector store or the quality loop

**Status** open · **Severity** medium · **Where** `Tiltfile`, `tilt/`, `docker-compose.yml`

**What.** Tilt brings up Postgres, migrations, seed, the API, the worker and
the studio UI. Qdrant exists only in the compose stack, and the quality-loop
service and client have no manifest or image under either.

**Evidence.** `Tiltfile` resources; compose services `db` and `vectors`;
quality-loop.md, "Not built yet, by choice".

**Recommendation.** A Qdrant resource under Tilt and manifests plus CI
images for the quality-loop service and client, so `tilt up` is the whole
system.

---

### PLAT-4 · The quality-loop client has no browser journey

**Status** open · **Severity** low · **Where** `packages/quality-loop-ui`, `.github/workflows/ci.yml`

**What.** The client has unit specs (vitest) and no Playwright journey; the
studio has one and CI runs it.

**Evidence.** `packages/quality-loop-ui` contains no Playwright config; CI
runs `studio-e2e:e2e` only.

**Recommendation.** One journey — pick a prompt, run, watch, read the
verdict — against a server backed by `fakeLlm`, in the existing e2e project.

---

### PLAT-5 · Stale counts in four places

**Status** closed · **Closed by** the delegation commits · **Where** `docs/pipelines/overview.md`, `packages/run-dump/src/write-dump.ts:2`

**What.** The overview's organising counts — five pipelines, nine model call
sites — predated the quality loop and understated both; two dump modules
counted pipelines that no longer exist.

**How it closed.** `pipelines/overview.md` was rewritten around the studio's
three quality-loop paths and the loop's six pipelines; the how-it-works page
and the suggestion dump were deleted with the studio's engine. What remains is
the comment at `write-dump.ts:2`, fixed when that file is next touched.

---

### PLAT-6 · A root-level file outside every gate

**Status** open · **Severity** low · **Where** `interview.ts` at the repository root

**What.** A scratch exercise committed at the root belongs to no Nx project,
so no lint, typecheck or test target covers it; only prettier sees it.

**Evidence.** `nx affected` reports nothing for it; `tsconfig.base.json` has
no `include`.

**Recommendation.** A gitignored `scratch/` folder, or a small katas project
with its own tsconfig if the exercises are worth keeping under the gates.

---

### PLAT-7 · A tracked note that trips the branding tripwire

**Status** open · **Severity** high · **Where** `CLAUDE-2.md` at the repository root, commit `e58c00c`, `.gitignore`

**What.** The hook refuses any staged content matching the branding
tripwire, and the project's rule is stronger than the hook: no trace in the
tree _or in history_. A local note at the root matches the tripwire and was
committed on 2026-09-07 in `e58c00c` ("docs"), alongside real changes to the
memory module and two pipeline definitions. The commit is on `main`, not yet
pushed (`main` is 39 commits ahead of `origin/main` at the time of writing).
`.gitignore` covers only `/CLAUDE.md`, so a sibling note is one `git add .`
from the index.

**Evidence.** `git show e58c00c:CLAUDE-2.md | grep -ciE '<the two words>'`
returns 1; `git merge-base --is-ancestor e58c00c origin/main` is false.

**Recommendation.** Before anything is pushed: drop the file from the tree
(`git rm --cached CLAUDE-2.md`, keep the local copy) and ignore `/CLAUDE*.md`;
then rewrite the unpushed range so the file never existed in history —
`git filter-repo --path CLAUDE-2.md --invert-paths --refs origin/main..main`
or a non-interactive rebase with `--exec` that removes it from each commit.
History rewriting is a decision, not a chore: it must be done once, before
the first push, and never after.

**Verify.** `git log --all --oneline -- CLAUDE-2.md` is empty; the hook's
tripwire grep over every commit since `origin/main` finds nothing.

---

### PLAT-8 · Not built at single-user scale: review queue, monitors, canary

**Status** accepted · **Where** —

A human review queue, online monitors on a telemetry stack, and canary
deployment infrastructure are explicitly not recommended at this scale
(the retired gap analysis, §4). The shadow-profile flag and a dump aggregation script
cover the doctrine's intent without the machinery; PLAT-1 gives the monitors
a place to land if that changes.

---

### PLAT-9 · No docs index

**Status** open · **Severity** low · **Where** `docs/`

**What.** `docs/` mixes live references (`pipelines/`,
`pipeline-best-practices/`, `practice-workspace.md`, `govcon/`) with archived
material, and nothing says which is which. There is no map.

**Recommendation.** A `docs/README.md` that lists each page, what it is for,
and whether it is current.
