'use client';

import styled from '@emotion/styled';
import {
  canvasCriterionKindLabel,
  isCanvasCriterionKind,
  practiceFormatForKind,
  type CompetencyProgressDto,
} from '@sysdesign/contracts';
import {
  Heading,
  Link as DsLink,
  Skeleton,
  Stack,
  Surface,
  Text,
  transient,
} from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';
import NextLink from 'next/link';

import { api } from '../../api/client';
import { RetryAlert } from '../../components/retry-alert';
import { humanizeToken } from '../evaluation/humanize';

/** The three ways a criterion settles, in the order the bar stacks them, each with the tone the theme reserves for it. */
const BANDS = [
  { key: 'passed', label: 'passed', tone: 'success' },
  { key: 'partial', label: 'partial', tone: 'warn' },
  { key: 'failed', label: 'failed', tone: 'danger' },
] as const satisfies readonly { key: keyof CompetencyProgressDto; label: string; tone: string }[];

type BandTone = (typeof BANDS)[number]['tone'];

/**
 * Weakest first: among the kinds assessed, the lowest pass share, ties to
 * the kind assessed less, then the declared order the server answers in;
 * the kinds never assessed follow, in declared order.
 */
export function orderWeakestFirst(
  competencies: readonly CompetencyProgressDto[],
): CompetencyProgressDto[] {
  const share = (competency: CompetencyProgressDto) => competency.passed / competency.assessed;
  const assessed = competencies
    .filter((competency) => competency.assessed > 0)
    .sort((a, b) => share(a) - share(b) || a.assessed - b.assessed);
  return [...assessed, ...competencies.filter((competency) => competency.assessed === 0)];
}

const kindLabel = (kind: string): string => canvasCriterionKindLabel(kind) ?? humanizeToken(kind);

const percent = (share: number): string => `${Math.round(share * 100)}%`;

const Rows = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space[4]}px;
`;

const Track = styled.div`
  display: flex;
  gap: 2px;
  height: 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.subtle};
  overflow: hidden;
`;

const Band = styled('div', transient)<{ $tone: BandTone; $share: number }>`
  flex: 0 0 ${({ $share }) => $share * 100}%;
  background: ${({ theme, $tone }) => theme.color[$tone].fg};
`;

const Swatch = styled('span', transient)<{ $tone: BandTone }>`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  vertical-align: middle;
  margin-right: ${({ theme }) => theme.space[1]}px;
  background: ${({ theme, $tone }) => theme.color[$tone].fg};
`;

/** The design system's inline link, routed by Next: the same focus ring and colours as every other link. */
const PractiseLink = DsLink.withComponent(NextLink);

/** One competency: its label, the counts as text, the stacked bar, and where to practise it. */
function CompetencyRow({ competency }: { competency: CompetencyProgressDto }) {
  const counts = BANDS.map((band) => `${competency[band.key]} ${band.label}`).join(' · ');
  const practise = isCanvasCriterionKind(competency.kind)
    ? `/prompts/new?format=${practiceFormatForKind(competency.kind)}&emphasis=${competency.kind}`
    : null;
  return (
    <li data-testid="competency-row" data-kind={competency.kind}>
      <Stack gap={1}>
        <Stack direction="row" gap={3} align="baseline" justify="between" wrap>
          <Text as="span">{kindLabel(competency.kind)}</Text>
          {practise !== null ? (
            <PractiseLink $variant="inline" href={practise} data-testid="competency-practise">
              Practise this
            </PractiseLink>
          ) : null}
        </Stack>
        {competency.assessed === 0 ? (
          <Text size="sm" tone="muted">
            Not assessed yet.
          </Text>
        ) : (
          <>
            <Track aria-hidden="true">
              {BANDS.map((band) =>
                competency[band.key] > 0 ? (
                  <Band
                    key={band.key}
                    $tone={band.tone}
                    $share={competency[band.key] / competency.assessed}
                  />
                ) : null,
              )}
            </Track>
            <Text size="sm" tone="secondary" data-testid="competency-counts">
              {counts} · last practised{' '}
              {competency.lastPractisedAt === null
                ? 'never'
                : new Date(competency.lastPractisedAt).toLocaleDateString('en-US')}
              {competency.recent.length > 1
                ? ` · last sessions ${competency.recent.map(percent).join(', ')}`
                : ''}
            </Text>
          </>
        )}
      </Stack>
    </li>
  );
}

/**
 * The author's competencies, weakest first, counted from the verdicts the
 * loop recorded on their own designs — never a score the studio made up.
 * Each bar's bands are named in the counts beside it, so colour carries
 * nothing alone, and each kind links to the composer on the format that
 * emphasises it. Loads on its own: a failure here says so here, with its
 * own Retry, and never takes the rest of the dashboard down.
 */
export function CompetenciesPanel() {
  const progress = useResource(async (signal) => api.getProgress({ signal }), []);
  return (
    <Stack as="section" gap={4} aria-labelledby="competencies-heading">
      <Stack direction="row" gap={4} align="baseline" justify="between" wrap>
        <Heading level={2} id="competencies-heading">
          Competencies
        </Heading>
        <Text as="span" size="sm" tone="secondary" aria-hidden="true">
          {BANDS.map((band) => (
            <span key={band.key}>
              <Swatch $tone={band.tone} />
              {band.label}{' '}
            </span>
          ))}
        </Text>
      </Stack>
      {progress.data !== null ? (
        progress.data.sessions === 0 ? (
          <Text tone="muted" data-testid="competencies-empty">
            No graded designs yet. Your competencies appear after the first grade.
          </Text>
        ) : (
          <Surface padding={5} data-testid="competencies-panel">
            <Rows>
              {orderWeakestFirst(progress.data.competencies).map((competency) => (
                <CompetencyRow key={competency.kind} competency={competency} />
              ))}
            </Rows>
          </Surface>
        )
      ) : progress.error !== null ? (
        <RetryAlert
          title="Couldn't load your competencies"
          message={progress.error}
          onRetry={progress.reload}
          retrying={progress.loading}
          data-testid="competencies-error"
        />
      ) : (
        <Skeleton variant="block" height="160px" />
      )}
    </Stack>
  );
}
