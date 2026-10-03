'use client';

import styled from '@emotion/styled';
import { DEFAULT_LIST_LIMIT, STORY_SECTION_BOUND, STORY_TAG_BOUND } from '@sysdesign/contracts';
import {
  Badge,
  Heading,
  Skeleton,
  Stack,
  Surface,
  Text,
  TextField,
} from '@sysdesign/design-system';
import { UNREACHABLE_COPY, useDebouncedValue, usePagedList } from '@sysdesign/web-kit';
import Link from 'next/link';
import { useState } from 'react';

import { api } from '../../api/client';
import { LoadMore } from '../../components/load-more';
import { ResultList } from '../../components/result-list';
import { RetryAlert } from '../../components/retry-alert';

/** How far a card quotes the story's result before it trails off. */
const RESULT_EXCERPT_LENGTH = 160;

/**
 * Search takes the room the row has — its placeholder is a sentence — and
 * the tag filter, a single word, takes less; both wrap to full width on a
 * narrow screen.
 */
const FilterRow = styled.div`
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[4]}px;
`;

const SearchSlot = styled.div`
  flex: 3 1 320px;
  min-width: 0;
`;

const TagSlot = styled.div`
  flex: 1 1 180px;
  min-width: 0;
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

const excerpt = (text: string): string =>
  text.length > RESULT_EXCERPT_LENGTH ? `${text.slice(0, RESULT_EXCERPT_LENGTH)}…` : text;

/**
 * The STAR repository, a page at a time. The filters are bounded as the API
 * bounds them, so a search can never be refused for its length; the rows on
 * screen dim while a changed filter's rows arrive, and a filter whose rows
 * could not load shows why in their place — never the previous filter's.
 */
export function StoriesList() {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const debouncedSearch = useDebouncedValue(search).trim();
  const debouncedTag = useDebouncedValue(tag).trim();
  const filtered = debouncedSearch !== '' || debouncedTag !== '';

  const stories = usePagedList(
    (page, signal) =>
      api.listStories(
        {
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(debouncedTag ? { tag: debouncedTag } : {}),
          ...page,
        },
        { signal },
      ),
    [debouncedSearch, debouncedTag],
    { pageSize: DEFAULT_LIST_LIMIT, fallback: UNREACHABLE_COPY },
  );

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
          <SearchSlot>
            <TextField
              label="Search"
              type="search"
              value={search}
              maxLength={STORY_SECTION_BOUND.target}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, situations, results…"
              data-testid="story-search"
            />
          </SearchSlot>
          <TagSlot>
            <TextField
              label="Tag"
              value={tag}
              maxLength={STORY_TAG_BOUND.target}
              onChange={(event) => setTag(event.target.value)}
              placeholder="e.g. caching"
              data-testid="story-tag-filter"
            />
          </TagSlot>
        </FilterRow>
      </Surface>

      {stories.items === null ? (
        stories.error !== null ? (
          <RetryAlert
            title="Couldn't load stories"
            message={stories.error}
            onRetry={stories.reload}
            data-testid="stories-error"
          />
        ) : (
          <Stack gap={3} aria-busy="true">
            <Skeleton variant="block" height="88px" />
            <Skeleton variant="block" height="88px" />
          </Stack>
        )
      ) : stories.items.length === 0 ? (
        <Text tone="muted">
          {filtered
            ? 'No stories match. Try another search or tag.'
            : 'No stories yet. Capture one — future-you will thank you.'}
        </Text>
      ) : (
        <ResultList data-testid="story-list" aria-busy={stories.loading}>
          {stories.items.map((story) => (
            <li key={story.id}>
              <CardLink href={`/stories/${story.id}`}>
                <Surface padding={4}>
                  <Stack gap={2}>
                    <Text as="span">
                      <strong>{story.title}</strong>
                    </Text>
                    <Text size="sm" tone="secondary">
                      {excerpt(story.result)}
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
        </ResultList>
      )}

      <LoadMore list={stories} noun="stories" data-testid="more-stories" />
    </Stack>
  );
}
