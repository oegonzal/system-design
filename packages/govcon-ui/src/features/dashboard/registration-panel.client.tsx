'use client';

import type { StoredProfile } from '@sysdesign/contracts';
import { Alert, Heading, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { EntityCard } from '../entities/entity-card';

export interface RegistrationPanelProps {
  /** The active profile; null while the profiles load, or when there is none. */
  profile: StoredProfile | null;
}

/** The company's own SAM.gov registration, as the store holds it — or what to do to see it here. */
export function RegistrationPanel({ profile }: RegistrationPanelProps) {
  const profileId = profile?.id;
  const own = useResource(
    (signal) =>
      profileId === undefined ? Promise.resolve(null) : api.getOwnEntity(profileId, { signal }),
    [profileId],
  );
  if (own.loading) return <Spinner label="Loading the registration" />;
  if (own.error) return <Alert tone="danger">{own.error}</Alert>;
  if (own.data) return <EntityCard entity={own.data} headingLevel={2} />;
  return (
    <Stack gap={2}>
      <Heading level={2}>Registration</Heading>
      <Text tone="secondary" size="sm">
        {profile?.entityUei
          ? `Not looked up yet — Intel › Entities can look up ${profile.entityUei} for one request.`
          : 'Set the company UEI on the profile (Settings) to watch its SAM.gov registration here.'}
      </Text>
    </Stack>
  );
}
