import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation, StepAction } from '@sysdesign/contracts';

import { ActionFailed } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * Against the Chromium Playwright bundles, headless, on a throwaway profile:
 * a field typed into and chosen from — an input with the combobox role whose
 * suggestions render a moment after the typing, which commits only when an
 * option is chosen and clears unchosen words when the field is left, as the
 * country field measured on 2026-10-30 did. Run with the `browser` vitest
 * project.
 */
const FORM = `<!doctype html><html><head><title>Apply — address</title></head>
<body>
  <main>
    <form>
      <label for="country">Country *</label>
      <input id="country" type="search" role="combobox" aria-autocomplete="list" aria-controls="country-list" required>
      <ul id="country-list" role="listbox"></ul>
      <label for="region">Region</label>
      <input id="region" type="search" role="combobox" aria-autocomplete="list" aria-controls="region-list">
      <ul id="region-list" role="listbox"></ul>
      <label for="city">City</label>
      <input id="city" type="text">
      <label for="nickname">Nickname</label>
      <input id="nickname" type="text" role="combobox" aria-autocomplete="list">
      <label for="language">Language</label>
      <input id="language" type="search" role="combobox" aria-autocomplete="list" aria-controls="language-list">
      <ul id="language-list" role="listbox"></ul>
      <ul id="elsewhere" role="listbox" aria-label="Recent searches"><li role="option">United States</li></ul>
      <span id="size-label">Team size</span>
      <div id="size" role="combobox" aria-labelledby="size-label" aria-controls="sizes" tabindex="0">Choose</div>
      <ul id="sizes" role="listbox"><li role="option">Small</li><li role="option">Large</li></ul>
    </form>
  </main>
  <script>
    // A scope of its own: setContent keeps the window, and a top-level declaration would clash on the next load.
    (() => {
    const COUNTRIES = ['United States Minor Outlying Islands', 'United States of America', 'Canada'];
    const country = document.getElementById('country');
    const list = document.getElementById('country-list');
    let chosen = '';
    country.addEventListener('input', () => {
      const words = country.value;
      list.innerHTML = '';
      setTimeout(() => {
        if (country.value !== words) return;
        for (const name of COUNTRIES.filter((c) => words !== '' && c.startsWith(words.split(' ')[0]))) {
          const option = document.createElement('li');
          option.setAttribute('role', 'option');
          option.textContent = name;
          option.addEventListener('mousedown', (event) => {
            event.preventDefault();
            chosen = name;
            country.value = name;
            list.innerHTML = '';
          });
          list.appendChild(option);
        }
      }, 100);
    });
    country.addEventListener('blur', () => {
      if (country.value !== chosen) country.value = '';
    });
    // A list that renders, then renders again in another order a moment later, as a search-as-you-type list does.
    const language = document.getElementById('language');
    const languages = document.getElementById('language-list');
    const render = (names) => {
      languages.innerHTML = '';
      for (const name of names) {
        const option = document.createElement('li');
        option.setAttribute('role', 'option');
        option.textContent = name;
        option.addEventListener('mousedown', (event) => {
          event.preventDefault();
          language.value = name;
          languages.innerHTML = '';
        });
        languages.appendChild(option);
      }
    };
    language.addEventListener('input', () => {
      setTimeout(() => render(['Spanish', 'English']), 30);
      setTimeout(() => render(['English', 'Spanish']), 60);
    });
    document.getElementById('sizes').addEventListener('click', (event) => {
      document.getElementById('size').textContent = event.target.textContent;
    });
    })();
  </script>
</body></html>`;

/**
 * A list that opens on a key or a click into its field — never on words set
 * there whole — and exists only while open, its options buttons wrapped in
 * presentational items, filtering by the words anywhere in an option: the
 * country fields measured on 2026-11-06, whose lists stayed shut for words
 * set whole and opened for the same words typed.
 */
const KEYED_FORM = `<!doctype html><html><head><title>Apply — residence</title></head>
<body>
  <main>
    <form>
      <label for="residence">Country of residence</label>
      <input id="residence" type="text" role="combobox" aria-expanded="false" aria-controls="residence-list" placeholder="Select">
      <label for="town">Town</label>
      <input id="town" type="text">
    </form>
  </main>
  <script>
    (() => {
    const NAMES = ['United Arab Emirates', 'United Kingdom', 'United States'];
    const input = document.getElementById('residence');
    let list = null;
    const close = () => {
      list?.remove();
      list = null;
      input.setAttribute('aria-expanded', 'false');
    };
    const render = () => {
      if (list === null) {
        list = document.createElement('ul');
        list.id = 'residence-list';
        list.setAttribute('role', 'listbox');
        input.after(list);
        input.setAttribute('aria-expanded', 'true');
      }
      const words = input.value.toLowerCase();
      list.innerHTML = '';
      for (const name of NAMES.filter((n) => n.toLowerCase().includes(words))) {
        const item = document.createElement('li');
        item.setAttribute('role', 'presentation');
        const option = document.createElement('button');
        option.type = 'button';
        option.setAttribute('role', 'option');
        option.title = name;
        option.textContent = name;
        option.addEventListener('mousedown', (event) => {
          event.preventDefault();
          input.value = name;
          close();
        });
        item.appendChild(option);
        list.appendChild(item);
      }
    };
    input.addEventListener('keydown', () => setTimeout(render, 0));
    input.addEventListener('mousedown', () => setTimeout(render, 0));
    input.addEventListener('input', () => {
      if (list !== null) render();
    });
    })();
  </script>
</body></html>`;

const common = { reason: 'the procedure says so', expect: null, serves: [] };
const select = (ref: string, option: string): Extract<StepAction, { kind: 'select' }> => ({
  kind: 'select',
  ref,
  option,
  ...common,
});
const fill = (ref: string, value: string): Extract<StepAction, { kind: 'fill' }> => ({
  kind: 'fill',
  ref,
  value,
  ...common,
});

const byName = (observation: PageObservation, role: string, name: string): ObservedElement => {
  const element = observation.elements.find((e) => e.role === role && e.name === name);
  if (element === undefined) throw new Error(`no ${role} "${name}" observed`);
  return element;
};

describe('the Playwright browser and a field typed into and chosen from', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    // A short wait keeps the spec quick; the shipped value is the settings'.
    browser = new PlaywrightBrowser(specBrowserOptions(profiles, { optionWaitMs: 1000 }));
    await browser.open('spec', { headed: false, documents: [] });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  /** The page fresh, its country field as observed, and a way to leave the field as Next would. */
  const fresh = async () => {
    await browser.page.setContent(FORM);
    const country = byName(await browser.observe(), 'combobox', 'Country *');
    const leave = () => browser.page.locator('#city').focus();
    const read = async () => byName(await browser.observe(), 'combobox', 'Country *');
    return { country, leave, read };
  };

  it('[BRW-27] is observed as typed into, and a select on it types the option’s words and chooses that option, which stays when the field is left', async () => {
    const { country, leave, read } = await fresh();
    expect(country).toMatchObject({ kind: 'fillable', inputType: 'search', options: null });
    await browser.act(select(country.ref, 'United States of America'));
    await leave();
    expect((await read()).value).toBe('United States of America');
  });

  it('[BRW-27] chooses nothing for words no option has, naming what the field offered for them, and the words left unchosen go when the field is left', async () => {
    const { country, leave, read } = await fresh();
    await expect(browser.act(select(country.ref, 'United States'))).rejects.toThrow(
      new ActionFailed(
        'select',
        'typed "United States": the field offered "United States Minor Outlying Islands", "United States of America" — answer it with one of its options\' exact words',
      ),
    );
    // Until the field is left, the next observation reads the words and what they offered.
    expect(await read()).toMatchObject({
      value: 'United States',
      options: ['United States Minor Outlying Islands', 'United States of America'],
    });
    await leave();
    expect((await read()).value).toBeNull();
  });

  it('[BRW-27] chooses only from the lists the control names, by the option’s words, never its place — and a control naming no list keeps the words typed', async () => {
    await browser.page.setContent(FORM);
    const first = await browser.observe();
    // Another list on the page shows the exact words; the control's own list does not: nothing is chosen.
    await expect(
      browser.act(select(byName(first, 'combobox', 'Country *').ref, 'United States')),
    ).rejects.toThrow('the field offered "United States Minor Outlying Islands"');
    // A list that renders again in another order between the find and the click: the option asked for is chosen.
    const second = await browser.observe();
    await browser.act(select(byName(second, 'combobox', 'Language').ref, 'Spanish'));
    expect(byName(await browser.observe(), 'combobox', 'Language').value).toBe('Spanish');
    // A control naming no list of its own declares no choices: the words typed stand, as a fill's would.
    const third = await browser.observe();
    await browser.act(select(byName(third, 'combobox', 'Nickname').ref, 'Al'));
    expect(byName(await browser.observe(), 'combobox', 'Nickname').value).toBe('Al');
  });

  it('[BRW-27] never chooses on a fill: the words typed whole are still no choice', async () => {
    const { country, leave, read } = await fresh();
    await browser.act(fill(country.ref, 'United States of America'));
    await leave();
    expect((await read()).value).toBeNull();
  });

  it('[BRW-27] types the words key by key, so a list that opens on a key and never on words set whole opens and is chosen from — after the words an earlier attempt left are cleared', async () => {
    await browser.page.setContent(KEYED_FORM);
    const residence = byName(await browser.observe(), 'combobox', 'Country of residence');
    expect(residence).toMatchObject({ kind: 'fillable', options: null });
    // An answer in a shape no option has: the list opens, offers nothing, and the words stay in the field.
    await expect(browser.act(select(residence.ref, 'United States (+1)'))).rejects.toThrow(
      'typed "United States (+1)": the field offered nothing for those words',
    );
    const again = byName(await browser.observe(), 'combobox', 'Country of residence');
    expect(again.value).toBe('United States (+1)');
    await browser.act(select(again.ref, 'United States'));
    await browser.page.locator('#town').focus();
    const chosen = byName(await browser.observe(), 'combobox', 'Country of residence');
    expect(chosen.value).toBe('United States');
    expect(await browser.page.locator('#residence-list').count()).toBe(0);
  });

  it('[BRW-27] says the field offered nothing when its list never shows, and leaves a combobox no one types into to open and pick', async () => {
    await browser.page.setContent(FORM);
    const region = byName(await browser.observe(), 'combobox', 'Region');
    await expect(browser.act(select(region.ref, 'West'))).rejects.toThrow(
      'the field offered nothing for those words',
    );
    const size = byName(await browser.observe(), 'combobox', 'Team size');
    expect(size).toMatchObject({ kind: 'selectable', options: ['Small', 'Large'] });
    await browser.act(select(size.ref, 'Large'));
    expect(await browser.page.locator('#size').textContent()).toBe('Large');
  });
});
