import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from '../badge/badge';
import { Table } from './table';

const meta: Meta<typeof Table> = {
  title: 'Design System/Primitives/Table',
  component: Table,
};
export default meta;

type Story = StoryObj<typeof Table>;

/** Three rows under named columns; the consumer owns the cells. */
export const Default: Story = {
  render: () => (
    <Table aria-label="Recent runs">
      <thead>
        <tr>
          <th>Started</th>
          <th>Pipeline</th>
          <th>Outcome</th>
          <th>Overall</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>2026-09-06</td>
          <td>system-design</td>
          <td>
            <Badge tone="success">accept</Badge>
          </td>
          <td>86</td>
        </tr>
        <tr>
          <td>2026-09-05</td>
          <td>memory-recall</td>
          <td>
            <Badge tone="medium">revise</Badge>
          </td>
          <td>62</td>
        </tr>
        <tr>
          <td>2026-09-04</td>
          <td>experience-digest</td>
          <td>
            <Badge>running</Badge>
          </td>
          <td>—</td>
        </tr>
      </tbody>
    </Table>
  ),
};
