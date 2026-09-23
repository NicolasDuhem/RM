'use strict';

/**
 * Resources.
 *
 *  - Capacity plan: how much resource exists, per stream, per discipline,
 *    per month. This is the scenario.
 *  - Demand vs capacity: the effort recorded on tasks, spread evenly across
 *    the dates of the system change it belongs to, compared with that plan.
 *
 * It is decision support only: it never moves a date by itself.
 */
(function (RM) {
  const el = RM.el;

  const state = {
    tab: 'capacity',
    scenarioId: '',
    source: 'tasks',
    months: 12,
    from: ''
  };

  function workingDays() {
    const value = Number(RM.settings().workingDaysPerMonth);
    return Number.isFinite(value) && value > 0 ? value : 21;
  }

  /* ---------------------------------------------------------------- */
  /* Month helpers                                                     */
  /* ---------------------------------------------------------------- */

  function monthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function monthLabel(key) {
    const parts = String(key).split('-');
    const index = Number(parts[1]) - 1;
    return (RM.dates.MONTHS[index] || parts[1]) + ' ' + parts[0];
  }

  function shiftMonth(key, steps) {
    const parts = String(key).split('-');
    let year = Number(parts[0]);
    let month = Number(parts[1]) + steps;
    while (month > 12) { month -= 12; year += 1; }
    while (month < 1) { month += 12; year -= 1; }
    return year + '-' + String(month).padStart(2, '0');
  }

  function monthWindow() {
    const start = state.from || monthKey(new Date());
    const out = [];
    for (let i = 0; i < state.months; i += 1) out.push(shiftMonth(start, i));
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Page                                                              */
  /* ---------------------------------------------------------------- */

  function render(root) {
    const scenarios = RM.records('resourceScenarios');
    if (!state.scenarioId || !scenarios.some(function (s) { return s.id === state.scenarioId; })) {
      const active = scenarios.find(function (s) { return s.active; }) || scenarios[0];
      state.scenarioId = active ? active.id : '';
    }
    if (!state.from) state.from = monthKey(new Date());
    const scenario = scenarios.find(function (s) { return s.id === state.scenarioId; }) || null;

    root.appendChild(RM.pageHeader(
      'Resources',
      'Capacity is planned per stream and discipline, month by month. Demand comes from the effort on each task, spread across that task\'s own dates, plus any backlog items this scenario carries.',
      [RM.button('+ New Scenario', function () { openScenarioForm(null); }, 'primary')]
    ));

    root.appendChild(el('div', 'toolbar', [
      el('div', 'segmented', [
        segment('Capacity plan', state.tab === 'capacity', function () { state.tab = 'capacity'; RM.renderView(); }),
        segment('Demand vs capacity', state.tab === 'demand', function () { state.tab = 'demand'; RM.renderView(); })
      ]),
      el('label', 'toolbar-field', [
        el('span', null, 'Scenario'),
        (function () {
          const select = el('select', 'input select');
          scenarios.forEach(function (s) {
            select.appendChild(el('option', { value: s.id }, s.name + (s.active ? ' (default)' : '')));
          });
          if (!scenarios.length) select.appendChild(el('option', { value: '' }, 'No scenarios yet'));
          select.value = state.scenarioId;
          select.addEventListener('change', function () { state.scenarioId = select.value; RM.renderView(); });
          return select;
        }())
      ]),
      el('div', 'toolbar-spacer'),
      monthNavigation(),
      scenario ? RM.button('Rename / describe', function () { openScenarioForm(scenario); }) : null,
      scenario ? RM.button('Duplicate', function () { duplicateScenario(scenario); }) : null,
      scenario ? RM.button('Delete', function () { removeScenario(scenario); }, 'danger-quiet') : null
    ]));

    if (!scenario) {
      root.appendChild(RM.emptyState('No resource scenarios yet',
        'A scenario is a monthly plan of how much resource each stream has, for each discipline.',
        RM.button('+ New Scenario', function () { openScenarioForm(null); }, 'primary')));
      return;
    }

    root.appendChild(el('div', 'scenario-card', [
      el('div', null, [
        el('h3', null, scenario.name),
        scenario.description ? el('p', 'muted', scenario.description) : null
      ]),
      el('div', 'scenario-capacity', summaryChips(scenario))
    ]));

    root.appendChild(state.tab === 'capacity' ? capacityPlan(scenario) : demandView(scenario));

    function segment(label, active, onClick) {
      return el('button', { class: 'segment' + (active ? ' segment-active' : ''), type: 'button', onclick: onClick }, label);
    }
  }

  function monthNavigation() {
    return el('div', 'month-nav', [
      el('button', { class: 'icon-button', type: 'button', title: 'Earlier months', onclick: function () {
        state.from = shiftMonth(state.from, -3);
        RM.renderView();
      } }, '‹'),
      el('span', 'month-nav-label', monthLabel(state.from) + ' → ' + monthLabel(shiftMonth(state.from, state.months - 1))),
      el('button', { class: 'icon-button', type: 'button', title: 'Later months', onclick: function () {
        state.from = shiftMonth(state.from, 3);
        RM.renderView();
      } }, '›'),
      (function () {
        const select = el('select', 'input select select-compact');
        [6, 12, 18, 24].forEach(function (count) {
          select.appendChild(el('option', { value: String(count) }, count + ' months'));
        });
        select.value = String(state.months);
        select.addEventListener('change', function () { state.months = Number(select.value); RM.renderView(); });
        return select;
      }()),
      RM.button('Today', function () { state.from = monthKey(new Date()); RM.renderView(); })
    ]);
  }

  function summaryChips(scenario) {
    const months = monthWindow();
    return RM.effort.resourceTypes().map(function (type) {
      let total = 0;
      streams().forEach(function (stream) {
        months.forEach(function (month) { total += capacityFte(scenario, stream.id, type.id, month); });
      });
      const average = months.length ? total / months.length : 0;
      return el('div', 'capacity-chip', [
        el('span', 'capacity-value', RM.effort.format(average)),
        el('span', 'capacity-label', type.name + ' FTE avg')
      ]);
    });
  }

  function streams() {
    const list = RM.options.active('resourceStreams').slice();
    // Anything already planned against a stream that has since been removed
    // from Settings still needs a row, so it can be seen and moved.
    const known = new Set(list.map(function (s) { return s.id; }));
    RM.records('resourceScenarios').forEach(function (scenario) {
      Object.keys(scenario.allocations || {}).forEach(function (streamId) {
        if (!known.has(streamId)) {
          known.add(streamId);
          list.push({ id: streamId, name: streamId === 'unassigned' ? 'No stream' : streamId + ' (not in settings)' });
        }
      });
    });
    return list;
  }

  function capacityFte(scenario, streamId, typeId, month) {
    const allocations = scenario.allocations || {};
    const stream = allocations[streamId] || {};
    const byType = stream[typeId] || {};
    return Number(byType[month]) || 0;
  }

  function capacityDays(scenario, streamId, typeId, month) {
    return capacityFte(scenario, streamId, typeId, month) * workingDays();
  }

  /* ---------------------------------------------------------------- */
  /* Capacity plan (the editable grid)                                 */
  /* ---------------------------------------------------------------- */

  function capacityPlan(scenario) {
    const months = monthWindow();
    const resourceTypes = RM.effort.resourceTypes();
    const draft = JSON.parse(JSON.stringify(scenario.allocations || {}));
    const wrapper = el('div', 'stack');

    if (!resourceTypes.length || !streams().length) {
      return RM.emptyState('Nothing to plan against',
        'Add resource types and resource streams in Settings first.');
    }

    const table = el('table', 'table table-matrix table-capacity', [
      el('thead', null, el('tr', null, [
        el('th', 'sticky-col', 'Stream / discipline')
      ].concat(months.map(function (month) {
        return el('th', 'numeric', monthLabel(month));
      })).concat([el('th', 'numeric', 'Avg')]))),
      el('tbody', null, rows())
    ]);

    const backlogDraft = (scenario.includedBacklogIds || []).slice();

    RM.append(wrapper, [
      el('p', 'muted small',
        'Capacity is entered in FTE. One FTE is ' + workingDays() + ' working days per month (Settings). ' +
        'Fill a row from the first month with the arrow button.'),
      el('div', 'table-wrap', table),
      backlogPicker(backlogDraft),
      el('div', 'sticky-actions', [
        el('span', 'muted', 'Nothing is stored until you press Save.'),
        RM.button('Reload without saving', function () { RM.renderView(); }),
        RM.button('Save capacity plan', save, 'primary')
      ])
    ]);
    return wrapper;

    function rows() {
      const out = [];
      streams().forEach(function (stream) {
        out.push(el('tr', 'row-group', [
          el('th', { class: 'sticky-col', colspan: String(months.length + 2) }, stream.name)
        ]));
        resourceTypes.forEach(function (type) {
          const cells = [el('th', 'sticky-col row-header', [
            el('span', 'row-header-indent'),
            el('span', null, type.name),
            el('button', {
              class: 'icon-button', type: 'button',
              title: 'Copy the first month across the row',
              onclick: function () { fillRow(stream.id, type.id); }
            }, '⇢')
          ])];
          const average = el('td', 'numeric muted', '');

          months.forEach(function (month) {
            const input = el('input', {
              class: 'input input-compact cell-input',
              type: 'number', min: '0', step: '0.25',
              value: valueOf(stream.id, type.id, month) || ''
            });
            input.dataset.stream = stream.id;
            input.dataset.type = type.id;
            input.dataset.month = month;
            input.addEventListener('change', function () {
              setValue(stream.id, type.id, month, input.value === '' ? 0 : Number(input.value));
              updateAverage();
            });
            cells.push(el('td', 'numeric', input));
          });

          cells.push(average);
          out.push(el('tr', null, cells));

          updateAverage();
          function updateAverage() {
            let total = 0;
            months.forEach(function (month) { total += valueOf(stream.id, type.id, month); });
            const mean = months.length ? total / months.length : 0;
            average.textContent = mean ? RM.effort.format(mean) + ' FTE' : '–';
          }
        });
      });
      return out;
    }

    function valueOf(streamId, typeId, month) {
      return Number(((draft[streamId] || {})[typeId] || {})[month]) || 0;
    }

    function setValue(streamId, typeId, month, value) {
      if (!draft[streamId]) draft[streamId] = {};
      if (!draft[streamId][typeId]) draft[streamId][typeId] = {};
      if (!value) delete draft[streamId][typeId][month];
      else draft[streamId][typeId][month] = value;
    }

    function fillRow(streamId, typeId) {
      const first = valueOf(streamId, typeId, months[0]);
      months.forEach(function (month) { setValue(streamId, typeId, month, first); });
      Array.prototype.forEach.call(table.querySelectorAll('.cell-input'), function (input) {
        if (input.dataset.stream === streamId && input.dataset.type === typeId) {
          input.value = first || '';
        }
      });
      RM.renderView.pendingScroll = true;
      RM.toast('Filled ' + RM.options.name('resourceStreams', streamId) + ' / ' + RM.options.name('resourceTypes', typeId) +
        ' with ' + RM.effort.format(first) + ' FTE. Remember to save.', 'info');
    }

    function save() {
      RM.api.update('resourceScenarios', scenario.id, Object.assign({}, scenario, {
        allocations: draft,
        includedBacklogIds: backlogDraft
      }))
        .then(function () {
          RM.toast('Capacity plan saved.', 'success');
          return RM.refresh();
        })
        .catch(function (err) { RM.handleError(err, 'Could not save the capacity plan'); });
    }
  }

  /**
   * Backlog items are not on the roadmap, but they still need people. Tick the
   * ones this scenario should carry; they are costed from their own expected
   * dates and effort.
   */
  function backlogPicker(selected) {
    const candidates = RM.records('backlog').filter(function (record) { return !record.promoted; });
    const body = el('div', 'panel-body');
    const section = el('section', 'panel', [
      el('h2', 'panel-title', 'Backlog included in this scenario'),
      el('p', 'panel-description',
        'A backlog item can be carried once it has expected dates and effort, which are entered on the Backlog screen.'),
      body
    ]);

    if (!candidates.length) {
      body.appendChild(el('p', 'muted', 'Nothing unscheduled in the backlog.'));
      return section;
    }

    body.appendChild(el('div', 'backlog-picker', candidates.map(function (record) {
      const plannable = RM.backlogView.isPlannable(record);
      const box = el('input', { class: 'checkbox', type: 'checkbox', disabled: !plannable });
      box.checked = selected.indexOf(record.id) >= 0;
      box.addEventListener('change', function () {
        const index = selected.indexOf(record.id);
        if (box.checked && index < 0) selected.push(record.id);
        if (!box.checked && index >= 0) selected.splice(index, 1);
      });

      return el('label', 'backlog-option' + (plannable ? '' : ' backlog-option-disabled'), [
        box,
        el('span', 'backlog-option-main', [
          el('span', 'backlog-option-title', record.change),
          el('span', 'backlog-option-meta', [
            record.stream ? el('span', 'pill', RM.options.name('resourceStreams', record.stream)) : el('span', 'muted', 'No team'),
            el('span', 'muted', record.startDate
              ? RM.dates.formatDate(record.startDate) + ' \u2192 ' + RM.dates.formatDate(record.endDate)
              : 'No dates'),
            el('span', 'muted', RM.backlogView.effortTotal(record)
              ? RM.effort.format(RM.backlogView.effortTotal(record)) + ' d'
              : 'No effort')
          ])
        ]),
        plannable
          ? null
          : el('button', {
            class: 'link-button', type: 'button',
            onclick: function (event) {
              event.preventDefault();
              RM.backlogView.openForm(record);
            }
          }, 'Add dates and effort')
      ]);
    })));
    return section;
  }

  /* ---------------------------------------------------------------- */
  /* Demand                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Effort is spread evenly across the days of the system change the task
   * belongs to, then totalled per stream, discipline and month.
   */
  function buildDemand(months, scenario) {
    const resourceTypes = RM.effort.resourceTypes();
    const demand = {};
    const contributors = {};
    let undated = 0;
    let untasked = 0;
    let inheritedTasks = 0;
    let backlogCount = 0;

    /** Spreads one line of effort evenly across the days it runs for. */
    function add(stream, days, label, start, end) {
      const totalDays = RM.dates.daysBetween(start, end) + 1;
      monthsBetween(start, end).forEach(function (month) {
        if (months.indexOf(month.key) < 0) return;
        const overlapDays = overlap(start, end, month.start, month.end);
        if (overlapDays <= 0) return;
        const share = overlapDays / totalDays;
        resourceTypes.forEach(function (type) {
          const value = (days[type.id] || 0) * share;
          if (!value) return;
          const key = stream + '|' + type.id + '|' + month.key;
          demand[key] = (demand[key] || 0) + value;
          if (!contributors[key]) contributors[key] = [];
          if (contributors[key].indexOf(label) < 0) contributors[key].push(label);
        });
      });
    }

    RM.records('roadmapItems').filter(RM.matchesFilters).forEach(function (item) {
      const itemStart = RM.dates.parseIso(item.startDate);
      const itemEnd = RM.dates.parseIso(item.endDate);
      const itemDated = !!(itemStart && itemEnd && itemEnd >= itemStart);
      const tasks = item.tasks || [];

      if (state.source !== 'tasks') {
        // An estimate belongs to the whole change, so it uses the change's dates.
        if (!itemDated) { undated += 1; return; }
        add(item.stream || 'unassigned', RM.effort.ofEstimate(item, state.source), item.title, itemStart, itemEnd);
        return;
      }

      if (tasks.length === 0) { untasked += 1; return; }

      // Each task is spread across its own dates, so work that is heavy in
      // the first month and light afterwards shows up that way.
      tasks.forEach(function (task) {
        let start = RM.dates.parseIso(task.startDate);
        let end = RM.dates.parseIso(task.endDate);
        let inherited = false;

        if (!start || !end || end < start) {
          if (!itemDated) { undated += 1; return; }
          start = itemStart;
          end = itemEnd;
          inherited = true;
          inheritedTasks += 1;
        }

        add(
          RM.streamOf(item, task) || 'unassigned',
          RM.effort.ofTask(task),
          item.title + ' \u00b7 ' + task.name + (inherited ? ' (no dates of its own)' : ''),
          start,
          end
        );
      });
    });

    // Backlog items this scenario has been told to carry. They are not on the
    // roadmap, so they are costed from their own expected dates and effort.
    const included = (scenario && scenario.includedBacklogIds) || [];
    RM.records('backlog').forEach(function (record) {
      if (included.indexOf(record.id) < 0) return;
      const start = RM.dates.parseIso(record.startDate);
      const end = RM.dates.parseIso(record.endDate);
      if (!start || !end || end < start) return;
      backlogCount += 1;
      add(record.stream || 'unassigned', record.days || {}, 'Backlog: ' + record.change, start, end);
    });

    return {
      demand: demand, contributors: contributors, undated: undated,
      untasked: untasked, inheritedTasks: inheritedTasks, backlogCount: backlogCount
    };
  }

  function monthsBetween(start, end) {
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      months.push({ key: monthKey(monthStart), start: monthStart, end: monthEnd });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  function overlap(aStart, aEnd, bStart, bEnd) {
    const start = aStart > bStart ? aStart : bStart;
    const end = aEnd < bEnd ? aEnd : bEnd;
    const days = RM.dates.daysBetween(start, end) + 1;
    return days > 0 ? days : 0;
  }

  function demandView(scenario) {
    const months = monthWindow();
    const resourceTypes = RM.effort.resourceTypes();
    const model = buildDemand(months, scenario);
    const streamList = streams();

    const sourceSwitch = el('div', 'segmented', [
      sourceSegment('From tasks', 'tasks'),
      sourceSegment('Fast MVP estimate', 'fast'),
      sourceSegment('Standard estimate', 'standard')
    ]);

    return el('div', 'stack', [
      el('div', 'toolbar toolbar-inner', [
        el('span', 'muted small', 'Demand source'),
        sourceSwitch,
        el('div', 'toolbar-spacer'),
        el('span', 'muted small', RM.filtersActive() ? 'Roadmap filters are applied.' : 'All roadmap items included.')
      ]),
      model.untasked && state.source === 'tasks'
        ? el('div', 'callout callout-info', model.untasked + ' system change(s) have no tasks yet, so they add nothing to demand. Switch source to an estimate to include them.')
        : null,
      model.inheritedTasks && state.source === 'tasks'
        ? el('div', 'callout callout-warn', model.inheritedTasks + ' task(s) have no dates of their own, so their effort is spread across the whole of their system change. Give them dates for a truer picture of when the work lands.')
        : null,
      el('p', 'muted small', model.backlogCount
        ? model.backlogCount + ' backlog item(s) are carried by this scenario and counted below. Change the selection on the Capacity plan tab.'
        : 'No backlog items are carried by this scenario. Pick them on the Capacity plan tab.'),
      el('div', 'table-wrap', el('table', 'table table-matrix table-demand', [
        el('thead', null, el('tr', null, [el('th', 'sticky-col', 'Stream / discipline')]
          .concat(months.map(function (month) { return el('th', 'numeric', monthLabel(month)); })))),
        el('tbody', null, demandRows())
      ])),
      el('p', 'muted small',
        'Each cell shows demand in days against the capacity planned for that month. ' +
        'Effort is spread across each task\'s own dates, so a task that is heavy up front shows as heavy up front. ' +
        'Red means demand is above capacity. Nothing here changes a date - it is for the conversation about what moves.'),
      totalsChart()
    ]);

    function sourceSegment(label, id) {
      return el('button', {
        class: 'segment' + (state.source === id ? ' segment-active' : ''), type: 'button',
        onclick: function () { state.source = id; RM.renderView(); }
      }, label);
    }

    function demandRows() {
      const out = [];
      streamList.forEach(function (stream) {
        const hasAny = resourceTypes.some(function (type) {
          return months.some(function (month) {
            return model.demand[stream.id + '|' + type.id + '|' + month] || capacityDays(scenario, stream.id, type.id, month);
          });
        });
        if (!hasAny) return;

        out.push(el('tr', 'row-group', [
          el('th', { class: 'sticky-col', colspan: String(months.length + 1) }, stream.name)
        ]));

        resourceTypes.forEach(function (type) {
          const cells = [el('th', 'sticky-col row-header', [
            el('span', 'row-header-indent'), el('span', null, type.name)
          ])];
          months.forEach(function (month) {
            const key = stream.id + '|' + type.id + '|' + month;
            const value = model.demand[key] || 0;
            const capacity = capacityDays(scenario, stream.id, type.id, month);
            const over = capacity > 0 ? value > capacity + 0.05 : value > 0.05;
            const title = (model.contributors[key] || []).slice(0, 8).join('\n');
            cells.push(el('td', {
              class: 'numeric cell-stack' + (over ? ' cell-over' : (value ? ' cell-demand' : '')),
              title: (over ? (capacity > 0 ? 'Over capacity by ' + RM.effort.format(value - capacity) + ' days' : 'No capacity planned') + '\n' : '') + title
            }, [
              el('span', 'cell-demand-value', value ? RM.effort.format(value) : '–'),
              el('span', 'cell-capacity-value', capacity ? '/ ' + RM.effort.format(capacity) : '/ 0')
            ]));
          });
          out.push(el('tr', null, cells));
        });
      });

      if (!out.length) {
        out.push(el('tr', null, el('td', { colspan: String(months.length + 1), class: 'muted' },
          'No demand or capacity in these months.')));
      }
      return out;
    }

    function totalsChart() {
      const max = Math.max(1, resourceTypes.reduce(function (peak, type) {
        return months.reduce(function (inner, month) {
          const demand = streamList.reduce(function (sum, stream) {
            return sum + (model.demand[stream.id + '|' + type.id + '|' + month] || 0);
          }, 0);
          const capacity = streamList.reduce(function (sum, stream) {
            return sum + capacityDays(scenario, stream.id, type.id, month);
          }, 0);
          return Math.max(inner, demand, capacity);
        }, peak);
      }, 0));

      return el('div', 'chart-wrap', resourceTypes.map(function (type) {
        return el('div', 'chart-block', [
          el('div', 'chart-title', [
            el('strong', null, type.name),
            el('span', 'muted small', 'All streams, days per month')
          ]),
          el('div', 'chart', months.map(function (month) {
            const demand = streamList.reduce(function (sum, stream) {
              return sum + (model.demand[stream.id + '|' + type.id + '|' + month] || 0);
            }, 0);
            const capacity = streamList.reduce(function (sum, stream) {
              return sum + capacityDays(scenario, stream.id, type.id, month);
            }, 0);
            const over = capacity > 0 ? demand > capacity + 0.05 : demand > 0.05;
            return el('div', {
              class: 'chart-col',
              title: monthLabel(month) + ': ' + RM.effort.format(demand) + ' days demand, ' + RM.effort.format(capacity) + ' days capacity'
            }, [
              el('div', 'chart-bar-track', [
                el('div', { class: 'chart-bar' + (over ? ' chart-bar-over' : ''), style: { height: Math.round((demand / max) * 100) + '%' } }),
                capacity > 0 ? el('div', { class: 'chart-capacity', style: { bottom: Math.round((capacity / max) * 100) + '%' } }) : null
              ]),
              el('span', 'chart-label', monthLabel(month).slice(0, 3))
            ]);
          }))
        ]);
      }));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Scenario housekeeping                                             */
  /* ---------------------------------------------------------------- */

  function openScenarioForm(scenario) {
    const isNew = !scenario;
    const form = RM.form([
      { name: 'name', label: 'Scenario name', required: true, full: true },
      { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 2 },
      { name: 'active', label: 'Use as the default scenario', type: 'checkbox', full: true }
    ], scenario || { active: false });

    const handle = RM.modal({
      title: isNew ? 'New resource scenario' : 'Edit scenario',
      subtitle: isNew ? 'The monthly figures are filled in on the Capacity plan grid.' : scenario.name,
      size: 'medium',
      dismissible: false,
      body: form.element,
      footer: [
        RM.button('Cancel', function () { handle.close(); }),
        RM.button(isNew ? 'Create scenario' : 'Save changes', save, 'primary')
      ]
    });

    function save() {
      const record = Object.assign({}, scenario || { allocations: {} }, form.read());
      const request = isNew
        ? RM.api.create('resourceScenarios', record)
        : RM.api.update('resourceScenarios', scenario.id, record);
      request.then(function (response) {
        handle.close();
        if (response.record) state.scenarioId = response.record.id;
        state.tab = 'capacity';
        RM.toast('Scenario saved.', 'success');
        return RM.refresh();
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) form.showErrors(err.detail.errors);
        RM.handleError(err, 'Could not save the scenario');
      });
    }
  }

  function duplicateScenario(scenario) {
    RM.prompt({
      title: 'Duplicate scenario',
      message: 'The whole monthly capacity plan is copied, so you can change one thing and compare.',
      label: 'New scenario name',
      value: scenario.name + ' (copy)',
      confirmLabel: 'Duplicate'
    }).then(function (name) {
      if (!name) return;
      RM.api.create('resourceScenarios', {
        name: name,
        description: scenario.description,
        active: false,
        allocations: JSON.parse(JSON.stringify(scenario.allocations || {}))
      }).then(function (response) {
        state.scenarioId = response.record.id;
        RM.toast('Scenario duplicated.', 'success');
        return RM.refresh();
      }).catch(function (err) { RM.handleError(err, 'Could not duplicate the scenario'); });
    });
  }

  function removeScenario(scenario) {
    RM.confirm({
      title: 'Delete scenario',
      message: 'Delete the scenario "' + scenario.name + '"?',
      detail: 'Its whole monthly capacity plan goes with it.',
      confirmLabel: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      RM.api.remove('resourceScenarios', scenario.id).then(function () {
        state.scenarioId = '';
        RM.toast('Scenario deleted.', 'success');
        return RM.refresh();
      }).catch(function (err) { RM.handleError(err, 'Could not delete the scenario'); });
    });
  }

  RM.registerView('resources', render);
  RM.resourcesView = { render: render };
}(window.RM));
