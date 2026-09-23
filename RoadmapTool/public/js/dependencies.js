'use strict';

/**
 * Dependency register (table) and dependency map (node-and-arrow diagram).
 */
(function (RM) {
  const el = RM.el;

  const state = { mode: 'register', search: '', type: '', blocking: '', programme: '' };

  function render(root) {
    root.appendChild(RM.pageHeader(
      'Dependencies',
      'Every link between system changes, in one register and one map.',
      [RM.button('+ New Dependency', function () { openForm(null); }, 'primary')]
    ));

    root.appendChild(el('div', 'toolbar', [
      el('div', 'segmented', [
        segment('Register', state.mode === 'register'),
        segment('Map', state.mode === 'map')
      ]),
      el('div', 'toolbar-spacer'),
      searchBox(),
      select('type', 'Type', RM.options.active('dependencyTypes').map(function (o) { return { value: o.id, label: o.name }; })),
      select('programme', 'Programme', RM.records('programmes').map(function (p) { return { value: p.id, label: p.name }; })),
      select('blocking', 'Blocking', [{ value: 'yes', label: 'Blocking only' }, { value: 'no', label: 'Non-blocking only' }])
    ]));

    const rows = filtered();
    if (RM.records('roadmapItems').length < 2) {
      root.appendChild(RM.emptyState('Not enough roadmap items',
        'Dependencies link two system changes. Add at least two roadmap items first.'));
      return;
    }

    root.appendChild(state.mode === 'map' ? renderMap(rows) : renderRegister(rows));

    function segment(label, active) {
      return el('button', {
        class: 'segment' + (active ? ' segment-active' : ''), type: 'button',
        onclick: function () { state.mode = label.toLowerCase(); RM.renderView(); }
      }, label);
    }

    function searchBox() {
      const input = el('input', { class: 'input search-input', type: 'search', placeholder: 'Search dependencies...', value: state.search });
      let timer = null;
      input.addEventListener('input', function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          state.search = input.value.trim();
          RM.renderView();
          const box = document.querySelector('.search-input');
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        }, 250);
      });
      return input;
    }

    function select(name, label, values) {
      const node = el('select', 'input select select-compact');
      node.appendChild(el('option', { value: '' }, label + ': All'));
      values.forEach(function (value) { node.appendChild(el('option', { value: value.value }, value.label)); });
      node.value = state[name] || '';
      node.addEventListener('change', function () { state[name] = node.value; RM.renderView(); });
      return node;
    }
  }

  function filtered() {
    const term = state.search.toLowerCase();
    return RM.records('dependencies').filter(function (dependency) {
      if (state.type && dependency.dependencyType !== state.type) return false;
      if (state.blocking === 'yes' && !dependency.blocking) return false;
      if (state.blocking === 'no' && dependency.blocking) return false;
      if (state.programme) {
        const from = RM.itemById(dependency.fromItemId);
        const to = RM.itemById(dependency.toItemId);
        const match = (from && from.programmeId === state.programme) || (to && to.programmeId === state.programme);
        if (!match) return false;
      }
      if (term) {
        const haystack = [
          dependency.id, dependency.description, dependency.owner, dependency.notes,
          RM.itemLabel(dependency.fromItemId), RM.itemLabel(dependency.toItemId),
          RM.options.name('dependencyTypes', dependency.dependencyType)
        ].join(' ').toLowerCase();
        if (haystack.indexOf(term) < 0) return false;
      }
      return true;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Register                                                          */
  /* ---------------------------------------------------------------- */

  function renderRegister(rows) {
    if (rows.length === 0) {
      return RM.emptyState('No dependencies recorded',
        'Add a dependency to show how one system change depends on another.',
        RM.button('+ New Dependency', function () { openForm(null); }, 'primary'));
    }

    return el('div', 'table-wrap', el('table', 'table table-hover', [
      el('thead', null, el('tr', null, [
        el('th', null, 'Dependency ID'),
        el('th', null, 'From'),
        el('th', null, 'To'),
        el('th', null, 'Type'),
        el('th', null, 'Description'),
        el('th', null, 'Blocking'),
        el('th', null, 'Status'),
        el('th', null, 'Owner'),
        el('th', null, 'Notes'),
        el('th', null, '')
      ])),
      el('tbody', null, rows.map(function (dependency) {
        return el('tr', null, [
          el('td', 'mono', dependency.id),
          el('td', null, itemLink(dependency.fromItemId)),
          el('td', null, itemLink(dependency.toItemId)),
          el('td', null, el('span', 'pill', RM.options.name('dependencyTypes', dependency.dependencyType) || 'Not set')),
          el('td', null, dependency.description || ''),
          el('td', null, dependency.blocking ? el('span', 'pill pill-danger', 'Blocking') : el('span', 'muted', 'No')),
          el('td', null, RM.statusBadge(dependency.status)),
          el('td', null, dependency.owner || ''),
          el('td', null, dependency.notes || ''),
          el('td', 'row-actions', [
            el('button', { class: 'link-button', type: 'button', onclick: function () { openForm(dependency); } }, 'Edit'),
            el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { remove(dependency); } }, 'Delete')
          ])
        ]);
      }))
    ]));
  }

  function itemLink(itemId) {
    const item = RM.itemById(itemId);
    if (!item) return el('span', 'muted', itemId + ' (missing)');
    return el('button', { class: 'link-button', type: 'button', onclick: function () { RM.editor.openDetail(item.id); } }, item.title);
  }

  /* ---------------------------------------------------------------- */
  /* Map                                                               */
  /* ---------------------------------------------------------------- */

  const NODE_WIDTH = 210;
  const NODE_HEIGHT = 62;
  const COLUMN_GAP = 74;
  const ROW_GAP = 20;

  function renderMap(rows) {
    if (rows.length === 0) {
      return RM.emptyState('Nothing to map', 'No dependencies match the current filters.');
    }

    const nodeIds = new Set();
    rows.forEach(function (dependency) {
      nodeIds.add(dependency.fromItemId);
      nodeIds.add(dependency.toItemId);
    });

    const incoming = {};
    const outgoing = {};
    nodeIds.forEach(function (id) { incoming[id] = []; outgoing[id] = []; });
    rows.forEach(function (dependency) {
      if (!incoming[dependency.toItemId] || !outgoing[dependency.fromItemId]) return;
      incoming[dependency.toItemId].push(dependency.fromItemId);
      outgoing[dependency.fromItemId].push(dependency.toItemId);
    });

    const depth = computeDepths(Array.from(nodeIds), incoming);
    const columns = [];
    Object.keys(depth).forEach(function (id) {
      const level = depth[id];
      if (!columns[level]) columns[level] = [];
      columns[level].push(id);
    });

    const positions = {};
    columns.forEach(function (ids, level) {
      ids.sort(function (a, b) { return String(RM.itemLabel(a)).localeCompare(String(RM.itemLabel(b))); });
      ids.forEach(function (id, index) {
        positions[id] = {
          x: level * (NODE_WIDTH + COLUMN_GAP),
          y: index * (NODE_HEIGHT + ROW_GAP)
        };
      });
    });

    const width = columns.length * (NODE_WIDTH + COLUMN_GAP);
    const height = Math.max.apply(null, columns.map(function (ids) { return ids.length; })) * (NODE_HEIGHT + ROW_GAP);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'map-links');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.appendChild(arrowMarker());

    rows.forEach(function (dependency) {
      const from = positions[dependency.fromItemId];
      const to = positions[dependency.toItemId];
      if (!from || !to) return;
      const x1 = from.x + NODE_WIDTH;
      const y1 = from.y + NODE_HEIGHT / 2;
      const x2 = to.x - 8;
      const y2 = to.y + NODE_HEIGHT / 2;
      const midX = x1 + (x2 - x1) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C ' + midX + ' ' + y1 + ' ' + midX + ' ' + y2 + ' ' + x2 + ' ' + y2);
      path.setAttribute('class', 'map-link' + (dependency.blocking ? ' map-link-blocking' : ''));
      path.setAttribute('marker-end', 'url(#map-arrow)');
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = RM.itemLabel(dependency.fromItemId) + ' → ' + RM.itemLabel(dependency.toItemId) +
        (dependency.description ? ' : ' + dependency.description : '');
      path.appendChild(title);
      svg.appendChild(path);
    });

    const canvas = el('div', { class: 'map-canvas', style: { width: width + 'px', height: height + 'px' } });
    canvas.appendChild(svg);

    Object.keys(positions).forEach(function (id) {
      const item = RM.itemById(id);
      const position = positions[id];
      const programme = item ? RM.programmeById(item.programmeId) : null;
      const node = el('button', {
        class: 'map-node', type: 'button',
        style: { left: position.x + 'px', top: position.y + 'px', width: NODE_WIDTH + 'px', height: NODE_HEIGHT + 'px' },
        title: item ? item.title : id,
        onclick: function () { if (item) RM.editor.openDetail(item.id, 'dependencies'); }
      }, [
        el('span', { class: 'map-node-bar', style: { background: programme ? (programme.colour || '#2563eb') : '#94a3b8' } }),
        el('span', 'map-node-title', item ? item.title : id + ' (missing)'),
        el('span', 'map-node-meta', [
          item && item.systemArea ? RM.options.name('systems', item.systemArea) : '',
          item && RM.itemRange(item).startDate ? ' \u00b7 ' + RM.dates.formatDate(RM.itemRange(item).startDate) : ''
        ].join(''))
      ]);
      canvas.appendChild(node);
    });

    return el('div', 'stack', [
      el('p', 'muted small', 'Items flow left to right: something on the left must happen before the item it points to. Click a box to open it.'),
      el('div', 'map-scroll', canvas)
    ]);
  }

  /** Longest-path depth, with a guard so a cycle cannot loop forever. */
  function computeDepths(ids, incoming) {
    const depth = {};
    ids.forEach(function (id) { depth[id] = 0; });
    for (let pass = 0; pass < ids.length + 1; pass += 1) {
      let changed = false;
      ids.forEach(function (id) {
        (incoming[id] || []).forEach(function (parent) {
          if (depth[parent] + 1 > depth[id]) {
            depth[id] = Math.min(depth[parent] + 1, ids.length);
            changed = true;
          }
        });
      });
      if (!changed) break;
    }
    return depth;
  }

  function arrowMarker() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'map-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('class', 'map-arrow-head');
    marker.appendChild(path);
    defs.appendChild(marker);
    return defs;
  }

  /* ---------------------------------------------------------------- */
  /* Create / edit                                                     */
  /* ---------------------------------------------------------------- */

  function itemOptions() {
    return RM.records('roadmapItems')
      .slice()
      .sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); })
      .map(function (item) {
        const programme = RM.programmeById(item.programmeId);
        return { value: item.id, label: item.title + (programme ? '  (' + (programme.shortName || programme.name) + ')' : '') };
      });
  }

  function openForm(dependency, defaults) {
    const isNew = !dependency;
    const form = RM.form([
      { name: 'fromItemId', label: 'From (must happen first)', required: true, type: 'select', options: itemOptions, emptyLabel: '- choose an item -', full: true },
      { name: 'toItemId', label: 'To (depends on the item above)', required: true, type: 'select', options: itemOptions, emptyLabel: '- choose an item -', full: true },
      { name: 'dependencyType', label: 'Type', type: 'select', options: RM.selectOptions('dependencyTypes') },
      { name: 'status', label: 'Status', type: 'select', options: RM.selectOptions('statuses') },
      { name: 'owner', label: 'Owner', type: 'select', options: RM.peopleOptions, emptyLabel: '- nobody yet -' },
      { name: 'blocking', label: 'Blocking', type: 'checkbox', hint: 'Blocking dependencies are highlighted on the roadmap.' },
      { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 2 },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
    ], Object.assign({ dependencyType: 'predecessor', status: 'open', blocking: true }, dependency || {}, defaults || {}));

    const handle = RM.modal({
      title: isNew ? 'New dependency' : 'Edit dependency ' + dependency.id,
      size: 'medium',
      dismissible: false,
      body: form.element,
      footer: [
        RM.button('Cancel', function () { handle.close(); }),
        RM.button(isNew ? 'Create dependency' : 'Save changes', function () { save(false); }, 'primary')
      ]
    });

    function save(acceptWarnings) {
      const record = Object.assign({}, dependency || {}, form.read());
      const request = isNew
        ? RM.api.create('dependencies', record, { acceptWarnings: acceptWarnings })
        : RM.api.update('dependencies', dependency.id, record, { acceptWarnings: acceptWarnings });
      request.then(function () {
        handle.close();
        RM.toast('Dependency saved.', 'success');
        return RM.refresh();
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) {
          const errors = err.detail.errors || [];
          const warnings = err.detail.warnings || [];
          if (errors.length === 0 && warnings.length) {
            RM.confirm({
              title: 'Possible duplicate',
              message: warnings.map(function (w) { return w.message; }).join(' '),
              confirmLabel: 'Save anyway'
            }).then(function (ok) { if (ok) save(true); });
            return;
          }
          form.showErrors(errors);
        }
        RM.handleError(err, 'Could not save the dependency');
      });
    }
  }

  function remove(dependency) {
    RM.confirm({
      title: 'Delete dependency',
      message: 'Delete the dependency ' + RM.itemLabel(dependency.fromItemId) + ' → ' + RM.itemLabel(dependency.toItemId) + '?',
      confirmLabel: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      RM.api.remove('dependencies', dependency.id).then(function () {
        RM.toast('Dependency deleted.', 'success');
        return RM.refresh();
      }).catch(function (err) { RM.handleError(err, 'Could not delete the dependency'); });
    });
  }

  RM.registerView('dependencies', render);
  RM.dependencyView = { openForm: openForm, render: render };
}(window.RM));
