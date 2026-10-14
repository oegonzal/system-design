import {
  DUE_SOON_DAYS,
  TARGET_KINDS,
  TARGET_STAGES,
  type TargetStage,
  type TargetSummary,
} from '@sysdesign/contracts';
import { Badge, Stack, Text } from '@sysdesign/design-system';

import { TARGET_STAGE_TONE } from '../tones';
import { TARGET_KIND_LABEL } from './target-kinds';

export interface TargetSummaryTilesProps {
  summary: TargetSummary;
}

/** The targets counted: per kind every stage, zero included, then what is due inside the week and the total. */
export function TargetSummaryTiles({ summary }: TargetSummaryTilesProps) {
  return (
    <Stack gap={2}>
      {TARGET_KINDS.map((kind) => {
        const counts: Partial<Record<TargetStage, number>> = summary.byKind[kind];
        return (
          <Stack
            key={kind}
            as="ul"
            direction="row"
            gap={3}
            wrap
            aria-label={`${TARGET_KIND_LABEL[kind]}s by stage`}
          >
            <li>
              <Text as="span" size="sm" tone="secondary">
                {TARGET_KIND_LABEL[kind]}s
              </Text>
            </li>
            {TARGET_STAGES[kind].map((stage) => (
              <li key={stage}>
                <Badge tone={TARGET_STAGE_TONE[stage]}>
                  {stage} {counts[stage] ?? 0}
                </Badge>
              </li>
            ))}
          </Stack>
        );
      })}
      <Text size="sm">
        {summary.dueSoon} due inside {DUE_SOON_DAYS} days · {summary.total} tracked
      </Text>
    </Stack>
  );
}
