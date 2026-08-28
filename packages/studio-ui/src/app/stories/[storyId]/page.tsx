import type { Metadata } from 'next';

import { StoryDetail } from '../../../features/stories/story-detail.client';

export const metadata: Metadata = {
  title: 'STAR story',
  description: 'Edit one interview story.',
};

export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  return <StoryDetail storyId={storyId} />;
}
