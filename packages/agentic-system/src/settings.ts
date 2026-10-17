import { relative, resolve } from 'node:path';

import { CONFIG_DIR, ENGINE_FILE, readChosen, type ReadFile } from '@sysdesign/config-kit';

import { AgenticSystemConfigError } from './config';
import { designSettingsSchema, type DesignSettings } from './designs';

/**
 * The service's settings, as files under the package's own `config/`, laid out
 * the way the repository's is: `config/engine.json` names one file per kind and
 * each kind's files sit under `config/<kind>/`. This reads them and refuses a
 * kind left unchosen by naming where the choices were looked for.
 */
type SettingsKind = 'design';

export interface AgenticSystemSettings {
  /** How a design cycle is run. */
  design: DesignSettings;
  /** Where each kind's settings came from, as a path from the working directory. */
  sources: Readonly<Record<SettingsKind, string>>;
}

export function readSettings(root: string, read?: ReadFile): AgenticSystemSettings {
  const chosen = readChosen('design', designSettingsSchema, root, read);
  if (chosen === null) {
    throw new AgenticSystemConfigError(
      `${resolve(root, CONFIG_DIR, ENGINE_FILE)} chooses no design: name a file under ${resolve(root, CONFIG_DIR, 'design')}`,
    );
  }
  return {
    design: chosen.config,
    sources: { design: relative(process.cwd(), resolve(root, chosen.source)) },
  };
}
