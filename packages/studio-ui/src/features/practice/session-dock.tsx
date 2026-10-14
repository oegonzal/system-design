'use client';

import styled from '@emotion/styled';
import { Surface, Tab, TabList, TabPanel, Tabs, Text } from '@sysdesign/design-system';

import { EvaluationPanel, type EvaluationPanelProps } from '../evaluation/evaluation-panel';
import { RevisionTimeline, type RevisionTimelineProps } from '../evaluation/revision-timeline';
import { ImprovementPanel, type ImprovementPanelProps } from '../improve/improvement-panel';
import { PromptPane, type PromptPaneProps } from '../prompts/prompt-pane';
import { DesignBriefEditor, type DesignBriefEditorProps } from './brief/design-brief-editor';
import { NarrativeEditor, type NarrativeEditorProps } from './narrative-editor';

const Dock = styled(Surface)`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
`;

const DockTabs = styled(Tabs)`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const DockPanel = styled(TabPanel)`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: ${({ theme }) => theme.space[4]}px;

  /* No authored display above: it would beat the UA [hidden] rule and break
     the state-preserving hide. This guard keeps the attribute honored. */
  &[hidden] {
    display: none;
  }
`;

export interface SessionDockProps {
  /** The panel on show. */
  tab: string;
  onTabChange: (tab: string) => void;
  /** Null when the prompt could not be read. */
  prompt: PromptPaneProps | null;
  brief: DesignBriefEditorProps;
  narrative: NarrativeEditorProps;
  feedback: EvaluationPanelProps;
  coach: ImprovementPanelProps;
  timeline: RevisionTimelineProps;
}

/** The session beside its canvas, a panel per tab: the prompt, what the author writes, the grade, the coach and the revisions. */
export function SessionDock({
  tab,
  onTabChange,
  prompt,
  brief,
  narrative,
  feedback,
  coach,
  timeline,
}: SessionDockProps) {
  return (
    <Dock as="aside" padding={5} aria-label="Session details">
      <DockTabs value={tab} onChange={onTabChange}>
        {/* Six tabs in a narrow dock: one row that scrolls sideways. The row
            itself shows which ends hold more tabs — a fade under an arrow
            that pages toward them — and keeps the selected tab whole and
            clear of those ends, also when a submit opens Feedback from code. */}
        <TabList aria-label="Session panels" overflow="scroll">
          <Tab value="prompt">Prompt</Tab>
          <Tab value="brief">Brief</Tab>
          <Tab value="narrative">Narrative</Tab>
          <Tab value="feedback">Feedback</Tab>
          <Tab value="coach">Coach</Tab>
          <Tab value="revisions">Revisions</Tab>
        </TabList>
        <DockPanel value="prompt">
          {prompt ? (
            <PromptPane {...prompt} />
          ) : (
            <Text size="sm" tone="muted">
              Prompt unavailable.
            </Text>
          )}
        </DockPanel>
        <DockPanel value="brief">
          <DesignBriefEditor {...brief} />
        </DockPanel>
        <DockPanel value="narrative">
          <NarrativeEditor {...narrative} />
        </DockPanel>
        <DockPanel value="feedback">
          <EvaluationPanel {...feedback} />
        </DockPanel>
        <DockPanel value="coach">
          <ImprovementPanel {...coach} />
        </DockPanel>
        <DockPanel value="revisions">
          <RevisionTimeline {...timeline} />
        </DockPanel>
      </DockTabs>
    </Dock>
  );
}
