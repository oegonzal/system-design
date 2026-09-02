import {
  EVAL_DIMENSIONS,
  narrationToProse,
  type CanvasGraph,
  type DesignBrief,
  type DesignNarrative,
  type DesignRevisionSummaryDto,
  type EvaluationDto,
  type PromptDto,
} from '@sysdesign/contracts';

/**
 * Pure Markdown serializers for a practice run — one per artifact, each a
 * total function of DTOs (no DOM, no I/O), so they are unit-testable and the
 * export is a copy of a run that lives entirely outside the database.
 *
 * Style mirrors the server-side run-dump (`eval-dump.ts renderRunMarkdown`):
 * `#`/`##` headings, blank-line spacing, GitHub `| --- |` tables, `**bold**`,
 * `` `code` ``. Every id (node, edge, requirement) is resolved to the label the
 * author actually reads.
 */

const NONE = '_None._';

function joinLines(lines: string[]): string {
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/** Node id → label, for turning brief/narrative references into readable prose. */
function nodeLabels(graph: CanvasGraph): Map<string, string> {
  return new Map(graph.nodes.map((node) => [node.id, node.label]));
}

/** Edge id → "SourceLabel → TargetLabel", for rendering a traced flow path. */
function edgeHops(graph: CanvasGraph): Map<string, string> {
  const labels = nodeLabels(graph);
  return new Map(
    graph.edges.map((edge) => [
      edge.id,
      `${labels.get(edge.source) ?? edge.source} → ${labels.get(edge.target) ?? edge.target}`,
    ]),
  );
}

export function promptMarkdown(prompt: PromptDto): string {
  const lines: string[] = [
    `# Prompt — ${prompt.title}`,
    ``,
    `**Archetype:** ${prompt.archetype} · **Difficulty:** ${prompt.difficulty}`,
    ``,
    `## Scenario`,
    ``,
    prompt.scenario,
    ``,
    `## Functional requirements`,
    ``,
    ...(prompt.functionalRequirements.length > 0
      ? prompt.functionalRequirements.map((req, i) => `${i + 1}. ${req}`)
      : [NONE]),
    ``,
    `## Non-functional requirements`,
    ``,
  ];
  if (prompt.nonFunctionalRequirements.length > 0) {
    lines.push(
      `| Kind | Requirement | Target |`,
      `| --- | --- | --- |`,
      ...prompt.nonFunctionalRequirements.map(
        (nfr) => `| ${nfr.kind} | ${nfr.statement} | ${nfr.target ?? '—'} |`,
      ),
    );
  } else {
    lines.push(NONE);
  }
  lines.push(``, `## Scale targets`, ``);
  const s = prompt.scaleTargets;
  lines.push(
    `| Metric | Target |`,
    `| --- | --- |`,
    `| Concurrent users | ${s.concurrentUsers} |`,
    `| Requests/sec | ${s.requestsPerSecond} |`,
    `| Read:write | ${s.readWriteRatio} |`,
    `| p99 latency | ${s.p99LatencyMs} ms |`,
    `| Availability | ${s.availabilityPct} |`,
    ...(s.dataRetention ? [`| Data retention | ${s.dataRetention} |`] : []),
  );
  if (prompt.workflowSpec) {
    const w = prompt.workflowSpec;
    lines.push(
      ``,
      `## Business workflow`,
      ``,
      `- **Operations:** ${w.operations.map((o) => o.id).join(', ') || '—'}`,
      `- **Events:** ${w.events.map((e) => e.id).join(', ') || '—'}`,
      `- **Ingests:** ${w.ingests.map((i) => i.id).join(', ') || '—'}`,
      `- **Aggregations:** ${w.aggregations.map((a) => a.id).join(', ') || '—'}`,
    );
  }
  return joinLines(lines);
}

export function narrativeMarkdown(
  narrative: DesignNarrative | null,
  graph: CanvasGraph,
  prompt: PromptDto,
): string {
  const lines: string[] = [`# Narrative — the design walkthrough`, ``];
  if (!narrative || narrationToProse(narrative) === null) {
    lines.push(NONE);
    return joinLines(lines);
  }
  const labels = nodeLabels(graph);
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
  lines.push(`## How each requirement is served`, ``);
  if (narrative.flowNarrations.length > 0) {
    for (const flow of narrative.flowNarrations) {
      const req =
        prompt.functionalRequirements[flow.requirementIndex] ??
        `requirement #${flow.requirementIndex}`;
      lines.push(`### ${req}`, ``, flow.prose.trim(), ``);
    }
  } else {
    lines.push(NONE);
  }
  return joinLines(lines);
}

export function briefMarkdown(
  brief: DesignBrief | null,
  graph: CanvasGraph,
  prompt: PromptDto,
): string {
  const lines: string[] = [`# Brief — the graded explanation`, ``];
  if (!brief || (brief.nfrBindings.length === 0 && brief.flows.length === 0)) {
    lines.push(NONE);
    return joinLines(lines);
  }
  const labels = nodeLabels(graph);
  const hops = edgeHops(graph);
  const nfrStatement = new Map(
    prompt.nonFunctionalRequirements.map((nfr) => [nfr.id, nfr.statement]),
  );

  lines.push(`## Requirement bindings`, ``);
  if (brief.nfrBindings.length > 0) {
    lines.push(`| Requirement | Mechanism | Components | Note |`, `| --- | --- | --- | --- |`);
    for (const binding of brief.nfrBindings) {
      const req = nfrStatement.get(binding.nfrId) ?? binding.nfrId;
      const nodes = binding.nodeIds.map((id) => labels.get(id) ?? id).join(', ') || '—';
      lines.push(`| ${req} | \`${binding.mechanism}\` | ${nodes} | ${binding.note ?? ''} |`);
    }
  } else {
    lines.push(NONE);
  }
  lines.push(``, `## Traced flows`, ``);
  if (brief.flows.length > 0) {
    for (const flow of brief.flows) {
      const req =
        prompt.functionalRequirements[flow.requirementIndex] ??
        `requirement #${flow.requirementIndex}`;
      const path = flow.path.map((edgeId) => hops.get(edgeId) ?? edgeId).join(', then ');
      lines.push(`- **${req}:** ${path || '—'}${flow.note ? ` — ${flow.note}` : ''}`);
    }
  } else {
    lines.push(NONE);
  }
  return joinLines(lines);
}

export function feedbackMarkdown(
  evaluation: EvaluationDto | null,
  graph: CanvasGraph,
  revisionNumber: number | null,
): string {
  const heading = revisionNumber !== null ? ` — revision #${revisionNumber}` : '';
  const lines: string[] = [`# Feedback${heading}`, ``];
  if (!evaluation || evaluation.status !== 'complete') {
    lines.push(`_Not evaluated yet (status: ${evaluation?.status ?? 'none'})._`);
    return joinLines(lines);
  }
  lines.push(`**${evaluation.grade ?? '—'} · ${evaluation.overallScore ?? '—'}/100**`, ``);
  if (evaluation.capApplied) {
    const cap = evaluation.capApplied;
    const reason =
      cap.expectationId !== undefined
        ? `unmet ${cap.expectationId}`
        : `${cap.count} ${cap.severity} finding(s)`;
    lines.push(`> Grade capped at **${cap.maxGrade}** by ${reason}.`, ``);
  }
  lines.push(`## Dimension scores`, ``, `| Dimension | Score |`, `| --- | --- |`);
  const scores = evaluation.dimensionScores;
  for (const dim of EVAL_DIMENSIONS) {
    const value = scores?.[dim];
    lines.push(`| ${dim} | ${value === null || value === undefined ? 'n/a' : value} |`);
  }
  if (evaluation.summary) {
    lines.push(``, `## Summary`, ``, evaluation.summary);
  }
  const labels = nodeLabels(graph);
  lines.push(``, `## Findings`, ``);
  if (evaluation.findings.length > 0) {
    for (const finding of evaluation.findings) {
      const where = finding.affectedNodeIds.map((id) => labels.get(id) ?? id).join(', ');
      lines.push(
        `- **[${finding.severity}·${finding.dimension}] ${finding.title}**${where ? ` (${where})` : ''}`,
        `  ${finding.message}`,
      );
    }
  } else {
    lines.push(NONE);
  }
  if (evaluation.axes.length > 0) {
    lines.push(``, `## Advisory (AI axes)`, ``);
    for (const axis of evaluation.axes) {
      lines.push(
        `- **${axis.label}:** ${axis.score ?? '—'}${axis.summary ? ` — ${axis.summary}` : ''}`,
      );
    }
  }
  if (evaluation.scenarios.length > 0) {
    lines.push(``, `## Stress scenarios`, ``);
    for (const scenario of evaluation.scenarios) {
      lines.push(`- **${scenario.title} — ${scenario.verdict}:** ${scenario.story}`);
    }
  }
  lines.push(
    ``,
    `---`,
    `_engine ${evaluation.engineVersion} · profile ${evaluation.profileId}@${evaluation.profileVersion}${evaluation.criticModel ? ` · critic ${evaluation.criticModel}` : ' · deterministic'}_`,
  );
  return joinLines(lines);
}

export function revisionsMarkdown(revisions: DesignRevisionSummaryDto[]): string {
  const lines: string[] = [`# Revisions`, ``];
  if (revisions.length === 0) {
    lines.push(NONE);
    return joinLines(lines);
  }
  lines.push(`| Rev | Grade | Score | Status | Submitted |`, `| --- | --- | --- | --- | --- |`);
  for (const rev of [...revisions].sort((a, b) => a.revisionNumber - b.revisionNumber)) {
    lines.push(
      `| ${rev.revisionNumber} | ${rev.grade ?? '—'} | ${rev.overallScore ?? '—'} | ${rev.evaluationStatus ?? '—'} | ${rev.createdAt} |`,
    );
  }
  return joinLines(lines);
}
