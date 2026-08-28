import { AppearanceSettings } from '../../features/settings/appearance-settings.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/settings');

export default function SettingsPage() {
  return <AppearanceSettings />;
}
