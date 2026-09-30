import { Button, Heading, Stack, Text, TextAreaField } from '@sysdesign/design-system';
import { useState } from 'react';

import { lookupCost } from './costs';

export interface EntityLookupFormProps {
  onLookup(ueis: string[]): void;
  pending?: boolean;
}

const UEI = /^[A-Z0-9]{12}$/;

/** UEIs from free text — one per line, comma- or space-separated — upper-cased, deduplicated, the malformed ones set aside. */
export function parseUeis(text: string): { ueis: string[]; rejected: string[] } {
  const ueis: string[] = [];
  const rejected: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    const candidate = token.trim().toUpperCase();
    if (candidate.length === 0) continue;
    if (!UEI.test(candidate)) rejected.push(candidate);
    else if (!ueis.includes(candidate)) ueis.push(candidate);
  }
  return { ueis, rejected };
}

/** Registrants by UEI; the button says what the batch costs before it is pressed. */
export function EntityLookupForm({ onLookup, pending = false }: EntityLookupFormProps) {
  const [text, setText] = useState('');
  const { ueis, rejected } = parseUeis(text);
  return (
    <Stack gap={3}>
      <Heading level={3}>Look up registrants</Heading>
      <TextAreaField
        label="UEIs (one per line, or comma-separated)"
        value={text}
        rows={4}
        disabled={pending}
        onChange={(event) => setText(event.target.value)}
      />
      {rejected.length > 0 ? (
        <Text tone="secondary" size="sm">
          Not a UEI (twelve letters and digits): {rejected.join(', ')}
        </Text>
      ) : null}
      <Stack direction="row" gap={3} align="center" wrap>
        <Button
          type="button"
          variant="solid"
          size="md"
          disabled={pending || ueis.length === 0}
          onClick={() => onLookup(ueis)}
        >
          {pending ? 'Looking up…' : `Look up — ${lookupCost(ueis.length)}`}
        </Button>
        <Text tone="secondary" size="sm">
          {ueis.length} UEI(s) ready.
        </Text>
      </Stack>
    </Stack>
  );
}
