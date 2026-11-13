import { z } from 'zod';

import { LAUNCH_PLACEHOLDER } from './job';
import { AUTH_PREFIX, prefixCovers, ROUTES_SCHEMA, type Route } from './routes';

/**
 * The gateway's configuration, declared once. Every variable any handler
 * reads is named here as data with the value it takes when unset, and read by
 * one of the three functions below, which refuse by name anything they cannot
 * use — before a request is answered, never while one is. Nothing else in the
 * package reads the environment: `config.spec.ts` holds it to that.
 *
 * `proxy`, `idle` and `job` are three functions with three environments, so
 * the rows are declared per handler; the two every handler shares — the
 * service one wakes, another stops and the third wakes for a launch — are
 * declared once and named by all.
 */
type EnvRow = { readonly name: string; readonly fallback: string | undefined };

const ECS_ROWS = {
  ecsCluster: { name: 'GATEWAY_ECS_CLUSTER', fallback: undefined },
  ecsService: { name: 'GATEWAY_ECS_SERVICE', fallback: undefined },
} as const;

/** Every variable the handlers read, by handler, with its fallback; `undefined` means there is none. */
export const APP_GATEWAY_ENV = {
  gateway: {
    routes: { name: 'GATEWAY_ROUTES', fallback: undefined },
    upstreamHost: { name: 'GATEWAY_UPSTREAM_HOST', fallback: undefined },
    originSecret: { name: 'GATEWAY_ORIGIN_SECRET', fallback: undefined },
    cognitoUserPoolId: { name: 'GATEWAY_COGNITO_USER_POOL_ID', fallback: undefined },
    cognitoClientId: { name: 'GATEWAY_COGNITO_CLIENT_ID', fallback: undefined },
    ...ECS_ROWS,
    dbHost: { name: 'GATEWAY_DB_HOST', fallback: undefined },
    dbPort: { name: 'GATEWAY_DB_PORT', fallback: '5432' },
    upstreamTimeoutMs: { name: 'GATEWAY_UPSTREAM_TIMEOUT_MS', fallback: '110000' },
    connectTimeoutMs: { name: 'GATEWAY_CONNECT_TIMEOUT_MS', fallback: '5000' },
  },
  idle: {
    ...ECS_ROWS,
    loopUrl: { name: 'GATEWAY_LOOP_URL', fallback: undefined },
    idleMinutes: { name: 'GATEWAY_IDLE_MINUTES', fallback: '15' },
    proxyFunctionName: { name: 'GATEWAY_PROXY_FUNCTION_NAME', fallback: undefined },
    idleStateParameter: { name: 'GATEWAY_IDLE_STATE_PARAMETER', fallback: undefined },
    idleConfirmMinutes: { name: 'GATEWAY_IDLE_CONFIRM_MINUTES', fallback: '5' },
    idleJobMaxMinutes: { name: 'GATEWAY_IDLE_JOB_MAX_MINUTES', fallback: '240' },
  },
  job: {
    ...ECS_ROWS,
    taskDefinition: { name: 'GATEWAY_JOB_TASK_DEFINITION', fallback: undefined },
    container: { name: 'GATEWAY_JOB_CONTAINER', fallback: undefined },
    command: { name: 'GATEWAY_JOB_COMMAND', fallback: undefined },
    launches: { name: 'GATEWAY_JOB_LAUNCHES', fallback: undefined },
    subnets: { name: 'GATEWAY_JOB_SUBNETS', fallback: undefined },
    securityGroup: { name: 'GATEWAY_JOB_SECURITY_GROUP', fallback: undefined },
    capacityProvider: { name: 'GATEWAY_JOB_CAPACITY_PROVIDER', fallback: 'FARGATE' },
  },
} as const;

export class GatewayConfigError extends Error {
  override readonly name = 'GatewayConfigError';
}

/** The user pool the gateway signs in against, with the region both the verifier and the API client live in. */
export interface CognitoPool {
  region: string;
  userPoolId: string;
  clientId: string;
}

export interface GatewayConfig {
  routes: readonly Route[];
  upstreamHost: string;
  originSecret: string;
  cognito: CognitoPool;
  ecsCluster: string;
  ecsService: string;
  /** The database to touch while waking, when one is named. */
  database: { host: string; port: number } | undefined;
  /** How long a forwarded request may take once connected. */
  upstreamTimeoutMs: number;
  /** How long a connection may take to be made; longer reads as nobody listening. */
  connectTimeoutMs: number;
}

export interface IdleConfig {
  ecsCluster: string;
  ecsService: string;
  loopUrl: string;
  idleMinutes: number;
  /** The proxy function, whose invocations say whether the stack was used. */
  proxyFunctionName: string;
  /** The SSM String parameter the idle handler keeps its first quiet observation in. */
  idleStateParameter: string;
  /** How old that observation must be before a second one may stop the service. */
  idleConfirmMinutes: number;
  /** How many minutes after its creation a task that is not the service's own is stopped, so a hung session cannot keep the stack awake. */
  idleJobMaxMinutes: number;
}

/** The two ways Fargate places a task: on demand, or on spare capacity that may be reclaimed. */
const CAPACITY_PROVIDERS = ['FARGATE', 'FARGATE_SPOT'] as const;
export type CapacityProvider = (typeof CAPACITY_PROVIDERS)[number];

export interface JobConfig {
  ecsCluster: string;
  ecsService: string;
  /** The session task definition, and the container of it whose command the launch replaces. */
  taskDefinition: string;
  container: string;
  /** The command template as declared in apps.json, `{launch}` where the launch's name goes. */
  command: readonly string[];
  /** The launches the handler may start, by name. */
  launches: readonly string[];
  subnets: readonly string[];
  securityGroups: readonly string[];
  capacityProvider: CapacityProvider;
}

const refuse = (message: string): never => {
  throw new GatewayConfigError(message);
};

const set = (env: NodeJS.ProcessEnv, row: EnvRow): string | undefined => {
  const value = env[row.name];
  return value === undefined || value.trim() === '' ? row.fallback : value.trim();
};

const required = (env: NodeJS.ProcessEnv, row: EnvRow): string =>
  set(env, row) ?? refuse(`${row.name} must be set`);

function positiveInteger(row: EnvRow, value: string): number {
  if (!/^\d+$/.test(value) || Number(value) === 0) {
    return refuse(`${row.name} must be a positive integer, got ${JSON.stringify(value)}`);
  }
  return Number(value);
}

function port(row: EnvRow, value: string): number {
  if (!/^\d{1,5}$/.test(value) || Number(value) === 0 || Number(value) > 65_535) {
    return refuse(`${row.name} must be a port number, got ${JSON.stringify(value)}`);
  }
  return Number(value);
}

function httpUrl(row: EnvRow, value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(url.protocol);
    return value.replace(/\/+$/, '');
  } catch {
    return refuse(`${row.name} must be an http(s) URL, got ${JSON.stringify(value)}`);
  }
}

function routes(row: EnvRow, value: string): Route[] {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return refuse(`${row.name} must be JSON`);
  }
  const parsed = ROUTES_SCHEMA.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    return refuse(`${row.name} is not a list of routes: ${issues.join('; ')}`);
  }
  const reserved = parsed.data.find((route) => prefixCovers(AUTH_PREFIX, route.prefix));
  if (reserved !== undefined) {
    return refuse(`${row.name} declares ${reserved.prefix}, which the gateway keeps for itself`);
  }
  return parsed.data;
}

/**
 * Cognito names a user pool `<region>_<id>`, so the region the pool's keys
 * are published in and the region the `cognito-idp` API is called in is the
 * prefix before the underscore — read from the id, never declared twice.
 */
function cognitoPool(row: EnvRow, userPoolId: string, clientId: string): CognitoPool {
  const at = userPoolId.indexOf('_');
  if (at <= 0 || at === userPoolId.length - 1) {
    return refuse(`${row.name} must be <region>_<id>, got ${JSON.stringify(userPoolId)}`);
  }
  return { region: userPoolId.slice(0, at), userPoolId, clientId };
}

/** A name as a launch, a subnet or a security group is written: one word of letters, digits, `_`, `.` and `-`. */
const NAME_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** A comma-separated list of names, each declared once; a blank between two commas is refused. */
function nameList(row: EnvRow, value: string): string[] {
  const names = value.split(',').map((name) => name.trim());
  if (names.some((name) => !NAME_SHAPE.test(name))) {
    return refuse(
      `${row.name} must be a comma-separated list of names, got ${JSON.stringify(value)}`,
    );
  }
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated !== undefined) return refuse(`${row.name} names ${repeated} twice`);
  return names;
}

const COMMAND_SCHEMA = z.array(z.string().min(1)).min(1);

/** A JSON array of words, at least one of them carrying the launch placeholder, so the launch's name reaches the task. */
function commandTemplate(row: EnvRow, value: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return refuse(`${row.name} must be JSON`);
  }
  const parsed = COMMAND_SCHEMA.safeParse(json);
  if (!parsed.success) return refuse(`${row.name} must be a JSON array of words, got ${value}`);
  if (!parsed.data.some((word) => word.includes(LAUNCH_PLACEHOLDER))) {
    return refuse(`${row.name} must carry ${LAUNCH_PLACEHOLDER} in some word, got ${value}`);
  }
  return parsed.data;
}

function capacityProvider(row: EnvRow, value: string): CapacityProvider {
  const found = CAPACITY_PROVIDERS.find((provider) => provider === value);
  return (
    found ??
    refuse(`${row.name} must be ${CAPACITY_PROVIDERS.join(' or ')}, got ${JSON.stringify(value)}`)
  );
}

/**
 * The proxy's read of the environment. A value that is not what its row says
 * — routes that do not parse, a number or a port that is not one, a pool id
 * without its region, a required variable unset — is refused by name.
 */
export function gatewayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const rows = APP_GATEWAY_ENV.gateway;
  const dbHost = set(env, rows.dbHost);
  return {
    routes: routes(rows.routes, required(env, rows.routes)),
    upstreamHost: required(env, rows.upstreamHost),
    originSecret: required(env, rows.originSecret),
    cognito: cognitoPool(
      rows.cognitoUserPoolId,
      required(env, rows.cognitoUserPoolId),
      required(env, rows.cognitoClientId),
    ),
    ecsCluster: required(env, rows.ecsCluster),
    ecsService: required(env, rows.ecsService),
    database:
      dbHost === undefined
        ? undefined
        : { host: dbHost, port: port(rows.dbPort, required(env, rows.dbPort)) },
    upstreamTimeoutMs: positiveInteger(
      rows.upstreamTimeoutMs,
      required(env, rows.upstreamTimeoutMs),
    ),
    connectTimeoutMs: positiveInteger(rows.connectTimeoutMs, required(env, rows.connectTimeoutMs)),
  };
}

/** The idle handler's read of its own environment, refused the same way. */
export function idleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): IdleConfig {
  const rows = APP_GATEWAY_ENV.idle;
  return {
    ecsCluster: required(env, rows.ecsCluster),
    ecsService: required(env, rows.ecsService),
    loopUrl: httpUrl(rows.loopUrl, required(env, rows.loopUrl)),
    idleMinutes: positiveInteger(rows.idleMinutes, required(env, rows.idleMinutes)),
    proxyFunctionName: required(env, rows.proxyFunctionName),
    idleStateParameter: required(env, rows.idleStateParameter),
    idleConfirmMinutes: positiveInteger(
      rows.idleConfirmMinutes,
      required(env, rows.idleConfirmMinutes),
    ),
    idleJobMaxMinutes: positiveInteger(
      rows.idleJobMaxMinutes,
      required(env, rows.idleJobMaxMinutes),
    ),
  };
}

/** The job handler's read of its own environment, refused the same way. */
export function jobConfigFromEnv(env: NodeJS.ProcessEnv = process.env): JobConfig {
  const rows = APP_GATEWAY_ENV.job;
  return {
    ecsCluster: required(env, rows.ecsCluster),
    ecsService: required(env, rows.ecsService),
    taskDefinition: required(env, rows.taskDefinition),
    container: required(env, rows.container),
    command: commandTemplate(rows.command, required(env, rows.command)),
    launches: nameList(rows.launches, required(env, rows.launches)),
    subnets: nameList(rows.subnets, required(env, rows.subnets)),
    securityGroups: nameList(rows.securityGroup, required(env, rows.securityGroup)),
    capacityProvider: capacityProvider(rows.capacityProvider, required(env, rows.capacityProvider)),
  };
}
