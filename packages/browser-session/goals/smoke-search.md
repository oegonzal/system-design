# Mission

Run one web search on a public site and confirm that results appear. This is a smoke test of the session itself: it proves that the browser opens, that pages are observed, that a plan is decided and carried out, and that the session ends by its own stop condition. No form is answered.

## Unit of work

One search: from the search box to a page of results. taskStart fires when the search box is in view; taskDone fires when the results are visible.

## Per-unit procedure

1. Open https://duckduckgo.com.
2. Type `playwright aria snapshot` into the search box and submit the search with Enter.
3. Wait for a results page that lists links.
4. Mark the unit done with the outcome `done`.

## Answering policy

Fill no field but the search box: any other field, visible or hidden, is left alone, and a form that asks about a person routes every field to the operator.

## Stop conditions

- mission-complete: the results page is visible and the unit of work is closed.
- login-wall: the site demands a sign-in before searching.
- limit-reached: the site refuses the search as automated or rate-limited.
- blocked: the search box cannot be found after one page load and one scroll.

## Never do

- Never type into a field the page hides or that asks whether you are a bot.
- Never open a result link.
- Never fill a field other than the search box.

## Task events

- taskStart when the search box is listed, labelled `Search: playwright aria snapshot`.
- taskDone with `done` when results are listed; `failed` when the search was submitted and no results came.
- terminate `mission-complete` on the step after the unit is done.
