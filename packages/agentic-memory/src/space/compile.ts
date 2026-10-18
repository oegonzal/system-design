/**
 * A strategy and a policy compiled into an executable space. What the strategy
 * declares — each register's verbs and metadata fields, the consolidation route,
 * and what of it the runtime cannot run as written — is the contract's analysis
 * (`analyzeStrategy`), the same one the memory-architecture pipeline tells its
 * coach with, so the two never disagree. Compile adds what only the runtime
 * knows: the reference rule's problems, a kind this runtime has no behavior
 * for, and each register's time to live from the policy. A problem stops the
 * space; a warning travels on its report.
 */
import {
  analyzeStrategy,
  validateStrategyReferences,
  type CompileIssueDto,
  type CompileReportDto,
  type ConsolidationRoute,
  type MemoryStrategy,
  type MemoryTerm,
  type OperationVerb,
  type RegisterKind,
} from '@sysdesign/contracts';

import type { BehaviorRegistry, KindBehavior } from '../kinds/behavior';
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

export interface CompiledSpace {
  policy: MemoryPolicy;
  registers: ReadonlyMap<string, CompiledRegister>;
  consolidation: ConsolidationRoute | null;
}

export interface CompileResult {
  /** Null when a problem stops the space. */
  compiled: CompiledSpace | null;
  report: CompileReportDto;
}

const byIssue = (a: CompileIssueDto, b: CompileIssueDto): number =>
  byText(a.code, b.code) || byText(a.message, b.message);

export function compileSpace(
  strategy: MemoryStrategy,
  policy: MemoryPolicy,
  behaviors: BehaviorRegistry,
): CompileResult {
  const problems: CompileIssueDto[] = validateStrategyReferences(strategy).map(
    ({ code, refs, message }) => ({ code, refs, message }),
  );
  const analysis = analyzeStrategy(strategy);
  const registers = new Map<string, CompiledRegister>();
  for (const analyzed of analysis.registers) {
    const behavior = behaviors[analyzed.kind];
    if (behavior === undefined) {
      problems.push({
        code: 'register.kind_unsupported',
        refs: [analyzed.ref],
        message: `register ${analyzed.name} keeps ${analyzed.kind} memory, which this runtime has no behavior for`,
      });
      continue;
    }
    registers.set(analyzed.name, {
      name: analyzed.name,
      kind: analyzed.kind,
      term: analyzed.term,
      ttlSeconds: policy.terms[analyzed.term].ttlSeconds,
      behavior,
      operations: new Set(analyzed.operations),
      metadataFields: analyzed.metadataFields,
    });
  }
  const report: CompileReportDto = {
    problems: problems.sort(byIssue),
    warnings: analysis.warnings.map(({ code, refs, message }) => ({ code, refs, message })),
    registers: [...registers.values()].map((register) => ({
      name: register.name,
      kind: register.kind,
      term: register.term,
      ttlSeconds: register.ttlSeconds,
      projected: register.behavior.projected,
      operations: [...register.operations],
      metadataFields: [...register.metadataFields],
    })),
    consolidation:
      analysis.consolidation === null
        ? null
        : { ...analysis.consolidation, sources: [...analysis.consolidation.sources] },
  };
  return {
    compiled:
      problems.length === 0 ? { policy, registers, consolidation: analysis.consolidation } : null,
    report,
  };
}
