# browser-session

A Playwright program whose every decision is a quality-loop run. It opens Chrome on a persistent, signed-in profile, observes the page in front of it and asks the loop what to do next; the loop's `browser-step` pipeline plans, its `form-memory` orchestration answers form fields from recalled facts, and the engine here only executes what nobody objected to, applies the declared rails, and records every step. Nothing in the package names a site: the mission lives in a markdown goal, and the same program runs any goal.

```bash
pnpm browser-session login --profile smoke --url https://duckduckgo.com         # sign in once; the profile keeps the cookies
pnpm browser-session run --goal packages/browser-session/goals/smoke-search.md --profile smoke --max-tasks 1 --max-minutes 5
pnpm browser-session run --goal packages/browser-session/goals/linkedin-easy-apply.md --profile linkedin --max-tasks 2 --max-minutes 45
pnpm browser-session sessions [--limit 20] [--json]
pnpm browser-session show <id> [--json]
pnpm browser-session replay-events <id>    # a recorded session's events again, for a record that missed them
pnpm exec nx test browser-session          # pure, browser (headless bundled Chromium) and db projects
```

Exit codes: a session that ended `complete` or `stopped` is 0, `failed` is 1, a usage or configuration problem is 2.

## Configuration

Every flag and variable is declared once in `src/config.ts`, with its default; nothing else in the package reads the environment.

How a session runs when its flags say nothing, and what it images, are files in the package's own `config/`, laid out like the repository's: `config/engine.json` names one file per kind, and each kind's files sit complete under `config/<kind>/` — switching is a one-word edit. Every kind must be chosen; the values live in the files alone (`src/settings.ts` declares and checks them), and a session says which files are in force when it starts and records them in its manifest.

| Kind        | Files                                                    | What it decides                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture`   | `field-entries` (chosen), `every-action`, `observations` | the images a session keeps beside each step's own screenshot: `after` names the browser actions imaged once they ran — a plan's own and every field entry, a value read back included, each entry outlined in its image — and `failures` whether an action the page refused is imaged as it stood                                                                                              |
| `session`   | `standard` (chosen)                                      | `headed`, the `rails`, and the windows a run rides out a restarting service within — `loopRecovery` for the loop, `advisorRecovery` for an advisor, `busRecovery` for anything said on the notifications bus and for how long the close waits for the last events — unless a flag overrides a field                                                                                            |
| `operator`  | `terminal-and-notifications` (chosen), `terminal`        | where the operator is asked besides the terminal, which always is: `channels.notifications` asks through the notifications service too, at once, the first answer taken; `expiresAfterMs` is how long a channel keeps offering a question a crashed session never withdrew; `asksAfterRefusal` is how many times a question is put back, with why, once the page refused the operator's answer |
| `answering` | `standard` (chosen)                                      | which kinds of evidence-backed value a session types without asking the operator: `fills` maps each kind an answer declares its value rests on — `stated`, `restated`, `derived`, `mapped`, `inferred`, `composed`, `policy`, `none` — to `fill` or `ask`; `none` is always asked, and a kind left unclassified refuses the file                                                               |

| Variable                   | Default                   | Meaning                                                                                                                                                                                                        |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QUALITY_LOOP_URL`         | `http://localhost:3003`   | the loop the session asks                                                                                                                                                                                      |
| `NOTIFICATIONS_URL`        | `http://localhost:3005`   | the notifications service the operator is also asked through                                                                                                                                                   |
| `BROWSER_SESSION_DUMP_DIR` | `static/sessions`         | where session dumps are written                                                                                                                                                                                |
| `BROWSER_PROFILES_DIR`     | `static/browser-profiles` | where persistent Chrome profiles live, one folder per `--profile` name — never commit them                                                                                                                     |
| `BROWSER_SESSION_SUBJECT`  | `the subject`             | whom the operator's answers are about, by name, so taught facts are self-contained (`--subject` overrides)                                                                                                     |
| `UNIT_ADVISOR_URLS`        | `none`                    | the advisors that keep a record of units beyond a session, as comma-separated `[<id>=]<url>` entries; the mission's `## Advisors` names which are asked, and one it names that is not here refuses the session |

Rails (`--max-tasks`, `--max-minutes`, `--max-failures`, `--max-stalled-steps` over the session file's values; brain faults in a row and unreadable pages in a row only from the file) are the engine's only decisions of its own. Each is a limit and ends the session `stopped`; the one goal among them, `--target-done n`, ends it `complete` once n units of work have closed `done` — counted on that outcome alone, and refused at start when it is above `--max-tasks`, since a done unit spends that budget too. Whether the browser shows is the session file's choice; `--headed` or `--headless` decides for one run.

## How a step goes

1. Observe: the accessibility snapshot (`ariaSnapshot({ mode: 'ai' })`) gives every element a ref; the DOM facts behind each interactive one — type, value, the options a person can answer with (never one the page disables, nor a required select's placeholder, and a select resting on either holds nothing), required, disabled, visible, maxLength, the hidden traits that mark a field a person could never see, whether the page marks it invalid, how many options a long select offers past the ones listed, and whether a modal dialog encloses it — are read in the page. An element is offscreen only when no scrolling of the page or of any box inside it could show it: a footer past the fold of a dialog that scrolls is reachable, an input parked off the page is not. A ref resolves only within the observation that minted it. The page is reported only once two reads in a row agree on every fact the goal renders, so a control that renders a moment after the document is seen. An element the tree gives no name carries the words a person reads on it as `text`. The modal dialog in front, when one is open, is the observation's active scope: the goal lists what is inside it first and counts the rest as behind it. A snapshot too large for the observation's bound is reduced by declared rungs (`SNAPSHOT_RUNGS`) — the open dialog whole and the rest reduced, the lines that carry words, those words cut where the room ends with the rest counted, none — and never to wordless lines; the observation and the plan record which rung the model read at.
2. Plan: first each advisor the mission names is asked what is on record of units beyond this session (`POST /advice`, every step — the next item is chosen inside the plan that closes the unit); an advisor that faults is said once and its last good advice used, probed once a step, until it answers again. Then the goal (mission, page, elements, snapshot, recent actions, units of work — the units on record among them, by stance — limits, index) is composed within the loop's budget by a declared ladder — full, without the snapshot, with element context trimmed, with fewer elements (counted) — and run through `browser-step` with the rubric derived once per session. What runs is read back from the run (`routePlan`), never judged again: a plan a blocker names as a whole runs nothing; one a blocker or validator cut at a position runs up to it; one nothing cut runs whole, whatever its score — only a plan carrying an action that ends the session, or one the evidence gate found under-judged, is held to the accept bar. The validators refuse, from that action on, a ref the page did not list, a touch on a disabled, hidden, not-visible or behind-the-dialog element, anything after an action that replaces the page, and a `taskStart`, `taskDone` or `terminate` after any action that could have changed the page — a claim rests on the page as observed; a unit opens for the item this page shows. An action the page refuses — a click or a field fill — stops the plan there and counts one failed step toward `--max-failures`; so does a plan the loop handed back. A redundant `taskStart` or `taskDone` is recorded and skipped, never a reason to refuse the plan. The loop is asked for a second iteration only on a page unchanged since the last plan when that plan ran nothing: then the engine's own briefing is all there is to answer, and otherwise a fresh plan is briefed by what ran. What did not run is told to the next plan as `not-executed`, with why, and its `## Page` says what led to the page — the action that ran, and what the plan held past it for this page.
3. Fields: `askFields` sends the fields to `form-memory` with what each holds now — except those that still hold what this session settled for them, which are kept without a run. Each answer is routed by declared precedence — the page's own hidden traits, an admission that says nothing was judged, what a judge or validator pointed at, then the model's decision with its confidence and basis — to fill, keep, leave blank, or ask the operator, who is asked only about a required field. A fill the page refuses stops the fields after it, which are not attempted — except the operator's own answer, which is first put back to them with why, so they can choose again or fix the field in the browser and have it read back. An operator's answer is taught back the moment it is given, as one guidance document (`document-memory`) whose orchestration id lands on the decision row it came from.
4. Progress: a progress criterion the evaluator passed is settled once the next observation shows the page moved — every pass when the plan ran whole, else the passes an action that ran said it served (each action may name the criteria it serves) — for the session when no unit of work was open, for the unit otherwise. A session-settled criterion leaves the rubric later runs are judged against and is carried in the goal's `## Progress` section with its statement; a unit's are listed by id, still graded, and cleared when the unit closes.
5. Units of work: `taskStart`/`taskDone` open and close `browser_task` rows. A `taskStart` carries the facts the mission declares under `## Unit identity` (`- <name>: <what it means on the page>`) as facets, each value as the page names it: the row stores them, the goal renders them beside each open and closed unit, and the loop's limits validator cuts a `taskStart` that lacks a declared fact, names one the mission does not declare, names one twice, or names a unit an advisor has on record as forbidden. Each open and close is also said on the notifications bus — `session.unit.opened`, `session.unit.closed`, beside `session.started` and `session.ended` — with the row's own id, the unit's facets and the session's `maxMinutes`, for whoever keeps a record beyond the session; the events ride a queue of their own, so a bus riding out a restart never holds a row behind them.
6. Rails are checked after every step; a plan's `terminate` ends the session on a stop its mission declares under `## Stop conditions` (`- <cause> (<ending>) ["<words the page shows>"]: <meaning>`): the row records `mission-stop` and the mission's cause word, in the status (`complete` or `stopped`) the mission declares for it. The page-stalled rail counts observations in a row of a page that did not change, whether the steps between them were refused, failed, or ran and moved nothing.

## The operator prompt

When a field needs a person the field is highlighted in Chrome and the question goes to every operator channel at once — the terminal always, and the notifications service when the `operator` settings add it, which puts it on its own channels (Telegram among them). Every channel shows it the one way the notifications contracts describe — options lettered, the answerer's untrusted pick marked with why, the commands — and reads a reply with the contracts' `readReply`, so `b` means the same at the terminal as on a phone. At the terminal:

```
──── operator needed ────
Work authorisation
select, required
Are you authorised to work in this country?
Page: Apply — additional questions
Unit of work: Senior Engineer at Acme
Suggested: "Yes" — not filled: rests inferred: a guess

  a) Yes   (the answerer's pick — not filled: rests inferred: a guess)
  b) No

  /readback  I filled it in the browser: read it back   (Enter alone)
  /blank     Leave it empty
  /stop      End the session
Reply with a letter (a, b) or the option as written, or /readback, /blank, /stop.
>
```

The first answer is taken (`src/core/first-answer.ts`); every other channel is withdrawn and says who answered and what. The answer is filled — the full value behind a choice — recorded with `source: operator` and, in its payload, the channel it came on (`via`) and what it was chosen from (`chosen`: an option, the answerer's value, a suggestion by what it rests on, or typed), cached for the session by field label, and taught back at once. A line typed at the terminal while no question is open is said to be unused, never kept for the next question. Ctrl-C ends the session as the operator's word, after the step in flight and through every closing write — the row closed, the events out — rather than killing it with a running row behind; a second Ctrl-C exits at once.

A field with no options going to the operator also gets suggested answers (`src/core/operator-ask.ts`). Once a form's fields are routed, one `answer-suggestions` run is opened through `form-memory` for every such field, under the session's own derived rubric, and never waited on: the question goes out at once. When the suggestions arrive before an answer the question is withdrawn as superseded and asked again with them; an answer given first is taken. They are lettered record first, then the drafts labelled apart — `draft: transferable`, built from recorded adjacent work, and `draft: invented — not in your record` — less every one the run's report withholds, and none from a run no judge saw. The mission's `## Suggesting policy` says when drafts are offered at all. A chosen letter fills its whole text and is cached and taught like any answer.

## The dump

`static/sessions/<dump run id>/` — `manifest.json` (the settings files in force among it, and the events still unsent when the close stopped waiting), `goal.md`, `01-steps/NN/{observation.json, snapshot.txt, screenshot.png, advice.json, plan.json | fault.json, fields.json, teach.json, captures.json, captures/MM-<kind>-<what it touched>.png}`, `02-tasks.json`; `advice.json` records what each advisor said for the step — answered or stale, from which step, how many units and how many omitted — and the units the goal was composed with; `fields.json` records what became of the form's suggestions — `pending` when the form was settled before they came, else the run, its admission, what it withheld and what was offered, or its fault; every image is the page at CSS scale, and a capture's file name never carries the value entered — `captures.json` lists each image with the action that made it; one row in `static/sessions/index.jsonl` once the session is whole. `plan.json` records which rung of the goal ladder the step used.

## Records

Three tables in `packages/db`: `browser_session`, `browser_task`, `browser_decision`. A session row carries `subject`, whom it acted for; a task row carries `facets`, the unit's declared identity. Loop ids on a decision are plain columns, not foreign keys — the loop is another service. `pnpm browser-session replay-events <id>` publishes a recorded session's events again from these rows, for a record that missed them; a consumer keyed on the unit's id takes a replay as nothing new. A `running` session whose `heartbeat_at` is older than 60 s belongs to a dead process.

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

`src/core` (pure: ports, the engine, step execution, the field flow, rails, the write queue and heartbeat, the advisors and the session events, the dump layout, the fakes), `src/adapters/{playwright,loop-http,advisor-http,mikro-orm,terminal-operator,notifications-http,fs-goal}`, `src/modules/{app,session}` (the composition root), `src/cli.ts` + `src/render.ts`, `goals/`.

## A record beyond the session

A mission may declare what identifies a unit of work beyond this session and who keeps the record:

```markdown
## Unit identity

- company: the company as the listing's pane names it, beside the title.

## Advisors

- record
```

The convention, so the next domain follows it rather than inventing one: a declared mission section → a field in the goal's index → a rule in the loop's limits validator → a line in the goal's Limits → a rendering beside the thing it is about → a port for what the goal cannot carry → a bus topic for what happened. An advisor is any service that answers two routes with the contracts' shapes — `GET /advisor` with who it is and which declared facets it keeps its record by, `POST /advice` with the units on record for a subject, each by identity, with a stance (`avoid`: prefer another item, the mission's prose says when one may still be taken; `forbid`: never started, the validator cuts a `taskStart` naming one) and a note — and subscribes to the session's topics to keep that record. The session names no domain: the mission says which advisors, `UNIT_ADVISOR_URLS` says where, the advisor says who it is. The walk-through, with the job-application record as the first tenant: `docs/quality-loop/domain-rules.md`.
