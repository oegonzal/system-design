import { Badge, Stack } from '@sysdesign/design-system';

import type { ActionScope } from '../model/action';

/**
 * Where an action happened: its orchestration, step, run and iteration.
 *
 * The labelling comes off the action itself rather than out of each view, which
 * is what keeps one rail able to show an orchestration, its steps, their child
 * runs and every iteration inside them without any view working out where it is.
 */

/** A run id is long and its tail is what distinguishes one from another. */
const shortRunId = (runId: string): string => (runId.length > 12 ? `…${runId.slice(-12)}` : runId);

/** A stable empty default: a fresh array each render would remount the chips. */
const NOTHING_OMITTED: readonly (keyof ActionScope)[] = [];

export interface ScopeChipsProps {
  scope: ActionScope;
  /** Omit the chips the surrounding view already states. */
  omit?: readonly (keyof ActionScope)[];
}

export function ScopeChips({ scope, omit = NOTHING_OMITTED }: ScopeChipsProps) {
  const hidden = new Set<string>(omit);
  const chips: { key: keyof ActionScope; text: string }[] = [];
  if (scope.orchestrationRunId !== undefined && !hidden.has('orchestrationRunId')) {
    chips.push({ key: 'orchestrationRunId', text: `orch ${shortRunId(scope.orchestrationRunId)}` });
  }
  if (scope.stepId !== undefined && !hidden.has('stepId')) {
    chips.push({ key: 'stepId', text: `step ${scope.stepId}` });
  }
  if (scope.runId !== undefined && !hidden.has('runId')) {
    chips.push({ key: 'runId', text: `run ${shortRunId(scope.runId)}` });
  }
  if (scope.iteration !== undefined && !hidden.has('iteration')) {
    chips.push({ key: 'iteration', text: `iteration ${scope.iteration}` });
  }
  if (chips.length === 0) return null;
  return (
    <Stack direction="row" gap={1} align="center" wrap>
      {chips.map((chip) => (
        <Badge key={chip.key} tone="neutral">
          {chip.text}
        </Badge>
      ))}
    </Stack>
  );
}
