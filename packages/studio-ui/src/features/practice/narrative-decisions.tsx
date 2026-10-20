'use client';

import {
  DECISION_NODES_BOUND,
  DECISION_TEXT_BOUND,
  NARRATIVE_DECISIONS_BOUND,
  type CanvasGraph,
} from '@sysdesign/contracts';
import {
  Button,
  CheckboxField,
  Heading,
  Stack,
  Surface,
  Text,
  TextAreaField,
} from '@sysdesign/design-system';

import { useCanvasStore } from '../canvas/canvas-store-context';

export interface NarrativeDecisionsProps {
  graph: CanvasGraph;
}

/**
 * The decisions the whole design rests on, told the way a senior engineer
 * defends them: what was chosen, what was not, what it costs, and what would
 * change it. One row per decision, in the order the author added them; a
 * row is kept while its choice is typed, and the components it concerns are
 * offered from the canvas so a lens can cite them. Only the choice is
 * required: a decision with no alternative or no cost is saved and graded,
 * because that gap is the lesson.
 */
export function NarrativeDecisions({ graph }: NarrativeDecisionsProps) {
  const readOnly = useCanvasStore((state) => state.readOnly);
  const decisions = useCanvasStore((state) => state.decisions);
  const addDecision = useCanvasStore((state) => state.addDecision);
  const updateDecision = useCanvasStore((state) => state.updateDecision);
  const removeDecision = useCanvasStore((state) => state.removeDecision);
  const atCap = decisions.length >= NARRATIVE_DECISIONS_BOUND.target;

  return (
    <Stack gap={3}>
      <Heading level={3}>Decisions the design rests on</Heading>
      <Text size="sm" tone="muted">
        For each load-bearing choice — a store, a queue, a split into services, a call to an outside
        system — say what you chose, what you did not, what the choice costs, and what would change
        your mind. The reasoning evaluator reads these first.
      </Text>
      {decisions.map((decision, index) => {
        const concerned = decision.nodeIds ?? [];
        const field = (name: string) => `narrative-decision-${index}-${name}`;
        return (
          // A decision has no id of its own: rows are positional, re-keyed on
          // removal, and every field is controlled, so the index is the key.
          <Surface
            // eslint-disable-next-line @eslint-react/no-array-index-key
            key={index}
            as="section"
            padding={4}
            role="group"
            aria-label={`Decision ${index + 1}`}
            data-testid={`narrative-decision-${index}`}
          >
            <Stack gap={2}>
              <TextAreaField
                label="What you chose"
                data-testid={field('choice')}
                rows={2}
                maxLength={DECISION_TEXT_BOUND.ceiling}
                target={DECISION_TEXT_BOUND.target}
                value={decision.choice}
                disabled={readOnly}
                onChange={(event) => updateDecision(index, { choice: event.target.value })}
                placeholder="e.g. Own a read model fed by both sources rather than query them live"
              />
              <TextAreaField
                label="Instead of"
                data-testid={field('alternative')}
                rows={2}
                maxLength={DECISION_TEXT_BOUND.ceiling}
                target={DECISION_TEXT_BOUND.target}
                value={decision.alternative ?? ''}
                disabled={readOnly}
                onChange={(event) => updateDecision(index, { alternative: event.target.value })}
                placeholder="The other option you considered, and what it offered"
              />
              <TextAreaField
                label="What it costs"
                data-testid={field('cost')}
                rows={2}
                maxLength={DECISION_TEXT_BOUND.ceiling}
                target={DECISION_TEXT_BOUND.target}
                value={decision.cost ?? ''}
                disabled={readOnly}
                onChange={(event) => updateDecision(index, { cost: event.target.value })}
                placeholder="What you gave up or took on with this choice"
              />
              <TextAreaField
                label="What would change your mind"
                data-testid={field('reconsider')}
                rows={2}
                maxLength={DECISION_TEXT_BOUND.ceiling}
                target={DECISION_TEXT_BOUND.target}
                value={decision.reconsiderWhen ?? ''}
                disabled={readOnly}
                onChange={(event) => updateDecision(index, { reconsiderWhen: event.target.value })}
                placeholder="The condition under which the other option would win"
              />
              {graph.nodes.length > 0 ? (
                <Stack
                  gap={1}
                  role="group"
                  aria-label={`Components decision ${index + 1} concerns`}
                >
                  <Text as="span" size="sm" tone="secondary">
                    Concerns
                  </Text>
                  {graph.nodes.map((node) => {
                    const checked = concerned.includes(node.id);
                    const full = !checked && concerned.length >= DECISION_NODES_BOUND.target;
                    return (
                      <CheckboxField
                        key={node.id}
                        label={`${node.label} · ${node.kind}`}
                        data-testid={field(`node-${node.id}`)}
                        checked={checked}
                        disabled={readOnly || full}
                        onChange={() =>
                          updateDecision(index, {
                            nodeIds: checked
                              ? concerned.filter((id) => id !== node.id)
                              : [...concerned, node.id],
                          })
                        }
                      />
                    );
                  })}
                </Stack>
              ) : null}
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeDecision(index)}
                  disabled={readOnly}
                  data-testid={field('remove')}
                >
                  Remove decision
                </Button>
              </div>
            </Stack>
          </Surface>
        );
      })}
      <div>
        <Button
          size="sm"
          variant="subtle"
          onClick={addDecision}
          disabled={readOnly || atCap}
          data-testid="narrative-decision-add"
        >
          Add a decision
        </Button>
      </div>
    </Stack>
  );
}
