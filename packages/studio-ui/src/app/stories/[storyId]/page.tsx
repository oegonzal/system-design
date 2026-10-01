import { StoryDetail } from '../../../features/stories/story-detail.client';
import { pageMetadata } from '../../nav';

/** The route's title until the story loads; the page then names the tab after the story. */
export const metadata = pageMetadata('/stories/[storyId]');

export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  return <StoryDetail storyId={storyId} />;
}
