'use client';

import styled from '@emotion/styled';
import {
  DEFAULT_LIST_LIMIT,
  PROMPT_DIFFICULTIES,
  type ExperienceProfileDto,
  type PromptDifficulty,
  type PromptDto,
} from '@sysdesign/contracts';
import { Badge, Button, Heading, Skeleton, Stack, Surface, Text } from '@sysdesign/design-system';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api, toErrorMessage } from '../../api/client';
import { SelectField } from '../../components/fields';
import { useLatestRequest } from '../../hooks/use-latest-request';

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

export function PromptsBrowser() {
  const router = useRouter();
  const listRequest = useLatestRequest();

  const [experiences, setExperiences] = useState<ExperienceProfileDto[]>([]);
  const [experienceId, setExperienceId] = useState('');
  const [difficulty, setDifficulty] = useState<'' | PromptDifficulty>('');
  const [prompts, setPrompts] = useState<PromptDto[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
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
            ...(difficulty ? { difficulty } : {}),
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
  }, [experienceId, difficulty, offset]);

  const handleGenerate = async () => {
    if (!experienceId) return;
    setGenerating(true);
    setError(null);
    try {
      const prompt = await api.generatePrompt({
        experienceId,
        ...(difficulty ? { difficulty } : {}),
      });
      router.push(`/prompts/${prompt.id}`);
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not generate a prompt.'));
      setGenerating(false);
    }
  };

  return (
    <Stack gap={6}>
      <Heading level={1}>Prompts</Heading>

      <Surface padding={5}>
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
            label="Difficulty"
            value={difficulty}
            onChange={(event) => {
              setDifficulty(event.target.value as '' | PromptDifficulty);
              setOffset(0);
            }}
            data-testid="difficulty-select"
          >
            <option value="">Any difficulty</option>
            {PROMPT_DIFFICULTIES.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </SelectField>
          <Button
            variant="solid"
            onClick={() => void handleGenerate()}
            disabled={!experienceId || generating}
            data-testid="generate-prompt"
          >
            {generating ? 'Generating…' : 'Generate prompt'}
          </Button>
        </FilterRow>
        {!experienceId ? (
          <Text size="sm" tone="muted" style={{ marginTop: 8 }}>
            Pick an experience to generate a new prompt from it.
          </Text>
        ) : null}
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
                      <Badge tone="accent">{prompt.archetype}</Badge>
                      <Badge tone="neutral">{prompt.difficulty}</Badge>
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
        <Text tone="muted">No prompts yet — generate one from an experience above.</Text>
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
