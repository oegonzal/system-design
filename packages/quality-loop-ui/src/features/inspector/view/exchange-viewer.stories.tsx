import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeRun } from '../../../testing/fixtures';
import { filesForCall } from '../model/dump-files';
import { invocationsOf } from '../model/exchange-invocations';
import { ExchangeViewer } from './exchange-viewer';

const meta: Meta<typeof ExchangeViewer> = {
  title: 'Quality Loop/Inspector/ExchangeViewer',
  component: ExchangeViewer,
};
export default meta;

type Story = StoryObj<typeof ExchangeViewer>;

const RUN_ID = makeRun().runId;
const SCOPE = 'critic.requirements.s1';

const call = invocationsOf([
  {
    runId: RUN_ID,
    scope: SCOPE,
    ordinal: 3,
    outcome: 'schema-miss',
    durationMs: 41_000,
    startedAt: '2026-09-06T00:04:00.000Z',
    attempt: 1,
    errorName: 'schema-miss',
  },
  {
    runId: RUN_ID,
    scope: SCOPE,
    ordinal: 4,
    outcome: 'ok',
    durationMs: 52_000,
    startedAt: '2026-09-06T00:04:41.000Z',
    attempt: 2,
  },
])[0];

const LISTING = [
  { path: 'manifest.json', bytes: 100 },
  { path: `05-llm/03.${SCOPE}.3.system.txt`, bytes: 900 },
  { path: `05-llm/03.${SCOPE}.3.user.txt`, bytes: 4200 },
  { path: `05-llm/03.${SCOPE}.3.response.json`, bytes: 1800 },
];

const files = filesForCall(LISTING, SCOPE, [3]);

const base = {
  invocation: call,
  files,
  open: null,
  loadingList: false,
  loadingFile: false,
  listError: null,
  fileError: null,
  onOpenFile: () => undefined,
  onClose: () => undefined,
};

/** A call asked twice, with its files listed and none open. */
export const FilesListed: Story = { args: base };

/** The prompt the model actually read. */
export const PromptOpen: Story = {
  args: {
    ...base,
    open: {
      path: `05-llm/03.${SCOPE}.3.user.txt`,
      text: '# Goal\n\nDesign an order history service.\n\n## Artifact\n[summary] One service, two feeds.',
      problem: null,
    },
  },
};

/** A file that is a key but cannot be served: the problem is named, in band. */
export const FileTooLarge: Story = {
  args: {
    ...base,
    open: {
      path: `05-llm/03.${SCOPE}.3.response.json`,
      text: null,
      problem: 'the file is 4194305 bytes, past the 2097152 this reader serves',
    },
  },
};

/** The run has no dump: a swept folder, or one the loop never wrote. */
export const NoDump: Story = {
  args: { ...base, files: [], listError: 'no dump recorded for this run' },
};

/** Nothing picked yet. */
export const NothingOpen: Story = { args: { ...base, invocation: null, files: [] } };
