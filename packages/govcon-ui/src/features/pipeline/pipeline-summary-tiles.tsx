import { BID_STAGES, DUE_SOON_DAYS, type BidPipelineSummary } from '@sysdesign/contracts';
import { Badge, Stack, Text } from '@sysdesign/design-system';

import { BID_STAGE_TONE } from '../tones';

export interface PipelineSummaryTilesProps {
  summary: BidPipelineSummary;
}

/** The pipeline counted: every stage, zero included, what is due inside the week, the total. */
export function PipelineSummaryTiles({ summary }: PipelineSummaryTilesProps) {
  return (
    <Stack as="ul" direction="row" gap={3} wrap aria-label="Pipeline summary">
      {BID_STAGES.map((stage) => (
        <li key={stage}>
          <Badge tone={BID_STAGE_TONE[stage]}>
            {stage} {summary.byStage[stage]}
          </Badge>
        </li>
      ))}
      <li>
        <Text as="span" size="sm">
          {summary.dueSoon} due inside {DUE_SOON_DAYS} days · {summary.total} tracked
        </Text>
      </li>
    </Stack>
  );
}
