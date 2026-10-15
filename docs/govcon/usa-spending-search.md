For Enfav LLC, I recommend using USAspending primarily to identify federal prime contractors that already have funded software projects and may need subcontractors.

Your strongest targets are AI/workflow automation, custom software development, API integrations, database modernization, and automated testing/DevOps. We'll exclude 3D printing entirely.

I reviewed USAspending's current Advanced Search filters, federal NAICS definitions, and GSA's Product Service Code (PSC) classifications. Below are the exact settings I recommend.

## 1. Start with these USAspending parameters

Open [USAspending Advanced Search](https://www.usaspending.gov/search).

This is your default research profile for identifying potential prime-contractor customers.

| USAspending filter   | Recommended setting                                               |
| -------------------- | ----------------------------------------------------------------- |
| View By              | Prime Awards and Transactions                                     |
| Results level        | Prime Awards initially                                            |
| Time Period          | FY2024, FY2025, FY2026, FY2027                                    |
| Show New Awards Only | OFF initially                                                     |
| Award Type           | Contracts                                                         |
| Recipient            | Leave blank                                                       |
| Recipient Type       | Other Than Small Business for large-prime discovery; later remove |
| Award Amount         | $500,000–$25,000,000 initially                                    |
| NAICS                | 541511, 541512, 541519                                            |
| PSC                  | Start with DA01 in a separate search                              |
| Keyword              | Leave blank for first search                                      |
| Agency               | All agencies initially                                            |
| Location             | All U.S. / no state restriction                                   |
| Type of Set Aside    | All / no restriction                                              |
| Contract Pricing     | All                                                               |
| Extent Competed      | All                                                               |

These ranges are prospecting recommendations, not government thresholds. USAspending confirms that Advanced Search supports the award, recipient, NAICS, PSC, amount, agency and date filters used here.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.usaspending.gov&sz=32)

USAspending

+1

Important: Do not apply every filter simultaneously at first. Begin with the three NAICS codes and no PSC filter, then run a separate search with the PSC filter. USAspending combines different filter categories restrictively, so applying too many at once can eliminate relevant awards.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com&sz=32)

GitHub

Because today is October 13, 2026, we are already in federal FY2027, which began October 1, 2026. If FY2027 is not available in the site's fiscal-year buttons, use a custom date range ending today.

## 2. NAICS codes — which ones are best for Enfav?

These codes describe the industry providing the service.

| Priority | NAICS    | Description                                                                            | Enfav fit                                                                                 |
| -------- | -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1        | `541511` | Custom Computer Programming Services                                                   | Excellent: AI automation, custom applications, APIs, software development, testing        |
| 2        | `541512` | Computer Systems Design Services                                                       | Excellent: system integrations, modernization, distributed architecture, workflow systems |
| 3        | `541519` | Other Computer Related Services                                                        | Good: broader technical consulting, IT support and specialized integration work           |
| 4        | `518210` | Computing Infrastructure Providers, Data Processing, Web Hosting, and Related Services | Secondary: hosted platforms, cloud/data processing solutions                              |

The Census Bureau specifically includes writing, modifying, testing and supporting customer software under `541511`, and integration-oriented system design under `541512`.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.census.gov&sz=32)

census.gov

+1

First search: select `541511`, `541512`, and `541519` together.

Save `518210` for another search because it may return substantial infrastructure and hosting work that is less relevant to your initial development subcontracting goals.

## 3. PSC codes — arguably even more useful than NAICS

PSC indicates what the federal government purchased, whereas NAICS describes the contractor's industry.

I recommend these codes, using the official GSA PSC Manual:

| Priority | PSC    | Official category / service                                                    | Enfav relevance                                                                |
| -------- | ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1        | `DA01` | Business Application / Application Development Support Services (Labor)        | Best overall: coding, testing, application development, DevSecOps              |
| 2        | `DH01` | Platform Support Services: Database, Mainframe, Middleware (Labor)             | Database development, middleware and integrations                              |
| 3        | `DD01` | Service Delivery Support Services: ITSM, Operations Center, Project/PM (Labor) | Agile delivery, CI/CD and IT service processes                                 |
| 4        | `R617` | Electronic Records Management Services                                         | Document conversion, electronic-records workflows and digitization             |
| 5        | `DF01` | IT Management Support Services (Labor)                                         | Enterprise architecture and systems planning                                   |
| 6        | `DA10` | Business Application / Application Development SaaS                            | Hosted application offerings; secondary for first subcontracts                 |
| 7        | `DB02` | Compute Support Services, Non-HPC (Labor)                                      | Cloud/server operations and related support; broader than software development |

[image](https://www.google.com/s2/favicons?domain=https://www.acquisition.gov&sz=32)

acquisition.gov

+3

For your first PSC search, I would choose DA01 alone. Once you understand who is buying application development, expand into `DH01`, `DD01`, and `R617` individually.

Also note that one large contract can cover AI, data, testing and several other services but still be recorded under only its predominant PSC. Do not assume other codes are irrelevant.

## 4. Run these four targeted searches

Rather than rely on one huge search, use four profiles designed for different parts of Enfav's services.

Search A — Custom software and modernization

Start here

| NAICS        | `541511`, `541512`                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| PSC          | `DA01` (separate/narrow pass)                                                                                   |
| Keywords     | Start blank; then search `application modernization`, `software development`, `system integration` individually |
| Award Amount | $500K–$25M                                                                                                      |

Goal: Find firms maintaining or modernizing federal applications with technical work Enfav could perform.

Search B — AI and workflow automation

| NAICS        | `541511`, `541512`, `541519`                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PSC          | Start blank, then `DA01` or `R617` separately                                                                                                          |
| Keywords     | `artificial intelligence`, `machine learning`, `workflow automation`, `intelligent document processing`, `robotic process automation`, `generative AI` |
| Award Amount | $500K–$25M                                                                                                                                             |

Goal: Find funded workflow/document automation work, including projects not explicitly labeled agentic AI.

Search C — API and data integration

| NAICS        | `541511`, `541512`                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| PSC          | `DH01` or `DA01` separately                                                                               |
| Keywords     | `data integration`, `API development`, `data modernization`, `ETL`, `database migration`, `data pipeline` |
| Award Amount | $500K–$25M                                                                                                |

Goal: Find integration and migration projects requiring backend engineering rather than large AI platforms.

Search D — DevOps and automated testing

| NAICS        | `541511`, `541519`                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| PSC          | `DA01` or `DD01` separately                                                                                          |
| Keywords     | `automated testing`, `software quality assurance`, `CI/CD`, `DevSecOps`, `test automation`, `continuous integration` |
| Award Amount | $250K–$15M                                                                                                           |

Goal: Find discrete QA/release automation work that a small specialist subcontractor could support.

Search each keyword separately before combining them. This avoids unexpected keyword matching behavior and makes it easier to determine which terms produce genuinely relevant awards.

## 5. Which agencies should you filter for?

Initially, leave the Agency filter blank to discover spending patterns objectively.

After the first results, I recommend testing the following agencies individually, based on likely relevance to application development, data integration and workflow modernization.

| Agency                                        | What to look for                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Department of Health and Human Services (HHS) | Application modernization, data integration, administrative workflows                               |
| Department of Veterans Affairs (VA)           | Digital services, internal systems, workflow tools                                                  |
| Department of the Treasury                    | Financial systems, data systems, automation                                                         |
| Department of Agriculture (USDA)              | Information systems, administrative/process modernization                                           |
| Department of the Interior (DOI)              | Data platforms and legacy application modernization                                                 |
| General Services Administration (GSA)         | Governmentwide IT services, shared platforms and modernization                                      |
| Department of Defense (DoD)                   | Software, automation and engineering; screen carefully for clearance and cybersecurity requirements |

These are recommended markets to investigate, not a verified ranking of recent available subcontract awards.

For your first entry, civilian unclassified software programs are a sensible focus because they may avoid some defense-specific onboarding barriers.

## 6. How to find primes most likely to need subcontractors now

After the broad searches, run a second USAspending pass using these settings:

| Filter               | Setting                      |
| -------------------- | ---------------------------- |
| View                 | Prime Awards                 |
| Time Period          | FY2026 and FY2027            |
| Show New Awards Only | ON                           |
| NAICS                | `541511`, `541512`, `541519` |
| Award Amount         | $1M–$25M                     |
| Recipient Type       | Other Than Small Business    |
| PSC                  | No filter initially          |
| Keyword              | Blank initially              |
| Location             | Nationwide                   |

This identifies recently awarded contracts. Then inspect the recipient, what was purchased and whether the work is still in an early delivery stage.

The difference between the two passes is important:

- New Awards OFF: Finds established awards, including contracts recently modified or funded. Useful for finding currently operating prime programs.
- New Awards ON: Narrows toward awards whose original/base award date falls within the date range. Useful for spotting newly awarded programs and prospective teaming opportunities.&#x20;

  [image](https://www.google.com/s2/favicons?domain=https://github.com&sz=32)

  GitHub

Do not assume a new $10 million award means $10 million of available subcontract work. The prime may have fully staffed it or already selected its partners.

### Once you open a relevant award, capture these fields

| Field                               | Why it matters                                                   |
| ----------------------------------- | ---------------------------------------------------------------- |
| Recipient Name                      | Your potential prime-contractor customer                         |
| Recipient UEI                       | Deduplicates companies and affiliated records                    |
| Award ID / PIID                     | Identifies the specific contract                                 |
| Awarding Agency / Office            | Reveals the customer and contracting organization                |
| Funding Agency                      | Indicates whose budget supports the work                         |
| NAICS and PSC                       | Describes the market and predominant service                     |
| Award Description                   | Initial indication of technical scope                            |
| Current Award Amount / Obligations  | Indicates reported federal spending and contract scale           |
| Period of Performance Start/End     | Helps identify current work and upcoming follow-on opportunities |
| Recent Transactions / Modifications | May show additional funding or work continuation                 |
| Parent Award                        | Helps identify vehicles and associated task orders               |

USAspending allows award-level and transaction-level downloads and exposes these fields through its contract data.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.usaspending.gov&sz=32)

USAspending

After identifying a recipient, search the company's website for its small-business liaison, supplier registration and the particular program/team. That's the bridge from spending research to actual subcontracting business development.

## 7. Don't forget USAspending's Subawards view

After your prime-award research, switch View By → Subawards and search the same recent fiscal years.

This can reveal which prime contractors have reported passing federal award funds to subcontractors. The prime/subrecipient relationships are useful evidence that a firm has participated in subcontracting.

However, subaward reporting does not capture every subcontract or future vacancy, so do not discard a prime just because you don't find relevant subaward records. USAspending explicitly distinguishes prime-award and subaward data.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.usaspending.gov&sz=32)

USAspending

## 8. The exact first search I would run today

### Enfav Prime Discovery — Search 001

&#x20;Copy filters

| View              | Prime Awards and Transactions |
| ----------------- | ----------------------------- |
| FY                | 2024, 2025, 2026, 2027        |
| NAICS             | `541511`, `541512`, `541519`  |
| PSC               | Blank                         |
| Keyword           | Blank                         |
| Amount            | $500K–$25M                    |
| Recipient Type    | Other Than Small Business     |
| Agency / Location | All / Nationwide              |
| New Awards Only   | OFF                           |

Open USAspending Advanced Search This opens the search page; enter the settings above. It is not a pre-filtered URL.

Review the award results and identify 20 companies whose contracts involve actual software delivery. Then rank them by technical match, the presence of an identifiable program contact, ongoing funded work, available supplier channels and contract-specific security requirements.

For Enfav's custom lead-management software, I'd maintain separate saved search profiles for Software Development, AI/Workflow Automation, Data/API Integration, and DevOps/Testing, then consolidate results by prime recipient UEI and award ID.

My strongest recommendation: Start with 541511 + 541512 + 541519, then run DA01 as a second search. These are the most direct entry points into funded federal software projects that align with Enfav's engineering capabilities.
