import {
  MemoryHostRefused,
  MemoryHostTimeout,
  MemoryHostUnreachable,
  type MemoryClient,
} from '@sysdesign/agentic-memory-client';
import type {
  MemoryRecordDto,
  RecalledRecordDto,
  RecallRouteDto,
  RecordScope,
} from '@sysdesign/contracts';

import {
  namedSpace,
  narrowedScope,
  SpaceRefused,
  SpaceUnknown,
} from './adapters/space-http/named-space';
import { print, type Io } from './commands';
import { renderForget, renderHistory, renderRecall } from './render';

/**
 * The owner's commands over a memory space, through the memory client — what
 * the ingester and the agents wrote read back, traced and forgotten without a
 * curl: `recall` asks the space what it holds for a key or a question,
 * `history` reads every version of one record, `forget` closes one with a
 * reason. Each addresses the space by name and one tenant's partition — as
 * the ingester writes, so what the owner reads there is what every agent of
 * the tenant reads — narrowed, when `--under` names them, by the keys an agent
 * wrote under beyond it, so a taught answer kept under a project or a unit of
 * work is reached too.
 */

/** A space by the name it was ensured under, the tenant whose memories the command reads or forgets, and the keys it narrows by beyond the tenant's. */
interface SpaceAddress {
  space: string;
  tenant: string;
  under: RecordScope;
}

interface RecallOptions extends SpaceAddress {
  /** A key a record holds, exactly — a fact's subject; null when recalling by meaning alone. */
  key: string | null;
  /** The question as a text, matched by meaning; null when recalling by key alone. */
  text: string | null;
  /** One register to narrow to; null for every register the space recalls from. */
  register: string | null;
  json: boolean;
}

interface HistoryOptions extends SpaceAddress {
  recordId: string;
  json: boolean;
}

interface ForgetOptions extends SpaceAddress {
  recordId: string;
  reason: string;
  json: boolean;
}

export type SpaceCommandOptions =
  | ({ command: 'recall' } & RecallOptions)
  | ({ command: 'history' } & HistoryOptions)
  | ({ command: 'forget' } & ForgetOptions);

/** The space addressed, as the reports name it, and the scope every request named. */
interface Addressed {
  space: { id: string; name: string };
  scope: RecordScope;
}

export interface RecallReport extends Addressed {
  key: string | null;
  text: string | null;
  register: string | null;
  items: RecalledRecordDto[];
  routes: RecallRouteDto[];
  /** Ranked memories the space's recall budget left out. */
  omitted: number;
}

export interface HistoryReport extends Addressed {
  recordId: string;
  /** Every version of the record's identity, oldest first. */
  versions: MemoryRecordDto[];
}

export interface ForgetReport extends Addressed {
  reason: string;
  /** The record as it stands now: closed, with the reason. */
  record: MemoryRecordDto;
}

/** The space under the name, and the tenant's partition in it, narrowed by what the command names beyond it. */
async function address(
  client: Pick<MemoryClient, 'getSpaceByName'>,
  options: SpaceAddress,
  host: string,
): Promise<Addressed> {
  const space = await namedSpace(client, options.space, host);
  return {
    space: { id: space.id, name: options.space },
    scope: narrowedScope(space, options.tenant, options.under),
  };
}

export async function recallRecords(
  client: Pick<MemoryClient, 'getSpaceByName' | 'recall'>,
  options: Omit<RecallOptions, 'json'>,
  host: string,
): Promise<RecallReport> {
  const addressed = await address(client, options, host);
  const result = await client.recall(addressed.space.id, {
    scope: addressed.scope,
    key: options.key,
    text: options.text,
    registers: options.register === null ? null : [options.register],
  });
  return {
    ...addressed,
    key: options.key,
    text: options.text,
    register: options.register,
    items: result.items,
    routes: result.routes,
    omitted: result.omitted,
  };
}

export async function recordHistory(
  client: Pick<MemoryClient, 'getSpaceByName' | 'history'>,
  options: Omit<HistoryOptions, 'json'>,
  host: string,
): Promise<HistoryReport> {
  const addressed = await address(client, options, host);
  const versions = await client.history(addressed.space.id, {
    recordId: options.recordId,
    scope: addressed.scope,
  });
  return { ...addressed, recordId: options.recordId, versions };
}

export async function forgetRecord(
  client: Pick<MemoryClient, 'getSpaceByName' | 'invalidate'>,
  options: Omit<ForgetOptions, 'json'>,
  host: string,
): Promise<ForgetReport> {
  const addressed = await address(client, options, host);
  const record = await client.invalidate(addressed.space.id, {
    recordId: options.recordId,
    scope: addressed.scope,
    reason: options.reason,
  });
  return { ...addressed, reason: options.reason, record };
}

/**
 * What a space command cannot do, said rather than thrown: a name no space
 * holds, a space that declares no partition or does not narrow by a key named,
 * a record the scope does not see or that is closed already, a host that
 * refused, did not answer or did not answer in time.
 */
const SAID = [
  SpaceUnknown,
  SpaceRefused,
  MemoryHostRefused,
  MemoryHostUnreachable,
  MemoryHostTimeout,
] as const;

/** One space command over the client; the exit code: 0 answered, 2 for what the command could not do, said by name. */
export async function runSpaceCommand(
  options: SpaceCommandOptions,
  client: MemoryClient,
  host: string,
  io: Io,
): Promise<number> {
  try {
    if (options.command === 'recall') {
      const report = await recallRecords(client, options, host);
      print(io, options.json, report, renderRecall(report));
    } else if (options.command === 'history') {
      const report = await recordHistory(client, options, host);
      print(io, options.json, report, renderHistory(report));
    } else {
      const report = await forgetRecord(client, options, host);
      print(io, options.json, report, renderForget(report));
    }
    return 0;
  } catch (error) {
    if (!SAID.some((kind) => error instanceof kind)) throw error;
    io.error((error as Error).message);
    return 2;
  }
}
