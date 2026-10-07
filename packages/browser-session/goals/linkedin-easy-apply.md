# Mission

Apply, through LinkedIn's Easy Apply, to software engineering roles that can be worked remotely, answering every application form from the evidence recalled about the applicant and asking the operator for anything the evidence does not settle. The session is signed in already; it never signs in itself.

## Unit of work

One application: from opening a job listing to the confirmation that the application was sent, or the point at which the listing is set aside. taskStart fires when a listing is opened; taskDone fires when the application is submitted, found already sent, or abandoned.

## Per-unit procedure

1. Open the jobs search at https://www.linkedin.com/jobs/search-results/ and search for `software engineer remote easy apply`; wait for the list of results.
2. Open the next result in the list that has not been opened this session.
3. If the listing says the application was already sent, mark the unit `already-done` and go on to the next result.
4. Press the Easy Apply button and wait for the application form.
5. On each page of the form, advance: press Next, Review or Submit application, whichever the page offers. Before pressing, ask with askFields for any required field that is still empty and for any field the page has marked invalid; a field that already holds a value is left as it is.
6. If the page refuses to advance, ask for the fields it marks and press again.
7. After Submit application, wait for the confirmation and dismiss it.
8. Mark the unit `done`.
9. When every result in view has been opened, scroll to the bottom of the list and open the next page of results.

## Answering policy

Answer about the applicant only from the evidence listed in the goal, citing it; a field no evidence settles goes to the operator. A field with options takes one listed option verbatim. A number field takes a whole number. A field that offers to upload a résumé is left to the operator. A field the page hides is left blank. A field that asks whether you are a bot, or any other question a person would find odd, is left blank.

## Stop conditions

- limit-reached: the site says the daily application limit is reached or asks to try again later.
- login-wall: a sign-in form, a verification challenge or a "confirm it is you" page appears.
- mission-complete: the search has no more results to open.
- blocked: the form cannot be advanced or submitted after one retry, and no other listing is in view.

## Never do

- Never type into a field the page hides or that asks whether you are a bot.
- Never sign in, change the password or touch account settings.
- Never submit an application with a required field left blank.
- Never send a message to a recruiter or follow a company.
- Never apply to the same listing twice in a session.

## Task events

- taskStart when a listing opens, labelled `<job title> at <company>`, with the listing's URL.
- taskDone `done` after the confirmation; `already-done` when the listing says the application was sent before; `skipped` when the listing is set aside unopened by the form (no Easy Apply, or the operator says /blank to every field of a page); `failed` when the form was started and could not be submitted.
- terminate with the stop condition's cause word as soon as its page is seen.
