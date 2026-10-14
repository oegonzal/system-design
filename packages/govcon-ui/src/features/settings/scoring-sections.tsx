import { FACTOR_IDS, type FactorId, type ScoringPolicy } from '@sysdesign/contracts';
import { Alert, Stack } from '@sysdesign/design-system';

import {
  BandRows,
  CodeChips,
  FieldIssues,
  NumberField,
  PriceRows,
  Section,
  type ProfileIssue,
} from './editor-fields';

/** The weights as the profile prices them, summed live — they must reach 1. */
export const weightSum = (weights: Record<FactorId, number>): number =>
  Math.round(FACTOR_IDS.reduce((sum, id) => sum + (weights[id] ?? 0), 0) * 1000) / 1000;

export interface ScoringSectionsProps {
  scoring: ScoringPolicy;
  /** Called with the part of the policy that changed. */
  onChange(next: Partial<ScoringPolicy>): void;
  /** The service's answer to the last save, per path. */
  issues: readonly ProfileIssue[];
  disabled: boolean;
}

/**
 * How a notice is scored, one section per factor the scorer reads: the
 * weights and their live sum, the set-asides and notice types as prices,
 * and the deadline, freshness and history bands. Every issue the service
 * names sits beside the part of the policy it names.
 */
export function ScoringSections({ scoring, onChange, issues, disabled }: ScoringSectionsProps) {
  const sum = weightSum(scoring.weights);
  const sumOk = Math.abs(sum - 1) < 1e-6;
  return (
    <>
      <Section
        title="Weights"
        hint="One per factor; they must sum to 1. A factor at 0 still shows in every trace."
      >
        <Stack direction="row" gap={3} align="end" wrap>
          {FACTOR_IDS.map((id) => (
            <NumberField
              key={id}
              label={`Weight ${id}`}
              value={scoring.weights[id]}
              min={0}
              max={1}
              step={0.05}
              disabled={disabled}
              onChange={(weight) => onChange({ weights: { ...scoring.weights, [id]: weight } })}
            />
          ))}
        </Stack>
        <Alert tone={sumOk ? 'success' : 'warn'}>
          Weights sum to {sum.toFixed(2)}
          {sumOk ? '' : ' — they must sum to 1'}
        </Alert>
        <FieldIssues issues={issues} path="scoring.weights" />
      </Section>

      <Section
        title="Set-asides"
        hint="Codes the company may bid on and how attractive each is; any other code excludes the notice."
      >
        <PriceRows
          label="Set-aside price"
          keyLabel="set-aside code"
          prices={scoring.setAside.byCode}
          disabled={disabled}
          onChange={(byCode) => onChange({ setAside: { ...scoring.setAside, byCode } })}
        />
        <NumberField
          label="Open competition"
          value={scoring.setAside.unrestricted}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(unrestricted) => onChange({ setAside: { ...scoring.setAside, unrestricted } })}
        />
        <FieldIssues issues={issues} path="scoring.setAside" />
      </Section>

      <Section
        title="Notice types"
        hint="Prices by SAM.gov's label, a default for unlisted labels, and the types that are never a lead."
      >
        <PriceRows
          label="Notice type price"
          keyLabel="notice type"
          prices={scoring.noticeType.byType}
          disabled={disabled}
          onChange={(byType) => onChange({ noticeType: { ...scoring.noticeType, byType } })}
        />
        <NumberField
          label="Default notice type price"
          value={scoring.noticeType.default}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(next) => onChange({ noticeType: { ...scoring.noticeType, default: next } })}
        />
        <CodeChips
          label="Excluded notice types"
          codes={scoring.noticeType.exclude}
          onChange={(exclude) => onChange({ noticeType: { ...scoring.noticeType, exclude } })}
          placeholder="Award Notice"
          disabled={disabled}
        />
        <FieldIssues issues={issues} path="scoring.noticeType" />
      </Section>

      <Section
        title="Deadline"
        hint="Ascending bands by days left, a value beyond the last band, and one for no deadline; a passed deadline excludes."
      >
        <BandRows
          label="Deadline"
          bands={scoring.deadline.bands}
          disabled={disabled}
          onChange={(bands) => onChange({ deadline: { ...scoring.deadline, bands } })}
        />
        <Stack direction="row" gap={3} align="end" wrap>
          <NumberField
            label="Deadline beyond the last band"
            value={scoring.deadline.beyond}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            onChange={(beyond) => onChange({ deadline: { ...scoring.deadline, beyond } })}
          />
          <NumberField
            label="No deadline stated"
            value={scoring.deadline.none}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            onChange={(none) => onChange({ deadline: { ...scoring.deadline, none } })}
          />
        </Stack>
        <FieldIssues issues={issues} path="scoring.deadline" />
      </Section>

      <Section
        title="Freshness and history"
        hint="Days since posting, banded; and how many stored awards in the NAICS inside the window are worth a full point."
      >
        <BandRows
          label="Freshness"
          bands={scoring.freshness.bands}
          disabled={disabled}
          onChange={(bands) => onChange({ freshness: { ...scoring.freshness, bands } })}
        />
        <Stack direction="row" gap={3} align="end" wrap>
          <NumberField
            label="Freshness beyond the last band"
            value={scoring.freshness.beyond}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            onChange={(beyond) => onChange({ freshness: { ...scoring.freshness, beyond } })}
          />
          <NumberField
            label="History window days"
            value={scoring.history.days}
            min={1}
            step={1}
            disabled={disabled}
            onChange={(days) => onChange({ history: { ...scoring.history, days } })}
          />
          <NumberField
            label="Awards for a full point"
            value={scoring.history.saturateAt}
            min={1}
            step={1}
            disabled={disabled}
            onChange={(saturateAt) => onChange({ history: { ...scoring.history, saturateAt } })}
          />
        </Stack>
        <FieldIssues issues={issues} path="scoring.freshness" />
        <FieldIssues issues={issues} path="scoring.history" />
      </Section>
    </>
  );
}
