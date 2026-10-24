'use client';

import { isoDateOf, MAX_PIPELINE_LIMIT, targetsCsv, type Target } from '@sysdesign/contracts';
import { Alert, Button, Stack } from '@sysdesign/design-system';
import { useAction } from '@sysdesign/web-kit';

import { api } from '../../api/client';

/** Every tracked firm and award, read a page at a time until the total is in hand. */
const everyTarget = async (): Promise<Target[]> => {
  const rows: Target[] = [];
  for (let offset = 0; ; offset += MAX_PIPELINE_LIMIT) {
    const page = await api.listTargets({ limit: MAX_PIPELINE_LIMIT, offset });
    rows.push(...page.data);
    if (page.data.length === 0 || rows.length >= page.meta.total) return rows;
  }
};

/** Hands the browser a file to keep: the text behind a blob address on an anchor, clicked once and released. */
const saveFile = (name: string, text: string, type: string): void => {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
};

export interface TargetsExportProps {
  /** The day in the file's name: `Date.now()` in the app, fixed in specs. */
  nowMs: number;
}

/** The tracker as a sheet: every tracked firm and award, written as the CSV whose columns the contract declares, for a spreadsheet to open. */
export function TargetsExport({ nowMs }: TargetsExportProps) {
  const download = useAction(async () => {
    saveFile(`targets-${isoDateOf(nowMs)}.csv`, targetsCsv(await everyTarget()), 'text/csv');
  });
  return (
    <Stack direction="row" gap={2} align="center" wrap>
      <Button
        variant="subtle"
        size="sm"
        disabled={download.pending}
        onClick={() => void download.run()}
      >
        {download.pending ? 'Preparing…' : 'Download CSV'}
      </Button>
      {download.error ? <Alert tone="danger">{download.error}</Alert> : null}
    </Stack>
  );
}
