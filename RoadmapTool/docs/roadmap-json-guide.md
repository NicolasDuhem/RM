# Roadmap JSON guide

_Snapshot of the guide the tool generates. Download a fresh copy from **Data -> Download the JSON guide**, together with the master data file it refers to._

This guide explains the JSON the roadmap tool accepts, so programmes,
system changes and tasks can be drafted outside it - including with a chat
assistant - and then imported.

**It contains no lists of values on purpose.** Every status, system,
stream, resource type, owner and OKR must be read from the master data
file that comes with this guide.

## What to share with the assistant

Two files:

1. **This guide.**
2. **The master data file** - in the roadmap tool, *Data -> Export master data*.
   One JSON file holding the settings (every list the roadmap uses), the
   programmes that already exist, and the system changes already on the
   roadmap so nothing is drafted twice.

If you would rather send the raw files from the `data` folder instead:

| File | Needed? | Why |
|---|---|---|
| `settings.json` | **Required** | Holds every allowed value. |
| `programmes.json` | Recommended | So work is attached to a programme that already exists instead of a duplicate. |
| `roadmap-items.json` | Optional | Only if you want the assistant to see what is already planned. It is the largest file. |
| `backlog.json`, `dependencies.json`, `resource-scenarios.json`, `audit.json` | No | Nothing here is drafted from them. |

## How to use it

1. Give the assistant this guide and the master data file.
2. Describe the programme, the system changes and the tasks you want, in plain words.
3. Ask for **one JSON object, following this guide, using only ids found in the master data**.
4. Save the answer as a `.json` file.
5. In the roadmap tool: **Data -> Add to the roadmap**, and choose the file.

The import is additive: it adds what is in the file and leaves everything
already on the roadmap alone. Ids are assigned by the tool, so none are
ever written by hand. A programme whose name already exists is reused
rather than duplicated, so several people can draft into the same one.

## The rules

**Create only these three things: programmes, system changes and tasks.**

* A **programme** is a business outcome or a larger initiative.
* A **system change** is a deliverable underneath a programme. Its window
  is worked out from the tasks inside it, not typed in.
* A **task** is the work underneath a system change. It carries the effort
  and its own dates, and together those drive the capacity view.

**Never invent master data.** Statuses, priorities, systems, types,
resource streams, resource types, milestone types, people and OKRs are
maintained inside the tool by an administrator. Read them from the master
data file and use them exactly as written. Do not add to them, do not
rename them, do not "improve" them, and never output a settings block, a
dependency, a backlog item or a resource scenario.

**If nothing in a list fits, leave the field empty** - `""` for a single
value, `[]` for a list - and say so in the notes. Never guess, and never
invent a person: if no name in the file is right, leave the owners empty
and somebody will pick them in the tool afterwards.

**Effort is always filled in.** Even when the stream and the owners are
left empty, every task carries the days it needs under `days`, keyed by
the resource type ids from the master data. Whole or half days. `0` where
a discipline is not needed. Effort belongs on tasks only - the system
change and the programme add theirs up automatically.

**Dates**

* Written as `"YYYY-MM-DD"`, for example `"2027-03-01"`.
* **Dates belong on the tasks.** Give every task its own `startDate` and
  `endDate`. The capacity view spreads a task's days evenly across them,
  so tasks dated properly are what makes a heavy first month look heavy.
* A system change runs from the first start to the last end of its tasks.
  You do not date it yourself; the dates on it are only a placeholder for
  a change whose tasks are not dated yet.
* A task left without dates falls back to running across the whole system
  change, which flattens the picture. Avoid it.
* `endDate` must be the same as, or after, `startDate`.
* A programme never has dates: the tool works them out from its system changes.
* If the timing is genuinely unknown, use `""` for both and say so in the notes.

## Where each value comes from

Read the master data file and use what is in it. Nothing else is valid.

| Field you are filling in | Read from | Write the |
|---|---|---|
| `status` | `settings.statuses` | `id` |
| `priority` | `settings.priorities` | `id` |
| `systemAreas` | `settings.systems` | `id` of each |
| `types` | `settings.itemTypes` | `id` of each |
| `stream` | `settings.resourceStreams` | `id` |
| keys inside `days` | `settings.resourceTypes` | `id` as the key |
| `milestones[].name` | `settings.milestoneTypes` | `name` |
| `okrIds` | `settings.okrs` and their `children` | `id` of either level |
| `productOwners` | `settings.productOwners` | `name` of each |
| `deliveryOwners` | `settings.deliveryOwners` | `name` of each |
| task `owner` | `settings.productOwners` or `settings.deliveryOwners` | one `name` |
| `programme` | `programmes` in the master data, or a programme you are creating in the same file | `name` |

Every list in the settings has the same shape, and only the entries with
`"active": true` may be used:

```json
"statuses": [
  { "id": "some-id", "name": "Some label", "colour": "#2563eb", "active": true }
]
```

OKRs have two levels - an objective with its key results underneath - and
a task may point at either:

```json
"okrs": [
  {
    "id": "objective-id", "name": "The objective", "active": true,
    "children": [ { "id": "key-result-id", "name": "The key result", "active": true } ]
  }
]
```

## The shape to produce

One object, with one or both of these lists. Anything else is ignored.
Every `<...>` below is a placeholder: replace it with a value read from the
master data, or with an empty string or list when nothing fits.

```json
{
  "programmes": [
    {
      "name": "Dealer Self-Service",
      "shortName": "Dealer Self-Service",
      "description": "Let dealers do for themselves what they ring us about today.",
      "businessOutcome": "Fewer support calls and faster answers for dealers.",
      "productOwners": [
        "<name from settings.productOwners, or leave the list empty>"
      ],
      "deliveryOwners": [],
      "status": "<id from settings.statuses>",
      "priority": "<id from settings.priorities>",
      "notes": ""
    }
  ],
  "roadmapItems": [
    {
      "programme": "Dealer Self-Service",
      "title": "Self-service order status",
      "shortTitle": "Order status",
      "systemAreas": [
        "<id from settings.systems>"
      ],
      "types": [
        "<id from settings.itemTypes>"
      ],
      "subArea": "Dealer portal",
      "stream": "<id from settings.resourceStreams>",
      "status": "<id from settings.statuses>",
      "priority": "<id from settings.priorities>",
      "startDate": "",
      "endDate": "",
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
          "name": "<name from settings.milestoneTypes>",
          "date": "2027-04-15",
          "status": "",
          "notes": "What this milestone means."
        }
      ],
      "risks": [],
      "gates": [],
      "tasks": [
        {
          "name": "Design the status screen",
          "description": "Screen and states, agreed with two dealers.",
          "status": "<id from settings.statuses>",
          "owner": "<one name from either owner list, or empty>",
          "stream": "",
          "startDate": "2027-03-01",
          "endDate": "2027-03-31",
          "okrIds": [
            "<id from settings.okrs or their children>"
          ],
          "links": [
            {
              "label": "Jira ABC-101",
              "url": "https://jira.example.com/browse/ABC-101"
            }
          ],
          "days": {
            "<id from settings.resourceTypes>": 2,
            "<another resource type id>": 8
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
| `productOwners` | no | Names from `settings.productOwners`. Several allowed, `[]` if unsure. |
| `deliveryOwners` | no | Names from `settings.deliveryOwners`. Several allowed, `[]` if unsure. |
| `status`, `priority` | no | Ids from the matching settings list. |
| `notes` | no | Anything else worth recording, including what you were unsure about. |

### System change fields

| Field | Required | What it is |
|---|---|---|
| `programme` | yes | The **name** of the programme it belongs to - one from the master data, or one you are creating in the same file. |
| `title` | yes | What is changing. |
| `shortTitle` | no | A shorter label for the roadmap bar. |
| `systemAreas` | no | Ids from `settings.systems`. A change can touch several. |
| `types` | no | Ids from `settings.itemTypes`. A change can be of several types. |
| `subArea` | no | Free text, for example "Accreditation" or "Order to cash". |
| `stream` | no | An id from `settings.resourceStreams`: whose capacity this consumes. |
| `status`, `priority` | no | Ids from the matching settings list. |
| `startDate`, `endDate` | no | ISO dates, used **only** while the change has no dated tasks. Once its tasks have dates, the change runs from the first task start to the last task end and these are ignored. Give the tasks dates and leave these empty. |
| `targetDate` | no | A date it is aimed at, when that differs from the end date. |
| `productOwners`, `deliveryOwners` | no | Names from the matching settings list, or `[]`. |
| `description` | no | What the change is. |
| `businessOutcome` | no | Why it is worth doing. |
| `problemStatement` | no | The problem it solves today. |
| `systemDependencies`, `businessDependencies`, `dataDependencies` | no | Dependencies described in words. |
| `recommendedApproach`, `tradeOffs`, `pocNotes` | no | How to do it, and what doing it that way costs. |
| `comments`, `notes` | no | Anything else. |
| `milestones`, `risks`, `gates` | no | See below. |
| `tasks` | yes in practice | The work, and where effort lives. See below. |

### Task fields

| Field | Required | What it is |
|---|---|---|
| `name` | yes | The task, in a few words. |
| `description` | no | What doing it involves. |
| `status` | no | An id from `settings.statuses`. |
| `owner` | no | One name from either owner list, or `""`. |
| `stream` | no | An id from `settings.resourceStreams`, only when it differs from the system change. |
| `startDate` | yes in practice | When the task starts, `YYYY-MM-DD`. Drives the capacity view. |
| `endDate` | yes in practice | When it finishes, `YYYY-MM-DD`. On or after `startDate`. |
| `okrIds` | no | Ids from `settings.okrs` or their `children`. Prefer a key result when one fits. |
| `links` | no | External links: `[{ "label": "Jira ABC-1", "url": "https://..." }]`. As many as needed. |
| `days` | yes | Effort in days, keyed by the ids in `settings.resourceTypes`. |
| `notes` | no | Anything else. |

### Milestones, risks and gates

```json
{
  "milestones": [
    {
      "name": "<name from settings.milestoneTypes>",
      "date": "2027-02-15",
      "status": "<id from settings.statuses>",
      "notes": "Shown when somebody hovers the milestone on the roadmap."
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

`impact` and `probability` are `High`, `Medium` or `Low`. A risk `status`
is `open`, `mitigated` or `closed`; a gate `status` is `open`, `decided` or
`closed`. These four are the only fixed vocabularies in the whole format -
everything else comes from the master data.

## Checklist before handing the file over

* Only `programmes` and `roadmapItems` in the file, nothing else.
* No `id` field anywhere - the tool assigns them.
* Every status, priority, system, type, stream, milestone name, OKR and person appears in the master data file, spelled exactly as it is there.
* Nothing was invented to fill a gap; gaps are empty and explained in the notes.
* Every task has `days`, keyed by the resource type ids.
* Every task has its own `startDate` and `endDate`; the system change itself needs none.
* Every system change names a programme.
* Dates are `YYYY-MM-DD`, and no end date is before its start date.
* It is valid JSON: double quotes throughout, no trailing commas, no comments.

## A worked prompt

> Here is our roadmap JSON guide and our master data file. Using only the
> ids and names found in the master data, draft a programme called
> "Dealer Self-Service" with three system changes and four to six tasks
> each, running from March to September 2027. Date every task, since the
> system changes take their dates from those, and estimate the days for
> each task against our resource types. Where nothing in the master data fits -
> a person, a stream, a system - leave the field empty and note why.
> Answer with the JSON only.
