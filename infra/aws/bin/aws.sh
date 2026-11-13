#!/usr/bin/env bash
#
# One entry for everything the studio's AWS deployment does, used by the
# deploy-aws workflow and by the owner through the root `aws:*` scripts.
# Stack names, exports, params files and tags all derive from the slug in
# lib.sh, so a command never spells an instance by hand. Region and account
# come from the environment (AWS_REGION plus whatever credentials the AWS CLI
# finds); secrets never pass through here. Setup, rollback and validation:
# docs/aws/deployment.md.
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  cat << 'EOF'
usage: infra/aws/bin/aws.sh <command> [args]

  lint                               cfn-lint every template, then cfn-guard when installed
  bootstrap [Key=Value ...]          deploy the bootstrap stack by hand (needs BudgetEmail=...)
  deploy-stack <name> [Key=Value ..] deploy network | data | platform | app | edge from its params file
                                     (app: packages the gateway code, then waits for the rollout)
  migrate                            run the platform stack's db-migrate task, wait, print its log,
                                     fail on a non-zero exit
  wake | sleep                       set the app service's desired count to 1 | 0
  status                             service, task and Aurora capacity at a glance
  exec [container]                   ECS Exec shell into one container of the running task
                                     (default quality-loop)
  verify <site-url>                  wake the service, then poll /api/health through CloudFront
                                     until it answers 200
  session run <launch> [args ...]    start one browser-session launch as a task through the job
                                     function (the way a schedule does); prints the task id
  session list                       the session tasks running: id, startedBy, startedAt, status
  session stop <task-id>             stop one session task (reason: operator)
  session logs <task-id>             follow one session task's log stream
  files push <local> <key>           upload a file to the files bucket under profiles/, state/
                                     or docs/ (any other prefix is refused)
  files list [prefix]                list the files bucket, or one prefix of it (an empty one
                                     says so and succeeds)
  files rm <key>                     remove one object (the bucket keeps the version 30 days)
  db-import <dump-file>              refuse while a session task runs; upload a pg_dump -Fc file
                                     to the artifacts bucket, block the wakers, sleep the service,
                                     restore it through the migrate task in one transaction, wake
                                     on success (the wakers are unblocked whatever happens)

AWS_REGION must be set; credentials come from the AWS CLI's own chain.
EOF
}

cmd_lint() {
  need cfn-lint
  cfn-lint "${INFRA_DIR}"/*.yaml
  if command -v cfn-guard > /dev/null 2>&1; then
    local template
    for template in "${INFRA_DIR}"/*.yaml; do
      cfn-guard validate --rules "${INFRA_DIR}/guard/${SLUG}.guard" --data "${template}" \
        --show-summary fail
    done
  else
    note 'cfn-guard is not installed; the guard rules were not run'
  fi
}

# Deployed as an account admin, with no execution role: it is the stack that
# creates that role.
cmd_bootstrap() {
  local stack params
  stack="$(stack_name bootstrap)"
  params="$(merged_params "$(params_file bootstrap)" "$@")"
  aws cloudformation deploy --stack-name "${stack}" \
    --template-file "$(template_file bootstrap)" \
    --parameter-overrides "file://${params}" \
    --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset \
    --tags "${STACK_TAGS[@]}"
  assert_stack_complete "${stack}"
}

# The gateway code is a local path in app.yaml; `package` uploads it under the
# deployed tag (the ImageTag override, or the checkout's commit when a deploy
# names none) and writes a template that names the uploaded object.
package_app_template() {
  local bucket tag packaged
  bucket="$(export_value ArtifactsBucket)"
  tag="$(override_value ImageTag "$@")"
  if [ -z "${tag}" ]; then
    need git
    tag="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  fi
  packaged="$(temp_file app-template)"
  aws cloudformation package --template-file "$(template_file app)" \
    --s3-bucket "${bucket}" --s3-prefix "cfn/${tag}" \
    --output-template-file "${packaged}" > /dev/null
  echo "${packaged}"
}

cmd_deploy_stack() {
  local short="${1:-}" stack template params role cluster service
  shift || true
  case "${short}" in
    network | data | platform | app | edge) ;;
    bootstrap) die 'the bootstrap stack deploys with `aws.sh bootstrap`' ;;
    *) die "deploy-stack needs one of network | data | platform | app | edge, got '${short}'" ;;
  esac
  stack="$(stack_name "${short}")"
  if [ "${short}" = app ]; then
    template="$(package_app_template "$@")"
  else
    template="$(template_file "${short}")"
  fi
  params="$(merged_params "$(params_file "${short}")" "$@")"
  role="$(export_value CloudFormationExecutionRoleArn)"
  aws cloudformation deploy --stack-name "${stack}" --template-file "${template}" \
    --parameter-overrides "file://${params}" \
    --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset \
    --role-arn "${role}" \
    --tags "${STACK_TAGS[@]}"
  assert_stack_complete "${stack}"
  case "${short}" in
    data)
      aws cloudformation update-termination-protection --enable-termination-protection \
        --stack-name "${stack}" > /dev/null
      ;;
    app)
      cluster="$(export_value ClusterName)"
      service="$(export_value ServiceName)"
      wait_for_rollout "${cluster}" "${service}" "$(override_value ImageTag "$@")"
      ;;
  esac
}

# One run of the platform stack's migrate task definition in the platform
# stack's cluster, with the network's subnets and the app security group (the
# database admits it): started, waited for, its log printed; a non-zero exit
# is noted and returned as a failure, for the caller to name. With an
# overrides document the container runs that command in place of the
# migration — the data import's path.
run_migrate_task() {
  local label="$1" overrides="${2:-}" cluster definition subnets group task exit_code reason
  local -a extra=()
  [ -z "${overrides}" ] || extra=(--overrides "${overrides}")
  cluster="$(export_value ClusterName)"
  definition="$(export_value MigrateTaskDefinitionArn)"
  subnets="$(export_value PublicSubnetIds)"
  group="$(export_value AppSecurityGroupId)"
  task="$(aws ecs run-task --cluster "${cluster}" --task-definition "${definition}" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${group}],assignPublicIp=ENABLED}" \
    ${extra[@]+"${extra[@]}"} \
    --query 'tasks[0].taskArn' --output text)"
  [ -n "${task}" ] && [ "${task}" != 'None' ] || die 'run-task started nothing'
  note "${label} task ${task##*/} started from ${definition##*/}"
  wait_task_stopped "${cluster}" "${task}"
  read -r exit_code reason <<< "$(aws ecs describe-tasks --cluster "${cluster}" --tasks "${task}" \
    --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text)"
  aws logs tail "${MIGRATE_LOG_GROUP}" --since 1h --format short \
    --log-stream-names "${MIGRATE_CONTAINER}/${MIGRATE_CONTAINER}/${task##*/}" || true
  if [ "${exit_code}" != '0' ]; then
    note "${label} exited ${exit_code}: ${reason}"
    return 1
  fi
}

cmd_migrate() {
  run_migrate_task migrate || die 'the migration failed'
  note 'migrations applied'
}

set_desired_count() {
  local cluster service
  cluster="$(export_value ClusterName)"
  service="$(export_value ServiceName)"
  aws ecs update-service --cluster "${cluster}" --service "${service}" --desired-count "$1" \
    --query 'service.{desired:desiredCount,running:runningCount}' --output text
}
cmd_wake() { set_desired_count 1; }
cmd_sleep() { set_desired_count 0; }

cmd_status() {
  local cluster service database
  cluster="$(export_value ClusterName)"
  service="$(export_value ServiceName)"
  database="$(export_value DbClusterIdentifier)"
  echo '# service'
  aws ecs describe-services --cluster "${cluster}" --services "${service}" \
    --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount,deployments:deployments[].{status:status,rollout:rolloutState,taskDefinition:taskDefinition}}' \
    --output yaml
  echo '# tasks'
  aws ecs list-tasks --cluster "${cluster}" --service-name "${service}" \
    --query 'taskArns' --output yaml
  echo '# database'
  aws rds describe-db-clusters --db-cluster-identifier "${database}" \
    --query 'DBClusters[0].{status:Status,minAcu:ServerlessV2ScalingConfiguration.MinCapacity,maxAcu:ServerlessV2ScalingConfiguration.MaxCapacity}' \
    --output yaml
  echo '# database capacity (ACU, last 10 minutes)'
  aws cloudwatch get-metric-statistics --namespace AWS/RDS \
    --metric-name ServerlessDatabaseCapacity \
    --dimensions "Name=DBClusterIdentifier,Value=${database}" \
    --start-time "$(minutes_ago 10)" --end-time "$(minutes_ago 0)" \
    --period 60 --statistics Average \
    --query 'sort_by(Datapoints,&Timestamp)[].[Timestamp,Average]' --output text
}

cmd_exec() {
  local container="${1:-${LOOP_CONTAINER}}" cluster service task
  cluster="$(export_value ClusterName)"
  service="$(export_value ServiceName)"
  task="$(running_task "${cluster}" "${service}")"
  aws ecs execute-command --cluster "${cluster}" --task "${task}" \
    --container "${container}" --interactive --command '/bin/sh'
}

# One request through the edge, printing only what the format asks for; a
# request that gets no answer in time prints 000.
edge_request() {
  curl --silent --output /dev/null --max-time "${CURL_MAX_SECONDS}" --write-out "$1" "$2"
}

# Wakes the service itself — /api/health is a public route, and a public
# route never wakes anything — then waits for the task through the edge: a
# 503 is the gateway's "starting" page, anything else is a defect to read.
cmd_verify() {
  local site="${1:-}" code poll
  [ -n "${site}" ] || die 'verify needs the site URL'
  need curl
  site="${site%/}"
  note 'waking the service'
  set_desired_count 1
  code="$(edge_request '%{http_code}' "${site}/")"
  [ "${code}" = '302' ] || die "GET / answered ${code}; expected a 302 to the sign-in page"
  note "GET / redirects to $(edge_request '%{redirect_url}' "${site}/")"
  for poll in $(seq 1 "${VERIFY_POLLS}"); do
    code="$(edge_request '%{http_code}' "${site}/api/health")"
    case "${code}" in
      200)
        note 'GET /api/health is 200'
        return 0
        ;;
      503) note "starting (${poll}/${VERIFY_POLLS})" ;;
      000) note "no answer within ${CURL_MAX_SECONDS}s (${poll}/${VERIFY_POLLS})" ;;
      *) die "GET /api/health answered ${code}; a 401 means the gateway guards the health path" ;;
    esac
    sleep "${VERIFY_POLL_SECONDS}"
  done
  die 'the stack did not answer 200 in time'
}

# A launch through the job function, exactly as a schedule invokes it: the
# function wakes the app service, derives the command and starts the task.
# A function error is the function's own answer (an unknown launch, a task
# that did not start), printed whole; the task id is what the operator keeps.
session_run() {
  local launch="${1:-}" payload answer error task
  [ -n "${launch}" ] || die 'session run needs the launch name (linkedin | builtin)'
  shift
  payload="$(node -e '
    const [launch, ...args] = process.argv.slice(1);
    console.log(JSON.stringify(args.length === 0 ? { launch } : { launch, args }));
  ' "${launch}" "$@")"
  answer="$(temp_file job-answer)"
  error="$(aws lambda invoke --function-name "${JOB_FUNCTION}" \
    --cli-binary-format raw-in-base64-out --payload "${payload}" \
    --query 'FunctionError' --output text "${answer}")"
  if [ -n "${error}" ] && [ "${error}" != 'None' ]; then
    cat "${answer}" >&2
    echo >&2
    die "the job function failed (${error})"
  fi
  task="$(node -e '
    const answer = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    console.log(answer.taskArn.split("/").pop());
  ' "${answer}")"
  note "session ${launch} started as task ${task}; follow it with: aws.sh session logs ${task}"
  echo "${task}"
}

session_list() {
  local cluster arns
  cluster="$(export_value ClusterName)"
  arns="$(session_task_arns "${cluster}")"
  if [ -z "${arns}" ]; then
    note 'no session task is running'
    return 0
  fi
  describe_session_tasks "${cluster}" "${arns}"
}

session_stop() {
  local id="${1:-}" cluster
  [ -n "${id}" ] || die 'session stop needs the task id'
  cluster="$(export_value ClusterName)"
  aws ecs stop-task --cluster "${cluster}" --task "$(task_id "${id}")" --reason 'operator' \
    --query 'task.{task:taskArn,status:lastStatus,desired:desiredStatus}' --output text
}

session_logs() {
  local id="${1:-}"
  [ -n "${id}" ] || die 'session logs needs the task id'
  aws logs tail "${SESSION_LOG_GROUP}" --follow --since 1h --format short \
    --log-stream-names "${SESSION_CONTAINER}/${SESSION_CONTAINER}/$(task_id "${id}")"
}

cmd_session() {
  local sub="${1:-}"
  shift || true
  case "${sub}" in
    run) session_run "$@" ;;
    list) session_list ;;
    stop) session_stop "$@" ;;
    logs) session_logs "$@" ;;
    *) die "session needs run <launch> [args ...] | list | stop <task-id> | logs <task-id>, got '${sub}'" ;;
  esac
}

# The three prefixes of the files bucket, the ones the session task role may
# read and write; a key anywhere else would sit where no task looks.
assert_files_key() {
  case "$1" in
    profiles/?* | state/?* | docs/?*) ;;
    *) die "files key '$1' must start with profiles/, state/ or docs/" ;;
  esac
}

# The bucket encrypts every object with its own KMS key by default, and its
# policy refuses an upload that names a different key; sending no key is the
# one form that is right under both.
files_push() {
  local bucket="$1" local_file="${2:-}" key="${3:-}"
  [ -n "${local_file}" ] && [ -n "${key}" ] || die 'files push needs <local> <key>'
  [ -f "${local_file}" ] || die "files push: ${local_file} is not a file"
  assert_files_key "${key}"
  aws s3 cp "${local_file}" "s3://${bucket}/${key}"
}

files_rm() {
  local bucket="$1" key="${2:-}"
  [ -n "${key}" ] || die 'files rm needs <key>'
  assert_files_key "${key}"
  aws s3 rm "s3://${bucket}/${key}"
}

# `aws s3 ls` exits 1 when nothing matches the prefix — `files list state/`
# before the first push — which is an answer, not a failure; any other code
# is one, and comes back as it came.
files_list() {
  local bucket="$1" prefix="${2:-}" rc=0
  aws s3 ls "s3://${bucket}/${prefix}" --recursive || rc=$?
  case "${rc}" in
    0) ;;
    1) note "nothing under s3://${bucket}/${prefix}" ;;
    *) return "${rc}" ;;
  esac
}

cmd_files() {
  local sub="${1:-}" bucket
  shift || true
  bucket="$(export_value FilesBucketName)"
  case "${sub}" in
    push) files_push "${bucket}" "$@" ;;
    list) files_list "${bucket}" "$@" ;;
    rm) files_rm "${bucket}" "$@" ;;
    *) die "files needs push <local> <key> | list [prefix] | rm <key>, got '${sub}'" ;;
  esac
}

# Reserved concurrency 0 makes Lambda refuse every invocation of a function.
# Put on the gateway and the job function for the import's length, it keeps
# a signed-in tab's refresh (the "starting" page reloads itself every five
# seconds) and a schedule from setting the desired count back to 1 and
# booting the app against a database mid-restore. The undo is registered
# before the first put, so a put that fails, a drain that times out and a
# restore that fails all lift the block; an undo that fails says what to
# run by hand and never fails the trap.
block_wakers() {
  local name
  on_exit unblock_wakers
  for name in "${GATEWAY_FUNCTION}" "${JOB_FUNCTION}"; do
    aws lambda put-function-concurrency --function-name "${name}" \
      --reserved-concurrent-executions 0 > /dev/null
    note "${name}: invocations blocked for the import"
  done
}

unblock_wakers() {
  local name
  for name in "${GATEWAY_FUNCTION}" "${JOB_FUNCTION}"; do
    if aws lambda delete-function-concurrency --function-name "${name}"; then
      note "${name}: invocations allowed again"
    else
      note "${name}: the block could not be lifted; run: aws lambda delete-function-concurrency --function-name ${name}"
    fi
  done
}

# The data cutover's cloud side (docs/aws/deployment.md). Nothing may write
# into the database while the restore drops and rebuilds its tables, so: a
# session task of any launch refuses the import outright (its heartbeats and
# application rows would land in tables being rebuilt, and nothing here may
# stop a session for it); the dump goes to the artifacts bucket first (an
# upload that fails leaves the service as it was); the two functions that
# can wake the service are blocked before it is put to sleep, so that no
# tab can wake it while it drains; the service sleeps and drains so nothing
# holds a connection, and the drain is checked once more right before the
# restore; and the migrate task runs the import script in place of the
# migration, reading the dump back by its key, in one transaction. The
# service is woken only after a restore that succeeded; a failed one leaves
# it asleep, with the database as it was, for the operator to read before
# anything boots on it — the wakers are unblocked either way.
cmd_db_import() {
  local dump="${1:-}" cluster service bucket key overrides sessions live
  [ -n "${dump}" ] || die 'db-import needs the dump file (pg_dump -Fc)'
  [ -f "${dump}" ] || die "db-import: ${dump} is not a file"
  cluster="$(export_value ClusterName)"
  service="$(export_value ServiceName)"
  bucket="$(export_value ArtifactsBucket)"
  sessions="$(session_task_arns "${cluster}")"
  if [ -n "${sessions}" ]; then
    describe_session_tasks "${cluster}" "${sessions}" >&2
    die 'a session task is running (listed above) and would write into tables the restore rebuilds; `aws.sh session stop <task-id>` or let it end, then run db-import again'
  fi
  key="${IMPORTS_PREFIX}/$(basename "${dump}")"
  overrides="$(node -e '
    const [container, key] = process.argv.slice(1);
    const command = ["node", "-r", "@swc-node/register", "packages/db/scripts/import-dump.ts", key];
    console.log(JSON.stringify({ containerOverrides: [{ name: container, command }] }));
  ' "${MIGRATE_CONTAINER}" "${key}")"
  aws s3 cp "${dump}" "s3://${bucket}/${key}"
  block_wakers
  note 'putting the service to sleep'
  set_desired_count 0
  wait_service_drained "${cluster}" "${service}"
  live="$(draining_tasks "${cluster}" "${service}")"
  [ "${live}" = '0' ] ||
    die "${live} task(s) of the service appeared after the drain; nothing was restored (\`aws.sh status\` shows them; \`aws.sh wake\` may have run beside this)"
  run_migrate_task import "${overrides}" ||
    die 'the import failed and was rolled back; the service stays asleep (`aws.sh wake` to wake it as it was)'
  note "imported ${key}; waking the service"
  set_desired_count 1
}

main() {
  local command="${1:-}"
  shift || true
  case "${command}" in
    lint) cmd_lint ;;
    '' | -h | --help | help) usage ;;
    *)
      need aws
      need node
      require_region
      case "${command}" in
        bootstrap) cmd_bootstrap "$@" ;;
        deploy-stack) cmd_deploy_stack "$@" ;;
        migrate) cmd_migrate ;;
        wake) cmd_wake ;;
        sleep) cmd_sleep ;;
        status) cmd_status ;;
        exec) cmd_exec "$@" ;;
        verify) cmd_verify "$@" ;;
        session) cmd_session "$@" ;;
        files) cmd_files "$@" ;;
        db-import) cmd_db_import "$@" ;;
        *)
          usage >&2
          die "unknown command '${command}'"
          ;;
      esac
      ;;
  esac
}

main "$@"
