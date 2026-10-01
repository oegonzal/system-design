'use client';

import styled from '@emotion/styled';
import {
  PROMPT_MARKDOWN_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  type ExperienceProfileDto,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
} from '@sysdesign/contracts';
import {
  Alert,
  Button,
  Heading,
  Markdown,
  SelectField,
  Spinner,
  Stack,
  Surface,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  TextAreaField,
  TextField,
  transient,
} from '@sysdesign/design-system';
import { toErrorMessage, useLatestRequest, useLeaveGuard } from '@sysdesign/web-kit';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';

/**
 * The library as master and detail: the list beside the preview while both
 * fit, the preview under the list when they do not. The list scrolls on its
 * own, so picking an entry never sends the preview — or Import — off screen.
 */
const LibraryLayout = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[5]}px;
`;

const LibraryList = styled.ul`
  flex: 1 1 240px;
  max-width: 100%;
  max-height: 60vh;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
`;

const LibraryDetail = styled.div`
  flex: 3 1 420px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;
`;

/** What leaving a composer with unsaved words asks first. */
export const LEAVE_UNSAVED_PROMPT =
  'Leave this page? The prompt you are writing has not been saved.';

const EntryButton = styled('button', transient)<{ $selected: boolean }>`
  display: block;
  width: 100%;
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[3]}px`};
  border: 1px solid
    ${({ theme, $selected }) => ($selected ? theme.color.border.accent : theme.color.border.subtle)};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme, $selected }) =>
    $selected ? theme.color.bg.selected : theme.color.bg.surface};
  color: ${({ theme, $selected }) =>
    $selected ? theme.color.text.onSelected : theme.color.text.primary};
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.sm};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ theme, $selected }) =>
      $selected ? theme.color.bg.selected : theme.color.bg.subtle};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

/**
 * Two ways to get a prompt without a model writing one: type the markdown
 * yourself, or copy a document from the quality loop's library. Either way
 * the result is the same shape — one markdown document — and the criteria
 * are derived on first read.
 */
export function PromptComposer() {
  const router = useRouter();
  const preview = useLatestRequest();

  const [tab, setTab] = useState('write');
  const [experiences, setExperiences] = useState<ExperienceProfileDto[]>([]);
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [experienceId, setExperienceId] = useState('');
  const [library, setLibrary] = useState<PromptLibraryEntryDto[] | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [document, setDocument] = useState<PromptLibraryDocumentDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listExperiences()
      .then((response) => setExperiences(response.data))
      .catch(() => undefined);
    void api
      .listPromptLibrary()
      .then(setLibrary)
      .catch((caught) => setLibraryError(toErrorMessage(caught, 'Could not load the library.')));
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    const { id, signal } = preview.begin();
    void api
      .getPromptLibraryDocument(selectedId, { signal })
      .then((loaded) => {
        if (preview.isCurrent(id)) setDocument(loaded);
      })
      .catch((caught: unknown) => {
        if (!preview.isStale(id, caught)) {
          setError(toErrorMessage(caught, 'Could not load that document.'));
        }
      });
  }, [selectedId, preview]);

  const canAuthor = title.trim().length > 0 && markdown.trim().length > 0;
  // Words typed and not yet saved are the author's to lose; a save in flight
  // is already on its way, and navigates away itself.
  useLeaveGuard((title.length > 0 || markdown.length > 0) && !saving, LEAVE_UNSAVED_PROMPT);
  // A document from an earlier selection is not this selection's preview.
  const previewed = document !== null && document.id === selectedId ? document : null;

  const handleAuthor = async () => {
    if (!canAuthor) return;
    setSaving(true);
    setError(null);
    try {
      const prompt = await api.authorPrompt({
        title: title.trim(),
        markdown,
        ...(experienceId ? { experienceId } : {}),
      });
      router.push(`/prompts/${prompt.id}`);
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not save the prompt.'));
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (selectedId === null) return;
    setSaving(true);
    setError(null);
    try {
      const prompt = await api.importPrompt({ libraryId: selectedId });
      router.push(`/prompts/${prompt.id}`);
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not import the prompt.'));
      setSaving(false);
    }
  };

  return (
    <Stack gap={5}>
      <Heading level={1}>New prompt</Heading>
      {error !== null ? (
        <Alert tone="danger" data-testid="compose-error">
          {error}
        </Alert>
      ) : null}
      <Surface padding={6}>
        <Tabs value={tab} onChange={setTab}>
          <TabList aria-label="How to add the prompt">
            <Tab value="write">Write</Tab>
            <Tab value="import">Import from the library</Tab>
          </TabList>

          <TabPanel value="write">
            <Stack gap={4}>
              <Text size="sm" tone="muted">
                One markdown document: the scenario, the requirements, the numbers, the constraints.
                The quality loop turns it into criteria the moment it is first read.
              </Text>
              <TextField
                label="Title"
                value={title}
                maxLength={PROMPT_TITLE_MAX_LENGTH}
                onChange={(event) => setTitle(event.target.value)}
                data-testid="compose-title"
              />
              <TextAreaField
                label="Prompt (markdown)"
                rows={16}
                value={markdown}
                maxLength={PROMPT_MARKDOWN_MAX_LENGTH}
                placeholder={'# Design …\n\n## Functional requirements\n1. …'}
                onChange={(event) => setMarkdown(event.target.value)}
                data-testid="compose-markdown"
              />
              <SelectField
                label="Experience it draws on (optional)"
                value={experienceId}
                onChange={(event) => setExperienceId(event.target.value)}
                data-testid="compose-experience"
              >
                <option value="">None</option>
                {experiences.map((experience) => (
                  <option key={experience.id} value={experience.id}>
                    {experience.companyLabel} — {experience.title}
                  </option>
                ))}
              </SelectField>
              <div>
                <Button
                  variant="solid"
                  onClick={() => void handleAuthor()}
                  disabled={!canAuthor || saving}
                  data-testid="compose-submit"
                >
                  {saving ? 'Saving…' : 'Save prompt'}
                </Button>
              </div>
            </Stack>
          </TabPanel>

          <TabPanel value="import">
            <Stack gap={4}>
              <Text size="sm" tone="muted">
                The quality loop ships a library of prompts. Pick one to preview it; importing
                copies it into your prompts.
              </Text>
              {library === null ? (
                libraryError !== null ? (
                  <Text tone="secondary">{libraryError}</Text>
                ) : (
                  <Spinner label="Loading the library" />
                )
              ) : library.length === 0 ? (
                <Text size="sm" tone="muted">
                  The library is empty.
                </Text>
              ) : (
                <LibraryLayout>
                  <LibraryList data-testid="library-list" aria-label="Library prompts">
                    {library.map((entry) => (
                      <li key={entry.id}>
                        <EntryButton
                          type="button"
                          $selected={entry.id === selectedId}
                          aria-pressed={entry.id === selectedId}
                          onClick={() => setSelectedId(entry.id)}
                          data-testid={`library-entry-${entry.id}`}
                        >
                          {entry.title}
                        </EntryButton>
                      </li>
                    ))}
                  </LibraryList>
                  <LibraryDetail>
                    <div>
                      <Button
                        variant="solid"
                        onClick={() => void handleImport()}
                        disabled={previewed === null || saving}
                        data-testid="import-submit"
                      >
                        {saving ? 'Importing…' : 'Import prompt'}
                      </Button>
                    </div>
                    {selectedId === null ? (
                      <Text size="sm" tone="muted">
                        Pick a prompt to preview it here.
                      </Text>
                    ) : previewed ? (
                      <Stack gap={3}>
                        <Heading level={2}>{previewed.title}</Heading>
                        <Markdown
                          label={previewed.title}
                          title={previewed.title}
                          text={previewed.markdown}
                          data-testid="library-preview"
                        />
                      </Stack>
                    ) : (
                      <Spinner label="Loading the document" />
                    )}
                  </LibraryDetail>
                </LibraryLayout>
              )}
            </Stack>
          </TabPanel>
        </Tabs>
      </Surface>
    </Stack>
  );
}
