import { MAX_VIEW_NAME_LENGTH, type SavedView } from '@sysdesign/contracts';
import { Alert, Button, Stack, Text, TextField } from '@sysdesign/design-system';
import { useState, type FormEvent } from 'react';

import { useLink } from '../../components/link-context';

export interface SavedViewListProps {
  views: readonly SavedView[];
  /** The page as it stands, as the address a save would keep. */
  currentHref: string;
  onSave(name: string): void;
  onRemove(id: string): void;
  /** While a save or a removal is in flight. */
  busy?: boolean;
  error?: string | null;
}

/**
 * The views a profile keeps for one page: each a link to its address, the
 * one that is this page marked as current, each removable; and one field
 * that keeps the page as it stands under a name. A name already kept takes
 * the new address, so a view is updated by saving it again.
 */
export function SavedViewList({
  views,
  currentHref,
  onSave,
  onRemove,
  busy = false,
  error = null,
}: SavedViewListProps) {
  const Link = useLink();
  const [name, setName] = useState('');
  /** The name a save was asked under; once the list holds it, the field is done with it. */
  const [asked, setAsked] = useState<string | null>(null);
  if (asked !== null && views.some((view) => view.name === asked && view.href === currentHref)) {
    setAsked(null);
    setName('');
  }
  const wanted = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (wanted.length === 0) return;
    setAsked(wanted);
    onSave(wanted);
  };
  return (
    <Stack gap={2}>
      {views.length === 0 ? (
        <Text tone="muted" size="sm">
          No saved views yet. Set the page up the way you want to come back to, then name it.
        </Text>
      ) : (
        <Stack as="ul" direction="row" gap={4} wrap align="center" aria-label="Saved views">
          {views.map((view) => (
            <li key={view.id}>
              <Stack direction="row" gap={1} align="center">
                <Link
                  href={view.href}
                  $variant="inline"
                  aria-current={view.href === currentHref ? 'page' : undefined}
                >
                  {view.name}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove the saved view ${view.name}`}
                  disabled={busy}
                  onClick={() => onRemove(view.id)}
                >
                  ×
                </Button>
              </Stack>
            </li>
          ))}
        </Stack>
      )}
      <Stack as="form" direction="row" gap={3} align="end" wrap onSubmit={submit}>
        <TextField
          label="Save this view as"
          value={name}
          maxLength={MAX_VIEW_NAME_LENGTH}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" variant="subtle" size="sm" disabled={busy || wanted.length === 0}>
          {views.some((view) => view.name === wanted) ? 'Update view' : 'Save view'}
        </Button>
      </Stack>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Stack>
  );
}
