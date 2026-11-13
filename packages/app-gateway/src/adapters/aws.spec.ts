import {
  DescribeTasksCommand,
  ListTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  type ECSClient,
  type ListTasksCommandInput,
  type Task,
} from '@aws-sdk/client-ecs';
import {
  GetParameterCommand,
  ParameterNotFound,
  PutParameterCommand,
  type SSMClient,
} from '@aws-sdk/client-ssm';

import { NO_OBSERVATION } from '../idle';
import { recordedLog } from '../testing';
import { ecsJobActivity, ecsTaskRunner, ssmIdleState, type TaskPlacement } from './aws';

/**
 * The idle state over a parameter store in memory: the SDK's commands are
 * read by kind and answered the way SSM answers them, a missing parameter
 * as `ParameterNotFound`.
 */
function parameterStore(initial?: string) {
  let value = initial;
  const commands: string[] = [];
  const client = {
    send: async (command: object) => {
      commands.push(command.constructor.name);
      if (command instanceof GetParameterCommand) {
        if (value === undefined) throw new ParameterNotFound({ message: 'no', $metadata: {} });
        return { Parameter: { Value: value } };
      }
      if (command instanceof PutParameterCommand) {
        expect(command.input).toMatchObject({ Type: 'String', Overwrite: true });
        value = command.input.Value;
        return {};
      }
      throw new Error(`unexpected ${command.constructor.name}`);
    },
  } as unknown as SSMClient;
  return { state: ssmIdleState(client, '/prefix/idle-state'), commands, value: () => value };
}

describe('the SSM idle state', () => {
  it('reads what was written, and a parameter that is not there as none', async () => {
    const { state, value } = parameterStore();
    expect(await state.read()).toBeUndefined();
    await state.write('2026-11-11T12:00:00.000Z');
    expect(value()).toBe('2026-11-11T12:00:00.000Z');
    expect(await state.read()).toBe('2026-11-11T12:00:00.000Z');
  });

  it('clears by writing the no-observation value back, never by deleting what the stack declares', async () => {
    const { state, commands, value } = parameterStore('2026-11-11T12:00:00.000Z');
    await state.clear();
    expect(value()).toBe(NO_OBSERVATION);
    await expect(state.clear()).resolves.toBeUndefined();
    expect(commands).toEqual(['PutParameterCommand', 'PutParameterCommand']);
  });

  it('lets any other failure through', async () => {
    const failing = {
      send: async () => Promise.reject(new Error('throttled')),
    } as unknown as SSMClient;
    const state = ssmIdleState(failing, '/prefix/idle-state');
    await expect(state.read()).rejects.toThrow('throttled');
    await expect(state.clear()).rejects.toThrow('throttled');
  });
});

const PLACEMENT: TaskPlacement = {
  cluster: 'cluster',
  taskDefinition: 'arn:aws:ecs:us-east-1:123456789012:task-definition/session:3',
  container: 'browser-session',
  subnets: ['subnet-0a', 'subnet-0b'],
  securityGroups: ['sg-0c'],
  capacityProvider: 'FARGATE',
};

const TASK = 'arn:aws:ecs:us-east-1:123456789012:task/cluster/0123456789abcdef';

/** An ECS that answers every `RunTask` the same way, keeping each request's input. */
function taskStarter(answer: object) {
  const inputs: object[] = [];
  const client = {
    send: async (command: object) => {
      if (!(command instanceof RunTaskCommand))
        throw new Error(`unexpected ${command.constructor.name}`);
      inputs.push(command.input);
      return answer;
    },
  } as unknown as ECSClient;
  return { runner: ecsTaskRunner(client, PLACEMENT), inputs };
}

describe('the ECS task runner', () => {
  it('[OPS-1] starts one task of the definition on the named capacity, on a public address in the network, with the container’s command replaced and ECS Exec on', async () => {
    const { runner, inputs } = taskStarter({ tasks: [{ taskArn: TASK }] });
    await expect(
      runner.run({ command: ['run', '--launch', 'linkedin'], startedBy: 'job/linkedin' }),
    ).resolves.toBe(TASK);
    expect(inputs).toEqual([
      {
        cluster: 'cluster',
        taskDefinition: PLACEMENT.taskDefinition,
        count: 1,
        startedBy: 'job/linkedin',
        enableExecuteCommand: true,
        capacityProviderStrategy: [{ capacityProvider: 'FARGATE', weight: 1 }],
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ['subnet-0a', 'subnet-0b'],
            securityGroups: ['sg-0c'],
            assignPublicIp: 'ENABLED',
          },
        },
        overrides: {
          containerOverrides: [
            { name: 'browser-session', command: ['run', '--launch', 'linkedin'] },
          ],
        },
      },
    ]);
    // A strategy and a launch type together are refused by the API.
    expect(inputs[0]).not.toHaveProperty('launchType');
  });

  it('[OPS-1] passes a task definition given as a family to RunTask unchanged, so ECS runs its latest active revision', async () => {
    const inputs: object[] = [];
    const client = {
      send: async (command: RunTaskCommand) => {
        inputs.push(command.input);
        return { tasks: [{ taskArn: TASK }] };
      },
    } as unknown as ECSClient;
    const runner = ecsTaskRunner(client, {
      ...PLACEMENT,
      taskDefinition: 'sysdesign-prod-platform-session',
    });
    await runner.run({ command: ['run'], startedBy: 'job/linkedin' });
    expect(inputs[0]).toMatchObject({ taskDefinition: 'sysdesign-prod-platform-session' });
  });

  it('throws the reason ECS gives when it started nothing, and names an answer with neither task nor failure', async () => {
    const refused = taskStarter({
      tasks: [],
      failures: [{ arn: PLACEMENT.taskDefinition, reason: 'RESOURCE:CPU', detail: 'no capacity' }],
    });
    await expect(refused.runner.run({ command: ['run'], startedBy: 'job/x' })).rejects.toThrow(
      'run-task started nothing: RESOURCE:CPU (no capacity)',
    );
    const empty = taskStarter({});
    await expect(empty.runner.run({ command: ['run'], startedBy: 'job/x' })).rejects.toThrow(
      'run-task answered with neither a task nor a failure',
    );
  });
});

/**
 * An ECS whose `ListTasks` answers from pages keyed by the filter's service
 * name, family or tag (`all` for a list with none), the next token being the
 * index of the next page, and which keeps every request's input. A described
 * task answers from `tasks` by ARN; every stop is recorded.
 */
function taskLister(pages: Record<string, string[][]>, tasks: Record<string, Task> = {}) {
  const inputs: ListTasksCommandInput[] = [];
  const described: string[][] = [];
  const stopped: { task?: string; reason?: string }[] = [];
  const client = {
    send: async (command: object) => {
      if (command instanceof DescribeTasksCommand) {
        const asked = command.input.tasks ?? [];
        described.push([...asked]);
        return { tasks: asked.flatMap((arn) => tasks[arn] ?? []) };
      }
      if (command instanceof StopTaskCommand) {
        stopped.push({ task: command.input.task, reason: command.input.reason });
        return { task: { taskArn: command.input.task, lastStatus: 'RUNNING' } };
      }
      if (!(command instanceof ListTasksCommand))
        throw new Error(`unexpected ${command.constructor.name}`);
      inputs.push(command.input);
      const key = command.input.startedBy ?? command.input.serviceName ?? 'all';
      const listed = pages[key] ?? [];
      const index = Number(command.input.nextToken ?? '0');
      return {
        taskArns: listed[index] ?? [],
        nextToken: index + 1 < listed.length ? String(index + 1) : undefined,
      };
    },
  } as unknown as ECSClient;
  const { log, lines } = recordedLog();
  return { client, inputs, described, stopped, log, lines };
}

const arn = (id: string) => `arn:aws:ecs:us-east-1:123456789012:task/cluster/${id}`;

describe('the ECS task lookup', () => {
  it('[OPS-5] lists the family’s tasks under the tag that ECS wants running, every page, the family taken from a revision ARN', async () => {
    const { client, inputs } = taskLister({
      'job/linkedin': [[arn('first')], [arn('second')]],
    });
    await expect(ecsTaskRunner(client, PLACEMENT).running('job/linkedin')).resolves.toEqual([
      arn('first'),
      arn('second'),
    ]);
    expect(inputs).toEqual([
      {
        cluster: 'cluster',
        family: 'session',
        startedBy: 'job/linkedin',
        desiredStatus: 'RUNNING',
        nextToken: undefined,
      },
      {
        cluster: 'cluster',
        family: 'session',
        startedBy: 'job/linkedin',
        desiredStatus: 'RUNNING',
        nextToken: '1',
      },
    ]);
  });

  it('[OPS-5] takes the family from a bare family or a family:revision as well, and answers none when nothing runs', async () => {
    for (const taskDefinition of [
      'sysdesign-prod-platform-session',
      'sysdesign-prod-platform-session:12',
    ]) {
      const { client, inputs } = taskLister({});
      const runner = ecsTaskRunner(client, { ...PLACEMENT, taskDefinition });
      await expect(runner.running('job/builtin')).resolves.toEqual([]);
      expect(inputs[0]).toMatchObject({ family: 'sysdesign-prod-platform-session' });
    }
  });

  it('lets a listing that fails through, for the handler to fail the invocation', async () => {
    const failing = {
      send: async () => Promise.reject(new Error('throttled')),
    } as unknown as ECSClient;
    await expect(ecsTaskRunner(failing, PLACEMENT).running('job/x')).rejects.toThrow('throttled');
  });
});

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const WATCH = { cluster: 'cluster', service: 'service', maxJobMinutes: 240 };
const minutesAgo = (minutes: number): Date => new Date(NOW - minutes * 60_000);

describe('the ECS job activity', () => {
  it('[OPS-3] counts the cluster’s running tasks that are not the service’s own, reading every page of both lists, and describes them', async () => {
    const { client, inputs, described, stopped, log } = taskLister(
      {
        all: [[arn('app'), arn('session')], [arn('migrate')]],
        service: [[arn('app')]],
      },
      {
        [arn('session')]: { taskArn: arn('session'), createdAt: minutesAgo(90) },
        [arn('migrate')]: { taskArn: arn('migrate'), createdAt: minutesAgo(3) },
      },
    );
    await expect(ecsJobActivity(client, WATCH, log, () => NOW).count()).resolves.toEqual({
      running: 2,
      stopped: 0,
    });
    expect(inputs).toEqual([
      {
        cluster: 'cluster',
        serviceName: 'service',
        desiredStatus: 'RUNNING',
        nextToken: undefined,
      },
      {
        cluster: 'cluster',
        serviceName: undefined,
        desiredStatus: 'RUNNING',
        nextToken: undefined,
      },
      { cluster: 'cluster', serviceName: undefined, desiredStatus: 'RUNNING', nextToken: '1' },
    ]);
    expect(described).toEqual([[arn('session'), arn('migrate')]]);
    expect(stopped).toEqual([]);
  });

  it('[OPS-6] stops a task created longer ago than the ceiling with the reason on it, logged, and counts it as stopped, not running', async () => {
    const { client, stopped, log, lines } = taskLister(
      {
        all: [[arn('app'), arn('stuck'), arn('fresh')]],
        service: [[arn('app')]],
      },
      {
        [arn('stuck')]: {
          taskArn: arn('stuck'),
          startedBy: 'job/linkedin',
          createdAt: minutesAgo(241),
          startedAt: minutesAgo(239),
        },
        [arn('fresh')]: { taskArn: arn('fresh'), createdAt: minutesAgo(240) },
      },
    );
    await expect(ecsJobActivity(client, WATCH, log, () => NOW).count()).resolves.toEqual({
      running: 1,
      stopped: 1,
    });
    expect(stopped).toEqual([
      { task: arn('stuck'), reason: 'idle: over the ceiling of 240 minutes' },
    ]);
    expect(lines).toEqual([
      {
        message: 'job stopped over the ceiling',
        detail: {
          taskArn: arn('stuck'),
          startedBy: 'job/linkedin',
          createdAt: minutesAgo(241).toISOString(),
          maxJobMinutes: 240,
        },
      },
    ]);
  });

  it('[OPS-6] describes the tasks a hundred at a time, and keeps one whose age ECS did not give', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => arn(`job-${index}`));
    const tasks = Object.fromEntries(
      ids.map((id, index) => [
        id,
        index === 0 ? { taskArn: id } : { taskArn: id, startedAt: minutesAgo(300) },
      ]),
    );
    const { client, described, stopped, log } = taskLister({ all: [ids] }, tasks);
    await expect(ecsJobActivity(client, WATCH, log, () => NOW).count()).resolves.toEqual({
      running: 1,
      stopped: 149,
    });
    expect(described.map((batch) => batch.length)).toEqual([100, 50]);
    expect(stopped).toHaveLength(149);
  });

  it('counts none, describing nothing, when only the service runs, or nothing does', async () => {
    const only = taskLister({ all: [[arn('app')]], service: [[arn('app')]] });
    await expect(ecsJobActivity(only.client, WATCH, only.log).count()).resolves.toEqual({
      running: 0,
      stopped: 0,
    });
    expect(only.described).toEqual([]);
    const none = taskLister({});
    await expect(ecsJobActivity(none.client, WATCH, none.log).count()).resolves.toEqual({
      running: 0,
      stopped: 0,
    });
  });

  it('answers none, logged, when ECS could not be asked — the listing, the describe or the stop', async () => {
    const { log, lines } = recordedLog();
    const failing = {
      send: async () => Promise.reject(new Error('throttled')),
    } as unknown as ECSClient;
    await expect(ecsJobActivity(failing, WATCH, log).count()).resolves.toBeUndefined();
    expect(lines).toEqual([
      { message: 'tasks could not be counted', detail: { error: 'Error: throttled' } },
    ]);

    const unstoppable = taskLister(
      { all: [[arn('stuck')]] },
      { [arn('stuck')]: { taskArn: arn('stuck'), createdAt: minutesAgo(500) } },
    );
    const client = {
      send: async (command: object) => {
        if (command instanceof StopTaskCommand) throw new Error('AccessDenied');
        return unstoppable.client.send(command as ListTasksCommand);
      },
    } as unknown as ECSClient;
    await expect(
      ecsJobActivity(client, WATCH, unstoppable.log, () => NOW).count(),
    ).resolves.toBeUndefined();
    expect(unstoppable.lines).toEqual([
      { message: 'tasks could not be counted', detail: { error: 'Error: AccessDenied' } },
    ]);
  });
});
