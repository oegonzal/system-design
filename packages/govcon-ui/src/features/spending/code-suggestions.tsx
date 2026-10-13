'use client';

import { compactMoney, windowOf, type ScopeQuery } from '@sysdesign/contracts';
import {
  Alert,
  ChipGroup,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Spinner,
  Stack,
  Text,
} from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';

/** The two kinds of code a scope names, each ranked by its own breakdown. */
const KINDS = [
  { kind: 'psc', label: 'Largest PSC codes' },
  { kind: 'naics', label: 'Largest NAICS codes' },
] as const;
type CodeKind = (typeof KINDS)[number]['kind'];

interface RankedCodesProps {
  kind: CodeKind;
  label: string;
  scope: ScopeQuery;
  chosen: readonly string[];
  onToggle(code: string): void;
}

/**
 * One kind of code ranked by what the rest of the scope obligated under it
 * over a rolling year — the scope without its own codes of that kind, since
 * a list that names them already would rank only itself.
 */
function RankedCodes({ kind, label, scope, chosen, onToggle }: RankedCodesProps) {
  const window = windowOf('last-12-months', Date.now());
  const query = { ...scope, [kind]: undefined, category: kind, from: window.from, to: window.to };
  const ranked = useResource(
    (signal) => api.getSpendingBreakdown(query, { signal }),
    [JSON.stringify(query)],
  );
  if (ranked.error) return <Alert tone="danger">{ranked.error}</Alert>;
  if (!ranked.data) return <Spinner label={`Ranking ${kind.toUpperCase()} codes`} />;
  const options = ranked.data.rows.flatMap((row) =>
    row.code === null
      ? []
      : [
          {
            id: row.code,
            label: `${row.code} · ${compactMoney(row.amount)}`,
            description: row.name,
          },
        ],
  );
  return options.length === 0 ? (
    <Text tone="muted" size="sm">{`${label}: nothing obligated in the last twelve months.`}</Text>
  ) : (
    <ChipGroup label={label} showLabel options={options} value={chosen} onToggle={onToggle} />
  );
}

export interface CodeSuggestionsProps {
  scope: ScopeQuery;
  onToggle(kind: CodeKind, code: string): void;
}

/**
 * The codes worth naming, with the dollars that say so: the scope's largest
 * PSC and NAICS codes over the last twelve months, each a chip that puts
 * the code in the scope or takes it out. Read only once opened — two
 * breakdowns a scope — so a reader who never asks costs nothing.
 */
export function CodeSuggestions({ scope, onToggle }: CodeSuggestionsProps) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure open={open} onOpenChange={setOpen}>
      <DisclosureButton variant="subtle" size="sm">
        Largest codes in this scope
      </DisclosureButton>
      <DisclosurePanel>
        {open ? (
          <Stack gap={3}>
            {KINDS.map(({ kind, label }) => (
              <RankedCodes
                key={kind}
                kind={kind}
                label={label}
                scope={scope}
                chosen={scope[kind] ?? []}
                onToggle={(code) => onToggle(kind, code)}
              />
            ))}
          </Stack>
        ) : null}
      </DisclosurePanel>
    </Disclosure>
  );
}
