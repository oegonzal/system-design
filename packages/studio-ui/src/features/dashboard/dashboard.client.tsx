'use client';

import styled from '@emotion/styled';
import type { DesignSessionDto, ExperienceProfileDto } from '@sysdesign/contracts';
import { Badge, Button, Heading, Skeleton, Stack, Surface, Text } from '@sysdesign/design-system';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api, toErrorMessage } from '../../api/client';

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

  const handleGenerate = async (experienceId: string) => {
    setGeneratingFor(experienceId);
    setError(null);
    try {
      const prompt = await api.generatePrompt({ experienceId });
      router.push(`/prompts/${prompt.id}`);
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not generate a prompt.'));
      setGeneratingFor(null);
    }
  };

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

      <Stack gap={4}>
        <Heading level={2}>Experiences</Heading>
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
                      onClick={() => void handleGenerate(experience.id)}
                      disabled={generatingFor !== null}
                      data-testid={`generate-${experience.slug}`}
                    >
                      {generatingFor === experience.id ? 'Generating…' : 'Generate prompt'}
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
                      {session.latestGrade ? (
                        <Badge tone="accent">{`grade ${session.latestGrade}`}</Badge>
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
