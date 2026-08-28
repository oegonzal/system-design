import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

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
