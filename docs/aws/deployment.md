# The studio on AWS — declaring, deploying and operating it

`infra/aws` declares the studio's production deployment as six CloudFormation stacks, and
`.github/workflows/deploy-aws.yml` deploys them from `main`. Nine parts run as one Fargate task
behind one CloudFront hostname — the Studio (`studio-ui`), its API (`studio-api`), the quality loop
and its inspector (`quality-loop`, `quality-loop-ui`), govcon and its client (`govcon`, `govcon-ui`),
the notifications bus with two Telegram bots, and the two lanes a browser session calls
(`job-application`, the advisor; `agentic-system`, the memory host) — with a sign-in page the
gateway renders and checks against a Cognito user pool, PostgreSQL on Aurora Serverless v2 (the
memory tier as pgvector tables in the same database), the loop's run dumps on EFS, and the whole
thing asleep when nobody is using it. Beside the task, the browser session (`browser-session`) runs
as a scheduled one-off task: a headless Chromium on a Debian image, its signed-in state carried from
the laptop through an encrypted S3 bucket, started nightly by an EventBridge schedule through a job
Lambda that wakes the task first. This runbook covers what each stack declares and why, the local
equivalents, the one-time setup, moving the laptop's data and lanes to the cloud, how a deploy runs,
rollback, validating production, how the stack wakes and sleeps, troubleshooting, and the limits and
costs. The folder map is [`infra/aws/README.md`](../../infra/aws/README.md); the gateway's own page is
[`packages/app-gateway/README.md`](../../packages/app-gateway/README.md); the session's cloud
section is in [`docs/pipelines/browser-session.md`](../pipelines/browser-session.md).

Written 2026-11-11 from the files in the repository; the browser session, the two lanes and the
memory tier were added on 2026-11-12, the same way. Nothing has been deployed to an AWS account yet,
so every statement about live behaviour — wake times, Aurora's resume, the shape of the OIDC claim,
what an expired token does, what LinkedIn makes of a datacenter address — is read from the vendor's
documentation or from the plan this was built to, and is marked as such. The first deploy is what
verifies them; update this page with what it measures.

## What it is and how it fits

```
browser ──HTTPS──▶ CloudFront (one distribution, <id>.cloudfront.net)
                   │  /_next/static/*, /inspector/_next/static/*, /govcon/_next/static/* → CachingOptimized
                   │  everything else → CachingDisabled, AllViewerExceptHostHeader, all methods, 503 never cached
                   │  origin custom header x-origin-verify: <secret>
                   ▼
            Lambda function URL (AuthType NONE; the gateway refuses any request without the header)
                   ▼
            app-gateway Lambda (in the VPC, IPv6 to the AWS APIs)
                   │  1. session: cookie sd_id verified; expired → refreshed from sd_refresh (cognito-idp);
                   │     none → 302 to /auth/login, the gateway's own sign-in page (cognito-idp InitiateAuth);
                   │     an api route gets 401 JSON instead; a public route (the static assets, /api/health)
                   │     is never asked for a session
                   │  2. declared routes, longest prefix wins: /api → :3000 · /loop → :3003 (stripped)
                   │     /govcon-api → :3004 (stripped) · /inspector → :4201 · /govcon → :4202 · / → :4200
                   │  3. nobody listening → desiredCount 1, touch the database, answer 503 "starting"
                   ▼
            Cloud Map private DNS app.sysdesign.internal (A record, TTL 10)
                   ▼
            ECS Fargate task (ARM64, 1 vCPU / 8 GB, public dual-stack subnet, no NAT)
              ├─ studio-ui       :4200  Next standalone, NEXT_PUBLIC_API_URL=/api
              ├─ quality-loop-ui :4201  Next standalone, basePath /inspector, NEXT_PUBLIC_QUALITY_LOOP_URL=/loop
              ├─ govcon-ui       :4202  Next standalone, basePath /govcon, NEXT_PUBLIC_GOVCON_URL=/govcon-api
              ├─ studio-api      :3000  → localhost:3003
              ├─ quality-loop    :3003  spawns the bundled Claude CLI on the subscription token; dumps on EFS;
              │                         memories as pgvector tables in Aurora (OPENAI_API_KEY embeds them)
              ├─ govcon          :3004  (command: serve) → localhost:3003, localhost:3005
              ├─ notifications   :3005  channels file telegram-cloud (the govcon bot and the job-application bot)
              ├─ job-application :3006  the advisor a session asks; no route from the edge
              └─ agentic-system  :3007  the memory host a session asks; no route from the edge
                      │ EFS /app/static/runs                 │ Aurora Serverless v2 PostgreSQL 16 (min 0 ACU, pgvector)
   idle Lambda (EventBridge Scheduler, every 5 min): no gateway invocation for 15 min, seen on two
   runs in a row (the first writes /sysdesign/prod/idle-state), AND no session task running, AND
   GET /runs?status=running&limit=1 answers meta.total 0 → desiredCount 0; a session task older
   than IdleJobMaxMinutes (240) is stopped by it

   EventBridge schedule per launch (UTC; linkedin cron(5 0 * * ? *), builtin cron(5 1 * * ? *); DISABLED until flipped)
                   ▼
            job Lambda (sysdesign-prod-app-job, handler main.job): refuses a launch the declaration does not name
            or whose task is still running, desiredCount 1 when the service sleeps, RunTask of the session task
            family (its latest revision) with ["run","--launch","<name>","--headless","--wait-for-loop","8"]
            (+ a manual run's extra arguments); a start that failed is retried by Lambda twice, within the hour
                   ▼
            browser-session task (ARM64, 2 vCPU / 4 GB, Debian + the bundled Chromium, headless; its own security group)
              │  → app.sysdesign.internal:3003 (loop), :3005 (notifications), :3006 (advisor), :3007 (memory)
              │  EFS /app/static/browser-session (dumps)      S3 files bucket, SSE-KMS: state/, profiles/, docs/
              └  at start: the profile archive restored, or a fresh profile seeded from the exported state;
                 at the end: the profile archived back to the bucket
```

Everything is one declaration, `infra/aws/apps.json`: every image (its kind, port, health path,
command, base path and the one `NEXT_PUBLIC_*` variable a Next image bakes in), the gateway's
routes, and the scheduled job (its playwright image, its command template with `{launch}`, and its
launches with their `cron(…)` expressions). The image matrix both workflows build from
(`infra/aws/bin/image-matrix.js`), the templates' containers, the `GatewayRoutes` parameter, the
edge's cached paths, the session task's addresses, the schedules and the job function's environment
must agree with it — `tooling/aws-deploy.spec.ts` and `tooling/aws-deploy-jobs.spec.ts` (`CLOUD-1`
to `CLOUD-5`, registered in `packages/criteria/src/cloud.ts`) fail when one drifts. The stacks are
`sysdesign-prod-bootstrap`, `-network`, `-data`, `-platform`, `-app` and `-edge`; every resource
name derives from the stack's name, every export is `sysdesign-prod-<Name>`, and the stacks reach
each other only through `!ImportValue`. Every stack carries the tags `project=sysdesign`,
`env=prod`, `managed-by=cloudformation` and `repo=oegonzal/system-design`.

### `bootstrap.yaml` — deployed once, by hand (`pnpm aws:bootstrap`)

It declares the trust CI deploys with, so CI can never deploy it.

| Resource                                                            | What it declares, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GitHubOidcProvider`                                                | `https://token.actions.githubusercontent.com` with audience `sts.amazonaws.com`, no thumbprint list (AWS trusts GitHub's root CA for this provider).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GitHubDeployRole` (`sysdesign-prod-bootstrap-github-deploy`)       | What the workflow assumes. Its trust lists both subject forms GitHub issues — `repo:<owner>/<repo>:environment:production` and the immutable `repo:<owner>@<owner id>/<repo>@<repo id>:environment:production` — so whichever the token carries, only a job of the `production` environment of this repository can assume it. Its permissions are listed, not `*`: CloudFormation on `stack/sysdesign-prod-*`, `iam:PassRole` on the execution role and `role/sysdesign-prod-*`, ECR login and push on `repository/sysdesign/*`, the artifacts bucket, `ecs:DescribeServices`/`UpdateService` on `sysdesign-prod-*`, `ecs:RunTask` and `ecs:ExecuteCommand` scoped to the `sysdesign-prod-*` clusters, `ecs:DescribeTaskDefinition`, `ecs:DescribeTasks` and `ecs:ListTasks` (`ListTasks` by its `ecs:cluster` condition), `ssm:StartSession` on the `AmazonECS-ExecuteCommand` document, reading `/sysdesign/prod/*` logs, `rds:DescribeDBClusters` on `cluster:sysdesign-prod-*` and `cloudwatch:GetMetricStatistics` (what `aws.sh status` reads), `sts:GetCallerIdentity`. |
| `CloudFormationExecutionRole` (`sysdesign-prod-bootstrap-cfn-exec`) | What CloudFormation itself creates the other five stacks with (`--role-arn` on every deploy): the services whole (`ec2`, `ecs`, `rds`, `elasticfilesystem`, `logs`, `cloudfront`, `lambda`, `scheduler`, `servicediscovery`, `route53` — Cloud Map creates a hosted zone — `cognito-idp`, `sns`, `cloudwatch`), `s3:*` on the `sysdesign-prod-data-*` buckets (the data stack's files bucket; the bootstrap artifacts bucket stays out of its reach), the KMS key-management actions (create, describe, alias, policy, rotation, tags, description, scheduled deletion — a key has no name to scope by, so the actions are listed), and IAM and SSM narrowed to the `sysdesign-prod-*` role names and the `/sysdesign/prod/*` parameters; `kms:Decrypt` only through SSM, for the `ssm-secure` reference in the data stack. Trusts `cloudformation.amazonaws.com` from this account only.                                                                                                                                                                                      |
| `ArtifactsBucket` (`sysdesign-prod-bootstrap-artifacts-<account>`)  | Where `aws cloudformation package` uploads the gateway zip (`cfn/<tag>/…`) and `aws.sh db-import` a database dump (`imports/<file>`): versioned, SSE-S3, public access blocked, `cfn/` objects expire after 30 days and `imports/` objects after a day (their old versions a day later) — a dump holds every application, memory and bus row of the laptop. Retained on stack deletion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Eleven `AWS::ECR::Repository` (`sysdesign/<image>`)                 | One per image in `apps.json`: `studio-api`, `quality-loop`, `govcon`, `notifications`, `job-application`, `agentic-system`, `studio-ui`, `quality-loop-ui`, `govcon-ui`, `db-migrate`, `browser-session`. Tags are immutable (a tag always names the bytes that were tested), scanned on push, and the lifecycle keeps the last three tagged images and drops untagged layers after a day — which bounds how far back a rollback can reach. Retained on stack deletion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `MonthlyBudget` (`sysdesign-prod-bootstrap-monthly`)                | `MonthlyBudgetUsd` (15) with email notifications at 80 % actual and 100 % forecast to `BudgetEmail`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Parameters: `GitHubOwner`, `GitHubOwnerId`, `GitHubRepo`, `GitHubRepoId`, `ProductionEnvironmentName`
(`production`) and `MonthlyBudgetUsd` (15) come from `params/prod/bootstrap.json`; `BudgetEmail`
is required and is in no file, so it is passed on the command line (setup step 5). Exports:
`GitHubDeployRoleArn`, `CloudFormationExecutionRoleArn`, `ArtifactsBucket`, `EcrRegistry`. The three
repositories and the two execution-role statements the browser session needs were added on
2026-11-12, so an account bootstrapped before that runs `pnpm aws:bootstrap` again before the next
deploy.

### `network.yaml` — the VPC every other stack joins

| Resource                                                    | What it declares, and why                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vpc` + `VpcIpv6Block`                                      | `10.40.0.0/16` with an Amazon-provided IPv6 block; DNS support and hostnames on.                                                                                                                                                                |
| `PublicSubnetA`, `PublicSubnetB`                            | Two dual-stack public subnets (`us-east-1a`, `us-east-1b`; RDS and EFS each want two zones), `AssignIpv6AddressOnCreation`, `MapPublicIpOnLaunch: false` — the ECS service asks for its public IP itself, so nothing else gets one by accident. |
| `InternetGateway`, `PublicRouteTable`, routes, associations | `0.0.0.0/0` and `::/0` to the internet gateway. This is the tasks' egress (ECR pulls, Anthropic, OpenAI, SAM.gov, Telegram, LinkedIn and Built In) and the Lambdas' route to the dual-stack AWS endpoints.                                      |
| `S3Endpoint`                                                | A gateway endpoint (free): ECR layers and the files bucket come through it rather than the public internet.                                                                                                                                     |
| `GatewaySecurityGroup`                                      | The three Lambdas (gateway, idle, job): no inbound, egress both families.                                                                                                                                                                       |
| `SessionSecurityGroup`                                      | The browser-session task: no inbound, egress both families (Chromium needs the internet). A group of its own because membership of a group grants nothing to its other members, so the app, database and EFS groups admit it by name.           |
| `AppSecurityGroup`                                          | The task: 3000, 3003, 3004, 3005 and 4200–4202 from the gateway group; 3003, 3005, 3006 and 3007 from the session group (the loop, notifications, the advisor and the memory host a session calls).                                             |
| `DbSecurityGroup`                                           | Aurora: 5432 from the task, from the session task (its ledger) and from the gateway (which opens one connection to resume a paused cluster).                                                                                                    |
| `EfsSecurityGroup`                                          | The mount targets: 2049 from the task and from the session task.                                                                                                                                                                                |
| `Namespace`                                                 | Cloud Map private DNS `sysdesign.internal`, which the gateway and the session task resolve `app.sysdesign.internal` through.                                                                                                                    |

Exports: `PublicSubnetIds` (comma-joined), the five security-group ids, `NamespaceId`,
`NamespaceName`. Egress is declared for both families on every group because a declared egress
list replaces the implicit IPv4-only allow-all.

### `data.yaml` — what must survive a redeploy

| Resource                                                                    | What it declares, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DbLogGroup`                                                                | `/aws/rds/cluster/sysdesign-prod-data/postgresql` with `LogRetentionDays`, created before the cluster: Aurora would otherwise create it itself with no retention, and the exported PostgreSQL log would grow for ever.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `DbCluster` (`sysdesign-prod-data`)                                         | Aurora PostgreSQL `16.10` (16.3 or later is what allows a 0 ACU minimum; 16.8 or later ships pgvector 0.8, whose `vector` extension a migration creates and whose iterative scans the memory tier's filtered searches use), `ServerlessV2ScalingConfiguration` min 0 / max 2 ACU, `SecondsUntilAutoPause` 300, port 5432, database `sysdesign`, master user `sysdesign`, the password read as `{{resolve:ssm-secure:/sysdesign/prod/DB_PASSWORD:<DbPasswordVersion>}}` — a named version, so a rotation is an explicit deploy (Troubleshooting, "Rotating the database password") — encrypted, deletion protection, 7-day backups, PostgreSQL logs exported. `DeletionPolicy`/`UpdateReplacePolicy: Snapshot`. The memory tier's tables live here, so they are backed up with the rows they describe.                                                                    |
| `DbWriter` (`sysdesign-prod-data-writer`)                                   | The one `db.serverless` instance, never publicly accessible. An instance holds no data (the cluster volume does), so it may be replaced.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `DbSubnetGroup`                                                             | Both public subnets; the instance itself is not addressable from outside the VPC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `RunsFileSystem`, two mount targets, `RunsAccessPoint`                      | Encrypted EFS, elastic throughput, files move to IA after 7 days, a policy that denies mounts without TLS, automatic backups off (the dumps are diagnostic; the database is what is backed up). The access point pins every mount to uid/gid 1000 — the `node` user the runner image runs as — under `/quality-loop-runs`. Retained on stack deletion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SessionsAccessPoint`                                                       | A second access point on the same file system, `/browser-session`, uid/gid 1000: the browser session's dumps. A session task mounts this one and the app task the other, so neither sees the other's files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `FilesKey` + `FilesKeyAlias` (`alias/sysdesign-prod-files`)                 | A customer-managed KMS key, rotated yearly, for the files bucket: the signed-in browser state, the profile archives and the documents a session fills forms from are personal data. Its policy names the account root alone (which delegates use of the key to IAM; the session task role's own policy grants it `GenerateDataKey`, `Decrypt` and `Encrypt`), not the role — KMS refuses a key policy naming an IAM role that does not exist yet, and the role is the platform stack's, deployed after this one. Retained on stack deletion.                                                                                                                                                                                                                                                                                                                             |
| `FilesBucket` (`sysdesign-prod-data-files-<account>`) + `FilesBucketPolicy` | Where the session's files live between tasks: `state/<profile>.json` (the storage state exported on the laptop), `profiles/<profile>.tar.gz` (the Linux profile archived after every run), `docs/<file>` (the documents a mission fills forms from). Versioned (a bad archive rolls back), SSE-KMS with the key above and the bucket key on (fewer KMS calls), public access blocked, old versions expire after 30 days. The policy denies any connection without TLS, any PUT that names a key other than the bucket's, and any PUT that asks for an encryption other than `aws:kms` (an `AES256` upload carries no key id and would pass the key check alone); a PUT that names neither takes the bucket default. S3 has encrypted every object since 2023, so a "deny unencrypted uploads" rule would protect nothing and is not written. Retained on stack deletion. |

Parameters: `DatabaseName`, `MasterUsername`, `DbPasswordParameter` (`/sysdesign/prod/DB_PASSWORD`),
`DbPasswordVersion` (1), `EngineVersion`, `MinCapacity`, `MaxCapacity`, `SecondsUntilAutoPause`,
`BackupRetentionDays`, `LogRetentionDays`. Exports: `DbEndpoint`, `DbPort`, `DbName`,
`DbUsername`, `DbClusterIdentifier`, `DbMaxCapacity`, `EfsFileSystemId`, `EfsAccessPointId`,
`EfsAccessPointArn`, `SessionsAccessPointId`, `SessionsAccessPointArn`, `FilesBucketName`,
`FilesKeyArn`. `aws.sh deploy-stack data` turns the stack's termination protection on after every
deploy.

### `platform.yaml` — what the app runs on, and what outlives any one revision

Deployed after `data` and before the migration, so the migrate and session task definitions carry
the new tag before the service does.

| Resource                                                                | What it declares, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cluster` (`sysdesign-prod-platform`)                                   | Capacity providers `FARGATE` and `FARGATE_SPOT`; Container Insights off (it is a billed metric stream).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Six `AWS::Logs::LogGroup`                                               | `/sysdesign/prod/app` (one stream prefix per container), `/sysdesign/prod/migrate` (the stream `aws.sh migrate` tails), `/sysdesign/prod/gateway`, `/sysdesign/prod/idle`, `/sysdesign/prod/session` (a browser-session task, stream `browser-session/browser-session/<task id>`, the one `aws.sh session logs` tails) and `/sysdesign/prod/job` (the job function), each with `LogRetentionDays` (14), so logs never become the largest line of the bill.                                                                                                                                                                                                                                    |
| `TaskExecutionRole` (`sysdesign-prod-platform-task-execution`)          | What the ECS agent needs to start a task: pull from `repository/sysdesign/*`, write the app, migrate and session log groups, `ssm:GetParameters` under `/sysdesign/prod/*` and `kms:Decrypt` through SSM. Nothing the containers can use.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `TaskRole` (`sysdesign-prod-platform-task`)                             | What the app and migrate containers may do: accept an ECS Exec session (`ssmmessages:*`), mount the dump volume through its access point (`ClientMount`/`ClientWrite`), and read `imports/*` of the artifacts bucket (`s3:GetObject`), which is how the restore command `aws.sh db-import` gives the migrate task reaches the dump.                                                                                                                                                                                                                                                                                                                                                           |
| `SessionTaskRole` (`sysdesign-prod-platform-session-task`)              | What a browser-session task may do: ECS Exec; mount the sessions access point and nothing else of the file system; `s3:GetObject`/`PutObject`/`DeleteObject` on `profiles/*`, `state/*` and `docs/*` of the files bucket and `s3:ListBucket` on the whole bucket — unconditioned, because S3 answers 404 for a missing object only to a caller allowed to list the bucket and 403 otherwise, and a `HeadObject` carries no `s3:prefix` for a prefix condition to match, so a conditioned grant would turn "no archive yet" into `Forbidden`, which the session's S3 adapter reads as a failure rather than as the first run; `kms:GenerateDataKey`, `Decrypt` and `Encrypt` on the files key. |
| `MigrateTaskDefinition` (family `sysdesign-prod-platform-migrate`)      | ARM64, 0.5 vCPU / 1 GB, the `db-migrate` image at `ImageTag` with the same `DB_*` environment and the `DB_PASSWORD` secret as the services, plus `AWS_REGION` (the restore command's S3 client reads it; Fargate usually sets it, the template states it) and `ARTIFACTS_BUCKET` (read only by the restore command), logging to `/sysdesign/prod/migrate` under the stream prefix `db-migrate` (its container name, the one `lib.sh` reads back); `aws.sh migrate` runs it once per deploy, before the app stack, and `aws.sh db-import` runs it with a command override.                                                                                                                     |
| `SessionTaskDefinition` (family `sysdesign-prod-platform-session`)      | ARM64, 2 vCPU / 4 GB (a starting size for one headless Chromium, to be measured), the `browser-session` image at `ImageTag`, no `Command` (the job function supplies it), the session task role, `InitProcessEnabled` (an init reaps Chromium's children), `StopTimeout` 120 (the engine archives the profile when stopped), the EFS volume `sessions` mounted at `/app/static/browser-session`, the environment and secrets of the next table, logging to `/sysdesign/prod/session` under the prefix `browser-session`. Fargate's default 20 GiB ephemeral disk holds the image, the restored profile and the documents.                                                                     |
| `UserPool` (`sysdesign-prod-platform-users`)                            | Email as the username, admin-created users only (no self sign-up), a 12-character password with upper, lower, digit and symbol, MFA off, recovery by verified email. Retained on stack deletion, so the one user survives a stack replacement.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `UserPoolClient` (`sysdesign-prod-platform-gateway`)                    | A public client (no secret; the gateway would have to hold one) with exactly the two flows the gateway's own sign-in page uses: `ALLOW_USER_PASSWORD_AUTH` for the form and `ALLOW_REFRESH_TOKEN_AUTH` for the session cookie; no OAuth flows, no callback URL, no hosted-UI domain, user-existence errors hidden. ID and access tokens valid 1 hour, refresh tokens 30 days. The pool and client ids reach the gateway as two environment variables.                                                                                                                                                                                                                                         |
| `AlertsTopic` (`sysdesign-prod-platform-alerts`) + `AlertsSubscription` | What the app stack's alarms publish to; the email subscription exists only when `AlertEmail` is given.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Parameters: `ImageTag` (a workflow override, like the app stack's), `LogRetentionDays` (14),
`SecretsPrefix` (`/sysdesign/prod`), `AlertEmail` (empty; an `aws.sh deploy-stack platform
AlertEmail=…` override). Exports: `ClusterName`, `TaskExecutionRoleArn`, `TaskRoleArn`,
`AppLogGroupName`, `GatewayLogGroupName`, `IdleLogGroupName`, `SessionLogGroupName`,
`JobLogGroupName`, `MigrateTaskDefinitionArn` (read by `aws.sh`, imported by no stack),
`SessionTaskFamily` (the family, never the revision ARN: an export another stack imports cannot
change, and the revision changes with every tag, so the platform stack could never be updated
again — `tooling/aws-deploy-jobs.spec.ts` refuses an import of a task-definition revision),
`SessionTaskRoleArn`,
`UserPoolId`, `UserPoolClientId`, `AlertsTopicArn`.

### `app.yaml` — everything that runs, redeployed on every tag

| Resource                                                        | What it declares, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppTaskDefinition` (family `sysdesign-prod-app-app`)           | ARM64, `TaskCpu` 1024 / `TaskMemory` 8192, the platform's two roles, the nine containers of `apps.json` with the environment and secrets in the next table, a `wget` health check on each Nest container at `127.0.0.1:<port><health>` (interval 30 s, `StartPeriod` 90 s: the loop's boot spawns the Claude CLI for its account check, up to 30 s), `StopTimeout` 120 on `quality-loop` so its shutdown hooks close the pools before the task is killed, and the EFS volume `runs` (transit encryption, IAM) mounted at `/app/static/runs` on `quality-loop`. Logs are `awslogs` in non-blocking mode with a 25 MB buffer, so a logging stall never blocks a run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `CloudMapService` (`app`)                                       | `app.sysdesign.internal`, an A record with TTL 10, failure threshold 1: the task's address, re-read within seconds of a new task, by the gateway and by every session task.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Service` (`sysdesign-prod-app-app`)                            | One task in the platform's cluster, `MinimumHealthyPercent` 0 / `MaximumPercent` 100 (a deploy stops the old task before starting the new one, so two tasks never bill at once), circuit breaker with rollback, `EnableExecuteCommand`, public subnets with `AssignPublicIp ENABLED` and the app security group, registered in Cloud Map. **No `DesiredCount`:** ECS starts one task at creation and, per the CloudFormation reference, leaves the count alone on every later update, so the gateway, the job function and the idle function own it from then on, and a deploy while asleep registers the new revision without starting a task. The migration has already run on the new image by the time this stack rolls (How a deploy works), so the service never starts on a schema older than its code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GatewayFunction` (`sysdesign-prod-app-gateway`) + URL          | `nodejs24.x`, arm64, 512 MB, timeout 150 s (the 5 s connect budget and 110 s answer budget, with room for the sign-in and wake calls around them), handler `main.proxy` from `packages/app-gateway/dist` (packaged by the deploy script), in both subnets with the gateway security group, `Ipv6AllowedForDualStack` and `AWS_USE_DUALSTACK_ENDPOINT=true` so it reaches ECS and CloudWatch without a NAT (its Cognito client pins `cognito-idp.us-east-1.amazonaws.com` itself). The function URL is `AuthType NONE` in `BUFFERED` mode; the gateway, not the URL, is what refuses the open internet. The gateway's own role may describe and update the one service and nothing else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `IdleStateParameter` (`/sysdesign/prod/idle-state`)             | An SSM String the idle function owns: when it last saw the gateway quiet, or `none`. The stack creates it with `none` and never reconciles the value afterwards (the function rewrites it as it runs, `none` again when the observation is cleared, and never deletes it), so a stack update leaves whatever is there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `IdleFunction` (`sysdesign-prod-app-idle`) + `IdleSchedule`     | The same bundle with handler `main.idle`, 256 MB, 60 s, invoked by an EventBridge Scheduler schedule every 5 minutes (`IdleConfirmMinutes`) through `SchedulerRole`; its role may read `cloudwatch:GetMetricData`, describe and update the service, get and put the one state parameter, `ecs:ListTasks` in the cluster — it counts the running tasks that are not the service's own, so a browser session in flight keeps the app awake — and `ecs:DescribeTasks`/`ecs:StopTask` on the cluster's tasks: a session task older than `IdleJobMaxMinutes` (`GATEWAY_IDLE_JOB_MAX_MINUTES`, 240) is stopped, since ECS has no task deadline and a session hung below the engine's rails would otherwise keep itself and the app task running until someone looked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `JobFunction` (`sysdesign-prod-app-job`)                        | The same bundle with handler `main.job`, 256 MB, 60 s, in the VPC like the others, invoked by a schedule or by `aws.sh session run`. Its environment carries the declaration: `GATEWAY_JOB_COMMAND` (the `jobs.browser-session.command` array of `apps.json`, minified), `GATEWAY_JOB_LAUNCHES` (the launch names, comma-joined), `GATEWAY_JOB_CONTAINER` (`browser-session`), `GATEWAY_JOB_TASK_DEFINITION` (the platform's `SessionTaskFamily` export, `sysdesign-prod-platform-session`: `RunTask` with a family runs its latest `ACTIVE` revision, which the platform deploy keeps current), `GATEWAY_JOB_SUBNETS`, `GATEWAY_JOB_SECURITY_GROUP` (the session group) and `GATEWAY_JOB_CAPACITY_PROVIDER` (`JobCapacityProvider`), beside `GATEWAY_ECS_CLUSTER`/`GATEWAY_ECS_SERVICE`. Its role may describe and update the service, `ecs:ListTasks` in the cluster (the handler refuses a launch whose `job/<launch>` task is still `RUNNING`, so a retry never starts a second session on one profile), `ecs:RunTask` the `sysdesign-prod-platform-session` family in the cluster, and pass the execution role and the session task role to ECS. `JobFunctionRetries` (`AWS::Lambda::EventInvokeConfig`) bounds Lambda's own retry of a failed invocation to two more attempts and an event age of an hour. |
| `JobScheduleRole` + `JobScheduleLinkedin`, `JobScheduleBuiltin` | One `AWS::Scheduler::Schedule` per launch in `apps.json`, each `ScheduleExpressionTimezone: UTC`, no flexible window, `State` from `JobSchedulesState` (**`DISABLED` by default**: nothing runs unattended until the owner has run a launch by hand and flips the parameter), `Input: {"launch":"<name>"}`, a retry policy of two attempts within an hour that covers only the delivery of the event to Lambda (a throttle, a permission). The schedule invokes the function asynchronously, so a start that fails inside the function — a `RunTask` refused for capacity, a throw — is retried by Lambda's own async policy, `JobFunctionRetries`: two more attempts, about one and two minutes later, none once the event is an hour old, so a night's session is never started the next afternoon; the handler's running-task check is what keeps a retry of a start that did succeed from starting a second task. The role trusts `scheduler.amazonaws.com` from this account and may invoke the job function only.                                                                                                                                                                                                                                                                                          |
| Four alarms on the platform's topic                             | `gateway-errors`, `idle-errors` and `job-errors` (one Lambda error in five minutes — an idle function that fails never stops the service; a job function that fails did not start a session), `database-at-max-capacity` (Aurora at `DbMaxCapacity` for 30 minutes: a runaway query or a ceiling too low).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Parameters: `ImageTag` (a commit SHA, `^[0-9a-f]{7,40}$`) and `OriginSecret` (`NoEcho`, at least 32
characters) are workflow overrides in no file; `GatewayRoutes` defaults to the routes array of
`apps.json`, minified; `TaskCpu`, `TaskMemory` (8192: the lanes joined the task), `CapacityProvider`
(`FARGATE` | `FARGATE_SPOT`), `IdleMinutes` (15), `IdleConfirmMinutes` (5, the schedule's
interval), `IdleJobMaxMinutes` (240: the age past which the idle function stops a session task,
above the longest launch's 120 minutes plus the grace a unit in flight gets), `SecretsPrefix`
(`/sysdesign/prod`), `DeploySamGovKey` (`false`), `DeployOpenAiKey`
(`true`: the memory tier embeds with it), `JobSchedulesState` (`DISABLED`) and `JobCapacityProvider`
(`FARGATE`) have defaults, with `params/prod/app.json` restating them. Exports: `ServiceName`,
`GatewayFunctionUrl`.

What each container runs with (every value a template literal or an export; the rows app code
gained in phase 4 are the session's `BROWSER_CHANNEL`, `BROWSER_PROFILE_BUCKET` and
`BROWSER_SESSION_DOCS_DIR`, and notifications' `NOTIFICATIONS_CHANNELS`):

| Container                                                | Environment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Secrets (SSM, read by ARN when the task starts)                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all six Nest containers, `db-migrate`, `browser-session` | `DB_HOST` (the cluster endpoint), `DB_PORT` (5432), `DB_USERNAME`, `DB_NAME`, `PGSSLMODE=verify-full`, `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem` (the RDS CA bundle vendored in `docker/rds-global-bundle.pem`)                                                                                                                                                                                                                                                                                                                                                                                                                       | `DB_PASSWORD` ← `/sysdesign/prod/DB_PASSWORD`                                                                                                                                                                                                                                                                                     |
| `studio-api`                                             | `PORT=3000`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |                                                                                                                                                                                                                                                                                                                                   |
| `quality-loop`                                           | `QUALITY_LOOP_PORT=3003`, `QUALITY_LOOP_DUMP_DIR=/app/static/runs` (the EFS mount), and for the spawned CLI `DISABLE_AUTOUPDATER=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `USE_BUILTIN_RIPGREP=0` (Alpine needs the system ripgrep)                                                                                                                                                                                                                                                                                                                                                                      | `CLAUDE_CODE_OAUTH_TOKEN` ← `/sysdesign/prod/CLAUDE_CODE_OAUTH_TOKEN`; `OPENAI_API_KEY` ← `/sysdesign/prod/OPENAI_API_KEY` when `DeployOpenAiKey=true`                                                                                                                                                                            |
| `govcon` (command `serve`)                               | `GOVCON_PORT=3004`, `NOTIFICATIONS_URL=http://localhost:3005`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `SAM_GOV_API_KEY` ← `/sysdesign/prod/SAM_GOV_API_KEY`, only when `DeploySamGovKey=true`                                                                                                                                                                                                                                           |
| `notifications`                                          | `NOTIFICATIONS_PORT=3005`, `NOTIFICATIONS_CHANNELS=telegram-cloud`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `GOVCON_TELEGRAM_API_KEY`, `GOVCON_TELEGRAM_BOT_ID`, `JOBAPPLICATION_TELEGRAM_API_KEY`, `JOBAPPLICATION_TELEGRAM_BOT_ID`, `TELEGRAM_CHAT_ID` ← `/sysdesign/prod/notifications/GOVCON_TELEGRAM_API_KEY`, `…/GOVCON_TELEGRAM_BOT_ID`, `…/JOBAPPLICATION_TELEGRAM_API_KEY`, `…/JOBAPPLICATION_TELEGRAM_BOT_ID`, `…/TELEGRAM_CHAT_ID` |
| `job-application`                                        | `JOB_APPLICATION_PORT=3006`, `NOTIFICATIONS_URL=http://localhost:3005`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |                                                                                                                                                                                                                                                                                                                                   |
| `agentic-system`                                         | `AGENTIC_SYSTEM_PORT=3007`, `QUALITY_LOOP_URL=http://localhost:3003`, `NOTIFICATIONS_URL=http://localhost:3005`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `OPENAI_API_KEY` ← `/sysdesign/prod/OPENAI_API_KEY` when `DeployOpenAiKey=true`                                                                                                                                                                                                                                                   |
| the three Next containers                                | `PORT` (4200, 4201, 4202), `HOSTNAME=0.0.0.0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                   |
| `db-migrate` (platform stack)                            | `ARTIFACTS_BUCKET` (the bootstrap export; read only by the restore command), `AWS_REGION` (the stack's region, which the restore command's S3 client reads; Fargate usually sets it, the template states it)                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                                                                                                                                                                                   |
| `browser-session` (platform stack, one-off)              | `QUALITY_LOOP_URL=http://app.sysdesign.internal:3003`, `NOTIFICATIONS_URL=http://app.sysdesign.internal:3005`, `UNIT_ADVISOR_URLS=job-application=http://app.sysdesign.internal:3006`, `AGENTIC_SYSTEM_URL=http://app.sysdesign.internal:3007` (the namespace comes from the export), `BROWSER_CHANNEL=chromium`, `BROWSER_SESSION_DUMP_DIR=/app/static/browser-session/sessions` (EFS), `BROWSER_PROFILES_DIR=/app/static/profiles` and `BROWSER_SESSION_DOCS_DIR=/app/static/docs` (the task's own disk), `BROWSER_PROFILE_BUCKET` (the files bucket export), `AWS_REGION` (the S3 client reads it; Fargate usually sets it, the template states it) | `BROWSER_SESSION_SUBJECT` ← `/sysdesign/prod/browser-session/SUBJECT`, `MEMORY_TENANT` ← `/sysdesign/prod/browser-session/MEMORY_TENANT` (both Strings, kept out of the template because they are personal)                                                                                                                       |

`QUALITY_LOOP_URL` and the other service-to-service addresses stay at their `localhost` defaults
inside the task because every container shares its network namespace; the session task, a task of
its own, names the app task by its Cloud Map name instead, on the four ports the app security
group admits from the session group (`CLOUD-2` holds the addresses, the ports and the ingress to
each other). The CORS variables stay default because every call is same-origin through the edge.
`OPENAI_API_KEY` reaches the loop and the memory host under `DeployOpenAiKey` (default `true`):
the memory tier is pgvector tables in Aurora, created by the services at boot after a migration
creates the `vector` extension, and the key is what embeds into them — with `DeployOpenAiKey=false`
the embedding client is disabled, grading and coaching run, and only recall by meaning is off. No
`QDRANT_URL` exists anywhere since the move. The guard rules and `CLOUD-3` hold the
credential-named variables to `Secrets`, and `ANTHROPIC_API_KEY` to nowhere at all.

### `edge.yaml` — the public hostname

| Resource       | What it declares, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Distribution` | One origin, the gateway's function URL host, `https-only`, `OriginReadTimeout` (120 s), `OriginKeepaliveTimeout` 5, the `x-origin-verify` custom header. Default behaviour: `CachingDisabled`, `AllViewerExceptHostHeader`, every method, compressed. Three behaviours for the hashed Next assets under `/_next/static/*`, `/inspector/_next/static/*` and `/govcon/_next/static/*`: `CachingOptimized`, GET/HEAD — public JavaScript, no session, and no cookie forwarded, which is why those prefixes are `public` routes in `apps.json` (`CLOUD-2` holds the two lists to each other). 503 cached for 0 s so a "starting" page is never served stale. `redirect-to-https`, `PriceClass_100`, HTTP/2 and 3, IPv6, the default `*.cloudfront.net` certificate. |

Parameters: `OriginSecret` (the same value the app stack was deployed with) and `OriginReadTimeout`
(120 in `params/prod/edge.json`; 1–120 as the account comes, and more needs a CloudFront quota
request). Output: `SiteUrl` (`https://<distribution>/`, the GitHub environment's URL); nothing
imports it, so it is not exported.

### The gateway (`packages/app-gateway`)

Three Lambda handlers in one bundle. A request through `proxy` goes, in order: the `x-origin-verify`
header compared in constant time with `GATEWAY_ORIGIN_SECRET` (anything else is `403`, so a caller
who found the function URL gets nothing); the gateway's own `/auth/*` routes; the declared routes
(`GATEWAY_ROUTES`, the same JSON as `apps.json`; a prefix matches the path itself or a path below
it, so `/govcon` never matches `/govcon-api`, the longest wins, `strip` removes it, `api` marks the
routes answered in JSON, `public` marks the routes the gate never asks a session of and that never
wake the task — each web app's `_next/static` prefix, which CloudFront caches without cookies, and
`/api/health`, which the deploy's verify step reads; no match is `404`); the session gate (a valid
`sd_id` ID token verified with `aws-jwt-verify` goes through; an expired one with `sd_refresh` is
refreshed in place through the `cognito-idp` API and the new cookie set on the answer; a refused
refresh clears both cookies; anything else is a `302` to `/auth/login?returnTo=<path>` for a page,
or `401 {"error":"unauthenticated","login":"/auth/login"}` on an api route); then plain HTTP to
`app.sysdesign.internal:<port>`, buffered, with a 5 s connect budget (`GATEWAY_CONNECT_TIMEOUT_MS`)
and a 110 s answer budget (`GATEWAY_UPSTREAM_TIMEOUT_MS`), both under the function's 150. The
session cookies and `host` never reach the upstream; `x-forwarded-for` and `x-forwarded-proto:
https` are added (`x-forwarded-host` is dropped: nothing reads it, and its value would be the
function URL's host); the answer's `set-cookie` headers become the function URL's cookie list, and a
body that is not text, JSON, JavaScript, CSS, SVG or XML — or that is content-encoded, as Next's
gzipped HTML is — travels as base64. An answer over 6 MB after that inflation (the function URL's
limit) is `502`, logged with its path and size. A connection failure (`ENOTFOUND`, `EAI_AGAIN`,
`ECONNREFUSED`, `ETIMEDOUT` before the socket connected, `ECONNRESET`) is the wake signal (see
Wake and sleep); any other unreachable code is `502`, and a timeout after the socket connected is
`504` — a slow derivation on a running task never shows the "starting" page. Any unexpected error
at a handler's boundary is logged with the path, the method and the error, and answered `500` JSON
with `Cache-Control: no-store`.

**Sign-in** is the gateway's own page, not Cognito's hosted UI (the hosted-UI domain is
CloudFront-backed and is not reliably reachable over IPv6, which is all a Lambda in this VPC has
to the outside; the `cognito-idp` API endpoint is). `GET /auth/login` renders an inline-styled
form — email, password, a hidden `returnTo` and a hidden `csrf` — and sets `sd_csrf` (random,
10 minutes). `POST /auth/login` requires the form's `csrf` to equal the cookie, calls `InitiateAuth`
with `USER_PASSWORD_AUTH` against the user pool (`GATEWAY_COGNITO_USER_POOL_ID`,
`GATEWAY_COGNITO_CLIENT_ID`; the region is the pool id's prefix, and the client pins
`https://cognito-idp.<region>.amazonaws.com` with dual-stack off, so the global
`AWS_USE_DUALSTACK_ENDPOINT` never points it at a host that may not exist), sets `sd_id` and
`sd_refresh`, clears `sd_csrf`, and answers `302` to the validated `returnTo` (a same-origin path,
never one under `/auth`). A refused password re-renders the form with a message and status `401`;
a `NEW_PASSWORD_REQUIRED` challenge renders a message naming
`aws cognito-idp admin-set-user-password --permanent` (setup step 9 sets the password permanent in
the first place). `GET /auth/logout` clears the cookies and sends you to `/auth/login` — only
for a same-origin request (`sec-fetch-site` `same-origin` or `none`); a cross-site fetch gets
`403`. The cookies are `HttpOnly; Secure; SameSite=Lax; Path=/`: `sd_id` and `sd_refresh` for 30
days (the verifier, not the browser, decides staleness), `sd_csrf` for 10 minutes. Every variable
the gateway reads is a row of `APP_GATEWAY_ENV` in `src/config.ts`, refused by name on the first
invocation when unusable; the package's README lists them.

**The job handler** (`main.job`) takes `{"launch":"<name>","args":[…]}` — from a schedule's
`Input`, or from `aws.sh session run <launch> [args…]` through `aws lambda invoke` — refuses a
launch that is not in `GATEWAY_JOB_LAUNCHES` or an argument that is not a short printable string
(at most 32 of them), refuses a launch whose `job/<launch>` task is still `RUNNING` (`ListTasks`
by the session family and `startedBy`: Lambda's retry of a start that did succeed, or an
operator's run beside the schedule's, never puts two sessions on one profile), sets the service's
desired count to 1 when it is 0 (a session calls the loop, notifications and the lanes directly,
so nothing else would wake them; the session's own `--wait-for-loop 8` then polls the loop's
`/health` for up to eight minutes before it binds), and calls `RunTask` on the session task family
(its latest revision) in the session security group with a public IP, `startedBy: job/<launch>`
(ECS allows no colon there), ECS Exec enabled and the container's command set to
`GATEWAY_JOB_COMMAND` with `{launch}` replaced plus the extra arguments. It answers
`{launch, taskArn}`; any failure is thrown, so the invocation fails visibly (the `job-errors`
alarm, a non-zero `aws lambda invoke`, and Lambda's own retry of a scheduled start, twice within
the hour). **The idle handler** asks ECS for the running tasks of the cluster that are not the
service's own before it asks the loop: any — a session, a migration — keeps the service, so an
app task is never stopped under a session that is applying to a job; one older than
`GATEWAY_IDLE_JOB_MAX_MINUTES` (240) is stopped, since ECS has no task deadline and a hung session
would otherwise keep both tasks running.

### Absent on purpose

- **A NAT gateway** ($33/month idle): the tasks get a public IPv4 only while they run, and the
  Lambdas reach the AWS APIs over IPv6 dual-stack endpoints. The fallback, if that egress fails on
  the first deploy, is private dual-stack subnets with an egress-only internet gateway, still $0,
  never a NAT.
- **A load balancer** ($16.43/month plus LCUs even when idle) and **API Gateway** (a hard 30 s
  integration timeout, under the rubric derivation's measured 8–61 s). The function URL has no
  30 s cap and costs nothing idle. An ALB stays the documented fallback.
- **Cognito's hosted UI**, its domain, the OAuth flows and callback URLs, and the SSM parameter
  that used to carry its settings: the gateway renders the sign-in page and calls the
  `cognito-idp` API, which the VPC Lambda reaches; the hosted-UI domain is not reliably reachable
  over IPv6.
- **Secrets Manager**: its rotation would change the password under a long-running task that reads
  its secrets once, at start. The secrets are SSM SecureStrings the owner creates (setup step 2),
  and the database reads a named version of its password (Troubleshooting).
- **A vector store of its own.** The memory tier is pgvector in the Aurora database — the same
  tables the adapters create on the laptop's compose database — so it is backed up with the rows
  it describes and needs no second store to host, pay for or restore; Qdrant, which its own docs
  keep off NFS, is gone from the repository (`PLAT-11`).
- **Google Chrome in the session image.** Chrome has no Linux arm64 build, so the cloud session
  runs the bundled Chromium (`BROWSER_CHANNEL=chromium`, the full Chromium user agent, not the
  headless shell's); the laptop keeps Chrome. A raw copy of the Mac profile is absent on purpose
  too: its cookies are encrypted with a key Linux cannot derive, which is why the signed-in state
  travels as Playwright's storage state and the Linux profile is built from it (Moving the laptop's
  data and lanes to the cloud).
- **The Google lanes** — `gmail`, `google-calendar` and the one-time `memory-ingest` — stay on the
  laptop: the Google consent and the ingest manifest live here, and nothing in the cloud needs
  them. `apps.json` names the two Nest apps in its `localOnly` list and CI still builds them
  (`image-matrix.js --with-local-only`), so the bare-checkout guard covers every app.
- **A client secret** for the Cognito client, **an origin access control** on the function URL
  (OAC would make the browser hash every POST body), **a custom domain** (the `*.cloudfront.net`
  name costs nothing and needs no zone; a later domain is ACM plus one CNAME), and **a 503 cache**.
- **A route from the edge to the lanes or to notifications**: nothing in the browser calls them;
  only the session task does, inside the VPC.
- **Container Insights, Performance Insights, EFS backups, a reader instance**: each a billed line
  this scale does not need.

| What                                                                                                                                                      | Where                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is deployed: images, ports, routes, the scheduled job and its launches                                                                               | `infra/aws/apps.json`; the image matrix both workflows build from, `infra/aws/bin/image-matrix.js`; the launch files, `packages/browser-session/launches/<name>.json`                                                                        |
| The stacks                                                                                                                                                | `infra/aws/{bootstrap,network,data,platform,app,edge}.yaml`, values in `infra/aws/params/prod/<stack>.json`                                                                                                                                  |
| The invariants every template must keep                                                                                                                   | `infra/aws/guard/sysdesign.guard` (cfn-guard), `tooling/aws-deploy.spec.ts` and `tooling/aws-deploy-jobs.spec.ts` (`CLOUD-1`…`CLOUD-5`)                                                                                                      |
| The one shell entry: lint, bootstrap, deploy-stack, migrate, wake, sleep, status, exec, verify, session run/list/stop/logs, files push/list/rm, db-import | `infra/aws/bin/aws.sh` (+ `lib.sh`), wrapped by the root `aws:*` scripts (`aws:session`, `aws:files`, `aws:db-import` among them)                                                                                                            |
| The images                                                                                                                                                | `docker/nest-app.Dockerfile` (`APP=<nest app>`, `--target migrate`), `docker/next-app.Dockerfile` (`APP`, `BASE_PATH`, `PUBLIC_VAR`, `PUBLIC_URL`), `docker/playwright-app.Dockerfile` (`APP=browser-session`; Debian, the bundled Chromium) |
| The edge, the idle check and the job function                                                                                                             | `packages/app-gateway`                                                                                                                                                                                                                       |
| Deploys                                                                                                                                                   | `.github/workflows/deploy-aws.yml`; the templates linted in `ci.yml`'s `infra` job                                                                                                                                                           |
| Deploy credentials, the deploy switch                                                                                                                     | GitHub: repository variable `AWS_DEPLOYS`; environment `production` with its variables and secret (setup step 6)                                                                                                                             |
| Secrets                                                                                                                                                   | SSM parameters under `/sysdesign/prod/` — created by the owner, except `idle-state`, which the app stack declares and the idle function owns                                                                                                 |
| The session's files between runs                                                                                                                          | The files bucket (`state/`, `profiles/`, `docs/`), through `pnpm aws:files`                                                                                                                                                                  |

## Local equivalents

The local flow does not change: `tilt up` still runs the Nest apps as pods built from the same
`docker/nest-app.Dockerfile` (now as the unprivileged `node` user, with the RDS CA bundle and the
system ripgrep in the image), the three web apps as `next dev` servers, and the compose database on
5433 — now built from `docker/postgres-pgvector.Dockerfile`, Alpine PostgreSQL 16 with pgvector
0.8.0 compiled in, the same major and extension version as Aurora. The browser session runs here
as it always did, on Chrome, from `pnpm browser-session run …` or a `--launch`. The RUNBOOK and
README cover that. What the cloud adds can be exercised here:

```bash
pnpm exec nx run app-gateway:test                      # the gateway, the idle check and the job handler: every seam faked
pnpm exec nx run app-gateway:build                     # packages/app-gateway/dist/main.js, what the app stack packages
pnpm test:tooling                                      # the repo gates, tooling/aws-deploy.spec.ts and aws-deploy-jobs.spec.ts among them
pnpm aws:lint                                          # cfn-lint over infra/aws/*.yaml, then cfn-guard when it is installed
node infra/aws/bin/image-matrix.js                     # the image matrix CI and the deploy build from (11 entries; 13 with --with-local-only)
docker build -f docker/nest-app.Dockerfile --build-arg APP=quality-loop -t sysdesign-quality-loop:local .
docker build -f docker/nest-app.Dockerfile --target migrate -t sysdesign-db-migrate:local .
docker build -f docker/playwright-app.Dockerfile --build-arg APP=browser-session -t sysdesign-browser-session:local .
docker run --rm sysdesign-browser-session:local --help  # the session CLI on Debian, the bundled Chromium installed
docker build -f docker/next-app.Dockerfile --build-arg APP=quality-loop-ui --build-arg BASE_PATH=/inspector \
  --build-arg PUBLIC_VAR=NEXT_PUBLIC_QUALITY_LOOP_URL --build-arg PUBLIC_URL=/loop -t sysdesign-quality-loop-ui:local .
docker run --rm -p 4299:4201 -e PORT=4201 sysdesign-quality-loop-ui:local   # then http://localhost:4299/inspector
pnpm exec nx run quality-loop-ui:start                 # next build, then the standalone server, as the image runs it
pnpm browser-session run --launch builtin --headless   # the launch file the cloud schedule runs, here on Chrome
```

`pnpm aws:lint` needs `cfn-lint` (`python -m pip install cfn-lint==1.46.0`, the version CI pins);
without `cfn-guard` on the PATH it runs the lint alone and says so — CI's `infra` job runs both,
with the cfn-guard 3.2.1 release binary checked by SHA-256, against
`infra/aws/guard/sysdesign.guard`. The Next `start` targets now run the standalone server a build
writes (`.next/standalone/packages/<app>/server.js`, with `.next/static` copied beside it), which
is what the image runs too. The images were built and run locally on 2026-11-11 (`notifications`,
`db-migrate` as the `node` user, `quality-loop-ui` under `/inspector`); none has run on Fargate
yet.

Every `aws.sh` command but `lint` needs `AWS_REGION` exported (it refuses by name otherwise) and
the AWS CLI's own credentials; `exec` also needs the Session Manager plugin the CLI uses for ECS
Exec; `verify` needs `curl`; `files push` and `db-import` run on your own credentials, not CI's (the
deploy role has no right to the files bucket on purpose; `db-import` also holds the gateway and the
job function at zero concurrency while it runs).

## One-time setup

In order; each step says why. Steps 1 to 7 happen before anything is deployed, step 8 is the first
deploy, steps 9 and 10 finish it, and step 11 is the reminder you will thank yourself for.

### 1. The account, the CLI and the region

An AWS account with the CLI (v2) signed in as an administrator, and `AWS_REGION=us-east-1`
exported in every shell that runs an `aws:*` script. The region is the design's: the
availability zones in `params/prod/network.json` are `us-east-1a,us-east-1b`. Also decide now the
**budget and alert addresses**: `BudgetEmail` goes to the bootstrap command (step 5) and
`AlertEmail` is an optional `aws.sh deploy-stack platform AlertEmail=…` override; neither is in a
file, so no address is committed.

### 2. The SSM parameters

CloudFormation cannot create a SecureString, so the secrets are created by hand, once, under
`/sysdesign/prod/`. The data stack reads the password through a dynamic reference, the tasks read
the rest by ARN when they start. Type each value where it is not echoed (`read -rs`), as the website
runbook does with its token, and never put one on a command line that lands in shell history.

```bash
# The database master password: generated, never typed. The data stack reads version 1 of it.
aws ssm put-parameter --name /sysdesign/prod/DB_PASSWORD --type SecureString \
  --value "$(openssl rand -hex 24)"

# The Claude Code subscription token (step 3 says where it comes from).
read -rs CLAUDE_TOKEN
aws ssm put-parameter --name /sysdesign/prod/CLAUDE_CODE_OAUTH_TOKEN --type SecureString \
  --value "$CLAUDE_TOKEN"
unset CLAUDE_TOKEN

# The OpenAI key the memory tier embeds with (the loop's lessons, the memory host's records); the
# same key as the laptop's .env. Read only while the app stack is deployed with DeployOpenAiKey=true.
read -rs OPENAI_KEY
aws ssm put-parameter --name /sysdesign/prod/OPENAI_API_KEY --type SecureString --value "$OPENAI_KEY"
unset OPENAI_KEY

# The two cloud Telegram bots (step 4): a token is a secret, a username and your chat id are not.
read -rs BOT_TOKEN
aws ssm put-parameter --name /sysdesign/prod/notifications/GOVCON_TELEGRAM_API_KEY --type SecureString \
  --value "$BOT_TOKEN"
unset BOT_TOKEN
aws ssm put-parameter --name /sysdesign/prod/notifications/GOVCON_TELEGRAM_BOT_ID --type String \
  --value '<bot username, without the @>'
read -rs BOT_TOKEN
aws ssm put-parameter --name /sysdesign/prod/notifications/JOBAPPLICATION_TELEGRAM_API_KEY --type SecureString \
  --value "$BOT_TOKEN"
unset BOT_TOKEN
aws ssm put-parameter --name /sysdesign/prod/notifications/JOBAPPLICATION_TELEGRAM_BOT_ID --type String \
  --value '<bot username, without the @>'
aws ssm put-parameter --name /sysdesign/prod/notifications/TELEGRAM_CHAT_ID --type String \
  --value '<your chat id>'

# The browser session's two personal values, kept out of the templates: whom the operator's answers
# are about (the laptop's BROWSER_SESSION_SUBJECT), and the memory tenant it reads and writes for
# (the laptop's MEMORY_TENANT — the same value, or the cloud recalls none of the taught answers).
aws ssm put-parameter --name /sysdesign/prod/browser-session/SUBJECT --type String --value '<the subject>'
aws ssm put-parameter --name /sysdesign/prod/browser-session/MEMORY_TENANT --type String --value '<the tenant>'

# Optional: govcon's SAM.gov key, read only when the app stack is deployed with DeploySamGovKey=true.
read -rs SAM_KEY
aws ssm put-parameter --name /sysdesign/prod/SAM_GOV_API_KEY --type SecureString --value "$SAM_KEY"
unset SAM_KEY
```

`/sysdesign/prod/idle-state` is the one parameter under the prefix you do not create: the app
stack declares it and the idle function owns its value. To replace a secret later, add
`--overwrite` to the same command; a running task keeps the values it started with, so follow it
with `pnpm aws:sleep && pnpm aws:wake` (see Wake and sleep) — except the database password, whose
rotation is a deploy (Troubleshooting, "Rotating the database password"). A session task reads
its values at every start. The task execution role may read only `/sysdesign/prod/*`, so a
parameter under any other path is invisible to it.

### 3. The subscription token

The quality loop reaches Claude only through the Claude Code subscription — the loop's boot check
accepts the first-party provider with a machine login or a `claude setup-token` token and refuses
everything else, and `ANTHROPIC_API_KEY` is withheld from every CLI process. A container has no
`claude login`, so it runs on the token:

```bash
claude setup-token   # prints a long-lived OAuth token (about a year); paste it into step 2
```

The same token kind runs the Tilt pods and the CI review job. Two things to know before relying on
it unattended: Anthropic's legal terms describe OAuth as for "ordinary use of Claude Code" and
point products built on the Agent SDK at API keys — a single user running their own unmodified
harness is the strongest case, and a server that sleeps when nobody uses it is the most defensible
shape, but an always-on deployment is a grey area the documents do not settle; and the
subscription's 5-hour and weekly limits apply to the cloud loop exactly as they do here, since it
is the same account — a nightly browser session, which judges every form through the loop, draws
on them too. Nothing on AWS makes model access cheaper: Bedrock and the Claude Platform on AWS
bill per token, and the loop's boot gate refuses them on purpose.

### 4. The two Telegram bots for the cloud

Telegram allows one poller per bot token. The cloud `notifications` container runs
`config/channels/telegram-cloud.json` (`NOTIFICATIONS_CHANNELS=telegram-cloud`): two instances,
`telegram.govcon` (govcon's prompts and digests; `GOVCON_TELEGRAM_API_KEY`, `GOVCON_TELEGRAM_BOT_ID`)
and `telegram.job-application` (the browser session's questions and answers;
`JOBAPPLICATION_TELEGRAM_API_KEY`, `JOBAPPLICATION_TELEGRAM_BOT_ID`), both on `TELEGRAM_CHAT_ID`.
The variable names are the laptop's; the values in SSM must be bots this machine stops polling:

- **govcon**: either a bot of its own, created with BotFather, while the laptop's govcon lane keeps
  running here on the bot it has — or, when govcon moves to the cloud for good, the laptop's bot
  with its token, exactly as the job-application bot below: its instance then leaves the laptop's
  `config/channels/telegram.json` at cutover, or the two services fight over the token (the setup
  of 2026-11-13 took this path).
- **job-application**: the bot the laptop's sessions have been using moves to the cloud with its
  token (the answers you taught it are in the database, not in the bot, so a new bot would do as
  well; the same bot keeps the chat history in one place). Once its token is in SSM, the instance
  comes out of the laptop's `config/channels/telegram.json` (Moving the laptop's data and lanes to
  the cloud), or the two services fight over it.

After the first deploy send each bot `/start`: until its chat is named it answers `/start` with your
chat id and delivers nothing (the RUNBOOK's pairing steps). A private chat's id is your own Telegram
id, so `TELEGRAM_CHAT_ID` is the value already in `.env`. A token two services poll makes them take
turns at 409 conflicts (see Troubleshooting).

### 5. The bootstrap stack

Deployed from your terminal as the account administrator — it is the stack that creates the role
CI deploys with, so CI cannot deploy it. The GitHub ids pin the OIDC trust to this repository, not
only its name: `params/prod/bootstrap.json` carries owner `oegonzal` (id `6849844`) and repository
`system-design` (id `1357821224`); read them again if the repository ever moves:

```bash
gh api users/oegonzal --jq .id                     # 6849844
gh api repos/oegonzal/system-design --jq .id       # 1357821224
pnpm aws:bootstrap BudgetEmail=<address>           # deploys sysdesign-prod-bootstrap with CAPABILITY_NAMED_IAM
aws cloudformation list-exports --query "Exports[?Name=='sysdesign-prod-GitHubDeployRoleArn'].Value" --output text
```

`aws.sh bootstrap` merges the params file with your `Key=Value` overrides (`BudgetEmail` is
required and has no default; `MonthlyBudgetUsd=…` changes the $15 budget), runs
`aws cloudformation deploy --no-fail-on-empty-changeset`, and asserts the stack ended `*_COMPLETE`.
Copy the deploy role ARN it exports for step 6. Repeat the command to change the budget or the
trust — and after a change to the stack itself: the eleven repositories and the execution role's
S3 and KMS rights are what the browser session's images, bucket and key need, so an account
bootstrapped before 2026-11-12 runs it again before the next deploy. The bucket and the ECR
repositories are retained even if the stack is deleted.

### 6. GitHub: the environment, the variables, the secret

1. Settings › Environments › New environment named `production`, with Deployment branches and
   tags set to Selected branches and tags and the one rule `main`. Create it before the workflow
   first runs on `main`: a run that names a missing environment creates it with no rules. The
   branch rule is the control a workflow edited on another branch cannot get around, and the OIDC
   `sub` the bootstrap role trusts carries `environment:production`, so only a job of this
   environment on `main` can assume the role at all.
2. The environment's variables and secret, which only jobs that reference the environment (`images`
   and `deploy`) receive:

   ```bash
   gh variable set AWS_DEPLOY_ROLE_ARN --env production --body '<the ARN from step 5>'
   gh variable set AWS_REGION --env production --body us-east-1
   gh secret set AWS_ORIGIN_SECRET --env production --body "$(openssl rand -hex 32)"
   ```

   `AWS_ORIGIN_SECRET` is the value CloudFront sends in `x-origin-verify` and the gateway
   requires; the deploy passes it to the app and edge stacks (`OriginSecret`, `NoEcho`, at least 32
   characters). Rotating it is setting a new secret and dispatching a deploy. The account id is
   not a variable: every ARN the workflow needs is an export or the role's own.

3. The switch, as a **repository** variable — the `resolve` job reads it, references no
   environment (so an environment variable would never reach it), and every other job depends on
   `resolve`:

   ```bash
   gh variable set AWS_DEPLOYS --body on    # off is the pause switch (see Rollback)
   ```

   Until it is `on`, every run skips cleanly at `resolve`. A flip takes effect on the **next** run:
   a run that passed `resolve` while the switch was on finishes its deploy (cancel it to stop it).

### 7. Confirm the OIDC subject once (optional)

The bootstrap role trusts both subject forms GitHub issues — the classic
`repo:<owner>/<repo>:environment:production` and the immutable
`repo:<owner>@<owner id>/<repo>@<repo id>:environment:production` — so the first deploy does not
depend on which one the token carries. To see it anyway (GitHub documents the immutable form for
branches; that an environment claim takes the same shape is inferred), a throwaway workflow on
`main` prints its own token's `sub` (not a secret) and is deleted afterwards:

```yaml
name: Print the OIDC subject
on: workflow_dispatch
permissions: {}
jobs:
  subject:
    runs-on: ubuntu-24.04
    environment: production
    permissions:
      id-token: write
    steps:
      - run: |
          token="$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
            "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" | jq -r .value)"
          python3 -c 'import sys, json, base64; part = sys.argv[1].split(".")[1]; print(json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))["sub"])' "$token"
```

If the printed subject matches neither form, change the `sub` list in `bootstrap.yaml` and run
`pnpm aws:bootstrap` again; nothing else depends on it.

### 8. The first deploy

The first deploy creates the network, data and platform stacks, runs the migration, then creates
the app and edge stacks, in that order, and takes 15 to 20 minutes, Aurora's creation dominating
(an estimate from the vendor's figures, not yet measured). `main` must already contain the
workflow — Run workflow needs the file on the default branch — and CI must be green on its tip.
Dispatch it:

```bash
pnpm aws:deploy                    # gh workflow run deploy-aws.yml --ref main
gh run watch                       # or Actions › Deploy AWS in the browser
```

The run's summary prints the image tag, the tag that served before (none the first time), the site
URL and the exact rollback command. The last step, `verify`, wakes the service and polls
`/api/health` through the edge; read Troubleshooting's first two entries before you trust its
verdict on a first deploy. Then run `pnpm aws:status`: the service should show one task running
(ECS starts one at creation) and the database `available`. The two schedules exist and are
`DISABLED`; nothing runs a browser session until you do (step 10).

### 9. The one user

The user pool allows no self sign-up; the owner is created by hand, with a permanent password so
the first sign-in is not a forced change (the gateway's page cannot complete one: it answers a
`NEW_PASSWORD_REQUIRED` challenge by naming this command). The pool's policy wants at least 12
characters with upper and lower case, a digit and a symbol.

```bash
pool="$(aws cloudformation list-exports --query "Exports[?Name=='sysdesign-prod-UserPoolId'].Value" --output text)"
aws cognito-idp admin-create-user --user-pool-id "$pool" --username '<your email>' \
  --user-attributes Name=email,Value='<your email>' Name=email_verified,Value=true \
  --message-action SUPPRESS
read -rs PASSWORD
aws cognito-idp admin-set-user-password --user-pool-id "$pool" --username '<your email>' \
  --password "$PASSWORD" --permanent
unset PASSWORD
```

(The flags are the CLI reference's; the commands have not been run against this pool yet.) Open the
site URL: `/` answers a `302` to `/auth/login?returnTo=/`, the gateway's sign-in page; a correct
email and password set the cookies and send you to the dashboard — or to the "starting" page first,
if the task is asleep. `/inspector` and `/govcon` are behind the same session.

### 10. Move the laptop's data and lanes

The migrate task creates every table and runs the seed (reference data); your prompts, sessions,
stories, runs, applications and taught answers are not carried over unless you copy them, and the
browser session cannot sign in to anything until its state is. The next section is that checklist,
in order; do it once, right after the first deploy, before the cloud is used in earnest — the
import replaces every table's rows with the laptop's.

### 11. The yearly reminder

The setup token lasts about a year. Put a calendar reminder eleven months out with the three
commands that renew it: `claude setup-token`, the `put-parameter --overwrite` from step 2, then
`pnpm aws:sleep && pnpm aws:wake` so the next task reads the new value. What an expired token
does to the running loop is not verified live: the loop's boot check proves a credential is present
and is the subscription's, not that it is still valid, so expiry may show as every grade failing
(the recorded exchange carries the CLI's reason, for example `authentication_failed`) rather than
as a container that will not start — either way nothing grades until the token is renewed, and
`/health` does not re-check it (see Troubleshooting).

## Moving the laptop's data and lanes to the cloud

One ordered pass, done once, on the laptop, with `AWS_REGION` exported. Each step says what would
go wrong without it. None of it has been run against an account yet (2026-11-12); the commands are
the scripts' and the vendor's.

1. **Stop the laptop lanes.** End the running browser sessions (the `linkedin` and `builtin`
   supervisors), then stop `job-application`, `agentic-system` and `notifications` here (Tilt, or
   their `serve` tasks). Every application recorded or answer taught after the dump below is lost
   to the cloud, and a laptop session that keeps running would apply to companies the cloud never
   sees. The loop moves too — its runs, prompts, `memory_support` and its pgvector table are in the
   dump — so stop it, or keep it idle, until step 4 has run: a loop run after the dump is lost to
   the cloud. `gmail` and `google-calendar` may keep running; they are not moving.
2. **Bring the laptop's database to the cloud's shape.** First make sure the old Qdrant container
   still runs — compose no longer starts it, and the import reads from it:
   `docker ps --filter name=sysdesign-vectors`; if it is gone,
   `docker run --rm -d --name sysdesign-vectors -p 127.0.0.1:6333:6333 -v system-design-prep_sysdesign-qdrant:/qdrant/storage qdrant/qdrant:v1.19.1`
   (the retained volume). Then
   `pnpm stack:db && pnpm db:migrate && pnpm memory:import-qdrant --collection quality-memory__v2__text-embedding-3-small__1536`
   (the command refuses a table that already holds chunks unless `--force` is given — the import
   is for a store the loop has not written to since the move — and `--dry-run` makes no table):
   the database alone (`stack:db` builds the pgvector image once, on the same volume; `stack:up`
   would start the loop in the foreground and never return), the migration that creates the
   `vector` extension, then the loop's memory collection (1,455 points and the only copy of 920
   document-digest chunks on 2026-11-11) into its pgvector table, point ids kept; it prints
   `scanned / imported / refused`, and a refusal names the first point.
   The memory host's collection is not imported: its truth is the `memory_record` table, and the
   host's sweep re-embeds every active row into the new generation (about 13 embedding calls for
   the 1,250 rows of 2026-11-11), which is why `OPENAI_API_KEY` must be in SSM first.
3. **Dump the whole database.** `docker exec sysdesign-db pg_dump -Fc -U admin sysdesign > cutover.dump`.
   The whole database, not a table list: sequences, the bus cursors, the vectors and
   `projected_into` travel consistently, and the bus cursor never points past events the cloud
   never saw.
4. **Import it.** Close every tab of the site first: the gateway and the job function are held at
   zero concurrency for the length of the import, so a tab's reload (or a schedule) cannot wake
   the app task into a half-restored database — and the command refuses to start while a session
   task runs. `pnpm aws:db-import cutover.dump` then, in the code's order: uploads the dump to the
   artifacts bucket under `imports/`, sleeps the service and waits until neither the service nor
   the session family has a task (an app task holding connections would fight the restore), runs
   the migrate task definition with a command override —
   `node -r @swc-node/register packages/db/scripts/import-dump.ts imports/cutover.dump`, which
   downloads the object, writes `pg_restore -l` to a list, drops the `COMMENT - EXTENSION` entries
   (only an extension's owner may comment on it, and the master user owns none) and the
   `EXTENSION` entry itself (the migration created it; `--clean` would drop and re-create it), and
   runs `pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction -L <list>`
   as that user, so a restore that fails anywhere leaves the database as it was — waits, prints
   the exit code and the log tail from `/sysdesign/prod/migrate`, and wakes the service only on
   success: a failed restore leaves it asleep, with the log to read, and `pnpm aws:wake` wakes it
   once the cause is fixed. `--clean` replaces every table's rows with the laptop's, so anything
   created in the cloud before this (a test prompt, a cloud run) is gone; that is the point of
   doing it first. The memory host then finds `projected_into` naming the laptop's generation and
   re-embeds (step 2). Afterwards `rm cutover.dump`: the file holds every application, memory and
   bus row, `*.dump` is ignored by git, and the bucket expires its copy after a day.
5. **Export the signed-in state**, one file per profile, here where the sign-ins live:

   ```bash
   pnpm browser-session export-state --profile linkedin --out linkedin-state.json
   pnpm browser-session export-state --profile builtin --out builtin-state.json
   ```

   Each opens the profile headless, writes Playwright's storage state (cookies, including the
   httpOnly ones, local storage, IndexedDB) with mode 0600, and prints the cookie count and the
   push command. It refuses while a live session holds the profile (step 1). The Mac profile itself
   is not copied: its cookies are encrypted with a key Linux cannot derive.

6. **Push the state and the résumé** to the files bucket, then delete the local state files:

   ```bash
   pnpm aws:files push linkedin-state.json state/linkedin.json
   pnpm aws:files push builtin-state.json state/builtin.json
   pnpm aws:files push docs/ingestion/Resume_2026_c.pdf docs/Resume_2026_c.pdf
   rm linkedin-state.json builtin-state.json
   pnpm aws:files list                       # state/linkedin.json, state/builtin.json, docs/Resume_2026_c.pdf
   ```

   Keys must start with `profiles/`, `state/` or `docs/`; the bucket default encrypts every object
   with the files key, so `push` names no key. The document's file name is what the launch file
   names (`launches/builtin.json`: `"resume": "Resume_2026_c.pdf"`), restored at every start into
   `/app/static/docs`.

7. **Run the first session by hand**, the Built In one first (no checkpoint on a new device, in
   the laptop's experience):

   ```bash
   pnpm aws:session run builtin              # invokes the job function; prints the task id and the log command
   pnpm aws:session list                     # running session tasks, with their startedBy and start time
   pnpm aws:session logs <task id>           # tails /sysdesign/prod/session, stream browser-session/browser-session/<id>
   ```

   What to look for in the log: the service waking (the first run), `--wait-for-loop` binding to
   the loop inside its eight minutes, the state seed (`state/builtin.json` applied to a fresh
   profile) and the first page signed in, the units closing, and at the end the archive upload
   (`pnpm aws:files list profiles/` shows `profiles/builtin.tar.gz`). The next run restores the
   archive and skips the seed. Then `pnpm aws:session run linkedin`; if LinkedIn shows a checkpoint
   on the new device, see Troubleshooting. A session's dumps are on EFS under
   `/app/static/browser-session/sessions`; the row is in `browser_session`, readable from the
   inspector's database through ECS Exec.

8. **Flip the schedules.** The flip is a change of `infra/aws/params/prod/app.json` —
   `JobSchedulesState` to `ENABLED` — landed through `pnpm aws:deploy` (push it; the deploy
   applies it). The hand alternative, from a checkout at the serving commit with
   `pnpm exec nx run app-gateway:build` done first (`deploy-stack app` packages the local
   `packages/app-gateway/dist` and the local `app.yaml`, so any other checkout would ship gateway
   code nothing tested):
   `bash infra/aws/bin/aws.sh deploy-stack app "ImageTag=<serving tag>" JobSchedulesState=ENABLED`.
   Never put `OriginSecret` on the command line: its value is a GitHub secret that is never shown
   again, and a different value would make the gateway refuse every request CloudFront sends until
   the edge stack is redeployed; `aws cloudformation deploy` keeps the previous value of every
   parameter it is not given, `OriginSecret` included, so the hand command names only the two it
   changes. From then on the linkedin launch starts at 00:05Z and the builtin one at 01:05Z, every
   day, waking the app task first. The params file is what the next CI deploy applies, so a hand
   flip without the file change is undone by the next push.
9. **Take the job-application instance out of the laptop's channels file**
   (`packages/notifications/config/channels/telegram.json`, the `telegram.job-application` entry)
   before the laptop's notifications runs again: its bot now belongs to the cloud, and two pollers
   on one token take turns at 409. The same goes for `telegram.govcon` once govcon runs only in the
   cloud. The laptop's `static/memory-ingest/manifest.json` stays valid — the space id and the
   tenant are copied unchanged.

After the pass, the laptop's browser session is the fallback, not the routine: a run here writes
the laptop's database — applications the cloud's advisor never sees — and the cloud database
admits only the VPC's own security groups, so a laptop session cannot be pointed at it.

## How a deploy works

`.github/workflows/deploy-aws.yml` runs when the `CI` workflow completes on `main` — only a run CI
made for a push, and only when it succeeded, so only a tested commit deploys; the `event == 'push'`
guard is what keeps a fork's branch named `main` out, since its CI run is a pull request's — and on
Run workflow (`workflow_dispatch`), with an optional `image_tag` for a rollback. The `resolve` job
alone reads the repository variable `AWS_DEPLOYS`; every other job needs `resolve`, so a run skips
whole or deploys whole, and a flip of the switch takes effect on the next run. Concurrency group
`deploy-aws-main`, no cancel in progress: a running deploy always finishes, a newer pending run
replaces an older one, and a rollback dispatched while a deploy runs waits for it. The hardening is
`deploy-website.yml`'s: every action pinned to a commit SHA with its version in a comment (node24
builds; the node20 majors left the runners on 2026-09-23), `permissions: {}` at the top and
`contents: read` per job, `id-token: write` only on the two jobs that assume the AWS role,
`persist-credentials: false`, no `${{ }}` of untrusted input inside `run:` (everything travels
through `env`), explicit timeouts.

1. **`resolve`** (no credentials) refuses a re-run whose commit is no longer `main`'s tip — a re-run
   keeps its original commit, and would deploy older code; a rollback names an older commit on
   purpose and is exempt — then names the commit to deploy: the CI run's `head_sha`, or the
   `image_tag` of a dispatch, which must be a full 40-hex commit SHA (the app stack would accept 7
   to 40; the workflow is stricter, so a short SHA is refused before any stack is touched). It checks
   that commit out and derives the image matrix with `node infra/aws/bin/image-matrix.js`, the one
   derivation from `infra/aws/apps.json` that CI's `image-matrix` job runs too: for each image, the
   Dockerfile, its target (`migrate` for `db-migrate`) and its build arguments (`APP`, and for a Next
   image `BASE_PATH`, `PUBLIC_VAR`, `PUBLIC_URL`; `APP` on the Playwright Dockerfile for
   `browser-session`). The `images` job therefore knows no image by name, which `CLOUD-1` asserts,
   and the script's output is held to the spec's own derivation.
2. **`gateway`** (no credentials) installs with `pnpm install --frozen-lockfile`, runs
   `nx run app-gateway:build` and uploads `packages/app-gateway/dist` as the `app-gateway-dist`
   artifact — built where no credential is, like the website's build job, so the job that holds the
   AWS role runs no `pnpm install`. The one bundle carries the three handlers.
3. **`images`** (`ubuntu-24.04-arm`, the `production` environment, one job per matrix entry — eleven,
   skipped whole on a rollback) repeats the superseded-re-run guard against the commit `resolve`
   named (a re-run of this job alone keeps it, and `main` may have moved), assumes the deploy role,
   logs in to ECR and asks `aws ecr describe-images` whether `sysdesign/<image>:<sha>` already
   exists. Only `ImageNotFoundException` means "build": tags are immutable and name the commit, so
   an image pushed for this commit by an earlier run is the image, and any other answer from ECR is
   an error, never "absent". A missing tag is built with buildx for `linux/arm64` only (native on the
   ARM runner), `provenance: false`, a GitHub Actions cache scoped per image, and pushed as
   `<registry>/sysdesign/<image>:<sha>`. The `browser-session` image is the slow one: Debian plus
   `playwright install --with-deps chromium`.
4. **`deploy`** (`production`, URL = the edge stack's `SiteUrl`) runs after `images` succeeded or
   was skipped. It repeats the superseded-re-run guard; fails at once, with an actionable error, if
   `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION` or `AWS_ORIGIN_SECRET` is empty; downloads the gateway
   artifact into `packages/app-gateway/dist`; assumes the role; confirms ECR holds **every** image
   of `apps.json` at the tag — `ImageNotFoundException` is "missing" (a rollback to a tag the
   lifecycle policy has expired fails here, not in the service's circuit breaker), and any other
   answer from ECR stops the run as unreadable; reads the `ImageTag` the app stack carried before
   this run (a missing stack means none, the first time; any other failure stops the run so a
   rollback target is never unknown by accident); then, through `infra/aws/bin/aws.sh`:
   - `deploy-stack network`, `deploy-stack data`, `deploy-stack platform ImageTag=<sha>` (each
     `aws cloudformation deploy` with the execution role, `--no-fail-on-empty-changeset`, the tags,
     then an assertion that the stack ended `*_COMPLETE` and not in any `ROLLBACK` state; `data`
     also re-enables termination protection; `platform` registers the migrate and session task
     definitions at the new tag);
   - `migrate`: `run-task` on `MigrateTaskDefinitionArn` in the platform's cluster, in the public
     subnets with the app security group and a public IP, `wait tasks-stopped` (re-waited up to
     three times, since the CLI's wait gives up after about ten minutes), the container's exit code
     must be 0, and the task's log tail from `/sysdesign/prod/migrate` is printed either way. The
     image runs `mikro-orm migration:up` then the seed, the same commands as
     `pnpm db:migrate && pnpm db:seed` — **before** the service rolls, so the new revision never
     starts on a schema older than its code;
   - `deploy-stack app ImageTag=<sha> OriginSecret=<secret>` — `aws cloudformation package` first
     uploads the gateway bundle to the artifacts bucket under `cfn/<tag>/` and rewrites the
     template's `Code` paths; the deploy registers a new task definition revision and points the
     job function at the platform's new session revision; then the script waits for the service's
     PRIMARY deployment: while the task definition carries the new tag, it polls until
     `rolloutState` is `COMPLETED`, fails on `FAILED` (the circuit breaker is rolling back), and
     accepts a service at desired count 0 with the new revision registered — a deploy while asleep
     starts no task;
   - `deploy-stack edge OriginSecret=<secret>`, which reads the gateway URL export;
   - `verify <SiteUrl>`: sets the service's desired count to 1 first (so the check never depends on
     the wake path), then `GET /` must be a `302` (to the sign-in page), then `GET /api/health` — a
     public route, so no session is needed — is polled every 10 s for up to 6 minutes, `503` read
     as "starting" and `200` as done; every request gives up after 15 s.
5. **`summary`** always runs and writes the outcome, the tag, the gateway and image job results,
   the tag serving before, the site URL and the exact rollback command to the run's summary.

**What gates what.** Nothing deploys that CI did not pass (lint, typecheck, every spec, the e2e, the
thirteen image builds, the template lint and guard rules). The two credentialed jobs wait for the
`production` environment's rules — `main` only, and a reviewer if you add one (with Prevent
self-review off, or a solo owner waits forever) — before they receive the role ARN, and the
bootstrap role's trust refuses any token not from that environment. The stacks deploy in dependency
order and each must complete before the next starts; the migration runs between `platform` and
`app`; the service's circuit breaker rolls a failing revision back and the deploy fails on it.
`verify` checks the live site and rolls nothing back. A deploy during a browser session rolls the
app task under it (the session's calls fail until the new task answers; the session's own rails
end it), so deploy when no session runs — the schedules say when that is.

**Secrets in the run.** `AWS_ORIGIN_SECRET` reaches `aws.sh` as a `Key=Value` argument from the
step's `env`; it is masked in the log, but it is on the script's command line, so it is visible to
`ps` on the runner for the seconds the step runs. The image jobs each create a GitHub deployment
record (they reference the environment for ECR login), so one deploy shows twelve records.

**Change detection.** There is none: every successful CI run on a `main` push deploys, a docs-only
push included. The cost of a redundant deploy is a few minutes and no new image (the tag check
skips every build), and the stacks see no change (`--no-fail-on-empty-changeset`). A push whose
message carries `[skip ci]` starts no CI run and so no deploy; dispatch if it should.

## Rollback

An image tag is a commit, immutable in ECR, and a dispatch with that tag redeploys **that commit's**
templates, parameter files, gateway bundle and images — not `main`'s. Pause first.

1. **Pause.** `gh variable set AWS_DEPLOYS --body off`. The switch is read by `resolve` alone, at
   the start of a run, so it stops the **next** run, never one already past `resolve`: cancel any
   run in flight yourself (`gh run list --workflow deploy-aws.yml`, then `gh run cancel <run-id>`).
   Until the revert lands, any CI success on `main` would deploy its tip, the bad commit, and undo
   the rollback.
2. **Find the tag.** The failed run's summary names the tag serving before it. Otherwise:

   ```bash
   aws cloudformation describe-stacks --stack-name sysdesign-prod-app \
     --query "Stacks[0].Parameters[?ParameterKey=='ImageTag'].ParameterValue" --output text   # serving now
   aws ecr describe-images --repository-name sysdesign/quality-loop \
     --query 'sort_by(imageDetails,&imagePushedAt)[].imageTags[0]' --output text              # what is still kept
   ```

   The lifecycle keeps the last three tagged images per repository, so only those commits can be
   deployed again; the deploy job checks every repository and refuses a tag any of them has dropped.

3. **Roll back** with `AWS_DEPLOYS` set to `on` for the dispatch — `resolve` reads it once, at the
   start, so the switch can go back to `off` as soon as the run has started:

   ```bash
   gh variable set AWS_DEPLOYS --body on
   gh workflow run deploy-aws.yml --ref main -f image_tag=<full 40-character commit SHA>
   gh variable set AWS_DEPLOYS --body off   # once the run has started, if the pause should hold
   ```

   The images job is skipped, the stacks deploy from that commit, the migrate task runs that
   commit's image, and the service rolls to the task definition carrying that tag.

4. **Migrations are forward-only.** Nothing here reverts a migration: a rollback runs older code
   against the newer schema. That is safe when the newer migrations only added things, and not
   otherwise; how MikroORM's `migration:up` treats rows in the migrations table that the older
   image has no file for is not verified here. Check the migrations between the two commits before
   rolling back across one, and prefer a forward fix when they are not additive.
5. **Revert** the bad commit on `main`, then **resume**: `AWS_DEPLOYS` back to `on`; the revert's CI
   run deploys it.

A stack change that CloudFormation itself rolled back (a bad template, a failed resource) needs no
rollback of yours: the stack is back at its previous state, `aws.sh` failed on the `ROLLBACK`
status, and the stack events say why (`aws cloudformation describe-stack-events --stack-name
sysdesign-prod-app --max-items 20`).

## Validating production

```bash
pnpm aws:status                                        # the service (desired/running/pending, deployments), its tasks, the cluster's status and ACU over the last 10 minutes
site="$(aws cloudformation describe-stacks --stack-name sysdesign-prod-edge --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text)"
curl -sSI "$site"                                      # 302, location: /auth/login?returnTo=%2F — the gateway's own sign-in page
curl -sS "$site/api/health"                            # 200 from studio-api, or the 503 "starting" JSON while the task wakes: a public route, no session asked
curl -sSI "$site/_next/static/nope.js"                 # 404 from the web app, never a 302: a public route, so the gate lets the cached assets through (see Troubleshooting)
curl -sS -o /dev/null -w '%{http_code}\n' "$site/auth/login"   # 200, the sign-in form
curl -sS "$site/loop/runs"                             # 401 {"error":"unauthenticated","login":"/auth/login"}: an api route without a session
aws logs tail /sysdesign/prod/gateway --since 10m      # one JSON line per decision: wake, sign-in, upstream failures
aws logs tail /sysdesign/prod/app --since 10m --follow # every container, streams <container>/<container>/<task id>
aws ssm get-parameter --name /sysdesign/prod/idle-state --query Parameter.Value --output text   # `none`, or when the idle function last saw the gateway quiet
pnpm aws:session list                                  # the session tasks running now, with startedBy (job/<launch>) and their start time
aws logs tail /sysdesign/prod/job --since 1d           # each launch the job function was asked for, and what it ran or refused
```

Then in a browser, signed in as the user from setup step 9:

- **The starting page.** With the task asleep, the first request after sign-in answers the 503
  page ("Starting the studio"), which refreshes itself every 5 s; it should become the dashboard
  within about two minutes (ECS pulls the nine images and waits for the health checks' start
  period; an estimate, to be measured on the first deploy). `pnpm aws:status` meanwhile shows
  desired 1, running 0, then 1.
- **A real grade.** Pick a prompt, sketch, submit: the feedback tab polls the run and shows the
  model calls as they are attributed, minutes per submission as locally. This is the check that the
  token in SSM is the subscription's and that the CLI runs on Alpine as `node` (ripgrep from the
  system, a writable `/home/node`). Then `/inspector` — the run's dump is on EFS, so it is there
  after the task has slept and woken again. A coaching run after the import lists recalled lessons
  in its panel: the memory tier is reading its pgvector table.
- **A session by hand.** `pnpm aws:session run builtin`, then its log (the section above says what
  to look for); afterwards `pnpm aws:files list profiles/` shows the archive and `pnpm aws:status`
  shows the app task still up — the idle function counted the session. A question the session
  asks arrives on the phone from the job-application bot and an answer gets back to it, which is
  the check that the cloud `notifications` carries `browser-session` prompts.
- **Sleep.** Twenty to twenty-five minutes after the last request and the last session, `pnpm
aws:status` should show desired 0, running 0 (the idle function needs two quiet observations
  five minutes apart, after the 15 idle minutes, and CloudWatch's metric arrives minutes late),
  and about five minutes later the capacity column at 0 ACU. The state parameter above shows the
  first quiet observation while the second is pending. A run or a session in flight keeps the
  task up (see Wake and sleep).
- **The next deploy while asleep.** Push a change: the deploy registers the new revision with the
  service at 0, and the next wake runs it — `pnpm aws:status` shows the PRIMARY deployment's task
  definition.
- **A bad image on purpose**, once: the circuit breaker should roll the service back and the deploy
  job fail on `rolloutState FAILED`.
- **ECS Exec:** `pnpm aws:exec` opens `/bin/sh` in the `quality-loop` container of the running task
  (`pnpm aws:exec studio-api` another container; `ps` during a grade shows the Claude CLI
  subprocesses and their memory, which is how `TaskMemory` gets right-sized). It is a terminal, not
  a file channel: to copy a dump out, `tar -C /app/static/runs -czf - <run id> | base64` inside the
  session, paste the output into `base64 -d | tar -xzf -` here — workable for a run or two, and
  unverified. A session's dumps are reached from a running session task, which `pnpm aws:exec`
  cannot open (it targets the service's task): the raw
  `aws ecs execute-command --cluster sysdesign-prod-platform --task <id> --container browser-session --interactive --command /bin/sh`,
  the id from `pnpm aws:session list`, the dumps under `/app/static/browser-session`. More than
  that wants an `s3:PutObject` statement on the task role and `aws s3 cp` from inside the
  container, neither declared today.

Measure on the first deploys and write the numbers here: the wake time, the memory of a grade's
CLI subprocesses (then shrink `TaskMemory`), whether Aurora resumes at 0.5 ACU or higher, the
memory and CPU of a session task (ECS Exec and `ps` inside it, then shrink or grow the session
task definition), and how long a session's restore and archive take against the files bucket.

## Wake and sleep

**Waking.** The service sits at desired count 0 and the Cloud Map record has no address. The first
request that passed the session gate fails to connect (`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`,
`ETIMEDOUT` within the 5 s connect budget, `ECONNRESET`), and the gateway: opens and at once
closes one TCP connection to the database endpoint (`GATEWAY_DB_HOST:GATEWAY_DB_PORT`,
fire-and-forget), so a paused cluster starts resuming while the task starts; asks ECS for the
service's desired count and sets it to 1 when it is 0 (already 1 means already waking; a failure
to ask is logged and changes nothing); and answers `503` with `Retry-After: 10` and
`Cache-Control: no-store` — the HTML page with a 5 s meta refresh, or
`{"status":"starting","retryAfterSeconds":10}` on an api route or for a caller whose `Accept`
does not name `text/html`. A public route never wakes: the static assets and `/api/health` answer
the same 503 without touching the service, so an unauthenticated poll cannot start the task. The
sign-in page itself needs no task. CloudFront caches the 503 for 0 s. From there ECS pulls the
images, starts the containers, and the health checks' 90 s start period covers the loop's account
check; Aurora's resume is about 15 s after a short pause and longer after a day (the vendor's
figures), and a connection attempt waits for it. The wake takes one to two and a half minutes by
the plan's estimate; measure it.

**A session wakes it too.** The job function sets the desired count to 1 when it is 0 before it
runs the session task, and the session's `--wait-for-loop 8` polls the loop's `/health` every 5 s
for up to eight minutes before it binds, which covers the wake and Aurora's resume with room; past
that the session refuses to start, by name, and the task ends. A session calls the loop,
notifications and the lanes by the Cloud Map name inside the VPC, so it never shows as a gateway
invocation.

**Sleeping.** Every 5 minutes (`IdleConfirmMinutes`) the idle function reads the gateway
function's `Invocations` sum over the last `IdleMinutes` (15). Any invocation at all — a page poll,
an API call — means busy: it clears `/sysdesign/prod/idle-state` and returns `active`. At zero,
with the service wanting a task, it needs **two quiet observations** before it acts, because
CloudWatch delivers the metric minutes late and one empty read may only mean the data is not there
yet: the first run writes the time into the state parameter and returns `quiet-once`; a later run
that finds the stamp at least one schedule interval old first lists the cluster's running tasks
that are not the service's own — a browser session (or a migration) in flight is `busy`, the count
in the summary, and the service stays; then asks the loop `GET /runs?status=running&limit=1` with
a 5 s timeout, and only a `200` whose `meta.total` is 0 sets the desired count to 0, clears the
state and returns `stopped`. A cluster that cannot be listed, a loop that cannot be asked, or any
run or session in progress, keeps the task: a wrong stop loses a run or a session mid-form, a
wrong keep costs five more minutes. The loop container has 120 s to shut down, its Nest hooks
closing the pools. With no process connected, Aurora pauses `SecondsUntilAutoPause` (300) later —
and only then: while any backend runs, its timers (the loop's heartbeat and janitor, the
notifications dispatcher's long polls, govcon's jobs, the memory host's sweep) keep connections
open, which is why the database can never pause with the task up.

**What never stops a running run or session:** the idle function, because of the two checks; a
deploy while a run is in flight will — `MinimumHealthyPercent 0` stops the old task to start the
new one, and the loop's janitor marks the interrupted run after its heartbeat goes stale. Deploy
when nothing is grading and no session runs.

**The desired count** belongs to the gateway, the job function and the idle function; the stack
never sets it after creation. `pnpm aws:wake` and `pnpm aws:sleep` set it by hand (1 / 0); a task
stopped by hand while a run is in flight loses that run. A session task is not the service's: it
ends when the engine ends it (its target, its budgets, its rails), when
`pnpm aws:session stop <task id>` does, or — the one hard stop — when the idle function finds it
older than `IdleJobMaxMinutes` (240 minutes: ECS has no task deadline, and a session hung below
the engine's rails would otherwise keep itself and the app task running); the 120 s stop timeout
lets it archive the profile first.

**Govcon on every wake.** `serve` starts its two jobs — the daily pull inside the request budget
and the daily spending warm — and each runs once at start, then on its cadence. A stack that wakes
several times a day therefore runs both several times: the pull is cheap when its searches were
pulled inside the day (they answer `cached` and spend no request), the warm re-reads the spending
lenses. The budget bounds the cost; the fix is a persisted last-run time (`PLAT-13`). The nightly
sessions add two wakes a day.

## Troubleshooting

**`verify` fails with "GET /api/health answered 401".** `/api/health` is declared `public` in
`infra/aws/apps.json`, so the gate never asks it for a session; a `401` there means the routes the
gateway runs are not the ones `apps.json` declares — the `GatewayRoutes` default in `app.yaml` (or
an override in `params/prod/app.json`) has drifted. `pnpm test:tooling` fails `[CLOUD-2]` on that
drift before a deploy; if it passed, compare the function's `GATEWAY_ROUTES` with the file.

**The page is blank after sign-in, and every `/_next/static/*` request answers 302.** The three
static-asset behaviours in `edge.yaml` use the `CachingOptimized` cache policy with no origin
request policy, so CloudFront forwards neither cookies nor the viewer's headers to the gateway on
those paths — by design, since public JavaScript needs no session and a cookie in the cache key
would defeat the cache. That is why each web app's `_next/static` prefix is a `public` route in
`apps.json`: the gate lets it through without a session. A `302` on one of those paths means the
route is missing or not public in the routes the gateway runs — the same drift as the entry
above, found the same way. A web app whose `basePath` changes needs its static prefix changed with
it (`/<basePath>/_next/static`); `[CLOUD-2]` holds the routes and the edge behaviours to the
declaration.

**The starting page never turns into the studio.** `pnpm aws:status` tells which: desired still 0
means the gateway could not update the service — `/sysdesign/prod/gateway` has `could not wake the
service` with the error (its role allows describe/update on the one service; a renamed service
would break it) — or the request never passed the session gate (a public route never wakes; sign
in first); desired 1 and running 0 for minutes means the task fails to start — the service's events
(`aws ecs describe-services … --query 'services[0].events[:10]'`) say whether it is an image pull
(the tag is not in ECR, or the execution role cannot pull), a secret (`ResourceNotFoundException`
on an SSM parameter named in the task definition — setup step 2 missed one; `OPENAI_API_KEY` and
the two job-application bot values are the ones added in phase 4), or a container that exits (its
log stream under `/sysdesign/prod/app`); running 1 but still 503 means the gateway cannot reach the
task: the Cloud Map record (`app.sysdesign.internal`) is written by ECS once the task runs, and the
app security group admits only the gateway group. After a circuit-breaker rollback the service
runs the previous revision and the stack is in a `ROLLBACK` state.

**The sign-in page answers "set the password permanent" (`NEW_PASSWORD_REQUIRED`).** The user was
created with a temporary password, which the gateway's page cannot change. Run the
`admin-set-user-password --permanent` command of setup step 9, then sign in again.

**The sign-in page says the email or password was refused.** The pool hides whether the user exists
(`PreventUserExistenceErrors`), so a wrong email reads the same as a wrong password; the gateway
logs Cognito's reason under `/sysdesign/prod/gateway`. A `NotAuthorizedException` naming the client
or the flow means the client in the platform stack no longer allows `USER_PASSWORD_AUTH`; the
template declares it.

**401 on every API call from the studio.** The browser's session cookies did not reach the gateway:
the site was opened on a hostname other than the distribution's (cookies are set for the
distribution's host), or the ID token expired and the refresh was refused — `/sysdesign/prod/gateway`
logs Cognito's refusal, and the answer cleared the cookies. Sign in again at `/auth/login`.

**The service never sleeps.** `/sysdesign/prod/idle` shows each run's outcome: `active` means the
gateway was invoked inside the last 15 minutes (a browser tab left open polls, and so does an
uptime checker — close them; `/api/health` counts as an invocation too, which is why `verify` is
not a thing to run on a schedule); `quiet-once` means the stop needs the next run to confirm it (so
a sleep takes 20–25 minutes after the last request, never 15); `busy` with `runningJobs` means a
session task (or a migration) is running — `pnpm aws:session list` names it, and a session that
hung past its rails is stopped by the idle function once it is `IdleJobMaxMinutes` (240) old, or
sooner with `pnpm aws:session stop <task id>`; `busy` without it means the
loop reported a run in flight; a failed loop call or task listing keeps the task and is logged.
`aws ssm get-parameter --name /sysdesign/prod/idle-state` shows the pending observation. The
`idle-errors` alarm fires when a run itself fails.

**Every grade fails, or the loop container restarts.** The subscription token: the loop's boot check
accepts a token that is present and the subscription's; an expired or revoked one fails the first
model call instead, with the CLI's reason in the recorded exchange (RUNBOOK, "Grading needs a
model"), and nothing re-checks it. Renew it (setup step 11). A container that exits at boot has
the loop's own message in its log stream: no token in the environment (the secret's parameter is
missing), or a model config the provider refused. The health check gives 90 s before it counts;
three failures stop the task and ECS starts another, so a boot failure shows as a restart loop in
the service's events.

**The migrate task failed.** `aws.sh migrate` prints the exit code, the stopped reason and the log
tail from `/sysdesign/prod/migrate`: a migration that cannot apply (fix it forward; `migration:up`
is what runs), or a connection failure — `verify-full` against the RDS CA bundle needs `DB_HOST`
to be the cluster endpoint, which the export is. The service is still on the previous revision
when this fails (the migration runs before the app stack), so the site keeps serving the old code
on the old schema; fix forward and push. The `vector` extension's migration runs as the master
user, which Aurora lets create it; a `permission denied` there means the master user changed.

**`db-import` failed.** The same log group: a `pg_restore` error names the statement. An object the
master user may not own (the `COMMENT - EXTENSION` and `EXTENSION` entries are already dropped
from the list), a table the cloud's schema does not have (the laptop and the cloud must be at the
same migration head — run `pnpm db:migrate` here first, and deploy the same commit there), or a
download the task role could not make (`imports/*` of the artifacts bucket is what it may read).
The restore runs in one transaction, so a failure leaves the database as it was. The service is
asleep while the import runs and stays asleep after a failure, for the log to be read before
anything boots on the database; `pnpm aws:wake` wakes it once the cause is fixed. A refusal before
anything ran means a session task was running (`pnpm aws:session list`): wait for it, or stop it.

**The session task ended at once with exit 2 (`SessionRefused`).** Another session holds the
profile: a `browser_session` row on the same profile is `running` with a fresh heartbeat — a
second start on the profile that got past the job function's running-task check (the check sees
tasks, the lease sees rows: a task that ended seconds ago may still hold a `running` row until its
heartbeat ages out). `pnpm aws:session list` shows the cloud's session tasks; stop one or let the
row age out, and the next start proceeds. A stale row (a task killed without a close) ages out
after `liveness.staleAfterMs`.
Three more refusals carry the same exit code and name their cause in the log: with the bucket set,
neither `state/<profile>.json` nor `profiles/<profile>.tar.gz` exists (export the sign-in on the
laptop and push it first); an archive that holds no `<profile>/` directory (remove it with
`pnpm aws:files rm profiles/<profile>.tar.gz` or push one made as `tar -C <profiles dir> <profile>`);
and, on the laptop, `export-state` on a profile that has no directory yet (sign in with `login`
first).

**The session never bound to the loop (`--wait-for-loop` gave up).** The app task did not come up
inside eight minutes: `pnpm aws:status` and the entry above ("The starting page never turns into
the studio") say why. The job function's own log (`/sysdesign/prod/job`) shows whether it set the
desired count; the `job-errors` alarm fires when the function itself failed (an unknown launch, a
`RunTask` refused — the log names it).

**LinkedIn shows a checkpoint, or signs the session out, on the cloud's device.** The cloud profile
is a new device from a datacenter address; LinkedIn may challenge it, and nothing in the cloud can
answer a challenge. The dump's first page (under `/app/static/browser-session/sessions/<id>`, or
the session's log) shows it. Recovery is on the laptop: sign in there (a headed session, or Chrome
on the profile), export the state again (Moving the laptop's data and lanes to the cloud, step 5),
push it over `state/linkedin.json`, and `pnpm aws:files rm profiles/linkedin.tar.gz` so the next
run seeds a fresh profile from the new state instead of restoring the challenged one (the bucket is
versioned; `aws s3api list-object-versions` finds the old archive if it is wanted back). The same
recipe serves Built In. How often this happens is the first thing to measure (`PLAT-14`,
`PLAT-17`).

**A session's form answers are empty, or every question goes to the phone.** The memory host has no
records for the tenant: `/sysdesign/prod/browser-session/MEMORY_TENANT` is not the laptop's
`MEMORY_TENANT`, or the import has not run, or the host's sweep has not re-embedded yet (it runs
every 60 s; with `DeployOpenAiKey=false` it never does). The host's log stream under
`/sysdesign/prod/app` reports the sweep's counts.

**The deploy failed with "the circuit breaker is rolling back" or a `ROLLBACK` stack status.** The
new revision's task never became healthy, so ECS rolled the service back and CloudFormation rolled
the stack back. The failed task's log streams under `/sysdesign/prod/app` say which container and
why; the previous revision is serving, on the schema the migration already moved forward — safe
when that migration only added things (Rollback, step 4). Fix forward and push.

**The first data deploy failed on the files key or bucket.** The bootstrap stack predates phase 4:
the execution role lacks `s3:*` on `sysdesign-prod-data-*` and the KMS key-management actions, or the
ECR check fails on `sysdesign/browser-session`, `sysdesign/job-application` or
`sysdesign/agentic-system`. `pnpm aws:bootstrap BudgetEmail=<address>` again (setup step 5), then
re-run the deploy.

**Rotating the database password.** The cluster reads a named version of the SecureString, so a
new value takes effect only through a deploy, in this order: write the new version, deploy the
data stack with the version raised (the cluster's master password changes in place), then restart
the task so the containers read the new value:

```bash
aws ssm put-parameter --name /sysdesign/prod/DB_PASSWORD --type SecureString --overwrite \
  --value "$(openssl rand -hex 24)"
aws ssm get-parameter --name /sysdesign/prod/DB_PASSWORD --query Parameter.Version --output text   # N
bash infra/aws/bin/aws.sh deploy-stack data DbPasswordVersion=N
pnpm aws:sleep && pnpm aws:wake
```

Between the stack update and the wake, a running task holds the old password and its next new
connection fails; do it when nothing is grading and no session runs. The next CI deploy keeps the
version only if `params/prod/data.json` says so — commit `DbPasswordVersion` there with the new
number, or the following deploy sets the cluster back to version 1's value.

**A prompt save, import or criteria rewrite answers 504 after two minutes, but the rubric appears
later.** The five studio-api routes that derive a rubric synchronously — `POST /api/prompts`,
`POST /api/prompts/import`, `GET /api/prompts/:id` with an empty rubric, `PATCH /api/prompts/:id` on a
markdown change, `POST /api/prompts/:id/criteria` — wait for the loop's `POST /criteria`, measured
at 8–61 s and once 195 s; CloudFront waits 120 s (`OriginReadTimeout`, the most the template
allows without a quota request), the gateway 110 s. Past that the edge answers 504 while the
derivation finishes server-side and is stored, so a reload shows it. `PLAT-10` converts the
derivation to the 202 start-then-poll the rest of the API uses; raising the two timeouts needs a
CloudFront quota request above 120 s, then `OriginReadTimeout`'s `MaxValue` raised in `edge.yaml`.

**Telegram answers 409 Conflict and a cloud bot delivers nothing.** Two pollers hold one bot
token: the cloud `notifications` was given the token of a bot this machine's service also polls.
The service logs the conflict and waits. For govcon, give the cloud its own bot's token in
`/sysdesign/prod/notifications/GOVCON_TELEGRAM_API_KEY` (and its username in
`…/GOVCON_TELEGRAM_BOT_ID`); for job-application, take the instance out of the laptop's
`telegram.json` (setup step 4); then `pnpm aws:sleep && pnpm aws:wake`.

**Govcon spends requests, or sends its digest, every time the stack wakes.** Its two serve jobs run
once at start; see Wake and sleep. A pull inside the day answers `cached` and spends nothing; the
warm re-reads its lenses. `PLAT-13`.

**Every job was skipped.** `AWS_DEPLOYS` is not `on` as a repository variable, the run was not on
`main`, or the CI run that triggered it was not a push's (a pull request's CI run never deploys).
The switch is read by `resolve` alone, so a run shows either every job skipped or none.

**A re-run fails as superseded.** `main` moved on after that run started; dispatch instead
(`pnpm aws:deploy`). The guard runs in `resolve`, `images` and `deploy` alike, so re-running one
failed job is refused the same way. A rollback dispatch is exempt.

**`image_tag must be the full commit SHA`.** A rollback names the 40-character SHA an earlier
deploy pushed; `git rev-parse <short>` expands it.

**"ECR holds no `<tag>` for …".** The lifecycle policy kept only the last three tagged images; that
commit cannot be deployed again. Deploy a newer one, or push the images for it by hand with the
Dockerfile commands above and `docker push` to `sysdesign/<image>:<sha>` (every repository must
hold the tag). **"could not be read"** instead means ECR answered something other than
`ImageNotFoundException` — the repositories are not there (bootstrap, step 5) or the role cannot
describe them.

**`aws.sh: AWS_REGION is unset`.** Export it (`us-east-1`); the script sets `AWS_DEFAULT_REGION`
from it and refuses to guess.

**`aws.sh: export sysdesign-prod-… is missing`.** The stack that exports it is not deployed — the
bootstrap stack by hand (step 5), the others by the workflow — or `AWS_REGION` names another region.

**`pnpm aws:lint` says cfn-guard is not installed.** It ran cfn-lint alone. CI's `infra` job runs
both; to run the rules here, install the cfn-guard 3.2.1 release binary for your platform and put
it on the PATH.

## Limits and costs

| What                       | Limit                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A request through the edge | 120 s at CloudFront (`OriginReadTimeout`; 1–120 as the account comes, more needs a quota request and the template's `MaxValue` raised), 150 s for the Lambda, 5 s to connect and 110 s to answer upstream; the rubric derivation can exceed it (Troubleshooting, `PLAT-10`)                                                                                             |
| A request or response body | 6 MB, the function URL's buffered mode; the gateway answers 502 past it (a 94 KB canvas is far below; the Nest apps' 1 MB JSON body limit, `packages/nest-kit`, is the tighter one)                                                                                                                                                                                     |
| The app task               | One, 1 vCPU / 8 GB, ARM64; the memory of a grade's CLI subprocesses and of the two lanes is unmeasured, so the figure is a starting point to shrink                                                                                                                                                                                                                     |
| The session task           | 2 vCPU / 4 GB, ARM64, 20 GiB of ephemeral disk, one per profile at a time (the engine's lease); its size is unmeasured too. Beyond the engine's rails, the idle function stops a session task older than `IdleJobMaxMinutes` (240 minutes; `PLAT-16`), and `pnpm aws:session stop` sooner                                                                               |
| What the cloud cannot do   | Answer a sign-in challenge: a LinkedIn checkpoint on the cloud's device needs a person on the laptop (Troubleshooting; `PLAT-14`). Keep one address: every task gets a fresh public IPv4, a datacenter one, so the sites see a new device address per night (`PLAT-17`). Take an answer from a terminal: stdin is closed, so the operator answers through Telegram only |
| The schedules              | UTC, fixed: LinkedIn's daily Easy Apply allowance resets at 00:00Z (measured on the laptop, 2026-11-11), so `linkedin` starts at 00:05Z and `builtin` at 01:05Z; `JobSchedulesState` is the only switch, `DISABLED` until flipped                                                                                                                                       |
| Aurora                     | 0 to 2 ACU; awake it bills at least 0.5 ACU, and may resume above that for a while (the alarm fires after 30 minutes at the ceiling)                                                                                                                                                                                                                                    |
| Sleep                      | 15 idle minutes, confirmed by a second observation 5 minutes later, and never while a session task runs: 20–25 minutes after the last request, never 15                                                                                                                                                                                                                 |
| Rollback reach             | The last three tagged images per ECR repository                                                                                                                                                                                                                                                                                                                         |
| The memory tier            | On, as pgvector in Aurora, embedding through `OPENAI_API_KEY`; with `DeployOpenAiKey=false` recall by meaning and the digests that feed it are off and grading, coaching and prompt generation still run                                                                                                                                                                |
| Spot                       | `CapacityProvider=FARGATE_SPOT` (the app task) and `JobCapacityProvider=FARGATE_SPOT` (a session task) are about 36 % of on-demand (the vendor's figure); an interruption fails the run, or ends the session mid-form; neither is the default                                                                                                                           |
| Model access               | The subscription's own 5-hour and weekly limits, shared with this machine and now with the nightly sessions; see the policy note in setup step 3                                                                                                                                                                                                                        |

Monthly cost, us-east-1, ARM on-demand, 0.5 ACU while awake, as the plan computed it from the
vendor's prices on 2026-11-10/11 (Spot in parentheses); none of it measured on a bill yet:

| Line                                                                | Idle month | 2 h/day     | 8 h/day      |
| ------------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Fargate app task + public IPv4 (billed only while awake)            | ~$0.1      | $4.0 ($1.7) | $15.8 ($6.0) |
| Aurora compute (×2 if it averages 1 ACU)                            | ~$0.1      | $4.2        | $15.7        |
| Aurora storage ~1 GB; backups within retention are free             | $0.1       | $0.1        | $0.1         |
| Route 53 private zone (Cloud Map) + the service instance            | $0.6       | $0.6        | $0.6         |
| EFS dumps (~1.4 GB/month growth, IA after 7 days)                   | $0.5       | $0.5        | $0.5         |
| ECR (~10–14 GB with 3 tags kept; the Chromium image is the largest) | $1.0       | $1.0        | $1.0         |
| The files key (a customer-managed KMS key is $1 a month)            | $1.0       | $1.0        | $1.0         |
| Logs, metrics, S3 (the files bucket is a few hundred MB)            | ~$0.2      | ~$0.3       | ~$0.4        |
| CloudFront, Lambda, Scheduler, SSM, Budgets, Cognito, OIDC          | $0         | $0          | $0           |
| **Total**                                                           | **≈ $4**   | **≈ $12**   | **≈ $35**    |

The nightly browser sessions come on top, at about **$0.20 per session hour**: the session task
(2 vCPU / 4 GB ARM on-demand, $0.08), the app task awake meanwhile ($0.06 at 1 vCPU / 8 GB) and
Aurora at 0.5 ACU ($0.06), plus two public IPv4 addresses ($0.01) — computed on 2026-11-11 from the
same price list (Fargate ARM $0.03238 per vCPU-hour and $0.00356 per GB-hour, IPv4 $0.005 an hour,
Aurora $0.12 per ACU-hour). Two sessions a night of 1.5–2 hours each (the laptop's lengths) is
90–120 hours a month, **≈ $20–25 a month**, so a month of nightly sessions and two hours of studio
use lands near $35, over the $15 budget: raise `MonthlyBudgetUsd` with the bootstrap command when
the schedules are flipped. Always-on for reference: about $49/month (RDS `db.t4g.micro` plus
Fargate on-demand) or $28 on Spot. The $15 budget alerts at 80 % actual and 100 % forecast.

**What later phases hold**, each a change of its own: the rubric derivation as 202 start-then-poll
(`PLAT-10`, which also reopens API Gateway as an option); a persisted last-run time for govcon's
jobs (`PLAT-13`); a reader for the session dumps on EFS (`PLAT-15`); a custom domain (ACM plus a
CNAME); static exports of the UIs (the six dynamic
routes need `?id=` addressing first); AWS Lambda Web Functions as the gateway (an unmodified Node
server from a zip, with an OAC that signs POSTs without a body hash — a month old at the time of
writing, hence not the base); and Spot as the default once interruptions are measured against the
run and session lengths.
