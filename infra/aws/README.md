# infra/aws

The studio's AWS deployment as CloudFormation, one stack per concern. The
runbook (what each resource is for, one-time setup, the move of the laptop's
data and lanes, rollback, validation, costs) is `docs/aws/deployment.md`; this
page is only the map of the folder.

| Path                       | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps.json`                | The one declaration of what is deployed: every image (kind, port, health path, command, basePath, public URL variables; the `playwright` kind is a job image with no port), the `localOnly` Nest apps CI builds but the deploy never ships, the scheduled `jobs` (the image, the command template with `{launch}`, the launches with their `cron(…)` expressions), and the gateway's routes. Read by the workflows, the image builds and the specs. |
| `bootstrap.yaml`           | Deployed once by hand: GitHub OIDC trust and deploy role, the CloudFormation execution role (with `s3:*` on the data stack's `sysdesign-prod-data-*` buckets and the KMS key-management actions since phase 4), the artifacts bucket (packaged templates kept 30 days, a database dump on its way to `db-import` one day), one ECR repository per image (eleven), the monthly budget.                                                               |
| `network.yaml`             | Dual-stack VPC, two public subnets, five security groups (gateway, app, db, efs, and the browser-session task's own, which app, db and efs admit), Cloud Map namespace `sysdesign.internal`.                                                                                                                                                                                                                                                        |
| `data.yaml`                | Aurora Serverless v2 PostgreSQL (scales to zero; the memory tier's pgvector tables live in it) with its exported log group, the EFS volume with two access points (the loop's run dumps, the browser session's dumps), and the browser session's files bucket with its KMS key (signed-in state, profile archives, documents).                                                                                                                      |
| `platform.yaml`            | What the app runs on and what outlives a revision: ECS cluster, the task roles (execution, task, session task), the six log groups, the `db-migrate` and `browser-session` task definitions, the Cognito user pool and the gateway's client, the alerts topic. Takes `ImageTag` for the two task images; exports the session task's family, never its revision (an imported export cannot change).                                                  |
| `app.yaml`                 | The one-task service (nine containers from `apps.json`), the Cloud Map service, the gateway, idle and job Lambdas with the idle state parameter and schedule (the idle function also stops a session task older than `IdleJobMaxMinutes`), one EventBridge schedule per declared launch (`JobSchedulesState`, `DISABLED` by default) with the job function's own retry bounded to an hour, alarms. Redeployed on every image tag.                   |
| `edge.yaml`                | The CloudFront distribution in front of the gateway.                                                                                                                                                                                                                                                                                                                                                                                                |
| `params/prod/<stack>.json` | Non-secret parameter values per stack. Per-deploy values (`ImageTag`, `OriginSecret`) and addresses (`BudgetEmail`, `AlertEmail`) are passed as `Key=Value` overrides; `JobSchedulesState` is the switch the owner flips here once the first session has run by hand.                                                                                                                                                                               |
| `guard/sysdesign.guard`    | cfn-guard rules every template must pass (encryption, retention, no open ingress, credentials only as Secrets, buckets private and encrypted, keys rotated, HTTPS everywhere).                                                                                                                                                                                                                                                                      |
| `bin/aws.sh`, `bin/lib.sh` | The one shell entry the workflow and the root `aws:*` scripts call: `lint`, `bootstrap`, `deploy-stack`, `migrate`, `wake`, `sleep`, `status`, `exec`, `verify`, `session run\|list\|stop\|logs`, `files push\|list\|rm`, `db-import`.                                                                                                                                                                                                              |
| `bin/image-matrix.js`      | Prints both workflows' image matrix (`{ include: [{ image, file, target, build_args }] }`) from `apps.json`, so neither workflow lists an image by name; the spec asserts its output.                                                                                                                                                                                                                                                               |

Stacks are `sysdesign-prod-{bootstrap,network,data,platform,app,edge}`; every
export is `sysdesign-prod-<Name>` and the stacks reference each other only
through `!ImportValue`. Deploy order: bootstrap (once) → network → data →
platform → migrate → app → edge; the migration runs before the app service
rolls, so a task never starts on a schema older than its code. The browser
session is not part of the service: the job Lambda runs it as a one-off task
of the platform's session task definition, from a schedule or by hand.

## Why `app.yaml` stays one template

The app template is the longest file here because one task definition lists
nine containers, each with its own image, ports, environment, secrets, health
check and log stream, and a task definition has no shared block to factor them
into. Splitting it would not shorten anything: the containers must be declared
in one `AWS::ECS::TaskDefinition`, the service must reference that one
resource, and the three Lambdas, the idle state, the schedules and the alarms
change on the same tag as the service and would only gain a layer of exports
between them. What does not change per tag — the cluster, the roles, the log
groups, the migrate and session tasks, the user pool, the alerts topic — is
what lives in `platform.yaml`, which is the split that pays: a failed app
rollout can never take those with it, and the migrate task exists before the
revision it migrates for.
