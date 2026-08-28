import { StoryNew } from '../../../features/stories/story-new.client';
import { pageMetadata } from '../../nav';

export const metadata = pageMetadata('/stories/new');

export default function NewStoryPage() {
  return <StoryNew />;
}
