import {
  ALERT_AUDIENCES,
  LEAD_TIERS,
  MAX_ALERT_ENDING_DAYS,
  MAX_FOLLOW_UP_BUSINESS_DAYS,
  MAX_PAGE_SIZE,
  type AlertAudience,
  type LeadTier,
  type ScoringPolicy,
  type SearchProfile,
} from '@sysdesign/contracts';
import {
  Alert,
  Button,
  CheckboxField,
  Heading,
  SelectField,
  Stack,
  Text,
  TextField,
} from '@sysdesign/design-system';

import {
  CodeChips,
  FieldIssues,
  InterestRows,
  NumberField,
  Section,
  type ProfileIssue,
} from './editor-fields';
import { IntroductionSection } from './introduction-section';
import { ScoringSections } from './scoring-sections';

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

const ALERT_AUDIENCE_LABEL: Record<AlertAudience, string> = {
  scope: 'Awards in these codes, and tracked awards',
  watched: 'Tracked awards only',
};

/** A select has no null: this value stands for a policy that raises no lead. */
const NO_LEADS = 'none';
/** What is raised when the floor is that tier: it, and every better one. */
const NEW_LEAD_TIER_LABEL: Record<LeadTier, string> = {
  high: 'Ranked high',
  medium: 'Ranked medium or high',
  low: 'Every ranked notice',
};

const upperNoSpace = (code: string): string => code.trim().toUpperCase();
const digits = (code: string): string => code.replace(/\D/g, '');

const NO_ISSUES: readonly ProfileIssue[] = [];

/**
 * The whole profile as data, one section per part the service reads: every
 * code, phrase, price, band and threshold is a field, and every issue the
 * service names sits beside the field it names. How a notice is scored is
 * its own run of sections. Nothing here decides — the service validates on
 * save and answers per path.
 */

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

      <ScoringSections
        scoring={value.scoring}
        onChange={scoring}
        issues={issues}
        disabled={saving}
      />

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
        hint="What is put to a person for this profile. After the daily warm: an award ending inside this many days — one in its codes with at least the floor obligated on it, or one that is tracked, whatever is on it — and the fiscal period in progress obligating above every prior year's; a tracked award also says when its end moves and when a stored notice may follow it. After the daily pull: each stored notice ranked in the tier chosen here, once. A tracked firm or award whose latest outreach has waited this many business days with no reply logged is raised once, in the tracker's own digest; 0 raises none."
      >
        <Stack direction="row" gap={4} align="end" wrap>
          <SelectField
            label="Ending awards raised"
            value={value.alerts.audience}
            disabled={saving}
            onChange={(event) =>
              patch({ alerts: { ...value.alerts, audience: event.target.value as AlertAudience } })
            }
          >
            {ALERT_AUDIENCES.map((audience) => (
              <option key={audience} value={audience}>
                {ALERT_AUDIENCE_LABEL[audience]}
              </option>
            ))}
          </SelectField>
          <NumberField
            label="Least obligated (USD)"
            value={value.alerts.minObligated}
            min={0}
            step={10000}
            disabled={saving}
            onChange={(minObligated) => patch({ alerts: { ...value.alerts, minObligated } })}
          />
        </Stack>
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
          <SelectField
            label="New leads raised"
            value={value.alerts.newLeadTier ?? NO_LEADS}
            disabled={saving}
            onChange={(event) =>
              patch({
                alerts: {
                  ...value.alerts,
                  newLeadTier:
                    event.target.value === NO_LEADS ? null : (event.target.value as LeadTier),
                },
              })
            }
          >
            {LEAD_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {NEW_LEAD_TIER_LABEL[tier]}
              </option>
            ))}
            <option value={NO_LEADS}>None</option>
          </SelectField>
          <NumberField
            label="Follow up after (business days)"
            value={value.alerts.followUpAfterBusinessDays}
            min={0}
            max={MAX_FOLLOW_UP_BUSINESS_DAYS}
            step={1}
            disabled={saving}
            onChange={(followUpAfterBusinessDays) =>
              patch({ alerts: { ...value.alerts, followUpAfterBusinessDays } })
            }
          />
        </Stack>
        <FieldIssues issues={issues} path="alerts" />
      </Section>

      <Section
        title="Teaming"
        hint="The size of subcontract this company could take. The Primes lens ranks a prime by the subcontracts it reports inside it."
      >
        <Stack direction="row" gap={4} align="center" wrap>
          <NumberField
            label="Smallest subcontract (USD)"
            value={value.teaming.subcontract.min}
            min={0}
            step={1000}
            disabled={saving}
            onChange={(min) =>
              patch({ teaming: { subcontract: { ...value.teaming.subcontract, min } } })
            }
          />
          <NumberField
            label="Largest subcontract (USD)"
            value={value.teaming.subcontract.max}
            min={0}
            step={1000}
            disabled={saving}
            onChange={(max) =>
              patch({ teaming: { subcontract: { ...value.teaming.subcontract, max } } })
            }
          />
        </Stack>
        <FieldIssues issues={issues} path="teaming" />
      </Section>

      <IntroductionSection
        value={value.introduction}
        issues={issues}
        disabled={saving}
        onChange={(introduction) => patch({ introduction })}
      />
      <Text tone="muted" size="sm">
        Saved as one document; the service validates it whole and writes nothing on an issue.
      </Text>
    </Stack>
  );
}
