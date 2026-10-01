import styled from '@emotion/styled';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';

import { withCanvasStore } from '../../../testing/story-decorators';
import { Palette } from './palette';

const meta: Meta<typeof Palette> = {
  title: 'Studio/Canvas/Palette',
  component: Palette,
  decorators: [withCanvasStore()],
};
export default meta;

type Story = StoryObj<typeof Palette>;

/**
 * Every entry maps over the contract's category tables, so this catalog page
 * doubles as the visual check that each kind has a color and an icon, and
 * each non-empty category a heading with its anchor-hue dot. Click or press
 * Enter on an entry to exercise the add path (into a throwaway store).
 */
export const AllKinds: Story = {};

/**
 * The palette mid-filter: the play function types into "Filter blocks", so
 * the rendered state shows only the matching kind with its category heading
 * — and the smoke gate axe-checks the narrowed layout too.
 */
export const Filtered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Filter blocks'), 'cache');
  },
};

/** A revision on screen: every entry is disabled and the hint says how to edit again. */
export const ReadOnly: Story = {
  decorators: [withCanvasStore((store) => store.getState().setReadOnly(true))],
};

const BoundedColumn480 = styled.div`
  height: 480px;
  display: flex;
  flex-direction: column;

  & > aside {
    flex: 1 1 0;
    min-height: 0;
  }
`;

/**
 * The palette as the practice workspace mounts it: a bounded flex column, so
 * the Root's own scrollbar and the sticky category headers are live — the
 * smoke gate axe-checks this scrolling state.
 */
export const BoundedColumn: Story = {
  decorators: [
    (StoryComponent) => (
      <BoundedColumn480>
        <StoryComponent />
      </BoundedColumn480>
    ),
  ],
};
