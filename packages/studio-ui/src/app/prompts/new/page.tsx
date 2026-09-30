import { PromptComposer } from '../../../features/prompts/prompt-composer.client';
import { pageMetadata } from '../../nav';

export const metadata = pageMetadata('/prompts/new');

export default function NewPromptPage() {
  return <PromptComposer />;
}
