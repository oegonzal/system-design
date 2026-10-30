# Mission

Apply to software engineering roles that can be worked remotely, from Built In's job list: one application per listing, every form answered from the evidence recalled about the applicant, and the operator asked for anything the evidence does not settle. A listing is taken whether Built In's own form takes the application or the employer's form on its own site does; a company applied to before, here or on another site that keeps the same record, is passed over. The session is signed in to Built In already and never signs in or creates an account anywhere. A job opens in a tab of its own and an employer's form in another: the session follows the newest tab, and when a unit closes it closes every tab the unit opened, so the list is in front again.

## Unit of work

One application: from opening a listing's card to the confirmation that the application was sent, or the point at which the listing is set aside. Its label is the job title and the company as the job page names them.

## Unit identity

- company: the company as the job page names it, in the link above the title.

## Unit context

- landmark: main

## Advisors

- job-application

## Documents

- resume: the applicant's résumé, a PDF

## Taking a unit on record

- avoid unless "Go to Next Page": a company on record to avoid is taken only when no next page of results is listed — its taskStart declares `onRecordTaken: true`.

## The listing page

- The list is https://builtin.com/jobs/remote/hybrid?search=Software+Engineering&city=Los+Angeles&state=California&country=USA&allLocations=true, 25 cards to a page; the pages after it add `&page=2`, `&page=3` … and are listed below the cards as links "Go to page 1", "Go to Page 2", "Go to Page 3" …, beside the link "Go to Next Page" — an arrow with no text, listed on every page but the last.
- Each card holds a link naming the company, a link naming the job title — it opens the job page in a new tab — "Yesterday", "N Days Ago" or "Reposted …", "Remote" or "Remote or Hybrid", the places, pay and level, and sometimes a badge "Easy Apply": Built In's own form takes those, the rest apply on the employer's site. The company link, a heart that saves and a chevron that expands the card are never clicked. No card marks a job applied to before: the record under Units of work is the only guard.
- A cookie dialog in front of a page, on Built In or on an employer's site, is dismissed by its declining control — "Reject", "I do not accept", "Decline" — never by "Manage" or "Settings".

## The job page

- Its address has /job/<slug>/<id>. A breadcrumb "<Company> > Jobs > <Title>" and a link naming the company sit above the title — links that open tabs of their own, never clicked; below are "Posted …", the place, pay and level, "The Role" — the description, under the main landmark — and a panel "Am I A Good Fit?".
- A bar fixed at the bottom offers how to apply, beside "Save", which is never clicked. For a job applied to on the employer's site, a link "Apply to job" whose address in the Snapshot carries `?handler=ApplyRedirect` opens the employer's own form in a new tab on another domain; a link of the same name whose address is /auth/login is the signed-out control and is never clicked. Clicking the link may first show, in this same page, Built In's own contact form — First Name, Last Name, Email, a résumé file control and a button "Continue", also named "Apply to job" — which step 4 answers before the employer's form opens. For an Easy Apply job, a link "Easy Apply to job" opens Built In's own form on a page of its own, in a new tab — its address has /apply/job/ — with the contact fields filled from the profile, required selects named only by a placeholder, each carrying its question as its context, a résumé control "Upload Resume" listed whether or not the page shows it, and the button "Submit Application". A page offering neither — the listing closed, or no apply control — is set aside. Once "Apply to job" is clicked, Built In may ask in a dialog on the job page whether you applied — "Yes, I applied", "Maybe later": nothing in it is clicked or answered, and the employer's tab, which opens on its own, is what the next step observes.

## The application form

- An employer's form is one page or a few: contact fields, a résumé file control — listed whether or not the page shows it, often behind a button "Attach" or "Upload", beside buttons "Dropbox", "Google Drive" or "Enter manually" that are never clicked — questions, equal-opportunity selects, consent checkboxes, and one button that sends it — "Submit application", "Submit" or "Apply". The page after it confirms: "Thank you for applying", "Your application has been submitted", or words to that effect. Before it, a form may ask for a code it emailed to the applicant — "We have emailed you a code to verify your identity", a code field and a button "Verify": the code is a field for the operator, who has the email, and "Verify" is clicked once it is answered. A page listing only its banner — "Sign In", a logo, a search — has not rendered yet: wait, once, for its first field, its apply control or its sign-in.
- A required question is marked "*", or named by the page after a refused advance.
- A form that demands an account before its fields — "Create Account" or "Sign In" where the fields should be — is an account wall.
- Built In's own form is one page. Its résumé control takes the document resume by upload even when the page names a résumé attached from the profile — the application carries the résumé supplied to the run, never the profile's copy — and "Submit Application" sends it.

## Per-unit procedure

1. The list. When the page is not the list — the browser opened elsewhere, or this tab shows a job page left by step 3 — navigate to the list's address, with `&page=N` when the page the card was taken from is known, and wait for the cards. The list is paged, never searched.
2. Judge the page, then choose. A page is fresh when at least three of every five cards in view are at a company not listed under Units of work — neither a unit of this session nor on record; on a page that is not fresh, page forward by step 9 before opening any card, and say in the assessment the count that decided it. A card is taken only on a fresh page, or on the last page — no "Go to Next Page" listed — whatever its share. On the page taken, open the first card, top down, badge or none, that is not the title and company of a unit listed under Units of work, nor at the company of a unit closed this session or of a company on record to avoid or as forbidden: click its title link — the plan's last action: the job page opens in a new tab — and say in the assessment which card and why. When every card in view that would otherwise qualify is at such a company, page forward by step 9; only when no next page is listed may a card at a company on record to avoid be taken, its taskStart declaring `onRecordTaken: true`.
3. Open the unit. On the step after the click, with the job page in front: taskStart, then, in the same plan, by what the page offers — the link "Apply to job" to the employer's site: click it, the plan's last action; the employer's form opens in a new tab, or Built In's contact form shows first and is answered by step 4. The link "Easy Apply to job": click it, the plan's last action; Built In's own form opens in a new tab and step 4 answers it on the next step. Neither: taskDone `skipped`. A job page whose company is listed under Units of work as forbidden gets no taskStart, and a taskStart the session refused — the company is on record; the refusal is listed under Objections to answer — opens no unit: in either case navigate this tab to the list's address, with `&page=N` for the page the card was taken from, and go on by step 2 — the next unit's close removes this tab, and the list behind it is in front again at the page it was left on.
4. Each form page. One askFields for every required field still empty and every field marked invalid — never fill a fact about the applicant yourself; a field holding a value is kept. A résumé file control holding no file — listed whether or not the page shows it — takes the document `resume` by upload, and is never filled, clicked or asked for. A required consent — a checkbox, or a select whose option is "I agree" — agreeing to the terms, the privacy notice or the processing of the applicant's data — is not asked: click the box to tick it, select the option. Then, in the same plan, click the page's advance button — "Continue", "Next", "Submit application", "Submit" or "Apply" — as its last action. A button is clicked; no key is pressed for it.
5. Account wall. A form that demands an account or a sign-in before its fields: taskDone `skipped` at once.
6. Refused. If the page will not advance, ask for the fields it marks and click its advance button once more. Refused again: taskDone `failed`. A required document other than the résumé — a cover letter or another file, with no field to type into — is never uploaded and is not a field to ask for: on the page that requires it, taskDone `failed` at once.
7. Confirmation. On the page right after this unit's sending button ran, when it says the application was sent: taskDone `done`. When that page says instead that the application is being sent — "Submitting", "Please wait" — the plan waits for the words that confirm it and ends there, with `done`: the taskDone comes on the next step, from the page as observed, never in the same plan as a wait.
8. After a close. The session closes every tab this unit opened; the next step observes the list at the page it was left on, and the next card is chosen by step 2.
9. Next page. When the page is not fresh by step 2, or when no card in view qualifies — each is a unit listed under Units of work or at a company on record — scroll down to the links below the cards and click "Go to Next Page". With no next page listed, a card at a company on record to avoid qualifies again by step 2, its taskStart declaring `onRecordTaken: true`; with none of those either, the list has no more results.

## Answering policy

Answer about the applicant only from the evidence listed in the goal, citing it; a field no evidence settles goes to the operator. A field that already holds a value — contact details the site filled in, a résumé already attached on an employer's form — is kept, unless the page refused it. A field with options takes one listed option verbatim. A number field, and any question asking how many, takes a bare whole number. A required consent — to the terms, the privacy notice or the processing of the applicant's data — is agreed to: a box ticked, a yes-or-no answered "Yes". The résumé is the one file ever uploaded, as the document resume into a file control by the procedure, never typed; a required upload of any other file is set aside by the procedure's refused-page step. A field the page hides is left blank; a file control is the procedure's to upload into, shown or not. A field that asks whether you are a bot, or any other question a person would find odd, is left blank; a code the site emailed to the applicant to verify their identity is no such question: it goes to the operator, who has the email, and is never left blank. An answer the operator gave before to a question about the applicant — work authorization, sponsorship, years with a skill, an account of past work — is evidence for the same question on every application however it is worded, and the latest answer stands; a question about the employer applied to — whether you work or worked for it, know anyone at it, consent to what it asks, would relocate for it — is settled by the standing answers on record and the record of employers, never by an answer given about another employer; a figure — years with a skill, a count — is computed only from dates and figures on record, never from a skill named without them. A question asking how you heard about the opening, the role or the company is answered "Built In" where that option is offered, else the option naming a job board or job site: every opening here is found on Built In. A threshold — at least N years, more than N, N+ — is answered from the figure or span on record for that very skill or category, yes where it meets it and no where it falls short; the dated roles on record that used it, summed, show at least that many years — enough for a yes they meet, never a figure or a no. A free-text answer about the applicant's experience is written as the applicant would write it to a hiring team: concrete with the systems, technologies, scale and figures on record, as long as the question deserves and the field allows — two to four short paragraphs for an account, one for a yes-or-no with its reason — never padded and never generic, showing fit through what the record holds and never asserting what the role needs. An employment-history section that names no employer lists the positions on record most recent first, each later section the next, every field of a section from its one position; a section that cannot describe a position still held — one asking a reason for leaving, or an end date it gives no way to leave open or mark current — passes over a position still held, and a position the record says is still held is marked current where the section allows.

## Suggesting policy

Where the record answers a question, lead with record suggestions. Where it is silent on a question about the applicant's experience, offer a transferable draft when adjacent work is recorded, and an invented draft modelled on the applicant's past. A fact the record lacks — a name, a date, a figure, an employer, a contact — gets no invented draft. A recorded boundary against filling gaps in the record binds record and transferable suggestions and every value given without the operator; it does not withhold an invented draft, which is offered for the operator to accept or refuse. A boundary against a particular claim — work authorization, a credential, a present employer — binds every suggestion. A draft is written as the applicant would write it to a hiring team: concrete with the systems, technologies, scale and figures on record, drawing on the stories on record whole and in the first person, as long as the question deserves and the field allows — two to four short paragraphs for an account of experience — never padded and never generic, showing fit through what the record holds and never asserting what the role needs.

## Stop conditions

- login-wall (stopped) "Create Free Account": Built In's "Sign up now" dialog, with "Create Free Account" and "Log In": the session has been signed out. An employer's account wall is no stop — step 5 sets it aside.
- blocked (stopped) "Verify you are human": a bot check standing where the page should be; it is never answered.
- mission-complete (complete): no "Go to Next Page" link is listed and no card in view qualifies.

## Never do

- Never type into a field the page hides or that asks whether you are a bot.
- Never sign in or create an account, on Built In or on an employer's site; never change the password, the profile or account settings.
- Never click a button that sends an application with a required field left blank or with no unit of work open.
- Never upload any file but the document resume, and never into anything but a file control.
- Never click "Save", a card's heart or a company's link, and never follow, share or message; never close or switch a tab, and never navigate a tab while a unit of work is open.

## Task events

- taskStart on the step after a card's title link is clicked, when the job page is in front, labelled "<job title> at <company>", with the page's URL and the fact "company" as the link above the title names the company. A card passed over unopened is no unit: no taskStart, no taskDone; nor is a job page step 3 leaves — at a forbidden company, or after a taskStart the session refused.
- taskDone `done` once this unit's sending button ran and the page says the application was sent; `skipped` when the job page is set aside before any field is answered — no apply control, the listing closed, an account wall; `failed` when a form was started and could not be sent after one retry, or requires a document other than the résumé; never `already-done` — a company applied to before is on record and passed over unopened. A taskDone is the plan's last action: the session then closes the tabs the unit opened, and the next step observes the list.
- terminate with the stop condition's cause word as soon as its page is seen; for a cause the Stop conditions tie to words, only on a page that shows those words.
