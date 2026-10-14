import playwright from 'eslint-plugin-playwright';

import workspace from '../../eslint.config.mjs';

/**
 * The site suite's lint config: the workspace rules, plus the Playwright
 * recommended set owned here. Flat config does not cascade — ESLint uses the
 * nearest config file — so the workspace config is restated.
 */
const recommended = playwright.configs['flat/recommended'];

export default [...workspace, { ...recommended, files: ['**/*.ts'] }];
