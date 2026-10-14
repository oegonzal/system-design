import { day, describeAlert, type RaisedAlertView } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { Pager } from '../search/pager';
import { ALERT_KIND_TONE } from '../tones';
import { ALERT_KIND_LABEL, alertLinks } from './alert-links';

export interface AlertListProps {
  alerts: readonly RaisedAlertView[];
  total: number;
  limit: number;
  offset: number;
  onPage(offset: number): void;
  /** While another page is on its way. */
  loading?: boolean;
}

/**
 * What the daily warm raised, newest first: each alert as the line that was
 * sent, the day it was raised, and links to the things it names. An alert
 * kept without what was published is named by its key, which is all that
 * is left of it.
 */
export function AlertList({
  alerts,
  total,
  limit,
  offset,
  onPage,
  loading = false,
}: AlertListProps) {
  const Link = useLink();
  return (
    <Stack gap={3}>
      <Heading level={2}>Alerts</Heading>
      {total === 0 ? (
        <Text tone="muted" size="sm">
          Nothing raised yet. The daily warm raises an alert when an award ends inside the profile’s
          window, when a tracked award’s end moves, when a stored notice may follow a tracked award,
          and when a month obligates above every prior year’s; the daily pull raises one for each
          notice the profile ranks in the tier it asks to hear about.
        </Text>
      ) : (
        <>
          <Stack as="ul" gap={3} aria-label="Alerts">
            {alerts.map((view) => (
              <li key={view.id}>
                <Stack gap={1}>
                  <Stack direction="row" gap={2} align="center" wrap>
                    <Badge tone={ALERT_KIND_TONE[view.key.kind]}>
                      {ALERT_KIND_LABEL[view.key.kind]}
                    </Badge>
                    <Text as="span" tone="muted" size="sm">
                      raised {day(view.raisedAt)}
                    </Text>
                    {alertLinks(view).map((link) => (
                      <Link key={link.href} href={link.href} $variant="inline">
                        {link.label}
                      </Link>
                    ))}
                  </Stack>
                  <Text size="sm">
                    {view.alert === null ? view.key.subject : describeAlert(view.alert)}
                  </Text>
                </Stack>
              </li>
            ))}
          </Stack>
          <Pager offset={offset} limit={limit} total={total} onChange={onPage} disabled={loading} />
        </>
      )}
    </Stack>
  );
}
