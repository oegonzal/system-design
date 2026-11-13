# app-gateway

The edge of the studio on AWS: three Lambda handlers in one bundle. `proxy` sits behind a function URL that CloudFront fronts, and is the only way into the Fargate task — it signs the viewer in, picks the upstream port from the declared routes, forwards the request, and wakes the stack when nobody is listening. `idle` runs on a schedule and puts the stack to sleep when nothing has used it, twice over, and stops a job that has run past its ceiling. `job` starts one launch of the browser session as a task of its own — one at a time per launch — for the launch schedules and for `aws.sh session run` alike, waking the stack first. Nothing here is a Nest service; nothing here listens on a port.

```bash
pnpm exec nx test app-gateway        # every seam faked; the network adapters against servers of the test process
pnpm exec nx build app-gateway       # dist/main.js, one CJS file: handlers main.proxy, main.idle and main.job
```

## A request's way through `proxy`

1. **Origin check.** The header CloudFront adds (`x-origin-verify`) is compared in constant time with `GATEWAY_ORIGIN_SECRET`; anything else is 403. A caller who found the function URL gets nothing.
2. **The gateway's own routes** — `GET`/`POST /auth/login`, `GET /auth/logout` — are answered here.
3. **Routing.** The declared routes (`GATEWAY_ROUTES`, JSON) name a port per prefix. A prefix matches the path itself or a path below it, so `/govcon` never matches `/govcon-api`; the longest wins; `strip` removes the prefix before forwarding; `api` marks the routes answered in JSON; `public` marks the routes the gate never asks a session of — the hashed static assets CloudFront caches without cookies, and a health path a deploy reads.
4. **The session gate.** A valid ID token in `sd_id` goes through. An expired one with `sd_refresh` is refreshed in place and the new cookie set on the answer. Anything else: a page is sent to `/auth/login?returnTo=<path>`; an api route gets `401 {error: 'unauthenticated', login: '/auth/login'}`; and a session that failed — a bad token, a refused refresh — is cleared from the browser on that answer. A `public` route skips the gate.
5. **Forwarding** over plain HTTP to `GATEWAY_UPSTREAM_HOST:<port>` with two budgets: the connection has `GATEWAY_CONNECT_TIMEOUT_MS` to be made, the answer `GATEWAY_UPSTREAM_TIMEOUT_MS` once it is. Headers go but the hop-by-hop ones, the host and `x-forwarded-host` (whose value would be the function URL's host); cookies go but the three session cookies; `x-forwarded-for/proto` are added. The answer comes back with its cookies as the function URL's list and its body as base64 unless it is text, JSON, JavaScript, CSS, SVG or XML and not content-encoded. An answer over 6 MB once base64 inflates it — the most a function URL returns — is 502, logged with the path and the size.
6. **Waking.** A connection failure (`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`, `ETIMEDOUT` — the connect budget spent — `ECONNRESET`) means the task is asleep: the ECS service is set to one task when it wants none (`ensureDesired`, the one reading of "asleep", which `job` shares), the database is touched so its resume overlaps the task's start, and the caller gets 503 with `Retry-After: 10`, `Cache-Control: no-store` — a page that refreshes itself every 5 s, or `{status: 'starting', retryAfterSeconds: 10}` on an api route or for a caller whose Accept has no `text/html`. Only a request that passed the gate wakes: a `public` route gets the same "starting" answer and starts nothing, so a crawler at the health path never pays for a task.
7. **The boundary.** Whatever a step throws is logged as `request failed {path, method, error}` and answered `500 {error: 'internal error'}`, never cached.

## Sign-in

The gateway renders its own sign-in page and authenticates against the Cognito user pool through the `cognito-idp` API; there is no hosted UI, no OAuth flow, no domain. The Lambda has no IPv4 route out, and `cognito-idp.<region>.amazonaws.com` is the one Cognito host that answers over IPv6, so the client is built with that endpoint written out and the SDK's dual-stack switch off.

- `GET /auth/login` renders the form (email, password, hidden `returnTo` and `csrf`) and sets `sd_csrf` — the same random token as the hidden field, ten minutes — so a form posted from another site, which carries neither, is refused.
- `POST /auth/login` (form-encoded) requires `csrf` to equal the cookie (else 403, the form again), then `InitiateAuth` with `USER_PASSWORD_AUTH`. A grant sets `sd_id` and `sd_refresh`, clears `sd_csrf` and answers 302 to `returnTo` — a path on this origin and never under `/auth`, else `/`. A refused password renders the form again with a message and 401. A `NEW_PASSWORD_REQUIRED` challenge renders a page naming `aws cognito-idp admin-set-user-password --permanent`; any other challenge is named the same way.
- `GET /auth/logout` only when `sec-fetch-site` is `same-origin` or `none` (a cross-site fetch is 403): clears every cookie, 302 to `/auth/login`.
- A refresh is `InitiateAuth` with `REFRESH_TOKEN_AUTH`; one the pool refuses clears `sd_id` and `sd_refresh` on the 401 or 302 it answers.

Every cookie is `HttpOnly; Secure; SameSite=Lax; Path=/`. ID tokens are verified with `aws-jwt-verify` (`tokenUse: 'id'`, the pool and client from the configuration). The pool's region is the prefix of `GATEWAY_COGNITO_USER_POOL_ID` before the underscore — Cognito names every pool `<region>_<id>` — and is what the verifier's key URL and the API endpoint use. The pool's answers go behind the `Authenticator` port (`signIn` → grant | refused | challenge; `refresh` → grant | refused): a refusal is the pool's answer and comes back as one; a failure to answer is thrown, for the boundary to log and answer 500.

## `idle`

Every run reads the proxy function's `Invocations` (CloudWatch, Sum) over the last `GATEWAY_IDLE_MINUTES`. Any means use: the quiet observation on record is cleared and the run is `active`. None, while the service wants a task, is one quiet observation — and one is not enough, because CloudWatch publishes a Lambda metric minutes after the invocation it counts, so a run that reads zero may be reading a window the viewer's last requests have not reached yet. So:

- no observation on record (the parameter absent, or holding the `none` the stack creates it with) → write now to `GATEWAY_IDLE_STATE_PARAMETER`, `quiet-once`;
- one younger than `GATEWAY_IDLE_CONFIRM_MINUTES` → `quiet-once` again, nothing asked;
- one at least that old → first ECS: the cluster's running tasks less the service's own (`ListTasks` with `desiredStatus: RUNNING`, both lists read to their last page). A session task reaches the loop and the lanes on the app task's private name, never through the gateway, so its use is invisible to the invocation metric — and between two of its steps the loop may report no run in progress. Any such task keeps the service and the observation (`busy`, with `runningJobs`) — unless it is over the ceiling: the tasks are described (`DescribeTasks`, a hundred per call) and one created more than `GATEWAY_IDLE_JOB_MAX_MINUTES` ago (`createdAt`, set when `RunTask` accepted it, so a task stuck pulling its image is bounded too) is stopped with the reason `idle: over the ceiling of N minutes`, logged as `job stopped over the ceiling`, and counted apart (`stoppedJobs`) rather than as running. ECS never ends a task on its own, and the engine's time limit holds only at a step's or a question's boundary — a hang in the browser's close or the profile's upload would otherwise keep the session's task and the app's running for good, every run `busy`, no alarm. ECS not answering — the listing, the describe or a stop — keeps the service and the observation (`jobs-unknown`, logged as `tasks could not be counted`). A migrate task in flight counts the same way, which is harmless.
- none → `GET <GATEWAY_LOOP_URL>/runs?status=running&limit=1` with a 5 s timeout: a 200 whose `meta.total` is 0 sets the service to zero tasks and clears the observation (`stopped`); a run in progress keeps both (`busy`); a loop that cannot be asked keeps both (`loop-unreachable`) — a wrong stop loses a run or a session, a wrong keep costs one interval.

A service already at zero clears a stale observation (`asleep`); one not found is left alone (`service-unknown`). It returns `{outcome, idleMinutes, invocations, desiredCount?, quietSince?, runningJobs?, stoppedJobs?, runningRuns?}`; a check that throws is logged as `idle check failed` and left failed, so the schedule's own error count is what an alarm reads. The state parameter is the idle handler's: the stack creates it with `none`, the handler writes it (and writes `none` back when the observation is cleared, never deleting what the stack declares), and CloudFormation never reconciles its value.

## `job`

One launch of the browser session as one task. The event is `{launch, args?}`: a launch named in `GATEWAY_JOB_LAUNCHES`, and up to 32 arguments, each one printable word without spaces (an operator's `--max-tasks 2`; a schedule sends none). The handler, in order:

1. refuses an event of any other shape, naming the fault, and a launch outside the list, naming the launches it knows (`JobRefused`) — before anything is touched;
2. asks ECS for a task of the session family tagged `job/<launch>` that it wants running (`ListTasks` with `family`, `startedBy` and `desiredStatus: RUNNING`, every page; a task still provisioning or pending counts) and refuses, naming the task's ARN, while one exists — before the service is touched. A schedule invokes the function asynchronously, so Lambda may deliver an event twice or retry a failed invocation one and two minutes later, and an operator can run `aws.sh session run` while the schedule's task is coming up; the engine's one-session-per-profile lease does not catch the second task, because the row it reads is written only after the profile is restored and the loop is awaited, minutes in. Two sessions on one profile would both archive it and both apply. The lookup needs `ecs:ListTasks` on the cluster;
3. tells the app service to want one task when it wants none (`ensureDesired`, shared with `proxy`); a service not found is a refusal, since the session would reach nothing;
4. starts one task of `GATEWAY_JOB_TASK_DEFINITION` — passed to `RunTask` as given, so a family runs its latest active revision — whose `GATEWAY_JOB_CONTAINER` runs `GATEWAY_JOB_COMMAND` with every `{launch}` replaced by the launch's name and the arguments appended — the one derivation of a session's command, for the schedule and the operator alike — placed on `GATEWAY_JOB_CAPACITY_PROVIDER` (a capacity provider strategy; a launch type beside it is refused by ECS), on a public address in `GATEWAY_JOB_SUBNETS` with `GATEWAY_JOB_SECURITY_GROUP` (no NAT, and the session needs the internet), with ECS Exec on, tagged `startedBy: job/<launch>` (ECS allows letters, digits, `-`, `/` and `_` there, no colon);
5. answers `{launch, taskArn}` and logs `job started`.

Every failure is thrown — a refused event, a launch already running, ECS not answering the lookup or the wake, `RunTask` answering a failure (its reason is the message) — after a `job failed` log line, so a scheduled invocation that started nothing shows in the function's error count and an operator's `aws lambda invoke` reads `FunctionError`.

## Configuration

`src/config.ts` declares every variable with its fallback, per handler, and is the only file that reads the environment (`config.spec.ts` holds it to that). A value that is not what its row says is refused by name on the handler's first call. The three handlers share the ECS rows and nothing else.

`proxy`:

| Variable                       | Fallback | Meaning                                                             |
| ------------------------------ | -------- | ------------------------------------------------------------------- |
| `GATEWAY_ROUTES`               | required | the routes, as JSON `[{prefix, port, strip?, api?, public?}]`       |
| `GATEWAY_UPSTREAM_HOST`        | required | the task's private DNS name                                         |
| `GATEWAY_ORIGIN_SECRET`        | required | the value CloudFront sends in `x-origin-verify`                     |
| `GATEWAY_COGNITO_USER_POOL_ID` | required | the user pool, `<region>_<id>`; its prefix is the region            |
| `GATEWAY_COGNITO_CLIENT_ID`    | required | the pool's app client (public, password and refresh flows)          |
| `GATEWAY_ECS_CLUSTER`          | required | the cluster of the service to wake                                  |
| `GATEWAY_ECS_SERVICE`          | required | that service                                                        |
| `GATEWAY_DB_HOST`              | unset    | a database to touch while waking; none when unset                   |
| `GATEWAY_DB_PORT`              | `5432`   | its port                                                            |
| `GATEWAY_UPSTREAM_TIMEOUT_MS`  | `110000` | how long a forwarded request's answer may take once connected       |
| `GATEWAY_CONNECT_TIMEOUT_MS`   | `5000`   | how long its connection may take to be made; longer wakes the stack |

`idle`:

| Variable                       | Fallback | Meaning                                                                                                                                                                                         |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GATEWAY_ECS_CLUSTER`          | required | the cluster of the service to stop, whose other tasks are the jobs                                                                                                                              |
| `GATEWAY_ECS_SERVICE`          | required | that service                                                                                                                                                                                    |
| `GATEWAY_LOOP_URL`             | required | where `idle` asks for runs in progress                                                                                                                                                          |
| `GATEWAY_IDLE_MINUTES`         | `15`     | how long without an invocation before an observation counts as quiet                                                                                                                            |
| `GATEWAY_PROXY_FUNCTION_NAME`  | required | the proxy function whose invocations `idle` reads                                                                                                                                               |
| `GATEWAY_IDLE_STATE_PARAMETER` | required | the SSM String parameter the first quiet observation is kept in                                                                                                                                 |
| `GATEWAY_IDLE_CONFIRM_MINUTES` | `5`      | how old that observation must be before a second one may stop the service                                                                                                                       |
| `GATEWAY_IDLE_JOB_MAX_MINUTES` | `240`    | a whole number of minutes, at least 1: a task that is not the service's own and was created longer ago than this is stopped by `idle` — above a session's own two-hour limit and its stop grace |

`job`:

| Variable                        | Fallback  | Meaning                                                                                                                                                                          |
| ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GATEWAY_ECS_CLUSTER`           | required  | the cluster of the service to wake, where the task runs                                                                                                                          |
| `GATEWAY_ECS_SERVICE`           | required  | that service                                                                                                                                                                     |
| `GATEWAY_JOB_TASK_DEFINITION`   | required  | the session task definition: its family (ECS runs the latest active revision, so a new image never changes the value) or a revision ARN; the lookup takes the family from either |
| `GATEWAY_JOB_CONTAINER`         | required  | the container of it whose command the launch replaces                                                                                                                            |
| `GATEWAY_JOB_COMMAND`           | required  | the command template, a JSON array of words with `{launch}` in at least one (from `apps.json`)                                                                                   |
| `GATEWAY_JOB_LAUNCHES`          | required  | the launches the handler may start, comma-separated, each declared once                                                                                                          |
| `GATEWAY_JOB_SUBNETS`           | required  | the subnets the task joins, comma-separated                                                                                                                                      |
| `GATEWAY_JOB_SECURITY_GROUP`    | required  | the security group it joins                                                                                                                                                      |
| `GATEWAY_JOB_CAPACITY_PROVIDER` | `FARGATE` | `FARGATE` or `FARGATE_SPOT`                                                                                                                                                      |

## Layout

`routes.ts` (the declared routes and the reserved `/auth`) · `http.ts` (the function URL shapes, the shared answers and the page frame) · `auth/` (the session layer: `session.ts` over the seams in `port.ts`; `cookies.ts`, `login-page.ts`; `adapters.ts` the real verifier, the Cognito client and the authenticator over its `send`) · `upstream.ts` (the forwarding port and the event ↔ request translations) · `proxy.ts`, `wake.ts`, `idle.ts`, `job.ts` (the handlers over their seams; `wake.ts` holds `ensureDesired`, the one reading of "asleep") · `adapters/aws.ts`, `adapters/network.ts` (ECS — the service, the task runner with its lookup, the job count with its ceiling —, CloudWatch, the SSM idle state; `node:http`, the loop, the database touch) · `main.ts` (the wiring). Every seam is a port with a fake in its spec; no spec reaches the network.
