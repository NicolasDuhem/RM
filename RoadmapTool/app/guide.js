'use strict';

/**
 * Builds the Markdown guide that describes the roadmap JSON format.
 *
 * It is generated from the live settings, so the lists of allowed values it
 * contains are the ones this installation actually uses. Hand the file to
 * anybody (or to a chat assistant) who needs to draft programmes, system
 * changes and tasks for this roadmap.
 */

const store = require('./fileStore');

function build() {
  const settings = store.records('settings');
  const resourceTypes = active(settings.resourceTypes);
  const out = [];
  const w = function (line) { out.push(line === undefined ? '' : line); };

  w('# Roadmap JSON guide');
  w();
  w('_Generated from ' + (settings.appName || 'Roadmap Tool') +
    ' on ' + new Date().toISOString().slice(0, 10) + '. Lists of allowed values are the ones this roadmap uses today._');
  w();
  w('This file explains the JSON the roadmap tool accepts so you can draft new');
  w('work outside the tool - including with a chat assistant - and import it.');
  w();
  w('## How to use it');
  w();
  w('1. Give this whole file to your assistant (ChatGPT, Claude, whatever you use).');
  w('2. Describe the programme, the system changes and the tasks you want, in plain words.');
  w('3. Ask for **one JSON object, following this guide exactly**.');
  w('4. Save the answer as a `.json` file.');
  w('5. In the roadmap tool: **Data -> Import -> Add to the roadmap**, choose the file.');
  w();
  w('The import is additive: it adds what is in the file and leaves everything');
  w('already on the roadmap alone. Ids are assigned by the tool, so you never');
  w('write one yourself. If a programme in your file has the same name as one');
  w('that already exists, your system changes are added under the existing');
  w('programme instead of creating a second one with the same name.');
  w();
  w('## The rules');
  w();
  w('**Create only these three things: programmes, system changes and tasks.**');
  w();
  w('* A **programme** is a business outcome or larger initiative.');
  w('* A **system change** is a deliverable underneath a programme, and it carries the dates.');
  w('* A **task** is the work underneath a system change, and it carries the effort.');
  w();
  w('**Never invent master data.** Statuses, priorities, systems, types, resource');
  w('streams, resource types, people and OKRs are maintained inside the tool by');
  w('an administrator. Use only the ids listed further down, exactly as written.');
  w('Do not add, rename or "improve" them, and do not output any other dataset');
  w('(no settings, no dependencies, no backlog, no resource scenarios).');
  w();
  w('**If nothing in a list fits, leave the field empty (`""`), never guess.**');
  w('That applies especially to people and to the resource stream: if you cannot');
  w('match a real name or a real stream, leave it empty and somebody will pick it');
  w('in the tool afterwards.');
  w();
  w('**Effort is always filled in.** Even when the stream or the owner is left');
  w('empty, every task must carry the days it needs under `days`, using the');
  w('resource type ids below. Use whole or half days. Use `0` where a discipline');
  w('is not needed. Effort belongs on tasks only: the system change and the');
  w('programme add theirs up automatically.');
  w();
  w('**Dates**');
  w();
  w('* Written as `"YYYY-MM-DD"`, for example `"2027-03-01"`.');
  w('* Only system changes have dates. Tasks run with the system change above them.');
  w('* `endDate` must be the same as, or after, `startDate`.');
  w('* A programme never has dates: the tool works them out from its system changes.');
  w('* If the timing is genuinely unknown, use `""` for both dates and say so in the notes.');
  w();
  w('## The shape');
  w();
  w('One object, with one or both of these lists. Anything else is ignored.');
  w();
  w('```json');
  w(JSON.stringify(example(settings, resourceTypes), null, 2));
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
    ['`productOwners`', 'no', 'A list of names from the product owner list, or `[]`.'],
    ['`deliveryOwners`', 'no', 'A list of names from the delivery owner list, or `[]`.'],
    ['`status`', 'no', 'A status id from the list below.'],
    ['`priority`', 'no', 'A priority id from the list below.'],
    ['`notes`', 'no', 'Anything else worth recording.']
  ]));
  w();
  w('### System change fields');
  w();
  w(table([
    ['Field', 'Required', 'What it is'],
    ['`programme`', 'yes', 'The name of the programme it belongs to (from your file, or one already on the roadmap).'],
    ['`title`', 'yes', 'What is changing.'],
    ['`shortTitle`', 'no', 'A shorter label for the roadmap bar.'],
    ['`systemAreas`', 'no', 'A list of system ids. A change can touch several.'],
    ['`types`', 'no', 'A list of type ids. A change can be of several types.'],
    ['`subArea`', 'no', 'Free text, for example "Accreditation" or "Order to cash".'],
    ['`stream`', 'no', 'A resource stream id: the team whose capacity this consumes. `""` if unsure.'],
    ['`status`, `priority`', 'no', 'Ids from the lists below.'],
    ['`currentPhase`', 'no', 'A milestone type id - where the work is now.'],
    ['`startDate`, `endDate`', 'no', 'ISO dates. These place the bar on the roadmap.'],
    ['`targetDate`', 'no', 'A date it is aimed at, if different from the end date.'],
    ['`productOwners`', 'no', 'A list of names from the product owner list. Several are allowed. `[]` if unsure.'],
    ['`deliveryOwners`', 'no', 'A list of names from the delivery owner list. Several are allowed. `[]` if unsure.'],
    ['`description`', 'no', 'What the change is.'],
    ['`businessOutcome`', 'no', 'Why it is worth doing.'],
    ['`problemStatement`', 'no', 'The problem it solves today.'],
    ['`systemDependencies`, `businessDependencies`, `dataDependencies`', 'no', 'Dependencies described in words.'],
    ['`recommendedApproach`, `tradeOffs`, `pocNotes`', 'no', 'How to do it, and what it costs to do it that way.'],
    ['`comments`, `notes`', 'no', 'Anything else.'],
    ['`milestones`', 'no', 'See below.'],
    ['`risks`', 'no', 'See below.'],
    ['`gates`', 'no', 'Decisions or gates. See below.'],
    ['`tasks`', 'yes in practice', 'The work. See below - this is where effort lives.']
  ]));
  w();
  w('### Task fields');
  w();
  w(table([
    ['Field', 'Required', 'What it is'],
    ['`name`', 'yes', 'The task, in a few words.'],
    ['`description`', 'no', 'What doing it involves.'],
    ['`status`', 'no', 'A status id from the list below.'],
    ['`owner`', 'no', 'One name, from either owner list, or `""`.'],
    ['`stream`', 'no', 'A resource stream id, only when it differs from the system change.'],
    ['`okrIds`', 'no', 'A list of OKR ids this task moves. Objective or key result ids, from the list below.'],
    ['`links`', 'no', 'External links: `[{ "label": "Jira ABC-1", "url": "https://..." }]`. As many as you like.'],
    ['`days`', 'yes', 'Effort per resource type: ' + resourceTypes.map(function (type) {
      return '`' + type.id + '` (' + type.name + ')';
    }).join(', ') + '.'],
    ['`notes`', 'no', 'Anything else.']
  ]));
  w();
  w('### Milestones, risks and gates');
  w();
  w('```json');
  w(JSON.stringify({
    milestones: [{ name: firstName(settings.milestoneTypes, 'Build'), date: '2027-02-15', status: firstId(settings.statuses, 'idea'), notes: '' }],
    risks: [{
      title: 'Short name for the risk', description: 'What could go wrong.',
      impact: 'High', probability: 'Medium', mitigation: 'What reduces it.',
      owner: '', status: 'open'
    }],
    gates: [{
      title: 'The decision that is needed', description: 'What has to be decided, and by whom.',
      owner: '', requiredByDate: '2027-01-15', status: 'open', decision: '', decisionDate: '', notes: ''
    }]
  }, null, 2));
  w('```');
  w();
  w('`impact` and `probability` are `High`, `Medium` or `Low`. Risk `status` is');
  w('`open`, `mitigated` or `closed`. Gate `status` is `open`, `decided` or `closed`.');
  w('A milestone `name` must be one of the milestone types listed below.');
  w();
  w('## The values you may use');
  w();
  w('Use the **id** (the left-hand column), never the label.');
  w();
  w(optionSection('Statuses', settings.statuses));
  w(optionSection('Priorities', settings.priorities));
  w(optionSection('Systems', settings.systems));
  w(optionSection('Types', settings.itemTypes));
  w(optionSection('Milestone types', settings.milestoneTypes));
  w(optionSection('Resource streams (the team whose capacity is used)', settings.resourceStreams));
  w(optionSection('Resource types (the keys inside `days`)', settings.resourceTypes));
  w();
  w('### People');
  w();
  w('Owner fields hold the **name**, written exactly as below. A programme or');
  w('system change may name several of each. Anybody not on these lists must be');
  w('left out.');
  w();
  w('**Product owners**');
  w();
  w(peopleList(settings.productOwners));
  w();
  w('**Delivery owners**');
  w();
  w(peopleList(settings.deliveryOwners));
  w();
  w('A task has a single `owner`, who may come from either list.');
  w();
  w('### OKRs');
  w();
  w('Two levels: objectives, each with its own key results. A task may point at');
  w('either level. Prefer the key result when one fits.');
  w();
  w(okrSection(settings.okrs));
  w();
  w('## Checklist before you hand the file over');
  w();
  w('* Only `programmes` and `roadmapItems` in the file, nothing else.');
  w('* No `id` fields anywhere - the tool assigns them.');
  w('* Every id used for a status, priority, system, type, stream or OKR appears in the lists above.');
  w('* Every owner is a name from the matching list; `[]` or `""` when nobody fits.');
  w('* Every task has `days`, even when the owner and stream are empty.');
  w('* Every system change points at a programme by name.');
  w('* Dates are `YYYY-MM-DD`, and no end date is before its start date.');
  w('* It is valid JSON: no trailing commas, no comments, double quotes throughout.');
  w();
  w('## A worked prompt');
  w();
  w('> Here is our roadmap JSON guide. Using only the ids it lists, draft a');
  w('> programme called "Dealer Self-Service" with three system changes and');
  w('> four to six tasks each. The work runs from March to September 2027.');
  w('> Estimate the days for each task. Where you cannot match a person or a');
  w('> stream, leave it empty. Answer with the JSON only.');
  w();

  return out.join('\n');
}

/* ------------------------------------------------------------------ */

function active(list) {
  return (Array.isArray(list) ? list : []).filter(function (entry) { return entry && entry.active !== false; });
}

function firstId(list, fallback) {
  const entries = active(list);
  return entries.length ? entries[0].id : fallback;
}

function firstName(list, fallback) {
  const entries = active(list);
  return entries.length ? entries[0].name : fallback;
}

function idOf(list, preferred, fallback) {
  const entries = active(list);
  const match = entries.find(function (entry) { return entry.id === preferred; });
  if (match) return match.id;
  return entries.length ? entries[0].id : fallback;
}

function table(rows) {
  const header = rows[0];
  const body = rows.slice(1);
  const lines = ['| ' + header.join(' | ') + ' |', '|' + header.map(function () { return '---'; }).join('|') + '|'];
  body.forEach(function (row) { lines.push('| ' + row.join(' | ') + ' |'); });
  return lines.join('\n');
}

function optionSection(title, list) {
  const entries = active(list);
  const lines = ['### ' + title, ''];
  if (!entries.length) {
    lines.push('_Nothing set up yet - leave these fields empty._');
    return lines.join('\n') + '\n';
  }
  lines.push(table([['Id', 'Label']].concat(entries.map(function (entry) {
    return ['`' + entry.id + '`', entry.name];
  }))));
  lines.push('');
  return lines.join('\n');
}

function peopleList(list) {
  const entries = active(list);
  if (!entries.length) return '_Nobody set up yet - leave this empty._';
  return entries.map(function (person) { return '* ' + person.name; }).join('\n');
}

function okrSection(okrs) {
  const objectives = active(okrs);
  if (!objectives.length) return '_No OKRs have been set up yet. Leave `okrIds` empty._';
  const lines = [];
  objectives.forEach(function (objective) {
    lines.push('* **' + objective.name + '** - `' + objective.id + '`');
    active(objective.children).forEach(function (keyResult) {
      lines.push('  * ' + keyResult.name + ' - `' + keyResult.id + '`');
    });
  });
  return lines.join('\n');
}

function example(settings, resourceTypes) {
  const days = {};
  resourceTypes.forEach(function (type, index) {
    days[type.id] = index === 0 ? 2 : (index === 1 ? 8 : 0);
  });
  const secondDays = {};
  resourceTypes.forEach(function (type, index) {
    secondDays[type.id] = index === 1 ? 5 : (index === 2 ? 6 : 1);
  });
  const okr = firstOkrId(settings.okrs);

  return {
    programmes: [
      {
        name: 'Dealer Self-Service',
        shortName: 'Dealer Self-Service',
        description: 'Let dealers do for themselves what they ring us about today.',
        businessOutcome: 'Fewer support calls and faster answers for dealers.',
        productOwners: firstName(settings.productOwners, '') ? [firstName(settings.productOwners, '')] : [],
        deliveryOwners: [],
        status: idOf(settings.statuses, 'discovery', ''),
        priority: idOf(settings.priorities, 'high', ''),
        notes: ''
      }
    ],
    roadmapItems: [
      {
        programme: 'Dealer Self-Service',
        title: 'Self-service order status',
        shortTitle: 'Order status',
        systemAreas: [firstId(settings.systems, '')],
        types: [firstId(settings.itemTypes, '')],
        subArea: 'Dealer portal',
        stream: firstId(settings.resourceStreams, ''),
        status: idOf(settings.statuses, 'definition', ''),
        priority: idOf(settings.priorities, 'medium', ''),
        currentPhase: '',
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
          { name: firstName(settings.milestoneTypes, 'Build'), date: '2027-04-15', status: '', notes: '' }
        ],
        risks: [],
        gates: [],
        tasks: [
          {
            name: 'Design the status screen',
            description: 'Screen and states, agreed with two dealers.',
            status: idOf(settings.statuses, 'ready', ''),
            owner: '',
            stream: '',
            okrIds: okr ? [okr] : [],
            links: [{ label: 'Jira ABC-101', url: 'https://jira.example.com/browse/ABC-101' }],
            days: days,
            notes: ''
          },
          {
            name: 'Publish order status to the portal',
            description: 'Feed status changes through to the dealer portal.',
            status: idOf(settings.statuses, 'idea', ''),
            owner: '',
            stream: '',
            okrIds: [],
            links: [],
            days: secondDays,
            notes: ''
          }
        ]
      }
    ]
  };
}

function firstOkrId(okrs) {
  const objectives = active(okrs);
  for (let i = 0; i < objectives.length; i += 1) {
    const children = active(objectives[i].children);
    if (children.length) return children[0].id;
    return objectives[i].id;
  }
  return '';
}

module.exports = { build: build };
