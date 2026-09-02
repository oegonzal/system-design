/**
 * The "grade beyond this" sections advisory passes append: the deterministic
 * coverage ledger and findings list, rendered identically wherever a model is
 * told what has already been graded. Extracted from the depth pass when the
 * workability pass needed the same framing — two renderings would drift.
 */
import { isCoverageArtifact, isFindingsArtifact } from '../core/artifacts';
import type { PassContext } from '../core/types';

export function coverageSection(ctx: PassContext): string {
  const entries = ctx.priorArtifacts.filter(isCoverageArtifact).flatMap((a) => a.entries);
  if (entries.length === 0) return '  (none)';
  return entries
    .map((entry) => `  [${entry.met ? 'met' : 'unmet'}] ${entry.expectationId}`)
    .join('\n');
}

export function findingsSection(ctx: PassContext): string {
  const findings = ctx.priorArtifacts.filter(isFindingsArtifact).flatMap((a) => a.findings);
  if (findings.length === 0) return '  (none)';
  return findings
    .map((f) => `  [${f.severity}] ${f.ruleId ?? f.expectationId ?? 'finding'}: ${f.title}`)
    .join('\n');
}
