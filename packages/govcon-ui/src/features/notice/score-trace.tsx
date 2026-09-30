import type { Lead } from '@sysdesign/contracts';
import { Badge, Heading, Meter, Stack, Table, Text } from '@sysdesign/design-system';

import { SCORE_TONE, TIER_TONE } from '../tones';

export interface ScoreTraceProps {
  lead: Lead;
}

/** The score with every point attributed: a meter, the tier, and each factor's value, weight, points and evidence. */
export function ScoreTrace({ lead }: ScoreTraceProps) {
  return (
    <Stack gap={2}>
      <Heading level={3}>Score</Heading>
      {lead.excluded ? (
        <Text tone="secondary">
          Excluded by {lead.excluded.factor}: {lead.excluded.reason}
        </Text>
      ) : (
        <Meter
          label={`Score ${lead.score.toFixed(1)} · ${lead.tier ?? 'unranked'}`}
          value={lead.score}
          tone={lead.tier ? SCORE_TONE[lead.tier] : 'danger'}
        />
      )}
      {lead.tier && (
        <div>
          <Badge tone={TIER_TONE[lead.tier]}>{lead.tier}</Badge>
        </div>
      )}
      <Table aria-label="Factor trace">
        <thead>
          <tr>
            <th>Factor</th>
            <th>Value</th>
            <th>Weight</th>
            <th>Points</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {lead.factors.map((factor) => (
            <tr key={factor.id}>
              <td>{factor.id}</td>
              <td>{factor.value.toFixed(2)}</td>
              <td>{factor.weight.toFixed(2)}</td>
              <td>{factor.points.toFixed(1)}</td>
              <td>{factor.evidence.join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Stack>
  );
}
