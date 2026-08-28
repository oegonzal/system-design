import { StoriesList } from '../../features/stories/stories-list.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/stories');

export default function StoriesPage() {
  return <StoriesList />;
}
