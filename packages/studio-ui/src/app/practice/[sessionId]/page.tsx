import { PracticeWorkspace } from '../../../features/practice/practice-workspace';
import { pageMetadata } from '../../nav';

export const metadata = pageMetadata('/practice');

export default async function PracticePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <PracticeWorkspace sessionId={sessionId} />;
}
