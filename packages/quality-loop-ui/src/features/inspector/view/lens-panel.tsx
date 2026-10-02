import styled from '@emotion/styled';
import { Badge, Heading, RESULT_TONE, Stack, Surface, Text } from '@sysdesign/design-system';
import type { BadgeTone } from '@sysdesign/design-system';

import type {
  Contribution,
  LensContribution,
  LensContributions,
  LensSample,
} from '../model/lens-contributions';

/**
 * What each critic and evaluator contributed, and what became of every item.
 *
 * The agreement rule is printed beside the outcome because it is the thing most
 * worth understanding here: a defect counts when *one lens* saw it in `minHits`
 * of *its own* samples, so two lenses seeing it once each is two opinions rather
 * than agreement — and a lost sample silences the lens it came from.
 *
 * The edge from a sample's finding to the merged defect it joined is derived by
 * this client, not carried on the wire, and every row that shows one says so.
 */

const FATE_TONE: Record<Contribution['fate'], BadgeTone> = {
  confirmed: 'success',
  reconciled: 'accent',
  discarded: 'medium',
  inadmissible: 'high',
  unaccounted: 'critical',
  settled: 'success',
  unassessed: 'medium',
};

const FATE_WORDS: Record<Contribution['fate'], string> = {
  confirmed: 'confirmed — priced',
  reconciled: 'confirmed — charged to a criterion instead',
  discarded: 'discarded — not enough agreement',
  inadmissible: 'inadmissible',
  unaccounted: 'no ledger entry matches',
  settled: 'settled',
  unassessed: 'unassessed — below the agreement bar',
};

const Item = styled.li`
  list-style: none;
  padding: ${({ theme }) => `${theme.space[2]}px 0`};
  border-top: 1px solid ${({ theme }) => theme.color.border.subtle};
`;

const Refs = styled.code`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.text.muted};
  overflow-wrap: anywhere;
`;

function ContributionRow({ item }: { item: Contribution }) {
  return (
    <Item>
      <Stack gap={1}>
        <Stack direction="row" gap={2} align="baseline" wrap>
          {item.kind === 'finding' ? (
            <>
              <Badge tone={item.severity}>{item.severity}</Badge>
              <Text as="span" size="sm">
                {item.type}
              </Text>
            </>
          ) : (
            <>
              <Badge tone={RESULT_TONE[item.result]}>{item.result}</Badge>
              <Text as="span" size="sm">
                {item.criterionId}
              </Text>
            </>
          )}
          <Badge tone={FATE_TONE[item.fate]}>{FATE_WORDS[item.fate]}</Badge>
          {item.detail !== null && (
            <Text as="span" tone="muted" size="sm">
              {item.detail}
            </Text>
          )}
        </Stack>

        {item.kind === 'finding' ? (
          <Stack direction="row" gap={2} align="baseline" wrap>
            <Refs>{item.locationRefs.join(' ') || 'no locations'}</Refs>
            {item.hits !== null && <Badge tone="neutral">{item.hits} samples saw it</Badge>}
            {item.lenses.length > 0 && (
              <Text as="span" tone="muted" size="sm">
                confirmed by {item.lenses.join(', ')}
              </Text>
            )}
            {item.reconciledTo !== null && (
              <Badge tone="accent">already charged to {item.reconciledTo}</Badge>
            )}
          </Stack>
        ) : (
          <Stack direction="row" gap={2} align="baseline" wrap>
            {item.settled !== null && item.settled !== item.result && (
              <Badge tone={RESULT_TONE[item.settled]}>ledger settled on {item.settled}</Badge>
            )}
            {item.hits !== null && <Badge tone="neutral">{item.hits} samples judged it</Badge>}
            <Refs>{item.locationRefs.join(' ') || 'no locations'}</Refs>
          </Stack>
        )}

        <Text tone="secondary" size="sm">
          {item.rationale}
        </Text>
        {item.kind === 'finding' && item.groupKey !== null && item.groupKey !== item.ownKey && (
          <Text tone="muted" size="sm">
            Joined to the merged defect <Refs>{item.groupKey}</Refs> — an edge derived here by the
            engine&apos;s own identity rule, not carried on the wire.
          </Text>
        )}
      </Stack>
    </Item>
  );
}

function SampleBlock({ sample, minHits }: { sample: LensSample; minHits: number }) {
  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2} align="center" wrap>
        <Heading level={4}>
          {sample.sample === null ? 'the lens' : `sample ${sample.sample}`}
        </Heading>
        {sample.missing && <Badge tone="high">nothing recorded</Badge>}
        {sample.diagnostic !== null && (
          <>
            <Badge tone={sample.diagnostic.reason === 'not-applicable' ? 'neutral' : 'critical'}>
              {sample.diagnostic.reason}
            </Badge>
            {sample.diagnostic.detail !== null && (
              <Text as="span" tone="muted" size="sm">
                {sample.diagnostic.detail}
              </Text>
            )}
          </>
        )}
        {sample.items.length > 0 && <Badge tone="neutral">{sample.items.length} items</Badge>}
      </Stack>
      {sample.missing && (
        <Text tone="secondary" size="sm">
          This sample was declared but the record holds nothing for it. A lost sample does not only
          thin the evidence — agreement is counted within one lens, so anything only this sample saw
          could not reach the {minHits}-sample bar.
        </Text>
      )}
      {sample.items.length > 0 && (
        <Stack as="ul" gap={0} style={{ margin: 0, padding: 0 }}>
          {sample.items.map((item) => (
            <ContributionRow
              key={item.kind === 'finding' ? item.ownKey : item.criterionId}
              item={item}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function LensBlock({ lens }: { lens: LensContribution }) {
  const declared = lens.declared;
  const stale = lens.samples.some(
    (sample) => sample.iteration !== null && sample.iteration !== lens.samples[0].iteration,
  );
  return (
    <Surface as="section" aria-label={lens.lens}>
      <Stack gap={3}>
        <Stack direction="row" gap={2} align="baseline" wrap>
          <Heading level={3}>{lens.lens}</Heading>
          <Badge tone="neutral">{lens.kind}</Badge>
          {declared === null ? (
            <Badge tone="high">not declared by this pipeline</Badge>
          ) : (
            <>
              <Badge tone="neutral">{declared.samples} samples declared</Badge>
              <Badge tone="neutral">at most {declared.maxItems} items</Badge>
              <Badge tone="neutral">{declared.maxTokens} tokens</Badge>
              {declared.consumes.length > 0 && (
                <Badge tone="accent">reads upstream {declared.consumes.join(', ')}</Badge>
              )}
              {declared.criterionKinds !== undefined && declared.criterionKinds.length > 0 && (
                <Badge tone="accent">judges {declared.criterionKinds.join(', ')}</Badge>
              )}
            </>
          )}
          {stale && <Badge tone="medium">samples from different iterations</Badge>}
        </Stack>
        {lens.samples.map((sample) => (
          <SampleBlock key={String(sample.sample)} sample={sample} minHits={lens.minHits} />
        ))}
        {lens.unexplainedDiscards.length > 0 && (
          <Stack gap={1}>
            <Heading level={4}>Discarded, with no recorded sample to account for it</Heading>
            {lens.unexplainedDiscards.map((item) => (
              <Text key={item.key} tone="secondary" size="sm">
                {item.key} — {item.reason}, {item.detail}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </Surface>
  );
}

export interface LensPanelProps {
  contributions: LensContributions;
}

export function LensPanel({ contributions }: LensPanelProps) {
  const { critics, evaluators, minHits, undeclared } = contributions;
  if (critics.length === 0 && evaluators.length === 0) {
    return (
      <Text tone="muted" size="sm">
        No lens has reported at this point in the run.
      </Text>
    );
  }
  return (
    <Stack gap={5}>
      <Text tone="secondary" size="sm">
        A defect counts when one lens saw it in {minHits} of its own samples. Two lenses seeing it
        once each is two opinions, not agreement.
        {undeclared
          ? ' The pipeline registry was not available, so the declared bounds are not shown.'
          : ''}
      </Text>
      {critics.length > 0 && (
        <Stack gap={4}>
          <Heading level={2}>Critics — what is wrong</Heading>
          {critics.map((lens) => (
            <LensBlock key={lens.lens} lens={lens} />
          ))}
        </Stack>
      )}
      {evaluators.length > 0 && (
        <Stack gap={4}>
          <Heading level={2}>Evaluators — how well it meets the rubric</Heading>
          {evaluators.map((lens) => (
            <LensBlock key={lens.lens} lens={lens} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
