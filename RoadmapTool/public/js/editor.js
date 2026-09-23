'use strict';

/**
 * The record panel: one layout used for reading, editing and creating.
 *
 * A system change (or a programme) always opens in the same panel with the
 * same sections in the same places. Pressing Edit swaps the values for inputs
 * in place - nothing moves, so it stays easy to find what you are changing.
 * Creating a record opens the same panel already in edit mode.
 *
 * Nothing saves on keystroke: Save is always explicit.
 */
(function (RM) {
  const el = RM.el;

  /* ---------------------------------------------------------------- */
  /* Field rendering - the same slot reads or edits                    */
  /* ---------------------------------------------------------------- */

  /**
   * Builds a labelled field. In view mode it renders the value; in edit mode
   * it renders the matching input in exactly the same place.
   */
  function field(state, spec) {
    const value = RM.get(state.draft, spec.name);
    const slot = el('dd', null);
    const wrapper = el('div', 'definition' + (spec.full ? ' definition-full' : ''), [
      el('dt', null, spec.label),
      slot
    ]);

    if (!state.editing || spec.readOnly) {
      slot.appendChild(readValue(spec, value));
      return wrapper;
    }

    const input = buildInput(spec, value);
    state.inputs[spec.name] = { input: input, spec: spec };
    slot.appendChild(input);
    if (spec.hint) slot.appendChild(el('span', 'field-hint', spec.hint));
    slot.appendChild(el('span', 'field-error'));
    return wrapper;
  }

  function readValue(spec, value) {
    switch (spec.type) {
      case 'date':
        return el('span', value ? null : 'muted', RM.dates.formatDate(value) || 'Not set');
      case 'select':
        return value
          ? (spec.badge === 'status' ? RM.statusBadge(value)
            : spec.badge === 'priority' ? (RM.priorityBadge(value) || el('span', null, value))
              : el('span', null, labelFor(spec, value)))
          : el('span', 'muted', 'Not set');
      case 'multiselect': {
        const ids = Array.isArray(value) ? value : (value ? [value] : []);
        if (!ids.length) return el('span', 'muted', 'Not set');
        return el('span', 'chip-list', ids.map(function (id) {
          return el('span', 'pill', labelFor(spec, id));
        }));
      }
      case 'textarea':
        return RM.textBlock(value, spec.placeholder || 'Not captured yet.');
      case 'number':
        return el('span', value || value === 0 ? null : 'muted', value || value === 0 ? String(value) : 'Not set');
      case 'colour':
        return el('span', 'colour-value', [
          el('span', { class: 'colour-dot', style: { background: value || '#2563eb' } }),
          el('span', null, value || '')
        ]);
      default:
        return el('span', value ? null : 'muted', value || 'Not set');
    }
  }

  /** The human label for a stored id: from Settings, or the field's own list. */
  function labelFor(spec, id) {
    if (spec.optionLabel) return spec.optionLabel(id);
    if (spec.list) return RM.options.name(spec.list, id);
    const options = typeof spec.options === 'function' ? spec.options() : (spec.options || []);
    const match = options.find(function (option) { return option.value === id; });
    return match ? match.label : id;
  }

  function buildInput(spec, value) {
    if (spec.type === 'textarea') {
      const area = el('textarea', { class: 'input textarea', rows: spec.rows || 3, placeholder: spec.placeholder || '' });
      area.value = value === undefined || value === null ? '' : String(value);
      return area;
    }
    if (spec.type === 'select') {
      const select = el('select', 'input select');
      select.appendChild(el('option', { value: '' }, spec.emptyLabel || '- none -'));
      (typeof spec.options === 'function' ? spec.options() : (spec.options || [])).forEach(function (option) {
        select.appendChild(el('option', { value: option.value }, option.label));
      });
      select.value = value === undefined || value === null ? '' : String(value);
      if (value && select.value !== String(value)) {
        select.appendChild(el('option', { value: value }, String(value) + ' (not in settings)'));
        select.value = value;
      }
      return select;
    }
    if (spec.type === 'multiselect') {
      const multi = RM.multiSelect({
        values: Array.isArray(value) ? value : (value ? [value] : []),
        options: spec.options,
        label: function (id) { return labelFor(spec, id); },
        placeholder: spec.placeholder || 'None selected'
      });
      multi.element.multiSelect = multi;
      return multi.element;
    }
    const input = el('input', {
      class: 'input',
      type: spec.type === 'colour' ? 'color' : (spec.type || 'text'),
      placeholder: spec.placeholder || '',
      min: spec.min, max: spec.max, step: spec.step
    });
    input.value = value === undefined || value === null ? '' : String(value);
    return input;
  }

  function readInputs(state) {
    const out = {};
    Object.keys(state.inputs).forEach(function (name) {
      const entry = state.inputs[name];
      let value;
      if (entry.spec.type === 'multiselect') value = entry.input.multiSelect.read();
      else if (entry.spec.type === 'number') value = entry.input.value === '' ? '' : Number(entry.input.value);
      else value = entry.input.value;
      RM.set(out, name, value);
    });
    return out;
  }

  function showErrors(state, errors) {
    Object.keys(state.inputs).forEach(function (name) {
      const holder = holderOf(state.inputs[name].input);
      if (!holder) return;
      holder.classList.remove('field-invalid');
      const slot = holder.querySelector('.field-error');
      if (slot) slot.textContent = '';
    });
    const unmatched = [];
    (errors || []).forEach(function (error) {
      const entry = state.inputs[error.field];
      const holder = entry ? holderOf(entry.input) : null;
      if (!holder) { unmatched.push(error); return; }
      holder.classList.add('field-invalid');
      const slot = holder.querySelector('.field-error');
      if (slot) slot.textContent = error.message;
      if (holder.scrollIntoView) holder.scrollIntoView({ block: 'nearest' });
    });
    return unmatched;
  }

  function holderOf(input) {
    return input.closest('.definition') || input.closest('.ribbon-cell') || input.closest('.hero-field');
  }

  /**
   * The ribbon across the top of a panel: the facts you want at a glance,
   * in one compact strip. In edit mode each cell turns into its control in
   * place, so reading and editing keep the same shape.
   */
  function ribbon(state, cells) {
    return el('div', 'ribbon', cells.filter(Boolean).map(function (cell) {
      if (cell.readOnly || !state.editing) {
        return el('div', 'ribbon-cell' + (cell.wide ? ' ribbon-cell-wide' : ''), [
          el('span', 'ribbon-label', cell.label),
          el('div', 'ribbon-value', cell.render ? cell.render() : readValue(cell, RM.get(state.draft, cell.name)))
        ]);
      }
      const input = buildInput(cell, RM.get(state.draft, cell.name));
      state.inputs[cell.name] = { input: input, spec: cell };
      return el('div', 'ribbon-cell ribbon-cell-edit' + (cell.wide ? ' ribbon-cell-wide' : ''), [
        el('span', 'ribbon-label', cell.label),
        el('div', 'ribbon-value', [input, el('span', 'field-error')])
      ]);
    }));
  }

  function group(title, children) {
    return el('section', 'panel-group', [
      title ? el('h4', 'panel-group-title', title) : null,
      el('dl', 'definition-grid', children)
    ]);
  }

  function section(title, content) {
    return el('section', 'detail-section', [el('h4', null, title), content]);
  }

  /* ---------------------------------------------------------------- */
  /* System change panel                                               */
  /* ---------------------------------------------------------------- */

  const ITEM_TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'tasks', label: 'Tasks', needsRecord: true },
    { id: 'dependencies', label: 'Dependencies' },
    { id: 'risks', label: 'Risks & Decisions', needsRecord: true },
    { id: 'delivery', label: 'Delivery' },
    { id: 'resources', label: 'Resources' },
    { id: 'milestones', label: 'Milestones', needsRecord: true },
    { id: 'history', label: 'History', needsRecord: true }
  ];

  function openDetail(itemId, tabId) {
    const item = RM.itemById(itemId);
    if (!item) return RM.toast('That roadmap item no longer exists.', 'error');
    openItemPanel({ item: item, tab: tabId, editing: false });
  }

  function openItemForm(item, programmeId) {
    if (item) return openItemPanel({ item: item, editing: true });
    openItemPanel({
      item: null,
      editing: true,
      draft: {
        programmeId: programmeId || '',
        status: 'idea',
        priority: 'medium',
        systemAreas: [],
        types: [],
        tasks: [],
        milestones: [],
        risks: [],
        gates: []
      }
    });
  }

  function openItemPanel(config) {
    const isNew = !config.item;
    const state = {
      kind: 'item',
      id: config.item ? config.item.id : '',
      editing: !!config.editing,
      isNew: isNew,
      draft: JSON.parse(JSON.stringify(config.draft || config.item || {})),
      inputs: {},
      tab: config.tab || 'summary'
    };

    const tabBar = el('div', 'tabs');
    const panel = el('div', 'tab-panel');
    const hero = el('div', 'detail-hero');
    const body = el('div', 'detail', [hero, tabBar, panel]);
    const footer = el('div', 'panel-footer');

    const handle = RM.modal({
      title: isNew ? 'New system change' : config.item.title,
      subtitle: isNew ? 'The same layout you read - fill it in and save.' : programmeName(state.draft.programmeId),
      size: 'large',
      body: body,
      footer: footer,
      dismissible: false
    });

    draw();

    function draw() {
      const current = state.id ? (RM.itemById(state.id) || state.draft) : state.draft;
      if (!state.editing && state.id) state.draft = JSON.parse(JSON.stringify(current));

      // One registry per draw: the ribbon and the open tab both write into it,
      // and saving reads every control that is on screen.
      state.inputs = {};
      drawHero();
      drawTabs();
      drawPanel();
      drawFooter();
    }

    function drawHero() {
      RM.clear(hero);
      const draft = state.draft;
      const effort = RM.effort.ofItem(state.id ? (RM.itemById(state.id) || draft) : draft);
      const taskCount = ((state.id ? (RM.itemById(state.id) || draft) : draft).tasks || []).length;

      RM.append(hero, [
        el('div', 'hero-head', [
          el('div', 'hero-titles', [
            heroField(state, { name: 'title', placeholder: 'What is changing?', title: true,
              fallback: state.isNew ? 'New system change' : '' }),
            heroField(state, { name: 'businessOutcome', placeholder: 'The outcome in business terms', lede: true, rows: 2 })
          ]),
          el('div', 'hero-facts', [
            fact('Effort from tasks', RM.effort.format(RM.effort.total(effort)) + ' d'),
            fact('Tasks', String(taskCount))
          ])
        ]),
        ribbon(state, [
          {
            name: 'programmeId', label: 'Programme', type: 'select', emptyLabel: '- choose -', wide: true,
            options: function () {
              return RM.records('programmes').map(function (p) { return { value: p.id, label: p.name }; });
            }
          },
          { name: 'status', label: 'Status', type: 'select', list: 'statuses', badge: 'status', options: RM.selectOptions('statuses') },
          { name: 'priority', label: 'Priority', type: 'select', list: 'priorities', badge: 'priority', options: RM.selectOptions('priorities') },
          { name: 'currentPhase', label: 'Phase', type: 'select', list: 'milestoneTypes', options: RM.selectOptions('milestoneTypes') },
          { name: 'startDate', label: 'Start', type: 'date' },
          { name: 'endDate', label: 'End', type: 'date' },
          { name: 'targetDate', label: 'Target', type: 'date' },
          {
            name: 'systemAreas', label: 'Systems', type: 'multiselect', list: 'systems', wide: true,
            options: RM.selectOptions('systems'), placeholder: 'Pick the systems'
          },
          {
            name: 'types', label: 'Types', type: 'multiselect', list: 'itemTypes', wide: true,
            options: RM.selectOptions('itemTypes'), placeholder: 'Pick the types'
          },
          { name: 'stream', label: 'Stream', type: 'select', list: 'resourceStreams', options: RM.selectOptions('resourceStreams') },
          { name: 'subArea', label: 'Sub area' },
          { name: 'shortTitle', label: 'Short title', wide: true },
          {
            name: 'productOwners', label: 'Product owners', type: 'multiselect', names: true, wide: true,
            options: RM.productOwnerOptions, placeholder: 'Nobody yet'
          },
          {
            name: 'deliveryOwners', label: 'Delivery owners', type: 'multiselect', names: true, wide: true,
            options: RM.deliveryOwnerOptions, placeholder: 'Nobody yet'
          }
        ])
      ]);
    }

    function drawTabs() {
      RM.clear(tabBar);
      ITEM_TABS.forEach(function (tab) {
        const locked = tab.needsRecord && state.isNew;
        tabBar.appendChild(el('button', {
          class: 'tab' + (tab.id === state.tab ? ' tab-active' : '') + (locked ? ' tab-locked' : ''),
          type: 'button',
          title: locked ? 'Available once the system change has been created' : '',
          disabled: locked,
          onclick: function () { state.tab = tab.id; draw(); }
        }, tab.label));
      });
    }

    function drawPanel() {
      RM.clear(panel);
      panel.appendChild(itemTab(state, draw, handle));
    }

    function drawFooter() {
      RM.clear(footer);
      if (state.editing) {
        RM.append(footer, [
          el('span', 'muted small', state.isNew ? 'Nothing is stored until you press Create.' : 'Nothing is stored until you press Save.'),
          el('span', 'foot-spacer'),
          RM.button('Cancel', cancel),
          RM.button(state.isNew ? 'Create system change' : 'Save changes', save, 'primary')
        ]);
        return;
      }
      RM.append(footer, [
        RM.button('Delete', function () { deleteItem(RM.itemById(state.id), handle); }, 'danger'),
        el('span', 'foot-spacer'),
        RM.button('Close', function () { handle.close(); }),
        RM.button('Edit', function () { state.editing = true; draw(); }, 'primary')
      ]);
    }

    function cancel() {
      if (state.isNew) return handle.close();
      state.editing = false;
      state.draft = JSON.parse(JSON.stringify(RM.itemById(state.id) || state.draft));
      draw();
    }

    function save() {
      const values = readInputs(state);
      const record = Object.assign({}, state.draft, values);
      const request = state.isNew
        ? RM.api.create('roadmapItems', record)
        : RM.api.update('roadmapItems', state.id, record);

      request.then(function (response) {
        RM.toast(state.isNew ? 'System change created.' : 'Changes saved.', 'success');
        state.isNew = false;
        state.editing = false;
        state.id = response.record.id;
        return RM.refresh().then(function () { draw(); });
      }).catch(function (err) {
        state.draft = record;
        if (err && err.code === 'VALIDATION' && err.detail) {
          const unmatched = showErrors(state, err.detail.errors);
          if (unmatched.length === 0) {
            RM.toast('Please correct the highlighted fields.', 'error');
            return;
          }
        }
        RM.handleError(err, 'Could not save the system change');
      });
    }
  }

  function fact(label, value) {
    return el('div', 'hero-fact', [
      el('span', 'hero-fact-value', value),
      el('span', 'hero-fact-label', label)
    ]);
  }

  /** The title and the one-line outcome, edited where they are displayed. */
  function heroField(state, spec) {
    const value = RM.get(state.draft, spec.name);
    if (!state.editing) {
      if (spec.title) return el('h3', 'detail-title', value || spec.fallback || '');
      return value ? el('p', 'detail-lede', value) : null;
    }
    const input = spec.title
      ? el('input', { class: 'input hero-input-title', type: 'text', placeholder: spec.placeholder || '' })
      : el('textarea', { class: 'input hero-input-lede', rows: spec.rows || 2, placeholder: spec.placeholder || '' });
    input.value = value === undefined || value === null ? '' : String(value);
    state.inputs[spec.name] = { input: input, spec: { name: spec.name, type: spec.title ? 'text' : 'textarea' } };
    return el('div', 'hero-field', [input, el('span', 'field-error')]);
  }

  function programmeName(programmeId) {
    const programme = RM.programmeById(programmeId);
    return programme ? programme.name : '';
  }

  function itemTab(state, redraw, handle) {
    switch (state.tab) {
      case 'tasks': return tasksTab(state, redraw);
      case 'dependencies': return dependenciesTab(state, handle);
      case 'risks': return risksTab(state, redraw);
      case 'delivery': return deliveryTab(state);
      case 'resources': return resourcesTab(state);
      case 'milestones': return milestonesTab(state, redraw);
      case 'history': return historyTab(state.id);
      default: return summaryTab(state);
    }
  }

  function summaryTab(state) {
    const draft = state.draft;
    return el('div', 'stack', [
      group('Business information', [
        field(state, { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 3 }),
        field(state, { name: 'problemStatement', label: 'Problem statement', type: 'textarea', full: true, rows: 2 }),
        field(state, { name: 'comments', label: 'Comments', type: 'textarea', full: true, rows: 2 }),
        field(state, { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 })
      ]),
      state.isNew ? null : el('p', 'muted small',
        'Last updated ' + RM.dates.formatDateTime(draft.updatedAt) + (draft.updatedBy ? ' by ' + draft.updatedBy : ''))
    ]);
  }

  function dependenciesTab(state, handle) {
    const item = state.id ? RM.itemById(state.id) : null;
    const deps = item ? RM.dependenciesFor(item.id) : { dependsOn: [], blocks: [] };
    const gates = (item && item.gates) || [];

    return el('div', 'stack', [
      item ? el('div', 'section-head', [
        el('h4', null, 'Depends on'),
        RM.button('+ Add dependency', function () { RM.dependencyView.openForm(null, { toItemId: item.id }); })
      ]) : null,
      item
        ? (deps.dependsOn.length ? dependencyList(deps.dependsOn, 'fromItemId', handle) : el('p', 'muted', 'Nothing blocks this item.'))
        : el('p', 'muted', 'Dependencies can be linked once the system change has been created.'),
      item ? el('h4', null, 'Blocks') : null,
      item ? (deps.blocks.length ? dependencyList(deps.blocks, 'toItemId', handle) : el('p', 'muted', 'This item does not block anything.')) : null,
      item ? el('h4', null, 'Gates') : null,
      item ? (gates.length ? el('div', 'mini-list', gates.map(function (gate) {
        return el('div', 'mini-row', [
          el('span', 'mini-row-title', gate.title),
          el('span', 'mini-row-meta', [
            el('span', 'pill', gate.status || 'open'),
            gate.requiredByDate ? el('span', 'muted', 'Required by ' + RM.dates.formatDate(gate.requiredByDate)) : null
          ])
        ]);
      })) : el('p', 'muted', 'No gates recorded.')) : null,
      group('Dependencies described in words', [
        field(state, { name: 'systemDependencies', label: 'System dependencies', type: 'textarea', full: true, rows: 2 }),
        field(state, { name: 'businessDependencies', label: 'Business dependencies', type: 'textarea', full: true, rows: 2 }),
        field(state, { name: 'dataDependencies', label: 'Data dependencies', type: 'textarea', full: true, rows: 2 })
      ])
    ]);

    function dependencyList(list, otherField, modalHandle) {
      return el('div', 'mini-list', list.map(function (dependency) {
        const otherId = dependency[otherField];
        return el('div', 'mini-row', [
          el('button', { class: 'mini-row-title link-button', type: 'button', onclick: function () {
            if (modalHandle) modalHandle.close();
            openDetail(otherId);
          } }, RM.itemLabel(otherId)),
          el('span', 'mini-row-meta', [
            el('span', 'pill', RM.options.name('dependencyTypes', dependency.dependencyType) || 'Dependency'),
            dependency.blocking ? el('span', 'pill pill-danger', 'Blocking') : null,
            el('span', 'muted', dependency.description || '')
          ]),
          el('button', { class: 'link-button', type: 'button', onclick: function () { RM.dependencyView.openForm(dependency); } }, 'Edit')
        ]);
      }));
    }
  }

  function deliveryTab(state) {
    const resourceTypes = RM.effort.resourceTypes();
    return el('div', 'stack', [
      el('p', 'muted small', 'Two ways of doing the same change, for the conversation about pace against risk. The plan itself is the task list.'),
      el('div', 'compare-grid', [
        estimateCard(state, 'fast', 'Fast MVP', resourceTypes, 'compare-fast'),
        estimateCard(state, 'standard', 'Standard delivery', resourceTypes, 'compare-standard')
      ]),
      group('Approach', [
        field(state, { name: 'recommendedApproach', label: 'Recommended approach', type: 'textarea', full: true, rows: 2 }),
        field(state, { name: 'tradeOffs', label: 'Trade-offs', type: 'textarea', full: true, rows: 2 }),
        field(state, { name: 'pocNotes', label: 'POC information', type: 'textarea', full: true, rows: 2 })
      ])
    ]);
  }

  function estimateCard(state, mode, title, resourceTypes, modifier) {
    const days = RM.effort.ofEstimate(state.draft, mode);
    const total = RM.effort.total(days);
    return el('div', 'compare-card ' + modifier, [
      el('div', 'compare-head', [el('h4', null, title), el('span', 'compare-total', RM.effort.format(total) + ' days')]),
      el('dl', 'definition-grid definition-grid-tight', resourceTypes.map(function (type) {
        return field(state, {
          name: 'estimates.' + mode + '.days.' + type.id,
          label: type.name, type: 'number', min: 0, step: '0.5'
        });
      }).concat([
        field(state, { name: 'estimates.' + mode + '.risk', label: 'Risk', full: true }),
        field(state, { name: 'estimates.' + mode + '.notes', label: 'Notes', type: 'textarea', rows: 2, full: true })
      ]))
    ]);
  }

  function resourcesTab(state) {
    const item = state.id ? RM.itemById(state.id) : state.draft;
    const resourceTypes = RM.effort.resourceTypes();
    const fromTasks = RM.effort.ofItem(item);
    const fast = RM.effort.ofEstimate(item, 'fast');
    const standard = RM.effort.ofEstimate(item, 'standard');
    const tasks = (item && item.tasks) || [];

    const byStream = {};
    tasks.forEach(function (task) {
      const stream = RM.streamOf(item, task) || 'unassigned';
      if (!byStream[stream]) byStream[stream] = {};
      const days = RM.effort.ofTask(task);
      resourceTypes.forEach(function (type) {
        byStream[stream][type.id] = (byStream[stream][type.id] || 0) + days[type.id];
      });
    });

    return el('div', 'stack', [
      el('p', 'muted small', 'Effort is entered on the tasks and adds up here, then up again to the programme.'),
      el('table', 'table', [
        el('thead', null, el('tr', null, [
          el('th', null, 'Resource'),
          el('th', 'numeric', 'From tasks (days)'),
          el('th', 'numeric', 'Fast MVP'),
          el('th', 'numeric', 'Standard')
        ])),
        el('tbody', null, resourceTypes.map(function (type) {
          return el('tr', null, [
            el('td', null, type.name),
            el('td', 'numeric strong', RM.effort.format(fromTasks[type.id])),
            el('td', 'numeric muted', RM.effort.format(fast[type.id])),
            el('td', 'numeric muted', RM.effort.format(standard[type.id]))
          ]);
        })),
        el('tfoot', null, el('tr', null, [
          el('th', null, 'Total'),
          el('th', 'numeric', RM.effort.format(RM.effort.total(fromTasks))),
          el('th', 'numeric muted', RM.effort.format(RM.effort.total(fast))),
          el('th', 'numeric muted', RM.effort.format(RM.effort.total(standard)))
        ]))
      ]),
      el('h4', null, 'By stream'),
      Object.keys(byStream).length
        ? el('table', 'table', [
          el('thead', null, el('tr', null, [el('th', null, 'Stream')].concat(
            resourceTypes.map(function (type) { return el('th', 'numeric', type.name); })
          ))),
          el('tbody', null, Object.keys(byStream).map(function (streamId) {
            return el('tr', null, [
              el('td', null, streamId === 'unassigned' ? el('span', 'muted', 'No stream set') : RM.options.name('resourceStreams', streamId))
            ].concat(resourceTypes.map(function (type) {
              return el('td', 'numeric', RM.effort.format(byStream[streamId][type.id] || 0));
            })));
          }))
        ])
        : el('p', 'muted', 'No task effort recorded yet.')
    ]);
  }

  /* ---------------------------------------------------------------- */
  /* Tasks - level 3 of the roadmap                                    */
  /* ---------------------------------------------------------------- */

  function tasksTab(state, redraw) {
    const item = RM.itemById(state.id);
    if (!item) return el('p', 'muted', 'Tasks can be added once the system change has been created.');
    const tasks = item.tasks || [];
    const resourceTypes = RM.effort.resourceTypes();
    const totals = RM.effort.ofItem(item);

    return el('div', 'stack', [
      el('div', 'section-head', [
        el('h4', null, 'Tasks (' + tasks.length + ')'),
        RM.button('+ Add task', function () { editTask(item, null, redraw); }, 'primary')
      ]),
      el('p', 'muted small', 'Tasks hold the effort. Everything here adds up to the system change and then to the programme.'),
      tasks.length
        ? el('div', 'table-wrap', el('table', 'table table-hover table-tasks', [
          el('thead', null, el('tr', null, [
            el('th', null, 'Task'),
            el('th', null, 'Status'),
            el('th', null, 'Owner'),
            el('th', null, 'Stream'),
            el('th', null, 'OKR impacted'),
            el('th', null, 'Links'),
            el('th', null, 'Effort (days)'),
            el('th', 'numeric', 'Total'),
            el('th', null, '')
          ])),
          el('tbody', null, tasks.map(function (task) {
            const days = RM.effort.ofTask(task);
            return el('tr', null, [
              el('td', 'task-cell', [
                el('button', { class: 'link-button link-strong', type: 'button', onclick: function () { editTask(item, task, redraw); } }, task.name),
                task.description ? el('div', { class: 'muted small clamp', title: task.description }, task.description) : null
              ]),
              el('td', null, RM.statusBadge(task.status)),
              el('td', null, task.owner || ''),
              el('td', null, RM.streamOf(item, task)
                ? el('span', 'pill', RM.options.name('resourceStreams', RM.streamOf(item, task)))
                : el('span', 'muted', '-')),
              el('td', null, (task.okrIds || []).length
                ? el('span', 'chip-list', (task.okrIds || []).map(function (id) {
                  return el('span', { class: 'pill pill-okr', title: RM.okrs.label(id) }, RM.okrs.shortLabel(id));
                }))
                : el('span', 'muted', '-')),
              el('td', null, (task.links || []).length
                ? el('span', 'chip-list', (task.links || []).map(function (link) {
                  return el('a', { class: 'link-out', href: link.url, target: '_blank', rel: 'noreferrer noopener', title: link.url }, link.label || link.url);
                }))
                : el('span', 'muted', '-')),
              el('td', null, el('span', 'chip-list', resourceTypes.map(function (type) {
                return days[type.id]
                  ? el('span', { class: 'pill', title: type.name }, shortName(type.name) + ' ' + RM.effort.format(days[type.id]))
                  : null;
              }))),
              el('td', 'numeric strong', RM.effort.format(RM.effort.total(days))),
              el('td', 'row-actions', [
                el('button', { class: 'link-button', type: 'button', onclick: function () { editTask(item, task, redraw); } }, 'Edit'),
                el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { removeChild(item, 'tasks', task, redraw, task.name); } }, 'Delete')
              ])
            ]);
          })),
          el('tfoot', null, el('tr', null, [
            el('th', { colspan: '6' }, 'Total effort'),
            el('th', null, el('span', 'chip-list', resourceTypes.map(function (type) {
              return totals[type.id]
                ? el('span', { class: 'pill', title: type.name }, shortName(type.name) + ' ' + RM.effort.format(totals[type.id]))
                : null;
            }))),
            el('th', 'numeric', RM.effort.format(RM.effort.total(totals))),
            el('th', null, '')
          ]))
        ]))
        : RM.emptyState('No tasks yet',
          'Tasks are the third level of the roadmap: the work under this system change, and where effort is recorded.',
          RM.button('+ Add task', function () { editTask(item, null, redraw); }, 'primary'))
    ]);
  }

  /** "Product Owner" -> "PO", "Development" -> "Dev": initials for tight cells. */
  function shortName(name) {
    const words = String(name).split(/\s+/).filter(Boolean);
    if (words.length > 1) return words.map(function (word) { return word[0].toUpperCase(); }).join('');
    return String(name).slice(0, 3);
  }

  /** The task editor, including its list of external links (Jira and others). */
  function editTask(item, task, onSaved) {
    const existing = task || null;
    const draft = JSON.parse(JSON.stringify(existing || {
      name: '', status: 'ready', owner: '', stream: '', okrIds: [], links: [], days: {}, description: '', notes: ''
    }));
    const resourceTypes = RM.effort.resourceTypes();

    const okrPicker = RM.multiSelect({
      values: draft.okrIds || [],
      options: function () {
        return RM.okrs.flat().map(function (entry) {
          return { value: entry.id, label: entry.level === 2 ? entry.name : entry.name, level: entry.level };
        });
      },
      label: function (id) { return RM.okrs.shortLabel(id); },
      placeholder: 'No OKR linked'
    });

    const linksHost = el('div', 'link-editor');
    drawLinks();

    // The task name sits on its own line like a heading; everything else is a
    // compact strip underneath, so the editor reads like the panels do.
    const form = RM.form([
      { name: 'name', label: 'Task name', required: true, full: true, className: 'field-headline' },
      { name: 'status', label: 'Status', type: 'select', options: RM.selectOptions('statuses') },
      { name: 'owner', label: 'Owner', type: 'select', options: RM.peopleOptions, emptyLabel: '- nobody yet -' },
      {
        name: 'stream', label: 'Resource stream', type: 'select', options: RM.selectOptions('resourceStreams'),
        emptyLabel: item.stream ? 'Same as the change (' + RM.options.name('resourceStreams', item.stream) + ')' : '- not set -'
      }
    ], draft);

    form.element.classList.add('form-grid-trio');

    const effortForm = RM.form(resourceTypes.map(function (type) {
      return { name: 'days.' + type.id, label: type.name, type: 'number', min: 0, step: '0.5' };
    }), draft);
    effortForm.element.classList.add('form-grid-compact');

    const detailForm = RM.form([
      { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 3 },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
    ], draft);

    const body = el('div', 'stack', [
      form.element,
      el('div', 'task-columns', [
        el('section', 'panel-group', [
          el('h4', 'panel-group-title', 'Effort required (days)'),
          effortForm.element
        ]),
        el('section', 'panel-group', [
          el('h4', 'panel-group-title', 'OKR impacted'),
          okrPicker.element,
          el('p', 'field-hint', 'Objectives and their key results are maintained in Settings.')
        ])
      ]),
      el('section', 'panel-group', [
        el('div', 'section-head', [
          el('h4', 'panel-group-title', 'External links'),
          RM.button('+ Add link', function () {
            draft.links = readLinks();
            draft.links.push({ label: '', url: '' });
            drawLinks();
          })
        ]),
        linksHost
      ]),
      detailForm.element
    ]);

    const handle = RM.modal({
      title: existing ? 'Edit task' : 'Add task',
      subtitle: item.title,
      size: 'medium',
      dismissible: false,
      body: body,
      footer: [
        RM.button('Cancel', function () { handle.close(); }),
        RM.button('Save task', save, 'primary')
      ]
    });

    function drawLinks() {
      RM.clear(linksHost);
      const links = draft.links || [];
      if (!links.length) {
        linksHost.appendChild(el('p', 'muted small', 'No links yet. Add as many as you need - a Jira ticket, a document, a design.'));
        return;
      }
      links.forEach(function (link, index) {
        const label = el('input', { class: 'input input-compact', type: 'text', placeholder: 'Label (e.g. Jira BPP-1042)', value: link.label || '' });
        const url = el('input', { class: 'input input-compact', type: 'url', placeholder: 'https://...', value: link.url || '' });
        linksHost.appendChild(el('div', 'link-row', [
          label, url,
          el('button', {
            class: 'icon-button icon-danger', type: 'button', title: 'Remove link',
            onclick: function () {
              draft.links = readLinks();
              draft.links.splice(index, 1);
              drawLinks();
            }
          }, '×')
        ]));
      });
    }

    function readLinks() {
      return Array.prototype.map.call(linksHost.querySelectorAll('.link-row'), function (row) {
        const inputs = row.querySelectorAll('input');
        return { label: inputs[0].value.trim(), url: inputs[1].value.trim() };
      }).filter(function (link) { return link.label || link.url; });
    }

    function save() {
      const values = Object.assign({}, form.read(), effortForm.read(), detailForm.read());
      const links = readLinks();
      const list = (item.tasks || []).slice();
      const record = Object.assign({}, existing || {}, values, {
        okrIds: okrPicker.read(),
        links: links,
        roadmapItemId: item.id
      });

      if (existing) {
        const index = list.findIndex(function (entry) { return entry.id === existing.id; });
        list[index >= 0 ? index : list.length] = record;
      } else {
        record.id = RM.nextChildId('TSK', list);
        list.push(record);
      }

      RM.api.update('roadmapItems', item.id, Object.assign({}, item, { tasks: list })).then(function () {
        handle.close();
        RM.toast('Task saved.', 'success');
        return RM.refresh().then(function () { if (onSaved) onSaved(); });
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) {
          form.showErrors(err.detail.errors);
          detailForm.showErrors(err.detail.errors);
        }
        RM.handleError(err, 'Could not save the task');
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Risks, gates, milestones                                          */
  /* ---------------------------------------------------------------- */

  function risksTab(state, redraw) {
    const item = RM.itemById(state.id);
    if (!item) return el('p', 'muted', 'Risks can be added once the system change has been created.');
    const risks = item.risks || [];
    const gates = item.gates || [];

    return el('div', 'stack', [
      el('div', 'section-head', [el('h4', null, 'Risks'), RM.button('+ Add risk', function () { editRisk(item, null, redraw); })]),
      risks.length ? el('div', 'card-list', risks.map(function (risk) {
        return el('div', 'card' + (risk.status !== 'closed' ? ' card-attention' : ''), [
          el('div', 'card-head', [
            el('strong', null, risk.title),
            el('span', 'card-actions', [
              el('button', { class: 'link-button', type: 'button', onclick: function () { editRisk(item, risk, redraw); } }, 'Edit'),
              el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { removeChild(item, 'risks', risk, redraw, risk.title); } }, 'Delete')
            ])
          ]),
          el('div', 'card-meta', [
            el('span', 'pill', 'Impact: ' + (risk.impact || 'not set')),
            el('span', 'pill', 'Probability: ' + (risk.probability || 'not set')),
            el('span', 'pill', risk.status || 'open'),
            risk.owner ? el('span', 'muted', risk.owner) : null
          ]),
          risk.description ? el('p', null, risk.description) : null,
          risk.mitigation ? el('p', 'card-mitigation', 'Mitigation: ' + risk.mitigation) : null
        ]);
      })) : el('p', 'muted', 'No risks recorded.'),

      el('div', 'section-head', [el('h4', null, 'Decisions & gates'), RM.button('+ Add decision / gate', function () { editGate(item, null, redraw); })]),
      gates.length ? el('div', 'card-list', gates.map(function (gate) {
        return el('div', 'card' + (gate.status !== 'closed' && gate.status !== 'decided' ? ' card-attention' : ''), [
          el('div', 'card-head', [
            el('strong', null, gate.title),
            el('span', 'card-actions', [
              el('button', { class: 'link-button', type: 'button', onclick: function () { editGate(item, gate, redraw); } }, 'Edit'),
              el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { removeChild(item, 'gates', gate, redraw, gate.title); } }, 'Delete')
            ])
          ]),
          el('div', 'card-meta', [
            el('span', 'pill', gate.status || 'open'),
            gate.owner ? el('span', 'muted', gate.owner) : null,
            gate.requiredByDate ? el('span', 'muted', 'Required by ' + RM.dates.formatDate(gate.requiredByDate)) : null
          ]),
          gate.description ? el('p', null, gate.description) : null,
          gate.decision ? el('p', 'card-mitigation', 'Decision: ' + gate.decision + (gate.decisionDate ? ' (' + RM.dates.formatDate(gate.decisionDate) + ')' : '')) : null
        ]);
      })) : el('p', 'muted', 'No decisions or gates recorded.')
    ]);
  }

  function milestonesTab(state, redraw) {
    const item = RM.itemById(state.id);
    if (!item) return el('p', 'muted', 'Milestones can be added once the system change has been created.');
    const milestones = (item.milestones || []).slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
    return el('div', 'stack', [
      el('div', 'section-head', [el('h4', null, 'Milestones'), RM.button('+ Add milestone', function () { editMilestone(item, null, redraw); })]),
      milestones.length ? el('table', 'table', [
        el('thead', null, el('tr', null, [
          el('th', null, 'Milestone'), el('th', null, 'Date'), el('th', null, 'Status'), el('th', null, 'Notes'), el('th', null, '')
        ])),
        el('tbody', null, milestones.map(function (milestone) {
          return el('tr', null, [
            el('td', null, milestone.name),
            el('td', null, RM.dates.formatDate(milestone.date)),
            el('td', null, RM.statusBadge(milestone.status)),
            el('td', null, milestone.notes || ''),
            el('td', 'row-actions', [
              el('button', { class: 'link-button', type: 'button', onclick: function () { editMilestone(item, milestone, redraw); } }, 'Edit'),
              el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { removeChild(item, 'milestones', milestone, redraw, milestone.name); } }, 'Delete')
            ])
          ]);
        }))
      ]) : el('p', 'muted', 'No milestones recorded. Milestones appear as markers on the roadmap.')
    ]);
  }

  function childEditor(config) {
    const item = config.item;
    const existing = config.existing;
    const form = RM.form(config.fields, existing || config.defaults || {});
    const handle = RM.modal({
      title: (existing ? 'Edit ' : 'Add ') + config.noun,
      subtitle: item.title,
      size: 'medium',
      dismissible: false,
      body: form.element,
      footer: [
        RM.button('Cancel', function () { handle.close(); }),
        RM.button('Save', save, 'primary')
      ]
    });

    function save() {
      const values = form.read();
      const list = (item[config.collection] || []).slice();
      if (existing) {
        const index = list.findIndex(function (entry) { return entry.id === existing.id; });
        list[index >= 0 ? index : list.length] = Object.assign({}, existing, values);
      } else {
        list.push(Object.assign({ id: RM.nextChildId(config.prefix, list) }, values));
      }
      const record = Object.assign({}, item);
      record[config.collection] = list;
      RM.api.update('roadmapItems', item.id, record).then(function () {
        handle.close();
        RM.toast(config.noun + ' saved.', 'success');
        return RM.refresh().then(function () { if (config.onSaved) config.onSaved(); });
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) form.showErrors(err.detail.errors);
        RM.handleError(err, 'Could not save the ' + config.noun);
      });
    }
  }

  function removeChild(item, collection, child, refreshPanel, label) {
    RM.confirm({
      title: 'Delete',
      message: 'Delete "' + (label || child.id) + '"?',
      confirmLabel: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      const record = Object.assign({}, item);
      record[collection] = (item[collection] || []).filter(function (entry) { return entry.id !== child.id; });
      RM.api.update('roadmapItems', item.id, record).then(function () {
        RM.toast('Deleted.', 'success');
        return RM.refresh().then(function () { if (refreshPanel) refreshPanel(); });
      }).catch(function (err) { RM.handleError(err, 'Could not delete'); });
    });
  }

  function editMilestone(item, milestone, refreshPanel) {
    childEditor({
      item: item, existing: milestone, collection: 'milestones', prefix: 'MS', noun: 'milestone',
      onSaved: refreshPanel,
      fields: [
        { name: 'name', label: 'Milestone', type: 'select', required: true, options: RM.selectOptions('milestoneTypes'), emptyLabel: '- choose -', hint: 'Milestone types are maintained in Settings.' },
        { name: 'date', label: 'Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: RM.selectOptions('statuses') },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
      ]
    });
  }

  function editRisk(item, risk, refreshPanel) {
    childEditor({
      item: item, existing: risk, collection: 'risks', prefix: 'RISK', noun: 'risk',
      onSaved: refreshPanel,
      defaults: { status: 'open', impact: 'Medium', probability: 'Medium' },
      fields: [
        { name: 'title', label: 'Risk', required: true, full: true },
        { name: 'impact', label: 'Impact', type: 'select', allowEmpty: true, options: [{ value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }] },
        { name: 'probability', label: 'Probability', type: 'select', allowEmpty: true, options: [{ value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }] },
        { name: 'owner', label: 'Owner', type: 'select', options: RM.peopleOptions, emptyLabel: '- nobody yet -' },
        { name: 'status', label: 'Status', type: 'select', allowEmpty: true, options: [{ value: 'open', label: 'Open' }, { value: 'mitigated', label: 'Mitigated' }, { value: 'closed', label: 'Closed' }] },
        { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 2 },
        { name: 'mitigation', label: 'Mitigation', type: 'textarea', full: true, rows: 2 }
      ]
    });
  }

  function editGate(item, gate, refreshPanel) {
    childEditor({
      item: item, existing: gate, collection: 'gates', prefix: 'GAT', noun: 'decision / gate',
      onSaved: refreshPanel,
      defaults: { status: 'open' },
      fields: [
        { name: 'title', label: 'Decision or gate', required: true, full: true },
        { name: 'owner', label: 'Owner', type: 'select', options: RM.peopleOptions, emptyLabel: '- nobody yet -' },
        { name: 'requiredByDate', label: 'Required by', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', allowEmpty: true, options: [{ value: 'open', label: 'Open' }, { value: 'decided', label: 'Decided' }, { value: 'closed', label: 'Closed' }] },
        { name: 'decisionDate', label: 'Decision date', type: 'date' },
        { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 2 },
        { name: 'decision', label: 'Decision', type: 'textarea', full: true, rows: 2 },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
      ]
    });
  }

  function deleteItem(item, handle) {
    if (!item) return;
    const deps = RM.dependenciesFor(item.id);
    const linked = deps.dependsOn.length + deps.blocks.length;
    RM.confirm({
      title: 'Delete system change',
      message: 'Delete "' + item.title + '"?',
      detail: [
        (item.tasks || []).length ? (item.tasks || []).length + ' task(s) underneath it will be deleted as well.' : '',
        linked ? linked + ' dependency record(s) refer to this item and will be removed, so no orphan dependencies are left behind.' : ''
      ].filter(Boolean).join(' ') || null,
      confirmLabel: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      RM.api.remove('roadmapItems', item.id).then(function () {
        if (handle) handle.close();
        RM.toast('System change deleted.', 'success');
        return RM.refresh();
      }).catch(function (err) {
        RM.handleError(err, 'Could not delete the item');
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Programme panel - same read / edit / create layout                */
  /* ---------------------------------------------------------------- */

  function openProgrammeDetail(programmeId) {
    const programme = RM.programmeById(programmeId);
    if (!programme) return RM.toast('That programme no longer exists.', 'error');
    openProgrammePanel({ programme: programme, editing: false });
  }

  function openProgrammeForm(programme) {
    if (programme) return openProgrammePanel({ programme: programme, editing: true });
    openProgrammePanel({ programme: null, editing: true, draft: { colour: '#2563eb', status: 'idea', priority: 'medium' } });
  }

  function openProgrammePanel(config) {
    const isNew = !config.programme;
    const state = {
      kind: 'programme',
      id: config.programme ? config.programme.id : '',
      editing: !!config.editing,
      isNew: isNew,
      draft: JSON.parse(JSON.stringify(config.draft || config.programme || {})),
      inputs: {}
    };

    const body = el('div', 'detail');
    const footer = el('div', 'panel-footer');
    const handle = RM.modal({
      title: isNew ? 'New programme' : config.programme.name,
      subtitle: 'Programme',
      size: 'large',
      body: body,
      footer: footer,
      dismissible: false
    });

    draw();

    function draw() {
      if (!state.editing && state.id) {
        state.draft = JSON.parse(JSON.stringify(RM.programmeById(state.id) || state.draft));
      }
      state.inputs = {};
      RM.clear(body);

      const children = state.id ? RM.itemsForProgramme(state.id) : [];
      const range = state.id ? RM.programmeRange(state.id, children) : { scheduled: false };
      const effort = state.id ? RM.effort.ofProgramme(state.id) : {};
      const resourceTypes = RM.effort.resourceTypes();

      RM.append(body, [
        el('div', 'detail-hero', [
          el('div', 'hero-head', [
            el('div', 'hero-titles', [
              heroField(state, { name: 'name', placeholder: 'Programme name', title: true, fallback: 'New programme' }),
              heroField(state, { name: 'businessOutcome', placeholder: 'The outcome in business terms', lede: true, rows: 2 })
            ]),
            el('div', 'hero-facts', [
              fact('Start', range.scheduled ? RM.dates.formatDate(range.startDate) : '\u2013'),
              fact('End', range.scheduled ? RM.dates.formatDate(range.endDate) : '\u2013'),
              fact('Changes', String(children.length)),
              fact('Effort', RM.effort.format(RM.effort.total(effort)) + ' d')
            ])
          ]),
          ribbon(state, [
            { name: 'status', label: 'Status', type: 'select', list: 'statuses', badge: 'status', options: RM.selectOptions('statuses') },
            { name: 'priority', label: 'Priority', type: 'select', list: 'priorities', badge: 'priority', options: RM.selectOptions('priorities') },
            {
              name: 'productOwners', label: 'Product owners', type: 'multiselect', names: true, wide: true,
              options: RM.productOwnerOptions, placeholder: 'Nobody yet'
            },
            {
              name: 'deliveryOwners', label: 'Delivery owners', type: 'multiselect', names: true, wide: true,
              options: RM.deliveryOwnerOptions, placeholder: 'Nobody yet'
            },
            { name: 'shortName', label: 'Short name', wide: true },
            { name: 'colour', label: 'Colour', type: 'colour' }
          ])
        ]),
        group('Business information', [
          field(state, { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 3 }),
          field(state, { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 })
        ]),
        state.id && resourceTypes.length && RM.effort.total(effort)
          ? section('Effort by resource', el('div', 'chip-list', resourceTypes.map(function (type) {
            return effort[type.id] ? el('span', 'pill', type.name + ': ' + RM.effort.format(effort[type.id]) + ' d') : null;
          })))
          : null,
        state.id ? el('section', 'detail-section', [
          el('div', 'section-head', [
            el('h4', null, 'System changes (' + children.length + ')'),
            RM.button('+ Add System Change', function () { handle.close(); openItemForm(null, state.id); })
          ]),
          children.length
            ? el('div', 'mini-list', children.map(function (item) {
              const itemEffort = RM.effort.total(RM.effort.ofItem(item));
              return el('button', { class: 'mini-row', type: 'button', onclick: function () { handle.close(); openDetail(item.id); } }, [
                el('span', 'mini-row-title', item.title),
                el('span', 'mini-row-meta', [
                  RM.statusBadge(item.status),
                  el('span', 'muted', item.startDate ? RM.dates.formatDate(item.startDate) + ' \u2192 ' + RM.dates.formatDate(item.endDate) : 'Not scheduled'),
                  el('span', 'muted', (item.tasks || []).length + ' task(s)'),
                  itemEffort ? el('span', 'muted', RM.effort.format(itemEffort) + ' d') : null
                ])
              ]);
            }))
            : el('p', 'muted', 'No system changes yet.')
        ]) : null,
        state.isNew ? null : el('p', 'muted small',
          'Last updated ' + RM.dates.formatDateTime(state.draft.updatedAt) + (state.draft.updatedBy ? ' by ' + state.draft.updatedBy : ''))
      ]);

      RM.clear(footer);
      if (state.editing) {
        RM.append(footer, [
          el('span', 'muted small', 'Programme dates are calculated from the system changes underneath.'),
          el('span', 'foot-spacer'),
          RM.button('Cancel', cancel),
          RM.button(state.isNew ? 'Create programme' : 'Save changes', save, 'primary')
        ]);
        return;
      }
      RM.append(footer, [
        RM.button('Delete', function () { deleteProgramme(RM.programmeById(state.id), handle); }, 'danger'),
        el('span', 'foot-spacer'),
        RM.button('View history', function () { openHistory(state.id, state.draft.name); }),
        RM.button('Close', function () { handle.close(); }),
        RM.button('Edit', function () { state.editing = true; draw(); }, 'primary')
      ]);
    }

    function cancel() {
      if (state.isNew) return handle.close();
      state.editing = false;
      draw();
    }

    function save() {
      const record = Object.assign({}, state.draft, readInputs(state));
      const request = state.isNew
        ? RM.api.create('programmes', record)
        : RM.api.update('programmes', state.id, record);
      request.then(function (response) {
        RM.toast(state.isNew ? 'Programme created.' : 'Programme saved.', 'success');
        state.isNew = false;
        state.editing = false;
        state.id = response.record.id;
        return RM.refresh().then(function () { draw(); });
      }).catch(function (err) {
        state.draft = record;
        if (err && err.code === 'VALIDATION' && err.detail) {
          const unmatched = showErrors(state, err.detail.errors);
          if (unmatched.length === 0) {
            RM.toast('Please correct the highlighted fields.', 'error');
            return;
          }
        }
        RM.handleError(err, 'Could not save the programme');
      });
    }
  }

  function deleteProgramme(programme, handle) {
    if (!programme) return;
    const children = RM.itemsForProgramme(programme.id);
    if (children.length === 0) {
      RM.confirm({
        title: 'Delete programme',
        message: 'Delete "' + programme.name + '"?',
        confirmLabel: 'Delete programme',
        danger: true
      }).then(function (ok) { if (ok) doDelete(false); });
      return;
    }

    const affectedDependencies = RM.records('dependencies').filter(function (dependency) {
      return children.some(function (child) { return child.id === dependency.fromItemId || child.id === dependency.toItemId; });
    });
    const taskCount = children.reduce(function (total, child) { return total + (child.tasks || []).length; }, 0);

    RM.confirm({
      title: 'Delete programme and all children?',
      message: 'This programme contains ' + children.length + ' roadmap item' + (children.length === 1 ? '' : 's') +
        (taskCount ? ' and ' + taskCount + ' task(s)' : '') + '.',
      detail: 'Deleting "' + programme.name + '" will also delete every system change underneath it' +
        (affectedDependencies.length ? ' and ' + affectedDependencies.length + ' dependency record(s) that refer to them' : '') +
        '. A backup is taken first, and this cannot be undone from the roadmap screen.',
      confirmLabel: 'Delete programme and all children',
      cancelLabel: 'Cancel',
      danger: true
    }).then(function (ok) { if (ok) doDelete(true); });

    function doDelete(cascade) {
      RM.api.deleteProgramme(programme.id, cascade).then(function (result) {
        if (handle) handle.close();
        RM.toast('Programme deleted' + (result.removedItems ? ' with ' + result.removedItems + ' roadmap item(s)' : '') + '.', 'success');
        return RM.refresh();
      }).catch(function (err) {
        RM.handleError(err, 'Could not delete the programme');
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* History                                                           */
  /* ---------------------------------------------------------------- */

  function historyTab(recordId) {
    const container = el('div', 'stack', [el('p', 'muted', 'Loading history...')]);
    RM.api.audit({ recordId: recordId, limit: 100 }).then(function (payload) {
      RM.clear(container);
      container.appendChild(RM.auditList(payload.records));
    }).catch(function (err) {
      RM.clear(container);
      container.appendChild(el('div', 'callout callout-error', err.message || 'History could not be loaded.'));
    });
    return container;
  }

  function openHistory(recordId, title) {
    const body = el('div', 'stack', [el('p', 'muted', 'Loading history...')]);
    const handle = RM.modal({
      title: 'History',
      subtitle: title,
      size: 'large',
      body: body,
      footer: [RM.button('Close', function () { handle.close(); }, 'primary')]
    });
    RM.api.audit({ recordId: recordId, limit: 200 }).then(function (payload) {
      RM.clear(body);
      body.appendChild(RM.auditList(payload.records));
    }).catch(function (err) {
      RM.clear(body);
      body.appendChild(el('div', 'callout callout-error', err.message || 'History could not be loaded.'));
    });
  }

  RM.auditList = function (entries) {
    if (!entries || entries.length === 0) {
      return el('p', 'muted', 'No history recorded yet.');
    }
    return el('ol', 'audit-list', entries.map(function (entry) {
      return el('li', 'audit-entry', [
        el('div', 'audit-head', [
          el('strong', null, entry.editor || 'Unknown'),
          el('span', 'pill', entry.action),
          el('span', 'muted', entry.recordType + (entry.recordName ? ' · ' + entry.recordName : '')),
          el('span', 'audit-time', RM.dates.formatDateTime(entry.timestamp))
        ]),
        entry.note ? el('div', 'audit-note', entry.note) : null,
        (entry.changes && entry.changes.length)
          ? el('ul', 'audit-changes', entry.changes.slice(0, 12).map(function (change) {
            return el('li', null, 'Changed ' + humanField(change.field) + ' from "' + display(change.from) + '" to "' + display(change.to) + '"');
          }))
          : null
      ]);
    }));

    function display(value) {
      if (value === '' || value === null || value === undefined) return 'empty';
      return String(value);
    }
    function humanField(field) {
      return String(field)
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, function (c) { return c.toUpperCase(); })
        .toLowerCase();
    }
  };

  RM.editor = {
    openProgrammeForm: openProgrammeForm,
    openProgrammeDetail: openProgrammeDetail,
    openItemForm: openItemForm,
    openDetail: openDetail,
    editTask: editTask,
    deleteItem: deleteItem,
    deleteProgramme: deleteProgramme,
    openHistory: openHistory,
    section: section
  };
}(window.RM));
