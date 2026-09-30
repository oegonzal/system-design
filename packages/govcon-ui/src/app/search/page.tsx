import { PageStub } from '../../components/page-stub';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/search');

export default function Page() {
  return <PageStub href="/search" />;
}
