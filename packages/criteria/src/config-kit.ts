import type { Criterion } from './criterion';

/** The configuration kit (packages/config-kit): a kind's configuration chosen by name, read against its owner's schema. */
export const CONFIG_KIT_CRITERIA: readonly Criterion[] = [
  {
    id: 'CFG-1',
    statement:
      'A kind’s configuration is chosen by name — the name config/engine.json gives it, or the one its owner passes, which wins for that kind alone — and read from config/<kind>/<name>.json against the owner’s schema; a name that is not a file name, a file that is missing or unreadable, and a field the schema refuses are each refused naming the kind, the file and the field, and a kind nobody named reads nothing.',
  },
];
