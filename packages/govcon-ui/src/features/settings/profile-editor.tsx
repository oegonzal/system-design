import {
  FACTOR_IDS,
  MAX_ALERT_ENDING_DAYS,
  MAX_PAGE_SIZE,
  type FactorId,
  type ScoringPolicy,
  type SearchProfile,
} from '@sysdesign/contracts';
import {
  Alert,
  Button,
  CheckboxField,
  Heading,
  Stack,
  Text,
  TextField,
} from '@sysdesign/design-system';

import {
  BandRows,
  CodeChips,
  FieldIssues,
  InterestRows,
  NumberField,
  PriceRows,
  Section,
  type ProfileIssue,
} from './editor-fields';

export type { ProfileIssue } from './editor-fields';

export interface ProfileEditorProps {
  value: SearchProfile;
  onChange(next: SearchProfile): void;
  /** `create` lets the id be typed; `edit` keeps it. */
  mode: 'create' | 'edit';
  /** The service's answer to the last save, per path. */
  issues?: readonly ProfileIssue[];
  onSave(): void;
  onCancel?: () => void;
  saving?: boolean;
}

/** The weights as the profile prices them, summed live — they must reach 1. */
export const weightSum = (weights: Record<FactorId, number>): number =>
  Math.round(FACTOR_IDS.reduce((sum, id) => sum + (weights[id] ?? 0), 0) * 1000) / 1000;

const upperNoSpace = (code: string): string => code.trim().toUpperCase();
const digits = (code: string): string => code.replace(/\D/g, '');

/**
 * The whole profile as data, one section per part the scorer reads: every
 * code, phrase, price, band and threshold is a field, and every issue the
 * service names sits beside the field it names. Nothing here decides — the
 * service validates on save and answers per path.
 */
const NO_ISSUES: readonly ProfileIssue[] = [];

export function ProfileEditor({
  value,
  onChange,
  mode,
  issues = NO_ISSUES,
  onSave,
  onCancel,
  saving = false,
}: ProfileEditorProps) {
  const patch = (next: Partial<SearchProfile>) => onChange({ ...value, ...next });
  const scoring = (next: Partial<ScoringPolicy>) =>
    patch({ scoring: { ...value.scoring, ...next } });
  const sum = weightSum(value.scoring.weights);
  const sumOk = Math.abs(sum - 1) < 1e-6;
  const topIssues = issues.filter((issue) => issue.path === '');

  return (
    <Stack
      as="form"
      gap={5}
      aria-label={mode === 'create' ? 'New profile' : `Profile ${value.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Stack direction="row" gap={4} align="center" wrap justify="between">
        <Heading level={2}>
          {mode === 'create' ? 'New profile' : `Profile · ${value.company || value.id}`}
        </Heading>
        <Stack direction="row" gap={3} align="center">
          {onCancel ? (
            <Button type="button" variant="subtle" size="md" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="solid" size="md" disabled={saving}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create profile' : 'Save profile'}
          </Button>
        </Stack>
      </Stack>
      {issues.length > 0 ? (
        <Alert tone="danger" title={`${issues.length} issue(s) — nothing was saved`}>
          {issues.map((issue) => `${issue.path || 'profile'}: ${issue.message}`).join(' · ')}
        </Alert>
      ) : null}
      {topIssues.length > 0 ? <FieldIssues issues={topIssues} path="" /> : null}

      <Section
        title="Identity"
        hint="The id is the slug every route names; the UEI is the company's SAM.gov registration."
      >
        <Stack direction="row" gap={4} align="end" wrap>
          <TextField
            label="Id"
            value={value.id}
            disabled={saving || mode === 'edit'}
            onChange={(event) => patch({ id: event.target.value.trim().toLowerCase() })}
          />
          <TextField
            label="Company"
            value={value.company}
            disabled={saving}
            onChange={(event) => patch({ company: event.target.value })}
          />
          <TextField
            label="Entity UEI"
            value={value.entityUei ?? ''}
            disabled={saving}
            onChange={(event) => patch({ entityUei: upperNoSpace(event.target.value) || null })}
          />
        </Stack>
        <FieldIssues issues={issues} path="id" />
        <FieldIssues issues={issues} path="company" />
        <FieldIssues issues={issues} path="entityUei" />
      </Section>

      <Section
        title="Codes"
        hint="A shorter code is the whole family under it: a six-digit NAICS matched exactly scores 1, a four-digit family 4/6."
      >
        <CodeChips
          label="NAICS"
          codes={value.naics}
          onChange={(naics) => patch({ naics })}
          normalize={digits}
          placeholder="332710"
          disabled={saving}
        />
        <FieldIssues issues={issues} path="naics" />
        <CodeChips
          label="PSC"
          codes={value.psc}
          onChange={(psc) => patch({ psc })}
          normalize={upperNoSpace}
          placeholder="DA01"
          disabled={saving}
        />
        <FieldIssues issues={issues} path="psc" />
      </Section>

      <Section
        title="Interests"
        hint="Phrases matched as whole tokens in a title; matched weights add up and cap at 1."
      >
        <InterestRows
          interests={value.interests}
          onChange={(interests) => patch({ interests })}
          disabled={saving}
        />
        <FieldIssues issues={issues} path="interests" />
      </Section>

      <Section
        title="Weights"
        hint="One per factor; they must sum to 1. A factor at 0 still shows in every trace."
      >
        <Stack direction="row" gap={3} align="end" wrap>
          {FACTOR_IDS.map((id) => (
            <NumberField
              key={id}
              label={`Weight ${id}`}
              value={value.scoring.weights[id]}
              min={0}
              max={1}
              step={0.05}
              disabled={saving}
              onChange={(weight) =>
                scoring({ weights: { ...value.scoring.weights, [id]: weight } })
              }
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
          prices={value.scoring.setAside.byCode}
          disabled={saving}
          onChange={(byCode) => scoring({ setAside: { ...value.scoring.setAside, byCode } })}
        />
        <NumberField
          label="Open competition"
          value={value.scoring.setAside.unrestricted}
          min={0}
          max={1}
          step={0.05}
          disabled={saving}
          onChange={(unrestricted) =>
            scoring({ setAside: { ...value.scoring.setAside, unrestricted } })
          }
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
          prices={value.scoring.noticeType.byType}
          disabled={saving}
          onChange={(byType) => scoring({ noticeType: { ...value.scoring.noticeType, byType } })}
        />
        <NumberField
          label="Default notice type price"
          value={value.scoring.noticeType.default}
          min={0}
          max={1}
          step={0.05}
          disabled={saving}
          onChange={(next) =>
            scoring({ noticeType: { ...value.scoring.noticeType, default: next } })
          }
        />
        <CodeChips
          label="Excluded notice types"
          codes={value.scoring.noticeType.exclude}
          onChange={(exclude) => scoring({ noticeType: { ...value.scoring.noticeType, exclude } })}
          placeholder="Award Notice"
          disabled={saving}
        />
        <FieldIssues issues={issues} path="scoring.noticeType" />
      </Section>

      <Section
        title="Deadline"
        hint="Ascending bands by days left, a value beyond the last band, and one for no deadline; a passed deadline excludes."
      >
        <BandRows
          label="Deadline"
          bands={value.scoring.deadline.bands}
          disabled={saving}
          onChange={(bands) => scoring({ deadline: { ...value.scoring.deadline, bands } })}
        />
        <Stack direction="row" gap={3} align="end" wrap>
          <NumberField
            label="Deadline beyond the last band"
            value={value.scoring.deadline.beyond}
            min={0}
            max={1}
            step={0.05}
            disabled={saving}
            onChange={(beyond) => scoring({ deadline: { ...value.scoring.deadline, beyond } })}
          />
          <NumberField
            label="No deadline stated"
            value={value.scoring.deadline.none}
            min={0}
            max={1}
            step={0.05}
            disabled={saving}
            onChange={(none) => scoring({ deadline: { ...value.scoring.deadline, none } })}
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
          bands={value.scoring.freshness.bands}
          disabled={saving}
          onChange={(bands) => scoring({ freshness: { ...value.scoring.freshness, bands } })}
        />
        <Stack direction="row" gap={3} align="end" wrap>
          <NumberField
            label="Freshness beyond the last band"
            value={value.scoring.freshness.beyond}
            min={0}
            max={1}
            step={0.05}
            disabled={saving}
            onChange={(beyond) => scoring({ freshness: { ...value.scoring.freshness, beyond } })}
          />
          <NumberField
            label="History window days"
            value={value.scoring.history.days}
            min={1}
            step={1}
            disabled={saving}
            onChange={(days) => scoring({ history: { ...value.scoring.history, days } })}
          />
          <NumberField
            label="Awards for a full point"
            value={value.scoring.history.saturateAt}
            min={1}
            step={1}
            disabled={saving}
            onChange={(saturateAt) =>
              scoring({ history: { ...value.scoring.history, saturateAt } })
            }
          />
        </Stack>
        <FieldIssues issues={issues} path="scoring.freshness" />
        <FieldIssues issues={issues} path="scoring.history" />
      </Section>

      <Section
        title="Tiers, horizon and pull"
        hint="Score thresholds; how far back a ranking looks; how much one pull may fetch per slice."
      >
        <Stack direction="row" gap={3} align="end" wrap>
          <NumberField
            label="High tier from"
            value={value.scoring.tiers.high}
            min={0}
            max={100}
            step={1}
            disabled={saving}
            onChange={(high) => scoring({ tiers: { ...value.scoring.tiers, high } })}
          />
          <NumberField
            label="Medium tier from"
            value={value.scoring.tiers.medium}
            min={0}
            max={100}
            step={1}
            disabled={saving}
            onChange={(medium) => scoring({ tiers: { ...value.scoring.tiers, medium } })}
          />
          <NumberField
            label="Leads horizon days"
            value={value.leads.horizonDays}
            min={1}
            step={1}
            disabled={saving}
            onChange={(horizonDays) => patch({ leads: { horizonDays } })}
          />
          <NumberField
            label="Pull page size"
            value={value.pull.pageSize}
            min={1}
            max={MAX_PAGE_SIZE}
            step={1}
            disabled={saving}
            onChange={(pageSize) => patch({ pull: { ...value.pull, pageSize } })}
          />
          <NumberField
            label="Pages per slice"
            value={value.pull.maxPagesPerSlice}
            min={1}
            step={1}
            disabled={saving}
            onChange={(maxPagesPerSlice) => patch({ pull: { ...value.pull, maxPagesPerSlice } })}
          />
        </Stack>
        <FieldIssues issues={issues} path="scoring.tiers" />
        <FieldIssues issues={issues} path="leads" />
        <FieldIssues issues={issues} path="pull" />
      </Section>

      <Section
        title="Alerts"
        hint="What the daily spending digest flags for this profile: an award in its codes ending inside this many days, and the fiscal period in progress obligating above every prior year's."
      >
        <Stack direction="row" gap={4} align="center" wrap>
          <NumberField
            label="Ending within days"
            value={value.alerts.endingWithinDays}
            min={0}
            max={MAX_ALERT_ENDING_DAYS}
            step={1}
            disabled={saving}
            onChange={(endingWithinDays) =>
              patch({ alerts: { ...value.alerts, endingWithinDays } })
            }
          />
          <CheckboxField
            label="Alert when the pulse runs above its band"
            checked={value.alerts.pulseAboveBand}
            disabled={saving}
            onChange={(event) =>
              patch({ alerts: { ...value.alerts, pulseAboveBand: event.target.checked } })
            }
          />
        </Stack>
        <FieldIssues issues={issues} path="alerts" />
      </Section>
      <Text tone="muted" size="sm">
        Saved as one document; the service validates it whole and writes nothing on an issue.
      </Text>
    </Stack>
  );
}
