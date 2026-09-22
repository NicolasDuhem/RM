'use strict';

/**
 * Master backlog: known changes that are not yet scheduled on the roadmap.
 * Backlog records deliberately have no dates - they gain them when promoted.
 */
(function (RM) {
  const el = RM.el;
  const state = { search: '', system: '', status: '', priority: '', owner: '', promoted: 'open' };

  function render(root) {
    root.appendChild(RM.pageHeader(
      'Master Backlog',
      'Date-free requirements waiting to be scheduled. Promote one to put it on the roadmap.',
      [RM.button('+ New Backlog Item', function () { openForm(null); }, 'primary')]
    ));

    root.appendChild(el('div', 'toolbar', [
      searchBox(),
      select('system', 'System', RM.options.active('systems').map(opt)),
      select('status', 'Status', RM.options.active('statuses').map(opt)),
      select('priority', 'Priority', RM.options.active('priorities').map(opt)),
      select('owner', 'Owner', RM.ownersInUse().map(function (o) { return { value: o, label: o }; })),
      select('promoted', 'Show', [
        { value: 'open', label: 'Not yet promoted' },
        { value: 'promoted', label: 'Promoted only' },
        { value: '', label: 'Everything' }
      ], true)
    ]));

    const rows = filtered();
    if (RM.records('backlog').length === 0) {
      root.appendChild(RM.emptyState('The backlog is empty',
        'Capture changes you know about but cannot schedule yet. They stay here until you promote them.',
        RM.button('+ New Backlog Item', function () { openForm(null); }, 'primary')));
      return;
    }
    if (rows.length === 0) {
      root.appendChild(RM.emptyState('Nothing matches these filters', 'Change or clear the filters above.'));
      return;
    }

    root.appendChild(el('div', 'table-wrap', el('table', 'table table-hover', [
      el('thead', null, el('tr', null, [
        el('th', null, 'Id'), el('th', null, 'Change'), el('th', null, 'Programme'), el('th', null, 'System'),
        el('th', null, 'Sub area / Dept'), el('th', null, 'Type'), el('th', null, 'Status'), el('th', null, 'Priority'),
        el('th', null, 'Owner'), el('th', null, 'Dependency / Prerequisite'), el('th', null, '')
      ])),
      el('tbody', null, rows.map(function (record) {
        const programme = RM.programmeById(record.programme);
        return el('tr', record.promoted ? 'row-muted' : null, [
          el('td', 'mono', record.id),
          el('td', null, el('button', { class: 'link-button', type: 'button', onclick: function () { openDetail(record); } }, record.change)),
          el('td', null, programme ? programme.name : (record.programme || '')),
          el('td', null, record.systemArea ? el('span', 'pill', RM.options.name('systems', record.systemArea)) : ''),
          el('td', null, record.subAreaDepartment || ''),
          el('td', null, RM.options.name('itemTypes', record.type)),
          el('td', null, RM.statusBadge(record.currentStatus)),
          el('td', null, RM.priorityBadge(record.priority) || ''),
          el('td', null, record.owner || ''),
          el('td', null, record.dependencyPrerequisite || ''),
          el('td', 'row-actions', [
            record.promoted
              ? el('span', 'pill pill-success', 'On roadmap')
              : el('button', { class: 'link-button link-strong', type: 'button', onclick: function () { openPromote(record); } }, 'Move to Roadmap'),
            el('button', { class: 'link-button', type: 'button', onclick: function () { openForm(record); } }, 'Edit'),
            el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { remove(record); } }, 'Delete')
          ])
        ]);
      }))
    ])));

    function opt(option) { return { value: option.id, label: option.name }; }

    function searchBox() {
      const input = el('input', { class: 'input search-input', type: 'search', placeholder: 'Search the backlog...', value: state.search });
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

    function select(name, label, values, noAll) {
      const node = el('select', 'input select select-compact');
      if (!noAll) node.appendChild(el('option', { value: '' }, label + ': All'));
      values.forEach(function (value) { node.appendChild(el('option', { value: value.value }, value.label)); });
      node.value = state[name] || '';
      node.addEventListener('change', function () { state[name] = node.value; RM.renderView(); });
      return node;
    }
  }

  function filtered() {
    const term = state.search.toLowerCase();
    return RM.records('backlog').filter(function (record) {
      if (state.system && record.systemArea !== state.system) return false;
      if (state.status && record.currentStatus !== state.status) return false;
      if (state.priority && record.priority !== state.priority) return false;
      if (state.owner && record.owner !== state.owner) return false;
      if (state.promoted === 'open' && record.promoted) return false;
      if (state.promoted === 'promoted' && !record.promoted) return false;
      if (term) {
        const haystack = [
          record.id, record.change, record.comment, record.owner, record.subAreaDepartment,
          record.dependencyPrerequisite, record.otherSystemsImpacted, record.processesImpacted,
          RM.options.name('systems', record.systemArea)
        ].join(' ').toLowerCase();
        if (haystack.indexOf(term) < 0) return false;
      }
      return true;
    });
  }

  function fields() {
    return [
      { name: 'change', label: 'Change', required: true, full: true },
      {
        name: 'programme', label: 'Programme', type: 'select',
        options: function () { return RM.records('programmes').map(function (p) { return { value: p.id, label: p.name }; }); },
        hint: 'Optional - a backlog item does not need a programme yet.'
      },
      { name: 'systemArea', label: 'System area', type: 'select', options: RM.selectOptions('systems') },
      { name: 'subAreaDepartment', label: 'Sub area / department' },
      { name: 'type', label: 'Type', type: 'select', options: RM.selectOptions('itemTypes') },
      { name: 'currentStatus', label: 'Current status', type: 'select', options: RM.selectOptions('statuses') },
      { name: 'priority', label: 'Priority', type: 'select', options: RM.selectOptions('priorities') },
      { name: 'owner', label: 'Owner' },
      { name: 'dependencyPrerequisite', label: 'Dependency / prerequisite', type: 'textarea', full: true, rows: 2 },
      { name: 'otherSystemsImpacted', label: 'Other systems impacted', type: 'textarea', full: true, rows: 2 },
      { name: 'processesImpacted', label: 'Processes impacted', type: 'textarea', full: true, rows: 2 },
      { name: 'comment', label: 'Comment', type: 'textarea', full: true, rows: 3 }
    ];
  }

  function openForm(record) {
    const isNew = !record;
    const form = RM.form(fields(), record || { currentStatus: 'idea', priority: 'medium' });
    const handle = RM.modal({
      title: isNew ? 'New backlog item' : 'Edit backlog item',
      subtitle: 'Backlog items have no dates. Add dates when you promote the item onto the roadmap.',
      size: 'large',
      body: form.element,
      footer: [
        RM.button('Cancel', function () { handle.close(); }),
        RM.button(isNew ? 'Create backlog item' : 'Save changes', save, 'primary')
      ]
    });

    function save() {
      const draft = Object.assign({}, record || {}, form.read());
      const request = isNew ? RM.api.create('backlog', draft) : RM.api.update('backlog', record.id, draft);
      request.then(function () {
        handle.close();
        RM.toast('Backlog item saved.', 'success');
        return RM.refresh();
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) form.showErrors(err.detail.errors);
        RM.handleError(err, 'Could not save the backlog item');
      });
    }
  }

  function openDetail(record) {
    const programme = RM.programmeById(record.programme);
    const promotedItem = record.roadmapItemId ? RM.itemById(record.roadmapItemId) : null;
    const handle = RM.modal({
      title: record.change,
      subtitle: 'Backlog item ' + record.id,
      size: 'medium',
      body: el('div', 'stack', [
        el('dl', 'definition-grid', [
          RM.definition('Programme', programme ? programme.name : record.programme),
          RM.definition('System area', RM.options.name('systems', record.systemArea)),
          RM.definition('Sub area / department', record.subAreaDepartment),
          RM.definition('Type', RM.options.name('itemTypes', record.type)),
          RM.definition('Current status', RM.options.name('statuses', record.currentStatus)),
          RM.definition('Priority', RM.options.name('priorities', record.priority)),
          RM.definition('Owner', record.owner),
          RM.definition('On roadmap', promotedItem ? promotedItem.title : 'Not promoted yet')
        ]),
        RM.editor.section('Dependency / prerequisite', RM.textBlock(record.dependencyPrerequisite)),
        RM.editor.section('Other systems impacted', RM.textBlock(record.otherSystemsImpacted)),
        RM.editor.section('Processes impacted', RM.textBlock(record.processesImpacted)),
        RM.editor.section('Comment', RM.textBlock(record.comment))
      ]),
      footer: [
        RM.button('Delete', function () { handle.close(); remove(record); }, 'danger'),
        el('span', 'foot-spacer'),
        promotedItem
          ? RM.button('Open roadmap item', function () { handle.close(); RM.editor.openDetail(promotedItem.id); })
          : RM.button('Move to Roadmap', function () { handle.close(); openPromote(record); }),
        RM.button('Edit', function () { handle.close(); openForm(record); }, 'primary')
      ]
    });
  }

  /* ---------------------------------------------------------------- */
  /* Promote to roadmap                                                */
  /* ---------------------------------------------------------------- */

  function openPromote(record) {
    const programmes = RM.records('programmes');
    const form = RM.form([
      {
        name: 'programmeId', label: 'Programme', type: 'select',
        options: function () { return programmes.map(function (p) { return { value: p.id, label: p.name }; }); },
        emptyLabel: '- create a new programme below -',
        hint: 'Choose where this change belongs on the roadmap.'
      },
      { name: 'newProgrammeName', label: 'Or new programme name', hint: 'Leave empty when using an existing programme.' },
      { name: 'title', label: 'Roadmap item title', required: true, full: true },
      { name: 'startDate', label: 'Start date', type: 'date' },
      { name: 'endDate', label: 'End date', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: RM.selectOptions('statuses') },
      { name: 'priority', label: 'Priority', type: 'select', options: RM.selectOptions('priorities') },
      { name: 'owner', label: 'Owner' }
    ], {
      programmeId: record.programme || '',
      title: record.change,
      status: record.currentStatus || 'ready',
      priority: record.priority || 'medium',
      owner: record.owner || ''
    });

    const dependencyNote = record.dependencyPrerequisite
      ? el('div', 'callout callout-info', [
        el('strong', null, 'Prerequisite recorded on this backlog item: '),
        record.dependencyPrerequisite,
        el('p', 'small', 'Add a formal dependency from the Dependencies screen once both items exist.')
      ])
      : null;

    const handle = RM.modal({
      title: 'Move to Roadmap',
      subtitle: record.change,
      size: 'medium',
      body: el('div', 'stack', [dependencyNote, form.element]),
      footer: [
        RM.button('Cancel', function () { handle.close(); }),
        RM.button('Add to roadmap', save, 'primary')
      ]
    });

    function save() {
      const values = form.read();
      const payload = {
        backlogId: record.id,
        programmeId: values.programmeId,
        newProgramme: values.newProgrammeName ? { name: values.newProgrammeName, owner: values.owner } : null,
        item: {
          title: values.title,
          startDate: values.startDate,
          endDate: values.endDate,
          status: values.status,
          priority: values.priority,
          owner: values.owner,
          productOwner: values.owner
        }
      };
      RM.api.promoteBacklog(payload).then(function (response) {
        handle.close();
        RM.toast('Added to the roadmap.', 'success');
        return RM.refresh().then(function () {
          if (response.record) RM.editor.openDetail(response.record.id);
        });
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) form.showErrors(err.detail.errors);
        RM.handleError(err, 'Could not promote the backlog item');
      });
    }
  }

  function remove(record) {
    RM.confirm({
      title: 'Delete backlog item',
      message: 'Delete "' + record.change + '"?',
      detail: record.promoted ? 'This item has already been promoted. The roadmap item will not be deleted.' : null,
      confirmLabel: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      RM.api.remove('backlog', record.id).then(function () {
        RM.toast('Backlog item deleted.', 'success');
        return RM.refresh();
      }).catch(function (err) { RM.handleError(err, 'Could not delete the backlog item'); });
    });
  }

  RM.registerView('backlog', render);
  RM.backlogView = { render: render, openForm: openForm };
}(window.RM));
