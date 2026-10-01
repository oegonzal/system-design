import { PromptDetail } from '../../../features/prompts/prompt-detail.client';
import { pageMetadata } from '../../nav';

/** The route's title until the prompt loads; the page then names the tab after the prompt. */
export const metadata = pageMetadata('/prompts/[promptId]');

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  const { promptId } = await params;
  return <PromptDetail promptId={promptId} />;
}
