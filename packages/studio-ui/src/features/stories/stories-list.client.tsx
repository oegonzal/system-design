'use client';

import styled from '@emotion/styled';
import type { StarStoryDto } from '@sysdesign/contracts';
import {
  Badge,
  Heading,
  Skeleton,
  Stack,
  Surface,
  Text,
  TextField,
} from '@sysdesign/design-system';
import { toErrorMessage, useLatestRequest } from '@sysdesign/web-kit';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

const FilterRow = styled.div`
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[4]}px;

  > label {
    min-width: 220px;
  }
`;

const NewStoryLink = styled(Link)`
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

const CardLink = styled(Link)`
  display: block;
  text-decoration: none;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.lg};
  }
`;

export function StoriesList() {
  const listRequest = useLatestRequest();

  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const debouncedTag = useDebouncedValue(tag);

  const [stories, setStories] = useState<StarStoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { id, signal } = listRequest.begin();
    void (async () => {
      try {
        const response = await api.listStories(
          {
            ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
            ...(debouncedTag.trim() ? { tag: debouncedTag.trim() } : {}),
          },
          { signal },
        );
        if (!listRequest.isCurrent(id)) return;
        setStories(response.data);
        setError(null);
      } catch (caught) {
        if (listRequest.isStale(id, caught)) return;
        setError(toErrorMessage(caught, 'Could not load stories.'));
      }
    })();
  }, [debouncedSearch, debouncedTag]);

  return (
    <Stack gap={6}>
      <Stack direction="row" justify="between" align="center" wrap gap={4}>
        <Heading level={1}>STAR stories</Heading>
        <NewStoryLink href="/stories/new" data-testid="new-story">
          New story
        </NewStoryLink>
      </Stack>

      <Surface padding={5}>
        <FilterRow>
          <TextField
            label="Search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search titles, situations, results…"
            data-testid="story-search"
          />
          <TextField
            label="Tag"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="e.g. caching"
            data-testid="story-tag-filter"
          />
        </FilterRow>
      </Surface>

      {error !== null ? <Text tone="secondary">{error}</Text> : null}

      {stories === null ? (
        <Stack gap={3} aria-busy="true">
          <Skeleton variant="block" height="88px" />
          <Skeleton variant="block" height="88px" />
        </Stack>
      ) : stories.length === 0 ? (
        <Text tone="muted">No stories match. Capture one — future-you will thank you.</Text>
      ) : (
        <Stack as="ul" gap={3} data-testid="story-list">
          {stories.map((story) => (
            <li key={story.id}>
              <CardLink href={`/stories/${story.id}`}>
                <Surface padding={4}>
                  <Stack gap={2}>
                    <Text as="span">
                      <strong>{story.title}</strong>
                    </Text>
                    <Text size="sm" tone="secondary">
                      {story.result.length > 160 ? `${story.result.slice(0, 160)}…` : story.result}
                    </Text>
                    <Stack direction="row" gap={2} wrap align="center">
                      {story.tags.map((storyTag) => (
                        <Badge key={storyTag} tone="neutral">
                          {storyTag}
                        </Badge>
                      ))}
                      <Text as="span" size="sm" tone="muted">
                        updated {new Date(story.updatedAt).toLocaleDateString('en-US')}
                      </Text>
                    </Stack>
                  </Stack>
                </Surface>
              </CardLink>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
