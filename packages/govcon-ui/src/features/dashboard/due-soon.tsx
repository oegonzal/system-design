import { DASH, day, daysLeftLabel, DUE_SOON_DAYS } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import type { DueItem } from './due-items';

export interface DueSoonProps {
  items: readonly DueItem[];
}

/** What is due inside the week — tracked notices and tracked firms and awards in one list, the soonest first: what to do first. */
export function DueSoon({ items }: DueSoonProps) {
  const Link = useLink();
  return (
    <Stack gap={3}>
      <Heading level={2}>Due this week</Heading>
      {items.length === 0 ? (
        <Text tone="muted" size="sm">
          Nothing due inside {DUE_SOON_DAYS} days.
        </Text>
      ) : (
        <Table aria-label="Due this week">
          <thead>
            <tr>
              <th>What</th>
              <th>Title</th>
              <th>Deadline or end</th>
              <th>Reminder</th>
              <th>Next action</th>
              <th>Left</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <td>
                  <Badge tone={item.badge.tone}>{item.badge.label}</Badge>
                </td>
                <td>
                  <Link href={item.href} $variant="inline">
                    {item.title}
                  </Link>
                </td>
                <td>{day(item.deadline)}</td>
                <td>{day(item.reminder)}</td>
                <td>{item.next ?? DASH}</td>
                <td>{daysLeftLabel(item.left)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Stack>
  );
}
