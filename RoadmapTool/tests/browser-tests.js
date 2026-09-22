/**
 * Optional end-to-end browser tests.
 *
 * These drive the real application in Chromium and are the only tests that
 * need something installed: Playwright. The application itself has no
 * dependencies, so this file is deliberately separate from run-tests.js.
 *
 *   npm install -g playwright && npx playwright install chromium
 *   node app/server.js                (in one window, on the port below)
 *   node tests/browser-tests.js       (in another)
 *
 * WARNING: the run starts by resetting the roadmap to the sample data, so
 * point it at a test copy of the application, never at the live one.
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
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // start every run from the same sample data
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => fetch('/api/sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'sample', editor: 'test' }) }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => { window.RM.setEditorName('Nicolas'); window.RM.closeTopModal(); });
  await page.waitForTimeout(300);

  // --- create programme
  await page.locator('.button', { hasText: '+ New Programme' }).click();
  await page.waitForTimeout(250);
  await page.locator('.modal input').first().fill('UI Test Programme');
  await page.locator('.modal .button-primary').click();
  await page.waitForTimeout(700);
  check('new programme appears on the roadmap',
    await page.locator('.row-title-programme', { hasText: 'UI Test Programme' }).count() === 1);

  // --- add system change into it
  await page.locator('.button', { hasText: '+ Add System Change' }).first().click();
  await page.waitForTimeout(250);
  await page.locator('.modal .field', { hasText: 'Title' }).first().locator('input').fill('UI Test Change');
  await page.locator('.modal .field', { hasText: 'Programme' }).first().locator('select').selectOption({ label: 'UI Test Programme' });
  await page.locator('.modal .field', { hasText: 'Start date' }).locator('input').fill('2026-10-05');
  await page.locator('.modal .field', { hasText: 'End date' }).locator('input').fill('2026-11-20');
  await page.locator('.modal .button-primary').click();
  await page.waitForTimeout(900);
  check('the detail panel opens after creating an item',
    await page.locator('.detail-title', { hasText: 'UI Test Change' }).count() === 1);

  // --- add a milestone through the detail panel
  await page.locator('.tab', { hasText: 'Milestones' }).click();
  await page.waitForTimeout(250);
  await page.locator('.button', { hasText: '+ Add milestone' }).click();
  await page.waitForTimeout(250);
  const msModal = page.locator('.modal').last();
  await msModal.locator('select').first().selectOption({ label: 'MVP' });
  await msModal.locator('input[type=date]').fill('2026-11-10');
  await msModal.locator('.button-primary').click();
  await page.waitForTimeout(800);
  check('the milestone is saved', await page.locator('td', { hasText: '10 Nov 2026' }).count() >= 1);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(300);
  check('the milestone marker is drawn on the roadmap', await page.locator('.milestone').count() > 0);

  // --- validation error surfaces
  await page.locator('.row-title', { hasText: 'UI Test Change' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('.modal .button-primary', { hasText: 'Edit' }).click();
  await page.waitForTimeout(400);
  await page.locator('.modal .field', { hasText: 'End date' }).locator('input').fill('2026-01-01');
  await page.locator('.modal .button-primary', { hasText: 'Save changes' }).click();
  await page.waitForTimeout(600);
  check('a bad date shows an error dialog', await page.locator('.error-list li').count() >= 1,
    await page.locator('.error-list').innerText().catch(() => 'no list'));
  await page.locator('.modal').last().locator('.button-primary').click();
  await page.waitForTimeout(200);
  check('the edit form stays open with the field flagged', await page.locator('.field-invalid').count() >= 1);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(300);

  // --- conflict protection: make the client revision stale, then save
  await page.evaluate(() => { window.RM.state.roadmapItems.revision = 1; });
  await page.locator('.row-title', { hasText: 'UI Test Change' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('.modal .button-primary', { hasText: 'Edit' }).click();
  await page.waitForTimeout(400);
  await page.locator('.modal .field', { hasText: 'Title' }).first().locator('input').fill('Stale edit');
  await page.locator('.modal .button-primary', { hasText: 'Save changes' }).click();
  await page.waitForTimeout(600);
  const conflictText = await page.locator('.modal').last().innerText();
  check('a stale save shows the conflict dialog', /changed since you opened/i.test(conflictText), conflictText.slice(0, 120));
  check('the conflict dialog offers Reload latest', /Reload latest/.test(conflictText));
  await page.locator('.modal').last().locator('.button-primary').click();
  await page.waitForTimeout(800);
  check('reloading restores the saved title',
    await page.locator('.row-title', { hasText: 'UI Test Change' }).count() === 1);
  check('the stale edit was not written', await page.locator('.row-title', { hasText: 'Stale edit' }).count() === 0);

  // --- filters and chips
  await page.locator('.search-input').first().fill('accreditation');
  await page.waitForTimeout(600);
  check('search filters the roadmap', await page.locator('.chip').count() >= 1);
  await page.locator('.chip-clear').click();
  await page.waitForTimeout(500);
  check('Clear All removes the chips', await page.locator('.chip').count() === 0);

  // --- collapse / expand
  await page.locator('.button', { hasText: 'Collapse all' }).click();
  await page.waitForTimeout(400);
  const collapsedRows = await page.locator('.gantt-row-item').count();
  await page.locator('.button', { hasText: 'Expand all' }).click();
  await page.waitForTimeout(400);
  const expandedRows = await page.locator('.gantt-row-item').count();
  check('collapse hides the system changes', collapsedRows === 0);
  check('expand shows them again', expandedRows > 0);

  // --- drag a bar
  const bar = page.locator('.bar-item').first();
  const box = await bar.boundingBox();
  const titleBefore = await page.evaluate(() => window.RM.records('roadmapItems')[0].startDate);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 95, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1100);
  const movedDates = await page.evaluate(() => {
    const i = window.RM.records('roadmapItems').find(r => r.id === 'RM-0001');
    return { start: i.startDate, end: i.endDate };
  });
  check('dragging a bar moves the dates', movedDates.start !== titleBefore, JSON.stringify(movedDates));

  // --- backlog promote
  await page.locator('.nav-link', { hasText: 'Backlog' }).click();
  await page.waitForTimeout(500);
  await page.locator('.link-button', { hasText: 'Move to Roadmap' }).first().click();
  await page.waitForTimeout(400);
  const promo = page.locator('.modal').last();
  await promo.locator('.field', { hasText: 'Start date' }).locator('input').fill('2027-04-01');
  await promo.locator('.field', { hasText: 'End date' }).locator('input').fill('2027-06-30');
  await promo.locator('.button-primary').click();
  await page.waitForTimeout(1000);
  check('promoting opens the new roadmap item', await page.locator('.detail-title').count() === 1);
  await page.locator('.modal .icon-button').first().click();
  await page.waitForTimeout(400);
  await page.locator('.nav-link', { hasText: 'Backlog' }).click();
  await page.waitForTimeout(500);
  await page.locator('select').last().selectOption('promoted');
  await page.waitForTimeout(400);
  check('the promoted backlog item is marked', await page.locator('.pill-success', { hasText: 'On roadmap' }).count() === 1);

  // --- dependency creation
  await page.locator('.nav-link', { hasText: 'Dependencies' }).click();
  await page.waitForTimeout(500);
  const before = await page.locator('.table tbody tr').count();
  await page.locator('.button', { hasText: '+ New Dependency' }).click();
  await page.waitForTimeout(300);
  const depModal = page.locator('.modal').last();
  await depModal.locator('select').nth(0).selectOption({ index: 1 });
  await depModal.locator('select').nth(1).selectOption({ index: 2 });
  await depModal.locator('.button-primary').click();
  await page.waitForTimeout(900);
  check('a dependency can be created from the register',
    await page.locator('.table tbody tr').count() === before + 1);

  // --- settings save
  await page.locator('.nav-link', { hasText: 'Settings' }).click();
  await page.waitForTimeout(600);
  const addInput = page.locator('.option-add .input').first();
  await addInput.fill('Warehouse System');
  await page.locator('.option-add .button').first().click();
  await page.waitForTimeout(250);
  await page.locator('.sticky-actions .button-primary').click();
  await page.waitForTimeout(900);
  const hasSystem = await page.evaluate(() => window.RM.settings().systems.some(s => s.name === 'Warehouse System'));
  check('a new system is saved in settings', hasSystem);

  // --- data screen export
  await page.locator('.nav-link', { hasText: 'Data' }).click();
  await page.waitForTimeout(700);
  const download = page.waitForEvent('download');
  await page.locator('.button', { hasText: 'Export Complete JSON Backup' }).click();
  const file = await download;
  check('the complete JSON export downloads', /RoadmapBackup_.*\.json/.test(file.suggestedFilename()), file.suggestedFilename());

  console.log('\nconsole errors: ' + JSON.stringify(errors));
  console.log(pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
