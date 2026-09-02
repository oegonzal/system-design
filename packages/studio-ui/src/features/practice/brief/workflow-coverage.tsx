'use client';

import {
  judgeWorkflow,
  transitionItemId,
  type MechanismGraph,
  type NfrItem,
  type WorkflowItemVerdict,
  type WorkflowSpec,
} from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';
import { useMemo } from 'react';

import type { VerdictTone } from './mechanism-verdict';

/**
 * The workflow half of the brief surface: what the prompt's business layer
 * demands, each item ending in the verdict the grade will use — the SAME
 * `judgeWorkflow` the engine runs, over the same graph, live while the
 * author works.
 *
 * Read-only on purpose. Coverage is DERIVED from the canvas (fulfills,
 * emits, carries, knobs), so there is nothing here to bind and nothing new
 * for the store to hold: the way to move a chip is to change the design.
 */
export interface WorkflowCoverageProps {
  spec: WorkflowSpec;
  mechanismGraph: MechanismGraph;
  /** The prompt's NFRs, so each ingest shows the budget it is held to. */
  nfrs: readonly NfrItem[];
}

const TONE_TO_BADGE = {
  empty: 'neutral',
  uncorroborated: 'medium',
  contradicted: 'high',
  corroborated: 'success',
} as const;

const COPY: Record<VerdictTone, string> = {
  empty: 'Not started',
  uncorroborated: 'Not corroborated',
  contradicted: 'Contradicted by the diagram',
  corroborated: 'Corroborated',
};

/** Per-class "what would prove this", the MECHANISM_GUIDE.proof analogue. */
const PROOF: Record<WorkflowItemVerdict['itemClass'], string> = {
  'operation-command':
    'a component declares the linked command and a drawn call — or consuming from a channel — exercises it',
  'operation-query': 'a component declares the linked query and a drawn call carries it',
  event:
    'a command declares the emission, a channel carries the event as a message type, and a consuming edge leaves the channel',
  'ingest-push':
    'the external source is marked as pushing webhooks and its edge carries the intake command',
  'ingest-pull':
    'the importer has an edge to the external system and a periodic driver (a batch job, or a scheduler wired in)',
  aggregation: 'its source events demonstrably flow to something the serving query reads',
  transition: 'the operation, ingest or event that effects it is corroborated',
  entity: 'every one of its transitions is covered',
};

function toneOf(verdict: WorkflowItemVerdict | undefined): VerdictTone {
  if (!verdict || verdict.status === 'unclaimed') return 'empty';
  return verdict.status;
}

export function WorkflowItemChip({
  itemId,
  verdict,
}: {
  itemId: string;
  verdict: WorkflowItemVerdict | undefined;
}) {
  const tone = toneOf(verdict);
  return (
    <Stack gap={1} data-testid={`workflow-verdict-${itemId}`} data-tone={tone}>
      <Badge tone={TONE_TO_BADGE[tone]}>{COPY[tone]}</Badge>
      {tone !== 'corroborated' && verdict ? (
        <Text size="sm" tone="muted">
          Corroborated when {PROOF[verdict.itemClass]}.
        </Text>
      ) : null}
    </Stack>
  );
}

function Row({
  itemId,
  title,
  detail,
  verdict,
}: {
  itemId: string;
  title: string;
  detail?: string;
  verdict: WorkflowItemVerdict | undefined;
}) {
  return (
    <Stack gap={1}>
      <Text size="sm">{title}</Text>
      {detail ? (
        <Text size="sm" tone="muted">
          {detail}
        </Text>
      ) : null}
      <WorkflowItemChip itemId={itemId} verdict={verdict} />
    </Stack>
  );
}

export function WorkflowCoverage({ spec, mechanismGraph, nfrs }: WorkflowCoverageProps) {
  const byId = useMemo(() => {
    const report = judgeWorkflow(mechanismGraph, spec);
    return new Map(report.items.map((item) => [item.itemId, item]));
  }, [mechanismGraph, spec]);

  const budgetOf = (nfrId: string): string | null => {
    const nfr = nfrs.find((candidate) => candidate.id === nfrId);
    return nfr?.target ?? nfr?.statement ?? null;
  };

  return (
    <Stack gap={4} data-testid="workflow-coverage">
      <Heading level={3}>Workflow</Heading>
      <Text size="sm" tone="muted">
        The business layer this prompt states. Coverage is derived from your design — link
        operations with Fulfills, declare emissions, and wire the events — and each verdict below is
        the one the grade will use.
      </Text>

      <Stack gap={3}>
        <Heading level={4}>API contract</Heading>
        {spec.operations.map((op) => (
          <Row
            key={op.id}
            itemId={op.id}
            title={op.statement}
            detail={`${op.kind}${op.emits?.length ? ` · emits ${op.emits.join(', ')}` : ''}${
              op.onFailureEmits?.length ? ` · on failure ${op.onFailureEmits.join(', ')}` : ''
            }`}
            verdict={byId.get(op.id)}
          />
        ))}
      </Stack>

      <Stack gap={3}>
        <Heading level={4}>Events</Heading>
        {spec.events.map((event) => (
          <Row
            key={event.id}
            itemId={event.id}
            title={event.statement}
            verdict={byId.get(event.id)}
          />
        ))}
      </Stack>

      <Stack gap={3}>
        <Heading level={4}>Ingest SLAs</Heading>
        {spec.ingests.map((ingest) => (
          <Row
            key={ingest.id}
            itemId={ingest.id}
            title={ingest.statement}
            detail={`${ingest.mode}${budgetOf(ingest.nfrId) ? ` · ${budgetOf(ingest.nfrId)}` : ''}`}
            verdict={byId.get(ingest.id)}
          />
        ))}
      </Stack>

      {spec.aggregations.length > 0 ? (
        <Stack gap={3}>
          <Heading level={4}>Aggregations</Heading>
          {spec.aggregations.map((agg) => (
            <Row
              key={agg.id}
              itemId={agg.id}
              title={agg.statement}
              detail={`fed by ${agg.sourceEventIds.join(', ')}`}
              verdict={byId.get(agg.id)}
            />
          ))}
        </Stack>
      ) : null}

      {spec.entities.length > 0 ? (
        <Stack gap={3}>
          <Heading level={4}>Lifecycle</Heading>
          {spec.entities.map((entity) => (
            <Stack key={entity.id} gap={2}>
              <Text size="sm">{entity.name}</Text>
              {entity.transitions.map((transition, index) => (
                <Row
                  key={transitionItemId(entity.id, index)}
                  itemId={transitionItemId(entity.id, index)}
                  title={`${transition.from ?? '·'} → ${transition.to}`}
                  detail={`via ${transition.via}`}
                  verdict={byId.get(transitionItemId(entity.id, index))}
                />
              ))}
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
