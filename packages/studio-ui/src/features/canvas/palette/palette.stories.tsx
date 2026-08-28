import type { Meta, StoryObj } from '@storybook/react-vite';

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
 * Every entry maps over the contract's NODE_KINDS tuple, so this catalog
 * page doubles as the visual check that each kind has a color and an icon.
 * Click or press Enter on an entry to exercise the add path (into a
 * throwaway store).
 */
export const AllKinds: Story = {};
