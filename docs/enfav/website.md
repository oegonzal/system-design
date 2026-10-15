# enfav.com — building, deploying and operating the Enfav LLC site

`packages/website` is the public site of Enfav LLC at enfav.com: the pages a contracting officer, a
prime contractor or a commercial buyer reads to check the company — home, services, government (the
capability statement), about, contact and a 404 — with a sitemap and robots.txt. This runbook covers
how the site is built and served, how its company facts are kept honest, the one-time setup of the
domain, Cloudflare and GitHub, how a deploy runs, and how to roll back and validate production. The
everyday commands are also in the [package README](../../packages/website/README.md).

## What it is and how it fits

Astro prerenders every page to a static file in `packages/website/dist/`: `<page>/index.html` for
each route, `404.html`, `sitemap-index.xml`, `robots.txt`, the hashed CSS and images under
`/_astro/`, and `_headers`. There is no adapter, so nothing can render on request — a route that
tried would fail the build — and there is no server, no database and no client JavaScript.

`wrangler deploy` uploads `dist/` as a new version of the Worker `enfav-website` (only new or
changed files travel) and puts it live in the same step. The Worker has no script: Workers Static
Assets serves the matching file, applying the routing `wrangler.jsonc` declares and the headers
`_headers` declares, and no Worker code ever runs. Requests for static files are free and unlimited.

`packages/website/wrangler.jsonc` is the deployment's source of truth; its comments explain each
key.

| Key                                            | What it declares, and why                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`                                         | `enfav-website`, the Worker every deploy and rollback acts on.                                                                                                                                                                                                                                                                 |
| `compatibility_date`                           | `2026-10-06`, the date of the workerd runtime (1.20261006.1) bundled with the pinned wrangler, exactly 4.149.0. A date later than the bundled runtime can stop `wrangler dev`, so the two change together.                                                                                                                     |
| `assets`                                       | `directory: ./dist`, resolved from the config file's folder. `html_handling: auto-trailing-slash`: `/about` answers 307 to `/about/`, the URL Astro's `trailingSlash: 'always'` makes canonical, so every link and sitemap entry answers 200. `not_found_handling: 404-page`: an unknown path gets `404.html` with status 404. |
| `routes`                                       | `[{ "pattern": "enfav.com", "custom_domain": true }]`. On deploy, Cloudflare creates the apex's DNS record and certificate. Custom domains match exact hosts, so www is zone configuration (setup step 6).                                                                                                                     |
| `workers_dev`, `preview_urls`                  | `false`: no public `*.workers.dev` copy. Unset, both follow the routes, so removing the custom domain would quietly publish one.                                                                                                                                                                                               |
| `send_metrics`, `dependencies_instrumentation` | `false` and `{ enabled: false }`: wrangler sends no usage telemetry, and no list of the project's dependencies with each deploy.                                                                                                                                                                                               |
| `dev`                                          | Port 4204 on 127.0.0.1, for `pnpm website:preview`.                                                                                                                                                                                                                                                                            |

Absent on purpose: `main` (there is no script), `assets.binding` (useful only with one) and
`account_id`. A committed account ID would outrank `CLOUDFLARE_ACCOUNT_ID`, so the account comes
from your login locally and from that secret in CI. Every deploy re-applies the custom domains in
this file, so declare domains here and nowhere else: one attached in the dashboard is likely
detached by the next deploy (read from wrangler's source, not tested).

`public/_headers` is copied to `dist/_headers`; wrangler sends it with the upload as rules and never
serves it as a file. It puts the security headers — a Content-Security-Policy that admits the site's
own files and nothing else, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`X-Frame-Options` and `Cross-Origin-Opener-Policy` — on every response, the 404 page and the
trailing-slash 307s included. Nothing is inlined (`build.inlineStylesheets: 'never'`,
`vite.build.assetsInlineLimit: 0`), so the CSP needs no hashes, and the home page's JSON-LD is a
data block the CSP does not govern. Pages keep the platform's default
`Cache-Control: public, max-age=0, must-revalidate`, so browsers revalidate them on every visit and
a deploy shows at once; only the hashed `/_astro/*` files, whose names change with their content,
get `public, max-age=31536000, immutable`, in a rule of their own (matching rules comma-join their
values). HSTS is deliberately absent: it is a zone setting, enabled last (setup step 9), and never
set in two places.

The production origin is one declaration, `SITE.origin` in `src/data/site.ts`. The pages and
robots.txt build their absolute URLs from it (canonical URLs, `og:url` and `og:image`, the JSON-LD);
`astro.config.ts` makes it Astro's `site`, which the sitemap integration reads; the deploy workflow
reads it too (its environment URL and its production checks); and `src/data/site.spec.ts` fails if
its host is not the custom domain in `wrangler.jsonc`.

| What                                          | Where                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| Pages, layout, components, styles             | `packages/website/src/`                                                       |
| Company facts, services, founder              | `packages/website/src/data/`                                                  |
| Build output, trailing slashes, inlining      | `packages/website/astro.config.ts`                                            |
| Worker, routing, custom domain                | `packages/website/wrangler.jsonc`                                             |
| Security and cache headers                    | `packages/website/public/_headers`                                            |
| Deploys                                       | `.github/workflows/deploy-website.yml`                                        |
| Deploy credentials, the deploy switch         | GitHub: environment `production`, repository variable `WEBSITE_DEPLOYS`       |
| www redirect, HTTPS and TLS, HSTS, email, DNS | Cloudflare zone settings, not in the repository: this runbook is their record |

Workers rather than Pages is the owner's decision; it keeps the whole deployment — files, routing,
the custom domain — declared in `wrangler.jsonc` and deployed by this repository's own workflow. The
owner's earlier note, `docs/enfav/hosting.md`, recommended Cloudflare Pages, set up through the
dashboard's Git integration with both hostnames added as Pages custom domains; for hosting, this
runbook supersedes it. It was the first content brief; the content now follows the owner's two-page
federal capability statement (not in the repository), and the site publishes no separate
capability-statement PDF (see Content upkeep).

## Local development

Use Node 24, as `.nvmrc` pins and CI uses. Astro 7 needs Node 22.12 or later and refuses to start on
the Node 20 some shells still default to; with nvm, `nvm use` in the repository root reads `.nvmrc`.
Run everything from the repository root: dependencies live once in the root `package.json`, and
`pnpm exec` resolves them there.

```bash
pnpm website:serve                 # astro dev on http://localhost:4203, rebuilt on save
pnpm website:build                 # astro build → packages/website/dist
pnpm website:preview               # build, then wrangler dev over dist on http://127.0.0.1:4204
pnpm exec nx run website-e2e:e2e   # build, then Playwright + axe against its own preview on :4205
pnpm exec nx run-many -t lint typecheck test build -p website website-e2e   # the deploy's checks before its e2e
```

`serve` is for editing. It is Astro's development server: pages render on request and reload on
save, but Astro serves them its own way — `_headers` is not applied (so there is no CSP), and
trailing slashes and unknown paths are handled by Astro rather than by `wrangler.jsonc`. A page that
looks right under `serve` has not yet been seen the way production serves it. The Nx targets set
`ASTRO_TELEMETRY_DISABLED=1`, and `serve` also sets `ASTRO_DEV_BACKGROUND=0`, because Astro 7
otherwise detaches `astro dev` into the background when a coding agent starts it.

`preview` is production's serving on your machine. It serves the built `dist/` with `wrangler dev`,
which runs Cloudflare's asset handling locally on workerd and applies `html_handling`,
`not_found_handling` and `_headers` the way production does. It needs no Cloudflare login, and with
`CLOUDFLARE_CF_FETCH_ENABLED=false` and `send_metrics: false` it skips wrangler's `cf.json` fetch
and telemetry. What `preview` shows is what a deploy of the same build serves.

Locally, the e2e suite always tests a preview, never `serve`. Playwright starts its own on port 4205
with `reuseExistingServer: false`, so it tests the build it has just made rather than whatever
happens to be listening, and a preview you left running on 4204 does not collide with it. Its first
checks, which every other one waits for, are that the server answers with that build byte for byte,
both to a plain HTTP client and to a browser opening each page; then it runs every page in desktop
Chromium and at 320 × 640 px. Install the browser once with
`pnpm exec playwright install chromium` (CI adds `--with-deps`); a failed run leaves its report in
`dist/.playwright/packages/website-e2e/playwright-report`.

The ports are the site's own: `tooling/e2e-lane-ports.spec.ts` lists 4203 and 4204 among the dev
ports, the e2e's preview takes 4205, and Astro's default 4321 would sit inside the studio e2e lanes
(4300–4396).

## Content and company facts

Every fact the site states about the company lives in `packages/website/src/data/`: `company.ts`
(the company facts — the founder and the point of contact among them, with name and title each a
fact of its own — and `COMPANY_DETAILS`, the capability statement's contracting profile in reading
order), `founder.ts` (the founder's bio, prior employment and the founder-developed systems),
`services.ts` (the four service lines, the engagements and the applied technology, one list each
for every page that shows it) and `site.ts` (name, origin, the company summary, the primary action
and the closing call to action, navigation).

A company fact is a `Fact` (`src/lib/fact.ts`), declared with `verified(value)`, its value copied
verbatim from its source (the PSC titles' letter case aside, and the business size, which sums up
SAM.gov's per-code size column). A page renders one through `FactValue` (or `EmailLink`), inside
`data-fact="verified"`. A detail with several values — the NAICS and the PSC codes — is a list of
facts, one per value. Dates are ISO strings, formatted by `src/lib/dates.ts`; the address is
structured (`src/lib/address.ts`); a NAICS entry is data (its code, title, and whether it is the
primary code or a size-standard exception), so no page reads a fact's text to find something in it.

- Structured data writes a fact's value, never the fact. The home page's JSON-LD — an Organization
  (name, logo, email, founding date, postal address, founder) and its WebSite, built in
  `src/lib/structured-data.ts` — is covered by `src/lib/structured-data.spec.ts` with made-up facts
  (`SITE-4`). A graph carries a mark only that module writes, so one written by hand does not
  type-check and one cast to the type fails to serialize, and serializing fails the build on a fact
  anywhere in it: a fact carries a mark only `src/lib/fact.ts` writes, which a spread or
  `Object.assign` copy keeps. A copy of a built graph keeps its mark too, and a `structuredClone` or
  JSON copy of a fact drops its own, so neither mark proves what a shipped graph holds; the e2e
  reads every page's JSON-LD for that, and fails on a restricted claim in it.
- The bio in `founder.ts` is approved copy that restates the legal name, the founder's name and the
  year the company was organized, and the legal name also runs through `SITE` and the pages' copy,
  so changing any of those means rewording that copy; no check reads it. The about page's search
  description reads the founder's name and the year from the facts, and the capability statement's
  delivery evidence reads the year.
- A credential can only ever be a verified fact. The e2e fails any page that states a phrase from
  the restricted-claims list in `packages/website-e2e/src/support/claims.ts` — set-aside and size
  statuses, clearances, certifications, a GSA Schedule, awards, prime contracts — outside a verified
  fact (`data-fact="verified"`), on screen or in print: in the copy, in the title and metadata, in
  an `aria-label`, `alt` or `title` attribute, or in a JSON-LD value, which carries no verified-fact
  mark, so a credential there fails even as a verified fact. The list matches phrases, not meaning:
  a disclaimer that names a restricted phrase fails too, so the capability statement's own
  disclaimers are worded around them. It reads nothing else: not a shadow tree, CSS generated
  content, a form control's value or placeholder, another attribute or a frame. A word split by
  markup in content the medium does not render (a closed `<details>`, a hidden element) that runs
  into the text beside it across a block or a line break is not found either.

Certifications, contract vehicles and contract past performance have no fact at all: Enfav holds
none yet. The phone number on the owner's capability statement is not on the site.

**Changing a fact** is a change in `src/data/company.ts`, with the value copied verbatim from its
source: the registration details from the SAM.gov entity record, the organization date from the
state filing (see Content upkeep). Look at the result under `pnpm website:preview` (`/government/`)
and land it like any site change: the deploy's build job runs the specs and the e2e before anything
ships. Never fill the NAICS or PSC codes from `packages/govcon/src/profiles/enfav.ts`: that file is
the scope govcon searches for opportunities, not what Enfav is registered under.

**The founder** (`src/data/founder.ts`). Every claim cites, in a comment, the résumé entry it rests
on. Prior employment is listed newest first, one employer per entry with its role and dates, and
every list of it carries `FOUNDER.experienceNote`: the founder's own prior employment, evidence of
technical experience, not Enfav LLC contract past performance (`SITE-8`). The founder-developed
systems carry `FOUNDER.systemsNote` in the same way: continued at Enfav, not client work. The About
page gives each role in full; the capability statement's delivery evidence gives one line per
employer, after stating the year Enfav LLC was organized and that it has no federal contract past
performance yet.

**The look** follows the owner's capability statement. Its palette was read from the PDF's own colour
operators and declared once as the `@theme` tokens in `src/styles/global.css`: navy bands (`brand`,
`brand-strong`), slate text (`ink-soft`), a teal accent (`accent`, a rule or rail on a light surface;
`accent-strong` as text there; `accent-bright` on a band), tinted panels (`surface-tint`), hairlines
(`line`). `src/styles/contrast.spec.ts` parses that block and holds every pairing a component may draw
at WCAG AA (text 4.5:1, outlines and meaningful edges 3:1), and fails on a token no pairing names, so
a new colour is checked before it is drawn; axe then checks the rendered pages. Components take
colours only through those tokens' utilities, and never a raw value. The type is the system stack (no
third-party fetch, no font file to license), with the statement's hierarchy: a small-caps eyebrow
(`Eyebrow`), display headings, slate ledes. Lists the statement numbers are numbered here
(`NumberedCard`, `Steps`, `lib/format.ts`); the hero's node-graph figure (`HeroFigure`) is the
link-preview image's motif drawn inline, shown only where the page has a column for it and never on
paper. The focus ring stays an outline, ink on light surfaces and white on a band (`.surface-brand`),
which prints as ink.

**Copy rules**, from the approved copy:

- Offerings are written in the present tense ("we build…"), never as past results.
- On the site, the founder's employers are named in `src/data/founder.ts` and nowhere else; no
  client or agency is named anywhere. Comments, commit messages and docs name no employer either:
  before committing a content change, search the staged diff outside `founder.ts`, and your commit
  message, with the names typed in the shell
  (`git diff --cached -- . ':!**/founder.ts' | grep -n -i -E '<name>|<name>'`), and never
  write the list to a file in the repository.
- Team size, location and registration appear only as company facts, and no response-time promises
  are made.
- Registration details appear only as facts; a certification, set-aside or clearance appears only
  to be disclaimed, in words the claims check allows.
- No string in a `.ts` file may read as SQL that empties a table:
  `tooling/test-database-guarantees.spec.ts` scans every `.ts` file under `packages/` for it.

## One-time setup

In order; each step says why. Steps 1 to 4 can happen before the site reaches main, step 5 is the
launch, steps 6 to 8 finish the domain and turn on CI deploys, and steps 9 and 10 follow once
production has validated.

### 1. Confirm the registration and secure the accounts

enfav.com was registered at Cloudflare Registrar on 2026-10-14 (UTC), on Cloudflare nameservers,
with no DS record and nothing at the apex or www.

- Verify the ICANN registrant email by about 2026-10-29, from the verification message Registrar
  sent. An unverified registrant email puts the domain on hold with parking nameservers, which takes
  down both the site and Email Routing; the real nameservers come back by themselves once it is
  verified.
- Confirm the registration is yours, and which Cloudflare account holds it. The Worker and the CI
  token must live in that same account: Cloudflare will not create a custom domain on a zone you do
  not own. If Enfav belongs in another account, settle that before anything else in this runbook.
  Cloudflare accepts a move between accounts only once the registration is more than 10 days old
  (after 2026-10-24 03:24 UTC), the registrant email is verified, DNSSEC is off, and enfav.com has
  been added as a site in the target account, which then has five days to accept. The move carries
  the registration and its contacts; the zone's settings, DNS records, Email Routing rules and
  certificates do not come with it, and the Worker and the CI token are resources of the old
  account. Until the move completes, do nothing in steps 2 to 10 and leave DNSSEC off. Inviting the
  other account's people as members of the account that holds the domain avoids the move.
- Leave auto-renew on (Registrar's default) and keep the primary payment method valid: Registrar
  charges only the primary, on the first attempt and on every retry. Renewal is first tried about
  30 days before expiry and retried three times, the last the day before, so check the card before
  that window opens and act on any failed-renewal email; an expired domain enters redemption, where
  restoring it can cost more.
- Turn on two-factor authentication for Cloudflare and GitHub, and keep admin roles on the zone to
  the people who need them. Anyone with admin on the zone can unlock the domain and take its
  transfer code, and anyone who can push to main or change this repository's environments and
  variables decides what enfav.com serves.
- Enable DNSSEC: Manage Domains › enfav.com › Manage › Configuration › Enable DNSSEC. Cloudflare
  publishes the records and Registrar submits the DS record itself; it takes one to two days and
  cannot be hurried. Confirm it under DNS › Settings › DNSSEC, or by `signedDelegation` in WHOIS.
- Just before the first deploy, check that the apex is still empty — no A, AAAA or CNAME record for
  `enfav.com`; each of these prints nothing:

  ```bash
  dig +short enfav.com A
  dig +short enfav.com AAAA
  dig +short enfav.com CNAME
  ```

  In CI, wrangler would replace a conflicting record without asking; locally it asks (step 5). The
  MX and TXT records of steps 3 and 10 coexist with the custom domain.

### 2. Zone settings

- SSL/TLS encryption mode: Automatic SSL/TLS (the default) or Full (strict) — never Off, which stops
  encrypting visitors' traffic and hides the Always Use HTTPS switch. With no origin behind the
  Worker, the choice between the two barely matters.
- SSL/TLS › Edge Certificates › Always Use HTTPS: on. It redirects http to https for every hostname
  in the zone, requests to the Worker included.
- Minimum TLS Version 1.2 (Cloudflare's default is 1.0), and TLS 1.3 on.
- Turn off Bot Fight Mode, Rocket Loader, Zaraz, automatic Web Analytics injection (Web Analytics ›
  the site › Manage site › Disable) and Email Address Obfuscation. Each injects script into, or
  rewrites, the HTML Cloudflare serves. The CSP admits the site's own files only, so an injected
  script, inline or from another origin, is blocked and logged as a console error, and the e2e fails
  any page with a console error or with a `<script>` that is neither external nor JSON-LD: every
  deploy's verification would fail, and loosening the CSP to quiet it would be the wrong fix. Before
  any of that, `verify-production`'s first checks fail on any file production serves a plain HTTP
  client differently from the build, and on any page it serves a browser opening it differently,
  naming each one with the status production gave. They ask both ways because a feature can tell
  the two apart: on 2026-10-14 automatic Web Analytics added its script to pages requested with an
  Accept header naming `text/html`, as a browser's does, and not with the plain client's `*/*`.
  What can still pass where the checks run: a feature that acts on some visitors only — by address,
  country, cookie or user agent — and one that changes a file other than a page only for the
  headers a browser sends for it, such as a page's stylesheet or images. Email Address Obfuscation
  would rewrite the two addresses the site publishes on purpose.

### 3. Email Routing (Compute › Email Service)

1. Compute › Email Service › Email Routing › Onboard Domain. Cloudflare adds three MX records
   (`route1.mx.cloudflare.net`, `route2.mx.cloudflare.net` and `route3.mx.cloudflare.net`), an SPF
   record (`v=spf1 include:_spf.mx.cloudflare.net ~all`) and a DKIM record (`cf2024-1._domainkey`),
   then locks them; they unlock under Email Routing › Settings › DNS records. DNS changes usually
   settle within 5 to 15 minutes.
2. Destination Addresses: add the inbox that should receive the mail and click Verify email address
   in the message Cloudflare sends. A rule pointing at an unverified address stays disabled.
3. Routing Rules › Create routing rule: `contact` → Send to an email → that inbox; then the same for
   `contracts`.
4. Add DMARC through DMARC Management, at `p=none`. It offers to add the `_dmarc` record when none
   exists, and the first report can take up to 24 hours. Cloudflare documents the path as Email ›
   DMARC Management › Enable; Email Routing's own menu moved from Email to Compute › Email Service,
   so DMARC Management may have moved with it.

Email Routing only receives and forwards: "Email Routing does not support sending or replying from
your Cloudflare domain." A reply goes out from the destination inbox's own address until a sender
aligned with enfav.com (SPF and DKIM) exists — a mailbox provider, or Cloudflare's separate Email
Sending (beta, Workers Paid). That is why DMARC starts at `p=none`: a stricter policy would bounce
mail later sent as enfav.com through a provider that is not aligned. Move to `quarantine`, then
`reject`, once the reports show only legitimate senders. Moving to a hosted mailbox later means
unlocking the routing records and cutting over add-then-remove.

### 4. Wrangler auth

```bash
pnpm exec wrangler login    # browser sign-in (OAuth); add --use-keyring to keep the token in the OS keyring
pnpm exec wrangler whoami   # the accounts the login reaches, with their IDs
pnpm exec wrangler logout   # invalidates the OAuth token
```

Without `--use-keyring` the token is stored in plain text — on macOS in
`~/Library/Preferences/.wrangler/config/default.toml`, elsewhere typically in
`~/.config/.wrangler/config/default.toml`. An OAuth login is not limited to one account or zone the
way the CI token is (step 7): it carries wrangler's default scopes on every account your user
belongs to — Workers scripts, routes and custom domains (enough to replace what enfav.com serves, or
to attach a Worker to a hostname and replace that hostname's DNS record), KV, D1, Pages, queues,
Email Routing rules and more (`wrangler login --scopes-list` lists them). It has no scope to edit
DNS records directly, the Registrar or API tokens, and `--scopes` can narrow it. That reach is why
the first deploy ends by logging out unless the token is in the keyring.

Never put a Cloudflare token in a file Nx or wrangler loads — `.env*`, Nx's `.local.env` and
`.<target>.env` forms (`.*.env`), or `.dev.vars*`. Wrangler
reads system variables from `.env` files and Nx loads dotenv files into its tasks; `.gitignore`
keeps these files out of commits, but a token in one reaches every command that loads it.
`website:deploy` runs wrangler from `packages/website`, which keeps the root `.env` away from it. A
`CLOUDFLARE_API_TOKEN` set in your shell takes priority over your login.

CI authenticates with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (steps 7 and 8); the older
`CF_*` names are deprecated.

### 5. First deploy

The owner runs it, from a real terminal, in a clean tree at the commit being launched — one that
main will contain, since every CI deploy replaces what is live with main's tip.

Why not CI: the first deploy creates the Worker, and Cloudflare's Workers role model requires
product-level Admin to create one. As the account's owner, your login has it; whether the
two-permission CI token could create a Worker is not established, and it never needs to. The first
deploy also attaches enfav.com. In a terminal, wrangler asks before taking over a conflicting DNS
record or a domain another Worker holds; in CI, with no terminal, it takes both over without asking,
and `--strict` does not change that. The first attach is the one most likely to meet a conflict, so
it happens where someone can read the question.

1. `git status` shows a clean tree at the commit being launched. The deploy ships whatever the
   working tree builds, so an uncommitted change would go live with no commit recording it.
2. `pnpm exec wrangler whoami` names the account that holds enfav.com.
3. `pnpm website:deploy`. It runs `nx run website:build`, then
   `cd packages/website && wrangler deploy --config wrangler.jsonc --message "$(git rev-parse HEAD) local"`,
   so the version names its commit as CI's versions do. Before it, check that no pattern in the
   exclude file git reads (`git rev-parse --git-path info/exclude`: `.git/info/exclude` in a clone,
   the main checkout's in a linked worktree) or in an `.ignore` above the checkout (`~/.ignore`,
   say) matches any file or folder under `packages/website/src`, the folder Tailwind scans; a file
   name such as `Button.astro` or a glob such as `*.astro` counts as much as a folder. Tailwind's
   class scan honours both, CI has neither, and no check sees them. The build is one Nx task, so
   wrangler gets the real terminal for its questions. If your login reaches more than one account,
   wrangler asks which to use: choose the one that holds enfav.com. Answer any DNS prompt — saying
   no leaves the domain unattached
   (`Publishing to Custom Domain "enfav.com" was skipped, fix conflict and try again`). Note the
   `Current Version ID` it prints.
4. Wait until SSL/TLS › Edge Certificates shows the certificate Active, then validate (see
   Validating production; its www check waits for step 6). Universal SSL is issued 15 minutes to 24 hours after zone activation; how
   long the custom domain's own certificate takes is not documented.
5. `pnpm exec wrangler logout`, unless you signed in with `--use-keyring`.

### 6. www

`www.enfav.com` is not served by the Worker — custom domains match exact hosts — so the zone
redirects it to the apex.

1. Add a DNS record: type AAAA, name `www`, address `100::`, proxied (orange cloud). Redirect rules
   act only on proxied records, and `100::` is Cloudflare's reserved placeholder address for a
   hostname with no origin. A CNAME to the apex would not reach the Worker anyway.
2. Rules › Overview › Create rule › Redirect Rule, with a custom filter expression
   `(http.host eq "www.enfav.com")`, a dynamic target
   `concat("https://enfav.com", http.request.uri.path)`, status 301 and Preserve query string on.
3. Run the www check from Validating production.

Matching the host, rather than using Cloudflare's "Redirect from WWW to root" template
(`https://www.*`), also redirects plain-http requests, which the template leaves alone. Whether
Always Use HTTPS or this rule runs first is not documented, so `http://www.enfav.com` takes one hop
or two. A www custom domain would serve a duplicate site instead of redirecting, and would have to
be declared in `wrangler.jsonc`; `_redirects` cannot redirect by host. The rule runs at the edge
without invoking the Worker, and the free plan allows ten.

### 7. CI token

Create an account-owned API token at Manage account › Account API tokens › Create Token. It is not
tied to a person, so it survives one leaving; creating it needs API Token Provisioning or Super
Administrator, and you can grant only permissions you hold. Give it exactly two:

| Permission                       | Resources                                  |
| -------------------------------- | ------------------------------------------ |
| Account › Workers Scripts › Edit | Include › the account that holds enfav.com |
| Zone › Workers Routes › Edit     | Include › Specific zone › enfav.com        |

The dashboard's Edit is the API's Write (Workers Scripts Write, Workers Routes Write): one grant
under two names. Workers Scripts uploads each version and its files. Workers Routes is needed on
every deploy, not once, because wrangler re-applies the custom domain each time.

- Set an end date — tokens never expire by default, and dashboard dates take effect at 00:00 UTC —
  and put the rotation (below) in your calendar before it. Client IP filtering does not suit
  GitHub-hosted runners: their addresses change weekly, and GitHub advises against allowlisting
  them.
- Verify it at the account-scoped endpoint (`/user/tokens/verify` is for user tokens):

  ```bash
  read -rs CF_TOKEN   # paste the token; it is not echoed or kept in history
  curl -sS -H "Authorization: Bearer $CF_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/<account-id>/tokens/verify"
  unset CF_TOKEN
  ```

- Do not start from the "Edit Cloudflare Workers" template that Cloudflare's GitHub Actions guide
  suggests. It grants eight permissions — Workers KV, R2 and Tail, Account Settings and two User
  permissions besides the two above. The live template may differ; build the token from the table.
- These two permissions are what Cloudflare documents and what wrangler's source calls for (4.143.1
  fixed custom-domain deploys with such tokens, and the repository pins 4.149.0), but no live run
  has proven them yet. The first CI deploy does; dispatch it deliberately (step 8).
- Rotation: create a replacement token from the table, with a new end date; update the
  `CLOUDFLARE_API_TOKEN` environment secret; dispatch once to confirm; then delete the old token. A
  roll would not do: it changes only the token's value and keeps its permissions and its end date.
  Roll a token whose value leaked — that ends the old value at once, so deploys fail until the
  secret is updated. Cloudflare documents Roll under My Profile › API Tokens, the user-token list;
  this token lives under Manage account › Account API tokens.
- After a failed deploy, wrangler's hints about missing Memberships or User Details permissions are
  diagnostics, not requirements (see Troubleshooting).

### 8. GitHub

1. Settings › Environments › New environment, named `production`, with Deployment branches and tags
   set to Selected branches and tags and the one rule `main`, and the environment secrets
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Create it before the workflow first runs on
   main: a run that names a missing environment creates it, with no rules and no secrets.
   Environment secrets reach only jobs that reference the environment, and only after its rules
   pass, where repository secrets would reach any workflow on any branch a writer pushes. The branch
   rule is the control that a workflow edited on another branch cannot get around.
2. Optionally, a required reviewer — but only with Prevent self-review off. With it on, a solo owner
   can never approve their own deployment, and every deploy waits forever. Administrators bypass
   protection rules by default; untick Allow administrators to bypass configured protection rules to
   enforce them.
3. When you are ready, set the repository variable `WEBSITE_DEPLOYS` to `on` (Settings › Secrets and
   variables › Actions › Variables, or `gh variable set WEBSITE_DEPLOYS --body on`). The build and
   deploy jobs require it, and verification follows a deploy, so until then runs skip cleanly. It has to be a repository variable: the build job
   does not reference the environment, so an environment variable would never reach it. Setting it
   is the approval; setting it to `off` is the pause switch (see Rollback).

The workflow runs on main only, on a push that changes the deploy paths (see How a deploy works) or
on Run workflow, and neither can happen until origin/main contains the site — Run workflow needs the
workflow file on the default branch. Once it does and the variable is `on`, the next matching push
deploys. Dispatch once straight away, both to deploy and to prove the token: Actions ›
Deploy website › Run workflow on `main`, or
`gh workflow run deploy-website.yml --ref main`.

- Run workflow redeploys main's tip. It is also the retry after a failure that no later push would
  trigger.
- A pushed commit whose message carries `[skip ci]` (or `[ci skip]`, `[no ci]`, `[skip actions]`,
  `[actions skip]`, or a `skip-checks: true` trailer) does not deploy; dispatch if it should.
- A push made by a workflow with `GITHUB_TOKEN` starts no run.
- A re-run of a superseded run refuses; dispatch instead (see Troubleshooting).

### 9. HSTS last

Once production has validated over HTTPS, turn on SSL/TLS › Edge Certificates › HTTP Strict
Transport Security and ramp the Max Age: 1 month, then 6, then 12, each step only once the last has
run without HTTPS trouble (no interval is fixed). Leave Apply HSTS policy to subdomains
(includeSubDomains) and Preload off unless that is a deliberate decision: includeSubDomains makes
any later subdomain served without HTTPS unreachable, and preload is hard to undo — removal takes
months. Leave the dialog's No-Sniff option off too, since `_headers` already sends
`X-Content-Type-Options: nosniff`, and never add HSTS to `_headers`: one header, one place.

HSTS comes last and ramps because once a browser has seen it, anything that breaks HTTPS — a lapsed
certificate, pausing Cloudflare, switching the record to DNS-only — locks that visitor out until the
max-age runs out. Cloudflare does not document that the zone setting reaches responses from a
Workers custom domain; confirm it:

```bash
curl -sSI https://enfav.com/ | grep -i strict-transport-security
```

### 10. Search Console

Create a Domain property for `enfav.com` in Google Search Console and verify it with a TXT record,
`google-site-verification=<token>` at `@`, beside the SPF record. Keep the record: Google says not
to remove it after verification. A record added by hand can take two to three days to be seen.
Google offers instant verification for some DNS providers; whether Cloudflare is one is not settled.
Then, under Sitemaps, submit `https://enfav.com/sitemap-index.xml` — a hint, not an instruction;
robots.txt already names it.

## How a deploy works

`.github/workflows/deploy-website.yml` runs on a push to main that changes the deploy paths, and on
Run workflow (`workflow_dispatch`). The build and deploy jobs run only when
`github.ref == 'refs/heads/main' && vars.WEBSITE_DEPLOYS == 'on'`, and `verify-production` only
after a deploy, so a dispatch from another branch, or any run while the switch is off, skips every
job. Pull requests get the same checks from
`ci.yml`, which lints, type-checks, tests and builds every project and runs the website e2e.

1. **`build`** holds no secret and may use the pnpm cache. It installs with
   `pnpm install --frozen-lockfile`; reads the production URL from `SITE.origin` with Node, which
   strips the TypeScript types; runs
   `nx run-many -t lint typecheck test build -p website website-e2e`; installs Chromium and runs
   `nx run website-e2e:e2e` against `wrangler dev` over the built site; and uploads
   `packages/website/dist` as the run's artifact (hidden files included, and an empty upload fails),
   with the e2e report when that failed.
2. **`deploy`** needs `build` and runs in the `production` environment, whose URL is the one the
   build job read. It refuses a superseded re-run (see Concurrency, below); installs with
   `pnpm install --frozen-lockfile --ignore-scripts` and no cache; downloads the artifact into
   `packages/website/dist`; and fails at once, with an actionable error, if `CLOUDFLARE_API_TOKEN`
   or `CLOUDFLARE_ACCOUNT_ID` is empty. Then one step, run from `packages/website` with the two
   secrets in its env and nowhere else, records the Version ID serving before the deploy
   (`wrangler deployments status --json`, the version with the most traffic, read up to three times
   because one API call can fail), deploys, and records the one serving after it, even when wrangler
   failed. When the version serving before cannot be read, the step deploys nothing and fails: the
   first deploy is made from a terminal (setup step 5), so a version always serves by then.

   ```bash
   ../../node_modules/.bin/wrangler deploy --config wrangler.jsonc --message "$GITHUB_SHA run $GITHUB_RUN_ID"
   ```

   wrangler puts the new version live before it applies the custom domain, so a failed deploy can
   still have changed production. The job's `deployed` output is therefore true when wrangler
   succeeded or, when it failed, when Cloudflare's record shows a version serving that was not
   serving before; only a failed deploy whose read afterwards also failed leaves it false while what
   serves is unknown. A summary step that always runs writes the version wrangler reports, the one
   serving now, the one serving before, and the exact rollback command.

3. **`verify-production`** runs whenever `deployed` is true, even when wrangler or a later step of
   the deploy job failed. It downloads the same artifact and runs the e2e against production
   (`nx run website-e2e:e2e --excludeTaskDependencies`, with `WEBSITE_E2E_BASE_URL` set in that
   step). The suite's first checks wait up to two minutes for production to answer with the
   artifact byte for byte — the new version reaching the edge — both to a plain HTTP client and to
   a browser opening each page, and fail on any file or page served differently to them, which is
   how a zone feature that rewrites or challenges these requests shows up (setup step 2 says what
   can still pass).

**What gates what.** Nothing deploys that failed lint, type checking (`astro check`), the unit
specs, the build or the e2e under Workers routing. The deploy job waits for the `production`
environment's rules — main only, and a reviewer if you added one — before it receives the secrets.
`verify-production` checks the live site and does not roll back: when it fails, the new version is
serving and failing a check. Read its report and decide (see Rollback).

**Change detection.** A push deploys when it changes:

- anything under `packages/website/`;
- the root `.gitignore`, which Tailwind's class scan honours;
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc` or `nx.json`, which can change
  the build;
- the workflow itself.

There is no exclusion list: one that leaves out the specs is wrong as soon as Tailwind scans them,
so an edit that cannot change the site — its README, a spec, a lint config — costs one redundant
Worker version instead. The list is declared once, as `DEPLOY_PATHS` in
`packages/website/integrations/watched-inputs.ts` — each row a folder with everything under it or
one file, so no row can express a negation — and `tooling/website-imports.spec.ts` reads the
workflow's whole `paths` list and fails when it differs (`SITE-6`). The build checks what its tools
report reading against it: every module Rolldown loads (pages, components and their scripts, data,
a glob's matches), the modules Astro's content sync loads (the content config and what it imports)
among them; every file and folder PostCSS plugins report (a stylesheet an `@import` or `@reference`
brings in, a `@plugin` or `@config` module, each file and folder Tailwind's class scan reads); the
source of every asset a stylesheet's `url()` emits; and every file copied from `public/`, symlinks
resolved. It fails when one lies outside the watched paths (`node_modules` counts as watched,
because the lockfile fixes it, wherever pnpm keeps its store), or when a `.gitignore` or `.ignore`
between a folder Tailwind scans and the repository root is not watched, since the scan honours
those. What loads before the build — `astro.config.ts` with what it imports, and `tsconfig.json`
with what it extends — is held to the same paths by `tooling/website-imports.spec.ts`, which walks
every script the config reaches, wherever it lies, and runs in CI with the other tooling gates.
Some reads reach no report the build can read, so neither check sees them: a content collection's
entries (its loader reads them itself), a font file the config names, a stylesheet a CSS
preprocessor (Sass, Less, Stylus) loads itself through `@use`, `@forward` or `@import`, and a file
a page or the config opens with `node:fs`. Keep each such input inside the package. CSS Modules
would be another, so they stay off (`css.modules: false`), and the build fails if Vite's resolved
config turns them on. Tailwind's scan also honours the exclude file git reads
(`git rev-parse --git-path info/exclude`) and any `.ignore` above the checkout; no push can change
those and CI has neither, but they change a local build.

The trade-off cuts both ways. A dependency bump for another package costs one redundant Worker
version (rollback reaches the last 100). A push that touches none of these paths starts no run at
all, so a failed deploy followed only by unrelated pushes is never retried — dispatch. GitHub's own
limits on path filters also apply: a push of more than 1,000 commits, or one whose diff times out,
always runs, and one whose diff exceeds 3,000 files does not run when no matching file is among the
first 3,000 — dispatch after such a push.

**Concurrency.** `group: deploy-website-${{ github.ref }}` with `cancel-in-progress: false`. A
running deploy always finishes; the newest pending run replaces any older pending one, so a burst of
pushes deploys the latest; and because the group carries the ref, a run on another ref cannot cancel
main's queue. First attempts therefore need no ordering guard. A re-run does, because it carries its
original commit: when `github.run_attempt` is not `1` and main's tip
(`gh api repos/$GITHUB_REPOSITORY/commits/main`) is a different commit, the deploy job fails and
points to Run workflow instead of putting older code live.

**Why the credentialed step runs only wrangler.** The secrets exist in one step, and the job that
holds them never builds: it deploys the artifact the secret-free job built and tested. That step
runs no Nx, whose project-graph build and dotenv loading would see the token. The job installs with
`--ignore-scripts` — an assets-only deploy bundles nothing and starts no workerd — so no
dependency's install script runs beside the secret, and it restores no dependency cache that another
run could have poisoned. The rest is the usual hardening: actions pinned to commit SHAs,
`permissions: {}` at the top and `contents: read` per job, `persist-credentials: false`,
`runs-on: ubuntu-24.04` (`ubuntu-latest` moves to 26.04 from 2026-10-19), explicit timeouts, and no
`${{ }}` of untrusted input inside `run:`.

## Rollback

A Worker version is the Worker's complete state, its files included, so a rollback brings code and
assets back together, to any of the last 100 versions. Pause first.

1. **Pause.** Set `WEBSITE_DEPLOYS` to `off` (`gh variable set WEBSITE_DEPLOYS --body off`) and
   cancel any run in flight (`gh run list --workflow deploy-website.yml`, then
   `gh run cancel <run-id>`). Until the revert lands, any run — a push that changes the deploy
   paths, a dispatch — would ship main's tip, the bad commit, and undo the rollback.
2. **Find the version** to return to:

   ```bash
   pnpm exec wrangler deployments list --config packages/website/wrangler.jsonc
   ```

   Every version names its commit: CI's message is `<commit> run <run id>`, and `pnpm website:deploy`
   gives `<commit> local`. The failed run's summary names the version that was live before it, with
   the exact rollback command.

3. **Roll back:**

   ```bash
   pnpm exec wrangler rollback <version-id> --config packages/website/wrangler.jsonc --message "<why>"
   ```

   Give the ID: without one, wrangler picks the most recent earlier version that served all traffic.
   In a terminal it still asks twice — for a message, pre-filled from `--message` (Enter keeps it),
   then to confirm the move to 100% of traffic (Enter accepts); 4.149.0 declares `--yes` for this
   command but does not read it. Success prints
   `Worker Version <id> has been deployed to 100% of traffic.` Rolling back needs only Editor on the
   Worker, so your login or the CI token will do; the dashboard equivalent is Workers & Pages ›
   enfav-website › Deployments › ⋯ › Rollback.

4. **Validate** (see Validating production) from a checkout of the commit the restored version was
   built from, after `pnpm install --frozen-lockfile` there — nothing reinstalls on checkout, and
   `pnpm exec` does not compare `node_modules` with the lockfile — so the specs, the build and its
   dependencies match what serves. The version's message names that commit
   (`pnpm exec wrangler versions view <version-id> --config packages/website/wrangler.jsonc`). For a
   CI version less than 30 days old, download that run's `website-dist` artifact into
   `packages/website/dist` and run the e2e with `--excludeTaskDependencies`; otherwise run
   `rm -rf packages/website/node_modules/.astro`, then the e2e with `--skip-nx-cache`, which builds
   that commit afresh. Astro keeps the images it rasterized in that folder across checkouts and
   installs, keyed without the encoder settings or the Astro and sharp versions, and reuses them
   unchecked; neither `--skip-nx-cache` nor `astro build --force` clears it. A rebuild usually
   matches byte for byte but is not certain to, so a first check that reports files served
   differently may mean the rebuild differs, not that the rollback failed. Run
   `pnpm install --frozen-lockfile` again on returning to main.
5. **Revert** the bad commit on main.
6. **Resume.** Set `WEBSITE_DEPLOYS` back to `on` and dispatch once
   (`gh workflow run deploy-website.yml --ref main`), so production again runs what main holds.

Take the same pause before changing DNS by hand during an incident: every CI deploy re-applies the
custom domain and takes over conflicting records without asking. Every wrangler command here runs
from the repository root and names its config, which is how wrangler knows the Worker; the root has
no wrangler configuration of its own.

A rollback restores the Worker's code and files and nothing else. Routes and custom domains are not
part of a version; the zone (the www rule, TLS, HSTS, Email Routing, DNS) and GitHub are untouched;
and main still holds the bad commit, which the next deploy would ship again — hence the pause and
the revert. The site has no bindings and no stored data, so nothing is left behind.

## Validating production

The e2e in production mode is the main check:

```bash
WEBSITE_E2E_BASE_URL=https://enfav.com pnpm exec nx run website-e2e:e2e
```

With `WEBSITE_E2E_BASE_URL` set — the only variable the suite reads — Playwright starts no server
and runs every check against that URL. The target is never cached (`cache: false`): neither a live
server nor production is an input Nx can hash, so a cached pass would prove nothing about enfav.com.

The suite compares production with the build in `packages/website/dist`, file by file, so that
folder must hold the build that is live. After a CI deploy, use that run's artifact and skip the
rebuild:

```bash
gh run download <run-id> --name website-dist --dir packages/website/dist   # replace any dist/ first
WEBSITE_E2E_BASE_URL=https://enfav.com pnpm exec nx run website-e2e:e2e --excludeTaskDependencies
```

After the first deploy, which built on your machine, the `dist/` it deployed is that build. A fresh
local build of the live commit usually matches too — on 2026-10-14 a macOS and a Linux build of the
same commit, both arm64, matched byte for byte — but CI builds on x64, and nothing guarantees that
sharp encodes the images identically on every machine, that no local ignore file (see setup step 5)
changed Tailwind's scan, or that Astro's image cache in `packages/website/node_modules/.astro` holds
no image another commit rasterized (remove the folder before such a build); the artifact is exact.
What it checks, every page at both widths
unless noted:

- `build-served.spec.ts`, first and once — production answers a plain HTTP client with every built
  file unchanged (the 404 page at an unknown path), and a browser opening each page with that page
  unchanged, each retried for up to two minutes; every other check waits for both. The browser
  check needs every page saved as UTF-8 without a byte-order mark, the only form a browser hands
  back byte for byte, and fails naming any page that is not.
- `pages.spec.ts` — axe finds no WCAG 2.2 A/AA or best-practice violation; at 320 px nothing
  scrolls sideways, and no element, line of text or element's content ends past the right edge, even
  where an overflow clip in the document hides it — fixed-position boxes as drawn, an element's
  scrolling area counting generated content and shadow trees, a scaled element at its scale. A box
  of at most a pixel that clips its content (visually hidden text) is not walked, and an element
  with no box of its own is. Not seen: a fixed box or a clip the walk cannot reach (generated, in a
  shadow tree, inside a visually hidden box), and content the walk cannot reach inside a rotated or
  skewed element. `lang="en"`, one `<h1>`, a description of at most 160 characters, a canonical
  equal to the page's sitemap URL and an `og:url` equal to the canonical (the 404 has `noindex` and
  neither); no console error, page error or failed request; no Content-Security-Policy violation,
  with every inline event handler compiled under the page's own policy so one that never fires still
  counts (Chromium compiles the handlers it lists through the DevTools protocol: every node's,
  through shadow roots and frames, and every window's); no inline script or style, and no
  `javascript:` URL in an attribute that holds a URL (a link, a form's action, a frame's, image's,
  script's or object's source, an SVG animation's `to`, `from`, `by` or any entry of its `values`)
  in the document, its open shadow roots and every frame (a closed shadow root is not read); every
  internal link lands on a 200 without a redirect, and every `#fragment` exists. Once, on the home
  page: the served policy refuses, not merely reports, an inline handler and an inline style, and no
  directive governing script or style attributes allows `'unsafe-inline'` or `'unsafe-hashes'` (a
  directive given twice counts by its first copy, as the browser reads it), which is what lets those
  checks see one.
- `facts.spec.ts` — no restricted claim outside a verified fact, on screen or in print (see Content
  and company facts), with the body's text read three ways — its text nodes joined, each element's
  whole text, and its innerText — so adjacent items never run together and a word split by markup
  stays whole where it renders or its element's text sets it apart, and every JSON-LD value read
  too; `/government/` states every detail `COMPANY_DETAILS` declares, in order, each value as the
  fact declared, visible and with the text each medium draws in any letter case, on screen and on
  paper; on `/about/` and `/government/` the element marked `data-person` holds exactly the
  founder's or the point of contact's name and then title facts, and no other; and the claims check
  itself finds a phrase spaced, hyphenated (a hyphen-minus or U+2010, or a hyphen compatibility
  normalization folds into one: a non-breaking, small or full-width hyphen; a soft hyphen is
  ignored) or written as one word, beside a symbol such as ™, split by markup (rendered, or apart
  from the text beside it), across elements or in the JSON-LD, and only whole phrases. These read
  the checkout's company data, so run the suite from the commit that built what you validate.
- `serving.spec.ts` — the sitemap lists exactly the built pages; titles and descriptions are unique;
  robots.txt names the sitemap on the canonical origin; the Open Graph image and the touch icon are
  PNGs of their declared sizes;
  the home page's JSON-LD parses and names the canonical origin; an unknown path answers 404 with
  the 404 page; `/about` answers 307 to `/about/`; every built file, the 404 page and every
  trailing-slash redirect carry the headers `/*` declares, and every file `/_astro/*` names is
  immutable; `/_headers` is not served.
- `navigation.spec.ts` — on the home page, the skip link moves focus to `main` and the primary
  navigation links are targets of at least 24 px; on every page, Tab walks every stop from the
  first, past whatever had focus once the page loaded — the element that has focus, inside open
  shadow roots and same-origin frames, a control that takes several presses counted once — until
  focus leaves the page, and a walk that comes back to an earlier stop fails as a keyboard trap. A
  closed shadow root or a cross-origin frame is one stop, judged by its host's own outline, and the
  stops inside are not measured; Chromium matches no focus pseudo-class on a frame whose content has
  focus, so such a frame passes only with an outline it always shows. Every stop has an outline at
  least 2 px wide and 3:1 against what it is painted over — outside the element, over its border
  (taken as solid), within it, or across these, its alpha included, each background colour taken to
  lie under the whole outline (`background-clip` and the edges of the boxes behind it are not read)
  — and keeps a visible outline in forced-colors mode.
- `employment.spec.ts` — on `/about/` and `/government/`, the founder's prior employment lists one
  entry per employer `FOUNDER.experience` declares, in order, each naming its own employer and no
  other with its dates as that page states them, under `FOUNDER.experienceNote`.
- `print.spec.ts` (desktop Chromium) — `/government/` loads with 200 and prints on at most two
  pages, each with a US-Letter page box (612 × 792 pt), which only the stylesheet's `@page` rule can
  set.

The criteria these checks claim are `SITE-1` to `SITE-8` in `packages/criteria/src/site.ts`: the e2e
claims `SITE-2`, `SITE-3`, `SITE-4`, `SITE-5`, `SITE-7` and `SITE-8`; the unit specs `SITE-1`,
`SITE-4` and `SITE-6` (the single origin, and the build's check of its own inputs, which every build
runs); and `tooling/website-imports.spec.ts` the rest of `SITE-6`, what loads before the build.

By hand:

```bash
curl -sSI https://enfav.com/                  # 200, with the headers from public/_headers
curl -sSI https://enfav.com/about             # 307 to /about/
curl -sSI https://enfav.com/nope/             # 404, the site's 404 page, same headers
curl -sSI http://enfav.com/                   # redirect to https://enfav.com/ (Always Use HTTPS)
curl -sSI 'https://www.enfav.com/x?y=1'       # 301, location: https://enfav.com/x?y=1 (from setup step 6)
curl -sSI https://enfav.com/_headers          # 404: the rules file is applied, never served
curl -sS https://enfav.com/robots.txt         # ends with Sitemap: https://enfav.com/sitemap-index.xml
curl -sS https://enfav.com/sitemap-index.xml  # points to https://enfav.com/sitemap-0.xml
asset=$(curl -sS https://enfav.com/ | grep -o '/_astro/[^"]*' | head -n 1)
curl -sSI "https://enfav.com$asset"           # cache-control: public, max-age=31536000, immutable
dig +short MX enfav.com                       # route1, route2 and route3.mx.cloudflare.net
openssl s_client -connect enfav.com:443 -servername enfav.com </dev/null   # Verify return code: 0 (ok)
```

- Send a message from an outside account to `contact@enfav.com` and to `contracts@enfav.com`, and
  confirm both arrive at the verified destination before the site is announced.
- Run the home page through Google's
  [Rich Results Test](https://search.google.com/test/rich-results) (the Organization data),
  [PageSpeed Insights](https://pagespeed.web.dev/) and
  [securityheaders.com](https://securityheaders.com/), which reports HSTS missing until setup
  step 9.

## Content upkeep

1. **Registration facts.** The SAM.gov details in `src/data/company.ts` are the entity record's,
   verbatim, except that the NAICS list leaves out the registration's manufacturing and
   industrial-design codes, which the owner keeps off the site; the organization date is the state
   filing's. SAM.gov registration lasts a year: after each renewal, set `samRegistration.expires` to
   the new date, or the site goes on stating one that has passed (today 2027-09-26). Re-check the
   rest whenever the registration changes. To read the record:

   ```bash
   pnpm govcon entities lookup <UEI> --json
   ```

   That spends one SAM.gov request and needs `SAM_GOV_API_KEY` and the govcon database (see
   [docs/govcon/overview.md](../govcon/overview.md)). The record carries the CAGE code, the NAICS
   codes with whether SBA sizes Enfav small in each, the PSC codes (in the `--json` output; the
   table leaves them out), and the registration status and expiry. It does not carry the address,
   which NAICS code is primary, the organization date or the employee count: take those from the
   registration on SAM.gov itself.

   The e2e's print check (`SITE-7`) fails if a change pushes `/government/` past two pages. On
   2026-10-15 the second page ended about 100 CSS px short of its foot.

2. **Founder bio and employment.** Re-check every claim in `src/data/founder.ts` against the dates
   and titles in the owner's current résumé, which is not in the repository.
3. **Capability-statement PDF.** `/government/` prints as a capability statement of at most two
   US-Letter pages that follows the owner's own. The site publishes no separate PDF; one added later
   must state the facts `company.ts` declares.

## Troubleshooting

**The certificate is pending, or TLS fails right after the first deploy.** Universal SSL is issued
15 minutes to 24 hours after zone activation, and the custom domain's own certificate has no
documented issue time. Wait until SSL/TLS › Edge Certificates shows Active, then retry
`openssl s_client` and `curl`. A restrictive CAA record can block issuance, so add none; if any
exist, Cloudflare adds its certificate authorities for Universal SSL only. Removing a custom domain
later does not delete its certificate; clean it up under Edge Certificates.

**DNS conflicts.** Locally, wrangler asks "Custom Domains already exist for these domains…" when
another Worker holds enfav.com, or "You already have DNS records that conflict for these Custom
Domains…" when the apex has an A, AAAA or CNAME record; saying no prints
`Publishing to Custom Domain "enfav.com" was skipped, fix conflict and try again`. Remove the
conflict and deploy again; a custom domain cannot be created over a CNAME at all. In CI nothing
asks: the record or the domain is taken over silently, so anything added at the apex after the first
deploy is replaced by the next CI deploy, and a custom domain attached in the dashboard is likely
detached. `Trigger configuration for "enfav-website" was only partially updated` means the version
uploaded but the domain step failed — the zone is not active, or the token lacks Workers Routes —
and the changes that succeeded were not rolled back, so the new version may be live. In CI the
deploy job then fails, but its summary shows which version serves, and `verify-production` runs
when that version is new. If the read after the deploy failed too, the summary says what serves is
unknown and `verify-production` is skipped, even if the new version serves;
`pnpm exec wrangler deployments status --config packages/website/wrangler.jsonc` tells. Fix the
cause and deploy again, or validate a version you keep by hand (see Validating production).

**The deploy job fails with "Serving version unknown".** Cloudflare's record of what serves could
not be read in three tries, so nothing was deployed. A Worker never deployed needs its first deploy
from a terminal (setup step 5). If the log shows an authentication error (code 10000), every run
fails the same way until the CI token is fixed, and the log reads the same whatever the cause, so
look at the token under Manage account › Account API tokens:

- Past its end date: create a replacement from the table in setup step 7, update the
  `CLOUDFLARE_API_TOKEN` secret, dispatch, and delete the old token. A roll keeps the end date.
- Lost a permission: edit the token back to the two permissions in the table. Editing keeps its
  value, so the secret stays as it is; a roll would keep the reduced permissions.
- Rolled without the secret being updated: update the secret with the rolled value, and roll again
  only if that value is lost.

Otherwise the API failed, and running the workflow again retries.

**The build fails: "The build read what … does not watch".** A change made the build read a file
outside the watched paths, or put an ignore file above a folder Tailwind scans, and the message
names each. Move the input into the package, or add its path to the workflow's `paths` and to
`DEPLOY_PATHS` in `packages/website/integrations/watched-inputs.ts`; the tooling spec fails until
the two agree.

**A deploy fails with error 10000 (or 9106), then asks about Memberships or User Details.** On an
authentication error, wrangler prints a hint about custom API tokens and runs `whoami`, which asks
whether you are missing `User->Memberships->Read` (and, for user tokens,
`User->User Details->Read`). Those are diagnostics, not requirements; do not add them. The missing
permission is the one for the endpoint named in the first error line. Two known causes: an error on
`/zones/<zone_id>/workers/routes` ("No access to the specified resource") came from wrangler older
than 4.143.1, so `pnpm exec wrangler --version` must print 4.149.0; and with no
`CLOUDFLARE_ACCOUNT_ID`, wrangler lists accounts through `/accounts` and `/memberships`, which an
account token may not be allowed to read — the deploy job fails fast on an empty secret for that
reason. Keep `account_id` out of `wrangler.jsonc`, where it would outrank the secret.

**A re-run fails as superseded, pointing to Run workflow.** Main moved on after that run started,
and re-running it would deploy its older commit. Dispatch instead:
`gh workflow run deploy-website.yml --ref main`. A re-run works while its commit is still main's
tip.

**Every job was skipped.** The run was not on main, or `WEBSITE_DEPLOYS` is not `on`.

**The first e2e checks report files served differently from the build.** Each names the files with
the status production gave for their URLs. A 403 or 503, a redirect, or HTML that differs is a zone
feature challenging, redirecting or rewriting responses (setup step 2); pages that differ only when
a browser opens them point to a feature that answers a browser's requests differently from a plain
client's, as automatic Web Analytics did by the Accept header. Turn it off, then re-run the failed
job, which checks the same artifact again. If nothing changed on the zone, the new version had not
reached the edge within two minutes; re-run the failed job. When validating by hand, check that
`packages/website/dist` holds the deployed build (see Validating production).

**Astro refuses to start, or the Astro lint and format plugins fail.** Node is too old:
`node --version` must print v24, as `.nvmrc` says. Astro 7 needs 22.12 or later and its lint and
format plugins `^22.22.3 || ^24.16`; the root `engines` field (`>=22.17`) is looser and does not
catch it.

**The e2e cannot start its server.** Something already listens on port 4205 — usually a preview left
behind by an interrupted run. The suite never reuses a server (`reuseExistingServer: false`), since
it must test the build it has just made. `lsof -nP -iTCP:4205 -sTCP:LISTEN` names the process; stop
it and run again.

**wrangler says the assets directory does not exist.** Build first: `assets.directory` (`./dist`) is
resolved from the config file and must exist. `pnpm website:preview` and `pnpm website:deploy` build
before they call wrangler.

## Limits worth knowing

| What                              | Limit (Workers Free)                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Requests for static files         | Free and unlimited; no Worker code runs, so the 100,000 invocations a day do not apply |
| Files per version                 | 20,000                                                                                 |
| Size of one file                  | 25 MiB                                                                                 |
| Versions reachable by rollback    | The last 100                                                                           |
| `_headers`                        | 100 rules, 2,000 characters per line                                                   |
| Custom domains                    | 100 per zone                                                                           |
| Redirect rules (Single Redirects) | 10                                                                                     |
| Email Routing                     | 200 rules per domain, 200 destination addresses per account, 25 MiB per message        |

The free plan covers everything this site uses: custom domains, redirect rules, Email Routing and
DMARC Management.
