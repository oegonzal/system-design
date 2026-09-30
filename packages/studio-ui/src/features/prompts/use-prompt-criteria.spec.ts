import { stubApi } from '@sysdesign/web-testing';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeCriteria, makePrompt } from '../../testing/fixtures';
import { usePromptCriteria } from './use-prompt-criteria';

const DERIVE = { method: 'POST', path: '/api/prompts/prompt-1/criteria' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePromptCriteria', () => {
  it('[UX-14] derives once for a prompt that arrived without criteria, then holds the result', async () => {
    const { calls } = stubApi([{ ...DERIVE, body: { data: makePrompt() } }]);
    const empty = makePrompt({ criteria: [] });

    const hook = renderHook(({ prompt }) => usePromptCriteria(prompt), {
      initialProps: { prompt: empty },
    });

    expect(hook.result.current.deriving).toBe(true);
    await waitFor(() => expect(hook.result.current.criteria).toEqual(makeCriteria()));
    expect(hook.result.current.deriving).toBe(false);

    // A re-render with the same (still empty) prompt never asks again.
    hook.rerender({ prompt: { ...empty } });
    await act(async () => undefined);
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('never asks for a prompt that already carries its rubric', async () => {
    const { calls } = stubApi([]);
    const hook = renderHook(() => usePromptCriteria(makePrompt()));
    await act(async () => undefined);
    expect(calls).toHaveLength(0);
    expect(hook.result.current.criteria).toEqual(makeCriteria());
  });

  it('[UX-14] a 503 becomes an error, not a loop — and a manual derive asks again', async () => {
    const { calls } = stubApi([
      {
        ...DERIVE,
        handler: ({ count }) =>
          count === 0
            ? { status: 503, body: { statusCode: 503, message: 'grader unavailable' } }
            : { body: { data: makePrompt() } },
      },
    ]);

    const hook = renderHook(() => usePromptCriteria(makePrompt({ criteria: [] })));

    await waitFor(() => expect(hook.result.current.error).toBe('grader unavailable'));
    expect(hook.result.current.criteria).toEqual([]);
    await act(async () => undefined);
    expect(calls).toHaveLength(1);

    act(() => hook.result.current.derive());
    await waitFor(() => expect(hook.result.current.criteria).toEqual(makeCriteria()));
    expect(hook.result.current.error).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('idles on a null prompt', async () => {
    const { calls } = stubApi([]);
    const hook = renderHook(() => usePromptCriteria(null));
    await act(async () => undefined);
    expect(hook.result.current.criteria).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
