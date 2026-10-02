import styled from '@emotion/styled';
import {
  Alert,
  Badge,
  Button,
  Heading,
  PreformattedText,
  Spinner,
  Stack,
  Table,
  Text,
} from '@sysdesign/design-system';

import { OUTCOME_TONE } from '../../results/tones';
import type { DumpFileRef } from '../model/dump-files';
import type { Invocation } from '../model/exchange-invocations';

/**
 * What the model was actually asked, and what it said.
 *
 * The run record carries evidence, not transcripts — every prompt and reply
 * stays in the dump folder on disk. This is the window onto that: pick a call,
 * then read the system prompt, the user prompt, the raw reply or the call's own
 * metadata, each exactly as the loop wrote it.
 *
 * A file is named by the path its listing gave and nothing more. The leading
 * number a dump file carries is not a label — measured, it means something
 * different in nearly every run — so what each file *is* comes from the writer's
 * own stem instead.
 */

const Name = styled.code`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  overflow-wrap: anywhere;
`;

const KIND_LABEL: Record<DumpFileRef['kind'], string> = {
  system: 'system prompt',
  user: 'user prompt',
  response: 'raw reply',
  meta: 'call metadata',
  other: 'file',
};

const kb = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;

export interface OpenDumpFile {
  path: string;
  text: string | null;
  problem: string | null;
}

export interface ExchangeViewerProps {
  /** The call whose files these are; null when none is open. */
  invocation: Invocation | null;
  files: readonly DumpFileRef[];
  open: OpenDumpFile | null;
  loadingList: boolean;
  loadingFile: boolean;
  /** A terminal problem reading the listing — most often that this run has no dump. */
  listError: string | null;
  fileError: string | null;
  onOpenFile(path: string): void;
  onClose(): void;
}

export function ExchangeViewer({
  invocation,
  files,
  open,
  loadingList,
  loadingFile,
  listError,
  fileError,
  onOpenFile,
  onClose,
}: ExchangeViewerProps) {
  if (invocation === null) {
    return (
      <Text tone="muted" size="sm">
        Pick a model call above to read what it was asked and what it answered.
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Stack direction="row" gap={2} align="baseline" wrap>
        <Heading level={3}>{invocation.scope}</Heading>
        <Badge tone={OUTCOME_TONE[invocation.outcome]}>{invocation.outcome}</Badge>
        <Badge tone="neutral">
          {invocation.attempts.length} attempt{invocation.attempts.length === 1 ? '' : 's'}
        </Badge>
        {invocation.failures.length > 0 && (
          <Text as="span" tone="muted" size="sm">
            after {invocation.failures.join(', ')}
          </Text>
        )}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </Stack>

      {listError !== null && <Alert tone="warn">{listError}</Alert>}
      {loadingList && <Spinner label="Reading the dump" />}

      {!loadingList && listError === null && files.length === 0 && (
        <Text tone="muted" size="sm">
          The dump holds no file for this call. A call recorded after its folder was written, or a
          folder the janitor has swept, both read this way.
        </Text>
      )}

      {files.length > 0 && (
        <Table aria-label={`Files for ${invocation.scope}`}>
          <thead>
            <tr>
              <th>What it is</th>
              <th>File</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.path} aria-current={open?.path === file.path ? 'true' : undefined}>
                <td>{KIND_LABEL[file.kind]}</td>
                <td>
                  <Button variant="ghost" onClick={() => onOpenFile(file.path)}>
                    <Name>{file.path}</Name>
                  </Button>
                </td>
                <td>{kb(file.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {fileError !== null && <Alert tone="danger">{fileError}</Alert>}
      {loadingFile && <Spinner label="Reading the file" />}
      {open !== null && open.problem !== null && <Alert tone="warn">{open.problem}</Alert>}
      {open !== null && open.text !== null && (
        <PreformattedText label={open.path} text={open.text} />
      )}
    </Stack>
  );
}
