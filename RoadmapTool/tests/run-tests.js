'use strict';

/**
 * End-to-end tests for the Roadmap Tool API.
 *
 * The tests run against a throwaway copy of the application in the system
 * temp folder, so they never touch the real /data folder.
 *
 * Run with:  node tests/run-tests.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const SOURCE_APP = path.join(__dirname, '..', 'app');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-test-'));

fs.mkdirSync(path.join(ROOT, 'app'));
fs.readdirSync(SOURCE_APP).forEach(function (file) {
  fs.copyFileSync(path.join(SOURCE_APP, file), path.join(ROOT, 'app', file));
});
fs.cpSync(path.join(__dirname, '..', 'public'), path.join(ROOT, 'public'), { recursive: true });

// Always test on a free port chosen by the operating system, so a running
// Roadmap Tool on the normal port cannot interfere.
process.env.ROADMAP_PORT = '0';
process.env.ROADMAP_HOST = '127.0.0.1';

const store = require(path.join(ROOT, 'app', 'fileStore.js'));
const serverModule = require(path.join(ROOT, 'app', 'server.js'));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    process.stdout.write('  ok   ' + name + '\n');
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    process.stdout.write('  FAIL ' + name + (detail ? ' :: ' + detail : '') + '\n');
  }
}

function equal(name, actual, expected) {
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

let baseUrl = '';

function api(method, route, body) {
  return new Promise(function (resolve, reject) {
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = http.request(baseUrl + route, {
      method: method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
    }, function (response) {
      let text = '';
      response.on('data', function (chunk) { text += chunk; });
      response.on('end', function () {
        let parsed = text;
        try { parsed = JSON.parse(text); } catch (err) { /* csv or plain text */ }
        resolve({ status: response.statusCode, body: parsed, headers: response.headers });
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function revisions() {
  return api('GET', '/api/bootstrap').then(function (response) {
    const datasets = response.body.datasets;
    const out = {};
    Object.keys(datasets).forEach(function (name) { out[name] = datasets[name].revision; });
    return out;
  });
}

function records(dataset) {
  return api('GET', '/api/dataset/' + dataset).then(function (response) {
    return response.body.records;
  });
}

async function run() {
  process.stdout.write('\nRoadmap Tool tests\n');
  process.stdout.write('Temporary application folder: ' + ROOT + '\n\n');

  /* -------------------------------------------------- */
  process.stdout.write('Startup and health\n');
  const created = store.ensureFiles();
  equal('every data file is created on first start', created.length, 7);
  check('health reports no problems', store.checkHealth().ok);

  const server = serverModule.start();
  await new Promise(function (resolve) { server.on('listening', resolve); if (server.listening) resolve(); });
  baseUrl = 'http://127.0.0.1:' + server.address().port;

  const health = await api('GET', '/api/health');
  check('GET /api/health responds', health.status === 200 && health.body.ok === true);
  const page = await api('GET', '/');
  check('the application page is served', page.status === 200 && String(page.body).indexOf('Roadmap Tool') >= 0);

  /* -------------------------------------------------- */
  process.stdout.write('\nProgrammes and roadmap items\n');
  let rev = await revisions();
  const programme = await api('POST', '/api/dataset/programmes/create', {
    revision: rev.programmes, editor: 'Tester', record: { name: 'Test Programme', owner: 'Ana', status: 'build' }
  });
  equal('a new programme gets a stable id', programme.body.record.id, 'PRG-0001');
  equal('the file revision increases on save', programme.body.revision, rev.programmes + 1);

  const noName = await api('POST', '/api/dataset/programmes/create', {
    revision: programme.body.revision, editor: 'Tester', record: { name: '  ' }
  });
  equal('a programme without a name is rejected', noName.status, 422);

  rev = await revisions();
  const badDates = await api('POST', '/api/dataset/roadmapItems/create', {
    revision: rev.roadmapItems, editor: 'Tester',
    record: { title: 'Backwards', programmeId: 'PRG-0001', startDate: '2026-10-01', endDate: '2026-09-01' }
  });
  equal('end date before start date is rejected', badDates.status, 422);
  check('the rejection explains the problem',
    JSON.stringify(badDates.body.error.detail.errors).indexOf('End date') >= 0);

  const orphan = await api('POST', '/api/dataset/roadmapItems/create', {
    revision: rev.roadmapItems, editor: 'Tester', record: { title: 'Orphan', programmeId: 'PRG-9999' }
  });
  equal('an item pointing at a missing programme is rejected', orphan.status, 422);

  const itemA = await api('POST', '/api/dataset/roadmapItems/create', {
    revision: rev.roadmapItems, editor: 'Tester',
    record: {
      title: 'Item A', programmeId: 'PRG-0001', startDate: '2026-09-01', endDate: '2026-10-31', status: 'build',
      systemAreas: ['bpp', 'netsuite'], types: ['integration', 'rollout'], stream: 'b2b',
      tasks: [
        { id: 'TSK-0001', name: 'Build it', status: 'build', owner: 'Jake', okrIds: ['kr-new-entities'],
          links: [{ label: 'Jira INT-1', url: 'https://jira.example.com/browse/INT-1' }],
          days: { po: 2, dev: 8, int: 4, data: 0 } }
      ]
    }
  });
  equal('a valid roadmap item is created', itemA.body.record.id, 'RM-0001');
  equal('a system change can hold several systems', itemA.body.record.systemAreas.length, 2);
  equal('a system change can hold several types', itemA.body.record.types.length, 2);
  equal('the item carries its resource stream', itemA.body.record.stream, 'b2b');
  equal('tasks are stored under the item', itemA.body.record.tasks.length, 1);
  equal('task effort is kept', itemA.body.record.tasks[0].days.dev, 8);
  equal('task links are kept', itemA.body.record.tasks[0].links[0].label, 'Jira INT-1');
  equal('task OKRs are kept', itemA.body.record.tasks[0].okrIds[0], 'kr-new-entities');

  const legacy = await api('POST', '/api/dataset/roadmapItems/create', {
    revision: itemA.body.revision, editor: 'Tester',
    record: {
      title: 'Written by an older version', programmeId: 'PRG-0001',
      systemArea: 'salesforce', type: 'system-change', scope: 'old scope', outOfScope: 'old',
      tickets: [{ id: 'TKT-9', title: 'Old ticket', externalReference: 'JIRA-9' }]
    }
  });
  equal('an older single system is folded into the list', legacy.body.record.systemAreas[0], 'salesforce');
  equal('an older single type is folded into the list', legacy.body.record.types[0], 'system-change');
  check('the removed scope fields are dropped', legacy.body.record.scope === undefined && legacy.body.record.outOfScope === undefined);
  equal('older tickets become tasks', legacy.body.record.tasks[0].name, 'Old ticket');
  equal('an older external reference becomes a link', legacy.body.record.tasks[0].links[0].url, 'JIRA-9');
  await api('POST', '/api/dataset/roadmapItems/delete', {
    revision: legacy.body.revision, id: legacy.body.record.id, editor: 'Tester',
    revisions: { dependencies: (await revisions()).dependencies }
  });

  rev = await revisions();
  const itemB = await api('POST', '/api/dataset/roadmapItems/create', {
    revision: rev.roadmapItems, editor: 'Tester',
    record: { title: 'Item B', programmeId: 'PRG-0001', startDate: '2026-11-01', endDate: '2026-12-15' }
  });
  equal('ids keep incrementing', itemB.body.record.id, 'RM-0002');

  const stale = await api('POST', '/api/dataset/roadmapItems/create', {
    revision: rev.roadmapItems, editor: 'Someone else', record: { title: 'Stale write', programmeId: 'PRG-0001' }
  });
  equal('a stale save is refused with a conflict', stale.status, 409);
  equal('the conflict is reported as CONFLICT', stale.body.error.code, 'CONFLICT');
  const afterConflict = await records('roadmapItems');
  equal('the conflicting write changed nothing', afterConflict.length, 2);

  rev = await revisions();
  const updated = await api('POST', '/api/dataset/roadmapItems/update', {
    revision: rev.roadmapItems, id: 'RM-0001', editor: 'Tester',
    record: { title: 'Item A', programmeId: 'PRG-0001', startDate: '2026-09-01', endDate: '2026-12-15' }
  });
  equal('an item can be updated', updated.body.record.endDate, '2026-12-15');

  const audit = await api('GET', '/api/audit?recordId=RM-0001');
  const change = audit.body.records.find(function (entry) { return entry.action === 'Updated'; });
  check('the change is recorded in the audit history', !!change);
  check('the audit entry names the field that changed',
    !!change && change.changes.some(function (c) { return c.field === 'endDate' && c.to === '2026-12-15'; }));

  /* -------------------------------------------------- */
  process.stdout.write('\nDependencies\n');
  rev = await revisions();
  const selfDep = await api('POST', '/api/dataset/dependencies/create', {
    revision: rev.dependencies, editor: 'Tester', record: { fromItemId: 'RM-0001', toItemId: 'RM-0001' }
  });
  equal('an item cannot depend on itself', selfDep.status, 422);

  const missingTarget = await api('POST', '/api/dataset/dependencies/create', {
    revision: rev.dependencies, editor: 'Tester', record: { fromItemId: 'RM-0001', toItemId: 'RM-4242' }
  });
  equal('a dependency to a missing item is rejected', missingTarget.status, 422);

  const dependency = await api('POST', '/api/dataset/dependencies/create', {
    revision: rev.dependencies, editor: 'Tester',
    record: { fromItemId: 'RM-0001', toItemId: 'RM-0002', dependencyType: 'predecessor', blocking: true }
  });
  equal('a dependency is created', dependency.body.record.id, 'DEP-0001');

  const duplicate = await api('POST', '/api/dataset/dependencies/create', {
    revision: dependency.body.revision, editor: 'Tester',
    record: { fromItemId: 'RM-0001', toItemId: 'RM-0002' }
  });
  equal('a duplicate dependency is flagged', duplicate.status, 422);
  check('the duplicate is reported as a warning, not an error',
    duplicate.body.error.detail.warnings.length === 1 && duplicate.body.error.detail.errors.length === 0);

  const accepted = await api('POST', '/api/dataset/dependencies/create', {
    revision: dependency.body.revision, editor: 'Tester', acceptWarnings: true,
    record: { fromItemId: 'RM-0001', toItemId: 'RM-0002' }
  });
  equal('a duplicate can be saved deliberately', accepted.status, 200);

  /* -------------------------------------------------- */
  process.stdout.write('\nDeleting\n');
  rev = await revisions();
  const blocked = await api('POST', '/api/programmes/delete', {
    id: 'PRG-0001', cascade: false, editor: 'Tester', revisions: rev
  });
  equal('deleting a programme with children needs an explicit choice', blocked.status, 409);
  equal('the refusal says how many children there are', blocked.body.error.detail.childCount, 2);
  equal('nothing was deleted', (await records('programmes')).length, 1);

  const itemDelete = await api('POST', '/api/dataset/roadmapItems/delete', {
    revision: rev.roadmapItems, id: 'RM-0002', editor: 'Tester', revisions: { dependencies: rev.dependencies }
  });
  equal('deleting an item also removes its dependency records', itemDelete.body.removedDependencies, 2);
  equal('no orphan dependencies are left behind', (await records('dependencies')).length, 0);

  rev = await revisions();
  const cascade = await api('POST', '/api/programmes/delete', {
    id: 'PRG-0001', cascade: true, editor: 'Tester', revisions: rev
  });
  equal('a cascade delete removes the children too', cascade.body.removedItems, 1);
  equal('the programme is gone', (await records('programmes')).length, 0);
  equal('its roadmap items are gone', (await records('roadmapItems')).length, 0);

  /* -------------------------------------------------- */
  process.stdout.write('\nBacklog and promotion\n');
  rev = await revisions();
  const backlogItem = await api('POST', '/api/dataset/backlog/create', {
    revision: rev.backlog, editor: 'Tester',
    record: { change: 'Quick Ship proposition', systemArea: 'bpp', owner: 'Priya', currentStatus: 'idea' }
  });
  equal('a backlog item needs no dates', backlogItem.body.record.id, 'BLG-0001');

  rev = await revisions();
  const promoted = await api('POST', '/api/backlog/promote', {
    backlogId: 'BLG-0001', editor: 'Tester', revisions: rev,
    newProgramme: { name: 'Stock Trust' },
    item: { title: 'Quick Ship proposition', startDate: '2027-01-01', endDate: '2027-03-31', status: 'discovery' }
  });
  equal('promoting creates the roadmap item', promoted.body.record.title, 'Quick Ship proposition');
  equal('promoting can create the programme at the same time', promoted.body.programme.name, 'Stock Trust');
  const backlogAfter = (await records('backlog'))[0];
  check('the backlog item is marked as promoted and linked',
    backlogAfter.promoted === true && backlogAfter.roadmapItemId === promoted.body.record.id);

  /* -------------------------------------------------- */
  process.stdout.write('\nCSV export and import\n');
  const csvExport = await api('GET', '/api/export/csv/roadmapItems');
  equal('CSV export responds', csvExport.status, 200);
  const csvText = String(csvExport.body);
  check('the CSV has a header row', csvText.indexOf('Id,Programme Id,Title') >= 0);
  check('the CSV contains the data', csvText.indexOf('Quick Ship proposition') >= 0);
  check('a copy is written to the exports folder',
    fs.readdirSync(path.join(ROOT, 'exports')).some(function (f) { return f.indexOf('roadmap-items') === 0; }));

  const beforeImport = await records('roadmapItems');
  const badCsv = csvText.replace('2027-03-31', '2026-01-01'); // end before start
  const failedImport = await api('POST', '/api/import/csv', { dataset: 'roadmapItems', csv: badCsv, mode: 'merge', editor: 'Tester' });
  equal('an invalid CSV row stops the whole import', failedImport.status, 422);
  check('the error names the row', JSON.stringify(failedImport.body.error.detail.errors).indexOf('Row 2') >= 0);
  equal('nothing was partially imported', (await records('roadmapItems')).length, beforeImport.length);
  equal('existing data is untouched', (await records('roadmapItems'))[0].endDate, '2027-03-31');

  const goodImport = await api('POST', '/api/import/csv', {
    dataset: 'roadmapItems', csv: csvText.replace('Quick Ship proposition', 'Quick Ship (renamed)'),
    mode: 'merge', editor: 'Tester'
  });
  equal('a valid CSV import succeeds', goodImport.status, 200);
  equal('the matching row was updated, not duplicated', goodImport.body.updated, 1);
  equal('the update is visible', (await records('roadmapItems'))[0].title, 'Quick Ship (renamed)');

  /* -------------------------------------------------- */
  process.stdout.write('\nComplete backup, import and restore\n');
  const bundle = await api('GET', '/api/export/json');
  equal('the complete export responds', bundle.status, 200);
  check('the export contains every dataset',
    ['programmes', 'roadmapItems', 'dependencies', 'backlog', 'resourceScenarios', 'settings']
      .every(function (key) { return Object.prototype.hasOwnProperty.call(bundle.body, key); }));

  rev = await revisions();
  await api('POST', '/api/dataset/programmes/create', {
    revision: rev.programmes, editor: 'Tester', record: { name: 'Added after the export' }
  });
  equal('an extra programme exists before the import', (await records('programmes')).length, 2);

  const restoreImport = await api('POST', '/api/import/json', { bundle: bundle.body, editor: 'Tester' });
  equal('importing the complete backup succeeds', restoreImport.status, 200);
  equal('the roadmap is back to the exported state', (await records('programmes')).length, 1);

  const backupList = await api('GET', '/api/backups?dataset=programmes');
  check('backups were taken automatically', backupList.body.backups.length > 0);

  const newest = backupList.body.backups[0];
  const restored = await api('POST', '/api/backups/restore', { file: newest.file, editor: 'Tester' });
  equal('a backup can be restored', restored.status, 200);
  const afterRestore = await api('GET', '/api/backups?dataset=programmes');
  check('restoring itself takes a backup first',
    afterRestore.body.backups.length > backupList.body.backups.length);

  /* -------------------------------------------------- */
  process.stdout.write('\nCapacity planning\n');
  rev = await revisions();
  const scenario = await api('POST', '/api/dataset/resourceScenarios/create', {
    revision: rev.resourceScenarios, editor: 'Tester',
    record: {
      name: 'Test scenario', active: true,
      allocations: { b2b: { dev: { '2027-01': 1.5, '2027-02': 2 } } }
    }
  });
  equal('a scenario stores capacity per stream, type and month',
    scenario.body.record.allocations.b2b.dev['2027-02'], 2);

  const badMonth = await api('POST', '/api/dataset/resourceScenarios/create', {
    revision: scenario.body.revision, editor: 'Tester',
    record: { name: 'Bad months', allocations: { b2b: { dev: { 'January': 1 } } } }
  });
  equal('a capacity month must be written as YYYY-MM', badMonth.status, 422);

  const negative = await api('POST', '/api/dataset/resourceScenarios/create', {
    revision: scenario.body.revision, editor: 'Tester',
    record: { name: 'Negative', allocations: { b2b: { dev: { '2027-01': -2 } } } }
  });
  equal('negative capacity is rejected', negative.status, 422);

  const legacyScenario = await api('POST', '/api/dataset/resourceScenarios/create', {
    revision: scenario.body.revision, editor: 'Tester',
    record: { name: 'Older version', resources: { dev: 1.5 } }
  });
  const upgraded = legacyScenario.body.record.allocations.unassigned;
  check('an older flat scenario becomes a monthly plan',
    !!upgraded && Object.keys(upgraded.dev).length === 24 && Object.values(upgraded.dev)[0] === 1.5);

  // The roadmap was emptied and re-imported earlier, so make a fresh item to
  // export: one with several systems and a task on it.
  rev = await revisions();
  const exportProgramme = (await records('programmes'))[0];
  await api('POST', '/api/dataset/roadmapItems/create', {
    revision: rev.roadmapItems, editor: 'Tester',
    record: {
      title: 'Export sample', programmeId: exportProgramme.id,
      systemAreas: ['bpp', 'netsuite'], types: ['integration'], stream: 'b2b',
      startDate: '2027-01-01', endDate: '2027-03-31',
      tasks: [{ id: 'TSK-9001', name: 'Build it', status: 'build', owner: 'Jake', days: { dev: 5 } }]
    }
  });

  const taskCsv = await api('GET', '/api/export/csv/tasks');
  equal('the task register exports as CSV', taskCsv.status, 200);
  check('the task CSV carries the roll-up columns',
    String(taskCsv.body).indexOf('Task,Status,Owner,Stream,OKRs,Links') > 0);
  check('the task CSV contains a task row', String(taskCsv.body).indexOf('Build it') > 0);

  const itemCsv = String((await api('GET', '/api/export/csv/roadmapItems')).body);
  check('the roadmap CSV writes several systems in one column', itemCsv.indexOf('BPP; NetSuite') > 0);
  check('the roadmap CSV no longer has a scope column', itemCsv.indexOf('Out Of Scope') < 0);

  /* -------------------------------------------------- */
  process.stdout.write('\nBacklog planning\n');
  rev = await revisions();
  const plannedBacklog = await api('POST', '/api/dataset/backlog/create', {
    revision: rev.backlog, editor: 'Tester',
    record: {
      change: 'Costed backlog item', owner: 'Priya', stream: 'd2c',
      startDate: '2027-02-01', endDate: '2027-04-30', days: { po: 4, dev: 12 }
    }
  });
  equal('a backlog item can carry expected dates', plannedBacklog.body.record.startDate, '2027-02-01');
  equal('a backlog item can carry a team', plannedBacklog.body.record.stream, 'd2c');
  equal('a backlog item can carry an effort estimate', plannedBacklog.body.record.days.dev, 12);

  const backwardsBacklog = await api('POST', '/api/dataset/backlog/create', {
    revision: plannedBacklog.body.revision, editor: 'Tester',
    record: { change: 'Backwards', startDate: '2027-04-01', endDate: '2027-01-01' }
  });
  equal('backlog dates are checked the same way', backwardsBacklog.status, 422);

  rev = await revisions();
  const carrying = await api('POST', '/api/dataset/resourceScenarios/create', {
    revision: rev.resourceScenarios, editor: 'Tester',
    record: { name: 'Carries backlog', includedBacklogIds: [plannedBacklog.body.record.id, plannedBacklog.body.record.id] }
  });
  equal('a scenario records which backlog items it carries', carrying.body.record.includedBacklogIds.length, 1);

  const backlogCsv = String((await api('GET', '/api/export/csv/backlog')).body);
  check('the backlog CSV carries the planning columns',
    backlogCsv.indexOf('Stream,Start Date,End Date') > 0 && backlogCsv.indexOf('Development Days') > 0);

  /* -------------------------------------------------- */
  process.stdout.write('\nThe JSON guide and additive import\n');
  const guideResponse = await api('GET', '/api/export/guide');
  equal('the JSON guide is generated', guideResponse.status, 200);
  const guideText = String(guideResponse.body);
  check('the guide lists the live statuses', guideText.indexOf('| `discovery` | Discovery |') > 0);
  check('the guide lists the live streams', guideText.indexOf('Resource streams') > 0);
  check('the guide lists the people', guideText.indexOf('* Nicolas') > 0);
  check('the guide lists the OKRs with both levels',
    guideText.indexOf('`okr-dealer`') > 0 && guideText.indexOf('`kr-order-errors`') > 0);
  check('the guide tells the reader not to invent master data',
    guideText.indexOf('Never invent master data') > 0);
  check('a copy is written to the exports folder',
    fs.readdirSync(path.join(ROOT, 'exports')).some(function (f) { return f.indexOf('RoadmapJsonGuide') === 0; }));

  // The example printed in the guide must itself be importable.
  const example = JSON.parse(/## The shape[\s\S]*?```json\n([\s\S]*?)\n```/.exec(guideText)[1]);
  const programmesBefore = (await records('programmes')).length;
  const itemsBefore = (await records('roadmapItems')).length;
  const added = await api('POST', '/api/import/add', { bundle: example, editor: 'Tester' });
  equal('the example in the guide imports cleanly', added.status, 200);
  equal('it raises no unknown-value warnings', added.body.warnings.length, 0);
  equal('nothing that already existed was replaced', (await records('programmes')).length, programmesBefore + added.body.programmes);
  equal('the system change was added', (await records('roadmapItems')).length, itemsBefore + 1);
  const addedItem = (await records('roadmapItems')).slice(-1)[0];
  check('its tasks were given ids', (addedItem.tasks || []).every(function (task) { return /^TSK-\d{4}$/.test(task.id); }));
  check('its tasks keep their effort', addedItem.tasks[0].days.dev > 0);

  const reuse = await api('POST', '/api/import/add', {
    editor: 'Tester',
    bundle: {
      programmes: [{ name: example.programmes[0].name, description: 'Same name as before' }],
      roadmapItems: [{ programme: example.programmes[0].name, title: 'Second change under the same programme' }]
    }
  });
  equal('a programme with a name that already exists is reused', reuse.body.programmes, 0);
  equal('and its system change still lands', reuse.body.roadmapItems, 1);

  const refused = await api('POST', '/api/import/add', {
    editor: 'Tester',
    bundle: {
      programmes: [{ name: 'Never created' }],
      roadmapItems: [
        { programme: 'No such programme', title: 'Orphan' },
        { programme: 'Never created', title: 'Backwards', startDate: '2027-05-01', endDate: '2027-01-01' }
      ]
    }
  });
  equal('an import naming a missing programme is refused', refused.status, 422);
  check('every problem is listed', refused.body.error.detail.errors.length === 2);
  check('and nothing at all was written',
    !(await records('programmes')).some(function (p) { return p.name === 'Never created'; }));

  const warned = await api('POST', '/api/import/add', {
    editor: 'Tester',
    bundle: {
      roadmapItems: [{
        programme: example.programmes[0].name, title: 'Uses values nobody set up',
        status: 'in-progress', systemAreas: ['sap'], stream: 'platform-team',
        tasks: [{ name: 'T', okrIds: ['kr-made-up'], days: { dev: 2 } }]
      }]
    }
  });
  equal('an unknown value does not block the import', warned.status, 200);
  check('but it is reported back', warned.body.warnings.length === 4, JSON.stringify(warned.body.warnings));

  /* -------------------------------------------------- */
  process.stdout.write('\nFile safety\n');
  const programmesFile = path.join(ROOT, 'data', 'programmes.json');
  const goodContent = fs.readFileSync(programmesFile, 'utf8');
  fs.writeFileSync(programmesFile, '{ this is not json');
  const brokenHealth = await api('GET', '/api/health');
  check('a corrupt file is detected', brokenHealth.body.ok === false);
  equal('the corrupt file is named', brokenHealth.body.problems[0].file, 'programmes.json');
  check('a backup is offered for recovery', !!brokenHealth.body.problems[0].latestBackup);
  equal('the corrupt file was not overwritten', fs.readFileSync(programmesFile, 'utf8'), '{ this is not json');
  fs.writeFileSync(programmesFile, goodContent);
  check('health recovers once the file is valid again', (await api('GET', '/api/health')).body.ok === true);

  check('no temporary write files are left behind',
    fs.readdirSync(path.join(ROOT, 'data')).every(function (f) { return !f.endsWith('.tmp'); }));

  const noPassword = await api('POST', '/api/settings/save', {
    revision: (await revisions()).settings, editor: 'Tester',
    settings: { appName: 'Should not save' }
  });
  equal('settings cannot be saved without the password', noPassword.status, 403);

  const wrongPassword = await api('POST', '/api/settings/unlock', { password: 'nope' });
  equal('a wrong settings password is refused', wrongPassword.body.ok, false);
  const rightPassword = await api('POST', '/api/settings/unlock', { password: 'Brompton2026' });
  equal('the settings password is accepted', rightPassword.body.ok, true);

  const settingsSave = await api('POST', '/api/settings/save', {
    revision: (await revisions()).settings, editor: 'Tester', password: 'Brompton2026',
    settings: { port: 70000 }
  });
  equal('an impossible port is rejected', settingsSave.status, 422);

  const settingsOk = await api('POST', '/api/settings/save', {
    revision: (await revisions()).settings, editor: 'Tester', password: 'Brompton2026',
    settings: { appName: 'Brompton Roadmap', statuses: [{ id: 'idea', name: 'Renamed idea' }] }
  });
  equal('settings can be saved with the password', settingsOk.status, 200);
  equal('a renamed status keeps its id', settingsOk.body.settings.statuses[0].id, 'idea');
  check('OKRs keep their two levels',
    settingsOk.body.settings.okrs.length > 0 && settingsOk.body.settings.okrs[0].children.length > 0);
  check('resource streams are part of settings', settingsOk.body.settings.resourceStreams.length > 0);

  /* -------------------------------------------------- */
  process.stdout.write('\nSample data\n');
  const sample = await api('POST', '/api/sample', { mode: 'sample', editor: 'Tester' });
  equal('the sample roadmap loads', sample.status, 200);
  check('the sample has programmes and items',
    (await records('programmes')).length >= 4 && (await records('roadmapItems')).length >= 10);
  await api('POST', '/api/sample', { mode: 'empty', editor: 'Tester' });
  equal('sample data can be cleared', (await records('roadmapItems')).length, 0);

  server.close();

  process.stdout.write('\n' + passed + ' passed, ' + failed + ' failed\n');
  if (failed) {
    process.stdout.write('\nFailures:\n' + failures.map(function (f) { return '  - ' + f; }).join('\n') + '\n');
  }
  cleanup();
  process.exit(failed ? 1 : 0);
}

function cleanup() {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (err) { /* leave it for inspection */ }
}

run().catch(function (err) {
  process.stderr.write('\nThe test run crashed: ' + (err && err.stack ? err.stack : err) + '\n');
  cleanup();
  process.exit(1);
});
