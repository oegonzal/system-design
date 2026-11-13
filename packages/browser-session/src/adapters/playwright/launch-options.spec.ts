import { launchOptions } from './playwright-browser';

describe('how the browser is launched', () => {
  it('[BRW-4] leaves the stop signals to the engine, so an interrupted session closes through its own path instead of Playwright exiting the process', () => {
    const options = launchOptions({ channel: 'chrome' }, true);
    expect(options).toEqual({
      channel: 'chrome',
      headless: false,
      viewport: null,
      args: [],
      handleSIGINT: false,
      handleSIGTERM: false,
    });
    expect(launchOptions({ channel: undefined }, false).headless).toBe(true);
    // The cloud image's browser: the Chromium bundles as a full browser, never the headless shell.
    expect(launchOptions({ channel: 'chromium' }, false)).toMatchObject({
      channel: 'chromium',
      headless: true,
    });
  });

  it('[BRW-35] opens a desktop-sized window headless, with no emulated viewport, and lets a headed window be the laptop’s own', () => {
    // Chromium's headless default is 800×600; the goals are written for the desktop layouts.
    expect(launchOptions({ channel: 'chromium' }, false)).toMatchObject({
      viewport: null,
      args: ['--window-size=1440,900'],
    });
    expect(launchOptions({ channel: 'chrome' }, true).args).toEqual([]);
  });
});
