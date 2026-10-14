import {
  GOVCON_TOPICS,
  type AlertKind,
  type GovconAlert,
  type RaisedAlertView,
} from '@sysdesign/contracts';

import { awardHref } from '../award-href';
import { noticeHref } from '../notice-href';

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  'award-ending': 'Award ending',
  'award-end-moved': 'End moved',
  'award-notice': 'Possible follow-on',
  'pulse-above-band': 'Spending above its band',
};

export interface AlertLink {
  label: string;
  href: string;
}

/** The Spending page opens on the pulse of the profile's own codes. */
const PULSE: AlertLink = { label: 'Pulse', href: '/spending' };
const awardLink = (externalId: string): AlertLink => ({
  label: 'Award',
  href: awardHref(externalId),
});

/** Where a published alert leads: the pages of the things it names. */
const linksOf = (alert: GovconAlert): AlertLink[] => {
  switch (alert.topic) {
    case GOVCON_TOPICS.awardEnding:
    case GOVCON_TOPICS.awardEndMoved:
      return [awardLink(alert.payload.externalId)];
    case GOVCON_TOPICS.awardNotice:
      return [
        { label: 'Notice', href: noticeHref(alert.payload.noticeId) },
        awardLink(alert.payload.externalId),
      ];
    case GOVCON_TOPICS.pulseAboveBand:
      return [PULSE];
  }
};

/**
 * Where an alert kept without its payload still leads, from its key alone:
 * an ending award's subject is the award's id, and a pulse's finding is on
 * the pulse. The other kinds key on two things at once, and lead nowhere
 * without the payload that names them apart.
 */
const LINKS_BY_KEY: Record<AlertKind, (subject: string) => AlertLink[]> = {
  'award-ending': (subject) => [awardLink(subject)],
  'award-end-moved': () => [],
  'award-notice': () => [],
  'pulse-above-band': () => [PULSE],
};

export const alertLinks = (view: RaisedAlertView): AlertLink[] =>
  view.alert === null ? LINKS_BY_KEY[view.key.kind](view.key.subject) : linksOf(view.alert);
