import { Dashboard } from '../features/dashboard/dashboard.client';
import { pageMetadata } from './nav';

export const metadata = pageMetadata('/');

export default function DashboardPage() {
  return <Dashboard />;
}
