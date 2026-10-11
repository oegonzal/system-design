import {
  BUSY_ATTRIBUTE_BOUND,
  BUSY_SIGHTS_BOUND,
  excerpt,
  type BusyRead,
} from '@sysdesign/contracts';
import type { Page } from 'playwright';

import { MODAL_DIALOGS } from './element-facts';
import type { PageReading } from './observation-reading';

/** What says a region is still loading, by ARIA: busy, or a progressbar with no current value. */
const BUSY_INDICATORS =
  '[aria-busy="true"], [role="progressbar"]:not([aria-valuenow]), progress:not([value])';
/** Everything the check looks at and records — every element that could say it — of which `BUSY_INDICATORS` is the part that counts. */
const BUSY_CANDIDATES = '[aria-busy], [role="progressbar"], progress';
/** A check that could not run: nothing seen, nothing held back. */
const NO_BUSY_READ: BusyRead = { scopes: 0, seen: [], unseen: 0 };

/**
 * Whether a dialog in front of the page shows it is still loading, and what
 * the check saw there: every candidate inside each modal scope with the facts
 * the rule reads, the verdict taken over all of them before the record is
 * clipped. A page that cannot answer is not loading, and says so by an empty
 * record.
 */
export async function busyCheck(page: Page): Promise<Pick<PageReading, 'scopeBusy' | 'busyRead'>> {
  try {
    const { busy, scopes, seen } = await page.evaluate(
      ({ modal, indicators, candidates }) => {
        let found: Element[];
        try {
          found = Array.from(document.querySelectorAll(modal.any));
        } catch {
          // An engine without `:modal` answers the ARIA half alone.
          found = Array.from(document.querySelectorAll(modal.aria));
        }
        const sights = found
          .flatMap((scope) => [scope, ...Array.from(scope.querySelectorAll(candidates))])
          .filter((el) => el.matches(candidates))
          .map((el) => {
            const visible = el.checkVisibility();
            return {
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role'),
              ariaBusy: el.getAttribute('aria-busy'),
              ariaValueNow: el.getAttribute('aria-valuenow'),
              ariaValueText: el.getAttribute('aria-valuetext'),
              value: el.getAttribute('value'),
              visible,
              counted: el.matches(indicators) && visible,
            };
          });
        return { busy: sights.some((sight) => sight.counted), scopes: found.length, seen: sights };
      },
      { modal: MODAL_DIALOGS, indicators: BUSY_INDICATORS, candidates: BUSY_CANDIDATES },
    );
    const fact = (text: string | null): string | null =>
      text === null ? null : excerpt(text, BUSY_ATTRIBUTE_BOUND.target);
    const kept = seen.slice(0, BUSY_SIGHTS_BOUND.target).map((sight) => ({
      ...sight,
      tag: excerpt(sight.tag, BUSY_ATTRIBUTE_BOUND.target),
      role: fact(sight.role),
      ariaBusy: fact(sight.ariaBusy),
      ariaValueNow: fact(sight.ariaValueNow),
      ariaValueText: fact(sight.ariaValueText),
      value: fact(sight.value),
    }));
    return {
      scopeBusy: busy,
      busyRead: { scopes, seen: kept, unseen: seen.length - kept.length },
    };
  } catch {
    return { scopeBusy: false, busyRead: NO_BUSY_READ };
  }
}
