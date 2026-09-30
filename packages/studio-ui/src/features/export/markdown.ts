import type {
  CanvasGraph,
  DesignBrief,
  DesignNarrative,
  DesignRevisionSummaryDto,
  EvaluationDto,
  PromptDto,
  SuccessCriterion,
} from '@sysdesign/contracts';

import { humanizeToken } from '../evaluation/humanize';

/**
 * Pure Markdown serializers for a practice run — one per artifact, each a
 * total function of DTOs (no DOM, no I/O), so they are unit-testable and the
 * export is a copy of a run that lives entirely outside the database.
 *
 * `#`/`##` headings, blank-line spacing, GitHub `| --- |` tables, `**bold**`,
 * `` `code` ``. Every id (node, edge, criterion) is resolved to the label or
 * statement the author actually reads.
 */

const NONE = '_None._';

function joinLines(lines: string[]): string {
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/** Node id → label, for turning brief/narrative references into readable prose. */
function nodeLabels(graph: CanvasGraph): Map<string, string> {
  return new Map(graph.nodes.map((node) => [node.id, node.label]));
}

/** Edge id → "SourceLabel → TargetLabel", for rendering a traced path. */
function edgeHops(graph: CanvasGraph): Map<string, string> {
  const labels = nodeLabels(graph);
  return new Map(
    graph.edges.map((edge) => [
      edge.id,
      `${labels.get(edge.source) ?? edge.source} → ${labels.get(edge.target) ?? edge.target}`,
    ]),
  );
}

function criterionStatements(criteria: readonly SuccessCriterion[]): Map<string, string> {
  return new Map(criteria.map((criterion) => [criterion.id, criterion.statement]));
}

/** A table cell: pipes would break the row. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

export function promptMarkdown(prompt: PromptDto, criteria: readonly SuccessCriterion[]): string {
  const lines: string[] = [prompt.markdown.trimEnd(), ``, `## Criteria`, ``];
  if (criteria.length > 0) {
    lines.push(
      `| Id | Kind | Statement |`,
      `| --- | --- | --- |`,
      ...criteria.map(
        (criterion) =>
          `| ${criterion.id} | ${cell(criterion.kind)} | ${cell(criterion.statement)} |`,
      ),
    );
  } else {
    lines.push(NONE);
  }
  return joinLines(lines);
}

export function briefMarkdown(
  brief: DesignBrief | null,
  graph: CanvasGraph,
  criteria: readonly SuccessCriterion[],
): string {
  const lines: string[] = [`# Brief — how the design meets each criterion`, ``];
  if (!brief || brief.bindings.length === 0) {
    lines.push(NONE);
    return joinLines(lines);
  }
  const labels = nodeLabels(graph);
  const hops = edgeHops(graph);
  const statements = criterionStatements(criteria);

  lines.push(`| Criterion | Claim | Components | Path |`, `| --- | --- | --- | --- |`);
  for (const binding of brief.bindings) {
    const statement = statements.get(binding.criterionId);
    const criterion = statement
      ? `${binding.criterionId} — ${cell(statement)}`
      : binding.criterionId;
    const components = binding.nodeIds.map((id) => labels.get(id) ?? id).join(', ') || '—';
    const path = (binding.path ?? []).map((edgeId) => hops.get(edgeId) ?? edgeId).join(', then ');
    lines.push(`| ${criterion} | ${cell(binding.claim)} | ${components} | ${path || '—'} |`);
  }
  return joinLines(lines);
}

export function narrativeMarkdown(
  narrative: DesignNarrative | null,
  graph: CanvasGraph,
  criteria: readonly SuccessCriterion[],
): string {
  const lines: string[] = [`# Narrative — the design walkthrough`, ``];
  if (!narrative) {
    lines.push(NONE);
    return joinLines(lines);
  }
  const labels = nodeLabels(graph);
  const statements = criterionStatements(criteria);
  if (narrative.overview && narrative.overview.trim().length > 0) {
    lines.push(`## Overview`, ``, narrative.overview.trim(), ``);
  }
  lines.push(`## Why each component is here`, ``);
  if (narrative.componentRationales.length > 0) {
    for (const rationale of narrative.componentRationales) {
      lines.push(
        `### ${labels.get(rationale.nodeId) ?? rationale.nodeId}`,
        ``,
        rationale.prose.trim(),
        ``,
      );
    }
  } else {
    lines.push(NONE, ``);
  }
  lines.push(`## How each criterion is met`, ``);
  if (narrative.criterionNarrations.length > 0) {
    for (const narration of narrative.criterionNarrations) {
      const statement = statements.get(narration.criterionId);
      lines.push(
        `### ${narration.criterionId}${statement ? ` — ${statement}` : ''}`,
        ``,
        narration.prose.trim(),
        ``,
      );
    }
  } else {
    lines.push(NONE);
  }
  return joinLines(lines);
}

export function feedbackMarkdown(
  evaluation: EvaluationDto | null,
  graph: CanvasGraph,
  criteria: readonly SuccessCriterion[],
  revisionNumber: number | null,
): string {
  const heading = revisionNumber !== null ? ` — revision #${revisionNumber}` : '';
  const lines: string[] = [`# Feedback${heading}`, ``];
  if (!evaluation || evaluation.status !== 'complete') {
    lines.push(`_Not graded yet (status: ${evaluation?.status ?? 'none'})._`);
    return joinLines(lines);
  }
  lines.push(`**${evaluation.overall ?? '—'}/100 · ${evaluation.decision ?? '—'}**`, ``);
  if (evaluation.stopReason) {
    lines.push(`_Stopped: ${humanizeToken(evaluation.stopReason).toLowerCase()}._`, ``);
  }

  lines.push(`## Dimensions`, ``, `| Dimension | Score |`, `| --- | --- |`);
  for (const [key, value] of Object.entries(evaluation.dimensions)) {
    lines.push(`| ${key} | ${value === null ? 'n/a' : value} |`);
  }

  const statements = criterionStatements(criteria);
  lines.push(``, `## Criteria`, ``);
  if (evaluation.criterionResults.length > 0) {
    lines.push(`| Criterion | Result | Confidence | Rationale |`, `| --- | --- | --- | --- |`);
    for (const row of evaluation.criterionResults) {
      const statement = statements.get(row.criterionId);
      lines.push(
        `| ${row.criterionId}${statement ? ` — ${cell(statement)}` : ''} | ${row.result} | ${
          row.confidence ?? '—'
        } | ${row.rationale ? cell(row.rationale) : '—'} |`,
      );
    }
  } else {
    lines.push(NONE);
  }

  const labels = nodeLabels(graph);
  lines.push(``, `## Findings`, ``);
  if (evaluation.findings.length > 0) {
    for (const finding of evaluation.findings) {
      const where = finding.nodeIds.map((id) => labels.get(id) ?? id).join(', ');
      const criteriaCited = finding.criterionIds.join(', ');
      lines.push(
        `- **[${finding.severity} · ${finding.lenses.join(', ')} · ${humanizeToken(finding.type)}]**${
          where ? ` (${where})` : ''
        }${criteriaCited ? ` — ${criteriaCited}` : ''}`,
        ...(finding.rationale ? [`  ${finding.rationale}`] : []),
      );
    }
  } else {
    lines.push(NONE);
  }
  lines.push(
    ``,
    `---`,
    `_run ${evaluation.runId} · iteration ${evaluation.iteration}${
      evaluation.llm.model ? ` · model ${evaluation.llm.model}` : ' · no model'
    }_`,
  );
  return joinLines(lines);
}

export function revisionsMarkdown(revisions: DesignRevisionSummaryDto[]): string {
  const lines: string[] = [`# Revisions`, ``];
  if (revisions.length === 0) {
    lines.push(NONE);
    return joinLines(lines);
  }
  lines.push(`| Rev | Score | Decision | Status |`, `| --- | --- | --- | --- |`);
  for (const rev of [...revisions].sort((a, b) => a.revisionNumber - b.revisionNumber)) {
    const grade = rev.evaluation;
    lines.push(
      `| ${rev.revisionNumber}${rev.origin === 'assistant' ? ' (AI)' : ''} | ${
        grade?.overall ?? '—'
      } | ${grade?.decision ?? '—'} | ${grade?.status ?? '—'} |`,
    );
  }
  return joinLines(lines);
}
