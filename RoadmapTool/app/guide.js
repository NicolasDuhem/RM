'use strict';

/**
 * The Markdown guide that describes the roadmap JSON format.
 *
 * It deliberately contains no master data of its own: statuses, systems,
 * streams, resource types, owners and OKRs are read from the master data file
 * that is handed over with it, so the guide never goes stale and nobody is
 * tempted to copy a value out of it.
 */

const store = require('./fileStore');

function build() {
  const settings = store.records('settings');
  const appName = settings.appName || 'Roadmap Tool';
  const out = [];
  const w = function (line) { out.push(line === undefined ? '' : line); };

  w('# Roadmap JSON guide');
  w();
  w('_For ' + appName + '. Generated ' + new Date().toISOString().slice(0, 10) + '._');
  w();
  w('This guide explains the JSON the roadmap tool accepts, so programmes,');
  w('system changes and tasks can be drafted outside it - including with a chat');
  w('assistant - and then imported.');
  w();
  w('**It contains no lists of values on purpose.** Every status, system,');
  w('stream, resource type, owner and OKR must be read from the master data');
  w('file that comes with this guide.');
  w();
  w('## What to share with the assistant');
  w();
  w('Two files:');
  w();
  w('1. **This guide.**');
  w('2. **The master data file** - in the roadmap tool, *Data -> Export master data*.');
  w('   One JSON file holding the settings (every list the roadmap uses), the');
  w('   programmes that already exist, and the system changes already on the');
  w('   roadmap so nothing is drafted twice.');
  w();
  w('If you would rather send the raw files from the `data` folder instead:');
  w();
  w('| File | Needed? | Why |');
  w('|---|---|---|');
  w('| `settings.json` | **Required** | Holds every allowed value. |');
  w('| `programmes.json` | Recommended | So work is attached to a programme that already exists instead of a duplicate. |');
  w('| `roadmap-items.json` | Optional | Only if you want the assistant to see what is already planned. It is the largest file. |');
  w('| `backlog.json`, `dependencies.json`, `resource-scenarios.json`, `audit.json` | No | Nothing here is drafted from them. |');
  w();
  w('## How to use it');
  w();
  w('1. Give the assistant this guide and the master data file.');
  w('2. Describe the programme, the system changes and the tasks you want, in plain words.');
  w('3. Ask for **one JSON object, following this guide, using only ids found in the master data**.');
  w('4. Save the answer as a `.json` file.');
  w('5. In the roadmap tool: **Data -> Add to the roadmap**, and choose the file.');
  w();
  w('The import is additive: it adds what is in the file and leaves everything');
  w('already on the roadmap alone. Ids are assigned by the tool, so none are');
  w('ever written by hand. A programme whose name already exists is reused');
  w('rather than duplicated, so several people can draft into the same one.');
  w();
  w('## The rules');
  w();
  w('**Create only these three things: programmes, system changes and tasks.**');
  w();
  w('* A **programme** is a business outcome or a larger initiative.');
  w('* A **system change** is a deliverable underneath a programme, and it carries the dates.');
  w('* A **task** is the work underneath a system change. It carries the effort');
  w('  and its own dates, and together those drive the capacity view.');
  w();
  w('**Never invent master data.** Statuses, priorities, systems, types,');
  w('resource streams, resource types, milestone types, people and OKRs are');
  w('maintained inside the tool by an administrator. Read them from the master');
  w('data file and use them exactly as written. Do not add to them, do not');
  w('rename them, do not "improve" them, and never output a settings block, a');
  w('dependency, a backlog item or a resource scenario.');
  w();
  w('**If nothing in a list fits, leave the field empty** - `""` for a single');
  w('value, `[]` for a list - and say so in the notes. Never guess, and never');
  w('invent a person: if no name in the file is right, leave the owners empty');
  w('and somebody will pick them in the tool afterwards.');
  w();
  w('**Effort is always filled in.** Even when the stream and the owners are');
  w('left empty, every task carries the days it needs under `days`, keyed by');
  w('the resource type ids from the master data. Whole or half days. `0` where');
  w('a discipline is not needed. Effort belongs on tasks only - the system');
  w('change and the programme add theirs up automatically.');
  w();
  w('**Dates**');
  w();
  w('* Written as `"YYYY-MM-DD"`, for example `"2027-03-01"`.');
  w('* System changes and tasks both have dates. **Give every task its own**');
  w('  **`startDate` and `endDate`** - the capacity view spreads a task\'s days');
  w('  evenly across them, so tasks dated properly are what makes a heavy first');
  w('  month look heavy. A task left without dates falls back to running across');
  w('  the whole system change, which flattens the picture.');
  w('* A task\'s dates normally sit inside its system change\'s dates.');
  w('* `endDate` must be the same as, or after, `startDate`.');
  w('* A programme never has dates: the tool works them out from its system changes.');
  w('* If the timing is genuinely unknown, use `""` for both and say so in the notes.');
  w();
  w('## Where each value comes from');
  w();
  w('Read the master data file and use what is in it. Nothing else is valid.');
  w();
  w('| Field you are filling in | Read from | Write the |');
  w('|---|---|---|');
  w('| `status` | `settings.statuses` | `id` |');
  w('| `priority` | `settings.priorities` | `id` |');
  w('| `systemAreas` | `settings.systems` | `id` of each |');
  w('| `types` | `settings.itemTypes` | `id` of each |');
  w('| `stream` | `settings.resourceStreams` | `id` |');
  w('| keys inside `days` | `settings.resourceTypes` | `id` as the key |');
  w('| `milestones[].name` | `settings.milestoneTypes` | `name` |');
  w('| `okrIds` | `settings.okrs` and their `children` | `id` of either level |');
  w('| `productOwners` | `settings.productOwners` | `name` of each |');
  w('| `deliveryOwners` | `settings.deliveryOwners` | `name` of each |');
  w('| task `owner` | `settings.productOwners` or `settings.deliveryOwners` | one `name` |');
  w('| `programme` | `programmes` in the master data, or a programme you are creating in the same file | `name` |');
  w();
  w('Every list in the settings has the same shape, and only the entries with');
  w('`"active": true` may be used:');
  w();
  w('```json');
  w('"statuses": [');
  w('  { "id": "some-id", "name": "Some label", "colour": "#2563eb", "active": true }');
  w(']');
  w('```');
  w();
  w('OKRs have two levels - an objective with its key results underneath - and');
  w('a task may point at either:');
  w();
  w('```json');
  w('"okrs": [');
  w('  {');
  w('    "id": "objective-id", "name": "The objective", "active": true,');
  w('    "children": [ { "id": "key-result-id", "name": "The key result", "active": true } ]');
  w('  }');
  w(']');
  w('```');
  w();
  w('## The shape to produce');
  w();
  w('One object, with one or both of these lists. Anything else is ignored.');
  w('Every `<...>` below is a placeholder: replace it with a value read from the');
  w('master data, or with an empty string or list when nothing fits.');
  w();
  w('```json');
  w(JSON.stringify(shape(), null, 2));
  w('```');
  w();
  w('### Programme fields');
  w();
  w(table([
    ['Field', 'Required', 'What it is'],
    ['`name`', 'yes', 'The programme name, as it should read on the roadmap.'],
    ['`shortName`', 'no', 'A shorter label for the roadmap bar.'],
    ['`description`', 'no', 'What the programme covers.'],
    ['`businessOutcome`', 'no', 'The outcome in business terms, not technical terms.'],
    ['`productOwners`', 'no', 'Names from `settings.productOwners`. Several allowed, `[]` if unsure.'],
    ['`deliveryOwners`', 'no', 'Names from `settings.deliveryOwners`. Several allowed, `[]` if unsure.'],
    ['`status`, `priority`', 'no', 'Ids from the matching settings list.'],
    ['`notes`', 'no', 'Anything else worth recording, including what you were unsure about.']
  ]));
  w();
  w('### System change fields');
  w();
  w(table([
    ['Field', 'Required', 'What it is'],
    ['`programme`', 'yes', 'The **name** of the programme it belongs to - one from the master data, or one you are creating in the same file.'],
    ['`title`', 'yes', 'What is changing.'],
    ['`shortTitle`', 'no', 'A shorter label for the roadmap bar.'],
    ['`systemAreas`', 'no', 'Ids from `settings.systems`. A change can touch several.'],
    ['`types`', 'no', 'Ids from `settings.itemTypes`. A change can be of several types.'],
    ['`subArea`', 'no', 'Free text, for example "Accreditation" or "Order to cash".'],
    ['`stream`', 'no', 'An id from `settings.resourceStreams`: whose capacity this consumes.'],
    ['`status`, `priority`', 'no', 'Ids from the matching settings list.'],
    ['`startDate`, `endDate`', 'no', 'ISO dates. These place the bar on the roadmap.'],
    ['`targetDate`', 'no', 'A date it is aimed at, when that differs from the end date.'],
    ['`productOwners`, `deliveryOwners`', 'no', 'Names from the matching settings list, or `[]`.'],
    ['`description`', 'no', 'What the change is.'],
    ['`businessOutcome`', 'no', 'Why it is worth doing.'],
    ['`problemStatement`', 'no', 'The problem it solves today.'],
    ['`systemDependencies`, `businessDependencies`, `dataDependencies`', 'no', 'Dependencies described in words.'],
    ['`recommendedApproach`, `tradeOffs`, `pocNotes`', 'no', 'How to do it, and what doing it that way costs.'],
    ['`comments`, `notes`', 'no', 'Anything else.'],
    ['`milestones`, `risks`, `gates`', 'no', 'See below.'],
    ['`tasks`', 'yes in practice', 'The work, and where effort lives. See below.']
  ]));
  w();
  w('### Task fields');
  w();
  w(table([
    ['Field', 'Required', 'What it is'],
    ['`name`', 'yes', 'The task, in a few words.'],
    ['`description`', 'no', 'What doing it involves.'],
    ['`status`', 'no', 'An id from `settings.statuses`.'],
    ['`owner`', 'no', 'One name from either owner list, or `""`.'],
    ['`stream`', 'no', 'An id from `settings.resourceStreams`, only when it differs from the system change.'],
    ['`startDate`', 'yes in practice', 'When the task starts, `YYYY-MM-DD`. Drives the capacity view.'],
    ['`endDate`', 'yes in practice', 'When it finishes, `YYYY-MM-DD`. On or after `startDate`.'],
    ['`okrIds`', 'no', 'Ids from `settings.okrs` or their `children`. Prefer a key result when one fits.'],
    ['`links`', 'no', 'External links: `[{ "label": "Jira ABC-1", "url": "https://..." }]`. As many as needed.'],
    ['`days`', 'yes', 'Effort in days, keyed by the ids in `settings.resourceTypes`.'],
    ['`notes`', 'no', 'Anything else.']
  ]));
  w();
  w('### Milestones, risks and gates');
  w();
  w('```json');
  w(JSON.stringify({
    milestones: [{
      name: '<name from settings.milestoneTypes>',
      date: '2027-02-15',
      status: '<id from settings.statuses>',
      notes: 'Shown when somebody hovers the milestone on the roadmap.'
    }],
    risks: [{
      title: 'Short name for the risk',
      description: 'What could go wrong.',
      impact: 'High',
      probability: 'Medium',
      mitigation: 'What reduces it.',
      owner: '',
      status: 'open'
    }],
    gates: [{
      title: 'The decision that is needed',
      description: 'What has to be decided, and by whom.',
      owner: '',
      requiredByDate: '2027-01-15',
      status: 'open',
      decision: '',
      decisionDate: '',
      notes: ''
    }]
  }, null, 2));
  w('```');
  w();
  w('`impact` and `probability` are `High`, `Medium` or `Low`. A risk `status`');
  w('is `open`, `mitigated` or `closed`; a gate `status` is `open`, `decided` or');
  w('`closed`. These four are the only fixed vocabularies in the whole format -');
  w('everything else comes from the master data.');
  w();
  w('## Checklist before handing the file over');
  w();
  w('* Only `programmes` and `roadmapItems` in the file, nothing else.');
  w('* No `id` field anywhere - the tool assigns them.');
  w('* Every status, priority, system, type, stream, milestone name, OKR and person appears in the master data file, spelled exactly as it is there.');
  w('* Nothing was invented to fill a gap; gaps are empty and explained in the notes.');
  w('* Every task has `days`, keyed by the resource type ids.');
  w('* Every task has its own `startDate` and `endDate`, inside its system change\'s dates.');
  w('* Every system change names a programme.');
  w('* Dates are `YYYY-MM-DD`, and no end date is before its start date.');
  w('* It is valid JSON: double quotes throughout, no trailing commas, no comments.');
  w();
  w('## A worked prompt');
  w();
  w('> Here is our roadmap JSON guide and our master data file. Using only the');
  w('> ids and names found in the master data, draft a programme called');
  w('> "Dealer Self-Service" with three system changes and four to six tasks');
  w('> each, running from March to September 2027. Give every task its own start');
  w('> and end dates inside its system change, and estimate the days for each');
  w('> task against our resource types. Where nothing in the master data fits -');
  w('> a person, a stream, a system - leave the field empty and note why.');
  w('> Answer with the JSON only.');
  w();

  return out.join('\n');
}

/* ------------------------------------------------------------------ */

function table(rows) {
  const header = rows[0];
  const lines = ['| ' + header.join(' | ') + ' |', '|' + header.map(function () { return '---'; }).join('|') + '|'];
  rows.slice(1).forEach(function (row) { lines.push('| ' + row.join(' | ') + ' |'); });
  return lines.join('\n');
}

/** The structure, with placeholders instead of values. */
function shape() {
  return {
    programmes: [
      {
        name: 'Dealer Self-Service',
        shortName: 'Dealer Self-Service',
        description: 'Let dealers do for themselves what they ring us about today.',
        businessOutcome: 'Fewer support calls and faster answers for dealers.',
        productOwners: ['<name from settings.productOwners, or leave the list empty>'],
        deliveryOwners: [],
        status: '<id from settings.statuses>',
        priority: '<id from settings.priorities>',
        notes: ''
      }
    ],
    roadmapItems: [
      {
        programme: 'Dealer Self-Service',
        title: 'Self-service order status',
        shortTitle: 'Order status',
        systemAreas: ['<id from settings.systems>'],
        types: ['<id from settings.itemTypes>'],
        subArea: 'Dealer portal',
        stream: '<id from settings.resourceStreams>',
        status: '<id from settings.statuses>',
        priority: '<id from settings.priorities>',
        startDate: '2027-03-01',
        endDate: '2027-05-31',
        targetDate: '',
        productOwners: [],
        deliveryOwners: [],
        description: 'Show the live status of an order in the dealer portal.',
        businessOutcome: 'Dealers stop ringing to ask where an order is.',
        problemStatement: 'Order status is only visible to the internal team.',
        systemDependencies: 'Needs the order integration to publish status changes.',
        businessDependencies: '',
        dataDependencies: '',
        recommendedApproach: '',
        tradeOffs: '',
        pocNotes: '',
        comments: '',
        notes: '',
        milestones: [
          { name: '<name from settings.milestoneTypes>', date: '2027-04-15', status: '', notes: 'What this milestone means.' }
        ],
        risks: [],
        gates: [],
        tasks: [
          {
            name: 'Design the status screen',
            description: 'Screen and states, agreed with two dealers.',
            status: '<id from settings.statuses>',
            owner: '<one name from either owner list, or empty>',
            stream: '',
            startDate: '2027-03-01',
            endDate: '2027-03-31',
            okrIds: ['<id from settings.okrs or their children>'],
            links: [{ label: 'Jira ABC-101', url: 'https://jira.example.com/browse/ABC-101' }],
            days: { '<id from settings.resourceTypes>': 2, '<another resource type id>': 8 },
            notes: ''
          }
        ]
      }
    ]
  };
}

module.exports = { build: build };
