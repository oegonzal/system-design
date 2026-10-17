import { relative, resolve } from 'node:path';

import {
  CONFIG_DIR,
  ENGINE_FILE,
  readChosen,
  readEngineConfig,
  type ReadFile,
} from '@sysdesign/config-kit';
import type { z } from 'zod';

import { AgenticSystemConfigError } from './config';
import { designSettingsSchema, type DesignSettings } from './designs';
import { memorySettingsSchema, type MemorySettings } from './memory';

/**
 * The service's settings, as files under the package's own `config/`, laid out
 * the way the repository's is: `config/engine.json` names one file per kind and
 * each kind's files sit under `config/<kind>/`. This reads every kind and
 * refuses one left unchosen by naming where the choices were looked for.
 */
type SettingsKind = 'design' | 'memory';

export interface AgenticSystemSettings {
  /** How a design cycle is run. */
  design: DesignSettings;
  /** The policy new memory spaces snapshot, and how often the sweep runs. */
  memory: MemorySettings;
  /** The memory settings chosen, as `memory/<name>`: what each space records its policy came from. */
  policySource: string;
  /** Where each kind's settings came from, as a path from the working directory. */
  sources: Readonly<Record<SettingsKind, string>>;
}

export function readSettings(root: string, read?: ReadFile): AgenticSystemSettings {
  const chosen = <T>(kind: SettingsKind, schema: z.ZodType<T>): { config: T; source: string } => {
    const found = readChosen(kind, schema, root, read);
    if (found === null) {
      throw new AgenticSystemConfigError(
        `${resolve(root, CONFIG_DIR, ENGINE_FILE)} chooses no ${kind}: name a file under ${resolve(root, CONFIG_DIR, kind)}`,
      );
    }
    return { config: found.config, source: relative(process.cwd(), resolve(root, found.source)) };
  };
  const design = chosen('design', designSettingsSchema);
  const memory = chosen('memory', memorySettingsSchema);
  return {
    design: design.config,
    memory: memory.config,
    policySource: `memory/${readEngineConfig(root, read).memory}`,
    sources: { design: design.source, memory: memory.source },
  };
}
