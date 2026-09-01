'use client';

import { NARRATIVE_MAX_LENGTH } from '@sysdesign/contracts';
import { Stack, Text } from '@sysdesign/design-system';

import { TextAreaField } from '../../components/fields';
import { useCanvasStore } from '../canvas/canvas-store-context';

/** Whitespace-split; good enough for a length hint, and it grades nothing. */
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * The walkthrough: prose for a human reader and for the LLM critic.
 *
 * It is deliberately NOT scored. The deterministic grade used to come from
 * substring probes over this box — does each node label appear, does a lexicon
 * term for each requirement appear — which measured the text rather than the
 * design, and which a pasted keyword list satisfied perfectly. The graded
 * explanation is now the design brief, where every claim is a reference the
 * engine checks against the canvas.
 *
 * The caption says as much, because an editor that implies a box is graded
 * when it is not is its own kind of dishonesty.
 */
export function NarrativeEditor() {
  const narrative = useCanvasStore((state) => state.narrative);
  const setNarrative = useCanvasStore((state) => state.setNarrative);
  const words = countWords(narrative);

  return (
    <Stack gap={3}>
      <Text size="sm" tone="muted">
        Walk a reader through the design in your own words — what each component is for, how a
        request travels, and which requirement each mechanism serves.
      </Text>
      <TextAreaField
        label="Walkthrough"
        data-testid="narrative-editor"
        rows={10}
        maxLength={NARRATIVE_MAX_LENGTH}
        value={narrative}
        onChange={(event) => setNarrative(event.target.value)}
        placeholder="e.g. The API Gateway authenticates every request, then…"
      />
      <Text size="sm" tone="muted" data-testid="narrative-word-count">
        {words} {words === 1 ? 'word' : 'words'}
      </Text>
      <Text size="sm" tone="muted" data-testid="narrative-advisory">
        Not scored by the engine — the critic reads it and comments. The graded explanation is the
        design brief.
      </Text>
    </Stack>
  );
}
