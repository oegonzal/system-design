import { PipelineClient } from '../../features/pipeline/pipeline.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/pipeline');

export default function PipelinePage() {
  return <PipelineClient />;
}
