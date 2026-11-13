import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_GATEWAY_ENV,
  gatewayConfigFromEnv,
  GatewayConfigError,
  idleConfigFromEnv,
  jobConfigFromEnv,
} from './config';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry) ? [path] : [];
  });

const ROUTES = [
  { prefix: '/api', port: 3000, api: true },
  { prefix: '/loop', port: 3003, strip: true, api: true },
  { prefix: '/', port: 4200 },
];

/** The proxy's variables with no fallback, set to a value each. */
const GATEWAY = {
  GATEWAY_ROUTES: JSON.stringify(ROUTES),
  GATEWAY_UPSTREAM_HOST: 'app.sysdesign.internal',
  GATEWAY_ORIGIN_SECRET: 'origin-secret',
  GATEWAY_COGNITO_USER_POOL_ID: 'us-east-1_AbCdEf123',
  GATEWAY_COGNITO_CLIENT_ID: 'client-id',
  GATEWAY_ECS_CLUSTER: 'cluster',
  GATEWAY_ECS_SERVICE: 'service',
};

/** The idle handler's. */
const IDLE = {
  GATEWAY_ECS_CLUSTER: 'cluster',
  GATEWAY_ECS_SERVICE: 'service',
  GATEWAY_LOOP_URL: 'http://app.sysdesign.internal:3003',
  GATEWAY_PROXY_FUNCTION_NAME: 'gateway',
  GATEWAY_IDLE_STATE_PARAMETER: '/prefix/idle-state',
};

/** The job handler's: the command template as apps.json declares it, minified. */
const COMMAND = ['run', '--launch', '{launch}', '--headless', '--wait-for-loop', '8'];
const JOB = {
  GATEWAY_ECS_CLUSTER: 'cluster',
  GATEWAY_ECS_SERVICE: 'service',
  GATEWAY_JOB_TASK_DEFINITION: 'arn:aws:ecs:us-east-1:123456789012:task-definition/session:3',
  GATEWAY_JOB_CONTAINER: 'browser-session',
  GATEWAY_JOB_COMMAND: JSON.stringify(COMMAND),
  GATEWAY_JOB_LAUNCHES: 'linkedin,builtin',
  GATEWAY_JOB_SUBNETS: 'subnet-0a,subnet-0b',
  GATEWAY_JOB_SECURITY_GROUP: 'sg-0c',
};

describe('the gateway configuration', () => {
  it('declares its variables once, per handler, with their fallbacks, and reads them nowhere else', () => {
    expect(Object.values(APP_GATEWAY_ENV.gateway)).toEqual([
      { name: 'GATEWAY_ROUTES', fallback: undefined },
      { name: 'GATEWAY_UPSTREAM_HOST', fallback: undefined },
      { name: 'GATEWAY_ORIGIN_SECRET', fallback: undefined },
      { name: 'GATEWAY_COGNITO_USER_POOL_ID', fallback: undefined },
      { name: 'GATEWAY_COGNITO_CLIENT_ID', fallback: undefined },
      { name: 'GATEWAY_ECS_CLUSTER', fallback: undefined },
      { name: 'GATEWAY_ECS_SERVICE', fallback: undefined },
      { name: 'GATEWAY_DB_HOST', fallback: undefined },
      { name: 'GATEWAY_DB_PORT', fallback: '5432' },
      { name: 'GATEWAY_UPSTREAM_TIMEOUT_MS', fallback: '110000' },
      { name: 'GATEWAY_CONNECT_TIMEOUT_MS', fallback: '5000' },
    ]);
    expect(Object.values(APP_GATEWAY_ENV.idle)).toEqual([
      { name: 'GATEWAY_ECS_CLUSTER', fallback: undefined },
      { name: 'GATEWAY_ECS_SERVICE', fallback: undefined },
      { name: 'GATEWAY_LOOP_URL', fallback: undefined },
      { name: 'GATEWAY_IDLE_MINUTES', fallback: '15' },
      { name: 'GATEWAY_PROXY_FUNCTION_NAME', fallback: undefined },
      { name: 'GATEWAY_IDLE_STATE_PARAMETER', fallback: undefined },
      { name: 'GATEWAY_IDLE_CONFIRM_MINUTES', fallback: '5' },
      { name: 'GATEWAY_IDLE_JOB_MAX_MINUTES', fallback: '240' },
    ]);
    expect(Object.values(APP_GATEWAY_ENV.job)).toEqual([
      { name: 'GATEWAY_ECS_CLUSTER', fallback: undefined },
      { name: 'GATEWAY_ECS_SERVICE', fallback: undefined },
      { name: 'GATEWAY_JOB_TASK_DEFINITION', fallback: undefined },
      { name: 'GATEWAY_JOB_CONTAINER', fallback: undefined },
      { name: 'GATEWAY_JOB_COMMAND', fallback: undefined },
      { name: 'GATEWAY_JOB_LAUNCHES', fallback: undefined },
      { name: 'GATEWAY_JOB_SUBNETS', fallback: undefined },
      { name: 'GATEWAY_JOB_SECURITY_GROUP', fallback: undefined },
      { name: 'GATEWAY_JOB_CAPACITY_PROVIDER', fallback: 'FARGATE' },
    ]);
    expect(Object.keys(APP_GATEWAY_ENV)).toEqual(['gateway', 'idle', 'job']);

    const readers = sources(__dirname)
      .filter((path) => readFileSync(path, 'utf8').includes('process.env'))
      .map((path) => path.slice(__dirname.length + 1));
    expect(readers).toEqual(['config.ts']);
  });

  it('reads a complete proxy environment, taking each fallback where a variable is unset', () => {
    expect(gatewayConfigFromEnv(GATEWAY)).toEqual({
      routes: ROUTES,
      upstreamHost: 'app.sysdesign.internal',
      originSecret: 'origin-secret',
      cognito: { region: 'us-east-1', userPoolId: 'us-east-1_AbCdEf123', clientId: 'client-id' },
      ecsCluster: 'cluster',
      ecsService: 'service',
      database: undefined,
      upstreamTimeoutMs: 110_000,
      connectTimeoutMs: 5_000,
    });
  });

  it('reads the optional values when set, trimmed, and a blank as unset', () => {
    const config = gatewayConfigFromEnv({
      ...GATEWAY,
      GATEWAY_UPSTREAM_HOST: ' app.internal ',
      GATEWAY_COGNITO_USER_POOL_ID: 'eu-west-2_Pool',
      GATEWAY_DB_HOST: 'db.internal',
      GATEWAY_DB_PORT: '5433',
      GATEWAY_UPSTREAM_TIMEOUT_MS: '   ',
      GATEWAY_CONNECT_TIMEOUT_MS: '2000',
    });
    expect(config).toMatchObject({
      upstreamHost: 'app.internal',
      cognito: { region: 'eu-west-2', userPoolId: 'eu-west-2_Pool' },
      database: { host: 'db.internal', port: 5433 },
      upstreamTimeoutMs: 110_000,
      connectTimeoutMs: 2_000,
    });
  });

  it.each([
    [
      'a required variable unset',
      { GATEWAY_ORIGIN_SECRET: '' },
      'GATEWAY_ORIGIN_SECRET must be set',
    ],
    [
      'an upstream host unset, which has no fallback',
      { GATEWAY_UPSTREAM_HOST: '' },
      'GATEWAY_UPSTREAM_HOST must be set',
    ],
    ['routes that are not JSON', { GATEWAY_ROUTES: '[not json' }, 'GATEWAY_ROUTES must be JSON'],
    [
      'a route with a trailing slash',
      { GATEWAY_ROUTES: '[{"prefix":"/api/","port":3000}]' },
      'GATEWAY_ROUTES is not a list of routes: 0.prefix: a prefix starts with "/" and does not end with one',
    ],
    [
      'a prefix the gateway keeps for itself',
      { GATEWAY_ROUTES: '[{"prefix":"/auth/login","port":3000},{"prefix":"/","port":4200}]' },
      'GATEWAY_ROUTES declares /auth/login, which the gateway keeps for itself',
    ],
    [
      'a pool id that does not carry its region',
      { GATEWAY_COGNITO_USER_POOL_ID: 'pool' },
      'GATEWAY_COGNITO_USER_POOL_ID must be <region>_<id>, got "pool"',
    ],
    [
      'a pool id with nothing after the region',
      { GATEWAY_COGNITO_USER_POOL_ID: 'us-east-1_' },
      'GATEWAY_COGNITO_USER_POOL_ID must be <region>_<id>, got "us-east-1_"',
    ],
    [
      'a database port that is not one',
      { GATEWAY_DB_HOST: 'db.internal', GATEWAY_DB_PORT: '70000' },
      'GATEWAY_DB_PORT must be a port number, got "70000"',
    ],
    [
      'a connect budget that is not a count of milliseconds',
      { GATEWAY_CONNECT_TIMEOUT_MS: '0' },
      'GATEWAY_CONNECT_TIMEOUT_MS must be a positive integer, got "0"',
    ],
  ])('refuses %s by name', (_case, env, message) => {
    expect(() => gatewayConfigFromEnv({ ...GATEWAY, ...env })).toThrow(
      new GatewayConfigError(message),
    );
  });

  it('[OPS-6] reads the idle handler its own environment, with its three fallbacks', () => {
    expect(idleConfigFromEnv(IDLE)).toEqual({
      ecsCluster: 'cluster',
      ecsService: 'service',
      loopUrl: 'http://app.sysdesign.internal:3003',
      idleMinutes: 15,
      proxyFunctionName: 'gateway',
      idleStateParameter: '/prefix/idle-state',
      idleConfirmMinutes: 5,
      idleJobMaxMinutes: 240,
    });
    expect(
      idleConfigFromEnv({
        ...IDLE,
        GATEWAY_LOOP_URL: 'http://app.internal:3003/',
        GATEWAY_IDLE_MINUTES: '30',
        GATEWAY_IDLE_CONFIRM_MINUTES: '10',
        GATEWAY_IDLE_JOB_MAX_MINUTES: '180',
      }),
    ).toMatchObject({
      loopUrl: 'http://app.internal:3003',
      idleMinutes: 30,
      idleConfirmMinutes: 10,
      idleJobMaxMinutes: 180,
    });
  });

  it.each([
    [
      'the loop URL unset, which has no fallback',
      { GATEWAY_LOOP_URL: '' },
      'GATEWAY_LOOP_URL must be set',
    ],
    [
      'a loop URL that is not one',
      { GATEWAY_LOOP_URL: 'app.internal:3003' },
      'GATEWAY_LOOP_URL must be an http(s) URL, got "app.internal:3003"',
    ],
    [
      'a window that is not a count of minutes',
      { GATEWAY_IDLE_MINUTES: '0' },
      'GATEWAY_IDLE_MINUTES must be a positive integer, got "0"',
    ],
    [
      'the state parameter unset',
      { GATEWAY_IDLE_STATE_PARAMETER: '' },
      'GATEWAY_IDLE_STATE_PARAMETER must be set',
    ],
    [
      'a job ceiling that is not a whole number of minutes',
      { GATEWAY_IDLE_JOB_MAX_MINUTES: '1.5' },
      'GATEWAY_IDLE_JOB_MAX_MINUTES must be a positive integer, got "1.5"',
    ],
    [
      'a job ceiling of no minutes',
      { GATEWAY_IDLE_JOB_MAX_MINUTES: '0' },
      'GATEWAY_IDLE_JOB_MAX_MINUTES must be a positive integer, got "0"',
    ],
  ])('refuses the idle handler %s by name', (_case, env, message) => {
    expect(() => idleConfigFromEnv({ ...IDLE, ...env })).toThrow(new GatewayConfigError(message));
  });

  it('reads the job handler its own environment: the lists split, the command parsed, the capacity by fallback', () => {
    expect(jobConfigFromEnv(JOB)).toEqual({
      ecsCluster: 'cluster',
      ecsService: 'service',
      taskDefinition: 'arn:aws:ecs:us-east-1:123456789012:task-definition/session:3',
      container: 'browser-session',
      command: COMMAND,
      launches: ['linkedin', 'builtin'],
      subnets: ['subnet-0a', 'subnet-0b'],
      securityGroups: ['sg-0c'],
      capacityProvider: 'FARGATE',
    });
    expect(
      jobConfigFromEnv({
        ...JOB,
        GATEWAY_JOB_LAUNCHES: ' linkedin , builtin ',
        GATEWAY_JOB_CAPACITY_PROVIDER: 'FARGATE_SPOT',
      }),
    ).toMatchObject({ launches: ['linkedin', 'builtin'], capacityProvider: 'FARGATE_SPOT' });
  });

  it.each([
    [
      'the task definition unset',
      { GATEWAY_JOB_TASK_DEFINITION: '' },
      'GATEWAY_JOB_TASK_DEFINITION must be set',
    ],
    [
      'a command that is not JSON',
      { GATEWAY_JOB_COMMAND: 'run --launch {launch}' },
      'GATEWAY_JOB_COMMAND must be JSON',
    ],
    [
      'a command that is not a list of words',
      { GATEWAY_JOB_COMMAND: '["run", 8]' },
      'GATEWAY_JOB_COMMAND must be a JSON array of words, got ["run", 8]',
    ],
    [
      'a command with no place for the launch',
      { GATEWAY_JOB_COMMAND: '["run","--headless"]' },
      'GATEWAY_JOB_COMMAND must carry {launch} in some word, got ["run","--headless"]',
    ],
    [
      'a launch list with a blank entry',
      { GATEWAY_JOB_LAUNCHES: 'linkedin,,builtin' },
      'GATEWAY_JOB_LAUNCHES must be a comma-separated list of names, got "linkedin,,builtin"',
    ],
    [
      'a launch declared twice',
      { GATEWAY_JOB_LAUNCHES: 'linkedin,builtin,linkedin' },
      'GATEWAY_JOB_LAUNCHES names linkedin twice',
    ],
    [
      'a subnet list with a space in a name',
      { GATEWAY_JOB_SUBNETS: 'subnet-0a subnet-0b' },
      'GATEWAY_JOB_SUBNETS must be a comma-separated list of names, got "subnet-0a subnet-0b"',
    ],
    [
      'a capacity provider Fargate does not offer',
      { GATEWAY_JOB_CAPACITY_PROVIDER: 'EC2' },
      'GATEWAY_JOB_CAPACITY_PROVIDER must be FARGATE or FARGATE_SPOT, got "EC2"',
    ],
  ])('refuses the job handler %s by name', (_case, env, message) => {
    expect(() => jobConfigFromEnv({ ...JOB, ...env })).toThrow(new GatewayConfigError(message));
  });

  it('holds each handler to its own variables: none reads another’s', () => {
    expect(() => gatewayConfigFromEnv({ ...GATEWAY, GATEWAY_LOOP_URL: '' })).not.toThrow();
    expect(() => idleConfigFromEnv({ ...IDLE, GATEWAY_ROUTES: '' })).not.toThrow();
    expect(() =>
      jobConfigFromEnv({ ...JOB, GATEWAY_LOOP_URL: '', GATEWAY_ROUTES: '' }),
    ).not.toThrow();
  });
});
