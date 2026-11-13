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

**Status** closed · **Closed by** the aws-deploy landing commit (2026-11-12) · **Where** `infra/aws/`, `packages/app-gateway/`, `docker/`, `.github/workflows/deploy-aws.yml`, `docs/aws/deployment.md`

**What.** The requirements name AWS hosted services and Lambda. The
repository had one local stack — the compose stores, with the apps as Tilt's
Kubernetes pods or as local processes — and no cloud declaration.

**Evidence.** Before this change, no AWS SDK, CDK, Terraform or serverless
manifest in the repository.

**Recommendation (as written).** A memory orchestration runs 15–25 minutes
and a quality run 8–15; neither fits a Lambda invocation. Host the services
as containers (ECS on Fargate is the smallest step from the existing
manifests) with RDS Postgres and a managed vector store; reserve Lambda for
short request/response surfaces — prompt generation, retrieval report — if
they are split out. Two replicas can already share the run tables: since
SEAM-4 closed, the janitor fails a row only once its heartbeat is stale, so
one replica never sweeps another's live run.

**How it closed.** Declared, not yet run. `infra/aws/apps.json` is the one
declaration of what is deployed (seven images and the migrate target, and
the gateway's routes); six CloudFormation stacks — `bootstrap` (GitHub OIDC
trust, execution role, ECR, budget; deployed once by hand), `network`
(dual-stack VPC, no NAT), `data` (Aurora Serverless v2 PostgreSQL 16 at 0–2
ACU with auto-pause, EFS for the run dumps), `platform` (the cluster, the
task roles and log groups, the migrate task, the Cognito user pool and its
password-flow client, the alerts topic), `app` (one Fargate task of the
seven containers, the `app-gateway` Lambda behind a function URL and the
idle Lambda on a five-minute schedule with its state parameter, alarms) and
`edge` (the CloudFront distribution) — with `infra/aws/guard/sysdesign.guard` and
`tooling/aws-deploy.spec.ts` (`CLOUD-1`…`CLOUD-4`) holding the templates to
the declaration and to the subscription-only model access. Lambda took the
short surfaces the recommendation named and one more: the gateway (its own
sign-in page checked against Cognito, routing, wake) and the idle check are
the two Lambda handlers; the long runs stay in the container.
`.github/workflows/deploy-aws.yml` builds the ARM images on CI's success on
`main`, deploys the stacks in order (network, data, platform, the migration,
app, edge) and verifies the edge; `docker/next-app.Dockerfile` and
`output: 'standalone'` make the three web apps containers. Not in this phase,
each with its own entry: the vector store (PLAT-11), the synchronous rubric
derivation against the edge timeout (PLAT-10), the cloud Telegram bot's
single-poller rule (PLAT-12), govcon's jobs on every wake (PLAT-13). The
runbook is `docs/aws/deployment.md`; the first deploy, and the numbers it
measures (wake time, task memory, Aurora's resume), are still to come.

**Verify.** `pnpm test:tooling` runs `tooling/aws-deploy.spec.ts`
(`[CLOUD-1]`–`[CLOUD-4]`: the matrix, containers, routes, edge behaviours
and SSM names against `infra/aws/apps.json` and the runbook) and
`pnpm exec nx run app-gateway:test` the gateway with every seam faked; CI's
`infra` job lints the templates and holds them to the guard rules, and its
`images` job builds every declared image. Live: `pnpm aws:deploy` from a
bootstrapped account, then the `verify` step's `200` on `/api/health`
through the edge and `pnpm aws:status` showing the task asleep 20–25 minutes
after the last request.

---

### PLAT-3 · Tilt covers the studio but not the vector store or the quality loop

**Status** closed · **Closed by** `d182333 refactor(db): the database connection defaults are declared once, on the compose port` and `7e122be build(tilt,docker): tilt up runs the same stack as the compose launcher` · **Where** `Tiltfile`, `tilt/`, `docker-compose.yml`, `docker/nest-app.Dockerfile`

**What.** Tilt brings up Postgres, migrations, seed, the API, the worker and
the studio UI. Qdrant exists only in the compose stack, and the quality-loop
service and client have no manifest or image under either.

**Evidence.** `Tiltfile` resources; compose services `db` and `vectors`;
quality-loop.md, "Not built yet, by choice".

**Recommendation.** A Qdrant resource under Tilt and manifests plus CI
images for the quality-loop service and client, so `tilt up` is the whole
system.

**How it closed.** One stack, two launchers. The compose services stay the
one definition of Postgres and Qdrant: Tilt's `stores` resource runs
`scripts/stack.sh db` against them and `tilt down` leaves them up, so both
launchers share the same containers, volumes and runs; `tilt/postgres/` is
gone. Pods reach the stores through the `local-stores` ConfigMap (`DB_HOST`
and `QDRANT_URL` on `host.docker.internal`); every other connection setting
is a code default, the DB port declared once in
`packages/db/src/connection.ts` as the compose port, 5433. The API, the
quality loop and govcon run as pods from one app-agnostic image that CI
builds for all three, started from `/app` so a cwd-relative default such as
the prompt library resolves as it does from the repository root; the loop's
pod takes its subscription token and embeddings settings from a Secret and
keeps its dumps on a volume claim. The three web clients run as local dev
servers, as the studio's did.

**Verify.** `tilt up` brings `stores` up without restarting `sysdesign-db`
or `sysdesign-vectors`, and every pod reaches Ready; `curl localhost:3003/prompts`
returns the library; after `tilt down`, `docker ps` still lists both stores.
(Since the pgvector move of 12 Nov 2026 the compose stack has one store: the
vectors live in Postgres, `sysdesign-vectors` is gone, and the ConfigMap
carries `DB_HOST` alone.)

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
and the suggestion dump were deleted with the studio's engine. The comment at
`write-dump.ts:2` was rewritten with the run-dump cleanup (`1f30f0e`) and now
names the module's real callers, the loop's trace store and the code review.

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

**Status** accepted · **Where** `CLAUDE-2.md` at the repository root, commit `e58c00c`, `.gitignore`

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

**Why accepted.** The owner keeps `CLAUDE-2.md` as it is — tracked, in the
tree and in history — so nothing here rewrites or removes it, and no commit
stages it. The hook reads staged content only, so a file no commit touches
never trips it. The entry stays so the match is known rather than
rediscovered.

**If that changes.** Drop the file from the tree (`git rm --cached
CLAUDE-2.md`, keep the local copy) and ignore `/CLAUDE*.md`; removing it from
history means rewriting every commit since `e58c00c` — `git filter-repo --path
CLAUDE-2.md --invert-paths --refs origin/main..main` — which is safe only
before that range is first pushed, and never after.

---

### PLAT-8 · Not built at single-user scale: review queue, monitors, canary

**Status** accepted · **Where** —

A human review queue, online monitors on a telemetry stack, and canary
deployment infrastructure are not built at this scale: one user, on one
machine, grading one submission at a time. What each would do already has a
smaller home. An `escalate` decision is shown to the one person a queue would
route it to; `main.js replay` decides every recorded iteration again under
each controller, so a strategy change is compared on recorded evidence before
it ships; and the `calibration` and `second-opinion` orchestrators measure a
judge's spread on demand. The retired gap analysis (§4) reached the same
verdict on the strength of a shadow-profile flag and a dump aggregation
script, both of which went with the eval engine. PLAT-1 gives the monitors a
place to land if the scale changes.

---

### PLAT-9 · No docs index

**Status** open · **Severity** low · **Where** `docs/`

**What.** `docs/` mixes live references (`pipelines/`,
`pipeline-best-practices/`, `practice-workspace.md`, `govcon/`) with archived
material, and nothing says which is which. There is no map.

**Recommendation.** A `docs/README.md` that lists each page, what it is for,
and whether it is current.

---

### PLAT-10 · The synchronous rubric derivation can outlast the edge

**Status** open · **Severity** medium · **Where** `packages/studio-api/src/modules/prompts/prompts.service.ts` (`rubricFor`, `ensureCriteria`), `infra/aws/edge.yaml` (`OriginReadTimeout`), `packages/app-gateway/src/config.ts` (`GATEWAY_UPSTREAM_TIMEOUT_MS`)

**What.** Five studio-api routes block on the loop's `POST /criteria` —
`POST /api/prompts`, `POST /api/prompts/import`, `GET /api/prompts/:id` with
an empty rubric, `PATCH /api/prompts/:id` on a markdown change,
`POST /api/prompts/:id/criteria` — while everything else the API starts is
202 start-then-poll. Through the edge a request has 120 s (CloudFront's
origin read timeout, self-service up to 120; the gateway forwards within
110 s). A derivation past that answers 504 at the edge while it completes
and is stored server-side, so the client sees a failure for a save that
succeeded. It is also what rules API Gateway (a hard 30 s) out as the
ingress.

**Evidence.** `packages/loop-client/src/http-loop-client.ts` measured 36
derivations on 2026-10-12 at 8–61 s, once 195 s, and sets
`DERIVE_TIMEOUT_MS` to 240 000 — twice the edge's limit.

**Recommendation.** The pattern the rest of the API uses: `POST` starts a
derivation and answers 202 with a row (a `PromptGeneration`-style state),
the client polls it, and the rubric lands on the prompt when the run ends.
A quota request to raise the CloudFront timeout to 180 s is a stopgap, not
the fix.

**Verify.** A derivation of 200 s through the edge ends with the rubric on
the prompt and no 504 in `/sysdesign/prod/gateway`; the gateway's timeout
can then come down to the length of an ordinary API call.

---

### PLAT-11 · The memory tier is not deployed

**Status** closed · **Closed by** the phase-4 landing commit (2026-11-12) · **Where** `packages/pgvector-kit`, `packages/quality-loop/src/modules/memory/pgvector/`, `packages/agentic-memory/src/adapters/pgvector/`, `packages/db/src/migrations/Migration20261112100001_vector_extension.ts`, `infra/aws/app.yaml` (`OPENAI_API_KEY` under `DeployOpenAiKey`)

**What.** The cloud loop ran with the embedding client disabled, so recall
by meaning and the digests that feed it did not run there; grading, coaching
and prompt generation did. Qdrant had no durable home on Fargate: its own
documentation rules out NFS, so EFS could not host it, and a task's disk is
wiped on every sleep.

**Evidence.** `packages/llm/src/create-client.ts:168` boots a
`DisabledEmbeddingClient` without `OPENAI_API_KEY`; the app template's
`quality-loop` container named neither variable; Qdrant's storage
documentation (read 2026-11-11) on network file systems.

**Recommendation (as written).** A pgvector adapter behind the existing
store ports on the same Aurora database, so the memories are backed up with
the rows they describe; `OPENAI_API_KEY` as one more SSM SecureString; a
one-time export of the laptop's collection. The alternative kept in the
runbook was a Qdrant sidecar restored from an S3 snapshot at every wake,
which pays the restore on each start.

**How it closed.** As recommended. The memory tier is pgvector in the
stack's own PostgreSQL — Aurora in the cloud, the compose database on the
laptop, now built from `docker/postgres-pgvector.Dockerfile` (PostgreSQL 16
Alpine with pgvector 0.8.0 compiled in: the major and the extension version
Aurora 16.10 ships) — behind the two store ports, which did not change. A
migration creates the `vector` extension; each adapter creates its
collection's table at boot (`vector(1536)` columns under HNSW cosine
indexes, btree expression indexes on the five fields the probes filter by,
`hnsw.iterative_scan = relaxed_order` inside every search transaction). The
loop's collection keeps its generation and is carried over once by
`pnpm memory:import-qdrant`, point ids kept, since the collection is the only
copy of its document-digest chunks; the memory host's collection bumps to
`v2` and is rebuilt by its sweep from `memory_record`, which is its truth.
`OPENAI_API_KEY` reaches `quality-loop` and `agentic-system` from
`/sysdesign/prod/OPENAI_API_KEY` under the app stack's `DeployOpenAiKey`
(default `true`). Qdrant, its client, the compose `vectors` service and
`packages/qdrant-kit` are gone; the runbook's "Moving the laptop's data and
lanes to the cloud" carries the import and the whole-database dump.

**Verify.** `pnpm test:tooling` passes `[CLOUD-4]` with the key's name in
the runbook; the adapters' live specs run on a real pgvector table on the
test lane (`[QL-71]`, `[AGM-7]`); in the cloud, after `pnpm aws:db-import`,
`pnpm aws:exec` then the loop's memory status reports the table and its
chunk count, and a coaching run lists recalled lessons in its panel.

---

### PLAT-12 · Telegram's one poller per token now spans two machines

**Status** closed · **Closed by** the phase-4 landing commit (2026-11-12) · **Where** `packages/notifications/config/channels/telegram-cloud.json`, `infra/aws/app.yaml` (`NOTIFICATIONS_CHANNELS=telegram-cloud`), `docs/aws/deployment.md` setup step 4 and "Moving the laptop's data and lanes to the cloud"

**What.** Telegram allows one poller per bot token, and this machine's
notifications service polls the five bots in `.env` whenever it runs. The
cloud `notifications` ran a one-instance channels file for govcon, bound to
the same variable names, so the only safe value for its token was a bot
nobody else polls. Nothing enforced that: the same token in SSM and in
`.env` makes the two services take turns at 409 conflicts and wait, and
govcon's cloud digest reaches nobody. The laptop lanes meanwhile kept the
laptop bots, so a person who wanted govcon's prompts in one chat got two
bots for one purpose.

**Evidence.** The RUNBOOK's "Answering from your phone" (one poller per
token; the second is refused and waits); `telegram.settings.conflictBackoffMs`
in both channels files.

**Recommendation (as written).** Least: the runbook's rule (a bot of its own
for the cloud), which this entry recorded. Better: a bus that one service
polls and others publish to — the cloud govcon publishing to the laptop's
bus, or the reverse, over HTTPS with a shared secret — so one bot carries
govcon wherever it runs. Decide once govcon has run in the cloud for a week.

**How it closed.** The least option, made whole by the move of the lanes
rather than by a bus. The cloud runs `telegram-cloud`: the govcon bot (a bot
of its own, as before) and the job-application bot, which moves to the cloud
with the browser session whose prompts it carries — its token into
`/sysdesign/prod/notifications/JOBAPPLICATION_TELEGRAM_API_KEY`, its
instance out of the laptop's `telegram.json` at cutover (and the govcon
instance too, once govcon runs only in the cloud), so each token has one
poller and each purpose one bot. With the lanes in the cloud there is
nothing left on the laptop for a cloud bot to carry, which is why the bus
bridge stays unbuilt. `telegram-govcon.json` is gone.

**Verify.** Both services up, no `409` in either log; a question from a
cloud session arrives once, from the job-application bot, and its answer
reaches the session; govcon's digest arrives once.

---

### PLAT-13 · Govcon's pull and warm run on every wake

**Status** open · **Severity** low · **Where** `packages/govcon/src/modules/app/serve-job.ts`, `packages/govcon/src/main.ts` (`SERVE_JOBS`)

**What.** `serve` starts the daily pull and the daily spending warm, and
`ServeJob` runs each once at start, then on its cadence. A stack that
scales to zero starts `serve` on every wake, so a day with several wakes
runs both jobs several times: the pull answers `cached` for searches
already pulled inside the day and spends no request, but the warm re-reads
its lenses and the alert rules run again, and the cadence restarts from the
wake rather than from the last run.

**Evidence.** `serve-job.ts`: `startPeriodic({ everyMs, atStart: true })`;
the plan's D2 (the wake runs the "at boot" pull and warm).

**Recommendation.** A persisted last-run time per job (one row, or the
pull ledger's own last entry), read at start: run at start only when the
cadence has elapsed since it, and schedule the next run from that time.
The budget bounds the cost until then.

**Verify.** Two wakes inside one day show one pull and one warm in the
govcon log and the ledger; a wake after a day shows one of each.

---

### PLAT-14 · A sign-in challenge on the cloud's device needs a person

**Status** open · **Severity** medium · **Where** `packages/browser-session` (the cloud run), `docs/aws/deployment.md` (Troubleshooting, "LinkedIn shows a checkpoint")

**What.** The cloud session runs on a profile seeded from the laptop's
exported storage state, on a new device at a datacenter address. LinkedIn
(and possibly Built In) may answer that with a checkpoint — a code sent to
the mailbox, a captcha — which the headless session cannot read or type, and
which no part of the cloud can answer. The session then ends without
applying, and every nightly run after it does the same until a person
intervenes.

**Evidence.** The plan's phase-4 facts (2026-11-11): the cookies travel as
Playwright's storage state because the Mac profile's cookies are
undecryptable on Linux; LinkedIn's device cookies travel with them, which is
the one mitigation. Whether LinkedIn challenges the first cloud run is
unmeasured — nothing has run in an account yet.

**What exists.** The stop itself. The LinkedIn goal declares `login-wall
(stopped)` for a sign-in form, a verification challenge or a "confirm it is
you" page (`packages/browser-session/goals/linkedin-easy-apply.md:74`; Built
In's goal declares it for the sign-up dialog), and a session that meets one
ends `mission-stop/login-wall` with exit 0, signing in nothing
(`docs/pipelines/browser-session.md`, the browser-session README).

**Recommendation.** Measure first (PLAT-17). What is missing is the alert
and the re-seed path: a bus event on the `login-wall` stop, so the phone says
so the night it happens rather than after a week of empty runs, and a re-seed
that needs no hand on the bucket — today the recovery (sign in on the laptop,
export the state again, push it, drop the profile archive) is manual, each
step a command in the runbook.

**Verify.** A cloud run that meets a checkpoint ends `mission-stop/login-wall`
and a Telegram message says so; after the laptop recovery the next run signs
in.

---

### PLAT-15 · Session dumps in the cloud have no reader

**Status** open · **Severity** low · **Where** `infra/aws/platform.yaml` (`SessionTaskDefinition`, the `sessions` volume), `packages/browser-session` (`teach-again`, `replay-fields`)

**What.** A cloud session writes its dumps to EFS under
`/app/static/browser-session/sessions/<id>`, where they outlive the task —
and nothing reads them there. `teach-again` and `replay-fields` read dumps
from a local folder; the inspector reads the loop's runs, not sessions; and
copying a dump out is ECS Exec into a running session task plus
`tar | base64`, which only works while a session runs.

**Evidence.** `docs/aws/deployment.md`, "Validating production" (ECS Exec is
a terminal, not a file channel); the session task role may write the files
bucket's `profiles/`, `state/` and `docs/` prefixes and nothing else.

**Recommendation.** Either a `dumps/` prefix in the files bucket the engine
archives a session's dump to at close (the same `tar` path as the profile
archive, one more allowed prefix on the role) with an `aws.sh files pull`,
or a third EFS access point mounted read-only by the app task and a session
list in the inspector. The first is smaller and matches the archive the
engine already makes.

**Verify.** After a cloud session, `pnpm aws:files list dumps/` shows it and
`replay-fields` runs against the pulled folder.

---

### PLAT-16 · A session task has no hard stop

**Status** closed · **Closed by** the phase-4 fix round (2026-11-12) · **Where** `infra/aws/app.yaml` (`IdleJobMaxMinutes`, `IdleFunctionRole`), `packages/app-gateway/src/idle.ts`

**What.** The engine ends a session by its target, its task budget, its
wall-clock limit and its rails; a session that hangs below them — a Chromium
that stops answering, a `--wait-for-loop` that binds and then stalls, a page
the rails do not catch — keeps the task running, and through the idle
function's job count keeps the app task awake too, until `aws:session stop`.
ECS has no task-level deadline and EventBridge Scheduler none either.

**Evidence.** `docs/aws/deployment.md`, "Wake and sleep" (a session task is
never stopped by the gateway, the job function or the idle function); the
launch files' `maxMinutes` (120 and 90) bound only the engine's own loop.

**Recommendation.** The idle function knows each session task's start time
from `DescribeTasks`: stop any session task older than the launch's
`maxMinutes` plus the unit grace plus a margin (a declared
`GATEWAY_JOB_MAX_MINUTES`, or the launch file's value carried into the job
function's environment beside the launch list), and say so in its summary.
The `StopTimeout` already lets the engine archive the profile on the way
out.

**How it closed.** As recommended, with one ceiling rather than one per
launch: the idle function, which already lists the cluster's job tasks,
reads each one's start time (`DescribeTasks`) and stops any older than
`GATEWAY_IDLE_JOB_MAX_MINUTES` (`StopTask`) — the app stack's
`IdleJobMaxMinutes`, 240 by default, above the longest launch's 120 minutes
plus the grace a unit in flight gets, so only a task the engine lost is ever
stopped — and logs the stop. Its role gained `ecs:DescribeTasks` and
`ecs:StopTask` on the cluster's tasks, cluster-conditioned. The 120 s
`StopTimeout` still lets the engine archive the profile on the way out, and
the `browser_session` row closes as interrupted once its heartbeat is stale.

**Verify.** A session task started by hand on a stalled page is stopped by
the idle function at the deadline; its `browser_session` row closes as
interrupted and the app task sleeps afterwards.

---

### PLAT-17 · Each nightly session arrives from a new datacenter address

**Status** watch · **Where** `infra/aws/network.yaml` (no NAT: a public IPv4 per task), `packages/browser-session/launches/`

**What.** Every session task gets a fresh public IPv4 from the AWS pool, so
LinkedIn and Built In see a different datacenter address each night under
the same account — the opposite of the laptop, whose address is residential
and stable. Whether either site rate-limits, challenges or quietly limits
that is unmeasured; the design keeps no NAT (an Elastic IP behind one would
cost $33 a month idle) on purpose until it is.

**Evidence.** The plan's D8 (no NAT) and the phase-4 facts (2026-11-11); the
laptop's rounds, where LinkedIn's daily allowance reset at 00:00Z and no
checkpoint followed an address change — a residential one.

**Watch.** Over the first two weeks of nightly runs: the share of sessions
that end in a checkpoint or a sign-out (PLAT-14), the submitted count per
session against the laptop's targets (6 and 4), and any `limit-reached`
earlier than the laptop saw. If the share is material, the smallest fix is a
NAT gateway with one Elastic IP for the session task alone, or running the
sessions from the laptop again.

### PLAT-18 · A notifications spec races under load

**Status** open · **Severity** low · **Where** `packages/notifications/src/app/http.spec.ts` (`[NTF-1] [NTF-5]`), the interactions dispatcher

**What.** The case "carries a prompt to the channel and the answer a person
gives there back to its asker" waits until the fake phone has the prompt,
then answers through it — and, one run in three under load, the answer is
`refused` instead of `accepted`: the delivery is recorded before the
interaction is open to an answer, so a fast reply lands on a prompt the
service does not yet hold as askable.

**Evidence.** 2026-11-12, the phase-4 gate runs in the `aws-deploy`
worktree: the full `nx run-many -t test` and a `vitest` loop of three runs
each failed it once while seven agents shared the machine; three quiet
re-runs passed. The spec and the reply path are byte-identical to `main`;
the round only changed how the channels file is chosen (`NOTIFICATIONS_CHANNELS`).

**Recommendation.** Open the interaction before the delivery is recorded
(or have the fake channel report delivery only after the dispatcher's
write), then pin it with a case that answers the instant the delivery is
seen. Until then, read a lone failure of this case as the race, not as a
regression.
