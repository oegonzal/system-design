import type { Criterion } from './criterion';

/**
 * Operating the studio on AWS (packages/app-gateway's job and idle handlers,
 * infra/aws/bin, the migrate image and packages/db's data import): a browser
 * session as a scheduled or operator-started task, one at a time per launch,
 * the app kept awake for it and no longer than its ceiling, and the laptop's
 * database carried over whole or not at all.
 */
export const CLOUD_OPS_CRITERIA: readonly Criterion[] = [
  {
    id: 'OPS-1',
    statement:
      'A launch runs as one task after the service is told to wake: the job handler, invoked by a schedule or by an operator with {launch, args?}, tells the app service to want a task when it wants none, starts one task of the session definition — passed to RunTask as given, so a family runs its latest active revision — whose container runs the declared command template with every {launch} replaced by the launch’s name and the arguments appended, tagged job/<launch>, on a public address with ECS Exec on, and answers the launch and the task’s ARN — a service not found, ECS not answering or a task not started fails the invocation, logged.',
  },
  {
    id: 'OPS-2',
    statement:
      'An unknown launch is refused by name: the job handler refuses, before touching the service, an event that is not {launch, args?} — up to 32 arguments, each one printable word — naming the fault, and a launch outside the declared list, naming the launches it knows.',
  },
  {
    id: 'OPS-3',
    statement:
      'A running job keeps the service awake: once two quiet observations are on record, the idle check counts the cluster’s running tasks that are not the service’s own — reading every page of both lists — before it asks the loop, keeps the service and the observation while any runs or while they could not be counted, and stops it only when there is none and the loop reports no run.',
  },
  {
    id: 'OPS-4',
    statement:
      'A dump restores minus the entries Aurora refuses, whole or not at all: the data import lists the archive’s table of contents, drops every COMMENT ON EXTENSION and CREATE EXTENSION entry, naming each, and runs pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error over the remaining entries against the database the DB_* variables name — one transaction, so a restore that fails leaves the database as it was — with the password and the TLS settings passed through libpq’s own variables and no shell between; its exit code is the task’s.',
  },
  {
    id: 'OPS-5',
    statement:
      'A second task of a launch is refused: before the service is touched, the job handler lists the session family’s tasks tagged job/<launch> that ECS wants running — provisioning and pending ones too, every page — and refuses, naming the task’s ARN, while one exists; a listing that cannot be made fails the invocation with nothing run. A retried, repeated or operator-overlapped invocation therefore starts nothing, where the engine’s lease, written minutes into a run, would have let a second task through.',
  },
  {
    id: 'OPS-6',
    statement:
      'A job over the ceiling is stopped, not kept: the idle check describes the cluster’s running tasks that are not the service’s own, a hundred per call, stops every one created more than GATEWAY_IDLE_JOB_MAX_MINUTES (a whole number of minutes, 240 unless set) ago with the reason "idle: over the ceiling of N minutes", logged, and counts the rest as running, carrying both counts in its summary (runningJobs, stoppedJobs) — so a session that hangs past the engine’s rails cannot keep the stack awake for good; a stop that fails keeps the service, logged.',
  },
];
