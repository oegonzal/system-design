import {
  MAX_INTRODUCTION_OFFERS,
  type IntroductionPolicy,
  type Offer,
  type SearchProfile,
} from '@sysdesign/contracts';
import { Button, Stack, TextAreaField, TextField } from '@sysdesign/design-system';

import { FieldIssues, Section, type ProfileIssue } from './editor-fields';

export interface IntroductionSectionProps {
  value: SearchProfile['introduction'];
  onChange(next: IntroductionPolicy): void;
  issues: readonly ProfileIssue[];
  disabled?: boolean;
}

/** A slug for a new offer: its position, until the person names it. */
const slugAt = (position: number): string => `offer-${position + 1}`;

/** What an introduction is written from: the company in a line or two, how it delivers, and the offers it makes as rows, each under a slug the notes cite. */
export function IntroductionSection({
  value,
  onChange,
  issues,
  disabled = false,
}: IntroductionSectionProps) {
  const setOffer = (index: number, patch: Partial<Offer>) =>
    onChange({
      ...value,
      offers: value.offers.map((offer, at) => (at === index ? { ...offer, ...patch } : offer)),
    });
  return (
    <Section
      title="Introductions"
      hint="What a note to a prime is written from. The quality loop drafts an introduction about a tracked award from the award’s record and these words, and nothing else — so write them as you would say them to a program manager."
    >
      <TextAreaField
        label="The company, in a line or two"
        rows={2}
        value={value.about}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, about: event.target.value })}
      />
      <TextField
        label="How the work is delivered"
        value={value.delivery}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, delivery: event.target.value })}
      />
      <TextField
        label="How the reader reaches you"
        value={value.contact}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, contact: event.target.value })}
      />
      <Stack gap={2} aria-label="Offers" role="group">
        {value.offers.map((offer, index) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- an offer row is its position while it is edited
          <Stack key={index} direction="row" gap={2} align="end" wrap>
            <TextField
              label={`Offer ${index + 1} slug`}
              value={offer.id}
              disabled={disabled}
              onChange={(event) => setOffer(index, { id: event.target.value })}
            />
            <TextField
              label={`Offer ${index + 1} label`}
              value={offer.label}
              disabled={disabled}
              onChange={(event) => setOffer(index, { label: event.target.value })}
            />
            <TextField
              label={`Offer ${index + 1} line`}
              value={offer.line}
              disabled={disabled}
              onChange={(event) => setOffer(index, { line: event.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove offer ${index + 1}`}
              disabled={disabled}
              onClick={() =>
                onChange({ ...value, offers: value.offers.filter((_, at) => at !== index) })
              }
            >
              ✕
            </Button>
          </Stack>
        ))}
        <Button
          type="button"
          variant="subtle"
          size="sm"
          disabled={disabled || value.offers.length >= MAX_INTRODUCTION_OFFERS}
          onClick={() =>
            onChange({
              ...value,
              offers: [...value.offers, { id: slugAt(value.offers.length), label: '', line: '' }],
            })
          }
        >
          Add offer
        </Button>
      </Stack>
      <FieldIssues issues={issues} path="introduction" />
    </Section>
  );
}
