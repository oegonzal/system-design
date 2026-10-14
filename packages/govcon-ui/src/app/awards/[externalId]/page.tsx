import { AwardClient } from '../../../features/award/award.client';
import { pageMetadata } from '../../nav';

export const metadata = pageMetadata('/awards');

/** Next 15 hands `params` as a promise; the id is the only thing the page reads from it. */
export default async function AwardPage({ params }: { params: Promise<{ externalId: string }> }) {
  const { externalId } = await params;
  return <AwardClient externalId={externalId} />;
}
