import {
  TARGET_CONTACT_ROLES,
  type TargetContact,
  type TargetContactRole,
} from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

import { TARGET_CONTACT_ROLE_LABEL } from './target-kinds';

export interface TargetContactsProps {
  contacts: readonly TargetContact[];
  onChange(next: TargetContact[]): void;
  disabled?: boolean;
}

const EMPTY: TargetContact = { name: '', role: 'other', channel: '', note: '' };

/** Who to reach about a target: each named, in a declared role, with how to reach them and a note. A row is its position while it is edited. */
export function TargetContacts({ contacts, onChange, disabled = false }: TargetContactsProps) {
  const set = (index: number, patch: Partial<TargetContact>) =>
    onChange(contacts.map((contact, at) => (at === index ? { ...contact, ...patch } : contact)));
  return (
    <Stack gap={2} aria-label="Contacts" role="group">
      <Text tone="secondary" size="sm">
        Contacts
      </Text>
      {contacts.length === 0 ? (
        <Text tone="muted" size="sm">
          No one recorded yet.
        </Text>
      ) : null}
      {contacts.map((contact, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- a contact row is its position while it is edited
        <Stack key={index} direction="row" gap={2} align="end" wrap>
          <TextField
            label={`Contact ${index + 1} name`}
            value={contact.name}
            disabled={disabled}
            onChange={(event) => set(index, { name: event.target.value })}
          />
          <SelectField
            label={`Contact ${index + 1} role`}
            value={contact.role}
            disabled={disabled}
            onChange={(event) => set(index, { role: event.target.value as TargetContactRole })}
          >
            {TARGET_CONTACT_ROLES.map((role) => (
              <option key={role} value={role}>
                {TARGET_CONTACT_ROLE_LABEL[role]}
              </option>
            ))}
          </SelectField>
          <TextField
            label={`Contact ${index + 1} channel`}
            value={contact.channel}
            disabled={disabled}
            onChange={(event) => set(index, { channel: event.target.value })}
          />
          <TextField
            label={`Contact ${index + 1} note`}
            value={contact.note}
            disabled={disabled}
            onChange={(event) => set(index, { note: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove contact ${index + 1}`}
            disabled={disabled}
            onClick={() => onChange(contacts.filter((_, at) => at !== index))}
          >
            ✕
          </Button>
        </Stack>
      ))}
      <Button
        type="button"
        variant="subtle"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...contacts, EMPTY])}
      >
        Add contact
      </Button>
    </Stack>
  );
}
