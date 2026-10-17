import { InMemoryRecordStore } from './in-memory-record-store';
import { recordStoreContract } from './record-store-contract';

recordStoreContract('in memory', () =>
  Promise.resolve({ store: new InMemoryRecordStore(), spaceId: 'space-under-test' }),
);
