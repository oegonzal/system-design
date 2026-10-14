import {
  day,
  describeQuery,
  LEAD_TIERS,
  minute,
  type SavedSearch,
  type SearchYield,
} from '@sysdesign/contracts';
import {
  Badge,
  Button,
  CheckboxField,
  Heading,
  Stack,
  Table,
  Text,
  TextField,
} from '@sysdesign/design-system';

import { TIER_TONE } from '../tones';

export interface SavedSearchListProps {
  searches: readonly SavedSearch[];
  /** The row a write is in flight for; its controls wait. */
  busyId?: string | null;
  onToggleIncluded(search: SavedSearch, includedInPull: boolean): void;
  onOrderChange(search: SavedSearch, pullOrder: number): void;
  /** One request per page. */
  onRun(search: SavedSearch): void;
  onEdit(search: SavedSearch): void;
  onDelete(search: SavedSearch): void;
  sourceDisabled?: boolean;
}

const clampOrder = (value: number): number =>
  Number.isFinite(value) ? Math.min(1000, Math.max(0, Math.round(value))) : 0;

/**
 * What a search's last read of the source brought in: the day, how many
 * records and how many of them new, then how the profile ranked what it
 * carried — a badge per tier that has any, and what a gate keeps off the
 * list. The evidence a search is kept in the daily pull on.
 */
function LastYield({ found }: { found: SearchYield | null }) {
  if (found === null) {
    return (
      <Text tone="muted" size="sm">
        not read yet
      </Text>
    );
  }
  const ranked = LEAD_TIERS.filter((tier) => found.tiers[tier] > 0);
  return (
    <Stack gap={1}>
      <Text size="sm" title={`Posted ${found.window.from} to ${found.window.to}`}>
        {`${day(found.at)}: ${found.received} read, ${found.inserted} new${found.truncated ? ', more matched' : ''}`}
      </Text>
      <Stack direction="row" gap={1} align="center" wrap>
        {ranked.map((tier) => (
          <Badge key={tier} tone={TIER_TONE[tier]}>{`${found.tiers[tier]} ${tier}`}</Badge>
        ))}
        {found.unlisted > 0 ? (
          <Text as="span" tone="muted" size="sm">{`${found.unlisted} not listed`}</Text>
        ) : null}
      </Stack>
    </Stack>
  );
}

/**
 * The profile's saved searches, in pull order: which run in the daily pull
 * and in what order, when each last ran and what its last read brought in,
 * and what to do with each — run it now (one request per page), load it
 * back into the form, or remove it.
 */
export function SavedSearchList({
  searches,
  busyId = null,
  onToggleIncluded,
  onOrderChange,
  onRun,
  onEdit,
  onDelete,
  sourceDisabled = false,
}: SavedSearchListProps) {
  return (
    <Stack gap={3}>
      <Heading level={3}>Saved searches</Heading>
      {searches.length === 0 ? (
        <Text tone="muted" size="sm">
          None yet — fill the form above and save it under a name.
        </Text>
      ) : (
        <Table aria-label="Saved searches">
          <thead>
            <tr>
              <th>Name</th>
              <th>Filters</th>
              <th>Days</th>
              <th>In daily pull</th>
              <th>Order</th>
              <th>Last run</th>
              <th>Last read brought</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {searches.map((search) => {
              const busy = busyId === search.id;
              return (
                <tr key={search.id}>
                  <td>{search.name}</td>
                  <td>{describeQuery(search.filter)}</td>
                  <td>{search.days}</td>
                  <td>
                    <CheckboxField
                      label={search.includedInPull ? 'yes' : 'no'}
                      aria-label={`Include ${search.name} in the daily pull`}
                      checked={search.includedInPull}
                      disabled={busy}
                      onChange={(event) => onToggleIncluded(search, event.target.checked)}
                    />
                  </td>
                  <td>
                    <TextField
                      label="Pull order"
                      aria-label={`Pull order of ${search.name}`}
                      type="number"
                      min={0}
                      max={1000}
                      value={search.pullOrder}
                      disabled={busy}
                      onChange={(event) =>
                        onOrderChange(search, clampOrder(event.target.valueAsNumber))
                      }
                    />
                  </td>
                  <td>{search.lastRunAt === null ? 'never' : minute(search.lastRunAt)}</td>
                  <td>
                    <LastYield found={search.lastYield} />
                  </td>
                  <td>
                    <Stack direction="row" gap={2} wrap>
                      <Button
                        size="sm"
                        variant="solid"
                        disabled={busy || sourceDisabled}
                        onClick={() => onRun(search)}
                        aria-label={`Run ${search.name} (1 request per page)`}
                      >
                        Run (1 request per page)
                      </Button>
                      <Button
                        size="sm"
                        variant="subtle"
                        disabled={busy}
                        onClick={() => onEdit(search)}
                        aria-label={`Edit ${search.name}`}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onDelete(search)}
                        aria-label={`Delete ${search.name}`}
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
      )}
    </Stack>
  );
}
