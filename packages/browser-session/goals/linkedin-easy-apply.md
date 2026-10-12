# Mission

Apply, through LinkedIn's Easy Apply, to software engineering roles that can be worked remotely: one application per listing, every form answered from the evidence recalled about the applicant, and the operator asked for anything the evidence does not settle. The session is signed in already; it never signs in itself. Stay focused only on job items that have an "Easy Apply" option. Skip ones that do not, or that have already been applied to - this list item will have an "Applied" indication text on it to indicate it has been applied. If there are no more options on the list that can be applied to then go to the next page in the paginated list of https://www.linkedin.com/jobs/search-results/?{queryParams} - Do not redirect out of this page, it will never be necessary since "Easy Apply" items will open a modal dialogue in-page. Redirecting out of the page will cause the task to exit from the correct application setup and if you do exit then go back to the route https://www.linkedin.com/jobs/search-results/?{queryParams}. On the results page you should click the first card isn't in "Applied" status and is "Easy Apply" to prevent viewing cards that will not be applied to.

## Unit of work

One application: from opening a listing's card to the confirmation that the application was sent, or the point at which the listing is set aside. Its label is the job title and the company as the listing names them.

## Marks

- "Applied ·": applied to before — the card is passed over, unopened, with no unit. A mark is a word on a card, never a stop condition.

## Unit identity

- company: the company as the listing's pane names it, beside the title.

## Advisors

- job-application

## The results page

- The search box is the textbox "Describe the job you want"; it shows the query the results are for. The banner's "I’m looking for..." box is a different control and stays empty. Before any search the page lists suggested searches as links — "Remote senior software engineer easy apply", "Internships tackling climate issues" and the like — which are other searches, not job cards.
- The results are a list of about 25 cards to a page. Each card is one button whose name is the card's whole text — job title, company, place, sometimes pay and badges, "Posted …" — ending in "Easy Apply" when the listing takes an Easy Apply application. A card applied to before carries "Applied ·" just before "Posted". Each card also holds a "Dismiss <job title> job" control, which hides the listing.
- Clicking a card shows its listing in the pane beside the list: the title, the company, and how to apply — a button "Easy Apply" (its visible text reads "Easy Apply"); or, for a listing applied to before, a heading "Application status" over "Application submitted" and its age; or a link "Apply on company website"; or the words "No longer accepting applications".
- Below the list, buttons "Page 1", "Page 2", … and "Next" page through the results, out of view until the list is scrolled down. The application form's advance button is also named "Next"; that one is inside the dialog.

## The application form

- "Easy Apply" opens the listing's own page (its address has /jobs/view/) with a dialog over it headed "Apply to <Company>", a progress bar and the page count ("1/6"). While the dialog is open the page behind it cannot be reached and the unit is in progress: the Easy Apply button is behind the dialog.
- Each page of the form ends in one button that advances it — "Next", then "Review", then "Submit application" on the last; "Back" returns a page and "Dismiss" closes the dialog.
- Contact info comes filled in — first and last name, email address, phone country code; "Mobile phone number" may be empty. The résumés uploaded before are radio buttons with one selected, beside an "Upload resume" button.
- A question the form requires is marked "*", or shows "This field is required" under it after a refused advance. Some forms ask, as a "Yes"/"No" radio question, whether the applicant agrees to the site's additional job application terms.
- The last page may show a ticked checkbox "Follow <Company> to stay up to date with their page" beside "Submit application"; some forms have none.
- After "Submit application" a dialog headed "Next best action" says "Your application was sent to <Company>!", with "Not now", "Update profile" and "Dismiss". It does not block the page, and the pane beside it then shows "Application status" over "Application submitted" and how long ago ("now"). The dialog is dismissed with "Not now" (or "Dismiss"), never "Update profile"; then the list is where the next job not yet applied to is found.
- "Dismiss" before submitting asks "Save this application?" with "Discard" and "Save".

## Per-unit procedure

1. Search. When the page is not the results of `easy apply software engineer remote` — the bare search page, another query's results, or a listing's own page after its unit closed — navigate to https://www.linkedin.com/jobs/search-results/?keywords=easy%20apply%20software%20engineer%20remote and wait for the list; if the textbox "Describe the job you want" then does not hold the query, fill it with exactly that text and press Enter. Suggested searches are never clicked. Once the list is the query's, it is paged, never searched again.
2. Choose. Open the first card, top down, whose name ends in "Easy Apply", that is not marked "Applied ·", that is not the title and company of a unit listed under Units of work, and that is not at the company of the open unit, of a unit closed this session, or of a company listed under Units of work as on record to avoid: click it, and say in the assessment which card and why. When every card in view that would otherwise qualify is at such a company, page forward by step 8; only when no next page is listed may a card at a company on record to avoid be taken. A card whose name does not end in "Easy Apply" is passed over unopened, with no unit; a card's "Dismiss … job" control is never clicked. A card whose listing the pane already shows is not clicked again — go on to step 3.
3. Open the unit. On the step after the click, with the listing in the pane and no dialog open: taskStart, then, in the same plan, by what the pane offers — "Easy Apply": click it; "Application status": taskDone `already-done`; only "Apply on company website" or "No longer accepting applications": taskDone `skipped`. After either close, the next card by step 2. A listing whose company is listed under Units of work as on record as forbidden — in progress in another session — is set aside without a unit: no taskStart, and the next card by step 2.
4. Each form page. One askFields for every required field still empty and every field marked invalid — never fill a fact about the applicant yourself; a field holding a value is left as it is, and so is the selected résumé; "Upload resume" is never clicked. A question asking to agree to the site's additional job application terms is not asked: click the radio that reads "Yes". A required consent checkbox — agreeing to terms or to the processing of the applicant's data — is not asked either: click it to tick it. Then, in the same plan, click the page's advance button — "Next", "Review" or "Submit application". A button is clicked; no key is pressed for it.
5. Submit. On the page with "Submit application": untick "Follow <Company> to stay up to date with their page" when it is ticked, then click "Submit application".
6. Refused. If the page will not advance, ask for the fields it marks and click its advance button once more. Refused again: taskDone `failed`, click "Dismiss", then "Discard", and return to the list by step 1.
7. Confirmation. On the page right after this unit's "Submit application" ran — the dialog saying "Your application was sent to <Company>!", or the pane's "Application submitted": taskDone `done`, then click "Not now", and the next card by step 2.
8. Next page. When no card in view qualifies — each is marked "Applied ·", lacks "Easy Apply", is a unit listed under Units of work, or is at a company on record to avoid — scroll down to the buttons below the list and click "Next". With no next page listed, a card at a company on record to avoid qualifies again by step 2; with none of those either, the search has no more results.

## Answering policy

Answer about the applicant only from the evidence listed in the goal, citing it; a field no evidence settles goes to the operator. A field that already holds a value — the contact details, the selected résumé — is kept. A field with options takes one listed option verbatim. A number field takes a whole number. A question asking to agree to the site's additional job application terms is answered "Yes". A résumé is never uploaded; a field that only offers an upload goes to the operator. A field the page hides is left blank. A field that asks whether you are a bot, or any other question a person would find odd, is left blank. An answer the operator gave before to a question about the applicant — work authorization, sponsorship, years with a skill, an account of past work — is evidence for the same question on every application however it is worded, and the latest answer stands; a question about one employer — whether you work for it, whether it may contact you — takes only that employer's answer, and a question asking a different figure, skill or period takes none.

## Suggesting policy

Where the record answers a question, lead with record suggestions. Where it is silent on a question about the applicant's experience, offer a transferable draft when adjacent work is recorded, and an invented draft modelled on the applicant's past. A fact the record lacks — a name, a date, a figure, an employer, a contact — gets no invented draft. A recorded boundary against filling gaps in the record binds record and transferable suggestions and every value given without the operator; it does not withhold an invented draft, which is offered for the operator to accept or refuse. A boundary against a particular claim — work authorization, a credential, a present employer — binds every suggestion.

## Stop conditions

- limit-reached (complete) "limit daily submissions": the site says it limits daily submissions — today's Easy Apply applications are spent; a mark on a card is never a limit.
- limit-reached (complete) "daily limit": the site says a daily limit is reached.
- limit-reached (complete) "application limit": the site says an application limit is reached.
- login-wall (stopped) "Sign in": a sign-in form, a verification challenge or a "confirm it is you" page appears.
- mission-complete (complete): no next page of results is listed and no card in view qualifies.

## Never do

- Never type into a field the page hides or that asks whether you are a bot.
- Never sign in, change the password, update the profile or touch account settings.
- Never click "Submit application" with a required field left blank or with no unit of work open.
- Never send a message to a recruiter, and never follow a company: the "Follow <Company>" box is unticked before "Submit application".
- Never apply to the same listing twice in a session.

## Task events

- taskStart on the step after a card is clicked, when the pane shows the listing, labelled "<job title> at <company>", with the page's URL and the fact "company" as the pane names the company beside the title. A card passed over unopened is no unit: no taskStart, no taskDone.
- taskDone `done` once this unit's "Submit application" ran and the page says the application was sent — the dialog, or the pane's "Application submitted" — never `already-done` for it; `already-done` only for a listing whose pane showed "Application status" when it was first opened; `skipped` when the opened listing is set aside before the form — no Easy Apply button, or the operator says /blank to every field of a page; `failed` when the form was started and could not be submitted after one retry.
- terminate with the stop condition's cause word as soon as its page is seen; for a cause the Stop conditions tie to words, only on a page that shows those words.
