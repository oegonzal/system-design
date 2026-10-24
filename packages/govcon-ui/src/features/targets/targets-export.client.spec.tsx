import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TARGETS } from '../../testing/pipeline-fixtures';
import { TargetsExport } from './targets-export.client';

/** The blob's text the way a browser of any age reads it. */
const textOf = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe('TargetsExport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('[GOVU-28] reads every tracked firm and award and hands the browser a CSV named for the day: the declared header, one line per target, the RFC’s line ends', async () => {
    stubApi([
      {
        path: '/targets',
        body: { data: TARGETS, meta: { total: TARGETS.length, limit: 200, offset: 0 } },
      },
    ]);
    const blobs: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:targets';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    renderWithTheme(<TargetsExport nowMs={Date.parse('2026-09-27T12:00:00Z')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(screen.queryByText('Preparing…')).toBeNull());
    expect(screen.queryByRole('alert')?.textContent).toBeUndefined();
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('targets-2026-09-27.csv');
    expect(anchor.href).toContain('blob:targets');
    const [blob] = blobs;
    if (blob === undefined) throw new Error('nothing was handed to the browser');
    const lines = (await textOf(blob)).split('\r\n');
    expect(lines[0]).toBe(
      'Kind,Name,Subject,Stage,Stage since,Contacts,Next action,Reminder,Last activity,Ends,Links,Notes',
    );
    expect(lines).toHaveLength(TARGETS.length + 2);
    expect(lines[2]).toContain('Jane Doe (sblo) teaming@example.com');
    expect(lines.at(-1)).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:targets');
  });
});
