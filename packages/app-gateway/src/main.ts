import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { ECSClient } from '@aws-sdk/client-ecs';
import { SSMClient } from '@aws-sdk/client-ssm';

import {
  ecsJobActivity,
  ecsServiceControl,
  ecsTaskRunner,
  lambdaInvocationMetrics,
  ssmIdleState,
} from './adapters/aws';
import { databaseTouch, httpUpstream, loopActivity } from './adapters/network';
import { cognitoAuthenticator, cognitoClient, cognitoTokenVerifier, createSession } from './auth';
import { gatewayConfigFromEnv, idleConfigFromEnv, jobConfigFromEnv } from './config';
import type { GatewayEvent, GatewayResult } from './http';
import { createIdleHandler, type IdleHandler, type IdleSummary } from './idle';
import { createJobHandler, type JobHandler, type JobStarted } from './job';
import { consoleLog } from './log';
import { createProxyHandler, type ProxyHandler } from './proxy';
import { createWake } from './wake';

/**
 * The gateway's three Lambda handlers, wired from the modules with the real
 * adapters: `proxy` behind the function URL, `idle` on the schedule, `job`
 * behind the launch schedules and `aws.sh session run`. Each is wired on its
 * first invocation and kept for the container's life, so a configuration
 * the environment refuses fails that invocation by name and the module
 * itself always loads.
 */
function wireProxy(): ProxyHandler {
  const config = gatewayConfigFromEnv();
  const log = consoleLog;
  const cognito = cognitoClient(config.cognito.region);
  const session = createSession({
    verifier: cognitoTokenVerifier(config.cognito),
    authenticator: cognitoAuthenticator(
      (command) => cognito.send(command),
      config.cognito.clientId,
      log,
    ),
  });
  const wake = createWake({
    service: ecsServiceControl(new ECSClient({}), config.ecsCluster, config.ecsService),
    database:
      config.database === undefined
        ? undefined
        : databaseTouch(config.database.host, config.database.port, log),
    log,
  });
  return createProxyHandler({ config, session, upstream: httpUpstream(), wake, log });
}

function wireIdle(): IdleHandler {
  const config = idleConfigFromEnv();
  const log = consoleLog;
  const ecs = new ECSClient({});
  return createIdleHandler({
    metrics: lambdaInvocationMetrics(new CloudWatchClient({}), config.proxyFunctionName),
    service: ecsServiceControl(ecs, config.ecsCluster, config.ecsService),
    jobs: ecsJobActivity(
      ecs,
      {
        cluster: config.ecsCluster,
        service: config.ecsService,
        maxJobMinutes: config.idleJobMaxMinutes,
      },
      log,
    ),
    loop: loopActivity(config.loopUrl, log),
    state: ssmIdleState(new SSMClient({}), config.idleStateParameter),
    idleMinutes: config.idleMinutes,
    confirmMinutes: config.idleConfirmMinutes,
    log,
  });
}

function wireJob(): JobHandler {
  const config = jobConfigFromEnv();
  const log = consoleLog;
  const ecs = new ECSClient({});
  return createJobHandler({
    service: ecsServiceControl(ecs, config.ecsCluster, config.ecsService),
    tasks: ecsTaskRunner(ecs, {
      cluster: config.ecsCluster,
      taskDefinition: config.taskDefinition,
      container: config.container,
      subnets: config.subnets,
      securityGroups: config.securityGroups,
      capacityProvider: config.capacityProvider,
    }),
    launches: config.launches,
    command: config.command,
    log,
  });
}

let proxying: ProxyHandler | undefined;
let idling: IdleHandler | undefined;
let launching: JobHandler | undefined;

export const proxy = async (event: GatewayEvent): Promise<GatewayResult> =>
  (proxying ??= wireProxy())(event);

export const idle = async (): Promise<IdleSummary> => (idling ??= wireIdle())();

export const job = async (event: unknown): Promise<JobStarted> => (launching ??= wireJob())(event);
