/**
 * What the agentic-memory runtime can execute of a memory strategy, read from
 * its typed declarations alone — never its prose. The runtime compiles a space
 * with it, and the memory-architecture pipeline runs it over every draft as a
 * validator, so a coach is told, in the runtime's own words, what its strategy
 * declares that cannot run as written.
 *
 *   consolidation  the one route read from workflows: within a
 *                  consolidation_promotion workflow, the registers whose
 *                  records are evidence (`consolidate` on a kind whose role is
 *                  `source`), the one lessons go to (`remember` on `lesson`) and
 *                  the one playbooks go to (`consolidate` on `playbook`) —
 *                  resolved by role, in any order; zero or several candidates
 *                  leave it unavailable, never resolved to "the first";
 *   registers      each one's declared verbs and its metadata fields; an entry
 *                  that is not a field name is not filterable;
 *   reachability   a register nothing can write into, one nothing reads, a
 *                  consolidate with no effect, and a long-term register nothing
 *                  can forget.
 *
 * Everything it answers is sorted, so the same declarations analyze the same in
 * any order.
 */
import {
  REGISTER_KIND_DECLARATIONS,
  type ConsolidationRole,
  type RegisterKind,
} from './register-kinds';
import type { MemoryStrategy, MemoryTerm, OperationVerb } from './strategy';

/** The one grammar for a field name: a scope key, a metadata field, a register's declared metadata entry. */
export const MEMORY_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** What a strategy declares that the runtime cannot run as written. */
export const COMPILE_WARNINGS = [
  'metadata.not_a_field',
  'register.no_entry',
  'register.unread',
  'register.unforgettable',
  'operation.no_effect',
  'consolidation.no_workflow',
  'consolidation.no_source',
  'consolidation.no_lesson_target',
  'consolidation.lessons_ambiguous',
  'consolidation.playbooks_ambiguous',
  'consolidation.no_playbook_target',
] as const;
export type CompileWarning = (typeof COMPILE_WARNINGS)[number];

export interface StrategyWarning {
  code: CompileWarning;
  /** The strategy's own places: `register.N`. */
  refs: string[];
  message: string;
}

export interface AnalyzedRegister {
  name: string;
  kind: RegisterKind;
  term: MemoryTerm;
  /** The register's place in the strategy: `register.N`. */
  ref: string;
  operations: OperationVerb[];
  metadataFields: string[];
}

export interface ConsolidationRoute {
  /** The registers whose records are the evidence. */
  sources: string[];
  /** The register lessons are kept in. */
  lessons: string;
  /** The register playbooks are kept in; null when the strategy promotes none. */
  playbooks: string | null;
}

export interface StrategyAnalysis {
  registers: AnalyzedRegister[];
  consolidation: ConsolidationRoute | null;
  warnings: StrategyWarning[];
}

type Declarations = Pick<MemoryStrategy, 'registers' | 'interfaces' | 'workflows'>;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(byText);

function analyzeRegisters(
  strategy: Declarations,
  warnings: StrategyWarning[],
): Map<string, AnalyzedRegister> {
  const registers = new Map<string, AnalyzedRegister>();
  strategy.registers.forEach((declared, index) => {
    if (registers.has(declared.name)) return; // a duplicate is the reference rule's problem
    const ref = `register.${index + 1}`;
    for (const entry of declared.metadata.filter((field) => !MEMORY_FIELD_NAME.test(field))) {
      warnings.push({
        code: 'metadata.not_a_field',
        refs: [ref],
        message: `register ${declared.name} declares metadata "${entry}", which is not a field name, so it is not filterable`,
      });
    }
    const operations = strategy.interfaces
      .filter((iface) => iface.register === declared.name)
      .map((iface) => iface.operation);
    registers.set(declared.name, {
      name: declared.name,
      kind: declared.kind,
      term: declared.term,
      ref,
      operations: sortedUnique(operations) as OperationVerb[],
      metadataFields: sortedUnique(
        declared.metadata.filter((field) => MEMORY_FIELD_NAME.test(field)),
      ),
    });
  });
  return registers;
}

function routeConsolidation(
  strategy: Declarations,
  registers: ReadonlyMap<string, AnalyzedRegister>,
  warnings: StrategyWarning[],
): ConsolidationRoute | null {
  const steps = strategy.workflows
    .filter((workflow) => workflow.kind === 'consolidation_promotion')
    .flatMap((workflow) => workflow.steps);
  const warn = (code: CompileWarning, names: readonly string[], message: string) =>
    warnings.push({ code, refs: names.flatMap((name) => registers.get(name)?.ref ?? []), message });

  if (steps.length === 0) {
    const consolidating = sortedUnique(
      [...registers.values()]
        .filter((r) => r.operations.includes('consolidate'))
        .map((r) => r.name),
    );
    if (consolidating.length > 0) {
      warn(
        'consolidation.no_workflow',
        consolidating,
        `${consolidating.join(', ')} declare consolidate, but no consolidation workflow routes it`,
      );
    }
    return null;
  }

  const named = (operation: OperationVerb, role: ConsolidationRole): string[] =>
    sortedUnique(
      steps
        .filter((step) => {
          const register = registers.get(step.register);
          return (
            step.operation === operation &&
            register !== undefined &&
            REGISTER_KIND_DECLARATIONS[register.kind].role === role
          );
        })
        .map((step) => step.register),
    );
  const sources = named('consolidate', 'source');
  const lessons = named('remember', 'lesson');
  const playbooks = named('consolidate', 'playbook');

  if (sources.length === 0) {
    warn(
      'consolidation.no_source',
      [],
      'the consolidation workflow consolidates no register whose records are evidence',
    );
  }
  if (lessons.length === 0) {
    warn(
      'consolidation.no_lesson_target',
      [],
      'the consolidation workflow remembers its lessons in no register that keeps them',
    );
  }
  if (lessons.length > 1) {
    warn(
      'consolidation.lessons_ambiguous',
      lessons,
      `lessons could go to any of ${lessons.join(', ')}`,
    );
  }
  if (playbooks.length === 0) {
    warn(
      'consolidation.no_playbook_target',
      [],
      'the consolidation workflow promotes lessons into no playbook register',
    );
  }
  if (playbooks.length > 1) {
    warn(
      'consolidation.playbooks_ambiguous',
      playbooks,
      `playbooks could go to any of ${playbooks.join(', ')}`,
    );
  }
  const [lessonTarget] = lessons;
  if (sources.length === 0 || lessons.length !== 1 || lessonTarget === undefined) return null;
  return {
    sources,
    lessons: lessonTarget,
    playbooks: playbooks.length === 1 ? (playbooks[0] ?? null) : null,
  };
}

function warnUnreachable(
  registers: ReadonlyMap<string, AnalyzedRegister>,
  consolidation: ConsolidationRoute | null,
  warnings: StrategyWarning[],
): void {
  const derivedTargets = new Set([consolidation?.lessons, consolidation?.playbooks]);
  const effective = new Set([...(consolidation?.sources ?? []), consolidation?.playbooks]);
  for (const register of registers.values()) {
    const declares = (verb: OperationVerb) => register.operations.includes(verb);
    if (!declares('remember') && !derivedTargets.has(register.name)) {
      warnings.push({
        code: 'register.no_entry',
        refs: [register.ref],
        message: `nothing can enter register ${register.name}: it declares no remember and no consolidation writes it`,
      });
    }
    if (!declares('recall')) {
      warnings.push({
        code: 'register.unread',
        refs: [register.ref],
        message: `register ${register.name} declares no recall, so nothing reads it but the write that echoes it`,
      });
    }
    if (register.term === 'long_term' && !declares('invalidate')) {
      warnings.push({
        code: 'register.unforgettable',
        refs: [register.ref],
        message: `register ${register.name} keeps long-term memory and declares no invalidate, so nothing it keeps can be forgotten`,
      });
    }
    if (declares('consolidate') && !effective.has(register.name)) {
      warnings.push({
        code: 'operation.no_effect',
        refs: [register.ref],
        message: `register ${register.name} declares consolidate, which no consolidation route gives an effect`,
      });
    }
  }
}

export function analyzeStrategy(strategy: Declarations): StrategyAnalysis {
  const warnings: StrategyWarning[] = [];
  const registers = analyzeRegisters(strategy, warnings);
  const consolidation = routeConsolidation(strategy, registers, warnings);
  warnUnreachable(registers, consolidation, warnings);
  return {
    registers: [...registers.values()].sort((a, b) => byText(a.name, b.name)),
    consolidation,
    warnings: warnings.sort((a, b) => byText(a.code, b.code) || byText(a.message, b.message)),
  };
}
