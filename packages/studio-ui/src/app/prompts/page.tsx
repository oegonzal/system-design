import { PromptsBrowser } from '../../features/prompts/prompts-browser.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/prompts');

export default function PromptsPage() {
  return <PromptsBrowser />;
}
