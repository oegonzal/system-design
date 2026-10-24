'use client';

import type { SaveTargetRequest, TargetKind } from '@sysdesign/contracts';
import { Alert, LiveRegion, Spinner, Stack, Surface, Text } from '@sysdesign/design-system';
import { useAction, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { useLink } from '../../components/link-context';
import { pipelineHref } from '../pipeline/views';
import { TargetPanel } from './target-panel';

export interface TrackTargetProps {
  kind: TargetKind;
  /** A firm's UEI, or an award's id. */
  subject: string;
  /** What to call it when it is tracked. */
  label: string;
}

/**
 * Whether the thing a page is about is tracked, and the panel that tracks
 * it or changes how it is: one read of the store, and one write per save or
 * removal, after which the panel shows what the write answered.
 */
export function TrackTarget({ kind, subject, label }: TrackTargetProps) {
  const Link = useLink();
  const [message, setMessage] = useState('');
  // Wrapped, so "not read yet" and "not tracked" are told apart.
  const stored = useResource(
    async (signal) => ({ target: await api.getTarget(kind, subject, { signal }) }),
    [kind, subject],
  );
  const save = useAction(async (request: SaveTargetRequest) => {
    const target = await api.saveTarget(kind, subject, request);
    stored.replace({ target });
    setMessage(`Tracked as ${target.stage}.`);
  });
  const remove = useAction(async () => {
    await api.removeTarget(kind, subject);
    stored.replace({ target: null });
    setMessage('No longer tracked.');
  });
  const target = stored.data?.target ?? null;

  return (
    <Surface as="section" aria-label="Tracking">
      <Stack gap={3}>
        {stored.error ? (
          <Alert tone="danger">{stored.error}</Alert>
        ) : stored.data === null ? (
          <Spinner label="Reading whether it is tracked" />
        ) : (
          <TargetPanel
            // What was stored is what the form starts from: a write remounts it on the answer.
            key={target?.updatedAt ?? 'untracked'}
            kind={kind}
            label={label}
            target={target}
            onSave={(request) => void save.run(request)}
            onRemove={() => void remove.run()}
            saving={save.pending || remove.pending}
            error={save.error ?? remove.error}
            nowMs={Date.now()}
          />
        )}
        {target ? (
          <Text tone="muted" size="sm">
            <Link href={pipelineHref('targets')} $variant="inline">
              Every tracked firm and award
            </Link>{' '}
            is listed in the pipeline.
          </Text>
        ) : null}
      </Stack>
      <LiveRegion message={message} />
    </Surface>
  );
}
