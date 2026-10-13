import {
  compactMoney,
  FACET_IDS,
  facetParams,
  formatAmountRange,
  parseAmountRange,
  SPENDING_FACETS,
  withFacet,
  type FacetId,
  type SpendingFacets,
} from '@sysdesign/contracts';
import {
  Button,
  CheckboxField,
  ChipGroup,
  SelectField,
  Stack,
  type ChipOption,
} from '@sysdesign/design-system';

/** A one-press setting for a facet that comes from somewhere else — the profile, say — as its spelling. */
export interface FacetPreset {
  label: string;
  /** The facet's value as the address spells it. */
  raw: string;
}

export interface FacetControlsProps {
  facets: SpendingFacets;
  /** A choice made at once: a select, a checkbox, a preset. */
  onCommit(next: SpendingFacets): void;
  /** One press in what may be a run of them — a set of chips — to be handed on once they pause. */
  onSettle(next: SpendingFacets): void;
  presets?: Partial<Record<FacetId, FacetPreset>>;
  disabled?: boolean;
}

const ANY = '';

/** A range as a person reads it, for one no band names. */
const rangeLabel = (raw: string): string => {
  const range = parseAmountRange(raw);
  if (range === null) return raw;
  if (range.min === null) return `Up to ${compactMoney(range.max)}`;
  if (range.max === null) return `Over ${compactMoney(range.min)}`;
  return `${compactMoney(range.min)} to ${compactMoney(range.max)}`;
};

interface FacetControlProps extends FacetControlsProps {
  id: FacetId;
}

/**
 * One facet's control, chosen by its declared kind and working on its one
 * spelling — so the control, the address and the wire can never disagree on
 * how a value is written, and a facet added to the table needs no control
 * of its own. A code or a range the table does not offer but the address
 * names is shown pressed beside the ones it does.
 */
function FacetControl({ id, facets, onCommit, onSettle, presets, disabled }: FacetControlProps) {
  const facet = SPENDING_FACETS[id];
  const spelled = facetParams(facets)[id] ?? null;
  const set = (raw: string | null) => withFacet(facets, id, raw);
  const preset = presets?.[id];
  const presetButton =
    preset === undefined ? null : (
      <Button
        type="button"
        variant="subtle"
        size="sm"
        selected={spelled === preset.raw}
        disabled={disabled}
        onClick={() => onCommit(set(spelled === preset.raw ? null : preset.raw))}
      >
        {preset.label}
      </Button>
    );

  switch (facet.kind) {
    case 'choice':
      return (
        <SelectField
          label={facet.label}
          value={spelled ?? ANY}
          disabled={disabled}
          onChange={(event) =>
            onCommit(set(event.target.value === ANY ? null : event.target.value))
          }
        >
          <option value={ANY}>any</option>
          {facet.choices.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectField>
      );
    case 'codes': {
      const chosen = spelled === null ? [] : spelled.split(',');
      const offered: ChipOption[] = facet.choices.map((option) => ({
        id: option.id,
        label: option.id,
        description: option.label,
      }));
      const others = chosen
        .filter((code) => !facet.choices.some((option) => option.id === code))
        .map((code) => ({ id: code, label: code }));
      const toggled = (code: string): string[] =>
        chosen.includes(code) ? chosen.filter((item) => item !== code) : [...chosen, code];
      return (
        <Stack direction="row" gap={2} wrap align="center">
          <ChipGroup
            label={facet.label}
            showLabel
            options={[...offered, ...others]}
            value={chosen}
            disabled={disabled}
            onToggle={(code) => onSettle(set(toggled(code).join(',') || null))}
          />
          {presetButton}
        </Stack>
      );
    }
    case 'range': {
      const bands: ChipOption[] = facet.choices.map((band) => ({
        id: formatAmountRange(band),
        label: band.label,
        description: band.note,
      }));
      const custom =
        spelled !== null && !bands.some((band) => band.id === spelled)
          ? [{ id: spelled, label: rangeLabel(spelled) }]
          : [];
      return (
        <Stack direction="row" gap={2} wrap align="center">
          <ChipGroup
            label={facet.label}
            showLabel
            options={[...bands, ...custom]}
            value={spelled === null ? [] : [spelled]}
            disabled={disabled}
            onToggle={(range) => onCommit(set(range === spelled ? null : range))}
          />
          {presetButton}
        </Stack>
      );
    }
    case 'flag':
      return (
        <CheckboxField
          label={facet.label}
          checked={spelled !== null}
          disabled={disabled}
          onChange={(event) => onCommit(set(event.target.checked ? 'true' : null))}
        />
      );
  }
}

/** The kinds whose control is one small field: they share a row, where a row of chips takes a line of its own. */
const COMPACT_KINDS: readonly string[] = ['choice', 'flag'];
const isCompact = (id: FacetId): boolean => COMPACT_KINDS.includes(SPENDING_FACETS[id].kind);

/** Every declared facet, in the table's order: the small controls on one row, then each row of chips. */
export function FacetControls(props: FacetControlsProps) {
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={4} wrap align="end">
        {FACET_IDS.filter(isCompact).map((id) => (
          <FacetControl key={id} id={id} {...props} />
        ))}
      </Stack>
      {FACET_IDS.filter((id) => !isCompact(id)).map((id) => (
        <FacetControl key={id} id={id} {...props} />
      ))}
    </Stack>
  );
}
