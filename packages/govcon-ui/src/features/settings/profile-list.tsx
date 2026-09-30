import { day, type StoredProfile } from '@sysdesign/contracts';
import { Badge, Button, Heading, Stack, Table, Text } from '@sysdesign/design-system';

export interface ProfileListProps {
  profiles: readonly StoredProfile[];
  /** The one the editor holds. */
  activeId: string | null;
  onSelect(id: string): void;
  onNew(): void;
  onCopy(id: string): void;
  onSetDefault(id: string): void;
  onDelete(id: string): void;
  busy?: boolean;
}

/** Every profile in the store, the default marked; the actions that make, copy, promote and remove one. */
export function ProfileList({
  profiles,
  activeId,
  onSelect,
  onNew,
  onCopy,
  onSetDefault,
  onDelete,
  busy = false,
}: ProfileListProps) {
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={4} align="center" wrap justify="between">
        <Heading level={2}>Profiles</Heading>
        <Button type="button" variant="solid" size="sm" disabled={busy} onClick={onNew}>
          New profile
        </Button>
      </Stack>
      <Table aria-label="Profiles">
        <thead>
          <tr>
            <th>Id</th>
            <th>Company</th>
            <th>Default</th>
            <th>NAICS</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => {
            const active = profile.id === activeId;
            return (
              <tr key={profile.id} aria-current={active ? 'true' : undefined}>
                <td>
                  <Button
                    type="button"
                    variant={active ? 'subtle' : 'ghost'}
                    size="sm"
                    selected={active}
                    disabled={busy}
                    onClick={() => onSelect(profile.id)}
                  >
                    {profile.id}
                  </Button>
                </td>
                <td>{profile.company}</td>
                <td>{profile.isDefault ? <Badge tone="accent">default</Badge> : ''}</td>
                <td>{profile.naics.length}</td>
                <td>{day(profile.updatedAt)}</td>
                <td>
                  <Stack direction="row" gap={2} wrap>
                    <Button
                      type="button"
                      variant="subtle"
                      size="sm"
                      disabled={busy}
                      onClick={() => onCopy(profile.id)}
                    >
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="subtle"
                      size="sm"
                      disabled={busy || profile.isDefault}
                      onClick={() => onSetDefault(profile.id)}
                    >
                      Set default
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || profiles.length <= 1}
                      onClick={() => onDelete(profile.id)}
                    >
                      Delete
                    </Button>
                  </Stack>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {profiles.length <= 1 ? (
        <Text tone="muted" size="sm">
          The last profile cannot be removed.
        </Text>
      ) : null}
    </Stack>
  );
}
