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

The production origin is one declaration, `SITE.origin` in `src/data/site.ts`. Astro's `site` reads
it (canonical URLs, the sitemap, robots.txt), so does the deploy workflow (its environment URL and
its production checks), and `src/data/site.spec.ts` fails if its host is not the custom domain in
`wrangler.jsonc`.

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
owner's earlier note, `docs/enfav/hosting.md` (not committed), recommended Cloudflare Pages, set up
through the dashboard's Git integration with both hostnames added as Pages custom domains; for
hosting, this runbook supersedes it. It remains the content brief, which the site follows except for
deferring the downloadable capability-statement PDF (see the pre-launch checklist).

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
check, which every other one waits for, is that the server answers with that build byte for byte;
then it runs every page in desktop Chromium and at 320 × 640 px. Install the browser once with
`pnpm exec playwright install chromium` (CI adds `--with-deps`); a failed run leaves its report in
`dist/.playwright/packages/website-e2e/playwright-report`.

The ports are the site's own: `tooling/e2e-lane-ports.spec.ts` lists 4203 and 4204 among the dev
ports, the e2e's preview takes 4205, and Astro's default 4321 would sit inside the studio e2e lanes
(4300–4396).

## Content and company facts

Every fact the site states about the company lives in `packages/website/src/data/`: `company.ts`
(the company facts, and `COMPANY_DETAILS`, the capability statement's company data in reading
order), `founder.ts` (the About page's founder section), `services.ts` (the five services, one list
for the home, services and government pages) and `site.ts` (name, origin, navigation).

A company fact is a `Fact` (`src/lib/fact.ts`): either `verified(value)` or `placeholder(label)`,
where the label says where the confirmed value will come from. The site never presents an
unconfirmed detail as fact:

- A placeholder renders as a dashed `Placeholder — …` marker (`Placeholder.astro`) that says so in
  words, not only in colour, is kept out of search snippets (`data-nosnippet`) and carries
  `data-fact`, so checks can tell a stated fact from the copy around it.
- Structured data never sees a placeholder. The home page's JSON-LD — an Organization and its
  WebSite, built in `src/lib/structured-data.ts` — uses confirmed facts only, and an unconfirmed
  fact leaves no key behind: the machines that read it cannot see the marker a person sees.
  `src/lib/structured-data.spec.ts` holds this (`SITE-4`).
- A credential can only ever be a fact. The e2e fails any page whose visible text outside
  `[data-fact]` matches the restricted-claims list in `packages/website-e2e/src/support/claims.ts` —
  set-aside and size statuses, clearances, certifications, a GSA Schedule, awards, prime contracts.

Certifications, contract vehicles and contract past performance have no row at all, not even a
placeholder: Enfav holds none yet, and a placeholder would imply one is pending. There is no phone
number.

**Confirming a fact** is a one-line change in `src/data/company.ts`, from `placeholder('…')` to
`verified('…')`, with the value copied verbatim from its source — for the registration details, the
SAM.gov entity record (see the pre-launch checklist). Look at the result under
`pnpm website:preview` (`/government/`) and land it like any site change: the deploy's build job
runs the specs and the e2e before anything ships. Never fill the NAICS or PSC codes from
`packages/govcon/src/profiles/enfav.ts`: that file is the scope govcon searches for opportunities,
not what Enfav is registered under.

**The founder** (`src/data/founder.ts`). Every claim carries a comment citing the résumé line it
rests on, by role and dates, never by employer. The founder's prior experience is individual
experience, and the site says so wherever it appears: the About page heads it as prior professional experience, before
Enfav LLC and not Enfav LLC contract past performance, and the government page's past performance
notes that Enfav LLC was formed in 2026 and that the founder's experience is not its contract past
performance.

**Copy rules**, from the approved copy:

- Offerings are written in the present tense ("we build…"), never as past results.
- No client, agency or employer names, anywhere in this public repository — copy, comments, commit
  messages, docs. Before committing a content change, search the staged diff and your commit message
  for them with the names typed in the shell (`git diff --cached | grep -n -i -E '<name>|<name>'`),
  and never write the list to a file in the repository.
- No claims about team size, clearances or location beyond the founder, and no response-time
  promises.
- Certifications, set-asides and registration appear only through fact rows.
- No string in a `.ts` file may read as SQL that empties a table:
  `tooling/test-database-guarantees.spec.ts` scans every `.ts` file under `packages/` for it.

## One-time setup

In order; each step says why. Steps 1 to 4 can happen before the site reaches main, step 5 is the
launch, steps 6 to 8 finish the domain and turn on CI deploys, and steps 9 and 10 follow once
production has validated.

### 1. Confirm the registration and secure the accounts

enfav.com was registered at Cloudflare Registrar on 2026-10-14 (UTC), on Cloudflare nameservers,
with no DS record and nothing at the apex or www.

- Confirm the registration is yours, and which Cloudflare account holds it. The Worker and the CI
  token must live in that same account: Cloudflare will not create a custom domain on a zone you do
  not own. If Enfav belongs in another account, move the domain now, before DNSSEC — Cloudflare says
  to disable DNSSEC before any move between accounts.
- Verify the ICANN registrant email by about 2026-10-29, from the verification message Registrar
  sent. An unverified registrant email puts the domain on hold with parking nameservers, which takes
  down both the site and Email Routing; the real nameservers come back by themselves once it is
  verified.
- Leave auto-renew on (Registrar's default) and keep a valid payment method, plus a second one for
  the retries. Renewal is first tried about 30 days before expiry and retried three times, the last
  the day before; an expired domain enters redemption, where restoring it can cost more.
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
- Turn off Bot Fight Mode, Rocket Loader, Zaraz, automatic Web Analytics injection and Email Address
  Obfuscation. Each injects script into, or rewrites, the HTML Cloudflare serves. The CSP admits the
  site's own files only, so an injected inline script is blocked and logged as a console error, and
  the e2e fails any page with a console error or with a `<script>` that is neither external nor
  JSON-LD: every deploy's verification would fail, and loosening the CSP to quiet it would be the
  wrong fix. Before any of that, `verify-production`'s first check fails on any file production
  serves differently from the build, naming each one, so a feature that rewrites or challenges
  responses is caught whichever it is. Email Address Obfuscation would rewrite the two addresses the
  site publishes on purpose.

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
`~/.config/.wrangler/config/default.toml`. An OAuth login is not granular: it can do whatever your
user can, which is why the first deploy ends by logging out unless the token is in the keyring.

Never put a Cloudflare token in a file Nx or wrangler loads — `.env*` or `.dev.vars*`. Wrangler
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
   `cd packages/website && wrangler deploy --config wrangler.jsonc`; the build is one Nx task, so
   wrangler gets the real terminal for its questions. If your login reaches more than one account,
   wrangler asks which to use: choose the one that holds enfav.com. Answer any DNS prompt — saying
   no leaves the domain unattached
   (`Publishing to Custom Domain "enfav.com" was skipped, fix conflict and try again`). Note the
   `Current Version ID` it prints.
4. Wait until SSL/TLS › Edge Certificates shows the certificate Active, then validate (see
   Validating production). Universal SSL is issued 15 minutes to 24 hours after zone activation; how
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
  and put the rotation in your calendar before it. Client IP filtering does not suit GitHub-hosted
  runners: their addresses change weekly, and GitHub advises against allowlisting them.
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
- Rotation: Roll the token, which keeps its permissions and ends the old secret at once; update the
  `CLOUDFLARE_API_TOKEN` environment secret straight away; then dispatch once to confirm. Deploys
  fail between the roll and the update. Cloudflare documents Roll at My Profile › API Tokens › ⋯ ›
  Roll, which is the user-token list; this token lives under Manage account › Account API tokens.
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
   secrets in its env and nowhere else, records the live Version ID
   (`wrangler deployments status --json`; none for a new Worker) and deploys:

   ```bash
   ../../node_modules/.bin/wrangler deploy --config wrangler.jsonc --message "$GITHUB_SHA run $GITHUB_RUN_ID"
   ```

   A summary step that always runs writes the new and previous Version IDs and the exact rollback
   command, and the job outputs `deployed`.

3. **`verify-production`** runs whenever the deploy step succeeded, even if a later step of that job
   failed. It downloads the same artifact and runs the e2e against production
   (`nx run website-e2e:e2e --excludeTaskDependencies`, with `WEBSITE_E2E_BASE_URL` set in that
   step). The suite's first check waits up to two minutes for production to answer with the
   artifact byte for byte — the new version reaching the edge — and fails on any file served
   differently, which is how a zone feature that rewrites or challenges responses shows up.

**What gates what.** Nothing deploys that failed lint, type checking (`astro check`), the unit
specs, the build or the e2e under Workers routing. The deploy job waits for the `production`
environment's rules — main only, and a reviewer if you added one — before it receives the secrets.
`verify-production` checks the live site and does not roll back: when it fails, the new version is
serving and failing a check. Read its report and decide (see Rollback).

**Change detection.** A push deploys when it changes:

- anything under `packages/website/` except its README, its specs (`**/*.spec.ts`) and its
  `vitest.config.ts`, `eslint.config.mjs` and `prettier.config.mjs`, none of which can change what
  is served;
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc` or `nx.json`, which can change
  the build;
- the workflow itself.

A new file in the package deploys by default, and the list stays complete because
`tooling/website-imports.spec.ts` fails when anything the build reads imports a module outside the
package other than an `astro:` or `node:` module or a root dependency (`SITE-6`); CI runs it with
the other tooling gates. The trade-off cuts both ways. A
dependency bump for another package costs one redundant Worker version (rollback reaches the last
100). A push that touches none of these paths starts no run at all, so a failed deploy followed only
by unrelated pushes is never retried — dispatch. GitHub's own limits on path filters also apply: a
push of more than 1,000 commits, or one whose diff times out, always runs, and one whose diff
exceeds 3,000 files does not run when no matching file is among the first 3,000 — dispatch after
such a push.

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

   CI labels every deployment `<commit> run <run id>`, and the failed run's summary names the
   version that was live before it, with the exact rollback command.

3. **Roll back:**

   ```bash
   pnpm exec wrangler rollback <version-id> --config packages/website/wrangler.jsonc --message "<why>"
   ```

   Give the ID: without one, wrangler picks the most recent earlier version that served all traffic.
   `--message` also skips the prompts. Success prints
   `Worker Version <id> has been deployed to 100% of traffic.` Rolling back needs only Editor on the
   Worker, so your login or the CI token will do; the dashboard equivalent is Workers & Pages ›
   enfav-website › Deployments › ⋯ › Rollback.

4. **Validate** (see Validating production).
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
sharp encodes the images identically on every machine; the artifact is exact. What it checks, every page at
both widths unless noted:

- `build-served.spec.ts`, first and once — production answers with every built file unchanged (the
  404 page at an unknown path), retried for up to two minutes; every other check waits for it.
- `pages.spec.ts` — axe finds no WCAG 2.2 A/AA or best-practice violation; at 320 px nothing scrolls
  sideways, with `overflow-x` left visible so the check cannot be faked; `lang="en"`, one `<h1>`, a
  description of at most 160 characters, a canonical equal to the page's sitemap URL and an `og:url`
  equal to the canonical (the 404 has `noindex` and neither); no console error, page error or failed
  request, so a CSP violation fails here, and no inline script or style; every internal link lands
  on a 200 without a redirect, and every `#fragment` exists; no credential claim outside a verified
  fact.
- `serving.spec.ts` — the sitemap lists exactly the built pages; titles and descriptions are unique;
  robots.txt names the sitemap on the canonical origin; the Open Graph image and the touch icon are
  PNGs of their declared sizes;
  the home page's JSON-LD parses and names the canonical origin; an unknown path answers 404 with
  the 404 page; `/about` answers 307 to `/about/`; the security headers are on 200s and 404s;
  `/_astro/*` is immutable; `/_headers` is not served.
- `navigation.spec.ts` — the skip link moves focus to `main`; under forced colours a focused link
  keeps a visible outline at least 2 px wide; navigation links are targets of at least 24 px.
- `print.spec.ts` (desktop Chromium) — `/government/` prints as exactly one US-Letter page.

The criteria these checks claim are `SITE-1` to `SITE-7` in `packages/criteria/src/site.ts`: the e2e
claims `SITE-2`, `SITE-3`, `SITE-4`, `SITE-5` and `SITE-7`; the unit specs `SITE-1`, `SITE-4` and
`SITE-6`; and `tooling/website-imports.spec.ts` the other half of `SITE-6`.

By hand:

```bash
curl -sSI https://enfav.com/                  # 200, with the headers from public/_headers
curl -sSI https://enfav.com/about             # 307 to /about/
curl -sSI https://enfav.com/nope/             # 404, the site's 404 page, same headers
curl -sSI http://enfav.com/                   # redirect to https://enfav.com/ (Always Use HTTPS)
curl -sSI 'https://www.enfav.com/x?y=1'       # 301, location: https://enfav.com/x?y=1
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

## Pre-launch checklist

1. **Registration facts, verbatim from SAM.gov.** Replace the placeholders in `COMPANY_DETAILS` —
   UEI, CAGE code, NAICS codes, PSC codes, business size, SAM.gov registration status and business
   address — with the values in Enfav's SAM.gov entity record. Never take any of them from the
   govcon prospecting profile, `packages/govcon/src/profiles/enfav.ts`.

   ```bash
   pnpm govcon entities lookup <UEI> --json
   ```

   That spends one SAM.gov request and needs `SAM_GOV_API_KEY` and the govcon database (see
   [docs/govcon/overview.md](../govcon/overview.md)). The record carries the CAGE code, the NAICS
   codes with whether SBA sizes Enfav small in each (the business size by NAICS), the PSC codes (in
   the `--json` output; the table leaves them out), and the registration status and expiry. It
   carries no address: take the business address from the registration on SAM.gov itself.

   The e2e's print check (`SITE-7`) fails if the real values push `/government/` onto a second
   page. On 2026-10-14 the placeholder version ended at 878 of the 960 CSS px a Letter page holds.

2. **Founder bio.** Re-check every claim in `src/data/founder.ts` against the dates and titles in
   the owner's current résumé, which is not in the repository.
3. **Capability-statement PDF.** Deferred until the facts above are verified: a PDF carrying
   placeholders would be filed and forwarded where it can no longer be corrected. Until then,
   `/government/` is the capability statement and prints as one US-Letter page. How the PDF is
   produced and where it is linked is not decided yet.

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
and the changes that succeeded were not rolled back, so the new version may be live. Fix the cause
and deploy again.

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

**The first e2e check reports files served differently from the build.** It names each file with
the status production gave. A 403 or 503, or HTML that differs, is a zone feature challenging or
rewriting responses (setup step 2): turn it off, then re-run the failed job, which checks the same
artifact again. If nothing changed on the zone, the new version had not reached the edge within two
minutes; re-run the failed job. When validating by hand, check that `packages/website/dist` holds
the deployed build (see Validating production).

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
