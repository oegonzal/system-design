'use client';

import styled from '@emotion/styled';
import type { PromptDto } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Surface, Text } from '@sysdesign/design-system';

export interface PromptPaneProps {
  prompt: PromptDto;
}

const Checklist = styled.ul`
  margin: 0;
  padding-left: ${({ theme }) => theme.space[6]}px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  color: ${({ theme }) => theme.color.text.primary};
  font-size: ${({ theme }) => theme.font.size.md};
`;

const TargetGrid = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: ${({ theme }) => `${theme.space[2]}px ${theme.space[5]}px`};

  dt {
    font-size: ${({ theme }) => theme.font.size.sm};
    color: ${({ theme }) => theme.color.text.muted};
  }

  dd {
    margin: 0;
    font-size: ${({ theme }) => theme.font.size.sm};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    color: ${({ theme }) => theme.color.text.primary};
    font-variant-numeric: tabular-nums;
  }
`;

/**
 * The prompt, readable at a glance while designing: scenario, functional
 * requirements as a checklist, NFRs with their measurable targets, and the
 * scale targets the eval engine grades against. Pure props — Storybook-safe.
 */
export function PromptPane({ prompt }: PromptPaneProps) {
  const targets = prompt.scaleTargets;

  return (
    <Stack gap={5} data-testid="prompt-pane">
      <Stack gap={2}>
        <Heading level={2}>{prompt.title}</Heading>
        <Stack direction="row" gap={2} wrap>
          <Badge tone="accent">{prompt.archetype}</Badge>
          <Badge tone="neutral">{prompt.difficulty}</Badge>
          {prompt.llmEnriched ? <Badge tone="neutral">ai-enriched</Badge> : null}
        </Stack>
      </Stack>

      <Text size="sm">{prompt.scenario}</Text>

      <Stack gap={2}>
        <Heading level={3}>Functional requirements</Heading>
        <Checklist>
          {prompt.functionalRequirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </Checklist>
      </Stack>

      <Stack gap={2}>
        <Heading level={3}>Non-functional requirements</Heading>
        <Stack as="ul" gap={2}>
          {prompt.nonFunctionalRequirements.map((nfr) => (
            <li key={`${nfr.kind}-${nfr.statement}`}>
              <Stack direction="row" gap={2} align="baseline" wrap>
                <Badge tone="neutral">{nfr.kind}</Badge>
                <Text as="span" size="sm">
                  {nfr.statement}
                </Text>
                {nfr.target ? (
                  <Text as="span" size="sm" tone="muted">
                    ({nfr.target})
                  </Text>
                ) : null}
              </Stack>
            </li>
          ))}
        </Stack>
      </Stack>

      <Surface padding={4}>
        <Stack gap={3}>
          <Heading level={3}>Scale targets</Heading>
          <TargetGrid>
            <dt>Concurrent users</dt>
            <dd>{targets.concurrentUsers.toLocaleString('en-US')}</dd>
            <dt>Requests / second</dt>
            <dd>{targets.requestsPerSecond.toLocaleString('en-US')}</dd>
            <dt>Read : write</dt>
            <dd>{targets.readWriteRatio}</dd>
            <dt>p99 latency</dt>
            <dd>{targets.p99LatencyMs} ms</dd>
            <dt>Availability</dt>
            <dd>{targets.availabilityPct}%</dd>
            {targets.dataRetention ? (
              <>
                <dt>Data retention</dt>
                <dd>{targets.dataRetention}</dd>
              </>
            ) : null}
          </TargetGrid>
        </Stack>
      </Surface>
    </Stack>
  );
}
