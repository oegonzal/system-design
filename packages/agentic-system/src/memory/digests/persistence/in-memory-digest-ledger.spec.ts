import { digestLedgerContract } from './digest-ledger-contract';
import { InMemoryDigestLedger } from './in-memory-digest-ledger';

digestLedgerContract('in memory', () =>
  Promise.resolve({
    ledger: new InMemoryDigestLedger(),
    spaceId: '00000000-0000-4000-8000-0000000000c1',
  }),
);
