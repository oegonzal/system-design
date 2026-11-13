#!/usr/bin/env bash
#
# Helpers for infra/aws/bin/aws.sh: the names every command derives from the
# slug, the AWS reads several commands share, and the waits. Sourced by
# aws.sh, never run on its own.

SLUG='sysdesign'
STAGE='prod'
PREFIX="${SLUG}-${STAGE}"
REPO='oegonzal/system-design'
STACK_TAGS=("project=${SLUG}" "env=${STAGE}" 'managed-by=cloudformation' "repo=${REPO}")
INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/../.." && pwd)"
MIGRATE_LOG_GROUP="/${SLUG}/${STAGE}/migrate"
SESSION_LOG_GROUP="/${SLUG}/${STAGE}/session"
LOOP_CONTAINER='quality-loop'
MIGRATE_CONTAINER='db-migrate'
# The session task's container, its log stream prefix and its task family
# (`${AWS::StackName}-session` in platform.yaml), and the two functions of
# the app stack that can wake the service: the job function
# (`${AWS::StackName}-job` in app.yaml), which starts a launch as one task,
# and the gateway (`${AWS::StackName}-gateway`), which a signed-in request
# invokes.
SESSION_CONTAINER='browser-session'
SESSION_FAMILY="${PREFIX}-platform-session"
JOB_FUNCTION="${PREFIX}-app-job"
GATEWAY_FUNCTION="${PREFIX}-app-gateway"
# Where the artifacts bucket keeps a database dump on its way to the import.
IMPORTS_PREFIX='imports'
ROLLOUT_POLL_SECONDS=15
ROLLOUT_POLLS=60
VERIFY_POLL_SECONDS=10
VERIFY_POLLS=36
DRAIN_POLL_SECONDS=10
DRAIN_POLLS=30
CURL_MAX_SECONDS=15
# The most task ARNs one `describe-tasks` takes.
DESCRIBE_BATCH=100

die() {
  echo "aws.sh: $*" >&2
  exit 1
}
note() { echo "aws.sh: $*" >&2; }
need() { command -v "$1" > /dev/null 2>&1 || die "$1 is not installed"; }

require_region() {
  [ -n "${AWS_REGION:-}" ] || die 'AWS_REGION is unset; export it (this stack lives in us-east-1)'
  export AWS_DEFAULT_REGION="${AWS_REGION}"
}

stack_name() { echo "${PREFIX}-$1"; }
template_file() { echo "${INFRA_DIR}/$1.yaml"; }
params_file() { echo "${INFRA_DIR}/params/${STAGE}/$1.json"; }

# Every temp file lives in one directory made here, so the EXIT trap removes
# them all — including those made inside a $(…) subshell, which could not
# register themselves with the parent shell. A command that must undo
# something whatever happens — the block db-import puts on the wakers —
# registers the function that undoes it with `on_exit`; the one trap runs
# those first, last registered first, then removes the directory. An undo
# never fails: it notes what it could not do, because a failing command
# would end the trap before the rest of it ran. A `die` inside $(…) ends
# only the subshell, whose traps are reset, so each undo runs once, from the
# parent shell, at its exit.
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aws-sh.XXXXXX")"
EXIT_UNDO=()
on_exit() { EXIT_UNDO+=("$1"); }
run_exit_undo() {
  local i
  for ((i = ${#EXIT_UNDO[@]} - 1; i >= 0; i--)); do "${EXIT_UNDO[i]}"; done
  rm -rf "${TEMP_DIR}"
}
trap run_exit_undo EXIT
temp_file() { mktemp "${TEMP_DIR}/$1.XXXXXX"; }

# The value of one `sysdesign-prod-<Name>` export, or a clear failure when its
# stack is not deployed yet. Always read into a declared local on its own
# line (`local x; x="$(export_value …)"`): a `die` inside $(…) ends only the
# subshell, and it is the failed assignment under `set -e` that stops the
# caller — an inline "$(export_value …)" argument would run the command with
# an empty value instead.
export_value() {
  local value
  value="$(aws cloudformation list-exports \
    --query "Exports[?Name=='${PREFIX}-$1'].Value" --output text)"
  [ -n "${value}" ] && [ "${value}" != 'None' ] ||
    die "export ${PREFIX}-$1 is missing; is its stack deployed?"
  echo "${value}"
}

stack_status() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query 'Stacks[0].StackStatus' --output text
}

# A deploy that CloudFormation rolled back still returns 0 from the CLI in some
# paths; the stack status is the one source of truth.
assert_stack_complete() {
  local status
  status="$(stack_status "$1")"
  case "${status}" in
    *ROLLBACK*) die "$1 is ${status}: the change was rolled back; read the stack events" ;;
    *_COMPLETE) note "$1 is ${status}" ;;
    *) die "$1 is ${status}, not a completed state" ;;
  esac
}

# The params file plus any Key=Value overrides, as one JSON list in a temp file
# (an override replaces the file's value of the same key). Prints the path.
merged_params() {
  local file="$1" out
  shift
  out="$(temp_file params)"
  node -e '
    const [file, out, ...overrides] = process.argv.slice(1);
    const fs = require("fs");
    const listed = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
    const byKey = new Map(listed.map((row) => [row.ParameterKey, row.ParameterValue]));
    for (const pair of overrides) {
      const at = pair.indexOf("=");
      if (at < 1) throw new Error(`override "${pair}" is not Key=Value`);
      byKey.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const rows = [...byKey].map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue }));
    fs.writeFileSync(out, JSON.stringify(rows));
  ' "${file}" "${out}" "$@"
  echo "${out}"
}

# The value of one Key among Key=Value arguments, or nothing.
override_value() {
  local key="$1" pair
  shift
  for pair in "$@"; do
    case "${pair}" in "${key}="*) echo "${pair#*=}" ;; esac
  done
}

# Whether a task definition's first image carries the given tag.
task_definition_has_tag() {
  local image
  image="$(aws ecs describe-task-definition --task-definition "$1" \
    --query 'taskDefinition.containerDefinitions[0].image' --output text)"
  [ "${image##*:}" = "$2" ]
}

# Waits until the service's PRIMARY deployment reaches COMPLETED and runs the
# expected tag (empty = any). A service at desiredCount 0 cannot roll anything
# out, so there the registered task definition's tag is the evidence instead.
wait_for_rollout() {
  local cluster="$1" service="$2" tag="$3" poll desired state definition
  for poll in $(seq 1 "${ROLLOUT_POLLS}"); do
    read -r desired state definition <<< "$(aws ecs describe-services \
      --cluster "${cluster}" --services "${service}" \
      --query "services[0].[desiredCount, deployments[?status=='PRIMARY'] | [0].rolloutState, deployments[?status=='PRIMARY'] | [0].taskDefinition]" \
      --output text)"
    if [ -n "${tag}" ] && ! task_definition_has_tag "${definition}" "${tag}"; then
      die "the PRIMARY deployment runs ${definition##*/}, not the ${tag} revision"
    fi
    case "${desired}:${state}" in
      0:*)
        note "the service is asleep (desired 0); the ${definition##*/} revision is registered"
        return 0
        ;;
      *:COMPLETED)
        note "rollout of ${definition##*/} completed"
        return 0
        ;;
      *:FAILED) die "rollout of ${definition##*/} failed; the circuit breaker is rolling back" ;;
    esac
    note "rollout ${state:-pending} (${poll}/${ROLLOUT_POLLS})"
    sleep "${ROLLOUT_POLL_SECONDS}"
  done
  die 'the rollout did not complete in time'
}

# `wait tasks-stopped` gives up with 255 after its own limit (about ten
# minutes); a long migration simply needs the wait again.
wait_task_stopped() {
  local attempt rc
  for attempt in 1 2 3; do
    rc=0
    aws ecs wait tasks-stopped --cluster "$1" --tasks "$2" || rc=$?
    [ "${rc}" -eq 0 ] && return 0
    [ "${rc}" -eq 255 ] || die "wait tasks-stopped failed with ${rc}"
    note "still running after the wait's limit (attempt ${attempt} of 3)"
  done
  die 'the task did not stop in time'
}

running_task() {
  local arn
  arn="$(aws ecs list-tasks --cluster "$1" --service-name "$2" --desired-status RUNNING \
    --query 'taskArns[0]' --output text)"
  [ -n "${arn}" ] && [ "${arn}" != 'None' ] || die 'no running task; `aws.sh wake` first'
  echo "${arn}"
}

# The tasks of the session family ECS wants running — a schedule's or an
# operator's launch, provisioning ones too — one ARN per line, or nothing.
session_task_arns() {
  local arns
  arns="$(aws ecs list-tasks --cluster "$1" --family "${SESSION_FAMILY}" \
    --desired-status RUNNING --query 'taskArns' --output text)"
  [ -n "${arns}" ] && [ "${arns}" != 'None' ] || return 0
  echo "${arns}" | tr '\t' '\n'
}

# One line per task of the ARNs given (one per line): id, startedBy,
# startedAt, status. The ARN ends in the task id; the rest of the line is
# what the operator reads, and the id is what `session stop` takes.
describe_session_tasks() {
  local cluster="$1"
  local -a tasks
  read -ra tasks <<< "$(echo "$2" | tr '\n' ' ')"
  aws ecs describe-tasks --cluster "${cluster}" --tasks "${tasks[@]}" \
    --query 'tasks[].[taskArn, startedBy, startedAt, lastStatus]' --output text |
    sed -E 's#^[^[:space:]]*/##'
}

# How many of the service's tasks are short of STOPPED. After the service is
# told to want none, its tasks drain for up to their stop timeout with their
# connections open, so the ones ECS already lists as stopped-by-desire are
# described too, and counted until their last status says they are gone.
# ECS keeps a stopped task listed for about an hour, so an hour of
# crash-looping (the circuit breaker retrying) lists more than the hundred
# one `describe-tasks` takes: the ARNs are described a hundred at a time and
# the counts summed — every task, not the first hundred, because the list's
# order says nothing about which of them are still draining.
draining_tasks() {
  local cluster="$1" service="$2" arns from=0 live=0 batch
  local -a tasks
  arns="$( {
    aws ecs list-tasks --cluster "${cluster}" --service-name "${service}" \
      --desired-status RUNNING --query 'taskArns' --output text
    aws ecs list-tasks --cluster "${cluster}" --service-name "${service}" \
      --desired-status STOPPED --query 'taskArns' --output text
  } | tr '\t' '\n' | grep -v '^None$' | grep . || true)"
  if [ -z "${arns}" ]; then
    echo 0
    return 0
  fi
  read -ra tasks <<< "$(echo "${arns}" | tr '\n' ' ')"
  while [ "${from}" -lt "${#tasks[@]}" ]; do
    batch="$(aws ecs describe-tasks --cluster "${cluster}" \
      --tasks "${tasks[@]:${from}:${DESCRIBE_BATCH}}" \
      --query "length(tasks[?lastStatus!='STOPPED'])" --output text)"
    live=$((live + batch))
    from=$((from + DESCRIBE_BATCH))
  done
  echo "${live}"
}

# Waits until the service has no task left at all — what a restore needs, so
# that no draining task holds a connection the restore would wait on.
wait_service_drained() {
  local cluster="$1" service="$2" poll live
  for poll in $(seq 1 "${DRAIN_POLLS}"); do
    live="$(draining_tasks "${cluster}" "${service}")"
    if [ "${live}" = '0' ]; then
      note 'the service has no task left'
      return 0
    fi
    note "${live} task(s) still stopping (${poll}/${DRAIN_POLLS})"
    sleep "${DRAIN_POLL_SECONDS}"
  done
  die 'the service did not drain in time'
}

# The id of a task from its ARN, or the id itself when that is what was given.
task_id() { echo "${1##*/}"; }

# ISO-8601 UTC, N minutes ago; node because BSD and GNU `date` disagree.
minutes_ago() {
  node -e 'console.log(new Date(Date.now() - Number(process.argv[1]) * 60000).toISOString())' "$1"
}
