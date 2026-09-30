import type { Metadata } from 'next';

import { PromptDetail } from '../../../features/prompts/prompt-detail.client';

export const metadata: Metadata = {
  title: 'Prompt',
  description: 'The markdown and the derived criteria of one design prompt.',
};

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  const { promptId } = await params;
  return <PromptDetail promptId={promptId} />;
}
