'use client';

import styled from '@emotion/styled';
import { DEFAULT_LIST_LIMIT, PROMPT_SOURCES, type PromptSource } from '@sysdesign/contracts';
import {
  Badge,
  Button,
  Heading,
  LiveRegion,
  SelectField,
  Skeleton,
  Spinner,
  Stack,
  Surface,
  Text,
} from '@sysdesign/design-system';
import { query, UNREACHABLE_COPY, usePagedList, useResource } from '@sysdesign/web-kit';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { api } from '../../api/client';
import { LoadMore } from '../../components/load-more';
import { ResultList } from '../../components/result-list';
import { RetryAlert } from '../../components/retry-alert';
import { humanizeToken } from '../evaluation/humanize';
import { usePromptGeneration } from './use-prompt-generation';

const PAGE_SIZE = DEFAULT_LIST_LIMIT;

/** The browser's filters, as the URL carries them: a reload, Back and a shared link all keep them. */
interface PromptFilters {
  experienceId: string;
  source: '' | PromptSource;
}

/** A source the contract does not know is no filter at all. */
const sourceOf = (value: string | null): PromptFilters['source'] =>
  PROMPT_SOURCES.find((candidate) => candidate === value) ?? '';

/** The filters a URL names. */
const filtersOf = (params: Pick<URLSearchParams, 'get'>): PromptFilters => ({
  experienceId: params.get('experienceId') ?? '',
  source: sourceOf(params.get('source')),
});

const FilterRow = styled.div`
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[4]}px;

  > div {
    flex: 1 1 220px;
  }
`;

const CardLink = styled(Link)`
  text-decoration: none;
  display: block;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.lg};
  }
`;

const ComposeLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[4]}px`};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.accent.default};
  color: ${({ theme }) => theme.color.accent.fg};
  font-size: ${({ theme }) => theme.font.size.md};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: none;

  &:hover {
    background: ${({ theme }) => theme.color.accent.hover};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

export function PromptsBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { experienceId, source } = filtersOf(searchParams);
  const filtered = experienceId !== '' || source !== '';
  const generation = usePromptGeneration((prompt) => router.push(`/prompts/${prompt.id}`));

  const experiences = useResource(
    async (signal) => (await api.listExperiences({ signal })).data,
    [],
  );
  const prompts = usePagedList(
    (page, signal) =>
      api.listPrompts(
        { ...(experienceId ? { experienceId } : {}), ...(source ? { source } : {}), ...page },
        { signal },
      ),
    [experienceId, source],
    { pageSize: PAGE_SIZE, fallback: UNREACHABLE_COPY },
  );

  // A filter change is a new address, not a new history entry.
  const setFilters = (next: PromptFilters) =>
    router.replace(
      `${pathname}${query({
        experienceId: next.experienceId || undefined,
        source: next.source || undefined,
      })}`,
      { scroll: false },
    );

  return (
    <Stack gap={6}>
      <Stack direction="row" justify="between" align="center" wrap gap={4}>
        <Heading level={1}>Prompts</Heading>
        <ComposeLink href="/prompts/new" data-testid="compose-prompt">
          Write or import a prompt
        </ComposeLink>
      </Stack>

      <Surface padding={5}>
        <Stack gap={3}>
          <FilterRow>
            <SelectField
              label="Experience"
              value={experienceId}
              onChange={(event) => setFilters({ experienceId: event.target.value, source })}
              data-testid="experience-select"
            >
              <option value="">All experiences</option>
              {(experiences.data ?? []).map((experience) => (
                <option key={experience.id} value={experience.id}>
                  {experience.companyLabel} — {experience.title}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Source"
              value={source}
              onChange={(event) =>
                setFilters({ experienceId, source: sourceOf(event.target.value) })
              }
              data-testid="source-select"
            >
              <option value="">Any source</option>
              {PROMPT_SOURCES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {humanizeToken(candidate)}
                </option>
              ))}
            </SelectField>
            <Button
              variant="solid"
              onClick={() => void generation.start(experienceId ? { experienceId } : {})}
              disabled={generation.generating}
              data-testid="generate-prompt"
            >
              {generation.generating ? 'Writing…' : 'Generate prompt'}
            </Button>
          </FilterRow>
          <Text size="sm" tone="muted">
            {experienceId
              ? 'Generate writes a new prompt from the selected experience.'
              : 'Generate writes a new prompt from your least-practised experience.'}
          </Text>
          <LiveRegion message={generation.message} />
          {generation.generating ? (
            <Stack direction="row" gap={3} align="center" data-testid="prompt-generation-progress">
              <Spinner label="" />
              <Text size="sm" tone="secondary">
                {generation.message}
              </Text>
            </Stack>
          ) : null}
          {generation.error !== null ? (
            <Text size="sm" tone="secondary" data-testid="prompt-generation-error">
              {generation.error}
            </Text>
          ) : null}
          {experiences.error !== null ? (
            <RetryAlert
              title="Couldn't load your experiences"
              message={experiences.error}
              onRetry={experiences.reload}
              retrying={experiences.loading}
            />
          ) : null}
        </Stack>
      </Surface>

      {prompts.items === null ? (
        prompts.error !== null ? (
          <RetryAlert
            title="Couldn't load prompts"
            message={prompts.error}
            onRetry={prompts.reload}
            data-testid="prompts-error"
          />
        ) : (
          <Stack gap={3} aria-busy="true">
            <Skeleton variant="block" height="72px" />
            <Skeleton variant="block" height="72px" />
            <Skeleton variant="block" height="72px" />
          </Stack>
        )
      ) : prompts.items.length === 0 ? (
        filtered ? (
          <Stack gap={3} align="start" data-testid="prompts-empty-filtered">
            <Text tone="muted">No prompts match these filters.</Text>
            <Button
              variant="subtle"
              onClick={() => setFilters({ experienceId: '', source: '' })}
              data-testid="clear-filters"
            >
              Clear filters
            </Button>
          </Stack>
        ) : (
          <Text tone="muted">No prompts yet — generate one, or write or import one.</Text>
        )
      ) : (
        <ResultList data-testid="prompt-list" aria-busy={prompts.loading}>
          {prompts.items.map((prompt) => (
            <li key={prompt.id}>
              <CardLink href={`/prompts/${prompt.id}`}>
                <Surface padding={4}>
                  <Stack gap={2}>
                    <Text as="span" size="md">
                      <strong>{prompt.title}</strong>
                    </Text>
                    <Stack direction="row" gap={2} wrap align="center">
                      <Badge tone="neutral">{humanizeToken(prompt.source)}</Badge>
                      {prompt.criteria.length > 0 ? (
                        <Badge tone="accent">{prompt.criteria.length} criteria</Badge>
                      ) : null}
                      {prompt.status === 'archived' ? <Badge tone="neutral">archived</Badge> : null}
                      <Text as="span" size="sm" tone="muted">
                        {new Date(prompt.createdAt).toLocaleDateString('en-US')}
                      </Text>
                    </Stack>
                  </Stack>
                </Surface>
              </CardLink>
            </li>
          ))}
        </ResultList>
      )}

      <LoadMore list={prompts} noun="prompts" data-testid="more-prompts" />
    </Stack>
  );
}
