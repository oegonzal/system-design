import { createHash } from 'node:crypto';

import {
  bindMemorySpace,
  MemoryBindingRefused,
  MemoryHostRefused,
  MemoryHostTimeout,
  MemoryHostUnreachable,
  SpaceNotCompiled,
  type BoundSpace,
  type MemoryClient,
} from '@sysdesign/agentic-memory-client';
import type {
  MemorySpaceDto,
  OperatorGuidanceDto,
  RecordScope,
  RegisterKind,
} from '@sysdesign/contracts';

import { NO_TENANT, SESSION_ENV } from '../../config';
import { SessionRefused } from '../../core/unit-advice';
import { UNJUDGED_RUN, type MemoryBrainSettings } from '../../settings';

/**
 * How this program addresses the space its settings bind it to. The binding
 * declares what any agent needs of a space (`@sysdesign/agentic-memory-client`);
 * this program adds what it needs beyond that — the project key every request
 * names, the kind it teaches an answer as, the metadata it can fill — and
 * checks all of it once at boot, before any session row, so a space that
 * cannot serve the session refuses it by name instead of refusing its first
 * form page. Every request's scope is built here too, so the tenant, the
 * project and the hashed unit key are spelled in one place.
 */

/** The scope key every request names beside the partition: this program's own project within the tenant's memories. */
const PROJECT_SCOPE_KEY = 'project';

/** The kind of memory an operator's answer is taught as: one value per subject and question, superseded in place. */
export const TEACH_REGISTER_KIND: RegisterKind = 'semantic';

/**
 * The metadata fields this program can fill on a taught answer, each read
 * off the answer itself — what a binding may declare of the teach register,
 * and what a recall may one day filter by. A binding declaring a field not
 * here is refused at boot: nothing invents a value for a declared field.
 */
export const TEACH_METADATA: Readonly<Record<string, (answer: OperatorGuidanceDto) => string>> = {
  question: (answer) => answer.field.question,
  channel: (answer) => answer.via,
};

/** The tenant the brain reads and writes for; the environment's placeholder is refused by name, never run under. */
export function memoryTenantOf(memoryTenant: string): string {
  if (memoryTenant === NO_TENANT) {
    throw new SessionRefused(
      `${SESSION_ENV.memoryTenant.name} is ${NO_TENANT}: the brain keeps its memories in a space, whose partition every request names — set it to the tenant the session acts for`,
    );
  }
  return memoryTenant;
}

/**
 * What this program needs of the space beyond the binding's own needs, each
 * unmet one named. The project key is this program's: a binding that spells
 * its partition or its unit key as that key would have every request write
 * one value over the other, so it is refused before any request is spelled.
 */
function programNeeds(space: MemorySpaceDto, settings: MemoryBrainSettings): string[] {
  const needs: string[] = [];
  const { scope } = settings.binding;
  if (!space.scopeKeys.includes(PROJECT_SCOPE_KEY)) {
    needs.push(`the space declares no scope key ${PROJECT_SCOPE_KEY}, which every request names`);
  }
  for (const [key, value] of [
    ['partition', scope.partition],
    ['unit', scope.unit],
  ] as const) {
    if (value === PROJECT_SCOPE_KEY) {
      needs.push(
        `the binding's ${key} key is ${PROJECT_SCOPE_KEY}, the key this program names its project under: a request would write one over the other`,
      );
    }
  }
  const teach = settings.binding.registers[settings.teach];
  if (teach !== undefined) {
    if (teach.kind !== TEACH_REGISTER_KIND) {
      needs.push(
        `role ${settings.teach}: an answer is taught as ${TEACH_REGISTER_KIND} memory, not ${teach.kind}`,
      );
    }
    const unfilled = teach.metadata.filter((field) => !Object.hasOwn(TEACH_METADATA, field));
    if (unfilled.length > 0) {
      needs.push(
        `role ${settings.teach}: nothing fills the metadata field ${unfilled.join(', ')}; this program fills ${Object.keys(TEACH_METADATA).join(', ')}`,
      );
    }
  }
  return needs;
}

/**
 * The space ensured under the declared name from the declared run and checked
 * against the binding and this program's needs, every unmet one collected
 * before the one refusal — the client's one ensure-and-bind, with this
 * program's needs handed in. A binding whose run nobody has judged yet ensures
 * nothing: the name would be held by whatever run it named, for good. A space
 * that does not serve the session, a strategy that does not compile and a
 * host that refuses the ensure are each a `SessionRefused` by name — a
 * configuration problem, like a bad flag. A host nobody answers is left to
 * the caller: at boot the session runs degraded; at a step it is the recall's
 * fault.
 */
export async function bindBrainSpace(
  client: MemoryClient,
  settings: MemoryBrainSettings,
): Promise<BoundSpace> {
  const { binding } = settings;
  if (binding.space.runId === UNJUDGED_RUN) {
    throw new SessionRefused(
      `the memory brain cannot start: the binding names no judged run for the space ${binding.space.name} (binding.space.runId is ${UNJUDGED_RUN}) — judge the space's strategy and write the run's id into the brain file`,
    );
  }
  try {
    return await bindMemorySpace(client, binding, (space) => programNeeds(space, settings));
  } catch (error) {
    if (
      error instanceof MemoryBindingRefused ||
      error instanceof MemoryHostRefused ||
      error instanceof SpaceNotCompiled
    ) {
      throw new SessionRefused(`the memory brain cannot start: ${error.message}`);
    }
    throw error;
  }
}

/** Whether an error is the host not answering — a dead socket or a call past its time — which is ridden, never refused on. */
export const isHostSilent = (error: unknown): error is MemoryHostUnreachable | MemoryHostTimeout =>
  error instanceof MemoryHostUnreachable || error instanceof MemoryHostTimeout;

/**
 * The space bound at boot: refused by name when it does not serve the
 * session; null — said once, the session running with no evidence until a
 * step's probe binds it — when nobody answered.
 */
export async function bootBrainSpace(
  client: MemoryClient,
  settings: MemoryBrainSettings,
  warn: (text: string) => void,
): Promise<BoundSpace | null> {
  try {
    return await bindBrainSpace(client, settings);
  } catch (error) {
    if (!isHostSilent(error)) throw error;
    warn(
      `the memory host did not answer at boot — the session runs with no evidence until it does, probed once a step: ${error.message}`,
    );
    return null;
  }
}

/** A unit of work's key as a scope value: hashed, so any declared identity fits the value's bound and the key itself leaves the session only in its dump. */
const unitValueOf = (unitKey: string): string => createHash('sha256').update(unitKey).digest('hex');

/**
 * The scope one request names: the tenant under the partition key, this
 * program's project, and — when a unit of work is open and the binding
 * declares a key to narrow by — the unit's key hashed under it. A memory
 * written under a unit is visible to requests naming that unit alone; one
 * written without is visible to every request of the project.
 */
export function scopeOf(
  bound: BoundSpace,
  tenant: string,
  project: string,
  unitKey: string | null,
): RecordScope {
  const unit = bound.scope.unit;
  return {
    [bound.scope.partition]: tenant,
    [PROJECT_SCOPE_KEY]: project,
    ...(unitKey === null || unit === null ? {} : { [unit]: unitValueOf(unitKey) }),
  };
}
