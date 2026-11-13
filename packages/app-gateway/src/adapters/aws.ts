import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import {
  DescribeServicesCommand,
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  UpdateServiceCommand,
  type ListTasksCommandInput,
  type Task,
} from '@aws-sdk/client-ecs';
import {
  GetParameterCommand,
  ParameterNotFound,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';

import type { CapacityProvider } from '../config';
import { NO_OBSERVATION, type IdleState, type InvocationMetrics, type JobActivity } from '../idle';
import type { TaskRunner } from '../job';
import type { Log } from '../log';
import type { ServiceControl } from '../wake';

/**
 * The AWS sides of the gateway's seams: the ECS service it wakes and stops,
 * the tasks it starts and looks up for a job and counts — and stops, over
 * the ceiling — for the idle check, the CloudWatch metric it reads its own
 * use from, and the SSM parameter the idle handler keeps its quiet
 * observation in. Each client takes its region and its endpoints from the
 * function's environment, as the SDK reads them.
 */
export function ecsServiceControl(
  client: ECSClient,
  cluster: string,
  service: string,
): ServiceControl {
  return {
    async desiredCount() {
      const described = await client.send(
        new DescribeServicesCommand({ cluster, services: [service] }),
      );
      return described.services?.[0]?.desiredCount;
    },
    async setDesiredCount(desiredCount) {
      await client.send(new UpdateServiceCommand({ cluster, service, desiredCount }));
    },
  };
}

/** Every page of one `ListTasks` filter, the ARNs together. */
async function listTasks(client: ECSClient, filter: ListTasksCommandInput): Promise<string[]> {
  const arns: string[] = [];
  let nextToken: string | undefined;
  do {
    const page = await client.send(new ListTasksCommand({ ...filter, nextToken }));
    arns.push(...(page.taskArns ?? []));
    nextToken = page.nextToken;
  } while (nextToken !== undefined);
  return arns;
}

/**
 * The family a task definition names — the family itself, `family:revision`
 * or a revision ARN — which is what `ListTasks` filters by; `RunTask` takes
 * the definition as given, and runs the family's latest active revision when
 * that is what it is given.
 */
function taskFamily(taskDefinition: string): string {
  return taskDefinition.slice(taskDefinition.lastIndexOf('/') + 1).replace(/:\d+$/, '');
}

/** Where a job's task runs: its definition and the container whose command the launch replaces, the network it joins, the capacity it is placed on. */
export interface TaskPlacement {
  cluster: string;
  taskDefinition: string;
  container: string;
  subnets: readonly string[];
  securityGroups: readonly string[];
  capacityProvider: CapacityProvider;
}

/**
 * One `RunTask` per job: a capacity provider strategy names where the task
 * is placed (a `launchType` beside it is refused by the API), a public
 * address because the subnets have no NAT and the session needs the
 * internet, the container's command replaced, ECS Exec on so an operator
 * can open a shell in a running session. ECS answers a task or a failure
 * with a reason; the reason is what the caller must see. The lookup before
 * it lists the family's tasks under the job's tag that ECS wants running,
 * which includes the ones still provisioning.
 */
export function ecsTaskRunner(client: ECSClient, placement: TaskPlacement): TaskRunner {
  const { cluster, taskDefinition, container, subnets, securityGroups, capacityProvider } =
    placement;
  const family = taskFamily(taskDefinition);
  return {
    running: (startedBy) =>
      listTasks(client, { cluster, family, startedBy, desiredStatus: 'RUNNING' }),
    async run({ command, startedBy }) {
      const started = await client.send(
        new RunTaskCommand({
          cluster,
          taskDefinition,
          count: 1,
          startedBy,
          enableExecuteCommand: true,
          capacityProviderStrategy: [{ capacityProvider, weight: 1 }],
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: [...subnets],
              securityGroups: [...securityGroups],
              assignPublicIp: 'ENABLED',
            },
          },
          overrides: { containerOverrides: [{ name: container, command: [...command] }] },
        }),
      );
      const [failure] = started.failures ?? [];
      if (failure !== undefined) {
        const detail = failure.detail === undefined ? '' : ` (${failure.detail})`;
        throw new Error(
          `run-task started nothing: ${failure.reason ?? 'no reason given'}${detail}`,
        );
      }
      const taskArn = started.tasks?.[0]?.taskArn;
      if (taskArn === undefined)
        throw new Error('run-task answered with neither a task nor a failure');
      return taskArn;
    },
  };
}

/** Where the idle check looks for jobs, and how long one may exist before it is stopped. */
export interface JobWatch {
  cluster: string;
  service: string;
  /** How many minutes after its creation a task that is not the service's own is stopped. */
  maxJobMinutes: number;
}

/** The most task ARNs one `DescribeTasks` takes. */
const DESCRIBE_BATCH = 100;

/**
 * The cluster's running tasks less the service's own, each list paged to
 * its end: a session or a migrate task in flight, which the idle check must
 * keep the service for. Each is then described, a hundred at a time, and one
 * created longer ago than the ceiling is stopped with the reason on the task
 * and counted as stopped, not running — `createdAt` is set when `RunTask`
 * accepted the task, before it even started, so a task stuck pulling its
 * image is bounded too. ECS not answering any of it is none, logged — the
 * idle check then keeps the service too.
 */
export function ecsJobActivity(
  client: ECSClient,
  { cluster, service, maxJobMinutes }: JobWatch,
  log: Log,
  now: () => number = Date.now,
): JobActivity {
  const describe = async (arns: readonly string[]): Promise<Task[]> => {
    const tasks: Task[] = [];
    for (let from = 0; from < arns.length; from += DESCRIBE_BATCH) {
      const page = await client.send(
        new DescribeTasksCommand({ cluster, tasks: [...arns.slice(from, from + DESCRIBE_BATCH)] }),
      );
      tasks.push(...(page.tasks ?? []));
    }
    return tasks;
  };
  const overCeiling = (task: Task): boolean => {
    const since = (task.createdAt ?? task.startedAt)?.getTime();
    return since !== undefined && now() - since > maxJobMinutes * 60_000;
  };
  const stop = async (task: Task): Promise<void> => {
    await client.send(
      new StopTaskCommand({
        cluster,
        task: task.taskArn,
        reason: `idle: over the ceiling of ${maxJobMinutes} minutes`,
      }),
    );
    log('job stopped over the ceiling', {
      taskArn: task.taskArn,
      startedBy: task.startedBy,
      createdAt: task.createdAt?.toISOString(),
      maxJobMinutes,
    });
  };
  return {
    async count() {
      try {
        const own = new Set(
          await listTasks(client, { cluster, serviceName: service, desiredStatus: 'RUNNING' }),
        );
        const jobs = (await listTasks(client, { cluster, desiredStatus: 'RUNNING' })).filter(
          (arn) => !own.has(arn),
        );
        if (jobs.length === 0) return { running: 0, stopped: 0 };
        const stale = (await describe(jobs)).filter(overCeiling);
        for (const task of stale) await stop(task);
        // A task listed but not described still counts as running: a wrong keep costs one interval.
        return { running: jobs.length - stale.length, stopped: stale.length };
      } catch (error) {
        log('tasks could not be counted', { error: String(error) });
        return undefined;
      }
    },
  };
}

/** The sum of the function's `Invocations` over the window, per minute, as CloudWatch keeps it. */
export function lambdaInvocationMetrics(
  client: CloudWatchClient,
  functionName: string,
  now: () => number = Date.now,
): InvocationMetrics {
  return {
    async invocationsSince(windowMinutes) {
      const end = now();
      const read = await client.send(
        new GetMetricDataCommand({
          StartTime: new Date(end - windowMinutes * 60_000),
          EndTime: new Date(end),
          MetricDataQueries: [
            {
              Id: 'invocations',
              MetricStat: {
                Metric: {
                  Namespace: 'AWS/Lambda',
                  MetricName: 'Invocations',
                  Dimensions: [{ Name: 'FunctionName', Value: functionName }],
                },
                Period: 60,
                Stat: 'Sum',
              },
            },
          ],
        }),
      );
      const values = read.MetricDataResults?.[0]?.Values ?? [];
      return values.reduce((sum, value) => sum + value, 0);
    },
  };
}

/**
 * One SSM String parameter as the idle state: read and overwritten, never
 * deleted — the stack declares it, so a clear writes `NO_OBSERVATION` back
 * (the value the stack created it with). A parameter that is not there reads
 * as none all the same.
 */
export function ssmIdleState(client: SSMClient, name: string): IdleState {
  const put = async (value: string): Promise<void> => {
    await client.send(
      new PutParameterCommand({ Name: name, Value: value, Type: 'String', Overwrite: true }),
    );
  };
  return {
    async read() {
      try {
        const read = await client.send(new GetParameterCommand({ Name: name }));
        return read.Parameter?.Value;
      } catch (error) {
        if (error instanceof ParameterNotFound) return undefined;
        throw error;
      }
    },
    write: put,
    clear: () => put(NO_OBSERVATION),
  };
}
