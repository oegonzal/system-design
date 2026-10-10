# browser-session

A Playwright program whose every decision is a quality-loop run. It opens Chrome on a persistent, signed-in profile, observes the page in front of it and asks the loop what to do next; the loop's `browser-step` pipeline plans, its `form-memory` orchestration answers form fields from recalled facts, and the engine here only executes what nobody objected to, applies the declared rails, and records every step. Nothing in the package names a site: the mission lives in a markdown goal, and the same program runs any goal.

```bash
pnpm browser-session login --profile smoke --url https://duckduckgo.com         # sign in once; the profile keeps the cookies
pnpm browser-session run --goal packages/browser-session/goals/smoke-search.md --profile smoke --max-tasks 1 --max-minutes 5
pnpm browser-session run --goal packages/browser-session/goals/linkedin-easy-apply.md --profile linkedin --max-tasks 2 --max-minutes 45
pnpm browser-session sessions [--limit 20] [--json]
pnpm browser-session show <id> [--json]
pnpm exec nx test browser-session          # pure, browser (headless bundled Chromium) and db projects
```

Exit codes: a session that ended `complete` or `stopped` is 0, `failed` is 1, a usage or configuration problem is 2.

## Configuration

Every flag and variable is declared once in `src/config.ts`, with its default; nothing else in the package reads the environment.

How a session runs when its flags say nothing, and what it images, are files in the package's own `config/`, laid out like the repository's: `config/engine.json` names one file per kind, and each kind's files sit complete under `config/<kind>/` — switching is a one-word edit. Both kinds must be chosen; the values live in the files alone (`src/settings.ts` declares and checks them), and a session says which files are in force when it starts and records them in its manifest.

| Kind      | Files                                                    | What it decides                                                                                                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture` | `field-entries` (chosen), `every-action`, `observations` | the images a session keeps beside each step's own screenshot: `after` names the browser actions imaged once they ran — a plan's own and every field entry, a value read back included, each entry outlined in its image — and `failures` whether an action the page refused is imaged as it stood |
| `session` | `standard` (chosen)                                      | `headed`, the `rails` and the `loopRecovery` window a run uses unless a flag overrides its field                                                                                                                                                                                                  |

| Variable                   | Default                   | Meaning                                                                                                    |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `QUALITY_LOOP_URL`         | `http://localhost:3003`   | the loop the session asks                                                                                  |
| `BROWSER_SESSION_DUMP_DIR` | `static/sessions`         | where session dumps are written                                                                            |
| `BROWSER_PROFILES_DIR`     | `static/browser-profiles` | where persistent Chrome profiles live, one folder per `--profile` name — never commit them                 |
| `BROWSER_SESSION_SUBJECT`  | `the subject`             | whom the operator's answers are about, by name, so taught facts are self-contained (`--subject` overrides) |

Rails (`--max-tasks`, `--max-minutes`, `--max-failures`, `--max-stalled-steps` over the session file's values; brain faults in a row and unreadable pages in a row only from the file) are the engine's only decisions of its own. Each is a limit and ends the session `stopped`; the one goal among them, `--target-done n`, ends it `complete` once n units of work have closed `done` — counted on that outcome alone, and refused at start when it is above `--max-tasks`, since a done unit spends that budget too. Whether the browser shows is the session file's choice; `--headed` or `--headless` decides for one run.

## How a step goes

1. Observe: the accessibility snapshot (`ariaSnapshot({ mode: 'ai' })`) gives every element a ref; the DOM facts behind each interactive one — type, value, options, required, disabled, visible, maxLength, the hidden traits that mark a field a person could never see, whether the page marks it invalid, how many options a long select offers past the ones listed, and whether a modal dialog encloses it — are read in the page. An element is offscreen only when no scrolling of the page or of any box inside it could show it: a footer past the fold of a dialog that scrolls is reachable, an input parked off the page is not. A ref resolves only within the observation that minted it. The page is reported only once two reads in a row agree on every fact the goal renders, so a control that renders a moment after the document is seen. An element the tree gives no name carries the words a person reads on it as `text`. The modal dialog in front, when one is open, is the observation's active scope: the goal lists what is inside it first and counts the rest as behind it. A snapshot too large for the observation's bound is reduced by declared rungs (`SNAPSHOT_RUNGS`) — the open dialog whole and the rest reduced, the lines that carry words, those words cut where the room ends with the rest counted, none — and never to wordless lines; the observation and the plan record which rung the model read at.
2. Plan: the goal (mission, page, elements, snapshot, recent actions, units of work, limits, index) is composed within the loop's budget by a declared ladder — full, without the snapshot, with element context trimmed, with fewer elements (counted) — and run through `browser-step` with the rubric derived once per session. What runs is read back from the run (`routePlan`), never judged again: a plan a blocker names as a whole runs nothing; one a blocker or validator cut at a position runs up to it; one nothing cut runs whole, whatever its score — only a plan carrying an action that ends the session, or one the evidence gate found under-judged, is held to the accept bar. The validators refuse, from that action on, a ref the page did not list, a touch on a disabled, hidden, not-visible or behind-the-dialog element, anything after an action that replaces the page, and a `taskStart`, `taskDone` or `terminate` after any action that could have changed the page — a claim rests on the page as observed; a unit opens for the item this page shows. An action the page refuses — a click or a field fill — stops the plan there and counts one failed step toward `--max-failures`; so does a plan the loop handed back. A redundant `taskStart` or `taskDone` is recorded and skipped, never a reason to refuse the plan. The loop is asked for a second iteration only on a page unchanged since the last plan when that plan ran nothing: then the engine's own briefing is all there is to answer, and otherwise a fresh plan is briefed by what ran. What did not run is told to the next plan as `not-executed`, with why, and its `## Page` says what led to the page — the action that ran, and what the plan held past it for this page.
3. Fields: `askFields` sends the fields to `form-memory` with what each holds now — except those that still hold what this session settled for them, which are kept without a run. Each answer is routed by declared precedence — the page's own hidden traits, an admission that says nothing was judged, what a judge or validator pointed at, then the model's decision with its confidence and basis — to fill, keep, leave blank, or ask the operator, who is asked only about a required field. A fill the page refuses stops the fields after it, which are not attempted. An operator's answer is taught back the moment it is given, as one guidance document (`document-memory`) whose orchestration id lands on the decision row it came from.
4. Progress: a progress criterion the evaluator passed is settled once the next observation shows the page moved — every pass when the plan ran whole, else the passes an action that ran said it served (each action may name the criteria it serves) — for the session when no unit of work was open, for the unit otherwise. A session-settled criterion leaves the rubric later runs are judged against and is carried in the goal's `## Progress` section with its statement; a unit's are listed by id, still graded, and cleared when the unit closes.
5. Units of work: `taskStart`/`taskDone` open and close `browser_task` rows.
6. Rails are checked after every step; a plan's `terminate` ends the session on a stop its mission declares under `## Stop conditions` (`- <cause> (<ending>) ["<words the page shows>"]: <meaning>`): the row records `mission-stop` and the mission's cause word, in the status (`complete` or `stopped`) the mission declares for it. The page-stalled rail counts observations in a row of a page that did not change, whether the steps between them were refused, failed, or ran and moved nothing.

## The operator prompt

When a field needs a person the field is highlighted in Chrome and the terminal shows:

```
──── operator needed ────
Field: "Years of experience with Python" (number, required) — Whole years, professional only.
Page: Apply — additional questions · Unit of work: Senior Engineer at Acme
Suggested: "6" — not trusted: low confidence: the evidence names TypeScript, not Python
Type the answer, or fill the field in the browser and press Enter to read it back; /blank leaves it empty; /stop ends the session.
>
```

The answer is filled, recorded with `source: operator`, cached for the session by field label, and taught back at once.

## The dump

`static/sessions/<dump run id>/` — `manifest.json` (the settings files in force among it), `goal.md`, `01-steps/NN/{observation.json, snapshot.txt, screenshot.png, plan.json | fault.json, fields.json, teach.json, captures.json, captures/MM-<kind>-<what it touched>.png}`, `02-tasks.json`; every image is the page at CSS scale, and a capture's file name never carries the value entered — `captures.json` lists each image with the action that made it; one row in `static/sessions/index.jsonl` once the session is whole. `plan.json` records which rung of the goal ladder the step used.

## Records

Three tables in `packages/db`: `browser_session`, `browser_task`, `browser_decision`. Loop ids on a decision are plain columns, not foreign keys — the loop is another service. A `running` session whose `heartbeat_at` is older than 60 s belongs to a dead process.

Learning queries:

```sql
-- Ask rate per session over time: how often a field needed a person.
select s.started_at::date as day, s.id,
       count(*) filter (where d.kind = 'field-answer') as fields,
       count(*) filter (where d.kind = 'field-answer' and d.source = 'operator') as asked
  from browser_session s join browser_decision d on d.session_id = s.id
 group by 1, 2 order by 1, 2;

-- Fields first asked of the operator, then later answered from memory: the join is the exact question.
select asked.question, min(asked.created_at) as first_asked, min(learned.created_at) as first_from_memory
  from browser_decision asked
  join browser_decision learned on learned.question = asked.question
   and learned.source = 'memory' and learned.created_at > asked.created_at
 where asked.kind = 'field-answer' and asked.source = 'operator'
 group by asked.question order by first_asked;
```

## Layout

`src/core` (pure: ports, the engine, step execution, the field flow, rails, the write queue and heartbeat, the dump layout, the fakes), `src/adapters/{playwright,loop-http,mikro-orm,terminal-operator,fs-goal}`, `src/modules/{app,session}` (the composition root), `src/cli.ts` + `src/render.ts`, `goals/`.
