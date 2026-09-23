# Roadmap JSON guide

_Snapshot of the guide the tool generates. The lists below are the ones the application ships with - download a fresh copy from **Data -> Download the JSON guide** so they match your own settings._

This file explains the JSON the roadmap tool accepts so you can draft new
work outside the tool - including with a chat assistant - and import it.

## How to use it

1. Give this whole file to your assistant (ChatGPT, Claude, whatever you use).
2. Describe the programme, the system changes and the tasks you want, in plain words.
3. Ask for **one JSON object, following this guide exactly**.
4. Save the answer as a `.json` file.
5. In the roadmap tool: **Data -> Import -> Add to the roadmap**, choose the file.

The import is additive: it adds what is in the file and leaves everything
already on the roadmap alone. Ids are assigned by the tool, so you never
write one yourself. If a programme in your file has the same name as one
that already exists, your system changes are added under the existing
programme instead of creating a second one with the same name.

## The rules

**Create only these three things: programmes, system changes and tasks.**

* A **programme** is a business outcome or larger initiative.
* A **system change** is a deliverable underneath a programme, and it carries the dates.
* A **task** is the work underneath a system change, and it carries the effort.

**Never invent master data.** Statuses, priorities, systems, types, resource
streams, resource types, people and OKRs are maintained inside the tool by
an administrator. Use only the ids listed further down, exactly as written.
Do not add, rename or "improve" them, and do not output any other dataset
(no settings, no dependencies, no backlog, no resource scenarios).

**If nothing in a list fits, leave the field empty (`""`), never guess.**
That applies especially to people and to the resource stream: if you cannot
match a real name or a real stream, leave it empty and somebody will pick it
in the tool afterwards.

**Effort is always filled in.** Even when the stream or the owner is left
empty, every task must carry the days it needs under `days`, using the
resource type ids below. Use whole or half days. Use `0` where a discipline
is not needed. Effort belongs on tasks only: the system change and the
programme add theirs up automatically.

**Dates**

* Written as `"YYYY-MM-DD"`, for example `"2027-03-01"`.
* Only system changes have dates. Tasks run with the system change above them.
* `endDate` must be the same as, or after, `startDate`.
* A programme never has dates: the tool works them out from its system changes.
* If the timing is genuinely unknown, use `""` for both dates and say so in the notes.

## The shape

One object, with one or both of these lists. Anything else is ignored.

```json
{
  "programmes": [
    {
      "name": "Dealer Self-Service",
      "shortName": "Dealer Self-Service",
      "description": "Let dealers do for themselves what they ring us about today.",
      "businessOutcome": "Fewer support calls and faster answers for dealers.",
      "productOwners": [
        "Nicolas"
      ],
      "deliveryOwners": [],
      "status": "discovery",
      "priority": "high",
      "notes": ""
    }
  ],
  "roadmapItems": [
    {
      "programme": "Dealer Self-Service",
      "title": "Self-service order status",
      "shortTitle": "Order status",
      "systemAreas": [
        "bpp"
      ],
      "types": [
        "system-change"
      ],
      "subArea": "Dealer portal",
      "stream": "b2b",
      "status": "definition",
      "priority": "medium",
      "currentPhase": "",
      "startDate": "2027-03-01",
      "endDate": "2027-05-31",
      "targetDate": "",
      "productOwners": [],
      "deliveryOwners": [],
      "description": "Show the live status of an order in the dealer portal.",
      "businessOutcome": "Dealers stop ringing to ask where an order is.",
      "problemStatement": "Order status is only visible to the internal team.",
      "systemDependencies": "Needs the order integration to publish status changes.",
      "businessDependencies": "",
      "dataDependencies": "",
      "recommendedApproach": "",
      "tradeOffs": "",
      "pocNotes": "",
      "comments": "",
      "notes": "",
      "milestones": [
        {
          "name": "Discovery",
          "date": "2027-04-15",
          "status": "",
          "notes": ""
        }
      ],
      "risks": [],
      "gates": [],
      "tasks": [
        {
          "name": "Design the status screen",
          "description": "Screen and states, agreed with two dealers.",
          "status": "ready",
          "owner": "",
          "stream": "",
          "okrIds": [
            "kr-order-errors"
          ],
          "links": [
            {
              "label": "Jira ABC-101",
              "url": "https://jira.example.com/browse/ABC-101"
            }
          ],
          "days": {
            "po": 2,
            "dev": 8,
            "int": 0,
            "data": 0
          },
          "notes": ""
        },
        {
          "name": "Publish order status to the portal",
          "description": "Feed status changes through to the dealer portal.",
          "status": "idea",
          "owner": "",
          "stream": "",
          "okrIds": [],
          "links": [],
          "days": {
            "po": 1,
            "dev": 5,
            "int": 6,
            "data": 1
          },
          "notes": ""
        }
      ]
    }
  ]
}
```

### Programme fields

| Field | Required | What it is |
|---|---|---|
| `name` | yes | The programme name, as it should read on the roadmap. |
| `shortName` | no | A shorter label for the roadmap bar. |
| `description` | no | What the programme covers. |
| `businessOutcome` | no | The outcome in business terms, not technical terms. |
| `productOwners` | no | A list of names from the product owner list, or `[]`. |
| `deliveryOwners` | no | A list of names from the delivery owner list, or `[]`. |
| `status` | no | A status id from the list below. |
| `priority` | no | A priority id from the list below. |
| `notes` | no | Anything else worth recording. |

### System change fields

| Field | Required | What it is |
|---|---|---|
| `programme` | yes | The name of the programme it belongs to (from your file, or one already on the roadmap). |
| `title` | yes | What is changing. |
| `shortTitle` | no | A shorter label for the roadmap bar. |
| `systemAreas` | no | A list of system ids. A change can touch several. |
| `types` | no | A list of type ids. A change can be of several types. |
| `subArea` | no | Free text, for example "Accreditation" or "Order to cash". |
| `stream` | no | A resource stream id: the team whose capacity this consumes. `""` if unsure. |
| `status`, `priority` | no | Ids from the lists below. |
| `currentPhase` | no | A milestone type id - where the work is now. |
| `startDate`, `endDate` | no | ISO dates. These place the bar on the roadmap. |
| `targetDate` | no | A date it is aimed at, if different from the end date. |
| `productOwners` | no | A list of names from the product owner list. Several are allowed. `[]` if unsure. |
| `deliveryOwners` | no | A list of names from the delivery owner list. Several are allowed. `[]` if unsure. |
| `description` | no | What the change is. |
| `businessOutcome` | no | Why it is worth doing. |
| `problemStatement` | no | The problem it solves today. |
| `systemDependencies`, `businessDependencies`, `dataDependencies` | no | Dependencies described in words. |
| `recommendedApproach`, `tradeOffs`, `pocNotes` | no | How to do it, and what it costs to do it that way. |
| `comments`, `notes` | no | Anything else. |
| `milestones` | no | See below. |
| `risks` | no | See below. |
| `gates` | no | Decisions or gates. See below. |
| `tasks` | yes in practice | The work. See below - this is where effort lives. |

### Task fields

| Field | Required | What it is |
|---|---|---|
| `name` | yes | The task, in a few words. |
| `description` | no | What doing it involves. |
| `status` | no | A status id from the list below. |
| `owner` | no | One name, from either owner list, or `""`. |
| `stream` | no | A resource stream id, only when it differs from the system change. |
| `okrIds` | no | A list of OKR ids this task moves. Objective or key result ids, from the list below. |
| `links` | no | External links: `[{ "label": "Jira ABC-1", "url": "https://..." }]`. As many as you like. |
| `days` | yes | Effort per resource type: `po` (Product Owner), `dev` (Development), `int` (Integration), `data` (Data Engineering). |
| `notes` | no | Anything else. |

### Milestones, risks and gates

```json
{
  "milestones": [
    {
      "name": "Discovery",
      "date": "2027-02-15",
      "status": "idea",
      "notes": ""
    }
  ],
  "risks": [
    {
      "title": "Short name for the risk",
      "description": "What could go wrong.",
      "impact": "High",
      "probability": "Medium",
      "mitigation": "What reduces it.",
      "owner": "",
      "status": "open"
    }
  ],
  "gates": [
    {
      "title": "The decision that is needed",
      "description": "What has to be decided, and by whom.",
      "owner": "",
      "requiredByDate": "2027-01-15",
      "status": "open",
      "decision": "",
      "decisionDate": "",
      "notes": ""
    }
  ]
}
```

`impact` and `probability` are `High`, `Medium` or `Low`. Risk `status` is
`open`, `mitigated` or `closed`. Gate `status` is `open`, `decided` or `closed`.
A milestone `name` must be one of the milestone types listed below.

## The values you may use

Use the **id** (the left-hand column), never the label.

### Statuses

| Id | Label |
|---|---|
| `idea` | Idea |
| `discovery` | Discovery |
| `definition` | Definition |
| `ready` | Ready |
| `build` | Build |
| `integration` | Integration |
| `uat` | UAT |
| `pilot` | Pilot |
| `rollout` | Rollout |
| `live` | Live |
| `on-hold` | On Hold |
| `blocked` | Blocked |
| `cancelled` | Cancelled |

### Priorities

| Id | Label |
|---|---|
| `critical` | Critical |
| `high` | High |
| `medium` | Medium |
| `low` | Low |

### Systems

| Id | Label |
|---|---|
| `bpp` | BPP |
| `salesforce` | Salesforce |
| `csi` | CSI |
| `netsuite` | NetSuite |
| `bigcommerce` | BigCommerce |
| `infor-cpq` | Infor CPQ |
| `pim` | PIM |
| `databricks` | Databricks |
| `integration` | Integration |
| `mobile-app` | Mobile App |
| `operations` | Operations |
| `finance` | Finance |
| `data` | Data |
| `other` | Other |

### Types

| Id | Label |
|---|---|
| `system-change` | System Change |
| `process-change` | Process Change |
| `data-change` | Data Change |
| `integration` | Integration |
| `rollout` | Rollout |
| `discovery` | Discovery |
| `platform` | Platform |
| `other` | Other |

### Milestone types

| Id | Label |
|---|---|
| `discovery` | Discovery |
| `definition` | Definition |
| `poc` | POC |
| `mvp` | MVP |
| `build` | Build |
| `integration` | Integration |
| `uat` | UAT |
| `pilot` | Pilot |
| `rollout` | Rollout |
| `live` | Live |

### Resource streams (the team whose capacity is used)

| Id | Label |
|---|---|
| `b2b` | B2B |
| `d2c` | D2C |
| `netsuite-erp` | NetSuite / ERP |
| `csi` | CSI |
| `data-platform` | Data & Platform |
| `shared` | Shared |

### Resource types (the keys inside `days`)

| Id | Label |
|---|---|
| `po` | Product Owner |
| `dev` | Development |
| `int` | Integration |
| `data` | Data Engineering |


### People

Owner fields hold the **name**, written exactly as below. A programme or
system change may name several of each. Anybody not on these lists must be
left out.

**Product owners**

* Nicolas
* Sarah
* Priya
* Commercial

**Delivery owners**

* Jake
* Data team
* Integration team
* Operations
* Finance

A task has a single `owner`, who may come from either list.

### OKRs

Two levels: objectives, each with its own key results. A task may point at
either level. Prefer the key result when one fits.

* **Improve the dealer experience** - `okr-dealer`
  * Reduce dealer ordering errors - `kr-order-errors`
  * Increase dealer self-service - `kr-self-service`
  * Trusted availability and lead times - `kr-availability`
* **Scale globally on one platform** - `okr-global`
  * Launch new entities on the platform - `kr-new-entities`
  * One order and stock flow per entity - `kr-entity-flows`
* **Trusted master data** - `okr-data`
  * One product master - `kr-product-master`
  * One customer and dealer master - `kr-customer-master`
* **Operational efficiency** - `okr-efficiency`
  * Remove manual rekeying - `kr-no-rekeying`
  * Reduce time to publish product data - `kr-time-to-publish`

## Checklist before you hand the file over

* Only `programmes` and `roadmapItems` in the file, nothing else.
* No `id` fields anywhere - the tool assigns them.
* Every id used for a status, priority, system, type, stream or OKR appears in the lists above.
* Every owner is a name from the matching list; `[]` or `""` when nobody fits.
* Every task has `days`, even when the owner and stream are empty.
* Every system change points at a programme by name.
* Dates are `YYYY-MM-DD`, and no end date is before its start date.
* It is valid JSON: no trailing commas, no comments, double quotes throughout.

## A worked prompt

> Here is our roadmap JSON guide. Using only the ids it lists, draft a
> programme called "Dealer Self-Service" with three system changes and
> four to six tasks each. The work runs from March to September 2027.
> Estimate the days for each task. Where you cannot match a person or a
> stream, leave it empty. Answer with the JSON only.
