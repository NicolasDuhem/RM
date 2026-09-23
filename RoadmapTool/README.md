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

The data files are:

```
data/programmes.json          Programmes / business subjects
data/roadmap-items.json       System changes, with their tasks, risks and milestones
data/dependencies.json        Links between system changes
data/backlog.json             Date-free master backlog
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

**Programme dates are never typed in.** A programme starts at the earliest
start date of its children and ends at the latest end date. A programme with no
dated children simply shows *Not scheduled*.

**Effort is never typed in twice either.** It is recorded on tasks and adds up
to the system change, and again to the programme.

A task has a name, status, owner, description, the OKRs it affects, any number
of external links (a Jira ticket, a document, a design) and the days required
per discipline. Tasks have no dates of their own: they run with the system
change above them. Expand a system change on the roadmap with the small arrow
to see its tasks.

---

## The screens

| Screen           | What it is for                                                          |
|------------------|-------------------------------------------------------------------------|
| **Roadmap**      | The Gantt. Executive View (programmes only) or Detailed View (everything, down to tasks). |
| **Dependencies** | The dependency register (table) and the dependency map (diagram).        |
| **Backlog**      | Date-free requirements, and *Move to Roadmap* when they are ready.       |
| **Resources**    | The monthly capacity plan, and demand against it.                        |
| **Data**         | Backup, export, import, restore, and the change history.                 |
| **Settings**     | Systems, statuses, priorities, streams, OKRs, quarters, port and more. Password protected. |

Click any bar or title on the roadmap to open the record panel: summary, tasks,
dependencies, risks and decisions, delivery (Fast MVP versus Standard), the
resource roll-up, milestones, and that item's history.

**Reading and editing use the same layout.** Press *Edit* and the values in
front of you turn into inputs, in exactly the same places - nothing jumps
around and nothing is hidden behind a separate form. Creating a programme or a
system change opens that same panel, already in edit mode. Nothing is stored
until you press Save.

A system change can belong to several **systems** and be of several **types**;
both are multi-select.

Dragging a bar (or its edges) changes the start and end dates. It goes through
exactly the same save as the panel, so it gets the same protection.

---

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
that plan. Each task's days are spread evenly across the dates of the system
change it belongs to, and counted against the stream on the task (or, if the
task has none, the stream on the system change). Every cell shows
`demand / capacity` in days; red means demand is above what is planned.

The demand source can be switched between the task plan and the Fast MVP or
Standard estimates, so you can see the difference between the plan and either
sizing. Nothing here moves a date - it is decision support only.

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
cascade delete, backlog promotion, tasks and their effort, monthly capacity,
the settings password, CSV round trip, backup and restore, corrupt file
handling). It works on a throwaway copy of the application in the system temp
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
