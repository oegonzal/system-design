'use client';

import styled from '@emotion/styled';
import {
  CANVAS_CRITERION_KINDS,
  DEFAULT_PRACTICE_FORMAT,
  PRACTICE_FORMAT_IDS,
  PRACTICE_FORMATS,
  practiceFormatForLibraryFolder,
  PROMPT_MARKDOWN_BOUND,
  PROMPT_TITLE_BOUND,
  type CanvasCriterionKind,
  type ExperienceProfileDto,
  type PracticeFormatId,
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
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { ComposerGenerateTab } from './composer-generate-tab';
import { FormatField } from './format-field';
import { usePromptGeneration } from './use-prompt-generation';

const isFormatId = (value: string | null): value is PracticeFormatId =>
  value !== null && (PRACTICE_FORMAT_IDS as readonly string[]).includes(value);
const isKind = (value: string): value is CanvasCriterionKind =>
  (CANVAS_CRITERION_KINDS as readonly string[]).includes(value);

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
 * Three ways to get a prompt: type the markdown yourself, copy a document
 * from the quality loop's library, or ask the loop's prompt writer for one
 * drawn from your experience. Either way the result is the same shape — one
 * markdown document with a practice format — and the criteria are derived
 * on first read. `?format=` and `?emphasis=a,b` preselect the generate tab,
 * the way a competencies panel links here.
 */
export function PromptComposer() {
  const router = useRouter();
  const preview = useLatestRequest();
  const params = useSearchParams();
  const linkedFormat = params.get('format');
  const linkedEmphasis = (params.get('emphasis') ?? '').split(',').filter(isKind);
  const generation = usePromptGeneration((prompt) => router.push(`/prompts/${prompt.id}`));

  const [tab, setTab] = useState(() =>
    isFormatId(linkedFormat) || linkedEmphasis.length > 0 ? 'generate' : 'write',
  );
  const [format, setFormat] = useState<PracticeFormatId>(() =>
    isFormatId(linkedFormat) ? linkedFormat : DEFAULT_PRACTICE_FORMAT,
  );
  const [importFormat, setImportFormat] = useState<PracticeFormatId | null>(null);
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
        format,
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
      const prompt = await api.importPrompt({
        libraryId: selectedId,
        ...(importFormat !== null ? { format: importFormat } : {}),
      });
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
            <Tab value="generate">Generate from experience</Tab>
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
                maxLength={PROMPT_TITLE_BOUND.ceiling}
                target={PROMPT_TITLE_BOUND.target}
                onChange={(event) => setTitle(event.target.value)}
                data-testid="compose-title"
              />
              <TextAreaField
                label="Prompt (markdown)"
                rows={16}
                value={markdown}
                maxLength={PROMPT_MARKDOWN_BOUND.ceiling}
                target={PROMPT_MARKDOWN_BOUND.target}
                placeholder={'# Design …\n\n## Functional requirements\n1. …'}
                onChange={(event) => setMarkdown(event.target.value)}
                data-testid="compose-markdown"
              />
              <FormatField value={format} onChange={setFormat} />
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
                          <Text as="span" size="sm" tone="muted">
                            {' '}
                            · {PRACTICE_FORMATS[practiceFormatForLibraryFolder(entry.folder)].label}
                          </Text>
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
                        <FormatField
                          value={importFormat ?? practiceFormatForLibraryFolder(previewed.folder)}
                          onChange={setImportFormat}
                          data-testid="import-format"
                        />
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

          <TabPanel value="generate">
            <ComposerGenerateTab
              experiences={experiences}
              format={format}
              onFormat={setFormat}
              initialEmphasis={linkedEmphasis}
              generation={generation}
            />
          </TabPanel>
        </Tabs>
      </Surface>
    </Stack>
  );
}
