import { InMemorySpaceStore } from './fakes';
import { spaceStoreContract } from './space-store-contract';

spaceStoreContract('in memory', () => Promise.resolve(new InMemorySpaceStore()));
