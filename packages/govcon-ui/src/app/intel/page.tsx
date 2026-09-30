import { IntelClient } from '../../features/intel/intel.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/intel');

export default function IntelPage() {
  return <IntelClient />;
}
