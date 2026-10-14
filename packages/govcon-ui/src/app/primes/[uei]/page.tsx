import { PrimeClient } from '../../../features/prime/prime.client';
import { pageMetadata } from '../../nav';

export const metadata = pageMetadata('/primes');

/** Next 15 hands `params` as a promise; the UEI is the only thing the page reads from it. */
export default async function PrimePage({ params }: { params: Promise<{ uei: string }> }) {
  const { uei } = await params;
  return <PrimeClient uei={uei} />;
}
