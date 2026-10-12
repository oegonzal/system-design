import { relative, resolve } from 'node:path';

import { CONFIG_DIR, ENGINE_FILE, readChosen, type ReadFile } from '@sysdesign/config-kit';
import type { z } from 'zod';

import { scatterPolicySchema, type ScatterPolicy } from './applications';
import { JobApplicationConfigError } from './config';
import { intakeSettingsSchema, type IntakeSettings } from './intake';

/**
 * The service's settings, as files: the package's own `config/`, laid out the
 * way the repository's is — `config/engine.json` names one file per kind, and
 * each kind's files sit side by side under `config/<kind>/`, complete and
 * readable on their own. Each layer declares the schema of its own kind; this
 * reads them and refuses a kind left unchosen by naming where the choices
 * were looked for.
 */
type SettingsKind = 'policy' | 'intake';

export interface JobApplicationSettings {
  /** What stance the record takes on an application, from declared data. */
  policy: ScatterPolicy;
  /** How the record is fed from the bus. */
  intake: IntakeSettings;
  /** Where each kind's settings came from, as a path from the working directory. */
  sources: Readonly<Record<SettingsKind, string>>;
}

export function readSettings(root: string, read?: ReadFile): JobApplicationSettings {
  const chosen = <T>(kind: SettingsKind, schema: z.ZodType<T>): { config: T; source: string } => {
    const found = readChosen(kind, schema, root, read);
    if (found === null) {
      throw new JobApplicationConfigError(
        `${resolve(root, CONFIG_DIR, ENGINE_FILE)} chooses no ${kind}: name a file under ${resolve(root, CONFIG_DIR, kind)}`,
      );
    }
    return { config: found.config, source: relative(process.cwd(), resolve(root, found.source)) };
  };
  const policy = chosen('policy', scatterPolicySchema);
  const intake = chosen('intake', intakeSettingsSchema);
  return {
    policy: policy.config,
    intake: intake.config,
    sources: { policy: policy.source, intake: intake.source },
  };
}
