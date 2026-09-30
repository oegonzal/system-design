import { SettingsClient } from '../../features/settings/settings.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/settings');

export default function SettingsPage() {
  return <SettingsClient />;
}
