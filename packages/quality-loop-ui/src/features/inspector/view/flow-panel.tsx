import styled from '@emotion/styled';
import {
  Alert,
  Badge,
  DECISION_TONE,
  Heading,
  Stack,
  Surface,
  Text,
} from '@sysdesign/design-system';

import type { LinkComponent } from '../../../components/link-context';
import type { ChildSummary, DataFlow, FlowStep, FlowTotals } from '../model/data-flow';
import { JsonTree } from './json-tree';
import { STEP_STATUS_TONE } from './tones';

/**
 * An orchestration as a column of steps: what each did, what it published for
 * the steps after it, and which children it opened.
 *
 * A linear column rather than a node graph. The steps run in declared order and
 * the only edges the record proves are blocks, so a graph library would add a
 * canvas with no keyboard story and no reading order to draw a straight line.
 *
 * The graph is partial and says so: an orchestrator's declared `needs` relation
 * is not published, so a block the record names is drawn and nothing else is
 * guessed at.
 *
 * A step can name a run it never opened — where a provided run stands in for a
 * step, the runner settles the step with that run's id and never starts it. Those
 * are listed as what stood in, never as what the step opened, because a skipped
 * step that reads as having opened a run is simply false.
 */

const Column = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;
`;

const Connector = styled.div`
  width: 2px;
  height: ${({ theme }) => theme.space[4]}px;
  margin-left: ${({ theme }) => theme.space[4]}px;
  background: ${({ theme }) => theme.color.border.default};
`;

const Ordinal = styled.span`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.text.muted};
`;

const NO_CHANGES = [] as const;

function ChildRow({
  child,
  href,
  link: Link,
}: {
  child: ChildSummary;
  href: string | null;
  link?: LinkComponent;
}) {
  const name = child.unread ? child.runId : `${child.pipeline ?? 'run'} · ${child.runId}`;
  return (
    <Stack direction="row" gap={2} align="baseline" wrap>
      {href !== null && Link !== undefined ? (
        <Link href={href}>{name}</Link>
      ) : (
        <Text as="span" size="sm">
          {name}
        </Text>
      )}
      {child.unread ? (
        <Badge tone="low">not read</Badge>
      ) : (
        <>
          {child.status !== null && <Badge tone="neutral">{child.status}</Badge>}
          {child.finalDecision !== null && (
            <Badge tone={DECISION_TONE[child.finalDecision]}>{child.finalDecision}</Badge>
          )}
          {child.overall !== null && <Badge tone="accent">overall {child.overall}</Badge>}
          {child.iterations !== null && (
            <Text as="span" tone="muted" size="sm">
              {child.iterations} iteration{child.iterations === 1 ? '' : 's'}
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}

function StepBlock({
  step,
  hrefForChild,
  link,
}: {
  step: FlowStep;
  hrefForChild?: (runId: string) => string;
  link?: LinkComponent;
}) {
  return (
    <Surface as="section" aria-label={`Step ${step.stepId}`}>
      <Stack gap={3}>
        <Stack direction="row" gap={2} align="baseline" wrap>
          <Ordinal>#{step.order + 1}</Ordinal>
          <Heading level={3}>{step.stepId}</Heading>
          <Badge tone={STEP_STATUS_TONE[step.status]}>{step.status}</Badge>
          {step.reason !== null && <Badge tone="medium">{step.reason}</Badge>}
          {Object.entries(step.counts).map(([name, value]) => (
            <Badge key={name} tone="neutral">
              {name} {value}
            </Badge>
          ))}
        </Stack>

        {step.blockedBy !== null && (
          <Text tone="secondary" size="sm">
            Blocked by <strong>{step.blockedBy}</strong> — the record names it, so this edge is
            proven rather than inferred.
          </Text>
        )}
        {step.blocked.length > 0 && (
          <Text tone="secondary" size="sm">
            Blocked {step.blocked.join(', ')}.
          </Text>
        )}
        {step.note !== null && step.note !== step.blockedBy && (
          <Text tone="secondary" size="sm">
            {step.note}
          </Text>
        )}

        {step.children.length > 0 && (
          <Stack gap={2}>
            <Heading level={4}>
              Opened {step.children.length} {step.children.length === 1 ? 'run' : 'runs'}
            </Heading>
            {step.children.map((child) => (
              <ChildRow
                key={child.runId}
                child={child}
                href={hrefForChild === undefined ? null : hrefForChild(child.runId)}
                link={link}
              />
            ))}
          </Stack>
        )}

        {step.standIns.length > 0 && (
          <Stack gap={2}>
            <Heading level={4}>
              {step.standIns.length === 1
                ? 'A run stood in for this step'
                : 'Runs stood in for this step'}
            </Heading>
            <Text tone="secondary" size="sm">
              This step never ran — the record stamps no start — so{' '}
              {step.standIns.length === 1
                ? 'the run below was supplied'
                : 'the runs below were supplied'}{' '}
              rather than opened here, and the steps after it read what they produced.
            </Text>
            {step.standIns.map((child) => (
              <ChildRow
                key={child.runId}
                child={child}
                href={hrefForChild === undefined ? null : hrefForChild(child.runId)}
                link={link}
              />
            ))}
          </Stack>
        )}

        {step.published !== null && (
          <Stack gap={2}>
            <Heading level={4}>Published for the steps after it</Heading>
            <JsonTree value={step.published} changes={NO_CHANGES} label={`${step.stepId} report`} />
          </Stack>
        )}
      </Stack>
    </Surface>
  );
}

export interface FlowPanelProps {
  flow: DataFlow;
  totals: FlowTotals;
  /** How many children the read bound left unread. */
  unread: number;
  hrefForChild?: (runId: string) => string;
  link?: LinkComponent;
}

export function FlowPanel({ flow, totals, unread, hrefForChild, link }: FlowPanelProps) {
  if (flow.steps.length === 0) {
    return (
      <Text tone="muted" size="sm">
        This orchestration has not started a step yet.
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Stack direction="row" gap={2} align="baseline" wrap>
        <Heading level={2}>{flow.orchestrator ?? 'Orchestration'}</Heading>
        {flow.pipeline !== null && <Badge tone="accent">target {flow.pipeline}</Badge>}
        <Badge tone="neutral">
          {totals.steps} {totals.steps === 1 ? 'step' : 'steps'}
        </Badge>
        <Badge tone="neutral">
          {totals.children} child {totals.children === 1 ? 'run' : 'runs'}
        </Badge>
        {totals.standIns > 0 && (
          <Badge tone="accent">
            {totals.standIns} stood in{totals.children === 0 ? ' — nothing was opened' : ''}
          </Badge>
        )}
        {totals.unread > 0 && <Badge tone="low">{totals.unread} not read</Badge>}
      </Stack>
      <Alert tone="info" title="What is drawn">
        Steps run in the order the orchestrator declares them. The only edges drawn are blocks the
        record names: a step skipped for a failed or skipped upstream records which step blocked it.
        The orchestrator&apos;s own dependency declaration is not published, so nothing else is
        inferred.
        {unread > 0
          ? ` ${unread} further ${unread === 1 ? 'run was' : 'runs were'} not read, so ${unread === 1 ? 'its' : 'their'} own actions are not in this log.`
          : ''}
      </Alert>
      <Column>
        {flow.steps.map((step, index) => (
          <li key={step.stepId}>
            {index > 0 && <Connector aria-hidden="true" />}
            <StepBlock step={step} hrefForChild={hrefForChild} link={link} />
          </li>
        ))}
      </Column>
    </Stack>
  );
}
