'use strict';

/**
 * The main roadmap screen: summary, filters and the programme/change Gantt.
 * Two modes share the same rendering - Executive shows programmes only,
 * Detailed shows every system change underneath its programme.
 */
(function (RM) {
  const el = RM.el;

  function render(root) {
    const ui = RM.state.ui;
    const programmes = RM.records('programmes');
    const allItems = RM.records('roadmapItems');
    const visibleItems = allItems.filter(RM.matchesFilters);

    const visibleProgrammeIds = new Set(visibleItems.map(function (i) { return i.programmeId; }));
    const programmeFilter = ui.filters.programme;
    const searchTerm = ui.filters.search;

    const shownProgrammes = programmes.filter(function (programme) {
      if (programmeFilter && programme.id !== programmeFilter) return false;
      if (visibleProgrammeIds.has(programme.id)) return true;
      // Keep a programme visible when it matches the search itself, or when no
      // item-level filter is active (so empty programmes are still manageable).
      if (searchTerm) return programmeMatchesSearch(programme, searchTerm);
      return !itemFiltersActive();
    });

    root.appendChild(RM.pageHeader(
      'Roadmap',
      'One roadmap grouped by programme, with the system changes underneath.',
      [
        RM.button('+ New Programme', function () { RM.editor.openProgrammeForm(null); }, 'primary'),
        RM.button('+ Add System Change', function () { RM.editor.openItemForm(null, ui.filters.programme || null); })
      ]
    ));

    root.appendChild(summaryStrip(allItems));
    root.appendChild(toolbar());
    root.appendChild(filterBar());

    if (programmes.length === 0) {
      root.appendChild(RM.emptyState(
        'No programmes yet',
        'Start by creating a programme - a business outcome or larger initiative - then add the system changes underneath it.',
        RM.button('+ New Programme', function () { RM.editor.openProgrammeForm(null); }, 'primary')
      ));
      return;
    }

    if (shownProgrammes.length === 0) {
      root.appendChild(RM.emptyState('Nothing matches these filters',
        'Clear one or more filters to see the roadmap again.',
        RM.button('Clear all filters', clearFilters)));
      return;
    }

    const timelineItems = ui.roadmapMode === 'executive'
      ? shownProgrammes.map(function (programme) {
        const range = RM.programmeRange(programme.id, itemsFor(programme.id, visibleItems, allItems));
        return { startDate: range.startDate, endDate: range.endDate, milestones: programmeMilestones(programme.id, allItems) };
      })
      : visibleItems;

    const timeline = RM.gantt.buildTimeline(timelineItems.length ? timelineItems : allItems, ui.timescale);
    const rows = [];

    shownProgrammes.forEach(function (programme) {
      const children = itemsFor(programme.id, visibleItems, allItems);
      rows.push(programmeRow(programme, children, timeline));
      const collapsed = ui.roadmapMode === 'executive' || ui.collapsed[programme.id];
      if (!collapsed) {
        if (children.length === 0) {
          rows.push(emptyProgrammeRow(programme, timeline));
        } else {
          children.forEach(function (item) {
            rows.push(itemRow(item, timeline));
            // Level 3: the tasks under this system change.
            if (ui.expandedItems[item.id]) {
              const tasks = item.tasks || [];
              if (tasks.length === 0) {
                rows.push(emptyItemRow(item, timeline));
              } else {
                tasks.forEach(function (task) { rows.push(taskRow(item, task, timeline)); });
              }
            }
          });
        }
      }
    });

    const shell = RM.gantt.renderShell(timeline, rows);
    const marker = RM.gantt.todayMarker(timeline);
    if (marker) shell.querySelector('.gantt-head-time').appendChild(marker);
    root.appendChild(shell);
    root.appendChild(legend());
  }

  function itemFiltersActive() {
    const filters = RM.state.ui.filters;
    return ['system', 'status', 'productOwner', 'deliveryOwner', 'priority', 'type', 'stream', 'okr', 'dateFrom', 'dateTo']
      .some(function (key) { return filters[key]; });
  }

  function itemsFor(programmeId, visibleItems, allItems) {
    const list = (itemFiltersActive() || RM.state.ui.filters.search ? visibleItems : allItems)
      .filter(function (item) { return item.programmeId === programmeId; });
    return list.slice().sort(compareItems);
  }

  function compareItems(a, b) {
    if (a.startDate && b.startDate && a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    if (a.startDate && !b.startDate) return -1;
    if (!a.startDate && b.startDate) return 1;
    return String(a.title).localeCompare(String(b.title));
  }

  function programmeMatchesSearch(programme, term) {
    const needle = term.toLowerCase();
    return [programme.name, programme.shortName, programme.description, programme.businessOutcome, programme.owner, programme.notes]
      .join(' ').toLowerCase().indexOf(needle) >= 0;
  }

  /* ---------------------------------------------------------------- */
  /* Summary                                                           */
  /* ---------------------------------------------------------------- */

  function summaryStrip(items) {
    const programmes = RM.records('programmes');
    const dependencies = RM.records('dependencies');
    const today = RM.dates.todayIso();
    const in30 = RM.dates.toIso(RM.dates.addDays(new Date(), 30));

    const taskCount = items.reduce(function (total, item) { return total + (item.tasks || []).length; }, 0);
    const openDependencies = dependencies.filter(function (d) { return !RM.isClosedStatus(d.status); }).length;
    const openGates = items.reduce(function (total, item) {
      return total + (item.gates || []).filter(function (g) { return g.status !== 'closed' && g.status !== 'decided'; }).length;
    }, 0);
    const endingSoon = items.filter(function (i) { return i.endDate && i.endDate >= today && i.endDate <= in30; }).length;
    const upcoming = nextMilestone(items);

    return el('section', 'summary-strip', [
      stat(programmes.length, 'Programmes'),
      stat(items.length, 'System Changes'),
      stat(taskCount, 'Tasks'),
      stat(openDependencies + openGates, 'Dependencies / Gates Open'),
      stat(endingSoon, 'Ending in next 30 days'),
      // A count per configured status, so renaming one in Settings is enough.
      el('div', 'summary-card summary-card-wide', [
        el('span', 'summary-label', 'By status'),
        el('div', 'summary-statuses', RM.options.active('statuses').map(function (status) {
          const count = items.filter(function (i) { return i.status === status.id; }).length;
          if (!count) return null;
          const colour = status.colour || '#64748b';
          return el('button', {
            class: 'status-count' + (RM.state.ui.filters.status === status.id ? ' status-count-active' : ''),
            type: 'button',
            title: 'Show only ' + status.name,
            style: { background: RM.fade(colour, 0.12), color: colour, borderColor: RM.fade(colour, 0.35) },
            onclick: function () {
              const filters = RM.state.ui.filters;
              filters.status = filters.status === status.id ? '' : status.id;
              RM.savePrefs();
              RM.renderView();
            }
          }, [el('strong', null, String(count)), el('span', null, status.name)]);
        }))
      ]),
      el('div', 'summary-card summary-card-wide', [
        el('span', 'summary-label', 'Next major milestone'),
        upcoming
          ? el('span', 'summary-next', [
            el('strong', null, upcoming.milestone.name || 'Milestone'),
            el('span', 'muted', ' \u00b7 ' + RM.dates.formatDate(upcoming.milestone.date)),
            el('span', 'summary-next-item', upcoming.item.title)
          ])
          : el('span', 'muted', 'No dated milestones ahead')
      ])
    ]);

    function stat(value, label) {
      return el('div', 'summary-card', [
        el('span', 'summary-value', String(value)),
        el('span', 'summary-label', label)
      ]);
    }
  }

  function nextMilestone(items) {
    const today = RM.dates.todayIso();
    let best = null;
    items.forEach(function (item) {
      (item.milestones || []).forEach(function (milestone) {
        if (!milestone.date || milestone.date < today) return;
        if (!best || milestone.date < best.milestone.date) best = { item: item, milestone: milestone };
      });
    });
    return best;
  }

  function programmeMilestones(programmeId, allItems) {
    const milestones = [];
    allItems.filter(function (i) { return i.programmeId === programmeId; }).forEach(function (item) {
      (item.milestones || []).forEach(function (milestone) {
        if (milestone.date) milestones.push(Object.assign({ itemTitle: item.title, itemId: item.id }, milestone));
      });
    });
    return milestones;
  }

  /* ---------------------------------------------------------------- */
  /* Toolbar and filters                                               */
  /* ---------------------------------------------------------------- */

  function toolbar() {
    const ui = RM.state.ui;
    return el('div', 'toolbar', [
      el('div', 'segmented', [
        segment('Executive View', ui.roadmapMode === 'executive', function () { setMode('executive'); }),
        segment('Detailed View', ui.roadmapMode === 'detailed', function () { setMode('detailed'); })
      ]),
      el('div', 'segmented', [
        segment('Month', ui.timescale === 'month', function () { setScale('month'); }),
        segment('Quarter', ui.timescale === 'quarter', function () { setScale('quarter'); }),
        segment('Year', ui.timescale === 'year', function () { setScale('year'); })
      ]),
      el('div', 'toolbar-spacer'),
      toggle('Milestones', 'showMilestones'),
      toggle('Key dates', 'showKeyDates'),
      RM.button('Expand all', function () {
        RM.state.ui.collapsed = {};
        const expanded = {};
        RM.records('roadmapItems').forEach(function (item) {
          if ((item.tasks || []).length) expanded[item.id] = true;
        });
        RM.state.ui.expandedItems = expanded;
        RM.savePrefs();
        RM.renderView();
      }),
      RM.button('Collapse all', function () {
        const collapsed = {};
        RM.records('programmes').forEach(function (p) { collapsed[p.id] = true; });
        RM.state.ui.collapsed = collapsed;
        RM.state.ui.expandedItems = {};
        RM.savePrefs();
        RM.renderView();
      })
    ]);

    function segment(label, active, onClick) {
      return el('button', { class: 'segment' + (active ? ' segment-active' : ''), type: 'button', onclick: onClick }, label);
    }
    function toggle(label, key) {
      const box = el('input', { type: 'checkbox', class: 'checkbox' });
      box.checked = !!ui[key];
      box.addEventListener('change', function () {
        ui[key] = box.checked;
        RM.savePrefs();
        RM.renderView();
      });
      return el('label', 'toggle', [box, el('span', null, label)]);
    }
    function setMode(mode) {
      ui.roadmapMode = mode;
      RM.savePrefs();
      RM.renderView();
    }
    function setScale(scale) {
      ui.timescale = scale;
      RM.savePrefs();
      RM.renderView();
    }
  }

  function filterBar() {
    const filters = RM.state.ui.filters;

    const search = el('input', {
      class: 'input search-input',
      type: 'search',
      placeholder: 'Search programmes, changes, owners, descriptions...',
      value: filters.search
    });
    let timer = null;
    search.addEventListener('input', function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        filters.search = search.value.trim();
        RM.savePrefs();
        RM.renderView();
        const box = document.querySelector('.search-input');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }, 260);
    });

    const bar = el('section', 'filter-bar', [
      el('div', 'filter-row', [
        search,
        select('programme', 'Programme', RM.records('programmes').map(function (p) { return { value: p.id, label: p.name }; })),
        select('system', 'System', optionValues('systems')),
        select('status', 'Status', optionValues('statuses')),
        select('priority', 'Priority', optionValues('priorities')),
        select('type', 'Type', optionValues('itemTypes')),
        select('stream', 'Stream', optionValues('resourceStreams')),
        select('okr', 'OKR', RM.okrs.flat().map(function (entry) {
          return { value: entry.id, label: (entry.level === 2 ? '\u2014 ' : '') + entry.name };
        })),
        select('productOwner', 'Product Owner', RM.productOwnerOptions()),
        select('deliveryOwner', 'Delivery Owner', RM.deliveryOwnerOptions()),
        dateInput('dateFrom', 'From'),
        dateInput('dateTo', 'To')
      ])
    ]);

    const chips = activeChips();
    if (chips.length) {
      bar.appendChild(el('div', 'chip-row', chips.concat([
        el('button', { class: 'chip-clear', type: 'button', onclick: clearFilters }, 'Clear All')
      ])));
    }
    return bar;

    function optionValues(listName) {
      return RM.options.active(listName).map(function (option) { return { value: option.id, label: option.name }; });
    }

    function select(name, label, values) {
      const node = el('select', 'input select select-compact');
      node.appendChild(el('option', { value: '' }, label + ': All'));
      values.forEach(function (value) {
        node.appendChild(el('option', { value: value.value }, value.label));
      });
      node.value = filters[name] || '';
      node.addEventListener('change', function () {
        filters[name] = node.value;
        RM.savePrefs();
        RM.renderView();
      });
      return node;
    }

    function dateInput(name, label) {
      const wrapper = el('label', 'filter-date', [el('span', null, label)]);
      const input = el('input', { class: 'input input-compact', type: 'date', value: filters[name] || '' });
      input.addEventListener('change', function () {
        filters[name] = input.value;
        RM.savePrefs();
        RM.renderView();
      });
      wrapper.appendChild(input);
      return wrapper;
    }
  }

  function activeChips() {
    const filters = RM.state.ui.filters;
    const labels = {
      programme: 'Programme', system: 'System', status: 'Status', priority: 'Priority',
      type: 'Type', productOwner: 'Product Owner', deliveryOwner: 'Delivery Owner',
      stream: 'Stream', okr: 'OKR', dateFrom: 'From', dateTo: 'To', search: 'Search'
    };
    const display = {
      programme: function (v) { const p = RM.programmeById(v); return p ? p.name : v; },
      system: function (v) { return RM.options.name('systems', v); },
      status: function (v) { return RM.options.name('statuses', v); },
      priority: function (v) { return RM.options.name('priorities', v); },
      type: function (v) { return RM.options.name('itemTypes', v); },
      stream: function (v) { return RM.options.name('resourceStreams', v); },
      okr: function (v) { return RM.okrs.shortLabel(v); },
      dateFrom: RM.dates.formatDate,
      dateTo: RM.dates.formatDate
    };

    return Object.keys(labels).filter(function (key) { return filters[key]; }).map(function (key) {
      const text = display[key] ? display[key](filters[key]) : filters[key];
      return el('span', 'chip', [
        el('span', null, labels[key] + ': ' + text),
        el('button', { class: 'chip-remove', type: 'button', 'aria-label': 'Remove filter', onclick: function () {
          filters[key] = '';
          RM.savePrefs();
          RM.renderView();
        } }, '×')
      ]);
    });
  }

  function clearFilters() {
    RM.state.ui.filters = RM.emptyFilters();
    RM.savePrefs();
    RM.renderView();
  }

  /* ---------------------------------------------------------------- */
  /* Rows                                                              */
  /* ---------------------------------------------------------------- */

  function programmeRow(programme, children, timeline) {
    const ui = RM.state.ui;
    const collapsed = ui.roadmapMode === 'executive' || ui.collapsed[programme.id];
    const range = RM.programmeRange(programme.id, children.length ? children : RM.itemsForProgramme(programme.id));
    const colour = programme.colour || '#2563eb';

    const toggle = el('button', {
      class: 'row-toggle',
      type: 'button',
      title: collapsed ? 'Expand programme' : 'Collapse programme',
      disabled: ui.roadmapMode === 'executive',
      onclick: function () {
        if (ui.collapsed[programme.id]) delete ui.collapsed[programme.id];
        else ui.collapsed[programme.id] = true;
        RM.savePrefs();
        RM.renderView();
      }
    }, collapsed ? '▶' : '▼');

    const left = el('div', 'gantt-left row-left row-left-programme', [
      toggle,
      el('span', { class: 'programme-swatch', style: { background: colour } }),
      el('div', 'row-left-text', [
        el('button', { class: 'row-title row-title-programme', type: 'button', onclick: function () { RM.editor.openProgrammeDetail(programme.id); } }, programme.name),
        el('div', 'row-meta', [
          RM.statusBadge(programme.status),
          ownerLabel(programme) ? el('span', { class: 'muted row-meta-owner', title: ownerTitle(programme) }, ownerLabel(programme)) : null,
          el('span', 'muted', children.length + ' change' + (children.length === 1 ? '' : 's')),
          (function () {
            const effort = RM.effort.total(RM.effort.ofProgramme(programme.id));
            return effort ? el('span', 'muted', RM.effort.format(effort) + ' d') : null;
          }()),
          // The full dates are on the bar's tooltip and in the panel; the row
          // itself only needs the short form, and may trail off if space runs out.
          range.scheduled
            ? el('span', {
              class: 'muted row-meta-dates',
              title: RM.dates.formatDate(range.startDate) + ' → ' + RM.dates.formatDate(range.endDate)
            }, shortDate(range.startDate) + ' → ' + shortDate(range.endDate))
            : el('span', 'pill pill-quiet', 'Not scheduled')
        ])
      ])
    ]);

    const geometry = timeline.bar(range.startDate, range.endDate);
    const bars = [];
    if (geometry) {
      const bar = el('div', {
        class: 'bar bar-programme',
        style: { left: geometry.left + 'px', width: geometry.width + 'px', background: colour, borderColor: colour }
      }, el('span', 'bar-label', programme.shortName || programme.name));
      attachTooltip(bar, function () { return programmeTooltip(programme, range, children); });
      bar.addEventListener('click', function () { RM.editor.openProgrammeDetail(programme.id); });
      bars.push(bar);
    } else {
      bars.push(el('div', 'bar-placeholder', 'Not scheduled'));
    }

    if (RM.state.ui.showMilestones && ui.roadmapMode === 'executive') {
      programmeMilestones(programme.id, RM.records('roadmapItems')).forEach(function (milestone) {
        const marker = milestoneMarker(milestone, timeline, milestone.itemId);
        if (marker) bars.push(marker);
      });
    }

    return el('div', 'gantt-row gantt-row-programme', [left, RM.gantt.timeCell(timeline, bars)]);
  }

  /** Compact date for the dense programme row, e.g. 1 Sep 26. */
  function shortDate(iso) {
    const date = RM.dates.parseIso(iso);
    if (!date) return '';
    return date.getDate() + ' ' + RM.dates.MONTHS[date.getMonth()] + ' ' + String(date.getFullYear()).slice(2);
  }

  function emptyProgrammeRow(programme, timeline) {
    return el('div', 'gantt-row gantt-row-empty', [
      el('div', 'gantt-left row-left', [
        el('span', 'row-indent'),
        el('span', 'muted', 'No system changes yet'),
        el('button', { class: 'link-button', type: 'button', onclick: function () { RM.editor.openItemForm(null, programme.id); } }, '+ Add System Change')
      ]),
      RM.gantt.timeCell(timeline, [])
    ]);
  }

  /** The people shown on a row: product owners first, then delivery. */
  function ownerLabel(record) {
    const owners = (record.productOwners || []).concat(record.deliveryOwners || []);
    if (!owners.length) return '';
    return owners.length > 1 ? owners[0] + ' +' + (owners.length - 1) : owners[0];
  }

  function ownerTitle(record) {
    const parts = [];
    if ((record.productOwners || []).length) parts.push('Product: ' + record.productOwners.join(', '));
    if ((record.deliveryOwners || []).length) parts.push('Delivery: ' + record.deliveryOwners.join(', '));
    return parts.join('\n');
  }

  /** Level 3: one task under a system change. */
  function taskRow(item, task, timeline) {
    const days = RM.effort.ofTask(task);
    const total = RM.effort.total(days);
    const stream = RM.streamOf(item, task);

    const left = el('div', 'gantt-left row-left row-left-task', [
      el('span', 'row-indent row-indent-deep'),
      el('div', 'row-left-text', [
        el('button', { class: 'row-title row-title-task', type: 'button', onclick: function () { RM.editor.editTask(item, task, function () { RM.renderView(); }); } }, task.name),
        el('div', 'row-meta', [
          RM.statusBadge(task.status),
          task.owner ? el('span', 'muted', task.owner) : null,
          stream ? el('span', 'pill', RM.options.name('resourceStreams', stream)) : null,
          total ? el('span', 'muted', RM.effort.format(total) + ' d') : null,
          (task.okrIds || []).length
            ? el('span', { class: 'pill pill-okr', title: (task.okrIds || []).map(RM.okrs.label).join('\n') }, 'OKR \u00d7' + task.okrIds.length)
            : null
        ])
      ]),
      el('div', 'row-indicators', (task.links || []).slice(0, 3).map(function (link) {
        return el('a', {
          class: 'indicator indicator-link', href: link.url, target: '_blank', rel: 'noreferrer noopener',
          title: link.label + ' - ' + link.url,
          onclick: function (event) { event.stopPropagation(); }
        }, '\u2197');
      }))
    ]);

    const bars = [];
    const geometry = timeline.bar(item.startDate, item.endDate);
    if (geometry) {
      const bar = el('div', {
        class: 'bar bar-task',
        style: { left: geometry.left + 'px', width: geometry.width + 'px' }
      }, el('span', 'bar-label', task.name));
      attachTooltip(bar, function () { return taskTooltip(item, task, days); });
      bar.addEventListener('click', function () { RM.editor.editTask(item, task, function () { RM.renderView(); }); });
      bars.push(bar);
    } else {
      bars.push(el('div', 'bar-placeholder', 'Runs with its system change'));
    }

    return el('div', 'gantt-row gantt-row-task', [left, RM.gantt.timeCell(timeline, bars)]);
  }

  function emptyItemRow(item, timeline) {
    return el('div', 'gantt-row gantt-row-empty', [
      el('div', 'gantt-left row-left', [
        el('span', 'row-indent row-indent-deep'),
        el('span', 'muted', 'No tasks yet'),
        el('button', { class: 'link-button', type: 'button', onclick: function () { RM.editor.editTask(item, null, function () { RM.renderView(); }); } }, '+ Add task')
      ]),
      RM.gantt.timeCell(timeline, [])
    ]);
  }

  function itemRow(item, timeline) {
    const ui = RM.state.ui;
    const deps = RM.dependenciesFor(item.id);
    const dependencyCount = deps.dependsOn.length + deps.blocks.length;
    const blocked = deps.dependsOn.some(function (d) { return d.blocking && !RM.isClosedStatus(d.status); });
    const openGates = (item.gates || []).filter(function (g) { return g.status !== 'closed' && g.status !== 'decided'; });
    const openRisks = (item.risks || []).filter(function (r) { return r.status !== 'closed'; });
    const tasks = item.tasks || [];
    const expanded = !!ui.expandedItems[item.id];
    const effort = RM.effort.total(RM.effort.ofItem(item));

    const left = el('div', 'gantt-left row-left row-left-item', [
      el('span', 'row-indent'),
      el('button', {
        class: 'row-toggle row-toggle-task',
        type: 'button',
        title: tasks.length ? (expanded ? 'Hide tasks' : 'Show ' + tasks.length + ' task(s)') : 'No tasks yet',
        onclick: function () {
          if (ui.expandedItems[item.id]) delete ui.expandedItems[item.id];
          else ui.expandedItems[item.id] = true;
          RM.savePrefs();
          RM.renderView();
        }
      }, tasks.length ? (expanded ? '\u25bc' : '\u25b6') : '\u00b7'),
      el('div', 'row-left-text', [
        el('button', { class: 'row-title', type: 'button', onclick: function () { RM.editor.openDetail(item.id); } }, item.title),
        el('div', 'row-meta', [
          (item.systemAreas || []).length
            ? el('span', 'pill', RM.options.names('systems', item.systemAreas).join(', '))
            : null,
          RM.statusBadge(item.status),
          ownerLabel(item) ? el('span', { class: 'muted row-meta-owner', title: ownerTitle(item) }, ownerLabel(item)) : null,
          tasks.length ? el('span', 'muted', tasks.length + ' task' + (tasks.length === 1 ? '' : 's')) : null,
          effort ? el('span', 'muted', RM.effort.format(effort) + ' d') : null
        ])
      ]),
      el('div', 'row-indicators', [
        dependencyCount ? indicator('↔', dependencyCount + ' dependency link(s)', function () { RM.editor.openDetail(item.id, 'dependencies'); }, blocked ? 'indicator-blocked' : '') : null,
        openGates.length ? indicator('⛔', openGates.length + ' open decision/gate', function () { RM.editor.openDetail(item.id, 'risks'); }, 'indicator-gate') : null,
        openRisks.length ? indicator('⚠', openRisks.length + ' open risk(s)', function () { RM.editor.openDetail(item.id, 'risks'); }, 'indicator-risk') : null
      ])
    ]);

    const geometry = timeline.bar(item.startDate, item.endDate);
    const bars = [];
    if (geometry) {
      const colour = RM.options.colour('statuses', item.status, '#2563eb');
      const bar = el('div', {
        class: 'bar bar-item' + (blocked ? ' bar-blocked' : ''),
        style: { left: geometry.left + 'px', width: geometry.width + 'px', background: RM.fade(colour, 0.18), borderColor: colour, color: colour },
        dataset: { itemId: item.id }
      }, [
        el('span', { class: 'bar-handle bar-handle-start', title: 'Drag to change the start date' }),
        // A label in a very short bar is unreadable - the tooltip carries it instead.
        el('span', 'bar-label', geometry.width >= 56 ? (item.shortTitle || item.title) : ''),
        dependencyCount ? el('span', 'bar-dep', '↔') : null,
        el('span', { class: 'bar-handle bar-handle-end', title: 'Drag to change the end date' })
      ]);
      attachTooltip(bar, function () { return itemTooltip(item, deps); });
      bar.addEventListener('click', function (event) {
        if (bar.dataset.dragging === 'yes') return;
        if (event.target.classList.contains('bar-handle')) return;
        RM.editor.openDetail(item.id);
      });
      enableDrag(bar, item, timeline);
      bars.push(bar);
    } else {
      bars.push(el('div', 'bar-placeholder', [
        'Not scheduled',
        el('button', { class: 'link-button', type: 'button', onclick: function () { RM.editor.openItemForm(item); } }, 'Set dates')
      ]));
    }

    if (RM.state.ui.showMilestones) {
      (item.milestones || []).forEach(function (milestone) {
        const marker = milestoneMarker(milestone, timeline, item.id);
        if (marker) bars.push(marker);
      });
    }

    return el('div', 'gantt-row gantt-row-item', [left, RM.gantt.timeCell(timeline, bars)]);

    function indicator(glyph, title, onClick, extra) {
      return el('button', { class: 'indicator ' + (extra || ''), type: 'button', title: title, onclick: onClick }, glyph);
    }
  }

  function milestoneMarker(milestone, timeline, itemId) {
    const date = RM.dates.parseIso(milestone.date);
    if (!date || date < timeline.start || date >= timeline.endExclusive) return null;
    const x = timeline.dateToX(date);
    const marker = el('div', { class: 'milestone', style: { left: (x - 6) + 'px' } });
    attachTooltip(marker, function () { return milestoneTooltip(milestone, itemId); });
    marker.addEventListener('click', function (event) {
      event.stopPropagation();
      if (itemId) RM.editor.openDetail(itemId, 'milestones');
    });
    return marker;
  }

  /** The milestone tooltip carries its note - that is where it is written. */
  function milestoneTooltip(milestone, itemId) {
    const item = itemId ? RM.itemById(itemId) : null;
    return [
      el('strong', 'tooltip-title', milestone.name || 'Milestone'),
      el('div', 'tooltip-dates', RM.dates.formatDate(milestone.date)),
      item ? el('div', 'tooltip-row', [el('span', 'tooltip-label', 'System change'), el('span', null, item.title)]) : null,
      milestone.itemTitle && !item
        ? el('div', 'tooltip-row', [el('span', 'tooltip-label', 'System change'), el('span', null, milestone.itemTitle)])
        : null,
      milestone.status
        ? el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Status'), el('span', null, RM.options.name('statuses', milestone.status))])
        : null,
      milestone.notes
        ? el('div', 'tooltip-note', milestone.notes)
        : el('div', 'tooltip-hint', 'No note on this milestone'),
      el('div', 'tooltip-hint', 'Click to open the milestones')
    ];
  }

  /* ---------------------------------------------------------------- */
  /* Tooltips                                                          */
  /* ---------------------------------------------------------------- */

  let tooltipNode = null;

  function attachTooltip(node, builder) {
    node.addEventListener('mouseenter', function (event) {
      hideTooltip();
      tooltipNode = el('div', 'tooltip', builder());
      document.body.appendChild(tooltipNode);
      positionTooltip(event);
    });
    node.addEventListener('mousemove', positionTooltip);
    node.addEventListener('mouseleave', hideTooltip);
  }

  function positionTooltip(event) {
    if (!tooltipNode) return;
    const padding = 14;
    const rect = tooltipNode.getBoundingClientRect();
    let left = event.clientX + padding;
    let top = event.clientY + padding;
    if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - padding;
    if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - padding;
    tooltipNode.style.left = Math.max(8, left) + 'px';
    tooltipNode.style.top = Math.max(8, top) + 'px';
  }

  function hideTooltip() {
    if (tooltipNode) { tooltipNode.remove(); tooltipNode = null; }
  }
  RM.hideTooltip = hideTooltip;

  function itemTooltip(item, deps) {
    const programme = RM.programmeById(item.programmeId);
    const count = deps.dependsOn.length + deps.blocks.length;
    return [
      el('strong', 'tooltip-title', item.title),
      programme ? el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Programme'), el('span', null, programme.name)]) : null,
      el('div', 'tooltip-dates', RM.dates.formatDate(item.startDate) + ' → ' + RM.dates.formatDate(item.endDate)),
      el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Status'), el('span', null, RM.options.name('statuses', item.status) || 'Not set')]),
      (item.productOwners || []).length
        ? el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Product owner'), el('span', null, item.productOwners.join(', '))])
        : null,
      (item.deliveryOwners || []).length
        ? el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Delivery owner'), el('span', null, item.deliveryOwners.join(', '))])
        : null,
      el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Dependencies'), el('span', null, String(count))]),
      el('div', 'tooltip-hint', 'Click for More Info')
    ];
  }

  function taskTooltip(item, task, days) {
    return [
      el('strong', 'tooltip-title', task.name),
      el('div', 'tooltip-row', [el('span', 'tooltip-label', 'System change'), el('span', null, item.title)]),
      el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Status'), el('span', null, RM.options.name('statuses', task.status) || 'Not set')]),
      task.owner ? el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Owner'), el('span', null, task.owner)]) : null,
      el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Stream'),
        el('span', null, RM.options.name('resourceStreams', RM.streamOf(item, task)) || 'Not set')]),
      el('div', 'tooltip-effort', RM.effort.resourceTypes().map(function (type) {
        return days[type.id] ? el('span', null, type.name + ': ' + RM.effort.format(days[type.id]) + ' d') : null;
      })),
      (task.okrIds || []).length ? el('div', 'tooltip-outcome', (task.okrIds || []).map(RM.okrs.label).join(' \u00b7 ')) : null,
      el('div', 'tooltip-hint', 'Click to edit this task')
    ];
  }

  function programmeTooltip(programme, range, children) {
    return [
      el('strong', 'tooltip-title', programme.name),
      el('div', 'tooltip-dates', range.scheduled
        ? RM.dates.formatDate(range.startDate) + ' → ' + RM.dates.formatDate(range.endDate)
        : 'Not scheduled'),
      el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Status'), el('span', null, RM.options.name('statuses', programme.status) || 'Not set')]),
      ownerTitle(programme)
        ? el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Owners'), el('span', null, ownerLabel(programme))])
        : null,
      el('div', 'tooltip-row', [el('span', 'tooltip-label', 'Changes'), el('span', null, String(children.length))]),
      programme.businessOutcome ? el('div', 'tooltip-outcome', programme.businessOutcome) : null
    ];
  }

  /* ---------------------------------------------------------------- */
  /* Drag and resize                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Dragging is a convenience only: it changes exactly the same start/end
   * dates the form does and goes through the normal save (with the revision
   * check), so it can never bypass conflict protection.
   */
  function enableDrag(bar, item, timeline) {
    bar.addEventListener('mousedown', function (event) {
      if (event.button !== 0) return;
      const mode = event.target.classList.contains('bar-handle-start') ? 'start'
        : event.target.classList.contains('bar-handle-end') ? 'end' : 'move';
      const startX = event.clientX;
      const originalLeft = parseFloat(bar.style.left);
      const originalWidth = parseFloat(bar.style.width);
      const originalStart = item.startDate;
      const originalEnd = item.endDate;
      if (!originalStart || !originalEnd) return;

      let moved = false;
      let nextStart = originalStart;
      let nextEnd = originalEnd;
      event.preventDefault();
      hideTooltip();
      bar.classList.add('bar-dragging');

      function onMove(moveEvent) {
        const delta = moveEvent.clientX - startX;
        if (!moved && Math.abs(delta) < 3) return;
        moved = true;
        bar.dataset.dragging = 'yes';

        if (mode === 'move') {
          const days = deltaDays(originalLeft, delta, timeline);
          nextStart = shift(originalStart, days);
          nextEnd = shift(originalEnd, days);
          bar.style.left = Math.max(0, originalLeft + delta) + 'px';
        } else if (mode === 'start') {
          const days = deltaDays(originalLeft, delta, timeline);
          nextStart = shift(originalStart, days);
          if (nextStart > nextEnd) nextStart = nextEnd;
          const geometry = timeline.bar(nextStart, nextEnd);
          if (geometry) { bar.style.left = geometry.left + 'px'; bar.style.width = geometry.width + 'px'; }
        } else {
          const days = deltaDays(originalLeft + originalWidth, delta, timeline);
          nextEnd = shift(originalEnd, days);
          if (nextEnd < nextStart) nextEnd = nextStart;
          const geometry = timeline.bar(nextStart, nextEnd);
          if (geometry) bar.style.width = geometry.width + 'px';
        }
        bar.querySelector('.bar-label').textContent =
          RM.dates.formatDate(nextStart) + ' → ' + RM.dates.formatDate(nextEnd);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        bar.classList.remove('bar-dragging');
        window.setTimeout(function () { delete bar.dataset.dragging; }, 60);
        if (!moved || (nextStart === originalStart && nextEnd === originalEnd)) {
          RM.renderView();
          return;
        }
        RM.api.update('roadmapItems', item.id, Object.assign({}, item, { startDate: nextStart, endDate: nextEnd }))
          .then(function () {
            RM.toast('Moved "' + item.title + '" to ' + RM.dates.formatDate(nextStart) + ' - ' + RM.dates.formatDate(nextEnd) + '.', 'success');
            return RM.refresh();
          })
          .catch(function (err) {
            RM.handleError(err, 'Could not move the item');
            RM.renderView();
          });
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /** Converts a pixel delta into whole days using the timeline scale. */
  function deltaDays(originX, deltaX, timeline) {
    const from = timeline.xToDate(originX);
    const to = timeline.xToDate(originX + deltaX);
    if (!from || !to) return 0;
    return Math.round((to - from) / 86400000);
  }

  function shift(iso, days) {
    const date = RM.dates.parseIso(iso);
    if (!date) return iso;
    return RM.dates.toIso(RM.dates.addDays(date, days));
  }

  /* ---------------------------------------------------------------- */

  function legend() {
    return el('div', 'legend', [
      el('span', 'legend-item', [el('span', 'legend-swatch legend-programme'), 'Programme (earliest child start to latest child end)']),
      el('span', 'legend-item', [el('span', 'legend-swatch legend-item-bar'), 'System change (coloured by status)']),
      el('span', 'legend-item', [el('span', 'legend-swatch legend-task-bar'), 'Task (runs with its system change)']),
      el('span', 'legend-item', [el('span', 'legend-swatch legend-milestone'), 'Milestone']),
      el('span', 'legend-item', [el('span', 'legend-swatch legend-today'), 'Today']),
      RM.state.ui.showKeyDates && RM.keyDates().length
        ? el('span', 'legend-item', [el('span', 'legend-swatch legend-key-date'), 'Key date (maintained in Settings)'])
        : null,
      RM.state.ui.roadmapMode === 'detailed'
        ? el('span', 'legend-item muted', 'Drag a bar to move it, or drag its edges to resize. Every change is saved with the same conflict check as the form.')
        : el('span', 'legend-item muted', 'Executive view shows programmes only. Switch to Detailed View to see and edit the system changes underneath.')
    ]);
  }

  RM.registerView('roadmap', render);
  RM.roadmap = { render: render, clearFilters: clearFilters };
}(window.RM));
