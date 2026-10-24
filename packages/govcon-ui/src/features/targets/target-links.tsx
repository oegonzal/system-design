import { TARGET_LINK_KINDS, type TargetLink, type TargetLinkKind } from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

import { TARGET_LINK_KIND_LABEL } from './target-kinds';

export interface TargetLinksProps {
  links: readonly TargetLink[];
  onChange(next: TargetLink[]): void;
  disabled?: boolean;
}

const EMPTY: TargetLink = { kind: 'supplier-portal', url: '', label: '' };

/** The pages kept on a target — its website, the portal its suppliers register at, its small-business page — each of a declared kind, with a label, and opened in a new tab once it has an address. */
export function TargetLinks({ links, onChange, disabled = false }: TargetLinksProps) {
  const set = (index: number, patch: Partial<TargetLink>) =>
    onChange(links.map((link, at) => (at === index ? { ...link, ...patch } : link)));
  return (
    <Stack gap={2} aria-label="Links" role="group">
      <Text tone="secondary" size="sm">
        Links
      </Text>
      {links.length === 0 ? (
        <Text tone="muted" size="sm">
          No page kept yet.
        </Text>
      ) : null}
      {links.map((link, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- a link row is its position while it is edited
        <Stack key={index} direction="row" gap={2} align="end" wrap>
          <SelectField
            label={`Link ${index + 1} kind`}
            value={link.kind}
            disabled={disabled}
            onChange={(event) => set(index, { kind: event.target.value as TargetLinkKind })}
          >
            {TARGET_LINK_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {TARGET_LINK_KIND_LABEL[kind]}
              </option>
            ))}
          </SelectField>
          <TextField
            label={`Link ${index + 1} address`}
            type="url"
            value={link.url}
            disabled={disabled}
            onChange={(event) => set(index, { url: event.target.value })}
          />
          <TextField
            label={`Link ${index + 1} label`}
            value={link.label}
            disabled={disabled}
            onChange={(event) => set(index, { label: event.target.value })}
          />
          {link.url.length > 0 ? (
            <a href={link.url} target="_blank" rel="noreferrer">
              Open
            </a>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove link ${index + 1}`}
            disabled={disabled}
            onClick={() => onChange(links.filter((_, at) => at !== index))}
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
        onClick={() => onChange([...links, EMPTY])}
      >
        Add link
      </Button>
    </Stack>
  );
}
