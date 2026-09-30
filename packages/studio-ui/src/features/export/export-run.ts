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

import { diagramToPdfBlob } from './diagram-pdf';
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
  /** React-Flow nodes (with measured sizes) for framing the PDF. */
  nodes: Node[];
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
 * files — and hand it to the browser as a single download. All libs are
 * dynamically imported (client-only).
 */
export async function buildAndDownloadRunZip(input: RunExportInput): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  zip.file('prompt.md', promptMarkdown(input.prompt, input.criteria));
  zip.file('narrative.md', narrativeMarkdown(input.narrative, input.graph, input.criteria));
  zip.file('brief.md', briefMarkdown(input.brief, input.graph, input.criteria));
  zip.file(
    'feedback.md',
    feedbackMarkdown(input.evaluation, input.graph, input.criteria, input.revisionNumber),
  );
  zip.file('revisions.md', revisionsMarkdown(input.revisions));

  // Best-effort: a diagram-capture hiccup must never cost the Markdown export.
  try {
    const pdf = await diagramToPdfBlob(input.nodes);
    if (pdf) zip.file('diagram.pdf', pdf);
  } catch {
    zip.file('diagram.pdf.txt', 'The diagram PDF could not be captured for this export.');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${slugify(input.prompt.title)}-rev${input.revisionNumber ?? 0}.zip`);
}
