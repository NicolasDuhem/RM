'use strict';

/**
 * Resources: spreads each item's estimated effort across the months it runs
 * in, and compares the total with the capacity of the selected scenario.
 *
 * This is decision support only - it never moves a date by itself.
 */
(function (RM) {
  const el = RM.el;
  const WORKING_DAYS_PER_MONTH = 21;
  const state = { scenarioId: '', mode: 'standard' };

  function render(root) {
    const scenarios = RM.records('resourceScenarios');
    if (!state.scenarioId) {
      const active = scenarios.find(function (s) { return s.active; }) || scenarios[0];
      state.scenarioId = active ? active.id : '';
    }
    const scenario = scenarios.find(function (s) { return s.id === state.scenarioId; }) || null;
    const resourceTypes = RM.options.active('resourceTypes');

    root.appendChild(RM.pageHeader(
      'Resources',
      'Estimated demand per month against the capacity of a scenario.',
      [RM.button('+ New Scenario', function () { openScenarioForm(null); }, 'primary')]
    ));

    root.appendChild(el('div', 'toolbar', [
      el('label', 'toolbar-field', [
        el('span', null, 'Scenario'),
        (function () {
          const select = el('select', 'input select');
          scenarios.forEach(function (s) { select.appendChild(el('option', { value: s.id }, s.name)); });
          if (!scenarios.length) select.appendChild(el('option', { value: '' }, 'No scenarios yet'));
          select.value = state.scenarioId;
          select.addEventListener('change', function () { state.scenarioId = select.value; RM.renderView(); });
          return select;
        }())
      ]),
      el('div', 'segmented', [
        segment('Fast MVP', state.mode === 'fast'),
        segment('Standard', state.mode === 'standard')
      ]),
      el('div', 'toolbar-spacer'),
      scenario ? RM.button('Edit scenario', function () { openScenarioForm(scenario); }) : null,
      scenario ? RM.button('Delete scenario', function () { removeScenario(scenario); }, 'danger-quiet') : null
    ]));

    if (!scenario) {
      root.appendChild(RM.emptyState('No resource scenarios yet',
        'Create a scenario describing the capacity you have (for example Development 1.5 FTE, Integration 0.5 FTE).',
        RM.button('+ New Scenario', function () { openScenarioForm(null); }, 'primary')));
      return;
    }

    root.appendChild(el('div', 'scenario-card', [
      el('div', null, [
        el('h3', null, scenario.name),
        scenario.description ? el('p', 'muted', scenario.description) : null
      ]),
      el('div', 'scenario-capacity', resourceTypes.map(function (type) {
        return el('div', 'capacity-chip', [
          el('span', 'capacity-value', formatNumber(Number(scenario.resources[type.id]) || 0)),
          el('span', 'capacity-label', type.name + ' FTE')
        ]);
      }))
    ]));

    const demand = buildDemand(resourceTypes);
    if (demand.months.length === 0) {
      root.appendChild(RM.emptyState('Nothing to plan yet',
        'Add start and end dates plus effort estimates to roadmap items to see demand here.'));
      return;
    }

    root.appendChild(renderTable(demand, resourceTypes, scenario));
    root.appendChild(renderChart(demand, resourceTypes, scenario));
    root.appendChild(el('p', 'muted small',
      'Effort is spread evenly across the working days of each item (about ' + WORKING_DAYS_PER_MONTH +
      ' working days per month). Red cells are months where estimated demand is above the configured capacity.'));

    function segment(label, active) {
      return el('button', {
        class: 'segment' + (active ? ' segment-active' : ''), type: 'button',
        onclick: function () { state.mode = label === 'Fast MVP' ? 'fast' : 'standard'; RM.renderView(); }
      }, label);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Demand model                                                      */
  /* ---------------------------------------------------------------- */

  function buildDemand(resourceTypes) {
    const items = RM.records('roadmapItems').filter(RM.matchesFilters);
    const perMonth = {};
    const contributors = {};

    items.forEach(function (item) {
      if (!item.startDate || !item.endDate) return;
      const start = RM.dates.parseIso(item.startDate);
      const end = RM.dates.parseIso(item.endDate);
      if (!start || !end || end < start) return;
      const estimate = (item.estimates || {})[state.mode] || {};
      const days = estimate.days || {};
      const totalDays = RM.dates.daysBetween(start, end) + 1;

      const months = monthsBetween(start, end);
      months.forEach(function (month) {
        const overlapDays = overlap(start, end, month.start, month.end);
        if (overlapDays <= 0) return;
        const share = overlapDays / totalDays;
        if (!perMonth[month.key]) {
          perMonth[month.key] = { key: month.key, label: month.label, start: month.start, demand: {} };
          contributors[month.key] = [];
        }
        resourceTypes.forEach(function (type) {
          const value = (Number(days[type.id]) || 0) * share;
          if (!value) return;
          perMonth[month.key].demand[type.id] = (perMonth[month.key].demand[type.id] || 0) + value;
        });
        contributors[month.key].push(item.title);
      });
    });

    const months = Object.keys(perMonth)
      .map(function (key) { return perMonth[key]; })
      .sort(function (a, b) { return a.start - b.start; });

    return { months: months, contributors: contributors };
  }

  function monthsBetween(start, end) {
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      months.push({
        key: monthStart.getFullYear() + '-' + String(monthStart.getMonth() + 1).padStart(2, '0'),
        label: RM.dates.MONTHS[monthStart.getMonth()] + ' ' + monthStart.getFullYear(),
        start: monthStart,
        end: monthEnd
      });
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

  function capacityFor(scenario, typeId) {
    return (Number(scenario.resources[typeId]) || 0) * WORKING_DAYS_PER_MONTH;
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  function renderTable(demand, resourceTypes, scenario) {
    return el('div', 'table-wrap', el('table', 'table table-matrix', [
      el('thead', null, el('tr', null, [el('th', null, 'Resource')].concat(
        demand.months.map(function (month) { return el('th', 'numeric', month.label); })
      ))),
      el('tbody', null, resourceTypes.map(function (type) {
        const capacity = capacityFor(scenario, type.id);
        return el('tr', null, [
          el('th', 'row-header', [
            el('span', null, type.name),
            el('span', 'muted small', ' cap. ' + formatNumber(capacity) + ' d/m')
          ])
        ].concat(demand.months.map(function (month) {
          const value = month.demand[type.id] || 0;
          const over = capacity > 0 && value > capacity + 0.01;
          return el('td', {
            class: 'numeric' + (over ? ' cell-over' : (value ? ' cell-demand' : '')),
            title: over ? 'Demand exceeds capacity by ' + formatNumber(value - capacity) + ' days' : ''
          }, value ? formatNumber(value) : '–');
        })));
      }))
    ]));
  }

  function renderChart(demand, resourceTypes, scenario) {
    const max = Math.max(1, demand.months.reduce(function (peak, month) {
      return resourceTypes.reduce(function (inner, type) {
        return Math.max(inner, month.demand[type.id] || 0, capacityFor(scenario, type.id));
      }, peak);
    }, 0));

    return el('div', 'chart-wrap', resourceTypes.map(function (type) {
      const capacity = capacityFor(scenario, type.id);
      return el('div', 'chart-block', [
        el('div', 'chart-title', [
          el('strong', null, type.name),
          el('span', 'muted small', 'Capacity ' + formatNumber(capacity) + ' days / month')
        ]),
        el('div', 'chart', demand.months.map(function (month) {
          const value = month.demand[type.id] || 0;
          const over = capacity > 0 && value > capacity + 0.01;
          return el('div', { class: 'chart-col', title: month.label + ': ' + formatNumber(value) + ' days' }, [
            el('div', 'chart-bar-track', [
              el('div', {
                class: 'chart-bar' + (over ? ' chart-bar-over' : ''),
                style: { height: Math.round((value / max) * 100) + '%' }
              }),
              capacity > 0 ? el('div', { class: 'chart-capacity', style: { bottom: Math.round((capacity / max) * 100) + '%' } }) : null
            ]),
            el('span', 'chart-label', month.label.slice(0, 3))
          ]);
        }))
      ]);
    }));
  }

  function formatNumber(value) {
    const rounded = Math.round(value * 10) / 10;
    return String(rounded);
  }

  /* ---------------------------------------------------------------- */
  /* Scenario editing                                                  */
  /* ---------------------------------------------------------------- */

  function openScenarioForm(scenario) {
    const isNew = !scenario;
    const resourceTypes = RM.options.active('resourceTypes');
    const fields = [
      { name: 'name', label: 'Scenario name', required: true, full: true },
      { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 2 },
      { name: 'active', label: 'Use as the default scenario', type: 'checkbox', full: true },
      { type: 'section', label: 'Capacity (FTE)' }
    ].concat(resourceTypes.map(function (type) {
      return { name: 'resources.' + type.id, label: type.name, type: 'number', min: 0, step: '0.25' };
    }));

    const form = RM.form(fields, scenario || { active: false, resources: {} });
    const handle = RM.modal({
      title: isNew ? 'New resource scenario' : 'Edit scenario',
      subtitle: 'Capacity is expressed in FTE and converted to about ' + WORKING_DAYS_PER_MONTH + ' working days per month.',
      size: 'medium',
      body: form.element,
      footer: [
        RM.button('Cancel', function () { handle.close(); }),
        RM.button(isNew ? 'Create scenario' : 'Save changes', save, 'primary')
      ]
    });

    function save() {
      const record = Object.assign({}, scenario || {}, form.read());
      const request = isNew
        ? RM.api.create('resourceScenarios', record)
        : RM.api.update('resourceScenarios', scenario.id, record);
      request.then(function (response) {
        handle.close();
        if (response.record) state.scenarioId = response.record.id;
        RM.toast('Scenario saved.', 'success');
        return RM.refresh();
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) form.showErrors(err.detail.errors);
        RM.handleError(err, 'Could not save the scenario');
      });
    }
  }

  function removeScenario(scenario) {
    RM.confirm({
      title: 'Delete scenario',
      message: 'Delete the scenario "' + scenario.name + '"?',
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
