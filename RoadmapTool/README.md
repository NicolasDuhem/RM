# Roadmap Tool

A standalone, portable roadmap management tool. One central roadmap grouped by
**programme** (a business outcome), with the individual **system changes**
underneath it and the tasks under those, plus dependencies, dates, ownership,
risks, OKRs and the resource each task needs.

Everything lives in this one folder:

* no database
* no cloud service
* no external API
* no internet connection
* no installation beyond Node.js

Copy the `RoadmapTool` folder to another drive or machine and you have moved
the application, its configuration, the roadmap, the backlog, the dependencies,
the history and the backups.

---

## Running it

1. Install [Node.js](https://nodejs.org) (LTS) once, on the machine that will
   host the roadmap.
2. Double-click **`start.bat`**.
3. Your browser opens at `http://localhost:4310`.

Leave the black `start.bat` window open - that window *is* the application.
Closing it stops the server.

On macOS or Linux, run `./start.sh` instead.

### Sharing it with the team

The preferred setup is **one machine running the server, everybody else using a
browser**:

```
        ONE SERVER PROCESS
                |
            JSON files
                |
    many browsers on the network
```

Other people open `http://<that-machine-name>:4310` - for example
`http://ROADMAP-PC:4310`. One process owns the files, so there is nothing to
collide over. The server listens on `0.0.0.0` by default, which is what makes
this work; change `host` in Settings to `127.0.0.1` to keep it to one machine.

Avoid everybody starting their own `start.bat` against the same shared-drive
folder. The revision check and file lock still protect the data if that happens,
but one server is the design.

### Changing the port

Settings -> General -> Application port, or edit `port` in `data/settings.json`.
The new port applies the next time the server starts.

---

## Where things are

| Folder       | What is in it                                                        |
|--------------|----------------------------------------------------------------------|
| `data/`      | The roadmap itself: plain, human-readable JSON files.                 |
| `backups/`   | Automatic rolling backups, newest first, named by date and time.      |
| `exports/`   | Every JSON or CSV export you produce from the Data screen.            |
| `app/`       | The small Node server.                                                |
| `public/`    | The browser application (HTML, CSS, JavaScript).                      |
| `logs/`      | Technical log for troubleshooting. Users never see stack traces.      |
| `tests/`     | Automated tests.                                                      |
| `docs/`      | A snapshot of the JSON guide for drafting work outside the tool.      |

The data files are:

```
data/programmes.json          Programmes / business subjects
data/roadmap-items.json       System changes, with their tasks, risks and milestones
data/dependencies.json        Links between system changes
data/backlog.json             Master backlog, with optional dates and effort
data/resource-scenarios.json  Monthly capacity plans, per stream and discipline
data/settings.json            Systems, statuses, priorities, streams, OKRs, quarters, port, ...
data/audit.json               Lightweight change history
```

Each file carries a `revision` number and an `updatedAt` stamp:

```json
{
  "revision": 28,
  "updatedAt": "2026-09-22T14:32:15.000Z",
  "records": []
}
```

---

## How the roadmap is structured

Three levels:

```
PROGRAMME  (a business outcome)
    SYSTEM CHANGE  (a deliverable, with dates)
        TASK       (the work, and where effort is recorded)
        TASK
    SYSTEM CHANGE
```

For example:

```
Customer / Dealer Master & Accreditation
    Salesforce Accreditation Model
        Create the accreditation object          PO 2  Dev 8
        Migrate the accreditation spreadsheet    PO 1  Dev 2  Data 6
        Publish accreditation to the platform    PO 1  Dev 3  Int 6
    Platform Accreditation Matrix
    BPP Product Eligibility Restriction
```

**Milestones** are per system change, and each one can carry a note - hover the
diamond on the roadmap to read it.

**Key dates** are the dates the business plans around - a freeze, a board
meeting, a year end. Add them in Settings (a label and a date), and each one is
drawn down the whole roadmap with its label at the top, like the TODAY line.
The *Key dates* tick box on the Roadmap toolbar shows or hides them.

**Dates are never typed in above the task.** A task has its own start and end.
A system change runs from the first start to the last end of its tasks. A
programme runs from the earliest to the latest of its system changes. Nothing
above the task is entered by hand, so how long a piece of work takes always
reflects the work actually in it.

A system change with no dated tasks yet falls back to a *planned* start and end
you can type on it, so a change can still be sketched onto the roadmap before
it is broken down. As soon as one of its tasks has dates, the tasks take over
and the panel shows *Start (from tasks)*.

**Effort is never typed in twice either.** It is recorded on tasks and adds up
to the system change, and again to the programme.

A task has a name, status, owner, description, the OKRs it affects, any number
of external links (a Jira ticket, a document, a design), its own start and end
dates, and the days required per discipline. **A task's dates and effort are
what drive the capacity view**: a system change may run for four months while
the work inside it is heavy in the first and thin afterwards, and dating each
task is what makes that visible. A task left without dates falls back to
running across the whole system change - the roadmap draws it dashed and the
demand grid says so. Expand a system change on the roadmap with the small arrow
to see its tasks.

**The roadmap is read in the order you arrange it.** Programmes, the system
changes inside a programme, and the tasks inside a system change are each
dragged into place by the grip at the left of the row. The order is stored, so
everybody sees the same roadmap. Clear the filters and the search first: rows
that are hidden cannot be put in order.

---

## The screens

| Screen           | What it is for                                                          |
|------------------|-------------------------------------------------------------------------|
| **Roadmap**      | The Gantt. Executive View (programmes only) or Detailed View (everything, down to tasks). |
| **Dependencies** | The dependency register (table) and the dependency map (diagram).        |
| **Backlog**      | Requirements not yet on the roadmap, and *Move to Roadmap* when they are ready. |
| **Resources**    | The monthly capacity plan, and demand against it by month or by week.    |
| **Data**         | Backup, export, import, restore, and the change history.                 |
| **Settings**     | Owners, systems, statuses, priorities, streams, OKRs, key dates, quarters, port and more. Password protected. |

Click any bar or title on the roadmap to open the record panel: summary, tasks,
dependencies, risks and decisions, the resource roll-up, milestones, and that
item's history.

**Everything at a glance sits in one ribbon.** Programme, status, priority,
phase, dates, systems, types, stream and owners run across the top of the
panel, each one once. The body underneath carries only what the ribbon does
not: the prose, the tasks, the dependencies.

**Reading and editing use the same layout.** Press *Edit* and the values in
front of you turn into inputs, in exactly the same places - the title, the
outcome and every cell of the ribbon - so nothing jumps around and nothing is
hidden behind a separate form. Creating a programme or a system change opens
that same panel, already in edit mode. Nothing is stored until you press Save.

A system change can belong to several **systems** and be of several **types**;
both are multi-select.

Ownership is two lists, each maintained in Settings: **product owners** and
**delivery owners**. A programme or a system change can name several of each -
tick them in the ribbon. A task, risk, gate or dependency takes a single owner
from either list. The name itself is what gets stored, so anybody named before
those lists existed still shows on their record.

Dragging a bar (or its edges) changes the start and end dates. It goes through
exactly the same save as the panel, so it gets the same protection.

---

## Drafting work outside the tool

Not everybody wants to type into the roadmap. The Data screen produces **two
files** to hand to a colleague or paste into a chat assistant:

1. **Download the JSON guide** - how the JSON is shaped. It holds no values of
   its own, on purpose, so it never goes stale and nobody copies a status out
   of it.
2. **Export master data** - one JSON file with every list the roadmap uses
   (statuses, systems, types, streams, resource types, owners, OKRs), the
   programmes that already exist and the system changes already planned.

Then describe what you want and ask for JSON that follows the guide **using
only ids found in the master data**. The guide is explicit that only
programmes, system changes and tasks may be created, that master data must
never be invented, and that where nothing fits the field is left empty and
explained - but the days a task needs, and its start and end dates, are always
filled in, so the work can be costed and placed in time and somebody can pick
the team later.

If you would rather send raw files from the `data` folder: `settings.json` is
required, `programmes.json` is recommended so work lands under a programme
that already exists, `roadmap-items.json` is optional context, and nothing
else is needed.

Bring the result in with **Data -> Add to the roadmap (JSON)**. That import is
additive: it adds what is in the file and changes nothing that is already
there. Ids are assigned by the tool, and a programme whose name already exists
is reused rather than duplicated, so two people can draft into the same
programme. If anything is wrong, nothing at all is imported and the problems
are listed. Values that are not in Settings do not block the import but are
reported back so they can be corrected.

A snapshot of the guide is in [`docs/roadmap-json-guide.md`](docs/roadmap-json-guide.md).

## Resources: capacity and demand

Capacity has two levels:

```
DISCIPLINE (level 1)        Product Owner, Development, Integration, Data Engineering
    STREAM (level 2)        B2B, D2C, NetSuite / ERP, CSI, ...
```

On **Resources -> Capacity plan** you fill in, per stream, per discipline and
per month, how much resource you have, in FTE. That grid *is* the scenario. Use
the arrow button on a row to copy the first month across, then adjust the months
that differ. Duplicate a scenario to compare "what we have" with "what we would
need".

**Resources -> Demand vs capacity** puts the effort recorded on tasks against
that plan. Each task's days are spread evenly across **its own** start and end
dates, and counted against the stream on the task (or, if the task has none,
the stream on the system change). A task without dates falls back to the dates
of its system change, and the grid warns you how many did. Every cell shows
`demand / capacity` in days; red means demand is above what is planned. The
charts underneath show the same figures, one per discipline, across all
streams.

**Read it by month or by week.** *Read by: Monthly / Weekly* switches the grid
and the charts between whole months and calendar weeks. Capacity is still
entered a month at a time - that is the unit people plan in - and a month's
days are spread across its calendar days to work out a week's share, so the
weeks in a month always add back up to that month.

**Export to Excel** writes what is on screen - the same scenario, window,
granularity and roadmap filters - as a CSV: one row per stream and discipline
for capacity, demand and the spare between them. It downloads and a copy is
kept in the `exports` folder.

Nothing here moves a date - it is decision support only.

**Backlog items can be carried too.** Give a backlog item expected dates, a
team and an effort estimate on the Backlog screen, then tick it on the Capacity
plan tab. Each scenario carries its own selection, so you can ask "what if we
also take this on?" without touching the roadmap.

One FTE is 21 working days per month by default; change that in Settings.

## Multiple people editing

There is no login. Anybody who can reach the application can edit it. You are
asked for your name the first time you open it - that is a label on your edits,
stored in your browser, not a security control. Change it from the top right.

Nothing is ever silently overwritten:

1. Your browser loads the data and remembers the revision it saw.
2. When you save, the server compares that against the file.
3. If somebody else saved first, the save is refused and you are told:

   > This roadmap has changed since you opened this record.
   > Reload the latest version before saving your changes.

You reload, reapply your change, and save. That is the whole conflict model -
deliberately simpler than automatic merging.

Nothing autosaves. Edits are made in a form and stored when you press **Save**.

---

## The Settings password

The Settings screen asks for a password (**Brompton2026** out of the box,
changeable in Settings). It stops the lists the whole roadmap depends on -
statuses, systems, streams, OKRs - from being changed by accident.

It is a speed bump, not a login: the application still has no user accounts,
and anybody who can reach it can edit the roadmap itself. Unlocking lasts for
that browser tab only; *Lock settings* ends it immediately. Clearing the
password in Settings removes the prompt altogether.

## Backups and recovery

* A backup of a file is taken **before every write**, into `backups/`.
* The 50 most recent backups per file are kept (configurable in Settings).
* **Data -> Create Backup** takes one of everything on demand.
* **Data -> Restore** lists every backup; restoring one backs up the current
  file first, so a restore can itself be undone.

Writes are atomic: the new content is written to a temporary file, parsed back
to prove it is valid JSON, and only then renamed over the real file. An
interrupted save can never leave a half-written file.

If a data file is ever damaged anyway, the application says so on start-up and
on the Data screen, names the file, and points at the most recent valid backup.
**It never overwrites a file it cannot read.**

---

## Moving, copying and backing up the whole thing

* **Move it:** copy the whole `RoadmapTool` folder.
* **Back it up:** copy the whole folder, or use
  *Data -> Export Complete JSON Backup* for a single file containing the
  programmes, roadmap items, dependencies, backlog, scenarios and settings.
* **Restore it elsewhere:** copy the folder over, or use
  *Data -> Import Complete JSON Backup*.

CSV export and import are available per dataset for people who want to work in
Excel, plus an export-only **task register** that flattens every task under
every system change into one sheet. A CSV import is validated in full first: if
any row is wrong, **nothing** is imported and the offending rows are listed.

---

## Sample data

The application ships with a small sample roadmap so the concept is obvious.
Remove it whenever you like:

**Data -> Sample data -> Delete all roadmap data**

and start entering your own. **Load sample roadmap** puts it back. Neither
button touches your settings, and both take a backup first.

---

## Tests

```
node tests/run-tests.js
```

This runs the API and data-safety tests (ids, validation, conflict protection,
cascade delete, backlog promotion and planning, tasks and their effort, monthly
capacity, the settings password, the JSON guide and the additive import, CSV
round trip, backup and restore, corrupt file handling). It works on a throwaway copy of the application in the system temp
folder and never touches your `data/` folder.

`tests/browser-tests.js` additionally drives the real user interface. It is
optional and needs Playwright installed; point it at a **test copy** of the
application, because it resets the roadmap to the sample data.

---

## Deliberately not included

Jira, Salesforce, NetSuite, BigCommerce or CSI integrations, single sign-on,
user accounts, permissions, notifications, automatic resource levelling,
critical-path calculation, real-time collaborative editing and cloud hosting are
all out of scope. The point of this tool is that it stays small, portable and
easy to maintain.
