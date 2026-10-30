import type { MemoryClient } from '@sysdesign/agentic-memory-client';
import type { MemorySpaceDto, RecordScope } from '@sysdesign/contracts';

/**
 * A memory space as the ingester and the owner's commands address one: by the
 * name it was ensured under, and within one partition of it. Neither ensures
 * a space — that is its agent's, from its design run — so a name nobody holds
 * is refused, never made.
 */

/** A name no space on the host holds: refused by name before anything is read or written. */
export class SpaceUnknown extends Error {
  override readonly name = 'SpaceUnknown';
  constructor(
    readonly spaceName: string,
    host: string,
  ) {
    super(
      `no memory space is named ${spaceName} at ${host}: a space is ensured under its name by the agent whose design it is (PUT /spaces/by-name/${spaceName}) before documents are ingested into it`,
    );
  }
}

/**
 * The space does not serve what was asked of it. Every unmet need is listed,
 * by name, so the person who configured the command corrects it once; the
 * message is theirs to read, and a caller branches on the class alone.
 */
export class SpaceRefused extends Error {
  override readonly name = 'SpaceRefused';
  constructor(
    space: Pick<MemorySpaceDto, 'id' | 'name'>,
    readonly needs: readonly string[],
  ) {
    super(`memory space ${space.name ?? space.id} does not serve the command: ${needs.join('; ')}`);
  }
}

/** The space under a name, or a refusal naming it. */
export async function namedSpace(
  client: Pick<MemoryClient, 'getSpaceByName'>,
  name: string,
  host: string,
): Promise<MemorySpaceDto> {
  const space = await client.getSpaceByName(name);
  if (space === null) throw new SpaceUnknown(name, host);
  return space;
}

/**
 * The scope of one partition alone: the space's first declared key — the one
 * every request and every row carries — to the tenant. A memory written under
 * it is read by every request of the tenant, whatever project, user or unit
 * the request narrows by, which is what a document's facts are for.
 */
export function partitionScope(space: MemorySpaceDto, tenant: string): RecordScope {
  const [partition] = space.scopeKeys;
  if (partition === undefined) throw new SpaceRefused(space, ['the space declares no scope key']);
  return { [partition]: tenant };
}

/**
 * The tenant's partition narrowed by the keys a command names beyond it — a
 * project, a unit of work — each one the space declares after its partition,
 * so a record an agent wrote under them is seen: a key the space does not
 * narrow by, or the partition itself, which is the tenant's to name, is
 * refused by name.
 */
export function narrowedScope(
  space: MemorySpaceDto,
  tenant: string,
  under: RecordScope,
): RecordScope {
  const partition = partitionScope(space, tenant);
  const [partitionKey, ...narrowing] = space.scopeKeys;
  const unknown = Object.keys(under).filter((key) => !narrowing.includes(key));
  if (unknown.length > 0) {
    const where = narrowing.length === 0 ? 'no key beyond its partition' : narrowing.join(', ');
    throw new SpaceRefused(space, [
      `--under names ${unknown.join(', ')}; the space narrows by ${where}${
        unknown.includes(partitionKey ?? '') ? ` (${partitionKey} is --tenant's to name)` : ''
      }`,
    ]);
  }
  return { ...partition, ...under };
}
