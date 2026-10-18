/**
 * The write brief: what a writer is told before it remembers into a space,
 * read from the space's declarations alone. Every register that declares
 * remember is listed, less the one consolidation promotes playbooks into — its
 * versions are consolidation's, held to the support the policy declares. Each
 * comes with what the space's strategy says it holds, the fields it reconciles
 * on, and, on the register consolidation keeps its lessons in, the identity
 * values those lessons are written under. A brief is refused for a scope a
 * write would be refused for, and writes nothing.
 */
import type {
  MemoryStrategy,
  RecordScope,
  SpaceWriteBriefDto,
  WritableRegisterDto,
} from '@sysdesign/contracts';

import { byText } from '../order';
import type { CompiledRegister, CompiledSpace } from '../space/compile';
import { partitionOf } from './write';

const reservedOf = (register: CompiledRegister): WritableRegisterDto['reserved'] =>
  register.behavior.reserved.map(({ field, value }) => ({ field, value }));

export function writeBrief(
  space: CompiledSpace,
  strategy: MemoryStrategy,
  scope: RecordScope,
): SpaceWriteBriefDto {
  partitionOf(space, scope);
  const route = space.consolidation;
  const registers = strategy.registers.flatMap(({ name, holds }): WritableRegisterDto[] => {
    const register = space.registers.get(name);
    if (!register?.operations.has('remember') || name === route?.playbooks) return [];
    return [
      {
        name,
        kind: register.kind,
        term: register.term,
        holds,
        identity: [...register.behavior.identity],
        reserved: name === route?.lessons ? reservedOf(register) : [],
      },
    ];
  });
  return { registers: registers.sort((a, b) => byText(a.name, b.name)) };
}
