'use client';

import type {
  CanvasGraph,
  DesignBrief,
  DesignNarrative,
  DesignRevisionSummaryDto,
  EvaluationDto,
  PromptDto,
  SuccessCriterion,
} from '@sysdesign/contracts';
import type { Node } from '@xyflow/react';

import { diagramToPdfBlob, type DiagramCapture } from './diagram-pdf';
import {
  briefMarkdown,
  feedbackMarkdown,
  narrativeMarkdown,
  promptMarkdown,
  revisionsMarkdown,
} from './markdown';

export interface RunExportInput {
  prompt: PromptDto;
  /** The rubric in force — the prompt's own, or the one derived on this screen. */
  criteria: SuccessCriterion[];
  graph: CanvasGraph;
  narrative: DesignNarrative | null;
  brief: DesignBrief | null;
  evaluation: EvaluationDto | null;
  revisions: DesignRevisionSummaryDto[];
  revisionNumber: number | null;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'design'
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the download a beat to start before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Bundle a run into one `.zip` — `diagram.pdf` plus the five separate Markdown
 * files — and hand it to the browser as a single download. `diagram` is null
 * when nothing is drawn. All libs are dynamically imported (client-only).
 * A page reaches this through `useRunExport`, which supplies the capture.
 */
export async function exportRun(
  input: RunExportInput,
  diagram: DiagramCapture | null,
): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  zip.file('prompt.md', promptMarkdown(input.prompt, input.criteria));
  zip.file('narrative.md', narrativeMarkdown(input.narrative, input.graph, input.criteria));
  zip.file('brief.md', briefMarkdown(input.brief, input.graph, input.criteria));
  zip.file('feedback.md', feedbackMarkdown(input.evaluation, input.criteria, input.revisionNumber));
  zip.file('revisions.md', revisionsMarkdown(input.revisions));

  // Best-effort: a diagram-capture hiccup must never cost the Markdown export.
  try {
    const pdf = diagram ? await diagramToPdfBlob(diagram) : null;
    if (pdf) zip.file('diagram.pdf', pdf);
  } catch {
    zip.file('diagram.pdf.txt', 'The diagram PDF could not be captured for this export.');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${slugify(input.prompt.title)}-rev${input.revisionNumber ?? 0}.zip`);
}

/**
 * @deprecated Use `useRunExport()`: it frames the diagram through the flow
 * instance (no React Flow sub-flow warning) and prints it on the canvas's own
 * surface. Kept only until the practice workspace has moved to the hook.
 */
export async function buildAndDownloadRunZip(
  input: RunExportInput & { nodes: Node[] },
): Promise<void> {
  const { nodes, ...run } = input;
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  const { getNodesBounds } = await import('@xyflow/react');
  await exportRun(
    run,
    viewport && nodes.length > 0
      ? { viewport, bounds: getNodesBounds(nodes), background: '#ffffff' }
      : null,
  );
}
