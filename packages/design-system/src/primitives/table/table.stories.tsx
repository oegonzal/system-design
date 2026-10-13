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

const COLUMNS = ['Ends', 'Award', 'Recipient', 'Obligated', 'Buyer', 'NAICS', 'Open notices'];

/** More columns than a phone has room for: the table scrolls inside its frame, which a keyboard can focus, and the page stays put. */
export const Wide: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <Table aria-label="Expiring awards">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" style={{ whiteSpace: 'nowrap' }}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {COLUMNS.map((column) => (
              <td key={column} style={{ whiteSpace: 'nowrap' }}>
                {column} value
              </td>
            ))}
          </tr>
        </tbody>
      </Table>
    </div>
  ),
};
