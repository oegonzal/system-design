'use client';

import {
  ANNOTATION_KINDS,
  canvasMechanismGraph,
  type CanvasGraph,
  type PromptDto,
} from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';
import { useMemo } from 'react';

import { accountedNodeIds, reconcileBrief } from '../../canvas/brief-draft';
import { useCanvasStore } from '../../canvas/canvas-store-context';
import { toCanvasGraph } from '../../canvas/graph-io';
import { BindingProposal } from './binding-proposal';
import { FlowTracer } from './flow-tracer';
import { NfrBindingRow } from './nfr-binding-row';
import { SuggestionsPanel } from './suggestions-panel';
import type { BriefSuggestionsState } from './use-brief-suggestions';

export interface DesignBriefEditorProps {
  prompt: PromptDto;
  /**
   * Output of `useBriefSuggestions` — the workspace owns the hook, as it owns
   * evaluation polling. Keeping the fetch out of this component is what lets it
   * appear in the catalog at all: the API client reads `process.env` at module
   * scope, which does not exist under the catalog's bundler.
   */
  suggestions?: BriefSuggestionsState;
}

/**
 * The graded half of explaining a design.
 *
 * A diagram is a set of promises, and this is where an author says which box
 * keeps which one — bound to a requirement from the prompt and to components on
 * their own canvas, never as prose. Everything is a reference the engine can
 * check, which is what makes the grade stable under renaming a box and unstable
 * under claiming something the canvas does not do.
 *
 * Reads the store directly rather than taking a brief prop: the rows below are
 * presentational and controlled, so this is the only component that needs to
 * know where the draft lives.
 */
export function DesignBriefEditor({ prompt, suggestions }: DesignBriefEditorProps) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const bindings = useCanvasStore((state) => state.briefBindings);
  const flows = useCanvasStore((state) => state.briefFlows);
  const setBindingMechanism = useCanvasStore((state) => state.setBindingMechanism);
  const toggleBindingNode = useCanvasStore((state) => state.toggleBindingNode);
  const setBindingNote = useCanvasStore((state) => state.setBindingNote);
  const clearBinding = useCanvasStore((state) => state.clearBinding);
  const setFlowPath = useCanvasStore((state) => state.setFlowPath);
  const proposals = useCanvasStore((state) => state.briefProposals);
  const acceptProposal = useCanvasStore((state) => state.acceptProposal);
  const dismissProposal = useCanvasStore((state) => state.dismissProposal);

  const graph: CanvasGraph = useMemo(() => toCanvasGraph(nodes, edges), [nodes, edges]);
  // Built once per graph, not once per row: the adapter rebuilds its adjacency
  // map and drops its memoized closures on every call.
  const mechanismGraph = useMemo(() => canvasMechanismGraph(graph), [graph]);

  const unaccounted = useMemo(() => {
    const accounted = accountedNodeIds(reconcileBrief(bindings, flows, graph), graph);
    return graph.nodes.filter(
      (node) =>
        !accounted.has(node.id) &&
        !ANNOTATION_KINDS.includes(node.kind) &&
        (node.responsibilities ?? []).length === 0,
    );
  }, [bindings, flows, graph]);

  const renderProposal = (nfrId: string) => {
    const proposal = proposals.find((candidate) => candidate.nfrId === nfrId);
    if (!proposal) return null;
    return (
      <BindingProposal
        proposal={proposal}
        graph={graph}
        mechanismGraph={mechanismGraph}
        replaces={bindings.find((candidate) => candidate.nfrId === nfrId) ?? null}
        onAccept={() => acceptProposal(nfrId)}
        onDismiss={() => dismissProposal(nfrId)}
      />
    );
  };

  return (
    <Stack gap={5}>
      <Text size="sm" tone="muted">
        Say which components hold each requirement, and trace how a request travels. Every claim is
        checked against your diagram as you make it — an unsupported one is allowed, and graded.
      </Text>

      {suggestions ? (
        <SuggestionsPanel
          asking={suggestions.asking}
          error={suggestions.error}
          askedAndEmpty={suggestions.askedAndEmpty}
          pending={proposals.length}
          canAsk={graph.nodes.length > 0}
          onAsk={suggestions.ask}
        />
      ) : null}

      <Stack gap={3}>
        <Heading level={3}>Requirements</Heading>
        {prompt.nonFunctionalRequirements.map((nfr) => (
          <NfrBindingRow
            key={nfr.id}
            nfr={nfr}
            graph={graph}
            mechanismGraph={mechanismGraph}
            binding={bindings.find((binding) => binding.nfrId === nfr.id) ?? null}
            onSelectMechanism={(mechanism) => setBindingMechanism(nfr.id, mechanism)}
            onToggleNode={(nodeId) => toggleBindingNode(nfr.id, nodeId)}
            onNote={(note) => setBindingNote(nfr.id, note)}
            onClear={() => clearBinding(nfr.id)}
            proposal={renderProposal(nfr.id)}
          />
        ))}
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>Flows</Heading>
        {prompt.functionalRequirements.map((requirement, index) => (
          <FlowTracer
            key={requirement}
            requirementIndex={index}
            requirement={requirement}
            graph={graph}
            path={flows.find((flow) => flow.requirementIndex === index)?.path ?? []}
            onChange={(path) => setFlowPath(index, path)}
          />
        ))}
      </Stack>

      {/*
        The same question `exp.brf.components-accounted` asks, asked before it
        costs anything: a box no flow reaches, no corroborated binding names and
        no responsibility describes is either unexplained thinking or an
        unnecessary box, and a reader cannot tell which.
      */}
      {unaccounted.length > 0 ? (
        <Stack gap={2} data-testid="brief-unaccounted">
          <Text size="sm" tone="secondary">
            Nothing accounts for {unaccounted.length === 1 ? 'this component' : 'these components'}{' '}
            yet
          </Text>
          <Stack direction="row" gap={2} wrap>
            {unaccounted.map((node) => (
              <Badge key={node.id} kind={node.kind}>
                {node.label}
              </Badge>
            ))}
          </Stack>
          <Text size="sm" tone="muted">
            Bind one to the requirement it holds, route a flow through it, give it a responsibility,
            or remove it.
          </Text>
        </Stack>
      ) : null}
    </Stack>
  );
}
