/**
 * A strategy and a policy compiled into an executable space. Compile reads
 * the strategy's typed declarations and nothing else — never its prose:
 *
 *   registers    each becomes a store of its kind (a kind with no behavior is a
 *                problem) with its term's TTL and its declared metadata fields;
 *   interfaces   the only verbs each register serves;
 *   consolidation  the one workflow the runtime reads, because it carries what
 *                interfaces cannot — where lessons and playbooks go. The route
 *                is resolved by the ROLE each kind declares, in no particular
 *                order: zero or several candidates leave consolidation
 *                unavailable, with a warning naming the registers, never
 *                resolved to "the first".
 *
 * The strategy's reference rule is the contract's, the same one the pipeline
 * that wrote it blocks on. Everything compile answers is sorted, so the same
 * declarations compile to the same space in any order.
 */
import {
  MEMORY_FIELD_NAME,
  validateStrategyReferences,
  type CompileIssueDto,
  type CompileReportDto,
  type MemoryStrategy,
  type MemoryTerm,
  type OperationVerb,
  type RegisterKind,
} from '@sysdesign/contracts';

import type { BehaviorRegistry, ConsolidationRole, KindBehavior } from '../kinds/behavior';
import { byText } from '../order';
import type { MemoryPolicy } from './policy';

export interface CompiledRegister {
  name: string;
  kind: RegisterKind;
  term: MemoryTerm;
  ttlSeconds: number | null;
  behavior: KindBehavior;
  operations: ReadonlySet<OperationVerb>;
  metadataFields: readonly string[];
}

export interface ConsolidationPlan {
  /** The registers whose records are the evidence. */
  sources: readonly string[];
  /** The register lessons are kept in. */
  lessons: string;
  /** The register playbooks are kept in; null when the strategy promotes none. */
  playbooks: string | null;
}

export interface CompiledSpace {
  policy: MemoryPolicy;
  registers: ReadonlyMap<string, CompiledRegister>;
  consolidation: ConsolidationPlan | null;
}

export interface CompileResult {
  /** Null when a problem stops the space. */
  compiled: CompiledSpace | null;
  report: CompileReportDto;
}

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(byText);

const byIssue = (a: CompileIssueDto, b: CompileIssueDto): number =>
  byText(a.code, b.code) || byText(a.message, b.message);

interface Draft extends Omit<CompiledRegister, 'operations'> {
  operations: Set<OperationVerb>;
  ref: string;
}

function draftRegisters(
  strategy: MemoryStrategy,
  policy: MemoryPolicy,
  behaviors: BehaviorRegistry,
  problems: CompileIssueDto[],
  warnings: CompileIssueDto[],
): Map<string, Draft> {
  const drafts = new Map<string, Draft>();
  strategy.registers.forEach((declared, index) => {
    const ref = `register.${index + 1}`;
    if (drafts.has(declared.name)) return; // a duplicate is the reference rule's problem
    const behavior = behaviors[declared.kind];
    if (behavior === undefined) {
      problems.push({
        code: 'register.kind_unsupported',
        refs: [ref],
        message: `register ${declared.name} keeps ${declared.kind} memory, which this runtime has no behavior for`,
      });
      return;
    }
    for (const entry of declared.metadata.filter((field) => !MEMORY_FIELD_NAME.test(field))) {
      warnings.push({
        code: 'metadata.not_a_field',
        refs: [ref],
        message: `register ${declared.name} declares metadata "${entry}", which is not a field name, so it is not filterable`,
      });
    }
    drafts.set(declared.name, {
      name: declared.name,
      kind: declared.kind,
      term: declared.term,
      ttlSeconds: policy.terms[declared.term].ttlSeconds,
      behavior,
      operations: new Set(),
      metadataFields: sortedUnique(
        declared.metadata.filter((field) => MEMORY_FIELD_NAME.test(field)),
      ),
      ref,
    });
  });
  for (const iface of strategy.interfaces)
    drafts.get(iface.register)?.operations.add(iface.operation);
  return drafts;
}

function planConsolidation(
  strategy: MemoryStrategy,
  drafts: ReadonlyMap<string, Draft>,
  warnings: CompileIssueDto[],
): ConsolidationPlan | null {
  const steps = strategy.workflows
    .filter((workflow) => workflow.kind === 'consolidation_promotion')
    .flatMap((workflow) => workflow.steps);
  const refsOf = (names: readonly string[]): string[] =>
    names.flatMap((name) => drafts.get(name)?.ref ?? []);
  const warn = (code: CompileIssueDto['code'], names: readonly string[], message: string) =>
    warnings.push({ code, refs: refsOf(names), message });

  if (steps.length === 0) {
    const consolidating = sortedUnique(
      [...drafts.values()]
        .filter((draft) => draft.operations.has('consolidate'))
        .map((draft) => draft.name),
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
        .filter(
          (step) =>
            step.operation === operation && drafts.get(step.register)?.behavior.role === role,
        )
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
  drafts: ReadonlyMap<string, Draft>,
  consolidation: ConsolidationPlan | null,
  warnings: CompileIssueDto[],
): void {
  const derivedTargets = new Set([consolidation?.lessons, consolidation?.playbooks]);
  const effective = new Set([...(consolidation?.sources ?? []), consolidation?.playbooks]);
  for (const draft of drafts.values()) {
    if (!draft.operations.has('remember') && !derivedTargets.has(draft.name)) {
      warnings.push({
        code: 'register.no_entry',
        refs: [draft.ref],
        message: `nothing can enter register ${draft.name}: it declares no remember and no consolidation writes it`,
      });
    }
    if (!draft.operations.has('recall')) {
      warnings.push({
        code: 'register.unread',
        refs: [draft.ref],
        message: `register ${draft.name} declares no recall, so nothing reads it but the write that echoes it`,
      });
    }
    if (draft.operations.has('consolidate') && !effective.has(draft.name)) {
      warnings.push({
        code: 'operation.no_effect',
        refs: [draft.ref],
        message: `register ${draft.name} declares consolidate, which no consolidation route gives an effect`,
      });
    }
  }
}

export function compileSpace(
  strategy: MemoryStrategy,
  policy: MemoryPolicy,
  behaviors: BehaviorRegistry,
): CompileResult {
  const problems: CompileIssueDto[] = validateStrategyReferences(strategy).map(
    ({ code, refs, message }) => ({ code, refs, message }),
  );
  const warnings: CompileIssueDto[] = [];
  const drafts = draftRegisters(strategy, policy, behaviors, problems, warnings);
  const consolidation = planConsolidation(strategy, drafts, warnings);
  warnUnreachable(drafts, consolidation, warnings);

  const names = [...drafts.keys()].sort(byText);
  const registers = new Map<string, CompiledRegister>(
    names.flatMap((name) => {
      const draft = drafts.get(name);
      if (draft === undefined) return [];
      const { kind, term, ttlSeconds, behavior, operations, metadataFields } = draft;
      const register: CompiledRegister = {
        name,
        kind,
        term,
        ttlSeconds,
        behavior,
        operations,
        metadataFields,
      };
      return [[name, register] as const];
    }),
  );
  const report: CompileReportDto = {
    problems: problems.sort(byIssue),
    warnings: warnings.sort(byIssue),
    registers: [...registers.values()].map((register) => ({
      name: register.name,
      kind: register.kind,
      term: register.term,
      ttlSeconds: register.ttlSeconds,
      projected: register.behavior.projected,
      operations: [...register.operations].sort(byText),
      metadataFields: [...register.metadataFields],
    })),
    consolidation:
      consolidation === null
        ? null
        : {
            sources: [...consolidation.sources],
            lessons: consolidation.lessons,
            playbooks: consolidation.playbooks,
          },
  };
  return { compiled: problems.length === 0 ? { policy, registers, consolidation } : null, report };
}
