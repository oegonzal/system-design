'use client';

import { ASSUMPTION_BOUND, NARRATIVE_ASSUMPTIONS_BOUND } from '@sysdesign/contracts';
import { Button, Heading, Stack, Text, TextField } from '@sysdesign/design-system';

import { useCanvasStore } from '../canvas/canvas-store-context';

/**
 * The assumptions the design depends on, one sentence each, stated where the
 * graders look for them rather than left inside a claim. A standing criterion
 * asks for them on every prompt.
 */
export function NarrativeAssumptions() {
  const readOnly = useCanvasStore((state) => state.readOnly);
  const assumptions = useCanvasStore((state) => state.assumptions);
  const addAssumption = useCanvasStore((state) => state.addAssumption);
  const setAssumption = useCanvasStore((state) => state.setAssumption);
  const removeAssumption = useCanvasStore((state) => state.removeAssumption);

  return (
    <Stack gap={2}>
      <Heading level={3}>Assumptions</Heading>
      <Text size="sm" tone="muted">
        What you take as given that the prompt does not state — one sentence each. An assumption
        that narrows a stated requirement is a finding; one that is simply stated is a design.
      </Text>
      {assumptions.map((text, index) => (
        <Stack
          // Assumptions have no id of their own: positional rows, re-keyed on removal.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={index}
          direction="row"
          gap={2}
          align="end"
        >
          <TextField
            label={`Assumption ${index + 1}`}
            data-testid={`narrative-assumption-${index}`}
            value={text}
            maxLength={ASSUMPTION_BOUND.ceiling}
            target={ASSUMPTION_BOUND.target}
            placeholder="e.g. A shopper reads only their own history."
            disabled={readOnly}
            onChange={(event) => setAssumption(index, event.target.value)}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={readOnly}
            data-testid={`narrative-assumption-${index}-remove`}
            onClick={() => removeAssumption(index)}
          >
            Remove
          </Button>
        </Stack>
      ))}
      <div>
        <Button
          size="sm"
          variant="subtle"
          disabled={readOnly || assumptions.length >= NARRATIVE_ASSUMPTIONS_BOUND.target}
          data-testid="narrative-assumption-add"
          onClick={addAssumption}
        >
          Add an assumption
        </Button>
      </div>
    </Stack>
  );
}
