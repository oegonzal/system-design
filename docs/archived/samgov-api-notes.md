# SAM.gov and USAspending API notes (archived)

The notes `packages/govcon` started from: a first request against each API and
the shape the system was meant to grow into. Kept for the provider facts; what
was built is [../govcon/overview.md](../govcon/overview.md), and the key's
variable there is the one used below, `SAM_GOV_API_KEY`.

## 1. SAM.gov Contract Opportunities API

First create/login to your SAM.gov account. You do not need to be a registered
federal contractor just to obtain the public API key; the public Opportunities
API uses a SAM.gov account API key. GSA says you generate/view it from your
Account Details page. (GSA Open Technology)

Production endpoint: `https://api.sam.gov/opportunities/v2/search`

The API requires an API key and a posted-date range. It supports filters such
as title, solicitation number, notice type, NAICS, set-aside information,
agency and pagination. (GSA Open Technology)

After generating your key, put it in an environment variable:

```bash
export SAM_GOV_API_KEY="YOUR_KEY_HERE"
```

Then make your first request:

```bash
curl --get \
  "https://api.sam.gov/opportunities/v2/search" \
  --data-urlencode "api_key=$SAM_GOV_API_KEY" \
  --data-urlencode "postedFrom=09/20/2026" \
  --data-urlencode "postedTo=09/26/2026" \
  --data-urlencode "limit=10"
```

You should receive JSON roughly structured like:

```json
{
  "totalRecords": 123,
  "limit": 10,
  "offset": 0,
  "opportunitiesData": [
    {
      "noticeId": "...",
      "title": "...",
      "solicitationNumber": "...",
      "postedDate": "...",
      "type": "...",
      "naicsCode": "...",
      "typeOfSetAside": "..."
    }
  ]
}
```

GSA confirms that responses include fields such as title, solicitation number,
posted date, organization, place of performance, point of contact, description
links, attachments and pagination information. (GSA Open Technology)

For your business, I'd eventually filter around terms like:

- additive manufacturing
- 3D printing
- rapid prototyping
- replacement parts
- reverse engineering
- automation
- workflow automation
- artificial intelligence
- data processing
- software development
- maintenance
- inventory management

But don't over-filter initially. Save the broad feed into a database and score
it yourself.

## 2. USAspending API

This one is easier. No API key is currently required. (USAspending API)

Base URL: `https://api.usaspending.gov`

A useful endpoint for your project is `POST /api/v2/search/spending_by_award/`,
which USAspending describes as its Advanced Award Search endpoint. (USAspending
API)

A simple request could look like:

```bash
curl -X POST \
  "https://api.usaspending.gov/api/v2/search/spending_by_award/" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "time_period": [
        {
          "start_date": "2025-01-01",
          "end_date": "2026-09-26"
        }
      ],
      "award_type_codes": ["A", "B", "C", "D"]
    },
    "fields": [
      "Award ID",
      "Recipient Name",
      "Award Amount",
      "Awarding Agency",
      "Start Date",
      "End Date"
    ],
    "page": 1,
    "limit": 10,
    "sort": "Award Amount",
    "order": "desc"
  }'
```

USAspending supports much richer filtering, including agencies, award amounts,
recipients, NAICS, PSC, geography and award IDs. (USAspending API)

For your use case, two especially valuable endpoints are
`/api/v2/search/spending_by_award/`, for individual historical contracts, and
`/api/v2/search/spending_by_category/naics/`, for answering: which industries
are agencies spending the most money on?

USAspending also has PSC-category, agency, recipient and spending-over-time
endpoints. (USAspending API)

## 3. Build the first TypeScript script

Since TypeScript/Node is your natural stack, I'd start extremely small:

```bash
mkdir gov-opportunity-engine
cd gov-opportunity-engine

npm init -y
npm install typescript tsx dotenv zod
npm install -D @types/node

mkdir src
touch src/sam.ts
touch src/usaspending.ts
touch .env
```

`.env`:

```bash
SAM_GOV_API_KEY=your_key_here
```

`src/sam.ts`:

```ts
import 'dotenv/config';

const params = new URLSearchParams({
  api_key: process.env.SAM_GOV_API_KEY!,
  postedFrom: '09/20/2026',
  postedTo: '09/26/2026',
  limit: '10',
});

const response = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`);

if (!response.ok) {
  throw new Error(`${response.status}: ${await response.text()}`);
}

const data = await response.json();

for (const opportunity of data.opportunitiesData ?? []) {
  console.log({
    title: opportunity.title,
    solicitation: opportunity.solicitationNumber,
    posted: opportunity.postedDate,
    naics: opportunity.naicsCode,
    setAside: opportunity.typeOfSetAsideDescription,
  });
}
```

Run:

```bash
npx tsx src/sam.ts
```

Then `src/usaspending.ts`:

```ts
const response = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    filters: {
      time_period: [
        {
          start_date: '2025-01-01',
          end_date: '2026-09-26',
        },
      ],
      award_type_codes: ['A', 'B', 'C', 'D'],
    },

    fields: [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Awarding Agency',
      'Start Date',
      'End Date',
    ],

    page: 1,
    limit: 10,
    sort: 'Award Amount',
    order: 'desc',
  }),
});

if (!response.ok) {
  throw new Error(`${response.status}: ${await response.text()}`);
}

const data = await response.json();

console.table(data.results);
```

Run:

```bash
npx tsx src/usaspending.ts
```

USAspending's documentation explicitly recommends POST requests when you're
doing more sophisticated filtering like this. (USAspending API)

## Then build the useful version

Your first real system should be:

```
                    SAM.gov
                       │
              new solicitations
                       │
                       ▼
               PostgreSQL
                       │
              normalize NAICS,
              PSC, agencies,
              keywords, dates
                       │
                       ▼
              Opportunity scorer
                       │
              ┌────────┴────────┐
              ▼                 ▼
        USAspending          Commercial
        historical           supply data
        contracts                │
              │                  │
              └────────┬─────────┘
                       ▼
                 enriched lead
                       │
                       ▼
              HIGH / MED / LOW
```

For example, SAM discovers:

```
DLA
Small Business Set-Aside
NAICS 326199
Replacement equipment component
Quantity: 400
```

Your backend then asks USAspending:

- Has the government bought similar products before?
- Who supplied them?
- How much was paid?
- Which agencies buy them?
- How frequently?
- Are there only 1–3 incumbent suppliers?

Then eventually cross-reference eBay, Octopart, DigiKey, Mouser and OEM
catalogs to answer: is this thing commercially scarce, and can I actually
source/manufacture it profitably?
