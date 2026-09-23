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
  // The sample links point at example.com. Stub them so "open in a new tab"
  // can be checked without the test needing the internet.
  const context = await browser.newContext();
  await context.route('**example.com/**', function (route) {
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>stub</h1>' });
  });
  /** A cell of the panel ribbon, found by its label. */
  const ribbon = (page, label) => page.locator('.modal .ribbon-cell')
    .filter({ has: page.locator('.ribbon-label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
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
  const readLabels = await page.locator('.modal .ribbon-label, .modal .definition dt').allTextContents();
  await page.locator('.panel-footer .button-primary', { hasText: 'Edit' }).click();
  await page.waitForTimeout(400);
  const editLabels = await page.locator('.modal .ribbon-label, .modal .definition dt').allTextContents();
  check('editing keeps exactly the same fields in the same order',
    JSON.stringify(readLabels) === JSON.stringify(editLabels),
    JSON.stringify(readLabels) + ' vs ' + JSON.stringify(editLabels));
  check('the facts sit in one ribbon, not repeated below',
    await page.locator('.modal .ribbon-cell').count() >= 10);
  check('editing swaps values for inputs in place',
    await page.locator('.modal .ribbon-cell input, .modal .ribbon-cell select, .modal .ribbon-cell .ms-control').count() >= 10);
  check('the title is edited where it is read', await page.locator('.modal .hero-input-title').count() === 1);
  // This change has dated tasks, so its window is theirs and cannot be typed over.
  check('a change with dated tasks shows its window as coming from them',
    await ribbon(page, 'Start (from tasks)').count() === 1
    && await ribbon(page, 'Start (from tasks)').locator('input').count() === 0);
  await page.locator('.panel-footer .button', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(400);
  check('cancel returns to reading', await page.locator('.panel-footer .button-primary', { hasText: 'Edit' }).count() === 1);
  const tabs = await page.locator('.modal .tab').allTextContents();
  check('the scope tab is gone', tabs.indexOf('Scope') < 0, tabs.join(','));
  check('the delivery tab is gone with the estimates', tabs.indexOf('Delivery') < 0, tabs.join(','));
  check('tasks are a tab of their own', tabs.indexOf('Tasks') >= 0);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(300);

  console.log('\nCreating');
  await page.locator('.button', { hasText: '+ New Programme' }).click();
  await page.waitForTimeout(350);
  check('a new programme uses the same panel',
    await page.locator('.modal .ribbon-cell').count() >= 4 && await page.locator('.modal .hero-input-title').count() === 1);
  await page.locator('.modal .hero-input-title').fill('UI Programme');
  await page.locator('.panel-footer .button-primary').click();
  await page.waitForTimeout(900);
  check('the created programme stays open to read', await page.locator('.panel-footer .button-primary', { hasText: 'Edit' }).count() === 1);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(300);

  await page.locator('.button', { hasText: '+ Add System Change' }).first().click();
  await page.waitForTimeout(400);
  check('a new system change uses the same panel', await page.locator('.modal .tabs .tab').count() === 7);
  check('tabs needing a saved record are locked', await page.locator('.tab-locked').count() >= 4);
  await page.locator('.modal .hero-input-title').fill('Multi select change');
  await ribbon(page, 'Programme').locator('select').selectOption({ label: 'UI Programme' });
  await ribbon(page, 'Systems').locator('.ms-control').click();
  await page.waitForTimeout(250);
  await page.locator('.ms-panel .ms-option', { hasText: 'Salesforce' }).click();
  await page.locator('.ms-panel .ms-option', { hasText: 'NetSuite' }).click();
  await page.locator('.modal-title').first().click();
  await page.waitForTimeout(200);
  await ribbon(page, 'Types').locator('.ms-control').click();
  await page.waitForTimeout(250);
  await page.locator('.ms-panel .ms-option', { hasText: 'Integration' }).click();
  await page.locator('.ms-panel .ms-option', { hasText: 'Data change' }).click();
  await page.locator('.modal-title').first().click();
  await page.waitForTimeout(200);
  await ribbon(page, 'Stream').locator('select').selectOption({ label: 'B2B' });
  check('a change with no tasks yet keeps a planned window of its own',
    await ribbon(page, 'Planned start').locator('input').count() === 1);
  await ribbon(page, 'Planned start').locator('input').fill('2026-10-01');
  await ribbon(page, 'Planned end').locator('input').fill('2026-01-01');
  await page.locator('.panel-footer .button-primary').click();
  await page.waitForTimeout(700);
  check('a bad date is flagged on the field itself', await page.locator('.modal .field-invalid').count() === 1);
  await ribbon(page, 'Planned end').locator('input').fill('2026-12-31');
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
  await taskModal.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Owner$/ }) })
    .locator('select').selectOption({ label: 'Jake' });
  const taskDates = taskModal.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^(Start|End) date$/ }) });
  check('a new task starts life on its system change\'s dates',
    await taskDates.nth(0).locator('input').inputValue() === '2026-10-01'
    && await taskDates.nth(1).locator('input').inputValue() === '2026-12-31');
  // The point of task dates: narrow them so the effort lands in one month.
  await taskDates.nth(0).locator('input').fill('2026-10-01');
  await taskDates.nth(1).locator('input').fill('2026-10-31');
  await taskModal.locator('.field').filter({ hasText: /^Product owner$/ }).locator('input').fill('3');
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
  // A third link with no label at all, and a punishing address.
  await taskModal.locator('.button', { hasText: '+ Add link' }).click();
  await page.waitForTimeout(200);
  await taskModal.locator('.link-row').nth(2).locator('input').nth(1)
    .fill('https://confluence.example.com/spaces/PLATFORM/pages/9988776655/Accreditation+data+model+decision+record');
  // A link can be opened from the editor, in a new tab, before it is saved.
  const [linkTab] = await Promise.all([
    page.context().waitForEvent('page'),
    taskModal.locator('.link-row').first().locator('.icon-button').first().click()
  ]);
  check('a link opens in a new tab from the task editor',
    /jira\.example\.com\/browse\/INT-999/.test(linkTab.url()), linkTab.url());
  await linkTab.close();

  await taskModal.locator('.button-primary', { hasText: 'Save task' }).click();
  await page.waitForTimeout(1000);
  const task = await page.evaluate(() => {
    const i = window.RM.records('roadmapItems').find(r => r.title === 'Multi select change');
    return i && i.tasks[0];
  });
  check('the task keeps its effort', task && task.days.dev === 12 && task.days.int === 8);
  check('the task keeps several external links', task && task.links.length === 3);
  check('the task keeps its OKR', task && task.okrIds.length === 1);
  check('the task keeps its own dates',
    task && task.startDate === '2026-10-01' && task.endDate === '2026-10-31',
    task && task.startDate + ' to ' + task.endDate);

  // The task table has to stay readable however long the notes and addresses are.
  const taskRow = page.locator('.table-tasks tbody tr').first();
  check('the task table shows the task dates',
    (await taskRow.locator('.col-dates').innerText()).indexOf('1 Oct 26') === 0,
    await taskRow.locator('.col-dates').innerText());
  const chips = await taskRow.locator('.col-links .link-out').allTextContents();
  check('a labelled link shows its label, not its address', chips[0] === 'Jira INT-999', JSON.stringify(chips));
  check('an unlabelled link is shortened to fit the cell',
    chips[2].length <= 24 && chips[2].indexOf('https://') < 0, JSON.stringify(chips));
  check('the full address stays on the tooltip',
    (await taskRow.locator('.col-links .link-out').nth(2).getAttribute('title')).indexOf('confluence.example.com') > 0);
  const fits = await page.evaluate(() => {
    const table = document.querySelector('.table-tasks');
    return table.scrollWidth - table.closest('.table-wrap').clientWidth;
  });
  check('a long description and address do not push the table out of its panel', fits <= 0, String(fits));

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
  await page.locator('.modal .hero-input-title').fill('Stale edit');
  await page.locator('.panel-footer .button-primary', { hasText: 'Save changes' }).click();
  await page.waitForTimeout(700);
  const conflict = await page.locator('.modal').last().innerText();
  check('a stale save shows the conflict dialog', /changed since you opened/i.test(conflict));
  await page.locator('.modal').last().locator('.button-primary').click();
  await page.waitForTimeout(900);
  check('the stale edit was not written', await page.locator('.row-title', { hasText: 'Stale edit' }).count() === 0);

  console.log('\nMilestones');
  const milestone = page.locator('.milestone').first();
  await milestone.hover();
  await page.waitForTimeout(400);
  const milestoneTip = await page.locator('.tooltip').innerText();
  check('hovering a milestone shows its note',
    /Proved the effective-dating model/.test(milestoneTip), milestoneTip.replace(/\n/g, ' | '));
  check('the tooltip names the milestone and its date',
    /POC|Integration mapped|UAT|Go live/.test(milestoneTip) && /20\d\d/.test(milestoneTip), milestoneTip.replace(/\n/g, ' | '));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);

  console.log('\nKey dates');
  check('key dates are drawn on the timeline', await page.locator('.key-date-flag').count() >= 2);
  check('and a line runs down the chart', await page.locator('.key-date-line').count() > 0);
  const keyDateNames = await page.locator('.key-date-flag').allTextContents();
  check('the flag carries the label', keyDateNames.indexOf('Peak season freeze') >= 0, keyDateNames.join(','));
  await page.locator('.toggle', { hasText: 'Key dates' }).locator('input').uncheck();
  await page.waitForTimeout(500);
  check('they can be hidden', await page.locator('.key-date-flag').count() === 0);
  await page.locator('.toggle', { hasText: 'Key dates' }).locator('input').check();
  await page.waitForTimeout(500);
  check('and shown again', await page.locator('.key-date-flag').count() >= 2);

  console.log('\nFilters and views');
  await page.locator('.search-input').first().fill('accreditation');
  await page.waitForTimeout(600);
  check('search filters the roadmap', await page.locator('.chip').count() >= 1);
  await page.locator('.chip-clear').click();
  await page.waitForTimeout(500);
  const streamSelect = page.locator('.filter-row select')
    .filter({ has: page.locator('option', { hasText: 'Stream: All' }) });
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
  const readBar = () => page.evaluate(() => {
    const item = window.RM.records('roadmapItems').find(r => r.id === 'RM-0001');
    return { range: window.RM.itemRange(item), tasks: (item.tasks || []).map(t => t.startDate).join(',') };
  });
  const before = await readBar();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 95, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const after = await readBar();
  check('dragging a bar moves the dates',
    before.range.startDate !== after.range.startDate,
    before.range.startDate + ' -> ' + after.range.startDate);
  // The window comes from the tasks, so sliding the bar has to slide them,
  // every one by the same number of days.
  const dayGap = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const shiftOfWindow = dayGap(before.range.startDate, after.range.startDate);
  const taskShifts = after.tasks.split(',').map((date, i) => dayGap(before.tasks.split(',')[i], date));
  check('and it carries the tasks with it, keeping their shape',
    shiftOfWindow !== 0 && taskShifts.every(gap => gap === shiftOfWindow),
    before.tasks + ' -> ' + after.tasks + ' (window moved ' + shiftOfWindow + ')');

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

  // Task dates, not the system change's, are what shape the monthly demand:
  // a change running Oct to Jan whose effort is all in October has to read
  // as a spike in October, not as a flat quarter. The roadmap already has
  // demand of its own, so measure what this one change adds.
  const readSpread = () => page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.table-demand thead th.numeric')).map(th => th.textContent.trim());
    const rows = Array.from(document.querySelectorAll('.table-demand tbody tr'));
    let inStream = false;
    for (const row of rows) {
      if (row.classList.contains('row-group')) { inStream = row.textContent.trim() === 'B2B'; continue; }
      if (!inStream) continue;
      if (row.querySelector('.row-header').textContent.trim() !== 'Development') continue;
      const cells = Array.from(row.querySelectorAll('.cell-demand-value')).map(c => c.textContent.trim());
      const at = label => Number(cells[labels.indexOf(label)].replace(/[^0-9.]/g, '')) || 0;
      return { oct: at('Oct 2026'), nov: at('Nov 2026'), dec: at('Dec 2026') };
    }
    return null;
  });
  const demandBefore = await readSpread();
  await page.evaluate(async () => {
    const programme = window.RM.records('programmes')[0];
    await window.RM.api.create('roadmapItems', {
      title: 'Front loaded change', programmeId: programme.id, stream: 'b2b',
      startDate: '2026-10-01', endDate: '2027-01-31', status: 'in-progress',
      tasks: [
        { name: 'Heavy build', startDate: '2026-10-01', endDate: '2026-10-31', days: { dev: 42 } },
        { name: 'Light tail', startDate: '2026-11-01', endDate: '2027-01-31', days: { dev: 3 } }
      ]
    });
    await window.RM.refresh();
  });
  await page.waitForTimeout(900);
  const demandAfter = await readSpread();
  const added = demandBefore && demandAfter
    ? { oct: demandAfter.oct - demandBefore.oct, nov: demandAfter.nov - demandBefore.nov, dec: demandAfter.dec - demandBefore.dec }
    : null;
  // Spread across the system change it would be ~11 a month; by task it is 42 then 1.
  check('a task\'s effort lands in its own months, not the whole system change',
    added && added.oct > 40 && added.oct < 44, JSON.stringify(added));
  check('and the months after it stay quiet',
    added && added.nov < 2 && added.dec < 2, JSON.stringify(added));
  check('there is no estimate to switch to any more',
    await page.locator('.segment', { hasText: 'Fast MVP' }).count() === 0
    && await page.locator('.segment', { hasText: 'Standard estimate' }).count() === 0);

  // The same plan, read a week at a time. A month's days are shared out across
  // its calendar days, so the weeks in a month add back up to the month.
  const monthly = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.table-demand tbody tr'))
      .find(r => r.querySelector('.row-header') && r.querySelector('.row-header').textContent.trim() === 'Development');
    return Array.from(row.querySelectorAll('.cell-capacity-value')).map(c => Number(c.textContent.replace('/ ', '')));
  });
  await page.locator('.segment', { hasText: 'Weekly' }).click();
  await page.waitForTimeout(900);
  check('demand can be read week by week', await page.locator('.segment-active', { hasText: 'Weekly' }).count() === 1);
  const weekHeads = await page.locator('.table-demand thead th.numeric').allTextContents();
  check('the columns become weeks', weekHeads.length === 13 && /^\d+ \w+$/.test(weekHeads[0]), weekHeads.slice(0, 3).join(' | '));
  const weekly = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.table-demand tbody tr'))
      .find(r => r.querySelector('.row-header') && r.querySelector('.row-header').textContent.trim() === 'Development');
    return Array.from(row.querySelectorAll('.cell-capacity-value')).map(c => Number(c.textContent.replace('/ ', '')));
  });
  check('a week carries a share of the month it sits in, never the whole month',
    weekly.every(v => v > 0 && v < monthly[0]), JSON.stringify(weekly.slice(0, 4)) + ' vs month ' + monthly[0]);
  check('the charts follow the same periods',
    await page.locator('.chart-block').first().locator('.chart-col').count() === 13);

  const [sheet] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.button', { hasText: 'Export to Excel' }).click()
  ]);
  check('the resources sheet exports', /resources_.*\.csv/.test(sheet.suggestedFilename()), sheet.suggestedFilename());
  const sheetText = require('fs').readFileSync(await sheet.path(), 'utf8');
  check('the sheet says how it was read', sheetText.indexOf('Read by,Week') > 0);
  check('the sheet carries capacity, demand and what is spare',
    sheetText.indexOf('Capacity (days)') > 0 && sheetText.indexOf('Demand (days)') > 0 && sheetText.indexOf('Spare (days)') > 0);
  await page.locator('.segment', { hasText: 'Monthly' }).click();
  await page.waitForTimeout(600);

  console.log('\nArranging the roadmap by hand');
  await page.locator('.nav-link', { hasText: 'Roadmap' }).click();
  await page.waitForTimeout(700);
  // Collapse first so the programme rows sit together and nothing scrolls away.
  await page.locator('.button', { hasText: 'Collapse all' }).click();
  await page.waitForTimeout(600);

  const programmeOrder = () => page.evaluate(() =>
    window.RM.records('programmes').slice()
      .sort((a, b) => (Number(a.sortIndex) || 0) - (Number(b.sortIndex) || 0))
      .map(p => p.id));
  const beforeProgrammes = await programmeOrder();
  const programmeRows = page.locator('.gantt-row-programme');
  await programmeRows.nth(2).locator('.drag-handle')
    .dragTo(programmeRows.nth(0), { targetPosition: { x: 40, y: 4 } });
  await page.waitForTimeout(1200);
  const afterProgrammes = await programmeOrder();
  check('a programme can be dragged into a different place',
    afterProgrammes[0] === beforeProgrammes[2] && afterProgrammes[1] === beforeProgrammes[0],
    JSON.stringify(beforeProgrammes) + ' -> ' + JSON.stringify(afterProgrammes));
  check('and the new order is stored, not just drawn', await page.evaluate(() => {
    const order = window.RM.records('programmes').map(p => Number(p.sortIndex));
    return order.length > 1 && order.every(n => Number.isFinite(n)) && new Set(order).size === order.length;
  }));

  // System changes are arranged inside their own programme.
  await page.locator('.gantt-row-programme').filter({ hasText: 'Customer / Dealer Master' })
    .locator('.row-toggle').first().click();
  await page.waitForTimeout(600);
  const itemOrder = () => page.evaluate(() =>
    window.RM.records('roadmapItems').filter(i => i.programmeId === 'PRG-0001')
      .slice().sort((a, b) => (Number(a.sortIndex) || 0) - (Number(b.sortIndex) || 0))
      .map(i => i.id));
  const beforeItems = await itemOrder();
  const itemRows = page.locator('.gantt-row-item');
  await itemRows.nth(1).locator('.drag-handle').dragTo(itemRows.nth(0), { targetPosition: { x: 40, y: 4 } });
  await page.waitForTimeout(1200);
  const afterItems = await itemOrder();
  check('a system change can be moved within its programme',
    afterItems[0] === beforeItems[1] && afterItems[1] === beforeItems[0],
    JSON.stringify(beforeItems) + ' -> ' + JSON.stringify(afterItems));
  check('the other programmes are left alone', await page.evaluate(() =>
    window.RM.records('roadmapItems').filter(i => i.programmeId !== 'PRG-0001').length > 0));

  // Tasks are arranged inside their own system change.
  const taskItemId = beforeItems[1];
  await page.locator('.gantt-row-item').first().locator('.row-toggle-task').click();
  await page.waitForTimeout(600);
  const taskOrder = () => page.evaluate((id) =>
    (window.RM.itemById(id).tasks || []).map(t => t.id), taskItemId);
  const beforeTasks = await taskOrder();
  const taskRows = page.locator('.gantt-row-task');
  await taskRows.nth(1).locator('.drag-handle').dragTo(taskRows.nth(0), { targetPosition: { x: 40, y: 4 } });
  await page.waitForTimeout(1200);
  const afterTasks = await taskOrder();
  check('a task can be moved within its system change',
    afterTasks[0] === beforeTasks[1] && afterTasks[1] === beforeTasks[0],
    JSON.stringify(beforeTasks) + ' -> ' + JSON.stringify(afterTasks));

  // Rows that a filter has hidden cannot be put in order, so the grips go.
  await page.locator('.search-input').fill('accreditation');
  await page.waitForTimeout(900);
  check('a filtered roadmap offers no grips', await page.locator('.drag-handle').count() === 0);
  await page.locator('.search-input').fill('');
  await page.waitForTimeout(900);
  check('and they come back once the filter is cleared', await page.locator('.drag-handle').count() > 0);

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

  console.log('\nNothing overlapping');
  await page.locator('.nav-link', { hasText: 'Roadmap' }).click();
  await page.waitForTimeout(500);
  await page.locator('.row-title', { hasText: 'Salesforce Accreditation Model' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.panel-footer .button-primary', { hasText: 'Edit' }).click();
  await page.waitForTimeout(500);
  const spills = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.modal .definition, .modal .ribbon-cell')).map(d => {
      const r = d.getBoundingClientRect();
      const c = d.querySelector('.input, .ms-control');
      if (!c) return 0;
      const cr = c.getBoundingClientRect();
      return Math.round(Math.max(cr.right - r.right, r.left - cr.left));
    }).filter(v => v > 1);
  });
  check('no control spills out of its column', spills.length === 0, JSON.stringify(spills));

  console.log('\nOwners');
  check('only product and delivery owners are asked for',
    await ribbon(page, 'Product owners').count() === 1 &&
    await ribbon(page, 'Delivery owners').count() === 1 &&
    await page.locator('.modal .ribbon-label', { hasText: /Business owner|Technical owner/ }).count() === 0);

  await ribbon(page, 'Product owners').locator('.ms-control').click();
  await page.waitForTimeout(250);
  const ownerChoices = await page.locator('.ms-panel .ms-option').allTextContents();
  check('the product owner list comes from Settings',
    ownerChoices.indexOf('Sarah') >= 0 && ownerChoices.indexOf('Jake') < 0, ownerChoices.join(','));
  await page.locator('.ms-panel .ms-option', { hasText: 'Sarah' }).click();
  await page.locator('.modal-title').first().click();
  await page.waitForTimeout(200);

  await ribbon(page, 'Delivery owners').locator('.ms-control').click();
  await page.waitForTimeout(250);
  const deliveryChoices = await page.locator('.ms-panel .ms-option').allTextContents();
  check('the delivery owner list is its own', deliveryChoices.indexOf('Jake') >= 0, deliveryChoices.join(','));
  await page.locator('.ms-panel .ms-option', { hasText: 'Operations' }).click();
  await page.locator('.modal-title').first().click();
  await page.waitForTimeout(200);

  await page.locator('.panel-footer .button-primary', { hasText: 'Save changes' }).click();
  await page.waitForTimeout(900);
  const owners = await page.evaluate(() => {
    const i = window.RM.itemById('RM-0001');
    return { product: i.productOwners, delivery: i.deliveryOwners };
  });
  check('several product owners can be ticked', owners.product.length === 2, JSON.stringify(owners));
  check('several delivery owners can be ticked', owners.delivery.length === 2, JSON.stringify(owners));
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(300);

  console.log('\nBacklog planning');
  await page.locator('.nav-link', { hasText: 'Backlog' }).click();
  await page.waitForTimeout(600);
  const backlogHeaders = await page.locator('.table thead th').allTextContents();
  check('the backlog shows team, dates and effort',
    backlogHeaders.includes('Team') && backlogHeaders.includes('Dates') && backlogHeaders.includes('Effort'));
  await page.locator('.link-button', { hasText: 'Automated dealer credit checks' }).click();
  await page.waitForTimeout(400);
  await page.locator('.modal .button-primary', { hasText: 'Edit' }).click();
  await page.waitForTimeout(500);
  const backlogForm = page.locator('.modal').last();
  await backlogForm.locator('.field', { hasText: 'Expected start' }).locator('input').fill('2027-06-01');
  await backlogForm.locator('.field', { hasText: 'Expected end' }).locator('input').fill('2027-08-31');
  await backlogForm.locator('.field', { hasText: 'Team / resource stream' }).locator('select').selectOption({ label: 'B2B' });
  await backlogForm.locator('.field').filter({ hasText: /^Development days$/ }).locator('input').fill('15');
  await backlogForm.locator('.button-primary', { hasText: 'Save changes' }).click();
  await page.waitForTimeout(1000);
  const planned = await page.evaluate(() => window.RM.records('backlog').find(b => b.change === 'Automated dealer credit checks'));
  check('a backlog item can carry dates, a team and effort',
    planned.startDate === '2027-06-01' && planned.stream === 'b2b' && planned.days.dev === 15);

  console.log('\nBacklog inside a scenario');
  await page.locator('.nav-link', { hasText: 'Resources' }).click();
  await page.waitForTimeout(800);
  await page.locator('.segment', { hasText: 'Capacity plan' }).click();
  await page.waitForTimeout(700);
  const plannedOption = page.locator('.backlog-option', { hasText: 'Automated dealer credit checks' });
  check('the capacity plan lists the backlog', await plannedOption.count() === 1);
  await plannedOption.locator('input').check();
  await page.locator('.button-primary', { hasText: 'Save capacity plan' }).click();
  await page.waitForTimeout(1000);
  check('the scenario remembers what it carries', await page.evaluate(() => {
    const s = window.RM.records('resourceScenarios').find(x => x.active) || window.RM.records('resourceScenarios')[0];
    return (s.includedBacklogIds || []).length > 0;
  }));
  await page.locator('.segment', { hasText: 'Demand vs capacity' }).click();
  await page.waitForTimeout(900);
  check('backlog effort reaches the demand grid', await page.evaluate(() => {
    return Array.from(document.querySelectorAll('td[title]'))
      .some(c => /Backlog: Automated dealer credit checks/.test(c.getAttribute('title')));
  }));

  console.log('\nNo phase');
  await page.locator('.nav-link', { hasText: 'Roadmap' }).click();
  await page.waitForTimeout(600);
  check('the roadmap has no phase filter',
    await page.locator('.filter-row select').filter({ has: page.locator('option', { hasText: 'Phase: All' }) }).count() === 0);
  await page.locator('.row-title', { hasText: 'Salesforce Accreditation Model' }).first().click();
  await page.waitForTimeout(400);
  check('the panel has no phase field',
    await page.locator('.modal .ribbon-label', { hasText: /^Phase$/ }).count() === 0);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(300);

  console.log('\nData');
  await page.locator('.nav-link', { hasText: 'Data' }).click();
  await page.waitForTimeout(700);
  const download = page.waitForEvent('download');
  await page.locator('.button', { hasText: 'Export Tasks CSV' }).click();
  const file = await download;
  check('the task register exports', /tasks_.*\.csv/.test(file.suggestedFilename()), file.suggestedFilename());

  const guideDownload = page.waitForEvent('download');
  await page.locator('.button', { hasText: 'Download the JSON guide' }).click();
  const guideFile = await guideDownload;
  check('the JSON guide downloads', /RoadmapJsonGuide_.*\.md/.test(guideFile.suggestedFilename()), guideFile.suggestedFilename());

  const masterDownload = page.waitForEvent('download');
  await page.locator('.button', { hasText: 'Export master data' }).click();
  const masterFile = await masterDownload;
  check('the master data file downloads', /RoadmapMasterData_.*\.json/.test(masterFile.suggestedFilename()), masterFile.suggestedFilename());

  const itemsBefore = await page.evaluate(() => window.RM.records('roadmapItems').length);
  const programmesBefore = await page.evaluate(() => window.RM.records('programmes').length);
  await page.setInputFiles('.file-picker-primary input[type=file]', {
    name: 'draft.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      programmes: [{ name: 'Drafted outside the tool', owner: 'Sarah', status: 'discovery' }],
      roadmapItems: [{
        programme: 'Drafted outside the tool', title: 'A drafted change',
        systemAreas: ['csi'], types: ['system-change'], stream: 'ebike-app',
        startDate: '2027-04-01', endDate: '2027-06-30',
        tasks: [{ name: 'A drafted task', days: { po: 2, dev: 6 }, okrIds: ['kr-self-service'] }]
      }]
    }))
  });
  await page.waitForTimeout(600);
  await page.locator('.modal .button-primary', { hasText: 'Add to the roadmap' }).click();
  await page.waitForTimeout(1200);
  check('a drafted JSON file is added to the roadmap',
    await page.evaluate(() => window.RM.records('roadmapItems').length) === itemsBefore + 1);
  check('its programme is created alongside it',
    await page.evaluate(() => window.RM.records('programmes').length) === programmesBefore + 1);
  const drafted = await page.evaluate(() => window.RM.records('roadmapItems').find(i => i.title === 'A drafted change'));
  check('its task arrives with an id and its effort',
    drafted && /^TSK-\d{4}$/.test(drafted.tasks[0].id) && drafted.tasks[0].days.dev === 6);

  console.log('\nconsole errors: ' + JSON.stringify(errors));
  console.log(pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
