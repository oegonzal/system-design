'use client';

import { SelectField } from '@sysdesign/design-system';

import { useProfile } from '../providers/profile-context';

/** The header's profile choice; every page scores against it. */
export function ProfileSwitcher() {
  const { profiles, active, setActiveId } = useProfile();
  if (profiles.length === 0) return null;
  return (
    <SelectField
      label="Profile"
      value={active?.id ?? ''}
      onChange={(event) => setActiveId(event.target.value)}
    >
      {profiles.map((profile) => (
        <option key={profile.id} value={profile.id}>
          {profile.company} ({profile.id})
        </option>
      ))}
    </SelectField>
  );
}
