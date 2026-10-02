'use client';

import { Alert, Heading, Spinner, Stack, Surface, Text } from '@sysdesign/design-system';

import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { useLink } from '../../components/link-context';
import { inspectHref } from './model/inspect-link';
import { RunPicker } from './run-picker';
import { useInspectTarget } from './use-inspect-target';

const RECENT_LIMIT = 30;

/**
 * The inspector's one container: the URL says what is being inspected, this
 * reads it, and every pane below is presentational. The picker is here rather
 * than on a route of its own because the choice and what it opens belong on
 * one screen — the inspector is read while a run is still moving.
 */
export function InspectorClient() {
  const { target } = useInspectTarget();
  const Link = useLink();
  const runs = useResource((signal) => api.listRuns({ limit: RECENT_LIMIT }, { signal }), []);

  return (
    <Stack gap={6}>
      <Surface as="section" aria-label="Runs to inspect">
        <Stack gap={4}>
          <Heading level={2}>Inspect a run</Heading>
          <Text tone="secondary" size="sm">
            Pick a run to read its machinery: what each lens answered, what survived agreement, how
            the evidence became a number, and what changed from one iteration to the next.
          </Text>
          {runs.data ? (
            <RunPicker
              runs={runs.data.data}
              selectedRunId={target.run}
              hrefFor={(runId) => inspectHref({ ...target, run: runId, action: null })}
              link={Link}
            />
          ) : runs.error ? (
            <Alert tone="danger">{runs.error}</Alert>
          ) : (
            <Spinner label="Loading runs" />
          )}
        </Stack>
      </Surface>

      {target.run === null && (
        <Alert tone="info">Select a run above to read what the loop did.</Alert>
      )}
    </Stack>
  );
}
