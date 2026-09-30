import { PageStub } from '../../components/page-stub';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/settings');

export default function Page() {
  return <PageStub href="/settings" />;
}
