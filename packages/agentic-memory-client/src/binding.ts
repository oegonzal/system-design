import {
  createSpaceRequestSchema,
  MEMORY_FIELD_NAME,
  OPERATION_VERBS,
  recoverySchema,
  REGISTER_KINDS,
  rememberRequestSchema,
  spaceNameSchema,
  type CompiledRegisterDto,
  type MemorySpaceDto,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { MemoryClient } from './memory-client';

/**
 * What an agent declares it needs of a memory space, as data, and the one
 * check of that declaration against the space the host serves — made once,
 * before the agent starts, so a space that cannot serve it refuses the agent
 * by name instead of refusing its first request in the middle of its work.
 *
 * A binding names the space (by the name it is ensured under and the design
 * run it is made from), the scope keys every request will name (the partition
 * every request carries, and the key a request narrows by when a unit of work
 * is open), and under a ROLE of the agent's own — whatever its work calls the
 * memories it keeps — the register that role uses, with the kind, the
 * operations and the metadata fields the agent will send to it. The agent
 * writes requests in its roles; the bound space translates each to the
 * register's name.
 *
 * Nothing here knows what the roles mean or what the memories are about: a
 * role is a key, a register a name, and both are checked against the space's
 * compile report and declared scope keys — facts the host answered, never the
 * shape of any prose.
 */

/** A role's grammar: a lower-case word of letters, digits and hyphens, so it reads the same in a config file and a log line. */
const ROLE = /^[a-z][a-z0-9-]*$/;

/** A scope key or a metadata field, in the one grammar the runtime gives a field name. */
const fieldName = z
  .string()
  .regex(MEMORY_FIELD_NAME, 'a field name: a letter, then letters, digits and underscores');

/** What one role needs of its register: the register as the strategy names it, and what the agent will ask of it. */
const registerNeedSchema = z.strictObject({
  /** The register's name, within what a request may name: the node a remember request reads it with. */
  name: rememberRequestSchema.shape.register,
  kind: z.enum(REGISTER_KINDS),
  /** The verbs the agent will send; the register must declare each. */
  operations: z.array(z.enum(OPERATION_VERBS)).min(1),
  /** The metadata fields the agent will write or filter by; the register must declare each. */
  metadata: z.array(fieldName).default([]),
});
type RegisterNeed = z.infer<typeof registerNeedSchema>;

export const memoryBindingSchema = z.strictObject({
  space: z.strictObject({
    name: spaceNameSchema,
    /** The run the space is made from, as an ensure names it. */
    runId: createSpaceRequestSchema.shape.runId,
  }),
  scope: z.strictObject({
    /** The key every request names: the space's first scope key. */
    partition: fieldName,
    /** The key a request narrows by when a unit of work is open; null for an agent that never narrows. */
    unit: fieldName.nullable(),
  }),
  registers: z
    .record(
      z.string().regex(ROLE, 'a role: a lower-case word of letters, digits and hyphens'),
      registerNeedSchema,
    )
    .refine(
      (registers) => Object.keys(registers).length > 0,
      'a binding names at least one register',
    ),
  /** How long the agent rides out a restarting host. */
  recovery: recoverySchema,
});
export type MemoryBinding = z.infer<typeof memoryBindingSchema>;

/** A space checked against a binding: what every request of the agent addresses. */
export interface BoundSpace {
  spaceId: string;
  /** Each role to the register name a request names. */
  registers: Record<string, string>;
  /** The key every request carries, and the one it narrows by when a unit is open. */
  scope: { partition: string; unit: string | null };
}

/**
 * The space does not serve the binding. Every unmet need is listed, by role
 * and by name, so the person who declared the binding corrects it once; the
 * message is theirs to read, and a caller branches on the class alone.
 */
export class MemoryBindingRefused extends Error {
  readonly spaceId: string;
  readonly needs: readonly string[];

  constructor(space: Pick<MemorySpaceDto, 'id' | 'name'>, needs: readonly string[]) {
    super(`memory space ${space.name ?? space.id} does not serve the binding: ${needs.join('; ')}`);
    this.name = 'MemoryBindingRefused';
    this.spaceId = space.id;
    this.needs = needs;
  }
}

/** What a role needs of its register that the compiled register does not declare. */
function registerNeeds(
  role: string,
  need: RegisterNeed,
  registers: readonly CompiledRegisterDto[],
): string[] {
  const register = registers.find(({ name }) => name === need.name);
  if (register === undefined) return [`role ${role}: the space has no register ${need.name}`];
  const needs: string[] = [];
  if (register.kind !== need.kind) {
    needs.push(
      `role ${role}: register ${need.name} keeps ${register.kind} memory, not ${need.kind}`,
    );
  }
  const undeclared = need.operations.filter((verb) => !register.operations.includes(verb));
  if (undeclared.length > 0) {
    needs.push(`role ${role}: register ${need.name} declares no ${undeclared.join(', ')}`);
  }
  const unfiltered = need.metadata.filter((field) => !register.metadataFields.includes(field));
  if (unfiltered.length > 0) {
    needs.push(
      `role ${role}: register ${need.name} declares no metadata field ${unfiltered.join(', ')}`,
    );
  }
  return needs;
}

/**
 * What the binding's scope needs of the space's declared keys: the partition
 * is the first, and a unit key is one the space narrows by — any key but the
 * first, so a unit value can never stand where the partition's belongs in a
 * request's scope.
 */
function scopeNeeds(scope: MemoryBinding['scope'], scopeKeys: readonly string[]): string[] {
  if (scopeKeys.length === 0) return ['the space declares no scope keys'];
  const [partition, ...narrowing] = scopeKeys;
  const needs: string[] = [];
  if (partition !== scope.partition) {
    needs.push(`the partition every request must name is ${partition}, not ${scope.partition}`);
  }
  if (scope.unit !== null && !narrowing.includes(scope.unit)) {
    const narrows = narrowing.length > 0 ? narrowing.join(', ') : 'no key';
    needs.push(`the space narrows by ${narrows}, not by ${scope.unit}`);
  }
  return needs;
}

/**
 * What an agent needs of the space beyond the binding's own needs, each unmet
 * one named — a scope key its every request names, a kind it writes one role
 * as — read off the space the host answered. The binding declares what every
 * agent needs; this is where one agent adds its own, so both are checked in
 * the one pass and refused in the one refusal.
 */
export type SpaceNeeds = (space: MemorySpaceDto) => readonly string[];

/** An agent that needs nothing beyond its binding. */
const NO_FURTHER_NEEDS: SpaceNeeds = () => [];

/**
 * The space checked against the binding, pure: every unmet need is collected
 * before the one refusal — the binding's, then the agent's own — so a
 * declaration is corrected once. A space that does not compile binds nothing
 * — its compile problems lead the needs, and its declarations, such as the
 * report still carries, are checked after them.
 */
export function bindSpace(
  space: MemorySpaceDto,
  binding: MemoryBinding,
  needsOf: SpaceNeeds = NO_FURTHER_NEEDS,
): BoundSpace {
  const problems = space.report.problems.map(({ code }) => code);
  const needs = [
    ...(problems.length > 0 ? [`the space does not compile: ${problems.join(', ')}`] : []),
    ...Object.entries(binding.registers).flatMap(([role, need]) =>
      registerNeeds(role, need, space.report.registers),
    ),
    ...scopeNeeds(binding.scope, space.scopeKeys),
    ...needsOf(space),
  ];
  if (needs.length > 0) throw new MemoryBindingRefused(space, needs);
  return {
    spaceId: space.id,
    registers: Object.fromEntries(
      Object.entries(binding.registers).map(([role, { name }]) => [role, name]),
    ),
    scope: { partition: binding.scope.partition, unit: binding.scope.unit },
  };
}

/**
 * The space ensured under the binding's name from its run, then checked
 * against the binding and against whatever the agent needs beyond it: the one
 * ensure-and-bind every agent starts by, so none spells the two calls itself.
 */
export async function bindMemorySpace(
  client: Pick<MemoryClient, 'ensureSpace'>,
  binding: MemoryBinding,
  needsOf: SpaceNeeds = NO_FURTHER_NEEDS,
): Promise<BoundSpace> {
  const { space } = await client.ensureSpace(binding.space.name, { runId: binding.space.runId });
  return bindSpace(space, binding, needsOf);
}
