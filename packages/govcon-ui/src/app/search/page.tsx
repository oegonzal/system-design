import { SearchClient } from '../../features/search/search.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/search');

export default function SearchPage() {
  return <SearchClient />;
}
