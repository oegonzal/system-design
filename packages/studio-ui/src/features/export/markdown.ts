import type {
  CanvasGraph,
  DesignBrief,
  DesignNarrative,
  DesignRevisionSummaryDto,
  EvaluationDto,
  PromptDto,
  QualityRunStatus,
  SuccessCriterion,
} from '@sysdesign/contracts';
import { markdownCell, nodeLabel, pathStages, proseLocations } from '@sysdesign/contracts';

import { decisionInWords } from '../evaluation/decision-reason';
import { degradedNote } from '../evaluation/degraded';
import { OFF_CANVAS_COPY, type FeedbackSubject } from '../evaluation/feedback-subject';
import { humanizeToken, lensName } from '../evaluation/humanize';
import { lensProse } from '../evaluation/lens-prose';
import { cachedStandingOf, formatScore, GRADE_STANDING_LABEL } from '../evaluation/score';
import { STOPPED_COPY } from '../evaluation/stop-reason';
import { unscoredNote } from '../evaluation/unscored';
import { humanizeKind } from '../prompts/criteria';

/**
 * Pure Markdown serializers for a practice run — one per artifact, each a
 * total function of DTOs (no DOM, no I/O), so they are unit-testable and the
 * export is a copy of a run that lives entirely outside the database.
 *
 * `#`/`##` headings, blank-line spacing, GitHub `| --- |` tables, `**bold**`,
 * `` `code` ``. Every id (node, edge, criterion, finding) is resolved to the
 * label or statement the author actually reads, every wire token (a criterion
 * kind, a dimension, a result, a lens) is printed in the words the studio
 * shows it in, and every score and grading status is printed the way the
 * studio prints it (`formatScore`, `GRADE_STANDING_LABEL`) — the export is
 * the panel's words, on paper: the same sentence for a decision
 * (`decisionInWords`) and a coach's stop (`STOPPED_COPY`), the same caveat
 * for a grade computed without some of its lens samples (`degradedNote`), for
 * one that earned no score (`unscoredNote`) and for a canvas that has moved
 * on to the draft (`OFF_CANVAS_COPY`), the same prose for every rationale
 * (`lensProse`).
 */

const NONE = '_None._';

/** What the feedback file says in place of a grade the revision does not have yet. */
const UNGRADED: Record<Exclude<QualityRunStatus, 'complete'> | 'absent', string> = {
  absent: '_Not graded yet._',
  running: '_Not graded yet — grading is still running._',
  failed: '_Not graded — grading failed for this revision._',
};

function joinLines(lines: string[]): string {
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/** Node id → label, for turning brief/narrative references into readable prose. */
export function nodeLabels(graph: CanvasGraph): Map<string, string> {
  // The same name the lens was shown, so a finding's prose and this document
  // cannot disagree about what a node is called.
  return new Map(graph.nodes.map((node) => [node.id, nodeLabel(node)]));
}

/** Edge id → "SourceLabel → TargetLabel (sync)", for rendering a traced path hop by hop with its call style. */
function edgeHops(graph: CanvasGraph): Map<string, string> {
  const labels = nodeLabels(graph);
  return new Map(
    graph.edges.map((edge) => [
      edge.id,
      `${labels.get(edge.source) ?? edge.source} → ${labels.get(edge.target) ?? edge.target} (${edge.kind})`,
    ]),
  );
}

function criterionStatements(criteria: readonly SuccessCriterion[]): Map<string, string> {
  return new Map(criteria.map((criterion) => [criterion.id, criterion.statement]));
}

/**
 * A copy of `items` in the order their keys take in `order` — the diagram's
 * node order, the rubric's criterion order — with anything `order` does not
 * name kept after, as stored. Never applied to what is stored: positional
 * references (`rationale.N`, `narration.N`) depend on the stored order.
 */
function inOrderOf<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  const rankOf = (item: T) => rank.get(keyOf(item)) ?? order.length;
  return [...items].sort((a, b) => rankOf(a) - rankOf(b));
}

export function promptMarkdown(prompt: PromptDto, criteria: readonly SuccessCriterion[]): string {
  const lines: string[] = [prompt.markdown.trimEnd(), ``, `## Criteria`, ``];
  if (criteria.length > 0) {
    lines.push(
      `| Id | Kind | Statement |`,
      `| --- | --- | --- |`,
      ...criteria.map(
        (criterion) =>
          `| ${criterion.id} | ${markdownCell(humanizeKind(criterion.kind))} | ${markdownCell(
            criterion.statement,
          )} |`,
      ),
    );
  } else {
    lines.push(NONE);
  }
  return joinLines(lines);
}

/** What the lifecycle declares for a traced path, in a cell: its way in and whether it rests. */
function tracingCell(
  graph: CanvasGraph,
  path: readonly string[],
  labels: ReadonlyMap<string, string>,
): string {
  if (path.length === 0) return '—';
  const tracing = pathStages(graph, path);
  if (tracing.firstNodeId === null) return '—';
  const name = (id: string) => labels.get(id) ?? id;
  if (tracing.entry === null)
    return `begins at ${name(tracing.firstNodeId)}, not where a request enters`;
  const missing = tracing.stages
    .filter((item) => !item.conditional && item.covered === null)
    .map((item) => item.stage.label);
  const wayIn =
    tracing.stages.length === 0
      ? 'begins inside'
      : missing.length === 0
        ? 'complete way in'
        : `missing: ${missing.join(', ')}`;
  const rest =
    tracing.rest === null
      ? ''
      : tracing.rest.atRest
        ? '; at rest'
        : `; ends at ${name(tracing.rest.nodeId)}, not at rest`;
  return `${wayIn}${rest}`;
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

  lines.push(
    `| Criterion | Claim | Components | Path | Tracing | Why this, not another |`,
    `| --- | --- | --- | --- | --- | --- |`,
  );
  for (const binding of brief.bindings) {
    const statement = statements.get(binding.criterionId);
    const criterion = statement
      ? `${binding.criterionId} — ${markdownCell(statement)}`
      : binding.criterionId;
    const components = binding.nodeIds.map((id) => labels.get(id) ?? id).join(', ') || '—';
    const path = (binding.path ?? []).map((edgeId) => hops.get(edgeId) ?? edgeId).join(', then ');
    lines.push(
      `| ${criterion} | ${markdownCell(binding.claim)} | ${markdownCell(components)} | ${
        markdownCell(path) || '—'
      } | ${markdownCell(tracingCell(graph, binding.path ?? [], labels))} | ${
        markdownCell(binding.tradeoff ?? '') || '—'
      } |`,
    );
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
  const assumptions = narrative.assumptions ?? [];
  if (assumptions.length > 0) {
    lines.push(`## Assumptions`, ``, ...assumptions.map((text) => `- ${text.trim()}`), ``);
  }
  lines.push(`## Why each component is here`, ``);
  if (narrative.componentRationales.length > 0) {
    const nodeOrder = graph.nodes.map((node) => node.id);
    for (const rationale of inOrderOf(
      narrative.componentRationales,
      (item) => item.nodeId,
      nodeOrder,
    )) {
      lines.push(
        `### ${labels.get(rationale.nodeId) ?? rationale.nodeId}`,
        ``,
        rationale.prose.trim(),
        ``,
        ...(rationale.tradeoff ? [`_Instead of:_ ${rationale.tradeoff.trim()}`, ``] : []),
      );
    }
  } else {
    lines.push(NONE, ``);
  }
  lines.push(`## Decisions the design rests on`, ``);
  const decisions = narrative.decisions ?? [];
  if (decisions.length > 0) {
    for (const decision of decisions) {
      const concerns = (decision.nodeIds ?? []).map((id) => labels.get(id) ?? id).join(', ');
      lines.push(
        `### ${decision.choice.trim()}`,
        ``,
        `- Instead of: ${decision.alternative?.trim() || '—'}`,
        `- Cost: ${decision.cost?.trim() || '—'}`,
        `- Reconsider when: ${decision.reconsiderWhen?.trim() || '—'}`,
        ...(concerns.length > 0 ? [`- Concerns: ${concerns}`] : []),
        ``,
      );
    }
  } else {
    lines.push(NONE, ``);
  }
  lines.push(`## How each criterion is met`, ``);
  if (narrative.criterionNarrations.length > 0) {
    const criterionOrder = criteria.map((criterion) => criterion.id);
    for (const narration of inOrderOf(
      narrative.criterionNarrations,
      (item) => item.criterionId,
      criterionOrder,
    )) {
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

/** Where the exported diagram stands against the revision the feedback is about, as the panel says it. */
const DRAFT_DIAGRAM = `${OFF_CANVAS_COPY} The diagram in this export is the draft.`;

/**
 * The graph is not consulted: every location a finding cites arrives already
 * labelled by the grader, so the export reads the same words as the panel —
 * a finding is where its lens cited, and its prose reads every place it
 * names, cited or merely mentioned, by label. A grade that earned no score
 * prints no number, decision or dimension: it says why, as the panel does.
 */
export function feedbackMarkdown(
  evaluation: EvaluationDto | null,
  criteria: readonly SuccessCriterion[],
  subject: FeedbackSubject | null,
): string {
  const heading = subject !== null ? ` — revision #${subject.revisionNumber}` : '';
  const lines: string[] = [`# Feedback${heading}`, ``];
  if (subject !== null && !subject.onCanvas) lines.push(`_${DRAFT_DIAGRAM}_`, ``);
  if (!evaluation) {
    lines.push(UNGRADED.absent);
    return joinLines(lines);
  }
  if (evaluation.status !== 'complete') {
    lines.push(UNGRADED[evaluation.status]);
    return joinLines(lines);
  }
  const unscored = unscoredNote(evaluation);
  if (unscored !== null) {
    lines.push(`**${unscored.title}**`, ``, unscored.body, ``);
  } else {
    lines.push(`**${formatScore(evaluation.overall)}/100 · ${evaluation.decision ?? '—'}**`, ``);
    const reason = decisionInWords(
      {
        decision: evaluation.decision,
        reason: evaluation.decisionReason,
        basis: evaluation.decisionBasis,
      },
      { findings: evaluation.findings, criteria },
    );
    if (reason) lines.push(reason, ``);
    if (evaluation.stopReason) {
      lines.push(STOPPED_COPY[evaluation.stopReason], ``);
    }
    const degraded = degradedNote(evaluation.degraded);
    if (degraded !== null) {
      lines.push(`_${degraded}_`, ``);
    }

    lines.push(`## Dimensions`, ``, `| Dimension | Score |`, `| --- | --- |`);
    for (const [key, value] of Object.entries(evaluation.dimensions)) {
      lines.push(
        `| ${humanizeToken(key)} | ${value === null ? 'Not assessed' : formatScore(value)} |`,
      );
    }
    lines.push(``);
  }

  const statements = criterionStatements(criteria);
  lines.push(`## Criteria`, ``);
  if (evaluation.criterionResults.length > 0) {
    lines.push(`| Criterion | Result | Confidence | Rationale |`, `| --- | --- | --- | --- |`);
    for (const row of evaluation.criterionResults) {
      const statement = statements.get(row.criterionId);
      // A criterion no lens settled carries no lens's words, as on the panel.
      const settled = row.result !== 'unassessed';
      lines.push(
        `| ${row.criterionId}${statement ? ` — ${markdownCell(statement)}` : ''} | ${humanizeToken(
          row.result,
        )} | ${(settled && row.confidence) || '—'} | ${
          settled && row.rationale
            ? markdownCell(lensProse(row.rationale, proseLocations(row)))
            : '—'
        } |`,
      );
    }
  } else {
    lines.push(NONE);
  }

  lines.push(``, `## Findings`, ``);
  if (evaluation.findings.length > 0) {
    for (const finding of evaluation.findings) {
      const where = finding.locations.map((location) => location.label).join(', ');
      const criteriaCited = finding.criterionIds.join(', ');
      lines.push(
        `- **[${finding.severity} · ${finding.lenses.map(lensName).join(', ')} · ${humanizeToken(finding.type)}]**${
          where ? ` (${where})` : ''
        }${criteriaCited ? ` — ${criteriaCited}` : ''}`,
        ...(finding.rationale
          ? [`  ${lensProse(finding.rationale, proseLocations(finding))}`]
          : []),
      );
    }
  } else {
    lines.push(NONE);
  }
  lines.push(
    ``,
    `---`,
    `_run ${evaluation.runId} · iteration ${evaluation.iteration} · model ${evaluation.llm.model}_`,
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
    const standing = grade === null ? null : cachedStandingOf(grade);
    // A grade that earned no score has no decision to print: it is no verdict.
    const decision = standing === 'unscored' ? null : grade?.decision;
    lines.push(
      `| ${rev.revisionNumber}${rev.origin === 'assistant' ? ' (AI)' : ''} | ${formatScore(
        grade?.overall,
      )} | ${decision ?? '—'} | ${standing === null ? '—' : GRADE_STANDING_LABEL[standing]} |`,
    );
  }
  return joinLines(lines);
}
