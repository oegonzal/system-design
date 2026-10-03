'use client';

import styled from '@emotion/styled';
import type { DesignSessionDto } from '@sysdesign/contracts';
import {
  Badge,
  Button,
  DECISION_TONE,
  Heading,
  LiveRegion,
  Skeleton,
  Spinner,
  Stack,
  Surface,
  Text,
} from '@sysdesign/design-system';
import { UNREACHABLE_COPY, usePagedList, useResource } from '@sysdesign/web-kit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '../../api/client';
import { LoadMore } from '../../components/load-more';
import { RetryAlert } from '../../components/retry-alert';
import { humanizeToken } from '../evaluation/humanize';
import { cachedStandingOf, formatScore, GRADE_STANDING_LABEL } from '../evaluation/score';
import { usePromptGeneration } from '../prompts/use-prompt-generation';

/** How many sessions the dashboard shows at a time; the rest are a click away. */
export const RECENT_SESSIONS_PAGE = 8;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: ${({ theme }) => theme.space[4]}px;
`;

const SessionLink = styled(Link)`
  text-decoration: none;
  color: inherit;
  display: block;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.lg};
  }
`;

/**
 * One session as the dashboard lists it: its prompt, status and latest
 * grade — a score and a decision when the grade is a verdict, and, when it
 * is not, which way it is not, in the words every surface prints a grade's
 * standing in: still grading, not assessed (it judged too little to score),
 * or grading failed (its run broke, and the revision waits to be re-graded).
 */
function SessionCard({ session }: { session: DesignSessionDto }) {
  // The latest grade's standing, read the way a revision's cached grade is.
  const standing =
    session.latestEvaluationStatus === null
      ? null
      : cachedStandingOf({
          status: session.latestEvaluationStatus,
          overall: session.latestOverall,
        });
  return (
    <SessionLink href={`/practice/${session.id}`} data-testid="session-card">
      <Surface padding={4}>
        <Stack gap={2}>
          <Heading level={3}>{session.promptTitle}</Heading>
          <Stack direction="row" gap={2} align="center" wrap>
            <Badge tone="neutral" data-testid="session-status">
              {humanizeToken(session.status)}
            </Badge>
            {session.latestOverall !== null ? (
              <Badge tone="accent" data-testid="session-score">
                {`${formatScore(session.latestOverall)}/100`}
              </Badge>
            ) : null}
            {standing === 'unscored' ? (
              <Badge tone="neutral" data-testid="session-unscored">
                {GRADE_STANDING_LABEL.unscored}
              </Badge>
            ) : standing === 'failed' ? (
              <Badge tone="critical" data-testid="session-grade-failed">
                {GRADE_STANDING_LABEL.failed}
              </Badge>
            ) : session.latestDecision ? (
              <Badge tone={DECISION_TONE[session.latestDecision]} data-testid="session-decision">
                {humanizeToken(session.latestDecision)}
              </Badge>
            ) : session.latestEvaluationStatus === 'running' ? (
              <Badge tone="neutral">Grading…</Badge>
            ) : null}
          </Stack>
          <Text size="sm" tone="secondary">
            {session.revisionCount} {session.revisionCount === 1 ? 'revision' : 'revisions'} ·
            updated {new Date(session.updatedAt).toLocaleDateString('en-US')}
          </Text>
        </Stack>
      </Surface>
    </SessionLink>
  );
}

/**
 * The home page: the experiences prompts are written from, and the practice
 * sessions so far. Each section loads on its own — a failed list says so in
 * its own place, with its own Retry, and never takes the other down.
 */
export function Dashboard() {
  const router = useRouter();
  const generation = usePromptGeneration((prompt) => router.push(`/prompts/${prompt.id}`));

  const experiences = useResource(
    async (signal) => (await api.listExperiences({ signal })).data,
    [],
  );
  const sessions = usePagedList((page, signal) => api.listSessions(page, { signal }), [], {
    pageSize: RECENT_SESSIONS_PAGE,
    fallback: UNREACHABLE_COPY,
  });
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  // No experienceId = "surprise me": the API picks the least-practised
  // experience, so repeated practice covers every experience.
  const handleGenerate = (experienceId?: string) => {
    setGeneratingFor(experienceId ?? 'surprise');
    void generation.start(experienceId ? { experienceId } : {});
  };
  const busy = generation.generating;
  // There is something to pick from only once the experiences have answered.
  const canSurprise = (experiences.data?.length ?? 0) > 0;

  return (
    <Stack gap={7}>
      <Stack gap={2}>
        <Heading level={1}>Dashboard</Heading>
        <Text tone="secondary">
          Turn your production experience into design prompts, practice on the canvas, and keep the
          stories that back it up.
        </Text>
      </Stack>

      <LiveRegion message={generation.message} />
      {busy ? (
        <Stack direction="row" gap={3} align="center" data-testid="prompt-generation-progress">
          <Spinner label="" />
          <Text size="sm" tone="secondary">
            {generation.message}
          </Text>
        </Stack>
      ) : null}
      {generation.error !== null ? (
        <Text tone="secondary" data-testid="prompt-generation-error">
          {generation.error}
        </Text>
      ) : null}

      <Stack as="section" gap={4} aria-labelledby="experiences-heading">
        <Stack direction="row" gap={4} align="center" justify="between" wrap>
          <Heading level={2} id="experiences-heading">
            Experiences
          </Heading>
          <Button
            variant="subtle"
            onClick={() => handleGenerate()}
            disabled={busy || !canSurprise}
            data-testid="surprise-me"
            title="Write a prompt from your least-practised experience"
          >
            {busy && generatingFor === 'surprise' ? 'Writing…' : 'Surprise me'}
          </Button>
        </Stack>
        {experiences.data !== null ? (
          <Grid data-testid="experience-list">
            {experiences.data.map((experience) => (
              <Surface key={experience.id} padding={5}>
                <Stack gap={3}>
                  <Stack gap={1}>
                    <Text as="span" size="sm" tone="muted">
                      {experience.companyLabel}
                    </Text>
                    <Heading level={3}>{experience.title}</Heading>
                  </Stack>
                  <Text size="sm" tone="secondary">
                    {experience.summary}
                  </Text>
                  <Stack direction="row" gap={2} wrap>
                    {experience.techStack.map((tech) => (
                      <Badge key={tech} tone="neutral">
                        {tech}
                      </Badge>
                    ))}
                  </Stack>
                  <div>
                    <Button
                      variant="subtle"
                      onClick={() => handleGenerate(experience.id)}
                      disabled={busy}
                      data-testid={`generate-${experience.slug}`}
                    >
                      {busy && generatingFor === experience.id ? 'Writing…' : 'Generate prompt'}
                    </Button>
                  </div>
                </Stack>
              </Surface>
            ))}
          </Grid>
        ) : experiences.error !== null ? (
          <RetryAlert
            title="Couldn't load your experiences"
            message={experiences.error}
            onRetry={experiences.reload}
            retrying={experiences.loading}
            data-testid="experiences-error"
          />
        ) : (
          <Grid aria-busy="true">
            <Skeleton variant="block" height="160px" />
            <Skeleton variant="block" height="160px" />
          </Grid>
        )}
      </Stack>

      <Stack as="section" gap={4} aria-labelledby="sessions-heading">
        <Heading level={2} id="sessions-heading">
          Practice sessions
        </Heading>
        {sessions.items === null ? (
          sessions.error !== null ? (
            <RetryAlert
              title="Couldn't load your sessions"
              message={sessions.error}
              onRetry={sessions.reload}
              retrying={sessions.loading}
              data-testid="sessions-error"
            />
          ) : (
            <Grid aria-busy="true">
              <Skeleton variant="block" height="96px" />
              <Skeleton variant="block" height="96px" />
            </Grid>
          )
        ) : sessions.items.length === 0 ? (
          <Text tone="muted">No practice sessions yet. Generate a prompt and start one.</Text>
        ) : (
          <>
            <Grid data-testid="session-list">
              {sessions.items.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </Grid>
            <LoadMore
              list={sessions}
              noun="sessions"
              label="Show more sessions"
              data-testid="more-sessions"
            />
          </>
        )}
      </Stack>
    </Stack>
  );
}
