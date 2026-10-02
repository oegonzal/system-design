import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from '../button/button';
import { Stack } from '../stack/stack';
import { Text } from '../text/text';
import { Tab, TabList, TabPanel, Tabs } from './tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Design System/Primitives/Tabs',
  component: Tabs,
};
export default meta;

type Story = StoryObj<typeof Tabs>;

/**
 * Controlled from outside, as in the app: the selected tab is routing state,
 * not widget state.
 */
export const FindingsPanel: Story = {
  render: function FindingsPanelStory() {
    const [tab, setTab] = useState('findings');

    return (
      <Tabs value={tab} onChange={setTab}>
        <TabList aria-label="Evaluation detail">
          <Tab value="findings">Findings</Tab>
          <Tab value="scores">Scores</Tab>
          <Tab value="history">History</Tab>
        </TabList>
        <TabPanel value="findings">
          <Text>Two medium findings: no DLQ on the sync queue, cache has no TTL.</Text>
        </TabPanel>
        <TabPanel value="scores">
          <Text>Reliability 74 · Scalability 81 · Security 90.</Text>
        </TabPanel>
        <TabPanel value="history">
          <Text>Revision 4 of 4 — evaluated 2 minutes ago.</Text>
        </TabPanel>
      </Tabs>
    );
  },
};

/** A disabled tab stays visible but out of the arrow-key rotation. */
export const WithDisabledTab: Story = {
  render: function WithDisabledTabStory() {
    const [tab, setTab] = useState('design');

    return (
      <Tabs value={tab} onChange={setTab}>
        <TabList aria-label="Session">
          <Tab value="design">Design</Tab>
          <Tab value="evaluation" disabled>
            Evaluation
          </Tab>
          <Tab value="notes">Notes</Tab>
        </TabList>
        <TabPanel value="design">
          <Text>Run an evaluation to unlock the second tab.</Text>
        </TabPanel>
        <TabPanel value="evaluation">
          <Text>Never reachable while disabled.</Text>
        </TabPanel>
        <TabPanel value="notes">
          <Text>Free-form notes.</Text>
        </TabPanel>
      </Tabs>
    );
  },
};

const DOCK_TABS = ['Prompt', 'Brief', 'Narrative', 'Feedback', 'Coach', 'Revisions'];

/**
 * Six tabs in a narrow dock: one row that scrolls sideways rather than a
 * second row. An end that holds more tabs fades out under an arrow that
 * pages toward them, and the selected tab stays wholly in view, clear of
 * those edges, however it was chosen — the button selects the last one from
 * code, as a page does after a submit.
 */
export const OneScrollingRow: Story = {
  render: function OneScrollingRowStory() {
    const [tab, setTab] = useState('Prompt');

    return (
      <Stack gap={4} style={{ maxWidth: 260 }}>
        <Button variant="subtle" size="sm" onClick={() => setTab('Revisions')}>
          Open Revisions
        </Button>
        <Tabs value={tab} onChange={setTab}>
          <TabList aria-label="Session panels" overflow="scroll">
            {DOCK_TABS.map((name) => (
              <Tab key={name} value={name}>
                {name}
              </Tab>
            ))}
          </TabList>
          {DOCK_TABS.map((name) => (
            <TabPanel key={name} value={name}>
              <Text>{name} panel.</Text>
            </TabPanel>
          ))}
        </Tabs>
      </Stack>
    );
  },
};
