import { launchOptions } from './playwright-browser';

describe('how the browser is launched', () => {
  it('[BRW-4] leaves the stop signals to the engine, so an interrupted session closes through its own path instead of Playwright exiting the process', () => {
    const options = launchOptions({ channel: 'chrome' }, true);
    expect(options).toEqual({
      channel: 'chrome',
      headless: false,
      viewport: null,
      handleSIGINT: false,
      handleSIGTERM: false,
    });
    expect(launchOptions({ channel: undefined }, false).headless).toBe(true);
  });
});
