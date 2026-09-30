import { PageStub } from '../../components/page-stub';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/pipeline');

export default function Page() {
  return <PageStub href="/pipeline" />;
}
