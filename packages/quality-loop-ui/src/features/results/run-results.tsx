'use client';

import type { QualityRunStatus, RunTrace } from '@sysdesign/contracts';
import {
  Badge,
  DECISION_TONE,
  Heading,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@sysdesign/design-system';
import { useState } from 'react';

import { IterationPanel } from './iteration-panel';

export interface RunResultsProps {
  trace: RunTrace;
  /** The run's own status: a trace with no stop reason is still running, or failed partway. */
  status: QualityRunStatus;
}

/** Why the verdict stands where it does: the loop's stop, or the run's state when it never chose one. */
function standingOf(trace: RunTrace, status: QualityRunStatus): string {
  const best = `iteration ${trace.bestIteration} of ${trace.iterations.length}`;
  if (trace.stopReason !== null) return `stopped: ${trace.stopReason} · best ${best}`;
  return status === 'failed'
    ? `failed partway · best ${best} finished`
    : `still running · best so far ${best} finished`;
}

/**
 * The run's verdict and one tab per iteration, opening on the best one.
 * Mount it keyed by run id so a new run starts on its own best iteration.
 * While the run is still going — or once it failed partway — the trace holds
 * the iterations finished so far: the verdict is its standing, and it says
 * so rather than a stop.
 */
export function RunResults({ trace, status }: RunResultsProps) {
  const [selected, setSelected] = useState(String(trace.bestIteration));
  const standing = standingOf(trace, status);

  return (
    <Stack gap={5}>
      <Stack direction="row" gap={3} align="center" wrap>
        <Heading level={2}>Results</Heading>
        <Badge tone={DECISION_TONE[trace.finalDecision]}>{trace.finalDecision}</Badge>
        <Text as="span" tone="secondary">
          {standing} · {trace.contract.criteria.length} criteria
        </Text>
      </Stack>

      {trace.lessons.length > 0 && (
        <Stack gap={2}>
          <Heading level={3}>Lessons</Heading>
          <Stack as="ul" gap={1} style={{ margin: 0, padding: 0 }}>
            {trace.lessons.map((lesson) => (
              <li key={`${lesson.kind}:${lesson.subject}`} style={{ listStyle: 'none' }}>
                <Stack direction="row" gap={2} align="center" wrap>
                  <Badge>{lesson.kind}</Badge>
                  <Text as="span" size="sm">
                    {lesson.subject}
                  </Text>
                  <Text as="span" tone="muted" size="sm">
                    iterations {lesson.iterations.join(' → ')} — {lesson.detail}
                  </Text>
                </Stack>
              </li>
            ))}
          </Stack>
        </Stack>
      )}

      <Tabs value={selected} onChange={setSelected}>
        <TabList aria-label="Iterations">
          {trace.iterations.map((iteration) => (
            <Tab key={iteration.iteration} value={String(iteration.iteration)}>
              Iteration {iteration.iteration} · {iteration.decision.finalDecision}
            </Tab>
          ))}
        </TabList>
        {trace.iterations.map((iteration) => (
          <TabPanel key={iteration.iteration} value={String(iteration.iteration)}>
            <IterationPanel iteration={iteration} criteria={trace.contract.criteria} />
          </TabPanel>
        ))}
      </Tabs>
    </Stack>
  );
}
