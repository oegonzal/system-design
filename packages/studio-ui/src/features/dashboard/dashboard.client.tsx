'use client';

import styled from '@emotion/styled';
import type { DesignSessionDto, ExperienceProfileDto } from '@sysdesign/contracts';
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
import { toErrorMessage } from '@sysdesign/web-kit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { usePromptGeneration } from '../prompts/use-prompt-generation';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.space[4]}px;
`;

const SessionLink = styled(Link)`
  text-decoration: none;
  display: block;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.lg};
  }
`;

export function Dashboard() {
  const router = useRouter();
  const generation = usePromptGeneration((prompt) => router.push(`/prompts/${prompt.id}`));

  const [experiences, setExperiences] = useState<ExperienceProfileDto[] | null>(null);
  const [sessions, setSessions] = useState<DesignSessionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.listExperiences(), api.listSessions({ limit: 8 })])
      .then(([experienceList, sessionList]) => {
        setExperiences(experienceList.data);
        setSessions(sessionList.data);
      })
      .catch((caught) => setError(toErrorMessage(caught, 'Could not load the dashboard.')));
  }, []);

  // No experienceId = "surprise me": the API picks the least-practised
  // experience, so repeated practice covers every experience.
  const handleGenerate = (experienceId?: string) => {
    setGeneratingFor(experienceId ?? 'surprise');
    void generation.start(experienceId ? { experienceId } : {});
  };
  const busy = generation.generating;

  return (
    <Stack gap={7}>
      <Stack gap={2}>
        <Heading level={1}>Dashboard</Heading>
        <Text tone="secondary">
          Turn your production experience into design prompts, practice on the canvas, and keep the
          stories that back it up.
        </Text>
      </Stack>

      {error !== null ? <Text tone="secondary">{error}</Text> : null}
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

      <Stack gap={4}>
        <Stack direction="row" gap={4} align="center" justify="between">
          <Heading level={2}>Experiences</Heading>
          <Button
            variant="subtle"
            onClick={() => handleGenerate()}
            disabled={busy}
            data-testid="surprise-me"
            title="Write a prompt from your least-practised experience"
          >
            {busy && generatingFor === 'surprise' ? 'Writing…' : 'Surprise me'}
          </Button>
        </Stack>
        {experiences === null ? (
          <Grid aria-busy="true">
            <Skeleton variant="block" height="160px" />
            <Skeleton variant="block" height="160px" />
          </Grid>
        ) : (
          <Grid data-testid="experience-list">
            {experiences.map((experience) => (
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
        )}
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>Recent sessions</Heading>
        {sessions === null ? (
          <Grid aria-busy="true">
            <Skeleton variant="block" height="96px" />
            <Skeleton variant="block" height="96px" />
          </Grid>
        ) : sessions.length === 0 ? (
          <Text tone="muted">No practice sessions yet. Generate a prompt and start one.</Text>
        ) : (
          <Grid data-testid="session-list">
            {sessions.map((session) => (
              <SessionLink key={session.id} href={`/practice/${session.id}`}>
                <Surface padding={4}>
                  <Stack gap={2}>
                    <Stack direction="row" gap={2} align="center" wrap>
                      <Badge tone="neutral">{session.status}</Badge>
                      {session.latestOverall !== null ? (
                        <Badge tone="accent" data-testid="session-score">
                          {`${session.latestOverall}/100`}
                        </Badge>
                      ) : null}
                      {session.latestDecision ? (
                        <Badge
                          tone={DECISION_TONE[session.latestDecision]}
                          data-testid="session-decision"
                        >
                          {session.latestDecision}
                        </Badge>
                      ) : session.latestEvaluationStatus === 'running' ? (
                        <Badge tone="neutral">grading…</Badge>
                      ) : null}
                    </Stack>
                    <Text size="sm" tone="secondary">
                      {session.revisionCount}{' '}
                      {session.revisionCount === 1 ? 'revision' : 'revisions'} · updated{' '}
                      {new Date(session.updatedAt).toLocaleDateString('en-US')}
                    </Text>
                  </Stack>
                </Surface>
              </SessionLink>
            ))}
          </Grid>
        )}
      </Stack>
    </Stack>
  );
}
