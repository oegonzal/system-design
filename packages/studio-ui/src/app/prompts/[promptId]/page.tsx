import type { Metadata } from 'next';

import { PromptDetail } from '../../../features/prompts/prompt-detail.client';

export const metadata: Metadata = {
  title: 'Prompt',
  description: 'Scenario, requirements and scale targets for one design prompt.',
};

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  const { promptId } = await params;
  return <PromptDetail promptId={promptId} />;
}
