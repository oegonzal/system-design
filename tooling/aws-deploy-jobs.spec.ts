import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INFRA, LAUNCH_PLACEHOLDER, launchFile, readApps } from './aws-deploy/apps';
import {
  containersNamed,
  environmentValue,
  exportedResource,
  parameterDefault,
  read,
  resourcesOfType,
  templates,
} from './aws-deploy/templates';
import {
  blockOf,
  fieldOf,
  keysOf,
  scalarOf,
  scalarOrSub,
  sequenceItems,
  sequenceOf,
  yamlLines,
  type YamlLine,
} from './aws-deploy/yaml-lines';

/**
 * A browser session in the cloud is one declaration too. infra/aws/apps.json's
 * `jobs` names the playwright image, the command template and the launches
 * with their schedules; the platform stack carries the session task
 * definition, which reaches the app task's services by their Cloud Map name
 * on the ports the declaration gives them; the app stack carries one schedule
 * per launch and the job function whose command template and launch list are
 * the declaration's. These specs hold the three to each other, and the launch
 * files the browser-session package reads to the names the schedules fire,
 * so a schedule can never name a launch that does not exist and a launch can
 * never run on a command the manual run would not. One more holds the
 * stacks apart: no stack imports a task-definition revision, whose ARN
 * changes with every tag and would freeze the stack that exports it.
 */
const APP_TEMPLATE = join(INFRA, 'app.yaml');
const NETWORK_TEMPLATE = join(INFRA, 'network.yaml');

/** The handler of the gateway bundle that runs a launch. */
const JOB_HANDLER = 'main.job';
/** The channel the bundled Chromium is; Google Chrome has no Linux arm64 build, so the cloud image carries Chromium. */
const CLOUD_BROWSER_CHANNEL = 'chromium';
/** What a session names each service it calls by, and which image answers: browser-session's own variables. */
const SESSION_PEERS = {
  QUALITY_LOOP_URL: 'quality-loop',
  NOTIFICATIONS_URL: 'notifications',
  AGENTIC_SYSTEM_URL: 'agentic-system',
} as const;
/** The advisors a session asks, as `<id>=<url>` entries; the id is the lane's advisor id, which is its image name. */
const ADVISOR_PEERS = { UNIT_ADVISOR_URLS: 'job-application' } as const;
/** The app task by its Cloud Map name, as a `!Sub` over the namespace export: `http://app.${Namespace}:<port>`. */
const PEER_URL = /^http:\/\/app\.\$\{\w+\}:(\d+)$/;
/** Every `!ImportValue '<export>'` a template writes. */
const IMPORTED = /!ImportValue '([^']+)'/g;
/** An output's value that is a resource reference: `!Ref <logical name>`. */
const REFERENCE = /^!Ref (\w+)$/;

/** The one container named after an image, or a failure naming the image. */
function containerNamed(name: string): YamlLine[] {
  const found = containersNamed(name);
  expect(found.length, `${name} has one container definition`).toBe(1);
  return found[0] as YamlLine[];
}

/** A template's exports: each export name with the value written for it (`!Ref X`, `!GetAtt X.Y`, or a `!Sub` unwrapped to its template string). */
function exportsOf(source: string): { name: string; value: string }[] {
  const outputs = blockOf(yamlLines(source), 'Outputs') ?? [];
  return keysOf(outputs).flatMap((key) => {
    const output = blockOf(outputs, key) ?? [];
    const name = scalarOf(blockOf(output, 'Export') ?? [], 'Name');
    const value = scalarOrSub(output, 'Value');
    return name === undefined || value === undefined ? [] : [{ name, value }];
  });
}

/** The task definition, of any template, whose containers include the one named; undefined when none does. */
function taskDefinitionOf(sources: readonly string[], container: string) {
  return sources
    .flatMap((source) => resourcesOfType(source, 'AWS::ECS::TaskDefinition'))
    .find(({ properties }) =>
      sequenceItems(blockOf(properties, 'ContainerDefinitions') ?? []).some(
        (item) => scalarOf(item, 'Name') === container,
      ),
    );
}

/** The `[from, to]` port ranges every security group of the network stack admits from one group, by its logical name. */
function portsAdmittedFrom(network: string, group: string): [number, number][] {
  return resourcesOfType(network, 'AWS::EC2::SecurityGroup').flatMap(({ properties }) =>
    sequenceItems(blockOf(properties, 'SecurityGroupIngress') ?? []).flatMap(
      (rule): [number, number][] =>
        fieldOf(rule, 'SourceSecurityGroupId') === `!Ref ${group}`
          ? [[Number(fieldOf(rule, 'FromPort')), Number(fieldOf(rule, 'ToPort'))]]
          : [],
    ),
  );
}

describe('a browser session in the cloud is declared once', () => {
  const apps = readApps();
  const jobs = Object.entries(apps.jobs ?? {});
  const app = read(APP_TEMPLATE);
  const network = read(NETWORK_TEMPLATE);
  const jobFunctions = resourcesOfType(app, 'AWS::Lambda::Function').filter(
    ({ properties }) => scalarOf(properties, 'Handler') === JOB_HANDLER,
  );
  const variables =
    blockOf(blockOf(jobFunctions[0]?.properties ?? [], 'Environment') ?? [], 'Variables') ?? [];

  it('[CLOUD-2] the session task reaches the app task’s services by name on their declared ports, each admitted from the session group, and runs the bundled Chromium', () => {
    expect(jobs.length, 'no job declared').toBeGreaterThan(0);
    // The group the job function runs a session task in, through the export the app stack imports.
    const imported = /^!ImportValue '([^']+)'$/.exec(
      scalarOrSub(variables, 'GATEWAY_JOB_SECURITY_GROUP') ?? '',
    )?.[1];
    const group = exportedResource(network, imported ?? '');
    expect(group, 'the job function names the session group by export').toBeDefined();
    const admitted = portsAdmittedFrom(network, group ?? '');
    const open = (port: number): boolean =>
      admitted.some(([from, to]) => from <= port && port <= to);

    for (const [, job] of jobs) {
      const container = containerNamed(job.image);
      expect(environmentValue(container, 'BROWSER_CHANNEL')).toBe(CLOUD_BROWSER_CHANNEL);
      const peers = [
        ...Object.entries(SESSION_PEERS).map(([variable, image]) => ({
          variable,
          image,
          url: environmentValue(container, variable) ?? '',
        })),
        ...Object.entries(ADVISOR_PEERS).map(([variable, image]) => {
          const [id = '', url = ''] = (environmentValue(container, variable) ?? '').split('=');
          expect(id, `${variable} names the advisor by its id`).toBe(image);
          return { variable, image, url };
        }),
      ];
      for (const { variable, image, url } of peers) {
        const port = Number(PEER_URL.exec(url)?.[1]);
        expect(port, `${variable} names app.<namespace> and ${image}'s port`).toBe(
          apps.images[image]?.port,
        );
        expect(open(port), `${image}'s port ${port} is admitted from the session group`).toBe(true);
      }
    }
  });

  it('[CLOUD-5] a scheduled job is declared once: a playwright image, a launch file per launch, one schedule per launch with its expression and input, and the job function’s template and launch list', () => {
    expect(jobs.length, 'no job declared').toBeGreaterThan(0);
    expect(
      jobFunctions.map(({ name }) => name),
      'one function runs the job handler',
    ).toHaveLength(1);
    const [jobFunction] = jobFunctions;
    const schedules = resourcesOfType(app, 'AWS::Scheduler::Schedule').flatMap(({ properties }) => {
      const target = blockOf(properties, 'Target') ?? [];
      const input = scalarOf(target, 'Input');
      if (input === undefined) return [];
      const parsed = JSON.parse(input) as { launch?: string };
      if (parsed.launch === undefined) return [];
      return [
        {
          launch: parsed.launch,
          input: parsed,
          expression: scalarOf(properties, 'ScheduleExpression'),
          timezone: scalarOf(properties, 'ScheduleExpressionTimezone'),
          state: scalarOrSub(properties, 'State'),
          target: scalarOf(target, 'Arn'),
        },
      ];
    });
    expect(
      schedules.filter(({ launch }) => !jobs.some(([, job]) => launch in job.launches)),
      'a schedule for a launch no job declares',
    ).toEqual([]);

    for (const [name, job] of jobs) {
      expect(apps.images[job.image]?.kind, `${name}'s image is a playwright image`).toBe(
        'playwright',
      );
      expect(
        job.command.filter((word) => word === LAUNCH_PLACEHOLDER),
        `${name}'s command names the launch once`,
      ).toHaveLength(1);
      const launches = Object.keys(job.launches);
      expect(launches.length, `${name} declares a launch`).toBeGreaterThan(0);
      expect(
        launches.filter((launch) => !existsSync(launchFile(job.image, launch))),
        `a launch with no file under packages/${job.image}/launches/`,
      ).toEqual([]);

      const own = schedules.filter(({ launch }) => launch in job.launches);
      expect(own.map(({ launch }) => launch).sort()).toEqual([...launches].sort());
      for (const schedule of own) {
        expect(schedule.expression).toBe(job.launches[schedule.launch]?.schedule);
        expect(schedule.timezone, 'the expressions are written in UTC').toBe('UTC');
        expect(schedule.input).toEqual({ launch: schedule.launch });
        expect(schedule.target).toBe(`!GetAtt ${jobFunction?.name ?? ''}.Arn`);
        // Nothing runs unattended until the owner flips the parameter.
        const parameter = /^!Ref (\w+)$/.exec(schedule.state ?? '')?.[1] ?? '';
        expect(
          parameterDefault(app, parameter),
          `${schedule.launch}'s state is a parameter that defaults to DISABLED`,
        ).toBe('DISABLED');
      }

      expect(scalarOrSub(variables, 'GATEWAY_JOB_COMMAND')).toBe(JSON.stringify(job.command));
      expect(scalarOrSub(variables, 'GATEWAY_JOB_LAUNCHES')).toBe(launches.join(','));
      expect(scalarOrSub(variables, 'GATEWAY_JOB_CONTAINER')).toBe(job.image);

      // The job function supplies the command, and the container logs under
      // its own name — the stream `aws.sh session logs` tails.
      const container = containerNamed(job.image);
      expect(sequenceOf(container, 'Command'), 'the task definition carries no command').toBe(
        undefined,
      );
      const options = blockOf(blockOf(container, 'LogConfiguration') ?? [], 'Options') ?? [];
      expect(scalarOf(options, 'awslogs-stream-prefix')).toBe(job.image);
    }
  });

  it('[CLOUD-6] a cross-stack import never names a task-definition revision: no !ImportValue reads an export whose value is a !Ref of an AWS::ECS::TaskDefinition, and the job function runs the session task by its family', () => {
    const files = templates();
    const sources = files.map(read);
    // An export another stack imports cannot change, and a task definition's
    // ARN changes with every ImageTag: the platform stack could never be
    // updated again once the app stack imported one. The migrate task's
    // revision stays exported because aws.sh reads it, and nothing imports it.
    const revisionExports = sources.flatMap((source) => {
      const definitions = new Set(
        resourcesOfType(source, 'AWS::ECS::TaskDefinition').map(({ name }) => name),
      );
      return exportsOf(source).flatMap(({ name, value }) =>
        definitions.has(REFERENCE.exec(value)?.[1] ?? '') ? [name] : [],
      );
    });
    expect(revisionExports, 'no task-definition export read').not.toEqual([]);
    const imports = files.flatMap((file, index) =>
      [...(sources[index] ?? '').matchAll(IMPORTED)].map(([, name]) => ({
        template: basename(file),
        export: name ?? '',
      })),
    );
    expect(imports.length, 'no import read').toBeGreaterThan(0);
    expect(
      imports.filter(({ export: name }) => revisionExports.includes(name)),
      'an import of a task-definition revision; export and import the family instead',
    ).toEqual([]);

    // The family the job function names is the session task definition's own,
    // through an export whose value is that family.
    const exported = new Map(
      sources.flatMap((source) => exportsOf(source).map(({ name, value }) => [name, value])),
    );
    const imported = /^!ImportValue '([^']+)'$/.exec(
      scalarOrSub(variables, 'GATEWAY_JOB_TASK_DEFINITION') ?? '',
    )?.[1];
    expect(imported, 'the job function imports its task definition by export').toBeDefined();
    for (const [, job] of jobs) {
      const definition = taskDefinitionOf(sources, job.image);
      expect(definition, `${job.image} has a task definition`).toBeDefined();
      expect(exported.get(imported ?? ''), `the export is ${job.image}'s family`).toBe(
        scalarOrSub(definition?.properties ?? [], 'Family'),
      );
    }
  });
});
