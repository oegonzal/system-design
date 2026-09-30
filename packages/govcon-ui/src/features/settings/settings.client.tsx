'use client';

import { documentOf, type SearchProfile, type SourceOperation } from '@sysdesign/contracts';
import { Alert, Heading, LiveRegion, Spinner, Stack, Surface } from '@sysdesign/design-system';
import { ApiError, toErrorMessage, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { useProfile } from '../../providers/profile-context';
import { CallHistory } from '../source/call-history';
import { SourceStatus } from '../source/source-status';
import { LedgerControls } from './ledger-controls';
import { ProfileEditor, type ProfileIssue } from './profile-editor';
import { ProfileList } from './profile-list';
import { copyOf, PROFILE_TEMPLATE } from './profile-template';

const LEDGER_PAGE = 50;

type Editing = { kind: 'edit' } | { kind: 'create'; draft: SearchProfile };

/** The service's answer to a refused save: its issues per path, or nothing when it was some other failure. */
export const issuesOf = (error: unknown): ProfileIssue[] | null => {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const body = error.body as { issues?: unknown } | null;
  if (!body || !Array.isArray(body.issues)) return null;
  return body.issues.filter(
    (issue): issue is ProfileIssue =>
      typeof issue === 'object' &&
      issue !== null &&
      typeof (issue as ProfileIssue).path === 'string' &&
      typeof (issue as ProfileIssue).message === 'string',
  );
};

interface EditorPanelProps {
  initial: SearchProfile;
  mode: 'create' | 'edit';
  onSaved(profile: SearchProfile): void;
  onCancel?: () => void;
}

/** Owns the document being edited; keyed by the profile so a switch starts fresh. */
function EditorPanel({ initial, mode, onSaved, onCancel }: EditorPanelProps) {
  const [document, setDocument] = useState(initial);
  const [issues, setIssues] = useState<ProfileIssue[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setIssues([]);
    setFailure(null);
    try {
      const saved =
        mode === 'create'
          ? await api.createProfile(document)
          : await api.updateProfile(document.id, document);
      onSaved(saved);
    } catch (caught: unknown) {
      const named = issuesOf(caught);
      if (named) setIssues(named);
      else setFailure(toErrorMessage(caught, 'The profile was not saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap={3}>
      {failure ? <Alert tone="danger">{failure}</Alert> : null}
      <ProfileEditor
        value={document}
        onChange={setDocument}
        mode={mode}
        issues={issues}
        onSave={() => void save()}
        onCancel={onCancel}
        saving={saving}
      />
    </Stack>
  );
}

/**
 * Settings: the profiles as editable documents, and what the service knows
 * about its sources and every call it made. A save is one write the
 * service validates whole; its issues come back per path and land beside
 * their fields. The list, the sources and the ledger are read resources.
 */
export function SettingsClient() {
  const { profiles, active, setActiveId, loading, error, reload } = useProfile();
  const [editing, setEditing] = useState<Editing>({ kind: 'edit' });
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [operation, setOperation] = useState<SourceOperation | ''>('');
  const [offset, setOffset] = useState(0);

  const source = useResource((signal) => api.getSource({ signal }), []);
  const ledger = useResource(
    (signal) =>
      api.listCalls({ limit: LEDGER_PAGE, offset, operation: operation || undefined }, { signal }),
    [offset, operation],
  );

  const act = async (label: string, run: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await run();
      setMessage(label);
      reload();
      source.reload();
      ledger.reload();
    } catch (caught: unknown) {
      setActionError(toErrorMessage(caught, `${label} failed.`));
    }
  };

  const onSaved = (saved: SearchProfile) => {
    setEditing({ kind: 'edit' });
    setActiveId(saved.id);
    setMessage(`Profile ${saved.id} saved.`);
    reload();
  };

  return (
    <Stack gap={5}>
      <Heading level={1}>Settings</Heading>
      <Surface as="section" aria-label="Profiles">
        {loading ? (
          <Spinner label="Loading the profiles" />
        ) : error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <ProfileList
            profiles={profiles}
            activeId={editing.kind === 'create' ? null : (active?.id ?? null)}
            onSelect={(id) => {
              setActiveId(id);
              setEditing({ kind: 'edit' });
            }}
            onNew={() => setEditing({ kind: 'create', draft: PROFILE_TEMPLATE })}
            onCopy={(id) => {
              const from = profiles.find((profile) => profile.id === id);
              if (from) setEditing({ kind: 'create', draft: copyOf(documentOf(from)) });
            }}
            onSetDefault={(id) =>
              void act(`Profile ${id} is now the default.`, () => api.setDefaultProfile(id))
            }
            onDelete={(id) => {
              if (window.confirm(`Remove profile ${id} and its saved searches?`)) {
                void act(`Profile ${id} removed.`, () => api.deleteProfile(id));
              }
            }}
          />
        )}
        {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
      </Surface>

      <Surface as="section" aria-label="Profile editor">
        {editing.kind === 'create' ? (
          <EditorPanel
            key="create"
            initial={editing.draft}
            mode="create"
            onSaved={onSaved}
            onCancel={() => setEditing({ kind: 'edit' })}
          />
        ) : active ? (
          <EditorPanel
            key={`edit:${active.id}:${active.updatedAt}`}
            initial={documentOf(active)}
            mode="edit"
            onSaved={onSaved}
          />
        ) : loading ? (
          <Spinner label="Loading the profile" />
        ) : (
          <Alert tone="info">No profile yet — create one above.</Alert>
        )}
      </Surface>

      <Surface as="section" aria-label="Sources">
        {source.data ? (
          <SourceStatus status={source.data} />
        ) : source.error ? (
          <Alert tone="danger">{source.error}</Alert>
        ) : (
          <Spinner label="Loading the sources" />
        )}
      </Surface>

      <Surface as="section" aria-label="Ledger">
        <Stack gap={4}>
          <LedgerControls
            operation={operation}
            onOperationChange={(next) => {
              setOperation(next);
              setOffset(0);
            }}
            total={ledger.data?.meta.total ?? 0}
            limit={LEDGER_PAGE}
            offset={offset}
            onPage={setOffset}
            disabled={ledger.loading}
          />
          {ledger.data ? (
            <CallHistory calls={ledger.data.data} total={ledger.data.meta.total} />
          ) : ledger.error ? (
            <Alert tone="danger">{ledger.error}</Alert>
          ) : (
            <Spinner label="Loading the ledger" />
          )}
        </Stack>
      </Surface>
      <LiveRegion message={message} />
    </Stack>
  );
}
