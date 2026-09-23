'use strict';

/**
 * Data screen (backup, export, import, restore, history) and Settings screen.
 */
(function (RM) {
  const el = RM.el;

  const CSV_DATASETS = [
    { id: 'programmes', label: 'Programmes' },
    { id: 'roadmapItems', label: 'Roadmap items' },
    { id: 'tasks', label: 'Tasks', exportOnly: true },
    { id: 'dependencies', label: 'Dependencies' },
    { id: 'backlog', label: 'Backlog' }
  ];

  /* ================================================================ */
  /* Data screen                                                      */
  /* ================================================================ */

  function renderData(root) {
    root.appendChild(RM.pageHeader(
      'Data',
      'Backups, exports, imports and the change history. Everything stays inside the application folder.'
    ));

    root.appendChild(healthPanel());

    root.appendChild(el('div', 'panel-grid', [
      panel('Backup', 'A backup is taken automatically before every save. You can also take one now.', [
        RM.button('Create Backup', function () {
          RM.api.createBackup().then(function (result) {
            RM.toast('Backup created (' + result.created.length + ' file(s)).', 'success');
            RM.renderView();
          }).catch(function (err) { RM.handleError(err, 'Backup failed'); });
        }, 'primary')
      ]),

      panel('Export', 'Exports are downloaded and a copy is written to the exports folder.', [
        RM.button('Export Complete JSON Backup', function () { download('/api/export/json'); }, 'primary'),
        el('div', 'button-row', CSV_DATASETS.map(function (dataset) {
          return RM.button('Export ' + dataset.label + ' CSV', function () {
            download('/api/export/csv/' + dataset.id);
          });
        }))
      ]),

      panel('Import', 'Imports are validated in full before anything is written. If a row is wrong, nothing is imported.', [
        importAdditionsControl(),
        el('hr', 'panel-rule'),
        importJsonControl(),
        importCsvControl()
      ]),

      panel('Drafting outside the tool',
        'The JSON guide describes the format, and lists the statuses, systems, streams, people and OKRs this roadmap actually uses. Hand it to a colleague or to a chat assistant to draft programmes, system changes and tasks, then add the result with "Add to the roadmap".', [
          RM.button('Download the JSON guide', function () { download('/api/export/guide'); }, 'primary'),
          el('p', 'muted small', 'It is generated from your current settings, so download it again after changing a list.')
        ]),

      panel('Sample data', 'The sample roadmap shows how the tool is meant to be used. Removing it does not remove the application.', [
        RM.button('Load sample roadmap', function () { applySample('sample'); }),
        RM.button('Delete all roadmap data', function () { applySample('empty'); }, 'danger-quiet')
      ])
    ]));

    root.appendChild(restorePanel());
    root.appendChild(historyPanel());
  }

  function panel(title, description, children) {
    return el('section', 'panel', [
      el('h2', 'panel-title', title),
      description ? el('p', 'panel-description', description) : null,
      el('div', 'panel-body stack', children)
    ]);
  }

  function healthPanel() {
    const health = RM.state.health;
    if (!health) return el('div');
    if (health.ok) {
      const files = Object.keys(health.files).map(function (name) { return health.files[name]; });
      return el('section', 'panel', [
        el('h2', 'panel-title', 'Data files'),
        el('div', 'table-wrap', el('table', 'table', [
          el('thead', null, el('tr', null, [
            el('th', null, 'File'), el('th', 'numeric', 'Records'), el('th', 'numeric', 'Revision'), el('th', null, 'Last written')
          ])),
          el('tbody', null, files.map(function (file) {
            return el('tr', null, [
              el('td', 'mono', file.file),
              el('td', 'numeric', String(file.records)),
              el('td', 'numeric', String(file.revision === undefined ? '-' : file.revision)),
              el('td', null, RM.dates.formatDateTime(file.updatedAt))
            ]);
          }))
        ]))
      ]);
    }
    return el('div', 'callout callout-error', [
      el('h2', null, 'Data problem detected.'),
      el('div', null, health.problems.map(function (problem) {
        return el('p', null, problem.file + ' is not valid JSON.' +
          (problem.latestBackupAt ? ' Last valid backup: ' + RM.dates.formatDateTime(problem.latestBackupAt) : ' No backup found.'));
      })),
      el('p', null, 'The file has not been overwritten. Restore a backup below to recover.')
    ]);
  }

  function download(path) {
    const link = el('a', { href: path, download: '' });
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () { link.remove(); }, 0);
    RM.toast('Export written to the exports folder and downloaded.', 'success');
  }

  /**
   * Adds programmes, system changes and tasks from a file without replacing
   * anything. This is the counterpart to the JSON guide.
   */
  function importAdditionsControl() {
    const input = el('input', { type: 'file', accept: '.json,application/json', class: 'file-input' });
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      readFile(file).then(function (text) {
        let bundle;
        try {
          bundle = JSON.parse(text);
        } catch (err) {
          RM.toast('That file is not valid JSON.', 'error');
          return;
        }
        const programmes = (bundle.programmes || []).length;
        const items = (bundle.roadmapItems || []).length;
        RM.confirm({
          title: 'Add to the roadmap',
          message: 'Add ' + programmes + ' programme(s) and ' + items + ' system change(s) from "' + file.name + '"?',
          detail: 'Nothing already on the roadmap is changed or replaced. Ids are assigned here, and a programme whose name already exists is reused rather than duplicated.',
          confirmLabel: 'Add to the roadmap'
        }).then(function (ok) {
          if (!ok) return;
          RM.api.post('/api/import/add', { bundle: bundle, editor: RM.editorName() }).then(function (result) {
            RM.toast('Added ' + result.roadmapItems + ' system change(s) and ' + result.tasks + ' task(s).', 'success');
            if (result.warnings && result.warnings.length) showWarnings(result);
            return RM.refresh();
          }).catch(function (err) { RM.handleError(err, 'Could not add to the roadmap'); });
        });
      });
      input.value = '';
    });
    return el('label', 'file-picker file-picker-primary', [el('span', null, 'Add to the roadmap (JSON)'), input]);
  }

  function showWarnings(result) {
    const handle = RM.modal({
      title: 'Added, with some values to check',
      size: 'small',
      body: el('div', 'stack', [
        el('p', 'lede', 'The records were added. These values were not recognised and will show as "not in settings" until somebody corrects them:'),
        el('ul', 'error-list', result.warnings.map(function (message) { return el('li', null, message); }))
      ]),
      footer: [RM.button('Close', function () { handle.close(); }, 'primary')]
    });
  }

  function importJsonControl() {
    const input = el('input', { type: 'file', accept: '.json,application/json', class: 'file-input' });
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      readFile(file).then(function (text) {
        let bundle;
        try {
          bundle = JSON.parse(text);
        } catch (err) {
          RM.toast('That file is not valid JSON.', 'error');
          return;
        }
        RM.confirm({
          title: 'Import complete backup',
          message: 'Import "' + file.name + '"?',
          detail: 'This replaces the programmes, roadmap items, dependencies, backlog and scenarios currently in the application. A backup of the current data is taken first.',
          confirmLabel: 'Import and replace',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          RM.api.importBundle(bundle, true).then(function () {
            RM.toast('Import complete.', 'success');
            return RM.refresh();
          }).catch(function (err) { RM.handleError(err, 'Import failed'); });
        });
      });
      input.value = '';
    });
    return el('label', 'file-picker', [el('span', null, 'Replace everything from a JSON backup'), input]);
  }

  function importCsvControl() {
    const datasetSelect = el('select', 'input select select-compact');
    CSV_DATASETS.filter(function (dataset) { return !dataset.exportOnly; }).forEach(function (dataset) {
      datasetSelect.appendChild(el('option', { value: dataset.id }, dataset.label));
    });
    const modeSelect = el('select', 'input select select-compact');
    modeSelect.appendChild(el('option', { value: 'merge' }, 'Merge (update by Id, add new rows)'));
    modeSelect.appendChild(el('option', { value: 'replace' }, 'Replace the whole dataset'));

    const input = el('input', { type: 'file', accept: '.csv,text/csv', class: 'file-input' });
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const dataset = datasetSelect.value;
      const mode = modeSelect.value;
      readFile(file).then(function (text) {
        RM.confirm({
          title: 'Import CSV',
          message: 'Import "' + file.name + '" into ' + dataset + '?',
          detail: mode === 'replace'
            ? 'Every existing record in this dataset will be replaced by the rows in the file.'
            : 'Rows with an existing Id update that record. Rows without an Id are added.',
          confirmLabel: 'Import'
        }).then(function (ok) {
          if (!ok) return;
          RM.api.importCsv(dataset, text, mode).then(function (result) {
            RM.toast('Imported ' + result.imported + ' row(s): ' + result.created + ' created, ' + result.updated + ' updated.', 'success');
            return RM.refresh();
          }).catch(function (err) { RM.handleError(err, 'CSV import failed'); });
        });
      });
      input.value = '';
    });

    return el('div', 'stack-tight', [
      el('div', 'inline-fields', [
        el('label', 'toolbar-field', [el('span', null, 'Dataset'), datasetSelect]),
        el('label', 'toolbar-field', [el('span', null, 'Mode'), modeSelect])
      ]),
      el('label', 'file-picker', [el('span', null, 'Import CSV file'), input])
    ]);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('The file could not be read.')); };
      reader.readAsText(file);
    });
  }

  function applySample(mode) {
    RM.confirm({
      title: mode === 'empty' ? 'Delete all roadmap data' : 'Load the sample roadmap',
      message: mode === 'empty'
        ? 'Delete every programme, roadmap item, dependency, backlog item and scenario?'
        : 'Replace the current roadmap with the sample data?',
      detail: 'A backup of the current data is taken first, so this can be undone from Restore below.',
      confirmLabel: mode === 'empty' ? 'Delete everything' : 'Load sample data',
      danger: mode === 'empty'
    }).then(function (ok) {
      if (!ok) return;
      RM.api.sample(mode).then(function () {
        RM.toast(mode === 'empty' ? 'All roadmap data removed.' : 'Sample roadmap loaded.', 'success');
        return RM.refresh();
      }).catch(function (err) { RM.handleError(err, 'Could not update the data'); });
    });
  }

  function restorePanel() {
    const body = el('div', 'panel-body', [el('p', 'muted', 'Loading backups...')]);
    const section = el('section', 'panel', [
      el('h2', 'panel-title', 'Restore'),
      el('p', 'panel-description', 'Restoring takes a backup of the current file first, so a restore can itself be undone.'),
      body
    ]);

    RM.api.backups().then(function (payload) {
      RM.clear(body);
      if (!payload.backups.length) {
        body.appendChild(el('p', 'muted', 'No backups yet. One is created automatically before every save.'));
        return;
      }
      body.appendChild(el('div', 'table-wrap table-scroll', el('table', 'table table-hover', [
        el('thead', null, el('tr', null, [
          el('th', null, 'Taken'), el('th', null, 'Dataset'), el('th', null, 'File'), el('th', 'numeric', 'Size'), el('th', null, '')
        ])),
        el('tbody', null, payload.backups.map(function (entry) {
          return el('tr', null, [
            el('td', null, entry.date + ' ' + entry.time),
            el('td', null, entry.datasetFile),
            el('td', 'mono small', entry.file),
            el('td', 'numeric', formatBytes(entry.size)),
            el('td', 'row-actions', RM.button('Restore', function () { restore(entry); }))
          ]);
        }))
      ])));
    }).catch(function (err) {
      RM.clear(body);
      body.appendChild(el('div', 'callout callout-error', err.message || 'Backups could not be listed.'));
    });

    return section;
  }

  function restore(entry) {
    RM.confirm({
      title: 'Restore backup',
      message: 'Restore ' + entry.datasetFile + ' from ' + entry.date + ' ' + entry.time + '?',
      detail: 'The current version of that file is backed up first. Anything saved since the backup was taken will be replaced.',
      confirmLabel: 'Restore this backup',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      RM.api.restoreBackup(entry.file).then(function () {
        RM.toast('Backup restored.', 'success');
        return RM.refresh();
      }).catch(function (err) { RM.handleError(err, 'Restore failed'); });
    });
  }

  function formatBytes(size) {
    if (!size) return '0 KB';
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
    return (Math.round(size / 1024 / 102.4) / 10) + ' MB';
  }

  function historyPanel() {
    const body = el('div', 'panel-body', [el('p', 'muted', 'Loading history...')]);
    const section = el('section', 'panel', [
      el('h2', 'panel-title', 'History'),
      el('p', 'panel-description', 'Newest first. History records who changed what - it is a label, not a security control.'),
      body
    ]);
    RM.api.audit({ limit: 200 }).then(function (payload) {
      RM.clear(body);
      body.appendChild(RM.auditList(payload.records));
    }).catch(function (err) {
      RM.clear(body);
      body.appendChild(el('div', 'callout callout-error', err.message || 'History could not be loaded.'));
    });
    return section;
  }

  /* ================================================================ */
  /* Settings screen                                                  */
  /* ================================================================ */

  const LISTS = [
    {
      name: 'people', label: 'People', colour: false,
      description: 'Everybody who can be picked as an owner. Owner fields store the name, so a name entered before this list existed still shows on its record.'
    },
    { name: 'systems', label: 'Systems', colour: false },
    { name: 'itemTypes', label: 'Types', colour: false },
    { name: 'statuses', label: 'Statuses', colour: true },
    { name: 'priorities', label: 'Priorities', colour: true },
    { name: 'milestoneTypes', label: 'Milestone types', colour: false },
    { name: 'dependencyTypes', label: 'Dependency types', colour: false },
    {
      name: 'resourceTypes', label: 'Resource types (level 1)', colour: false,
      description: 'The disciplines capacity and effort are counted in, such as Product Owner, Development, Integration and Data Engineering.'
    },
    {
      name: 'resourceStreams', label: 'Resource streams (level 2)', colour: false,
      description: 'The streams each discipline is split into, such as B2B, D2C, NetSuite or CSI. Capacity is planned per stream, per discipline, per month.'
    }
  ];

  function renderSettings(root) {
    if (!RM.settingsLock.isUnlocked()) {
      root.appendChild(passwordGate(root));
      return;
    }
    renderSettingsForm(root);
  }

  /**
   * The Settings screen is password protected so the shared lists are not
   * changed by accident. It is a speed bump, not a login: the application
   * still has no user accounts.
   */
  function passwordGate(root) {
    const input = el('input', { class: 'input', type: 'password', placeholder: 'Settings password' });
    const message = el('p', 'field-error');
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); attempt(); }
    });

    const panel = el('section', 'panel panel-narrow', [
      el('h2', 'panel-title', 'Settings are password protected'),
      el('p', 'panel-description',
        'Settings change the lists the whole roadmap uses - statuses, systems, streams, OKRs and more. Enter the settings password to continue.'),
      el('div', 'panel-body stack', [
        el('label', 'field', [el('span', 'field-label', 'Password'), input]),
        message,
        el('div', 'button-row', [RM.button('Unlock settings', attempt, 'primary')])
      ])
    ]);
    window.setTimeout(function () { input.focus(); }, 30);
    return panel;

    function attempt() {
      const value = input.value;
      message.textContent = '';
      RM.settingsLock.unlock(value).then(function (response) {
        if (!response.ok) {
          message.textContent = 'That password is not correct.';
          input.select();
          return;
        }
        RM.clear(root);
        root.appendChild(RM.pageHeader('Settings',
          'Everything the roadmap uses as a list lives here. Nothing needs a code change.'));
        renderSettingsForm(root, true);
      }).catch(function (err) {
        message.textContent = (err && err.message) || 'The password could not be checked.';
      });
    }
  }

  function renderSettingsForm(root, skipHeader) {
    const draft = JSON.parse(JSON.stringify(RM.settings()));

    if (!skipHeader) {
      root.appendChild(RM.pageHeader(
        'Settings',
        'Everything the roadmap uses as a list lives here. Nothing needs a code change.',
        [
          RM.button('Lock settings', function () {
            RM.settingsLock.forget();
            RM.renderView();
          }),
          RM.button('Save settings', save, 'primary')
        ]
      ));
    }

    const general = RM.form([
      { name: 'appName', label: 'Application name' },
      { name: 'organisation', label: 'Organisation' },
      { name: 'port', label: 'Application port', type: 'number', min: 1, max: 65535, hint: 'Takes effect the next time the server starts.' },
      { name: 'host', label: 'Listen on', hint: '0.0.0.0 lets other machines reach this server by name.' },
      { name: 'defaultView', label: 'Default screen', type: 'select', allowEmpty: false, options: [
        { value: 'roadmap', label: 'Roadmap' }, { value: 'dependencies', label: 'Dependencies' },
        { value: 'backlog', label: 'Backlog' }, { value: 'resources', label: 'Resources' },
        { value: 'data', label: 'Data' }, { value: 'settings', label: 'Settings' }
      ] },
      { name: 'defaultRoadmapMode', label: 'Default roadmap view', type: 'select', allowEmpty: false, options: [
        { value: 'detailed', label: 'Detailed' }, { value: 'executive', label: 'Executive' }
      ] },
      { name: 'defaultTimescale', label: 'Default timescale', type: 'select', allowEmpty: false, options: [
        { value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }
      ] },
      { name: 'roadmapStart', label: 'Roadmap visible from', type: 'date', hint: 'Leave empty to fit the timeline to the data.' },
      { name: 'roadmapEnd', label: 'Roadmap visible to', type: 'date', hint: 'Leave empty to fit the timeline to the data.' },
      { name: 'showMilestones', label: 'Show milestones by default', type: 'checkbox' },
      { name: 'showTodayLine', label: 'Show the TODAY line', type: 'checkbox' },
      { name: 'backupsToKeep', label: 'Backups to keep per file', type: 'number', min: 1, max: 500 },
      { name: 'auditEntriesToKeep', label: 'History entries to keep', type: 'number', min: 100, max: 50000 },
      {
        name: 'workingDaysPerMonth', label: 'Working days per month', type: 'number', min: 1, max: 31, step: '0.5',
        hint: 'Used to turn FTE capacity into days on the Resources screen.'
      },
      {
        name: 'settingsPassword', label: 'Settings password', type: 'text',
        hint: 'Needed to open this screen. Leave empty to remove the prompt. This is not a login.'
      }
    ], draft);

    root.appendChild(el('section', 'panel', [
      el('h2', 'panel-title', 'General'),
      el('div', 'panel-body', general.element)
    ]));

    LISTS.forEach(function (definition) {
      root.appendChild(listEditor(definition, draft));
    });

    root.appendChild(okrEditor(draft));
    root.appendChild(quarterEditor(draft));

    root.appendChild(el('div', 'sticky-actions', [
      el('span', 'muted', 'Changes are only stored when you press Save.'),
      RM.button('Reload without saving', function () { RM.refresh(); }),
      RM.button('Save settings', save, 'primary')
    ]));

    function save() {
      const merged = Object.assign({}, draft, general.read());
      RM.api.saveSettings(merged).then(function () {
        RM.toast('Settings saved.', 'success');
        return RM.refresh();
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) general.showErrors(err.detail.errors);
        RM.handleError(err, 'Could not save settings');
      });
    }
  }

  function listEditor(definition, draft) {
    if (!Array.isArray(draft[definition.name])) draft[definition.name] = [];
    const body = el('div', 'panel-body');
    const section = el('section', 'panel', [
      el('h2', 'panel-title', definition.label),
      el('p', 'panel-description', definition.description ||
        'Records keep their stored value if you rename an entry. Deactivate an entry to hide it from new records without changing history.'),
      body
    ]);
    draw();
    return section;

    function draw() {
      RM.clear(body);
      const list = draft[definition.name];
      body.appendChild(el('div', 'option-list', list.map(function (option, index) {
        const nameInput = el('input', { class: 'input input-compact', type: 'text', value: option.name });
        nameInput.addEventListener('change', function () { option.name = nameInput.value.trim() || option.name; });

        const activeBox = el('input', { class: 'checkbox', type: 'checkbox' });
        activeBox.checked = option.active !== false;
        activeBox.addEventListener('change', function () { option.active = activeBox.checked; });

        const colourInput = definition.colour
          ? el('input', { class: 'input input-colour', type: 'color', value: option.colour || '#64748b' })
          : null;
        if (colourInput) {
          colourInput.addEventListener('change', function () { option.colour = colourInput.value; });
        }

        return el('div', 'option-row', [
          el('span', 'mono small option-id', option.id),
          nameInput,
          colourInput,
          el('label', 'toggle', [activeBox, el('span', null, 'Active')]),
          el('span', 'option-actions', [
            el('button', { class: 'icon-button', type: 'button', title: 'Move up', disabled: index === 0, onclick: function () { move(index, -1); } }, '↑'),
            el('button', { class: 'icon-button', type: 'button', title: 'Move down', disabled: index === list.length - 1, onclick: function () { move(index, 1); } }, '↓'),
            el('button', { class: 'icon-button icon-danger', type: 'button', title: 'Remove', onclick: function () { removeOption(index); } }, '×')
          ])
        ]);
      })));

      const newName = el('input', { class: 'input input-compact', type: 'text', placeholder: 'Add a new ' + definition.label.toLowerCase().replace(/s$/, '') });
      newName.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); add(); }
      });
      body.appendChild(el('div', 'option-add', [newName, RM.button('Add', add)]));

      function add() {
        const value = newName.value.trim();
        if (!value) return;
        const id = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (draft[definition.name].some(function (o) { return o.id === id; })) {
          RM.toast('That entry already exists.', 'error');
          return;
        }
        const entry = { id: id, name: value, active: true };
        if (definition.colour) entry.colour = '#64748b';
        draft[definition.name].push(entry);
        draw();
      }

      function move(index, direction) {
        const target = index + direction;
        if (target < 0 || target >= draft[definition.name].length) return;
        const list2 = draft[definition.name];
        const moved = list2.splice(index, 1)[0];
        list2.splice(target, 0, moved);
        draw();
      }

      function removeOption(index) {
        const option = draft[definition.name][index];
        RM.confirm({
          title: 'Remove entry',
          message: 'Remove "' + option.name + '" from ' + definition.label + '?',
          detail: 'Records already using it keep their stored value and will show it as "not in settings". Deactivating is usually safer.',
          confirmLabel: 'Remove',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          draft[definition.name].splice(index, 1);
          draw();
        });
      }
    }
  }

  /** OKRs have two levels: objectives, each with its own key results. */
  function okrEditor(draft) {
    if (!Array.isArray(draft.okrs)) draft.okrs = [];
    const body = el('div', 'panel-body');
    const section = el('section', 'panel', [
      el('h2', 'panel-title', 'OKRs'),
      el('p', 'panel-description', 'Objectives with their key results underneath. Tasks are linked to one or more of either level.'),
      body
    ]);
    draw();
    return section;

    function draw() {
      RM.clear(body);
      draft.okrs.forEach(function (objective, index) {
        if (!Array.isArray(objective.children)) objective.children = [];
        const nameInput = el('input', { class: 'input', type: 'text', value: objective.name });
        nameInput.addEventListener('change', function () { objective.name = nameInput.value.trim() || objective.name; });

        const activeBox = el('input', { class: 'checkbox', type: 'checkbox' });
        activeBox.checked = objective.active !== false;
        activeBox.addEventListener('change', function () { objective.active = activeBox.checked; });

        const children = el('div', 'okr-children', objective.children.map(function (keyResult, childIndex) {
          const childInput = el('input', { class: 'input input-compact', type: 'text', value: keyResult.name });
          childInput.addEventListener('change', function () { keyResult.name = childInput.value.trim() || keyResult.name; });

          const childActive = el('input', { class: 'checkbox', type: 'checkbox' });
          childActive.checked = keyResult.active !== false;
          childActive.addEventListener('change', function () { keyResult.active = childActive.checked; });

          return el('div', 'option-row option-row-child', [
            el('span', 'mono small option-id', keyResult.id),
            childInput,
            el('label', 'toggle', [childActive, el('span', null, 'Active')]),
            el('span', 'option-actions', [
              el('button', { class: 'icon-button', type: 'button', title: 'Move up', disabled: childIndex === 0, onclick: function () { moveChild(objective, childIndex, -1); } }, '\u2191'),
              el('button', { class: 'icon-button', type: 'button', title: 'Move down', disabled: childIndex === objective.children.length - 1, onclick: function () { moveChild(objective, childIndex, 1); } }, '\u2193'),
              el('button', { class: 'icon-button icon-danger', type: 'button', title: 'Remove key result', onclick: function () { removeChild(objective, childIndex, keyResult); } }, '\u00d7')
            ])
          ]);
        }));

        const newChild = el('input', { class: 'input input-compact', type: 'text', placeholder: 'Add a key result' });
        newChild.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') { event.preventDefault(); addChild(objective, newChild); }
        });

        body.appendChild(el('div', 'okr-objective', [
          el('div', 'option-row option-row-parent', [
            el('span', 'mono small option-id', objective.id),
            nameInput,
            el('label', 'toggle', [activeBox, el('span', null, 'Active')]),
            el('span', 'option-actions', [
              el('button', { class: 'icon-button', type: 'button', title: 'Move up', disabled: index === 0, onclick: function () { move(index, -1); } }, '\u2191'),
              el('button', { class: 'icon-button', type: 'button', title: 'Move down', disabled: index === draft.okrs.length - 1, onclick: function () { move(index, 1); } }, '\u2193'),
              el('button', { class: 'icon-button icon-danger', type: 'button', title: 'Remove objective', onclick: function () { removeObjective(index, objective); } }, '\u00d7')
            ])
          ]),
          children,
          el('div', 'option-add option-add-child', [newChild, RM.button('Add key result', function () { addChild(objective, newChild); })])
        ]));
      });

      const newObjective = el('input', { class: 'input', type: 'text', placeholder: 'Add an objective' });
      newObjective.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); addObjective(newObjective); }
      });
      body.appendChild(el('div', 'option-add', [newObjective, RM.button('Add objective', function () { addObjective(newObjective); })]));
    }

    function usedIds() {
      const ids = new Set();
      draft.okrs.forEach(function (objective) {
        ids.add(objective.id);
        (objective.children || []).forEach(function (child) { ids.add(child.id); });
      });
      return ids;
    }

    function makeId(name, prefix) {
      const base = prefix + slugify(name);
      const taken = usedIds();
      let candidate = base;
      let counter = 2;
      while (taken.has(candidate)) { candidate = base + '-' + counter; counter += 1; }
      return candidate;
    }

    function addObjective(input) {
      const name = input.value.trim();
      if (!name) return;
      draft.okrs.push({ id: makeId(name, 'okr-'), name: name, active: true, children: [] });
      input.value = '';
      draw();
    }

    function addChild(objective, input) {
      const name = input.value.trim();
      if (!name) return;
      objective.children.push({ id: makeId(name, 'kr-'), name: name, active: true });
      input.value = '';
      draw();
    }

    function move(index, direction) {
      const target = index + direction;
      if (target < 0 || target >= draft.okrs.length) return;
      const moved = draft.okrs.splice(index, 1)[0];
      draft.okrs.splice(target, 0, moved);
      draw();
    }

    function moveChild(objective, index, direction) {
      const target = index + direction;
      if (target < 0 || target >= objective.children.length) return;
      const moved = objective.children.splice(index, 1)[0];
      objective.children.splice(target, 0, moved);
      draw();
    }

    function removeObjective(index, objective) {
      RM.confirm({
        title: 'Remove objective',
        message: 'Remove "' + objective.name + '" and its ' + (objective.children || []).length + ' key result(s)?',
        detail: 'Tasks already linked to them keep the link, which will then show as an unknown OKR.',
        confirmLabel: 'Remove',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        draft.okrs.splice(index, 1);
        draw();
      });
    }

    function removeChild(objective, index, keyResult) {
      RM.confirm({
        title: 'Remove key result',
        message: 'Remove "' + keyResult.name + '"?',
        confirmLabel: 'Remove',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        objective.children.splice(index, 1);
        draw();
      });
    }
  }

  function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'item';
  }

  function quarterEditor(draft) {
    if (!Array.isArray(draft.quarters)) draft.quarters = [];
    const body = el('div', 'panel-body');
    const section = el('section', 'panel', [
      el('h2', 'panel-title', 'Quarter boundaries'),
      el('p', 'panel-description', 'Quarters do not have to follow the calendar. The roadmap header uses whatever is configured here.'),
      body
    ]);
    draw();
    return section;

    function draw() {
      RM.clear(body);
      body.appendChild(el('div', 'table-wrap', el('table', 'table', [
        el('thead', null, el('tr', null, [
          el('th', null, 'Quarter'), el('th', null, 'Start month'), el('th', null, 'Start day'),
          el('th', null, 'End month'), el('th', null, 'End day'), el('th', null, '')
        ])),
        el('tbody', null, draft.quarters.map(function (quarter, index) {
          return el('tr', null, [
            el('td', null, textInput(quarter, 'name')),
            el('td', null, numberInput(quarter, 'startMonth', 1, 12)),
            el('td', null, numberInput(quarter, 'startDay', 1, 31)),
            el('td', null, numberInput(quarter, 'endMonth', 1, 12)),
            el('td', null, numberInput(quarter, 'endDay', 1, 31)),
            el('td', 'row-actions', el('button', {
              class: 'icon-button icon-danger', type: 'button', title: 'Remove',
              onclick: function () { draft.quarters.splice(index, 1); draw(); }
            }, '×'))
          ]);
        }))
      ])));
      body.appendChild(RM.button('+ Add quarter', function () {
        draft.quarters.push({ id: 'q' + (draft.quarters.length + 1), name: 'Q' + (draft.quarters.length + 1), startMonth: 1, startDay: 1, endMonth: 3, endDay: 31 });
        draw();
      }));
    }

    function textInput(target, key) {
      const input = el('input', { class: 'input input-compact', type: 'text', value: target[key] || '' });
      input.addEventListener('change', function () { target[key] = input.value.trim(); });
      return input;
    }

    function numberInput(target, key, min, max) {
      const input = el('input', { class: 'input input-compact input-number', type: 'number', min: min, max: max, value: String(target[key] || min) });
      input.addEventListener('change', function () { target[key] = Number(input.value); });
      return input;
    }
  }

  RM.registerView('data', renderData);
  RM.registerView('settings', renderSettings);
  RM.dataView = { render: renderData };
  RM.settingsView = { render: renderSettings };
}(window.RM));
