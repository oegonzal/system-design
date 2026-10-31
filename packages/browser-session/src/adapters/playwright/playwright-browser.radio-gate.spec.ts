import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BrowserAction } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * The generality gate for radio questions: one question per page in each
 * shape a review drew on 2026-10-31 from how forms draw radios — native,
 * labelled, wrapped, drawn over hidden inputs, ARIA radios, tables, grids,
 * flat layouts, legends, disabled options, overlays — each read for the
 * options a person reads and each select checked for what it chooses, read
 * back by the option's words. Run with the `browser` project.
 */
const STYLE = `<style>
  .circle { display: inline-block; width: 16px; height: 16px; border: 1px solid #555; border-radius: 50%; vertical-align: middle; }
  .boxless { position: absolute; width: 0; height: 0; margin: 0; opacity: 0; }
  .untouchable { pointer-events: none; opacity: 0; width: 16px; height: 16px; margin: 0; }
  .gone { display: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
  .row p { margin: 0; }
  .hint { color: #666; font-size: 12px; }
  .drawn::before { content: ''; display: inline-block; width: 14px; height: 14px; border: 1px solid #333; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  [role="radio"] { display: inline-block; padding: 4px 8px; border: 1px solid #999; margin: 4px; }
  .cc { position: relative; display: block; min-height: 24px; padding-left: 24px; margin: 6px 0; }
  .cc-input { position: absolute; z-index: -1; opacity: 0; }
  .cc-label::before { content: ''; position: absolute; left: -24px; top: 2px; width: 16px; height: 16px; border: 1px solid #333; border-radius: 50%; }
</style>`;

/** The handlers a drawn radio carries: a circle around or beside its input, a row that chooses, ARIA radios. */
const SCRIPT = `<script>
  for (const circle of document.querySelectorAll('.circle.holds-input')) {
    circle.addEventListener('click', () => { const radio = circle.querySelector('input'); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  for (const circle of document.querySelectorAll('.circle.beside-input')) {
    circle.addEventListener('click', () => { const radio = circle.previousElementSibling; radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  for (const row of document.querySelectorAll('.row.chooses')) {
    row.addEventListener('click', () => { const radio = row.querySelector('input'); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  for (const radio of document.querySelectorAll('[role="radio"]')) {
    radio.addEventListener('click', () => {
      for (const other of radio.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]')) other.setAttribute('aria-checked', String(other === radio));
    });
  }
</script>`;

const Q = 'Are you licensed to practise in the state?';

const page = (question: string, body: string): string =>
  `<!doctype html><html><head><title>Apply — questions</title>${STYLE}</head><body>
  <p>${question}*</p>${body}<button type="button">Next</button>${SCRIPT}</body></html>`;

interface Shape {
  name: string;
  html: string;
  /** The options an observation offers. */
  options: string[];
  /** Each select tried in turn: the option, and whether it chooses it. */
  selects: { option: string; chooses: boolean }[];
}

const SHAPES: Shape[] = [
  {
    name: 'native radios with labels for them',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="row"><input id="a-y" type="radio" name="a"><label for="a-y">Yes</label></div>
      <div class="row"><input id="a-n" type="radio" name="a"><label for="a-n">No</label></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a radio with no box in a circle drawn around it, named after the question',
    html: page(
      Q,
      `<span id="b-q" hidden>${Q}</span><div role="radiogroup">
      <div class="row"><span class="circle holds-input"><input class="boxless" type="radio" name="b" aria-labelledby="b-q"></span><p>Yes</p></div>
      <div class="row"><span class="circle holds-input"><input class="boxless" type="radio" name="b" aria-labelledby="b-q"></span><p>No</p></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a radio with no box and the circle drawn beside it',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="row"><input class="boxless" type="radio" name="c" aria-label="${Q}"><span class="circle beside-input"></span><p>Yes</p></div>
      <div class="row"><input class="boxless" type="radio" name="c" aria-label="${Q}"><span class="circle beside-input"></span><p>No</p></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a radio taking no pointer events in a label row',
    html: page(
      Q,
      `<div role="radiogroup">
      <label class="row"><input class="untouchable" type="radio" name="d" aria-label="${Q}"><span class="circle"></span><span>Yes</span></label>
      <label class="row"><input class="untouchable" type="radio" name="d" aria-label="${Q}"><span class="circle"></span><span>No</span></label></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a radio taking no pointer events in a row that chooses it',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="row chooses"><input class="untouchable" type="radio" name="e" aria-label="${Q}"><span class="circle"></span><p>Yes</p></div>
      <div class="row chooses"><input class="untouchable" type="radio" name="e" aria-label="${Q}"><span class="circle"></span><p>No</p></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a radio not displayed, drawn by its label',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="row"><input id="f-y" class="gone" type="radio" name="f" aria-label="${Q}"><label for="f-y" class="drawn">Yes</label></div>
      <div class="row"><input id="f-n" class="gone" type="radio" name="f" aria-label="${Q}"><label for="f-n" class="drawn">No</label></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a radio not displayed, drawn by its label, with no ARIA name',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="row"><input id="g-y" class="gone" type="radio" name="g"><label for="g-y" class="drawn">Yes</label></div>
      <div class="row"><input id="g-n" class="gone" type="radio" name="g"><label for="g-n" class="drawn">No</label></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'No', chooses: true }],
  },
  {
    name: 'a clipped radio drawn by its label',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="row"><input id="h-y" class="sr-only" type="radio" name="h" aria-label="${Q}"><label for="h-y" class="drawn">Yes</label></div>
      <div class="row"><input id="h-n" class="sr-only" type="radio" name="h" aria-label="${Q}"><label for="h-n" class="drawn">No</label></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a transparent radio behind its label',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="cc"><input id="i-y" class="cc-input" type="radio" name="i" aria-label="${Q}"><label for="i-y" class="cc-label">Yes</label></div>
      <div class="cc"><input id="i-n" class="cc-input" type="radio" name="i" aria-label="${Q}"><label for="i-n" class="cc-label">No</label></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'No', chooses: true }],
  },
  {
    name: 'labels wrapping their radios',
    html: page(
      Q,
      `<div role="radiogroup">
      <label class="row"><input type="radio" name="j"> Yes</label>
      <label class="row"><input type="radio" name="j"> No</label></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'No', chooses: true }],
  },
  {
    name: 'ARIA radios',
    html: page(
      Q,
      `<span id="k-q" hidden>${Q}</span><div role="radiogroup" aria-labelledby="k-q">
      <div role="radio" tabindex="0" aria-checked="false">Yes</div>
      <div role="radio" tabindex="-1" aria-checked="false">No</div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'No', chooses: true }],
  },
  {
    name: 'table rows of radios named after the question',
    html: page(
      Q,
      `<div role="radiogroup"><table><tbody>
      <tr><td><input type="radio" name="l" aria-label="${Q}"></td><td>Yes</td></tr>
      <tr><td><input type="radio" name="l" aria-label="${Q}"></td><td>No</td></tr></tbody></table></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'No', chooses: true }],
  },
  {
    name: 'table rows of radios with no name at all',
    html: page(
      Q,
      `<div role="radiogroup"><table><tbody>
      <tr><td><input type="radio" name="m"></td><td>Yes</td></tr>
      <tr><td><input type="radio" name="m"></td><td>No</td></tr></tbody></table></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a grid row of radios named after its columns',
    html: page(
      'How far do you agree?',
      `<table>
      <thead><tr><th></th><th>Agree</th><th>Neutral</th><th>Disagree</th></tr></thead>
      <tbody><tr role="radiogroup" aria-label="I enjoy teamwork"><th>I enjoy teamwork</th>
        <td><input type="radio" name="n" aria-label="Agree"></td>
        <td><input type="radio" name="n" aria-label="Neutral"></td>
        <td><input type="radio" name="n" aria-label="Disagree"></td></tr></tbody></table>`,
    ),
    options: ['Agree', 'Neutral', 'Disagree'],
    selects: [{ option: 'Neutral', chooses: true }],
  },
  {
    // A paragraph the row shows is read with the option: nothing the page declares sets it apart.
    name: 'a row with a paragraph of help in it',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="row"><span class="circle holds-input"><input class="boxless" type="radio" name="o" aria-label="${Q}"></span><p>Yes</p><p class="hint">Only if your licence is current</p></div>
      <div class="row"><span class="circle holds-input"><input class="boxless" type="radio" name="o" aria-label="${Q}"></span><p>No</p></div></div>`,
    ),
    options: ['Yes Only if your licence is current', 'No'],
    selects: [{ option: 'Yes Only if your licence is current', chooses: true }],
  },
  {
    name: 'a disabled option',
    html: page(
      Q,
      `<div role="radiogroup">
      <label class="row"><input type="radio" name="p"> Yes</label>
      <label class="row"><input type="radio" name="p" disabled> No</label>
      <label class="row"><input type="radio" name="p"> Prefer not to say</label></div>`,
    ),
    options: ['Yes', 'Prefer not to say'],
    selects: [
      { option: 'No', chooses: false },
      { option: 'Prefer not to say', chooses: true },
    ],
  },
  {
    name: 'a legend over labelled radios',
    html: page(
      '',
      `<fieldset role="radiogroup"><legend>${Q}</legend>
      <label class="row"><input type="radio" name="q" required> Yes</label>
      <label class="row"><input type="radio" name="q"> No</label></fieldset>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'a legend every radio is named after',
    html: page(
      '',
      `<fieldset role="radiogroup"><legend id="r-q">${Q}</legend>
      <div class="row"><input id="r-y" type="radio" name="r" aria-labelledby="r-q"><label for="r-y">Yes</label></div>
      <div class="row"><input id="r-n" type="radio" name="r" aria-labelledby="r-q"><label for="r-n">No</label></div></fieldset>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'No', chooses: true }],
  },
  {
    name: 'a flat layout with no container per option',
    html: page(
      Q,
      `<div role="radiogroup">
      <input type="radio" name="s" aria-label="${Q}"><span>Yes</span>
      <input type="radio" name="s" aria-label="${Q}"><span>No</span></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'labels for every radio carrying the question',
    html: page(
      Q,
      `<div role="radiogroup">
      <div class="row"><input id="t-y" type="radio" name="t"><label for="t-y" class="sr-only">${Q}</label><p>Yes</p></div>
      <div class="row"><input id="t-n" type="radio" name="t"><label for="t-n" class="sr-only">${Q}</label><p>No</p></div></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: true }],
  },
  {
    name: 'ARIA and native radios mixed, in the page’s order',
    html: page(
      Q,
      `<div role="radiogroup">
      <div role="radio" tabindex="0" aria-checked="false">Yes</div>
      <label><input type="radio" name="u"> No</label>
      <div role="radio" tabindex="-1" aria-checked="false">Maybe</div></div>`,
    ),
    options: ['Yes', 'No', 'Maybe'],
    selects: [{ option: 'No', chooses: true }],
  },
  {
    name: 'a group covered by an overlay from outside it',
    html: page(
      Q,
      `<div role="radiogroup">
      <label class="row"><input type="radio" name="v"> Yes</label>
      <label class="row"><input type="radio" name="v"> No</label></div>
      <div style="position: fixed; inset: 0; background: transparent"></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [{ option: 'Yes', chooses: false }],
  },
  {
    name: 'an option chosen already, chosen again',
    html: page(
      Q,
      `<div role="radiogroup">
      <label class="row"><input type="radio" name="w" checked> Yes</label>
      <label class="row"><input type="radio" name="w"> No</label></div>`,
    ),
    options: ['Yes', 'No'],
    selects: [
      { option: 'No', chooses: true },
      { option: 'No', chooses: true },
    ],
  },
];

const choose = (ref: string, option: string): BrowserAction => ({
  kind: 'select',
  ref,
  option,
  reason: 'from the evidence',
  expect: null,
  serves: [],
});

describe('the Playwright browser, on radio questions drawn every way a form draws them', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    browser = new PlaywrightBrowser(
      specBrowserOptions(profiles, { actionTimeoutMs: 3_000, optionWaitMs: 500 }),
    );
    await browser.open('spec-radio-gate', { headed: false, documents: [] });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it.each(SHAPES.map((shape) => [shape.name, shape] as const))(
    '[BRW-2] %s: offers the options a person reads, chooses what it asks for, and reads it back',
    async (_name, shape) => {
      await browser.page.setContent(shape.html);
      const group = (await browser.observe()).elements.find((e) => e.role === 'radiogroup');
      if (group === undefined) throw new Error('no radio group was observed');
      expect(group.options).toEqual(shape.options);
      for (const { option, chooses } of shape.selects) {
        const choice = browser.act(choose(group.ref, option));
        if (!chooses) {
          await expect(choice).rejects.toThrow(/^select: /);
          continue;
        }
        await choice;
        const after = (await browser.observe()).elements.find((e) => e.role === 'radiogroup');
        expect(after?.value).toBe(option);
        expect(await browser.readValue(after?.ref ?? '')).toBe(option);
      }
    },
  );

  it('[BRW-2] reads back a lone radio outside any group as its observation does, never as its bare "on"', async () => {
    await browser.page.setContent(
      page(
        Q,
        `<fieldset><legend>${Q}</legend>
        <label class="row"><input type="radio" name="x"> Yes</label>
        <label class="row"><input type="radio" name="x"> No</label></fieldset>`,
      ),
    );
    const [yes] = (await browser.observe()).elements.filter((e) => e.role === 'radio');
    if (yes === undefined) throw new Error('no radio was observed');
    await browser.act(choose(yes.ref, 'Yes'));
    const [after] = (await browser.observe()).elements.filter((e) => e.role === 'radio');
    expect(after?.value).toBe('checked');
    expect(await browser.readValue(after?.ref ?? '')).toBe('checked');
  });
});
