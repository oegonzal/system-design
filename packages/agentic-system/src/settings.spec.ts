import { AgenticSystemConfigError } from './config';
import { readSettings } from './settings';

describe('the service settings', () => {
  it('[AGS-5] reads the shipped design settings from the package config', () => {
    const settings = readSettings(`${__dirname}/..`);
    expect(settings.design).toMatchObject({
      pipeline: 'memory-architecture',
      orchestrator: 'memory-design',
      recall: true,
    });
    expect(settings.sources.design).toMatch(/config\/design\/standard\.json$/);
  });

  it('[AGS-5] refuses a root whose engine.json chooses no design', () => {
    const read = (at: string): string =>
      at.endsWith('engine.json')
        ? '{}'
        : (() => {
            throw new Error(`no ${at}`);
          })();
    expect(() => readSettings('/nowhere', read)).toThrow(AgenticSystemConfigError);
  });
});
