'use client';

import styled from '@emotion/styled';
import {
  DEFAULT_LIST_LIMIT,
  PROMPT_SOURCES,
  type ExperienceProfileDto,
  type PromptDto,
  type PromptSource,
} from '@sysdesign/contracts';
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
import { toErrorMessage, useLatestRequest } from '@sysdesign/web-kit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { usePromptGeneration } from './use-prompt-generation';

const PAGE_SIZE = DEFAULT_LIST_LIMIT;

const FilterRow = styled.div`
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[4]}px;

  > label {
    min-width: 220px;
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
  const listRequest = useLatestRequest();
  const generation = usePromptGeneration((prompt) => router.push(`/prompts/${prompt.id}`));

  const [experiences, setExperiences] = useState<ExperienceProfileDto[]>([]);
  const [experienceId, setExperienceId] = useState('');
  const [source, setSource] = useState<'' | PromptSource>('');
  const [prompts, setPrompts] = useState<PromptDto[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listExperiences()
      .then((response) => setExperiences(response.data))
      .catch((caught) => setError(toErrorMessage(caught, 'Could not load experiences.')));
  }, []);

  useEffect(() => {
    const { id, signal } = listRequest.begin();
    void (async () => {
      setLoading(true);
      try {
        const response = await api.listPrompts(
          {
            ...(experienceId ? { experienceId } : {}),
            ...(source ? { source } : {}),
            limit: PAGE_SIZE,
            offset,
          },
          { signal },
        );
        if (!listRequest.isCurrent(id)) return;
        setPrompts((current) => (offset === 0 ? response.data : [...current, ...response.data]));
        setTotal(response.meta.total);
        setError(null);
        setLoading(false);
      } catch (caught) {
        if (listRequest.isStale(id, caught)) return;
        setError(toErrorMessage(caught, 'Could not load prompts.'));
        setLoading(false);
      }
    })();
  }, [experienceId, source, offset]);

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
              onChange={(event) => {
                setExperienceId(event.target.value);
                setOffset(0);
              }}
              data-testid="experience-select"
            >
              <option value="">All experiences</option>
              {experiences.map((experience) => (
                <option key={experience.id} value={experience.id}>
                  {experience.companyLabel} — {experience.title}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Source"
              value={source}
              onChange={(event) => {
                setSource(event.target.value as '' | PromptSource);
                setOffset(0);
              }}
              data-testid="source-select"
            >
              <option value="">Any source</option>
              {PROMPT_SOURCES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
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
        </Stack>
      </Surface>

      {error !== null ? <Text tone="secondary">{error}</Text> : null}

      {loading && prompts.length === 0 ? (
        <Stack gap={3} aria-busy="true">
          <Skeleton variant="block" height="72px" />
          <Skeleton variant="block" height="72px" />
          <Skeleton variant="block" height="72px" />
        </Stack>
      ) : (
        <Stack as="ul" gap={3} data-testid="prompt-list">
          {prompts.map((prompt) => (
            <li key={prompt.id}>
              <CardLink href={`/prompts/${prompt.id}`}>
                <Surface padding={4}>
                  <Stack gap={2}>
                    <Text as="span" size="md">
                      <strong>{prompt.title}</strong>
                    </Text>
                    <Stack direction="row" gap={2} wrap align="center">
                      <Badge tone="neutral">{prompt.source}</Badge>
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
        </Stack>
      )}

      {!loading && prompts.length === 0 && error === null ? (
        <Text tone="muted">No prompts yet — generate one, or write or import one.</Text>
      ) : null}

      {prompts.length < total ? (
        <div>
          <Button
            variant="subtle"
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
            disabled={loading}
          >
            Load more ({prompts.length} of {total})
          </Button>
        </div>
      ) : null}
    </Stack>
  );
}
