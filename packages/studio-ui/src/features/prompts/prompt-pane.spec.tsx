import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makePrompt, makeWorkflowPrompt } from '../../testing/fixtures';
import { PromptPane } from './prompt-pane';

describe('PromptPane', () => {
  it('[PRD-1] a workflow prompt presents its API contract, events, ingest SLAs and lifecycle beside the prose', () => {
    renderWithTheme(<PromptPane prompt={makeWorkflowPrompt()} />);

    const section = screen.getByTestId('prompt-workflow');
    const text = section.textContent ?? '';
    // The contract, with its emissions and failure path.
    expect(text).toContain('Return the customer’s merged order history');
    expect(text).toContain('Normalize an incoming order into the read model');
    expect(text).toContain('on failure → evt-ingest-failed');
    // The events and both ingest modes, each with its stated budget.
    expect(text).toContain('A new order arrived from a source');
    expect(text).toContain('visible ≤ 60s after purchase');
    expect(text).toContain('visible ≤ 300s after sale');
    // The lifecycle as transitions, not a separate editor.
    expect(text).toContain('received → indexed');
    // The aggregate names what feeds it.
    expect(text).toContain('fed by evt-order-indexed');
  });

  it('renders no workflow section for prompts without a spec', () => {
    renderWithTheme(<PromptPane prompt={makePrompt()} />);
    expect(screen.queryByTestId('prompt-workflow')).toBeNull();
  });
});
