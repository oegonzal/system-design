# Teaming shortlist — October 2026

Made 2026-10-23 from USAspending through the govcon tool and its API. It answers the first three
steps of `objective.md` (find the awarded software contracts, identify the primes, confirm a
subcontracting program) and sets up steps four to six in the tracker. Ten primes are tracked as
firm targets at stage `identified`, each with its two largest qualifying awards tracked at
`watching`, on the Pipeline page under "Firms and awards". Nothing here is a confirmed opening: a
subcontract count is evidence that a prime buys work of Enfav's size, not an offer.

## What the checklist looks like in the tool

| Step | Where it lives now |
|---|---|
| 1 Find awarded contracts | Spending page, saved views "Teaming: primes FY2026", "Teaming: top holders FY2026", "Teaming: DA01 awards ending in 24 months" |
| 2 Read the award | `/awards/<id>`: obligated against ceiling, end with and without options, buyer, type, vehicle, subcontracts reported, and the subcontracting plan as the latest action codes it (landed 2026-10-24) |
| 3 Shortlist primes | Primes lens — its Tracking column tracks a prime in one click — plus this report's rule; the ten are firm targets |
| 4 Contacts and supplier portals | Your step on each prime's website; record them on the firm target as contacts in declared roles, links of declared kinds and an activity log (landed 2026-10-24) |
| 5 Outreach | **Draft an introduction** on the tracked award's page: the quality loop writes the note from the award's record and your offers (Settings → Introductions); you send it and log `emailed` |
| 6 Track and follow up | Pipeline → Firms and awards (first contact, next action, latest activity; CSV download); the dashboard's due list; a quiet-target alert in your digest after five business days without a reply |

## How the list was made

- **Scope.** Contracts (not vehicles) under NAICS 541511, 541512 and 541519 held by other-than-small
  primes, with obligations between 2025-10-01 and 2026-10-23 (FY2026 and FY2027 to date).
- **Who subcontracts.** Every subcontract reported under those awards was read from USAspending
  (61 pages, 6,057 rows, 5,952 distinct subcontracts, 117 primes) and grouped by the prime's
  recipient id, then by its parent company through the recipient profiles. The count that ranks
  the list is subcontracts between $50,000 and $2,000,000, the profile's teaming band.
- **Which programs.** For each prime, the awards ending between three and twenty-four months from
  today under PSC DA01 or D3xx (the Horizon lens), largest obligation first.
- **The rule.** A prime passes when at least two of those awards carry a subcontracting plan
  (FAR 19.7 code C, D, E, F, G or H on the latest action) and report at least one subcontract.
  Defense-heavy primes are flagged, not excluded. Ten pass in rank order below; the rest are listed
  under "Next in line".
- **The tracked entity.** A prime's firm target keys on the entity (UEI) that holds its Award 1;
  sibling entities of the same parent are named in the dossier.

Plan codes seen on the awards read today: F "Individual subcontract plan" (most), C "Plan
required – incentive not included", G "Commercial subcontract plan", B "Plan not required", and
none. Codes A (no subcontracting possibilities), D (plan required, incentive included), E (pre-2004)
and H (DoD comprehensive plan) exist in the FPDS dictionary and were not seen.

### The scope in numbers (2026-10-23)

| Fact | Value |
|---|---|
| Contracts in scope | 16,507 |
| … that began in the window | 5,885 |
| Vehicles in scope | 1,905 |
| Subcontracts reported under them | 6,057 rows, 5,952 distinct |
| Primes reporting them | 117 |
| Contracts with PSC DA01 only | 6,794 |
| Keyword "application modernization" inside the scope | 2 |
| Small-business primes in the same NAICS and window | 35,092 |
| Largest PSCs by dollars | DA01 $13.1B, R499, DA10, DF01, DG01, R425, 7A21, 7F20, DD01, D399 |

Keywords find almost nothing in this data; the codes find the work. The six integrators the
2026-10-13 report named (CACI, GDIT, Booz Allen, Leidos, Accenture Federal Services, SAIC) are
all in the ten.

## The ten

| # | Prime (tracked UEI) | Subcontracts $50K–$2M, FY2026 to date | Distinct subcontractors | Active app-dev awards ending ≤ 24 mo (all PSC) | Defense share of active awards |
|---|---|---|---|---|---|
| 1 | GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC. (SMNWM6HN79X5) | 585 of 739 | 245 | 64 (200) | 48% |
| 2 | BOOZ ALLEN HAMILTON INC (KHK6E1JW9C15) | 498 of 642 | 238 | 48 (128) | 38% |
| 3 | ACCENTURE FEDERAL SERVICES LLC (C47BNA8GM833) | 493 of 555 | 232 | 100 (200) | 17% |
| 4 | CACI, INC. - FEDERAL (N3PBJAVNKF61) | 482 of 587 | 199 | 31 (92) | 41% |
| 5 | LEIDOS, INC. (MDSWM6MB1BH7) | 477 of 586 | 144 | 27 (66) | 53% |
| 6 | SALIENT CRGT, INC. (Q5LJNF15T2R5) | 380 of 443 | 173 | 9 (20) | 10% |
| 7 | PERATON INC. (ZBPQEJVECCT4) | 219 of 340 | 190 | 39 (131) | 34% |
| 8 | CGI FEDERAL INC. (TRKEP1HEBNS5) | 172 of 205 | 91 | 30 (138) | 4% |
| 9 | SCIENCE APPLICATIONS INTERNATIONAL CORPORATION (MMLKPW9JLX64) | 165 of 201 | 81 | 38 (96) | 23% |
| 10 | INTERNATIONAL BUSINESS MACHINES CORPORATION (VV9KH3L99VE3) | 159 of 169 | 58 | 20 (76) | 16% |

## Dossiers

### 1. GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC.

- **Parent:** GENERAL DYNAMICS CORP. **Tracked UEI:** SMNWM6HN79X5.
- **Subcontracting behaviour (FY2026 to date):** 585 subcontracts of $50K–$2M ($224.1M) out of 739 reported, 245 distinct subcontractors across 88 awards; 28% under DA01; 7% for Defense buyers.
- **Active awards ending within 24 months:** 64 app-development (DA01 or D3xx), 200 in all; Defense share 48%. **Clearance flag:** check that any package is unclassified.
- **Award 1: 47QFCA22F0018** — General Services Administration.Federal Acquisition Service.GSA FAS AAS FEDSIM; DELIVERY ORDER under 47QTCK18D0003; ends 2027-04-03, with options 2029-04-03; obligated $465.3M of $751.6M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 261 subcontracts reported ($228.2M). "MANAGED APPLICATION, INFRASTRUCTURE, NETWORKING, ENTERPRISE, AND SECURITY SERVICES (MAINES) IN SUPPORT OF THE ENVIRONMENTAL PROTECTION AGENCY (EPA)"
- **Award 2: 47QFCA24F0009** — General Services Administration.Federal Acquisition Service.GSA FAS AAS FEDSIM; DELIVERY ORDER under 47QTCK18D0003; ends 2027-02-04, with options 2030-02-04; obligated $326.0M of $922.1M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 74 subcontracts reported ($306.0M). "THE PURPOSE OF THIS IS TO INCREMENTALLY FUND AND AWARD THE CITS TASK ORDER."
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 2. BOOZ ALLEN HAMILTON INC

- **Parent:** BOOZ ALLEN HAMILTON HOLDING CORPORATION. **Tracked UEI:** KHK6E1JW9C15. **Sibling UEIs in scope:** BOOZ ALLEN HAMILTON INC. (JCBMLGPE6Z71).
- **Subcontracting behaviour (FY2026 to date):** 498 subcontracts of $50K–$2M ($216.6M) out of 642 reported, 238 distinct subcontractors across 68 awards; 42% under DA01; 3% for Defense buyers.
- **Active awards ending within 24 months:** 48 app-development (DA01 or D3xx), 128 in all; Defense share 38%.
- **Award 1: 36C10B21N10150057** — Department of Veterans Affairs.Department of Veterans Affairs.TECHNOLOGY ACQUISITION CENTER NJ (36C10B); DELIVERY ORDER under VA11816D1015; ends 2027-09-23, with options 2027-09-23; obligated $753.1M of $773.0M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 610 subcontracts reported ($201.3M). "THE CONTRACTOR SHALL PROVIDE SHIPPABLE PRODUCTS, OPERATIONS SUPPORT, AND SECURITY COMPLIANCE FOR THE HEALTH SERVICES PORTFOLIO."
- **Award 2: 47QFRA24F0006** — General Services Administration.Federal Acquisition Service.GSA FAS AAS REGION 8; DELIVERY ORDER under 47QTCK18D0004; ends 2027-04-30, with options 2027-04-30; obligated $710.6M of $1124.0M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 428 subcontracts reported ($429.5M). "CDM DEFEND GROUP BD  BRIDGE TASK ORDER"
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 3. ACCENTURE FEDERAL SERVICES LLC

- **Parent:** ACCENTURE PLC. **Tracked UEI:** C47BNA8GM833.
- **Subcontracting behaviour (FY2026 to date):** 493 subcontracts of $50K–$2M ($201.9M) out of 555 reported, 232 distinct subcontractors across 117 awards; 44% under DA01; 10% for Defense buyers.
- **Active awards ending within 24 months:** 100 app-development (DA01 or D3xx), 200 in all; Defense share 17%.
- **Award 1: 12314418F0020** — Department of Agriculture.Office of the Chief Financial Officer.USDA, OCP-POD-ACQ-MGMT-BRANCH-FTC; DELIVERY ORDER under HHSN316201200002W; ends 2027-05-31, with options 2027-05-31; obligated $369.0M of $441.2M ceiling; subcontracting plan **C PLAN REQUIRED - INCENTIVE NOT INCLUDED**; 55 subcontracts reported ($80.6M). "USDA ENTERPRISE-SCALE FEDRAMP CERTIFIED CLOUD HOSTING SERVICES.  IGF::OT::IGF"
- **Award 2: 47QFCA21F0065** — General Services Administration.Federal Acquisition Service.GSA FAS AAS FEDSIM; DELIVERY ORDER under 47QTCK18D0036; ends 2027-08-05, with options 2028-08-05; obligated $166.6M of $340.3M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 48 subcontracts reported ($48.9M). "AWARDED TASK ORDER 47QFCA21F0065 FOR THE USMS MISSION MODERNIZATION PROGRAM."
- Also read, not counted: W52P1J20C0005 (plan B, 204 subcontracts).
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 4. CACI, INC. - FEDERAL

- **Parent:** CACI INTERNATIONAL INC. **Tracked UEI:** N3PBJAVNKF61.
- **Subcontracting behaviour (FY2026 to date):** 482 subcontracts of $50K–$2M ($214.0M) out of 587 reported, 199 distinct subcontractors across 26 awards; 37% under DA01; 8% for Defense buyers.
- **Active awards ending within 24 months:** 31 app-development (DA01 or D3xx), 92 in all; Defense share 41%. **Clearance flag:** check that any package is unclassified.
- **Award 1: 47QFRA24F0005** — General Services Administration.Federal Acquisition Service.GSA FAS AAS REGION 8; DELIVERY ORDER under 47QTCK18D0009; ends 2027-04-30, with options 2027-04-30; obligated $977.9M of $1230.4M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 566 subcontracts reported ($994.0M). "CDM DEFEND GROUP A  BRIDGE TASK ORDER"
- **Award 2: 70B04C24F00001129** — Department of Homeland Security.US Customs and Border Protection.INFORMATION TECHNOLOGY CONTRACTING DIVISION; DELIVERY ORDER under 47QTCK18D0009; ends 2027-09-29, with options 2027-09-29; obligated $714.2M of $751.9M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 30 subcontracts reported ($69.3M). "BORDER ENFORCEMENT APPLICATIONS FOR GOVERNMENT LEADING-EDGE INFORMATION TECHNOLOGY"
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 5. LEIDOS, INC.

- **Parent:** LEIDOS, INC.. **Tracked UEI:** MDSWM6MB1BH7. **Sibling UEIs in scope:** LEIDOS, INC. (UE9QJD4KK1L6) [also: LEIDOS HOLDINGS, INC.]; LEIDOS, INC. (QLNMVC12KWY3) [also: LEIDOS HOLDINGS, INC.]; LEIDOS, INC. (MYKLJHTX3MM7) [also: LEIDOS HOLDINGS, INC., LOCKHEED MARTIN CORP]; LEIDOS, INC. (JSTDGZNFP4A3) [also: LEIDOS HOLDINGS, INC.].
- **Subcontracting behaviour (FY2026 to date):** 477 subcontracts of $50K–$2M ($148.3M) out of 586 reported, 144 distinct subcontractors across 37 awards; 55% under DA01; 46% for Defense buyers.
- **Active awards ending within 24 months:** 27 app-development (DA01 or D3xx), 66 in all; Defense share 53%. **Clearance flag:** check that any package is unclassified.
- **Award 1: 15A00020FAQA00189** — Department of Justice.Bureau of Alcohol, Tobacco, Firearms and Explosives Acquisition and Property Management Division.ATF ACQUISITIONS MGMT DIV; DELIVERY ORDER under 47QTCK18D0008; ends 2027-04-30, with options 2029-04-30; obligated $639.9M of $873.6M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 423 subcontracts reported ($150.9M). "ESA V MANAGED SERVICES (ATF AND FCS)"
- **Award 2: 47QFCA24F0039** — General Services Administration.Federal Acquisition Service.GSA FAS AAS FEDSIM; DELIVERY ORDER under 47QTCK18D0008; ends 2027-03-05, with options 2029-09-05; obligated $201.3M of $331.2M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 64 subcontracts reported ($151.9M). "ARMY GLOBAL UNIFIED NETWORK  INCREMENT 1"
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 6. SALIENT CRGT, INC.

- **Parent:** SALIENT CRGT, INC.. **Tracked UEI:** Q5LJNF15T2R5.
- **Subcontracting behaviour (FY2026 to date):** 380 subcontracts of $50K–$2M ($167.6M) out of 443 reported, 173 distinct subcontractors across 12 awards; 22% under DA01; 0% for Defense buyers.
- **Active awards ending within 24 months:** 9 app-development (DA01 or D3xx), 20 in all; Defense share 10%.
- **Award 1: 47QFCA21F0073** — General Services Administration.Federal Acquisition Service.GSA FAS AAS FEDSIM; DELIVERY ORDER under 47QTCK18D0060; ends 2027-09-06, with options 2028-09-06; obligated $485.4M of $875.7M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 142 subcontracts reported ($190.5M). "DEA BLUESTONE AWARD"
- **Award 2: 47QFCA22F0026** — General Services Administration.Federal Acquisition Service.GSA FAS AAS FEDSIM; DELIVERY ORDER under 47QTCK18D0060; ends 2027-06-02, with options 2029-06-02; obligated $332.9M of $524.5M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 245 subcontracts reported ($197.3M). "ENTERPRISE SUPPORT SERVICES AND ENDPOINT TECHNOLOGY (ESSET) TASK ORDER (47QFCA22F0026) AWARD FROM TASK ORDER REQUEST (47QFCA21F0072) IN SUPPORT OF THE US EPA."
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 7. PERATON INC.

- **Parent:** PERATON (Peraton Inc. and Peraton Enterprise Solutions). **Tracked UEI:** ZBPQEJVECCT4. **Sibling UEIs in scope:** PERSPECTA ENTERPRISE SOLUTIONS LLC (MBSRAWAQ9559).
- **Subcontracting behaviour (FY2026 to date):** 219 subcontracts of $50K–$2M ($121.3M) out of 340 reported, 190 distinct subcontractors across 82 awards; 16% under DA01; 8% for Defense buyers.
- **Active awards ending within 24 months:** 39 app-development (DA01 or D3xx), 131 in all; Defense share 34%.
- **Award 1: 19AQMM20F1777** — Department of State.Department of State.ACQUISITIONS - AQM MOMENTUM; DELIVERY ORDER under HHSN316201200036W; ends 2027-06-03, with options 2027-06-03; obligated $353.6M of $382.6M ceiling; subcontracting plan **C PLAN REQUIRED - INCENTIVE NOT INCLUDED**; 43 subcontracts reported ($118.8M). "INCREMENTAL FUNDING"
- **Award 2: 1605DC19F00028** — Department of Labor.Office of the Assistant Secretary for Administration and Management.DOL - ITAS DIVISION A PROCUREMENT; DELIVERY ORDER under GS35F146DA; ends 2027-03-15, with options 2027-03-15; obligated $322.1M of $336.8M ceiling; subcontracting plan **G COMMERCIAL SUBCONTRACT PLAN**; 64 subcontracts reported ($185.8M). "DOL ENTERPRISE OPERATIONS AND MAINTENANCE SUPPORT SERVICES"
- Also read, not counted: EDFSA15O0090 (plan none, 321 subcontracts).
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 8. CGI FEDERAL INC.

- **Parent:** GROUPE CGI INC. **Tracked UEI:** TRKEP1HEBNS5.
- **Subcontracting behaviour (FY2026 to date):** 172 subcontracts of $50K–$2M ($51.6M) out of 205 reported, 91 distinct subcontractors across 60 awards; 32% under DA01; 2% for Defense buyers.
- **Active awards ending within 24 months:** 30 app-development (DA01 or D3xx), 138 in all; Defense share 4%.
- **Award 1: 47QFRA20F0021** — General Services Administration.Federal Acquisition Service.GSA FAS AAS REGION 8; DELIVERY ORDER under 47QTCK18D0022; ends 2027-09-04, with options 2028-09-04; obligated $332.6M of $548.5M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 244 subcontracts reported ($81.8M). "DYNAMIC AND EVOLVING FEDERAL ENTERPRISE NETWORK DEFENSE TASK ORDER GROUP F (DEFEND F)"
- **Award 2: 47QFRA24F0007** — General Services Administration.Federal Acquisition Service.GSA FAS AAS REGION 8; DELIVERY ORDER under 47QTCK18D0022; ends 2027-04-30, with options 2027-04-30; obligated $147.9M of $289.4M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 58 subcontracts reported ($88.9M). "CDM DEFEND GROUP C  BRIDGE TASK ORDER"
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 9. SCIENCE APPLICATIONS INTERNATIONAL CORPORATION

- **Parent:** SCIENCE APPLICATIONS INTERNATIONAL CORPORATION. **Tracked UEI:** MMLKPW9JLX64.
- **Subcontracting behaviour (FY2026 to date):** 165 subcontracts of $50K–$2M ($67.9M) out of 201 reported, 81 distinct subcontractors across 31 awards; 64% under DA01; 5% for Defense buyers.
- **Active awards ending within 24 months:** 38 app-development (DA01 or D3xx), 96 in all; Defense share 23%.
- **Award 1: 70B04C20F00001359** — Department of Homeland Security.US Customs and Border Protection.INFORMATION TECHNOLOGY CONTRACTING DIVISION; DELIVERY ORDER under 47QTCK18D0001; ends 2027-03-16, with options 2027-09-16; obligated $615.5M of $701.5M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 92 subcontracts reported ($930.0M). "U.S. CUSTOMS AND BORDER PROTECTION (CBP) OFFICE OF INFORMATION TECHNOLOGY, (OIT) TARGETING AND ANALYSIS SYSTEMS PROGRAM DIRECTORATE (TASPD)'S OPERATIONS AND MAI"
- **Award 2: 47QFCA23F0017** — General Services Administration.Federal Acquisition Service.GSA FAS AAS FEDSIM; DELIVERY ORDER under 47QTCK18D0001; ends 2027-03-01, with options 2028-03-01; obligated $388.7M of $500.0M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 201 subcontracts reported ($350.2M). "DCSA ONE IT TASK ORDER"
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

### 10. INTERNATIONAL BUSINESS MACHINES CORPORATION

- **Parent:** INTERNATIONAL BUSINESS MACHINES CORPORATION. **Tracked UEI:** VV9KH3L99VE3.
- **Subcontracting behaviour (FY2026 to date):** 159 subcontracts of $50K–$2M ($53.5M) out of 169 reported, 58 distinct subcontractors across 27 awards; 56% under DA01; 0% for Defense buyers.
- **Active awards ending within 24 months:** 20 app-development (DA01 or D3xx), 76 in all; Defense share 16%.
- **Award 1: GS11Q17BJP0005** — General Services Administration.Federal Acquisition Service.GSA FAS AAS REGION 11; DELIVERY ORDER under HHSN316201200030W; ends 2027-05-14, with options 2027-05-14; obligated $96.4M of $99.1M ceiling; subcontracting plan **C PLAN REQUIRED - INCENTIVE NOT INCLUDED**; 48 subcontracts reported ($10.7M). "IGF::OT::IGF GINNIE MAE IT INFRASTRUCTURE CONSOLIDATION"
- **Award 2: 2032H524F00199** — Department of the Treasury.Internal Revenue Service.IT OPERATIONS; DELIVERY ORDER under 47QTCK18D0014; ends 2027-03-29, with options 2029-03-29; obligated $90.3M of $147.9M ceiling; subcontracting plan **F INDIVIDUAL SUBCONTRACT PLAN**; 254 subcontracts reported ($52.6M). "MODERNIZED E-FILE (MEF)"
- **Your step:** the prime's website → Suppliers / Small Business / Doing business with us → register → the Small Business Liaison Officer → record the contact and portal on the firm target; then one note naming Award 1.

## Next in line

| Group | Subcontracts $50K–$2M | Active app-dev (all) | Defense share | Rule |
|---|---|---|---|---|
| MANTECH | 147 | 5 (19) | 21% | passes |
| BAE SYSTEMS TECHNOLOGY SOLUTIONS | 92 | 10 (17) | 18% | no qualifying award read |
| DELOITTE | 85 | 36 (181) | 17% | passes |
| HALVIK | 79 | 17 (36) | 6% | no qualifying award read |
| SOLDIERPOINT DIGITAL HEALTH | 79 | 11 (42) | 0% | passes |
| ECS FEDERAL | 62 | 4 (16) | 31% | one qualifying award |
| GUIDEHOUSE | 24 | 6 (15) | 7% | one qualifying award |
| GOVCIO | 16 | 10 (17) | 0% | passes |
| ORACLE HEALTH GOVERNMENT SERVICES | 0 | 14 (16) | 0% | passes |
| PALANTIR USG | 0 | 4 (17) | 94% | no qualifying award read |

## Your steps, per prime

1. Register Enfav where the prime has a portal or a form: "Where to register" below gives each of
   the ten, what its form asks for and who to write to afterwards (the onboarding checklist in
   `docs/ingestion/` covers the W-9, banking, insurance and due diligence that follow a first
   subcontract).
2. Find the Small Business Liaison Officer or the capture or program manager for Award 1.
3. Record the contact and the portal on the firm target (in notes until Phase 2 lands contacts and
   links), move the stage to `contacted` when the note goes out.
4. Send one note that names Award 1 and its buyer, offers one or two specific things from the
   capability statement that fit the award's description, asks whether the program needs
   additional small-business engineering capacity and for an introduction to the program manager,
   and attaches the capability statement. State remote delivery, U.S.-citizen principal,
   unclassified work.
5. After five business days of silence, one concise follow-up, then move on. Phase 2 raises a
   quiet-target alert into your Telegram digest for exactly this.

Activity targets from the checklist: ten researched primes (done here), five outreach contacts, one
qualified conversation.

## Where to register, checked 2026-10-23

Read from each prime's own pages on 2026-10-23; the forms themselves change, so expect small
differences. Registering lists Enfav in a database its buyers search; none of the ten says it leads
to work by itself. The note to the liaison or the program, naming the award, is what gets a reply.

| Prime | Where | What the form asks for | Who to write to after |
| --- | --- | --- | --- |
| GDIT | General Dynamics Enterprise Supplier Registration Portal, `suppliers.gendyn.com`, "Create An Account" | legal name, tax ID, DUNS, CAGE, legal structure, year established, employees, three years' sales, headquarters, primary contact, NAICS, capabilities, capability documents, certifications | the portal's SBLO list names the GDIT SBLO (Virginia Foley, 571-404-3094; email behind the page's link) |
| Booz Allen | `supplier.bah.com`, "New Supplier? Register Now" | legal name, DBA, website, legal structure, federal tax ID, UEI, DUNS, contact, headquarters; then the signed W-9 emailed to `BoozAllenSupplierPortal@bah.com`; no NAICS, certification or capability fields on the form | the Small Business Office (`boozallen.com/menu/suppliers-and-small-businesses/small-business-program.html`, no email published; help desk 877-927-8278) |
| Accenture Federal Services | "Submit your registration here" on `accenture.com/en-us/support/us-federal-government/small-business-services-overview`, a script-rendered form at `smartafs.my.site.com/smallbusiness` | not readable without a browser | the Small Business Liaison Officer and deputy named on that page (LinkedIn only) |
| CACI | `supplier.caci.com`, "New Supplier? Register Now" (free, minutes; help desk 833-275-2224 option 1); then keep the SAM small-business representations current, CACI's stated second step | not readable without an account | the Small Business Advocacy Office (`caci.com/small-business-advocacy-office`, email behind the page's link) or one of its events |
| Leidos | no open portal: `supplier-portal.leidos.com` is for invited suppliers; the small-business page `leidos.com/suppliers/small-business-relationships` carries an intake form for U.S. small businesses and announces virtual matchmaking forums | not readable without a browser | the program's business developers, through the forums; no office email published |
| Salient CRGT (GovCIO since 2021) | GovCIO Supplier Registration, `apps.govcio.com/Public/Contracts/SB` (the host refused my fetch; open it in a browser) | UEI, CAGE, NAICS and PSC codes, SAM status, size categories, contacts, capability statement or line card, current customers, past services, clearances, schedule access; a DUNS field remains | none published |
| Peraton | Prospective supplier form, `peraton.com/suppliers/prospective-supplier-intake-form` | company, address, website, contact, U.S.-owned, UEI (required), CAGE, NAICS, capability statement upload (PDF, two pages at most), business classification, ISO/CMMI/facility-clearance boxes, past performance with dates and vehicle | `peratonsmallbusiness@peraton.com` |
| CGI Federal | CGI Federal Network on GovWin, `om.govwin.com/cgifederal`, "Join Network" (a free GovWin account), upload the capability statement | GovWin's company profile plus the statement | Tyler Brooks-Craft, Small Business Programs, `tyler.brooks-craft@cgifederal.com` |
| SAIC | `suppliers.saic.com`, "Start Registration" (new companies only; information may be shared with government representatives) | the same checklist as GDIT's: legal name, tax ID, DUNS, CAGE, legal structure, year, employees, three years' sales, headquarters, contact, NAICS, capabilities | the Suppliers and Small Business page names the Director of Small Business Programs; SAIC says it picks teammates six to twelve months before a solicitation |
| IBM | the "U.S. Federal and Public Sector" flyer (`ibm.com/downloads/cas/7ZGKZYO3`) carries the "Submit qualifications" link and QR code, aimed at small **diverse** businesses; the diverse-supplier form states "company must be diverse, do not submit if not met" | the general "Become a supplier to IBM" Ariba form stays open to any supplier | IBM's Federal Small Business Liaison Officer (no name published); supplier diversity mailbox `sdportal@us.ibm.com` |

What every form wants ready, from the ten: legal name and structure, year established, employee
count, headquarters, website, a primary contact, UEI and CAGE (from SAM, never in marketing
documents), tax ID type and EIN, NAICS 541511/541512/541519, a capability statement of two pages at
most, past performance as lines of customer, dates and vehicle (commercial customers count), and
the honest answers on certifications and clearances: none to claim. SAM must be active with the
small-business representations current. Third-party guides claim a two-year minimum in business
at Booz Allen, CACI and Peraton; none of the three says so on its own pages.

## Fit ranking, measured 2026-10-23

The shortlist above ranks primes by in-band subcontracts, and that count includes product
pass-through: subcontracts to resellers (Carahsoft, Dell, World Wide Technology, CDW and the like)
and rows whose description says COTS, license, hardware or subscription. Separating those out,
and keeping only civilian subcontracts (awarding agency not the Department of War), gives the
engineering door a small software firm can actually walk through. Same data (FY2026 to date,
$50K–$2M, NAICS 541511/541512/541519 awards by other-than-small primes), same ten primes.

| Prime | In-band | Product share | Civilian service subs | Firms / programs | One-time firms | ≤ $250K | App-dev awards ending ≤ 24 mo | Door |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Accenture Federal Services | 494 | 13% | 380 | 173 / 87 | 29% | 51% | 100 | browser form, SBLO named |
| Salient CRGT + GovCIO | 404 | 25% | 292 | 153 / 12 | 38% | 50% | 9 + 10 | form (host refused my fetch) |
| Booz Allen Hamilton | 500 | 49% | 233 | 122 / 39 | 37% | 46% | 48 | portal + W-9 email |
| Leidos | 493 | 41% | 201 | 70 / 14 | 24% | 69% | 27 | invitation only |
| IBM | 187 | 3% | 182 | 54 / 24 | 9% | 63% | 20 | diverse-certified only |
| Peraton | 219 | 23% | 152 | 85 / 50 | 36% | 39% | 39 | form + email |
| CGI Federal | 173 | 31% | 116 | 66 / 38 | 29% | 63% | 30 | GovWin + named email |
| CACI | 493 | 76% | 97 | 73 / 11 | 58% | 40% | 31 | portal + advocacy office |
| SAIC | 167 | 56% | 70 | 32 / 18 | 26% | 51% | 38 | portal |
| GDIT | 588 | 89% | 55 | 42 / 31 | 64% | 24% | 64 | GD portal + SBLO named |

What the subcontractors did is readable only where the prime writes descriptions (Booz Allen,
Peraton, SAIC); the other seven report "services", "procurement in support of the SOW" or
nothing. Where readable, Booz Allen's subs do systems engineering and development (VA), IT
modernization and cyber; Peraton's do functional testing and development and maintenance
(Treasury), modernization and consolidation (State); SAIC's do IDRS modernization (IRS) and
Oracle E-Business development (DOT). Three GSA FEDSIM orders serve Defense customers and are
counted as civilian above: Peraton's DC3 TABO, SAIC's DCSA One IT and NORAD NITES.

The programs behind the civilian service subcontracts, by prime:

- **Accenture Federal Services**: IRS Integrated Enterprise Portals 1.5 bridge (plan F, ends
  2027-08-14, $143M of $181M), VA VBA DGIB support (plan F, ends 2026-12-29, $384M of $572M),
  GSA CASTLE-NET (plan F, ends 2027-06-07, $180M of $1.4B). Its subs are small IT-services and
  staffing firms: it buys labor on large civilian programs.
- **Booz Allen**: VA Health Services Portfolio order 36C10B21N10150057 (64 service subs this
  year; plan F; ends 2027-09-23), CDC Data Modernization Accelerator 47QFCA23F0058 (plan F,
  ends 2027-04-22, $561M of $1.5B), CDM DEFEND Group BD bridge. Twelve subcontracts went through
  MBO Partners, a platform for independent consultants: a route for a one-person firm.
- **Peraton**: Education FSA Virtual Data Center (321 subs, ends 2027-07-31), DOL enterprise
  O&M (plan G, ends 2027-03-15), State Consular Affairs enterprise infrastructure (ends
  2026-12-17), Treasury development and testing orders. Subcontracts skew larger (median $338K).
- **Salient CRGT / GovCIO**: GSA MAVERICK 47QFCA24F0020 (183 subs this year; plan F; ends
  2029-05-16; $920M of $2.0B; its subs are network, AV and endpoint firms), EPA ESSET (endpoint
  technology), VA Technology Incubation Services 2.0 36C10B24F0226 (plan F, ends 2027-09-24,
  $270M of $317M; 28 subs this year), the closest program to agentic-AI prototyping on the list.
- **CGI Federal**: USCIS Records Management and Support Services 70SBUR23F00000104 (plan F, ends
  2027-07-14, $104M of $156M), DEFEND (CDM) task order, SSA. Subs are small software and
  staffing firms; 63% of subcontracts are $250K or less.
- **CACI**: NASA Consolidated Application and Platform Services 80TECH24CA002 (plan F, ends
  2027-06-30, $277M of $2.0B), CBP BEAGLE border enforcement applications (ends 2027-09-29),
  GSA ELITE (ends 2029-05-31). The other 376 in-band rows are CDM product flow.
- **SAIC**: IRS IDRS modernization, DOT Oracle E-Business development, FAA cyber assessments;
  its larger GSA orders serve Defense customers.
- **GDIT**: 526 of 588 in-band rows are product; the 55 service subs sit on 31 programs (CBP,
  Interior IHS EHR, HHS), 64% to firms that got one subcontract.
- **Leidos**: civilian subs are mostly resellers under NASA NEST; DHS HEITS 47QFCA23F0039 (plan
  F, ends 2030-12-31, $396M of $932M) is the civilian application door; 44% of in-band subs are
  Defense; the portal is invitation-only.
- **IBM**: IRS Modernized e-File (75 subs this year; plan F; ends 2027-03-29), NOAA NWS, FEMA;
  54 firms, 9% one-time: a closed circle, and registration asks for a diversity certification.

Recommendation for a one-person, unclassified, remote software firm: register with every open
door (eight of ten, free, fifteen to thirty minutes each), and spend the outreach on **Booz
Allen** (the VA order and CDC DMAC; the note is drafted), **Accenture Federal Services** (the
widest pipeline; VBA DGIB recompetes now), and **Peraton** (the closest work match and the
easiest door), then **GovCIO** for VA TIS 2.0 and **CGI Federal** for USCIS records
management. One note each to CACI (NASA NCAPS, CBP BEAGLE), SAIC (IRS IDRS) and GDIT (MAINES).
Leave Leidos and IBM until a clearance or a certification exists.

## The capability statement

The checklist asks for a one-page AI capability statement. On disk there is a two-page AI-framed
statement (2026-10-15) and a one-page statement that predates the AI framing. The website's
`/government` page prints as the current statement. Say if you want a one-page print variant.

## Public directories, checked 2026-10-23

- SBA's directory of prime contractors with subcontracting plans is FPDS data (vendor, agency,
  PSC and NAICS, contract number, dates, value; no liaison contact); the current page returned 404
  and the legacy page lists FY2018–FY2024 spreadsheets. The award record's plan code gives the
  same fact per award, so the tool reads it there (Phase 1).
- GSA's "Subcontracting Directory for Small Businesses" is a spreadsheet on data.gov dated
  2025-03-13 keyed by UEI; GSA's own page no longer mentions it.
- SBA SubNet lists subcontracting opportunities with a contact per posting; no export or API.
  Worth a weekly look by NAICS.
- The Department of War's CSP prime-contractor directory (PDF, May 2026) names the liaison officers
  of the large defense primes. SSA's OSDBU subcontracting directory names them for SSA primes.

## What changed in the tool today

- Profile `enfav`: UEI entered; PSC families set to D3, DA, DD, DF, DH, DJ, R425; interests set to
  the checklist's topics (artificial intelligence, application modernization, workflow automation,
  document processing, data integration, software development); NAICS and the $50K–$2M teaming
  band unchanged.
- Four manufacturing SAM.gov searches removed; the four software searches stay in the daily pull.
- Three saved views on the Spending page, on the two-year preset "This and prior fiscal year".
- Ten firm targets and twenty award targets, with the evidence above in their notes.
- The profile's Introductions section: the company in a line, how it delivers, how a reader reaches it (the
  website's contracting address), and four offers taken from the website's services page, which the drafted
  notes cite by position.
- Landed the same night: the award page's subcontracting-plan row, the firm card's website, the two-year window,
  the Tracking column on the Primes lens, the tracker's contacts, links, activity log, next action and CSV, the
  quiet-target alert, and the introduction-note pipeline with its Draft panel (`docs/govcon/teaming.md`).

## Findings about the tool from this pass

- The Primes lens once read 200 of 4,763 in-band subcontracts for this scope: USAspending answered one
  date-sorted subaward page in 28 s and the next not within the adapter's 30 s, and a timed-out page ends
  the read. Re-measured a minute later on fresh scopes, the date- and amount-sorted pages both answered in
  0.4–7 s, so the read order and the retry policy were left as they are: a slow spell at the source.
- The Where lens shows 25 recipients; the API pages 100 at a time.
- The award record's subcontracting-plan code and the SAM record's website were not read; both are now
  (the plan on the award page, the website on the firm card after a lookup).
- No window covered FY2026 and FY2027 together; "This and prior fiscal year" does now.
- Children of one parent (five Leidos entities, two each for Booz Allen, Peraton, CACI and
  Deloitte) are ranked separately; the recipient profile knows the parent.
- Two introductions were drafted live on 2026-10-24 (GDIT's FEDSIM order 47QFCA22F0018, Booz Allen's VA
  order 36C10B21N10150057): both accepted on the second iteration, 55 → 85 in 2 min 46 s and 65 → 80 in
  2 min 30 s; the most any stage wrote was 4,737 output tokens (the claims critic), well under its cap.
- The first note closed with an address the goal never stated. Fixed in the data: the profile's introduction
  section now carries how a reader reaches the company, the goal states it, and the producer is told never to
  supply one.
- The claims critic read the goal's ask as two requests (capacity, and an introduction) in three of four
  iterations and said the goal's owner had to pick one. Fixed in the data: the declared ask now asks for the
  introduction alone. Review the two notes at `http://localhost:4202/awards/<externalId>` on each award's page.

## Method files

Scripts and raw results are in the session scratchpad under `live/teaming/`: `walk-subawards.mjs`
(the full subcontract walk), `parents.mjs`, `horizon-candidates.mjs`, `select.mjs`, `targets.mjs`,
`report.mjs`, with `subawards-fy26-27.json`, `subawards-by-parent.json`, `horizon-candidates.json`
and `shortlist.json`.
