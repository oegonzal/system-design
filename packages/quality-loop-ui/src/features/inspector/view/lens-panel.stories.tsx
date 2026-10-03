import type { Meta, StoryObj } from '@storybook/react-vite';

import { makePipeline, makeRun, makeTwoIterationRun } from '../../../testing/fixtures';
import { deriveRun } from '../model/derive-run';
import { lensContributions } from '../model/lens-contributions';
import { reduceAll } from '../model/reduce';
import { emptyState } from '../model/state';
import { LensPanel } from './lens-panel';

/** What each lens contributed, and what became of every item it offered. */

const stateOf = (run = makeRun()) => reduceAll(emptyState(), deriveRun(run));

const lensMeta: Meta<typeof LensPanel> = {
  title: 'Quality Loop/Inspector/LensPanel',
  component: LensPanel,
};
export default lensMeta;

type LensStory = StoryObj<typeof LensPanel>;

/** Every item a lens offered, joined to what the ledger did with it. */
export const Contributions: LensStory = {
  args: { contributions: lensContributions(stateOf(), makePipeline()) },
};

/** Two of three declared samples lost: the agreement bar then cannot be reached. */
export const SamplesLost: LensStory = {
  args: {
    contributions: lensContributions(
      stateOf(),
      makePipeline({
        critics: [
          {
            id: 'critic.requirements',
            samples: 3,
            maxItems: 12,
            maxTokens: 4000,
            consumes: ['findings'],
          },
        ],
        policy: {
          ...makePipeline().policy,
          evidence: { ...makePipeline().policy.evidence, minHits: 2 },
        },
      }),
    ),
  },
};

/** No registry: what the lenses said, without the declared bounds. */
export const Undeclared: LensStory = {
  args: { contributions: lensContributions(stateOf(makeTwoIterationRun()), null) },
};
