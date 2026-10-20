'use client';

import { PRACTICE_FORMAT_IDS, PRACTICE_FORMATS, type PracticeFormatId } from '@sysdesign/contracts';
import { SelectField, Text } from '@sysdesign/design-system';

export interface FormatFieldProps {
  value: PracticeFormatId;
  onChange: (format: PracticeFormatId) => void;
  'data-testid'?: string;
}

/**
 * The practice format a prompt asks for, chosen from the contract's declared
 * table — the whole system, or one competency practised on its own. Shown
 * with the chosen format's own sentence, so the author knows what the
 * graders will lean on.
 */
export function FormatField({ value, onChange, 'data-testid': testId }: FormatFieldProps) {
  return (
    <>
      <SelectField
        label="Practice format"
        value={value}
        onChange={(event) => onChange(event.target.value as PracticeFormatId)}
        data-testid={testId ?? 'compose-format'}
      >
        {PRACTICE_FORMAT_IDS.map((id) => (
          <option key={id} value={id}>
            {PRACTICE_FORMATS[id].label}
          </option>
        ))}
      </SelectField>
      <Text size="sm" tone="muted" data-testid={`${testId ?? 'compose-format'}-blurb`}>
        {PRACTICE_FORMATS[value].blurb}
      </Text>
    </>
  );
}
