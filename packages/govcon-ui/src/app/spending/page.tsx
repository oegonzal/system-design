import { SpendingClient } from '../../features/spending/spending.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/spending');

export default function SpendingPage() {
  return <SpendingClient />;
}
