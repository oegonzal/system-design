'use client';

import type {
  CanvasGraph,
  DesignBrief,
  DesignModel,
  DesignNarrative,
  DesignRevisionSummaryDto,
  DesignTranscript,
  EvaluationDto,
  PromptDto,
  SuccessCriterion,
} from '@sysdesign/contracts';

import type { FeedbackSubject } from '../evaluation/feedback-subject';
import { diagramToPdfBlob, type DiagramCapture } from './diagram-pdf';
import {
  briefMarkdown,
  feedbackMarkdown,
  narrativeMarkdown,
  promptMarkdown,
  revisionsMarkdown,
} from './markdown';
import { diagramMarkdown } from './markdown-diagram';
import { modelMarkdown } from './markdown-model';
import { transcriptMarkdown } from './markdown-transcript';

export interface RunExportInput {
  prompt: PromptDto;
  /** The rubric in force — the prompt's own, or the one derived on this screen. */
  criteria: SuccessCriterion[];
  graph: CanvasGraph;
  narrative: DesignNarrative | null;
  brief: DesignBrief | null;
  model: DesignModel | null;
  /** The interview's transcript, when the exported revision carries one. */
  transcript: DesignTranscript | null;
  evaluation: EvaluationDto | null;
  revisions: DesignRevisionSummaryDto[];
  /**
   * The revision the feedback is about, and whether the canvas — the
   * exported diagram — still shows it; null before anything was submitted.
   */
  subject: FeedbackSubject | null;
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

/**
 * What the bundle holds, as its name says it: the revision the diagram is,
 * or the draft — a canvas edited since, or never submitted — never a
 * revision the diagram is not, nor one that does not exist.
 */
export const bundleName = (title: string, subject: FeedbackSubject | null): string =>
  `${slugify(title)}-${subject?.onCanvas ? `rev${subject.revisionNumber}` : 'draft'}.zip`;

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
 * Bundle a run into one `.zip` — `diagram.pdf` plus one Markdown file per
 * artifact, the diagram's own among them — and hand it to the browser as a
 * single download. `diagram` is null
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
  zip.file('diagram.md', diagramMarkdown(input.graph));
  zip.file('narrative.md', narrativeMarkdown(input.narrative, input.graph, input.criteria));
  zip.file('brief.md', briefMarkdown(input.brief, input.graph, input.criteria));
  zip.file('model.md', modelMarkdown(input.model, input.graph));
  if (input.transcript !== null) zip.file('transcript.md', transcriptMarkdown(input.transcript));
  zip.file('feedback.md', feedbackMarkdown(input.evaluation, input.criteria, input.subject));
  zip.file('revisions.md', revisionsMarkdown(input.revisions));

  // Best-effort: a diagram-capture hiccup must never cost the Markdown export.
  try {
    const pdf = diagram ? await diagramToPdfBlob(diagram) : null;
    if (pdf) zip.file('diagram.pdf', pdf);
  } catch {
    zip.file('diagram.pdf.txt', 'The diagram PDF could not be captured for this export.');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, bundleName(input.prompt.title, input.subject));
}
