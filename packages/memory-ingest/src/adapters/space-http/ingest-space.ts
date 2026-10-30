import type { MemoryClient } from '@sysdesign/agentic-memory-client';
import type { CompiledRegisterDto, RecordScope } from '@sysdesign/contracts';

import { namedSpace, partitionScope, SpaceRefused } from './named-space';

/**
 * The space the ingester posts to, checked once before any document is read:
 * the space exists under its name and compiles, it declares a partition to
 * write under, and every register the digests may file into exists and lets a
 * writer remember into it — facts the host answered in the space's compile
 * report, never the shape of any prose. A space that cannot serve the ingest
 * refuses the run by name, with every unmet need listed, instead of refusing
 * its first digest in the middle of a document.
 */
export interface IngestSpace {
  spaceId: string;
  /** The memory host's base URL, as every posting records where it went. */
  host: string;
  /** The scope every digest writes under: the tenant's partition alone, so every agent of the tenant reads what a document states. */
  scope: RecordScope;
  /** The registers the digests may file memories under, each verified to exist and to declare `remember`. */
  registers: readonly string[];
}

/** What the ingester is configured to post to: the space by name, the tenant to write under, the registers to file into. */
interface IngestSpaceSettings {
  space: string;
  tenant: string;
  registers: readonly string[];
}

/** The verb a digest's apply sends to each register it files into. */
const WRITES = 'remember';

/** What the ingest needs of one register that the compiled register does not declare. */
function registerNeeds(name: string, registers: readonly CompiledRegisterDto[]): string[] {
  const register = registers.find((compiled) => compiled.name === name);
  if (register === undefined) return [`register ${name}: the space has none by that name`];
  return register.operations.includes(WRITES)
    ? []
    : [`register ${name}: declares no ${WRITES}, so a digest may not file into it`];
}

export async function resolveIngestSpace(
  client: Pick<MemoryClient, 'getSpaceByName'>,
  settings: IngestSpaceSettings,
  host: string,
): Promise<IngestSpace> {
  const space = await namedSpace(client, settings.space, host);
  const problems = space.report.problems.map(({ code }) => code);
  const needs = [
    ...(problems.length > 0 ? [`the space does not compile: ${problems.join(', ')}`] : []),
    ...settings.registers.flatMap((name) => registerNeeds(name, space.report.registers)),
  ];
  if (needs.length > 0) throw new SpaceRefused(space, needs);
  return {
    spaceId: space.id,
    host,
    scope: partitionScope(space, settings.tenant),
    registers: settings.registers,
  };
}
