# What has been built so far

_As of 28 Oct 2026 (UTC): 845 commits since 27 Aug 2026, plus one landing of 27 Oct not yet committed; 35 packages._

This page explains, in plain words, what this repository can do today. Two labels show how far each feature has been proven:

- **Tested for real:** it ran live, on real data or the real AI model, on the date shown. Dates are in UTC, as the run records keep them, so an evening run in California shows as the next day.
- **Built and tested in code:** its automated tests pass, but it has not run for real yet.

## In one minute

- **Interview practice.** The Studio lets you draw a system design for an interview prompt, get it scored 0–100 and explained by a panel of AI reviewers, and let an AI coach improve it.
- **One shared AI engine.** Every AI task in the apps runs through the quality loop: one AI drafts, other AIs check, and fixed rules in plain code decide. It recorded 3,139 runs between 6 Sep and 18 Oct 2026.
- **Memory.** The engine keeps lessons from past runs and facts about you from your documents and answers. Separately, the engine can design memory for an AI agent, and a newer memory engine runs that design as a live service. Since 27 Oct 2026 a program can ask that service for a space by name, and the job assistant has one, `job-assistant`, being filled and checked under a test tenant before anything live uses it.
- **Job applications.** A supervised Chrome applies to LinkedIn Easy Apply jobs, fills forms from your record, asks you the rest and skips companies you applied to in the last 90 days. At least 77 applications went in between 10 and 16 Oct 2026.
- **Your phone and Google.** Five Telegram bots bring you questions and alerts. The AI can use your Gmail and Google Calendar as tools; it has no way to send mail, and it is built to ask for your yes before any calendar change.
- **Government contracting.** govcon finds federal contract notices for Enfav on SAM.gov, ranks them, studies government spending on USAspending and sends a daily Telegram digest.
- **The Enfav website.** enfav.com has been live since 14 Oct 2026. Its tests stop any page from stating a company fact that is not on one declared list.
- **The foundation.** One repository of 33 packages, one local stack, one database changed only by numbered migrations, and automatic checks on every commit.

## The big picture

```text
            YOU                                        YOUR PHONE
  web pages and terminal                           Telegram, five bots
             |                                        ^           |
             v                                        |           v
  +------------------------------+               +-----------------------+
  | THE APPS                     |  questions,   | NOTIFICATIONS BUS     |
  |  Studio: interview practice  |<------------->| port 3005             |
  |  Job applications: LinkedIn  |  alerts and   +-----------------------+
  |  Gmail and Calendar tools    |  your answers
  |  Agentic memory              |
  |  govcon: federal contracts   |
  +------------------------------+
        |                    |
        | AI tasks           | records
        v                    v
  +-------------------+  +--------------------------------+
  | QUALITY LOOP      |->| STORES                         |
  | port 3003         |  |  PostgreSQL (port 5433):       |
  | the shared engine |  |    records, runs, history      |
  | asks Claude, then |  |  Qdrant (port 6333):           |
  | decides by rules  |  |    memories, found by meaning  |
  +-------------------+  +--------------------------------+

  Public, on its own: the Enfav website at enfav.com, served by Cloudflare
```

You work in three places: web pages, terminal commands and Telegram on your phone. Every app that needs AI hands the work to one shared engine, the quality loop, which asks Claude through your Claude Code login and then decides by fixed rules. Records and memories live in two local stores: PostgreSQL for records, and Qdrant for memories found by meaning. Search by meaning needs an OpenAI key, because Claude offers no model for it; without the key, the engine skips its memory steps and still runs. All of it runs on your own computer except the website.

## The engine everything shares: the quality loop

Every AI task in the apps runs through one engine, the quality loop (port 3003); only the commit-time code reviewer calls Claude on its own. It works like a small newsroom:

```text
  writer  -->  reviewers  -->  graders  -->  referee  -->  notebook
  (AI)         (AI)            (AI)          (rules)       (memory)
  drafts       hunt for        score the     accept,       lessons for
  the work     problems        checklist     revise ...    next time
```

- **The writer** (the _producer_) drafts the work: a design, a plan of clicks, a list of facts.
- **The reviewers** (_critics_) only hunt for problems: something missing, wrong, risky or unexplained.
- **The graders** (_evaluators_) mark each checklist item pass, partial or fail. The checklist is made from the goal before judging starts, so everyone grades against the same list.
- **The referee** (the _controller_) is plain code, not AI. By fixed rules it turns the evidence into a 0–100 score and one of five decisions: **accept**; **revise** (send the chosen fixes back to the writer for another round); **retry** (ask for a fresh draft); **escalate** (stop and flag the run for a person or for the app that started it); or **reject** (stop on a problem that cannot be fixed).
- **The notebook** (_memory_) keeps lessons and facts so later runs can use them.

**Why it is built this way:** AI answers are useful but not always reliable, so the AI only supplies evidence and plain code makes every decision. Some reviewers are asked twice, and then a problem counts only when enough of their answers agree, so one odd answer cannot sink a result. Every prompt and reply is saved, so you can trace any verdict back to its cause.

**What the engine can do**

- **16 pipelines.** A pipeline is a recipe written as data: what to produce, who judges it and the scoring rules. One grades your Studio design, one plans the next browser step, one fills a form page, one digests a document, and so on.
- **9 orchestrators.** Fixed chains of runs, such as "recall lessons, run, digest what was learned, store it".
- **Run page** (http://localhost:4201): pick a pipeline and one of the 26 library prompts (the same ones the Studio offers), run it and read the verdict. Used live in Chrome on 30 Sep 2026 to read real runs.
- **Run inspector** (http://localhost:4201/inspect): step through any run like a debugger, from what each reviewer said to how the score was built. Tested for real on 1 Oct 2026 with 41 browser checks.
- **Command line:** `pnpm quality-loop:run --pipeline <id> --goal <file.md>` runs one pipeline without the web page.
- **Replay:** re-decides past runs under a different rule without calling any AI, so a rule change can be tried on old evidence for free. On 22 Sep 2026 it re-decided 54 recorded rounds: the rules then in use reproduced every recorded decision, and a stricter candidate rule agreed on all 54.
- **Run records:** every run is saved as a database row plus a folder holding every prompt and reply. 1,940 of the 3,139 runs ended in "accept".
- **Crash safety:** a running run sends a "still alive" heartbeat; if its process dies, it is marked Interrupted after 3 minutes.
- **Readout** (27 Oct 2026, not yet committed): every finished run's record also says whether its best round passed the bar it was held to, and which parts of its answer a reader must hold back. The programs that use a run read that instead of working it out again.
- **One door to the AI model:** the engine uses the one model its settings name. Today that is Claude, through your Claude Code login, checked before the engine starts. (On 6–9 Oct, 975 runs, mostly browser steps, tried OpenAI models or a local model instead.) At most 8 AI calls run at once, a failed call is tried up to 3 times, and an over-long reply is kept, not thrown away.
- **Memory:** recalls lessons and facts for a new run, and digests finished runs, documents and your form answers into new ones, each checked by AI critics before it is stored.
- **Guard rails:** tests fail the build if the engine's core uses the clock, randomness, files or environment settings, so the same evidence always gets the same decision. They also fail if a written requirement has no test. The engine's own suite had 760 tests on 19 Oct 2026.

**Not finished yet**

- **Grades wobble.** The same input has scored about 9 points apart, because the model's randomness cannot be pinned. Answers are not cached either, so every re-grade is a full model run.
- **Part of one older score cannot be earned.** The older pipeline that grades written answers has one score part (soundness, 20% of the weight) with no checklist item behind it, so it can only lose points. Your Studio drawings use a newer pipeline in which every part can be earned, so this does not touch them.
- **Memory's benefit is unproven.** 15 runs with memory averaged 63.5, against 63.6 for ten similar runs just before them. In 5 paired coach runs (the same design coached with and without lessons), lessons added +0.5 points, give or take 9: too small to tell.
- **A small mismatch waits on your decision.** When a run ends in "accept", it hands on its best-scoring round, and in 9 runs (counted on 18 Oct 2026) that round was one the referee had not accepted. No verdict would change today. A one-line fix needs your yes.
- **No monitoring yet.** Nothing reports to a monitoring service such as Datadog, and no automatic check confirms that the AI judges still catch what they used to.
- **No page for orchestrators.** You can start an orchestrator only with a web request (for example with curl), not from a page.

## What you can do today

Six areas. Each lists what it does, what has been proven and what is still missing.

### The Studio: practise system-design interviews

A web app (http://localhost:4200) where you draw an architecture for an interview prompt, a panel of AI reviewers grades and explains it, and an AI coach can improve it.

**What it does**

- **Prompts:** write your own, copy one of 26 from the library, or have the AI write one from one of six experience profiles (short write-ups of past work: five based on yours, with practice-only lines marked, and one pure practice example). A generated prompt is not allowed to name a company. The AI turns each prompt into a fixed checklist of up to 24 items (c1, c2 …).
- **Canvas:** drag 41 building blocks in 11 groups (gateway, load balancer, database, cache, queue, event stream, CDN …), link them sync or async and note each block's settings.
- **Explain:** the Brief tab ties each checklist item to the blocks that meet it; the Narrative tab holds your written walkthrough. Any claim the drawing does not back up costs points.
- **Grade:** five AI critics and two AI graders each answer twice; plain code turns what they agree on into a 0–100 score, and 75 or more is "accept". A grade usually takes about 6 minutes (2 to 16 so far). Click a finding to light up its blocks.
- **Coach:** up to 10 improvement rounds (3 by default). A round that beats every earlier one lands in your timeline as an "AI" revision. The coach sees lessons from earlier coach runs; the critics and graders never do, so lessons cannot sway a grade.
- **Keep:** numbered revisions, an autosaved draft, one-click export (diagram PDF plus markdown), STAR stories (Situation, Task, Action, Result) and light or dark themes.

**Proven so far**

- Tested for real on 30 Sep 2026, in Chrome on the real model: a checklist took about 7 seconds, a generated prompt about 4.5 minutes and a grade about 2 minutes. Findings lit up on the canvas, and export, the dashboard, STAR stories and themes all worked.
- Tested for real, 30 Sep to 3 Oct 2026: a 3-round coach run lifted a design from 25 to 60, and four grades reached "accept" (76.7 to 83.3). After a fix that stopped throwing away over-long AI replies, 20 of 20 coach rounds produced a design (4 of 8 before).
- Tested for real on 14 Oct 2026: exporting your experiences and STAR stories as documents for memory left out the practice example and every practice-only line, with 0 leaks. So practice material is not passed on as facts about you.
- Built and tested in code: 45 browser tests run in about a minute, at desktop and narrow screen sizes and with the grader unreachable. They use their own database and a fake grader, never your data or the real model.

**Not finished yet**

- The coach's lessons have not been shown to help yet: 5 paired runs are too few, and about 30 would be needed to see a 4-point effect. Third coach rounds often scored worse (64 to 37 once), but a worse round never reaches your timeline.
- Experiences are a fixed list of six: the app cannot add or edit them and does not read your résumé PDF.
- No way yet to turn a wrong grade into a test or to mark a finding right or wrong.
- The STAR library is nearly empty (2 short test stories on 13 Oct 2026), and no AI helps write stories.
- No scheduled backup: every Studio prompt, session, revision and STAR story before 2 Oct 2026 was lost when a test run emptied the practice database (the run folders still hold each graded prompt and design).
- No Studio grade has been recorded on this machine since 3 Oct 2026. So the Studio changes of 13–14 Oct (code split into smaller files, and practice examples marked) were checked by tests, not by a live grade.

### Agentic memory: memory for AI agents

The quality loop designs a memory plan for an AI agent, and a separate engine runs that plan as a real memory service (port 3007). This is not the engine's own notebook described above.

**What it does**

- **Designs a memory plan** from a written brief: which kinds of memory to keep (_registers_), the operations each one offers, and the routines that move memory around. The plan is graded on six areas and revised for up to three rounds.
- **Runs a plan as a _memory space_:** remember, update and forget, without losing history. Repeating a memory changes nothing, and forgetting closes a memory with a reason.
- **Recalls** by exact key, by meaning or by date, only within the caller's tenant, project, user and, since 27 Oct 2026, unit of work: a memory kept for one unit (one employer's posting, say) is never shown to a request that names no unit or another one. Results are capped (12 by default), and each says why it was found.
- **Consolidates:** confirmed past events become a lesson once three separate runs support it, and lessons are gathered into a playbook: a set of how-to rules, versioned each time they change.
- **Digests text into typed memories:** checks hold back any memory the text does not support, that misreads it, or that would store a planted instruction. A digest's approved memories can be written only once; a second attempt is refused.
- A sweep every minute expires short-term memory (1 hour by default), and design-cycle news goes to its own Telegram bot. Both ran for real on 16–18 Oct 2026: 4 of 4 notes expired after their hour, and 6 of 7 messages reached the bot.
- **Named spaces** (27 Oct 2026, not yet committed): a program asks for a space under a name of its own, such as `job-assistant`, from a finished design run. The first ask makes it; the same ask again answers the same space; the same name from another run is refused, so a name is never held twice. A program finds its space again by name instead of keeping an id.
- **One client for any program** (27 Oct 2026, not yet committed): a small library, `agentic-memory-client`, is the one way a program talks to a space. Before it starts, the program declares what it needs of the space (which registers, which verbs, which scope keys) and is refused by name if the space cannot serve it, instead of failing in the middle of its work. A restarting service is waited out for a declared window, and a write is never sent twice. The library's test version runs the real memory engine in memory, so a program's tests prove the scope and history rules without a running service.
- **Your documents into a space** (27 Oct 2026, not yet committed): the document ingester can post your résumé and notes into a space instead of the engine's own store, apply each digest once, and take a document back out record by record. Three terminal commands, `recall`, `history` and `forget`, read a space back and close a wrong memory with a reason.

**Proven so far**

- Tested for real on 17 Oct 2026: the first live plan had 5 registers, 12 operations and 4 routines; it scored 48.6 of 100 and the referee said "revise".
- Tested for real on 17 Oct 2026: a full design cycle ran three coached rounds (61.5, 55.6 and 58.9) in about 75 minutes and kept the best one.
- Tested for real on 17 Oct 2026: a live plan ran as a memory space on real OpenAI embeddings and Qdrant and passed 15 of 15 checks. They included a lesson backed by 3 runs and a playbook that went from version 1 to 2.
- Tested for real on 18 Oct 2026: the first two text digests passed 14 of 14 checks and wrote 7 of 8 and 5 of 6 proposed memories. A pasted note saying "keep that as your own standing rule" became no memory at all.
- Tested for real on 27–28 Oct 2026: a memory plan for the job assistant, written by hand (four long-term fact stores: your facts, your stories, the bounds on what you may claim, and your standing answers to form questions), was judged once by the loop in 11.7 minutes: "revise", 56.7 of 100, with governance the weak area. Compiled as a space it had no problems and no warnings, and it was bound under the name `job-assistant` at 00:05 UTC on 28 Oct. The space is being filled under a test tenant first: by 01:40 UTC it held 163 memories, 67 from your résumé through 8 digests and 96 standing answers taught from recorded operator answers.
- Built in three days (16–18 Oct 2026), with 75 tests in the memory engine and 51 in its service; the client library added 33 on 27 Oct.

**Not finished yet**

- No memory plan has reached the pass mark of 75 yet. The best the loop wrote scored 61.5 in today's format, and 66.7 in an earlier diagram format on 16 Oct; the hand-written plan for the job assistant scored 56.7. A space is made from a finished run whether or not the loop accepted it, so all three live spaces come from "revise" runs.
- A space's name is held for good by the run that made it: there is no way yet to free a name, so a re-judged plan needs a new one. That is one of five small items left for a later shared window, with a declared width for the `teaching_ref` column, a named recall step for the form path, the document-digest memory shape exported from the shared contracts, and a similarity floor for recall by meaning.
- The coach is now told what the memory engine cannot run (for example a memory nothing can ever forget), but that has not been tried on a live design.
- The settings are first guesses, not measurements: 1 hour for short-term memory, 12 recall results, 3 supporting runs per lesson.
- If the service restarts during a design cycle, that cycle stays "running" forever.
- The same text can be digested twice, and applying an older text after a newer one rolls a fact back.
- No screen of its own: you use it through web requests to port 3007 and, since 27 Oct, the ingester's three terminal commands (the design run itself shows in the run inspector).

### Job applications: LinkedIn Easy Apply, with you in charge

A visible Chrome applies to LinkedIn Easy Apply jobs (LinkedIn's short in-page application form) for you. It fills forms from your record (the facts stored about you) and asks you only what that record cannot settle. It also skips companies you already applied to, which a separate application record keeps track of.

**What it does**

- Searches remote software-engineering roles with Easy Apply, opens one listing at a time, fills each form page, submits and moves on until it reaches your target or a limit. Every click plan and form page is a judged quality-loop run.
- **Fills fields from your record:** facts stored from your résumé, a standing-answers notes file and your past answers. A field your record cannot answer goes to you instead of being guessed. Open-ended questions are the exception: the AI types in a written draft when it can write one, labelled by what it rests on (your record, related work or nothing). Since 27 Oct 2026 every answer also says what it is about: you (the same whoever asks) or this one employer.
- **Two brains, one chosen in settings** (27 Oct 2026, not yet committed): `loop`, the path until 30 Oct 2026, reads your record from the engine's own store. `memory` reads the `job-assistant` memory space instead, one lookup per distinct question on the page, has the loop judge the page with that evidence, and teaches each of your answers to the space the moment you give it, as one fact keyed by the question (the same question answered again replaces it, history kept) with who answered on which channel. An answer about one employer stays with that employer. Since 30 Oct 2026 the live flow runs on `memory`.
- **Asks you** at the terminal and on the job-application Telegram bot, with lettered options; the first answer wins. Each answer is taught to your record right away: general facts are reused everywhere, and facts about one employer stay with that company.
- **Never applies twice:** before every move it asks the application record (port 3006) which companies you applied to in the last 90 days or are applying to in another session, and refuses them.
- **Stays safe:** limits on applications, minutes, failures and stuck pages. It stops at a sign-in wall or LinkedIn's daily limit, never signs in, messages recruiters or uploads files, and one Ctrl-C ends it cleanly.
- **Leaves a trail:** each session saves screenshots, every step's plan and why each field was answered as it was.

**Proven so far**

- Tested for real on 10 Oct 2026: the first application went in end to end, after 22 earlier LinkedIn sessions (from 5 Oct) had never finished one.
- Tested for real on 15 Oct 2026, the fastest run: 10 applications in about 2.5 hours. Of 26 form fields, 15 came from your record and 11 were answered on Telegram, with 0 wrong. Answers you gave at one company filled the same questions at the next one, 25 minutes later.
- Tested for real on 16 Oct 2026: an 8-hour run submitted 7 and refused 39 attempts to reopen companies already on record.
- In total, at least 77 applications went in between 10 and 16 Oct 2026, to 74 companies: three got two applications on 10–12 Oct, before the application record existed. By the end of 16 Oct the application record listed 83 companies: those 74, plus 9 where a run stopped mid-application.
- Your record: on 3 Oct 2026 one career document became 587 stored facts. On 14 Oct, after an audit of 901 facts, you approved removing 27. Facts tied to one application also stopped leaking into others: in a test, questions that pulled up another application's facts fell from 29 to 0.
- Tested for real on 28 Oct 2026, offline: 96 recorded operator answers were taught into the test tenant of the `job-assistant` space twice, and the second pass changed nothing. A first replay of 177 recorded form pages against that tenant found 0 memories leaking between employers or between tenants, and recall took 268 ms per page at the median, against 909 ms recorded for today's path. The replay that also judges the pages again has not run yet.

**Not finished yet**

- A failed application is not remembered, so the same failing listing can be opened again. Whether to avoid failed ones is your policy decision.
- The AI that plans each step is shown only 40 of the companies in the application record. It keeps picking ones it was not shown and gets refused, which cost about 57 minutes in one 8-hour run. The fix is designed, not built.
- Some fields defeat it: search-as-you-type lists, answers in the wrong shape (words in a digits-only box) and required file uploads. For a search-as-you-type list, fill it yourself in the open Chrome window, then reply /readback so the session reads back what you entered.
- Long unattended runs wait on you: one 8-hour run spent about 145 minutes waiting for answers. A Mac on battery can also fall asleep and pause the run, so keep it on power and start long runs under `caffeinate -i`, which keeps it awake.
- Draft answers are partly done. Only drafts built from your record have been seen typed into a live form; drafts with weaker backing have not. One automated test still fails because it expects the old rule, under which those weaker drafts were offered to you instead of typed.
- The `memory` brain went live on 30 Oct 2026 (tenant `oscar`, seeded from your record, no carry-over of recorded answers); deleting the old path follows the first supervised session.
- The application record has no web page yet.

### Your phone, Gmail and Google Calendar

The services reach you on your phone through Telegram, and the AI can use your Gmail and Google Calendar as tools. It is built to ask before anything reaches other people.

**What it does**

- **A message board** (the notifications _event bus_, port 3005): services post what happened and read what they need, in order, with nothing lost.
- **Questions on your phone:** a bot sends lettered choices and buttons; tap one, type a letter or write your own answer. Messages that need no answer carry a single "Noted" button.
- **Five bots, one per purpose:** job applications, govcon, agentic memory, Gmail and Calendar, so their messages never mix.
- **Gmail as 10 tools:** search, read, draft and label. There is no send tool, so a draft always waits for you.
- **Google Calendar as 9 tools:** read events, find free slots for a meeting of up to 8 hours on a 30-minute grid in your working hours (9 to 5 Pacific, weekdays; by plain arithmetic, not AI guessing), and create, change, answer or delete events, each change only after you tap Yes.
- **Missions:** a markdown file gives the goal, the steps, when to stop and what never to do. Three exist today: report your inbox, report your week, and set up a meeting that an email asks for. The AI plans each step, critics check the plan before it runs, and hard limits stop it (30 steps, 60 minutes).
- **Alerts:** new mail is checked every 60 seconds and your calendar every 2 minutes, and each new message or calendar change is announced on its Telegram bot.

**Proven so far**

- Tested for real on 11 Oct 2026, on your phone: a question arrived, was answered by typing and by tapping a letter, and closed everywhere once answered.
- Tested for real on 15 Oct 2026: during one job-application run, 11 form questions went to your phone and you answered them all.
- Tested for real on 17 Oct 2026, on your real accounts: the read-only inbox and week reports each finished in 2 steps, and a real email produced "1 new message" on the Gmail bot.
- Gmail, Calendar, the Google sign-in and the mission engine were built in one day (16 Oct 2026). An AI code review found 19 defects and the first live runs 3 more (for example, "tomorrow" was read in UTC, not your time zone); all were fixed.

**Not finished yet**

- Asking before acting has never run for real: the only live meeting mission found no email asking to meet, so approving, creating the event and drafting the reply are untested live.
- The calendar-change alerts have not seen a real change yet.
- Missions start only from the command line or the services' web API, not from Telegram (you deferred that).
- If the app you registered with Google for this sign-in is still in Testing mode, the sign-in expires after 7 days; then run `pnpm gmail authorize` again.
- The Gmail and Calendar endpoints have no login, so they are safe only on your own machine.

### Government contracting for Enfav (govcon)

A service and web app (http://localhost:4202) that finds federal contract opportunities for Enfav, ranks and tracks them, studies government spending and sends daily Telegram alerts.

**What it does**

- **Daily pull:** once a day it fetches new contract notices from SAM.gov (where agencies post what they want to buy) with Enfav's saved searches. A guard counts every request against SAM.gov's limit of 1,000 a day.
- **Ranks every notice 0–100** from eight factors, such as industry codes, keywords, deadline and set-aside (work reserved for small businesses), and shows the reason for each point.
- **Tracks bids** through stages, from watching to won, lost or passed, with reminders. Tracking firms and awards you want to pursue (an award is a contract the government has already given out) is built and tested in code.
- **Spending research** on free USAspending data (money the government already spent): who buys and who wins, and which larger firms hire subcontractors. It also shows what a small firm without a contract vehicle (a pre-awarded umbrella contract) could win, and which contracts end soon and may be bought again.
- **Daily alerts** in a short Telegram digest from govcon's own bot: awards ending soon, unusual spending and new high-ranked notices.
- **A dashboard** ordered by what to act on, and **Settings** where you change what Enfav looks for without touching code.

**Proven so far**

- Tested for real on 30 Sep 2026: a browser walkthrough of all six pages passed, spending 2 SAM.gov requests (21 of the daily 1,000 had been spent by then).
- Tested for real on 13 Oct 2026: 19 checks of the spending page in a visible Chrome all passed. The daily spending refresh from USAspending found 643 awards ending within 90 days, and five digests reached your Telegram.
- Market study on 13 Oct 2026: in fiscal 2025, computer systems design and related services (software and IT work) took $70.3B of federal contract money, the second-largest of all industry groups. Small businesses won 46%, but 90% of the money flows through contract vehicles Enfav does not hold. So Enfav's ways in today are subcontracting and small stand-alone contracts: 1,812 new ones went to small firms outside any vehicle, with no certification needed.
- Tested for real on 14 Oct 2026: the first scheduled pull ran 8 searches, found 31 new notices and sent 2 new high-ranked leads in one digest.

**Not finished yet**

- Four saved searches for manufacturing work still run in the daily pull (19 Oct 2026), though nothing they found by 14 Oct ranked above "low". Dropping them is your call. A fresh database would also start from the old profile (eight industry codes), not the four you chose on 13 Oct.
- Enfav's own UEI (its SAM.gov ID) is still missing from the profile (19 Oct 2026). Until you enter it in Settings, the dashboard's Registration panel cannot show Enfav's SAM.gov registration.
- In a busy market a digest can count hundreds of ending awards (444 on 13 Oct); it lists the ten largest and leaves the rest to the dashboard. Two settings can quiet it, a minimum dollar amount per award or alerts only for awards you follow, but neither is turned on (19 Oct 2026).
- An award's end date is only its current one: the government often uses the contract's options (extra time it can add) to push the end later. So an award shown as ending soon is only a possible re-bid.
- There are no automated browser tests for the govcon pages, which are laid out for a desktop.

### The Enfav website (enfav.com)

Enfav's public website, live since 14 Oct 2026: six pages built ahead of time and served by Cloudflare.

**What it does**

- Six pages: home, services, government (the capability statement), about, contact and a not-found page. Each page is a finished file, so there is no server, database or browser script to maintain.
- The capability statement prints on at most two US-Letter pages, and a test enforces it.
- Every company fact is declared once, copied word for word from its official source. A test fails any page that claims a certification, clearance, award or contract outside that list.
- A robot browser opens every page at desktop and phone width and checks accessibility, keyboard use, links, security headers, and that the live site matches the build byte for byte.
- `pnpm website:serve` previews your edits with live reload; `pnpm website:deploy` publishes from the terminal.

**Proven so far**

- Tested for real on 14 Oct 2026: the checks caught Cloudflare silently adding an analytics script. Once that setting was turned off, the first production deploy passed 145 of 145 checks.
- Tested for real on 15 Oct 2026: two more deploys. The real SAM.gov registration details replaced every placeholder, and a restyle matched the capability statement, with every colour pair proven to meet WCAG AA, the common accessibility standard for contrast.
- Designed, built, reviewed and launched in three days (13–15 Oct 2026).

**Not finished yet**

- Automatic deploys from GitHub are built but have never run: the site is not on GitHub's main branch yet, and the Cloudflare token, GitHub production environment and `WEBSITE_DEPLOYS` switch are not set up.
- Three domain settings are yours to change in the Cloudflare dashboard (not re-checked since 14 Oct 2026):
  - turn off TLS 1.0 and 1.1, old and weak versions of the encryption behind HTTPS;
  - turn on DNSSEC, which signs the domain's DNS answers so they cannot be forged;
  - add a DMARC record, which tells mail servers how to treat email that pretends to come from enfav.com.
- Yearly upkeep: after each SAM.gov renewal, copy the new expiry date into the site.

## Under the hood

- **One repository, 35 packages,** managed with Nx, a tool that builds, tests and checks only what a change affects.
- **One local stack:** `tilt up` starts everything on your computer: PostgreSQL and Qdrant in Docker, eight backend services each in its own Kubernetes container, and three web apps. `pnpm stack:up` runs the Studio core without Kubernetes; both share one saved database. Tested for real on 1 Oct 2026: a full grade ran through the containers.
- **Database changes by migration:** one PostgreSQL database with 40 tables, changed only by 88 numbered, hand-written migration files (two of them, from 27 Oct, not yet committed). A drift check fails if the code and the database disagree.
- **Tests cannot touch your data:** they may only empty a database named as a test database. The guard landed hours after a test run erased the practice data on 2 Oct 2026.
- **Checks on every commit:** automatic formatting, a banned-names check, code-style and type checks for the packages touched, then an AI readability reviewer plus fixed rules (file size, package boundaries, theme use).
- **668 repo-wide guard tests (19 Oct 2026):** no file over 500 lines, no unused code left behind, every file type-checked and every written requirement backed by a test.
- **Measured limits:** caps on how much the AI may write come from real runs (`pnpm measure:bounds`), and tests fail when a cap is too tight.
- **One look:** a shared design system (24 components, two chart types, colour contrast checked by tests) and a Storybook catalog that renders every example.
- **Claude only through your subscription:** the engine reaches Claude through your Claude Code login, checked before it starts; no Claude API key is used.
- **Not there yet:**
  - GitHub's copy of `main` stops at 3 Sep 2026, so CI (GitHub re-running every check) has not checked recent work. It also builds container images for only 5 of the 8 backend services.
  - No monitoring, nothing deployed to AWS and no scheduled backup.
  - Several Claude sessions share one checkout, so saving a shared package or `.env` restarts the servers watching it and stops runs in flight.

## Where each part runs

Full start-up steps are in [the README](../README.md) and [the RUNBOOK](../RUNBOOK.md). AI work needs this computer signed in with `claude login`, and memory search needs `OPENAI_API_KEY` in `.env`.

| Part                                         | How to open or start it                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Everything at once                           | `bash scripts/setup.sh`, then `tilt up`                                                                         |
| Studio core: stores, API, engine, Studio     | `pnpm stack:up` (`pnpm stack:down` stops the stores)                                                            |
| Studio                                       | http://localhost:4200                                                                                           |
| Studio API                                   | http://localhost:3000/api                                                                                       |
| Quality loop (the engine)                    | `pnpm quality-loop:serve`, then http://localhost:3003/health                                                    |
| Run page and run inspector                   | `pnpm quality-loop-ui:serve`, then http://localhost:4201 and /inspect                                           |
| govcon                                       | `pnpm govcon:start`: web app http://localhost:4202, service port 3004                                           |
| Notifications bus and Telegram bots          | `pnpm notifications:serve`, then http://localhost:3005/health                                                   |
| Application record                           | `pnpm job-application:serve` (port 3006)                                                                        |
| Job applications in Chrome                   | `pnpm browser-session run …` (full command in the RUNBOOK)                                                      |
| Agentic memory service                       | `pnpm agentic-system:serve`, then http://localhost:3007/health                                                  |
| Gmail tools                                  | `pnpm gmail:serve`, then http://localhost:3008/tools                                                            |
| Google Calendar tools                        | `pnpm google-calendar:serve`, then http://localhost:3009/tools                                                  |
| Your documents into memory                   | `pnpm memory-ingest ingest <file> --subject "<name>"` (into a memory space instead: `MEMORY_INGEST_SINK=space`) |
| A memory space, read back                    | `pnpm memory-ingest recall`, `history` or `forget`, with `--space <name> --tenant <tenant>`                     |
| Recorded form pages replayed against a space | `pnpm browser-session replay-fields --sessions static/sessions --tenant <tenant>`                               |
| PostgreSQL and Qdrant only                   | `pnpm stack:db` (localhost:5433 and http://localhost:6333)                                                      |
| Storybook catalog                            | `pnpm exec nx run storybook:storybook`, then http://localhost:6006                                              |
| Enfav website                                | https://enfav.com live; `pnpm website:serve` for http://localhost:4203                                          |

## By the numbers

| What                                                | Count                                                        |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Commits                                             | 845 since 27 Aug 2026, plus one uncommitted landing (27 Oct) |
| Packages                                            | 35                                                           |
| Pipelines and orchestrators                         | 16 and 9                                                     |
| Quality-loop runs recorded                          | 3,139 (6 Sep–18 Oct 2026), 1,940 ended in "accept"           |
| …of them browser steps                              | 2,024                                                        |
| Job applications submitted                          | at least 77 (10–16 Oct 2026)                                 |
| Companies in the application record                 | 83 (end of 16 Oct 2026)                                      |
| Memories in the engine's store                      | 1,282 (15 Oct 2026)                                          |
| Memories in the job assistant's space (test tenant) | 163 (28 Oct 2026, 01:40 UTC)                                 |
| Studio building blocks                              | 41, in 11 groups                                             |
| Practice prompts in the library                     | 26                                                           |
| Database tables and migrations                      | 40 and 88                                                    |
| Telegram bots                                       | 5                                                            |
| Gmail and Calendar tools                            | 10 and 9                                                     |
| Tests: engine suite, repo guards, Studio browser    | 760, 668 and 45 (19 Oct 2026); memory client 33 (27 Oct)     |
| enfav.com production checks at launch               | 145 of 145 passed (14 Oct 2026)                              |

## Words you'll see

| Word                  | What it means                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality loop          | The shared AI engine: one AI drafts, other AIs check, and plain code decides.                                                                                                                                    |
| Pipeline              | A recipe written as data: what to produce, who judges it and the scoring rules. There are 16.                                                                                                                    |
| Orchestrator          | A fixed chain of pipeline runs, such as recall, then run, then digest, then store. There are 9.                                                                                                                  |
| Run                   | One trip through a pipeline, from goal to decision, saved with every prompt and reply.                                                                                                                           |
| Round (iteration)     | One draft, judge and decide pass inside a run. "Revise" or "retry" starts another, up to a set limit.                                                                                                            |
| Producer              | The AI "writer" that drafts the thing being judged.                                                                                                                                                              |
| Critic                | An AI reviewer that only hunts for defects, each picked from a fixed list of defect types.                                                                                                                       |
| Evaluator             | An AI grader that marks each checklist item pass, partial or fail.                                                                                                                                               |
| Controller            | Plain code, never AI, that turns the evidence into a score and a decision by fixed rules.                                                                                                                        |
| Checklist (criteria)  | The items c1, c2 … drawn from the goal before judging starts, so every reviewer grades the same list.                                                                                                            |
| Lesson and fact       | A lesson is advice learned from a graded run. A fact is something true about you, from your documents or answers.                                                                                                |
| Your record           | All the facts stored about you. Job forms are filled from it, and each answer you give is added to it.                                                                                                           |
| Application record    | A separate list of the companies you have applied to (port 3006). It stops a second application to the same company within 90 days.                                                                              |
| Digest                | An AI run that boils something finished (a run, a document chunk, an answer) into a few short memories, each checked before it is stored. govcon's daily Telegram "digest" is different: just a summary message. |
| Recall                | Searching memory for what fits a new task.                                                                                                                                                                       |
| Vector store (Qdrant) | The database that keeps each memory as a list of numbers (an embedding), so it can find texts with a similar meaning, not just the same words.                                                                   |
| Memory space          | A live memory service made from one memory plan. It saves, finds, updates and forgets memories. Since 27 Oct 2026 a program can ask for one by name, such as `job-assistant`.                                    |
| Tenant and unit       | Inside a space, the tenant is whose memories they are (every request names one), and a unit is one piece of work, such as one employer's posting, that an answer may be kept for alone.                          |
| Brain (job assistant) | Which decision-maker a job-application session uses, chosen in its settings: `loop` (today) or `memory` (reads the `job-assistant` space, then has the loop judge).                                              |
| Register              | One labelled store for one kind of memory in a plan: working (the task in hand), episodic (what happened), semantic (facts), procedural (how-to) or relational (how things connect).                             |
| Migration             | A numbered, hand-written change to the database's structure. Applying them in order makes every copy identical.                                                                                                  |
| Port                  | The number after `localhost:` in an address. Each service listens on its own, such as 3003 for the quality loop.                                                                                                 |
| Telegram bot          | A chat account a service uses to message you on Telegram. There is one per purpose.                                                                                                                              |
| Event bus             | A shared message board where services post what happened and others read it in order.                                                                                                                            |

## Where to read more

- **Start here:** [the README](../README.md) and [the RUNBOOK](../RUNBOOK.md), for starting and running everything.
- **The Studio:** [the practice workspace: tabs and how grading works](practice-workspace.md).
- **The engine:** [the pipelines](pipelines/overview.md), [the orchestrators](quality-loop/orchestrators.md), [how the reviewers argue](quality-loop/lens-debate.md) and [the engine, folder by folder](quality-loop/reference.md).
- **The engine's memory:** [how a run becomes lessons](quality-loop/memory-digest-and-recall.md), [memory runs and what they showed](pipelines/memory-runs.md) and [how the system learns facts about you](study-guides/memory-applications-experience.md).
- **Agentic memory:** [what's built and how it works](agentic-system/overview.md), then [the memory designer](agentic-system/memory-design-capability.md), [the memory runtime](agentic-system/memory-runtime.md), [the service's README](../packages/agentic-system/README.md), [the job assistant's memory plan](agentic-system/strategies/job-assistant/README.md) and [the document ingester](../packages/memory-ingest/README.md).
- **Job applications:** [the application record](job-application/overview.md), [the browser session](pipelines/browser-session.md) and [the browser-session README](../packages/browser-session/README.md).
- **Phone and Google tools:** [tool sessions](pipelines/tool-session.md), [the notifications bus](../packages/notifications/README.md), [Gmail](../packages/gmail/README.md) and [Google Calendar](../packages/google-calendar/README.md).
- **govcon:** [overview](govcon/overview.md), [spending research](govcon/spending.md) and [Enfav's federal demand and prospects](govcon/enfav-prospects.md).
- **The website:** [building, deploying and running enfav.com](enfav/website.md).
- **Known issues:** [the issues index](issues/README.md) (a few entries are out of date).
