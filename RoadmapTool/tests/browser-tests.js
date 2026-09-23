/**
 * Optional end-to-end browser tests.
 *
 * These drive the real application in Chromium and are the only tests that
 * need something installed: Playwright. The application itself has no
 * dependencies, so this file is deliberately separate from run-tests.js.
 *
 *   npm install -g playwright && npx playwright install chromium
 *   node app/server.js                (in one window)
 *   node tests/browser-tests.js       (in another)
 *
 * WARNING: the run starts by resetting the roadmap to the sample data, so
 * point it at a test copy of the application, never at the live one.
 * Set ROADMAP_URL to match the port that copy is running on.
 */

const { chromium } = require('playwright');
const BASE = process.env.ROADMAP_URL || 'http://localhost:4311/';
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/40[39]|422/.test(m.text())) errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => fetch('/api/sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'sample', editor: 'test' }) }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => { window.RM.setEditorName('Nicolas'); window.RM.closeTopModal(); });
  await page.waitForTimeout(400);

  console.log('\nRoadmap');
  check('the roadmap draws programme rows', await page.locator('.gantt-row-programme').count() >= 4);
  await page.locator('.row-toggle-task').first().click();
  await page.waitForTimeout(400);
  check('tasks show as a third level under a system change', await page.locator('.gantt-row-task').count() >= 1);
  const itemMeta = await page.locator('.gantt-row-item').first().locator('.row-meta').innerText();
  check('a system change shows its systems and effort', /Salesforce/.test(itemMeta) && /\d+ d/.test(itemMeta), itemMeta);

  console.log('\nReading and editing in one layout');
  await page.locator('.row-title', { hasText: 'Salesforce Accreditation Model' }).first().click();
  await page.waitForTimeout(400);
  const readLabels = await page.locator('.modal .definition dt').allTextContents();
  await page.locator('.panel-footer .button-primary', { hasText: 'Edit' }).click();
  await page.waitForTimeout(400);
  const editLabels = await page.locator('.modal .definition dt').allTextContents();
  check('editing keeps exactly the same fields in the same order',
    JSON.stringify(readLabels) === JSON.stringify(editLabels));
  check('editing swaps values for inputs in place', await page.locator('.modal .definition input').count() > 5);
  await page.locator('.definition', { hasText: 'End date' }).locator('input').fill('2026-01-01');
  await page.locator('.panel-footer .button-primary', { hasText: 'Save changes' }).click();
  await page.waitForTimeout(700);
  check('a bad date is flagged on the field itself', await page.locator('.definition.field-invalid').count() === 1);
  await page.locator('.panel-footer .button', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(400);
  check('cancel returns to reading', await page.locator('.panel-footer .button-primary', { hasText: 'Edit' }).count() === 1);
  const tabs = await page.locator('.modal .tab').allTextContents();
  check('the scope tab is gone', tabs.indexOf('Scope') < 0, tabs.join(','));
  check('tasks are a tab of their own', tabs.indexOf('Tasks') >= 0);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(300);

  console.log('\nCreating');
  await page.locator('.button', { hasText: '+ New Programme' }).click();
  await page.waitForTimeout(350);
  check('a new programme uses the same panel', await page.locator('.modal .panel-group-title').count() >= 2);
  await page.locator('.definition', { hasText: 'Programme name' }).locator('input').fill('UI Programme');
  await page.locator('.panel-footer .button-primary').click();
  await page.waitForTimeout(900);
  check('the created programme stays open to read', await page.locator('.panel-footer .button-primary', { hasText: 'Edit' }).count() === 1);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(300);

  await page.locator('.button', { hasText: '+ Add System Change' }).first().click();
  await page.waitForTimeout(400);
  check('a new system change uses the same panel', await page.locator('.modal .tabs .tab').count() === 8);
  check('tabs needing a saved record are locked', await page.locator('.tab-locked').count() >= 4);
  await page.locator('.definition', { hasText: 'Title' }).first().locator('input').fill('Multi select change');
  await page.locator('.definition', { hasText: 'Programme' }).locator('select').selectOption({ label: 'UI Programme' });
  await page.locator('.definition', { hasText: 'Systems' }).locator('.ms-control').click();
  await page.waitForTimeout(250);
  await page.locator('.ms-panel .ms-option', { hasText: 'Salesforce' }).click();
  await page.locator('.ms-panel .ms-option', { hasText: 'NetSuite' }).click();
  await page.locator('.modal-title').first().click();
  await page.waitForTimeout(200);
  await page.locator('.definition', { hasText: 'Types' }).locator('.ms-control').click();
  await page.waitForTimeout(250);
  await page.locator('.ms-panel .ms-option', { hasText: 'Integration' }).click();
  await page.locator('.ms-panel .ms-option', { hasText: 'Rollout' }).click();
  await page.locator('.modal-title').first().click();
  await page.waitForTimeout(200);
  await page.locator('.definition', { hasText: 'Resource stream' }).locator('select').selectOption({ label: 'B2B' });
  await page.locator('.definition', { hasText: 'Start date' }).locator('input').fill('2026-10-01');
  await page.locator('.definition', { hasText: 'End date' }).locator('input').fill('2026-12-31');
  await page.locator('.panel-footer .button-primary').click();
  await page.waitForTimeout(1000);
  const stored = await page.evaluate(() => {
    const i = window.RM.records('roadmapItems').find(r => r.title === 'Multi select change');
    return i && { systems: i.systemAreas, types: i.types, stream: i.stream };
  });
  check('several systems can be selected', stored && stored.systems.length === 2, JSON.stringify(stored));
  check('several types can be selected', stored && stored.types.length === 2, JSON.stringify(stored));
  check('the tabs unlock once the record exists', await page.locator('.tab-locked').count() === 0);

  console.log('\nTasks');
  await page.locator('.tab', { hasText: 'Tasks' }).click();
  await page.waitForTimeout(400);
  await page.locator('.button', { hasText: '+ Add task' }).first().click();
  await page.waitForTimeout(400);
  const taskModal = page.locator('.modal').last();
  await taskModal.locator('.field', { hasText: 'Task name' }).locator('input').fill('Build the integration');
  await taskModal.locator('.field').filter({ hasText: /^Owner$/ }).locator('input').fill('Jake');
  await taskModal.locator('.field').filter({ hasText: /^Product Owner$/ }).locator('input').fill('3');
  await taskModal.locator('.field').filter({ hasText: /^Development$/ }).locator('input').fill('12');
  await taskModal.locator('.field').filter({ hasText: /^Integration$/ }).locator('input').fill('8');
  await taskModal.locator('.ms-control').click();
  await page.waitForTimeout(250);
  await page.locator('.ms-panel .ms-option', { hasText: 'Launch new entities on the platform' }).click();
  await taskModal.locator('.modal-title').click();
  await page.waitForTimeout(200);
  await taskModal.locator('.button', { hasText: '+ Add link' }).click();
  await page.waitForTimeout(200);
  await taskModal.locator('.link-row input').nth(0).fill('Jira INT-999');
  await taskModal.locator('.link-row input').nth(1).fill('https://jira.example.com/browse/INT-999');
  await taskModal.locator('.button', { hasText: '+ Add link' }).click();
  await page.waitForTimeout(200);
  await taskModal.locator('.link-row').nth(1).locator('input').nth(0).fill('Design doc');
  await taskModal.locator('.link-row').nth(1).locator('input').nth(1).fill('https://docs.example.com/design');
  await taskModal.locator('.button-primary', { hasText: 'Save task' }).click();
  await page.waitForTimeout(1000);
  const task = await page.evaluate(() => {
    const i = window.RM.records('roadmapItems').find(r => r.title === 'Multi select change');
    return i && i.tasks[0];
  });
  check('the task keeps its effort', task && task.days.dev === 12 && task.days.int === 8);
  check('the task keeps several external links', task && task.links.length === 2);
  check('the task keeps its OKR', task && task.okrIds.length === 1);

  await page.locator('.tab', { hasText: 'Resources' }).click();
  await page.waitForTimeout(400);
  check('effort rolls up to the system change', (await page.locator('tfoot th').nth(1).innerText()).trim() === '23');
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(400);
  const programmeMeta = await page.locator('.gantt-row-programme', { hasText: 'UI Programme' }).locator('.row-meta').innerText();
  check('effort rolls up to the programme', /23 d/.test(programmeMeta), programmeMeta);

  console.log('\nConflict protection');
  await page.evaluate(() => { window.RM.state.roadmapItems.revision = 1; });
  await page.locator('.row-title', { hasText: 'Multi select change' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.panel-footer .button-primary', { hasText: 'Edit' }).click();
  await page.waitForTimeout(300);
  await page.locator('.definition', { hasText: 'Title' }).first().locator('input').fill('Stale edit');
  await page.locator('.panel-footer .button-primary', { hasText: 'Save changes' }).click();
  await page.waitForTimeout(700);
  const conflict = await page.locator('.modal').last().innerText();
  check('a stale save shows the conflict dialog', /changed since you opened/i.test(conflict));
  await page.locator('.modal').last().locator('.button-primary').click();
  await page.waitForTimeout(900);
  check('the stale edit was not written', await page.locator('.row-title', { hasText: 'Stale edit' }).count() === 0);

  console.log('\nFilters and views');
  await page.locator('.search-input').first().fill('accreditation');
  await page.waitForTimeout(600);
  check('search filters the roadmap', await page.locator('.chip').count() >= 1);
  await page.locator('.chip-clear').click();
  await page.waitForTimeout(500);
  const streamSelect = page.locator('.filter-row select').nth(6);
  await streamSelect.selectOption({ label: 'B2B' });
  await page.waitForTimeout(500);
  check('a stream filter can be applied', await page.locator('.chip', { hasText: 'Stream' }).count() === 1);
  await page.locator('.chip-clear').click();
  await page.waitForTimeout(400);
  await page.locator('.segment', { hasText: 'Executive View' }).click();
  await page.waitForTimeout(400);
  check('executive view hides the system changes', await page.locator('.gantt-row-item').count() === 0);
  await page.locator('.segment', { hasText: 'Detailed View' }).click();
  await page.waitForTimeout(400);

  console.log('\nDragging');
  const bar = page.locator('.bar-item').first();
  const box = await bar.boundingBox();
  const before = await page.evaluate(() => window.RM.records('roadmapItems').find(r => r.id === 'RM-0001').startDate);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 95, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.RM.records('roadmapItems').find(r => r.id === 'RM-0001').startDate);
  check('dragging a bar moves the dates', before !== after, before + ' -> ' + after);

  console.log('\nBacklog');
  await page.locator('.nav-link', { hasText: 'Backlog' }).click();
  await page.waitForTimeout(500);
  await page.locator('.link-button', { hasText: 'Move to Roadmap' }).first().click();
  await page.waitForTimeout(400);
  const promo = page.locator('.modal').last();
  await promo.locator('.field', { hasText: 'Start date' }).locator('input').fill('2027-04-01');
  await promo.locator('.field', { hasText: 'End date' }).locator('input').fill('2027-06-30');
  await promo.locator('.button-primary').click();
  await page.waitForTimeout(1100);
  check('promoting opens the new system change', await page.locator('.detail-title').count() === 1);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(400);

  console.log('\nDependencies');
  await page.locator('.nav-link', { hasText: 'Dependencies' }).click();
  await page.waitForTimeout(500);
  const rowsBefore = await page.locator('.table tbody tr').count();
  await page.locator('.button', { hasText: '+ New Dependency' }).click();
  await page.waitForTimeout(300);
  const depModal = page.locator('.modal').last();
  await depModal.locator('select').nth(0).selectOption({ index: 1 });
  await depModal.locator('select').nth(1).selectOption({ index: 2 });
  await depModal.locator('.button-primary').click();
  await page.waitForTimeout(900);
  check('a dependency can be created', await page.locator('.table tbody tr').count() === rowsBefore + 1);
  await page.locator('.segment', { hasText: 'Map' }).click();
  await page.waitForTimeout(600);
  check('the dependency map draws nodes', await page.locator('.map-node').count() > 0);

  console.log('\nResources');
  await page.locator('.nav-link', { hasText: 'Resources' }).click();
  await page.waitForTimeout(800);
  check('the capacity plan is a monthly grid', await page.locator('.cell-input').count() > 20);
  const cell = page.locator('.cell-input').first();
  await cell.fill('2.5');
  await cell.dispatchEvent('change');
  await page.locator('.button-primary', { hasText: 'Save capacity plan' }).click();
  await page.waitForTimeout(1000);
  const savedCell = await page.evaluate(() => {
    const s = window.RM.records('resourceScenarios').find(x => x.active) || window.RM.records('resourceScenarios')[0];
    const stream = Object.keys(s.allocations)[0];
    const type = Object.keys(s.allocations[stream])[0];
    const months = Object.keys(s.allocations[stream][type]).sort();
    return s.allocations[stream][type][months[0]];
  });
  check('a capacity cell is saved', typeof savedCell === 'number', String(savedCell));
  await page.locator('.segment', { hasText: 'Demand vs capacity' }).click();
  await page.waitForTimeout(800);
  check('demand is shown against capacity', await page.locator('.cell-demand-value').count() > 0);
  await page.locator('.segment', { hasText: 'Standard estimate' }).click();
  await page.waitForTimeout(600);
  check('the demand source can be switched', await page.locator('.segment-active', { hasText: 'Standard estimate' }).count() === 1);

  console.log('\nSettings');
  await page.locator('.nav-link', { hasText: 'Settings' }).click();
  await page.waitForTimeout(500);
  check('settings asks for the password', await page.locator('input[type=password]').count() === 1);
  await page.locator('input[type=password]').fill('wrong');
  await page.locator('.button-primary', { hasText: 'Unlock settings' }).click();
  await page.waitForTimeout(700);
  check('a wrong password is refused', (await page.locator('.field-error').innerText()).length > 0);
  await page.locator('input[type=password]').fill('Brompton2026');
  await page.locator('.button-primary', { hasText: 'Unlock settings' }).click();
  await page.waitForTimeout(900);
  check('the right password opens settings', await page.locator('.panel-title', { hasText: 'OKRs' }).count() === 1);
  check('the two resource levels are editable',
    await page.locator('.panel-title', { hasText: 'Resource streams (level 2)' }).count() === 1);
  const okrPanel = page.locator('.panel', { hasText: 'OKRs' }).last();
  await okrPanel.locator('.option-add input').last().fill('New objective');
  await okrPanel.locator('.option-add .button').last().click();
  await page.waitForTimeout(300);
  await page.locator('.sticky-actions .button-primary').click();
  await page.waitForTimeout(1000);
  check('a new objective is saved', await page.evaluate(() => window.RM.settings().okrs.some(o => o.name === 'New objective')));
  await page.locator('.button', { hasText: 'Lock settings' }).click();
  await page.waitForTimeout(500);
  check('settings can be locked again', await page.locator('input[type=password]').count() === 1);

  console.log('\nData');
  await page.locator('.nav-link', { hasText: 'Data' }).click();
  await page.waitForTimeout(700);
  const download = page.waitForEvent('download');
  await page.locator('.button', { hasText: 'Export Tasks CSV' }).click();
  const file = await download;
  check('the task register exports', /tasks_.*\.csv/.test(file.suggestedFilename()), file.suggestedFilename());

  console.log('\nconsole errors: ' + JSON.stringify(errors));
  console.log(pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
