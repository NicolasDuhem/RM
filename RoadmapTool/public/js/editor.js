'use strict';

/**
 * Create / edit forms and the "More info" detail panel.
 * Nothing here saves on keystroke - every change needs an explicit Save.
 */
(function (RM) {
  const el = RM.el;

  /* ---------------------------------------------------------------- */
  /* Programme                                                         */
  /* ---------------------------------------------------------------- */

  function openProgrammeForm(programme) {
    const isNew = !programme;
    const form = RM.form([
      { name: 'name', label: 'Programme name', required: true, full: true },
      { name: 'shortName', label: 'Short name', hint: 'Used on the roadmap bar when space is tight.' },
      { name: 'owner', label: 'Owner' },
      { name: 'status', label: 'Status', type: 'select', options: RM.selectOptions('statuses') },
      { name: 'priority', label: 'Priority', type: 'select', options: RM.selectOptions('priorities') },
      { name: 'colour', label: 'Colour', type: 'color' },
      { name: 'businessOutcome', label: 'Business outcome', type: 'textarea', full: true, rows: 2 },
      { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 3 },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
    ], programme || { colour: '#2563eb' });

    const handle = RM.modal({
      title: isNew ? 'New programme' : 'Edit programme',
      subtitle: 'Programme dates are calculated from the system changes underneath - there is nothing to set here.',
      size: 'medium',
      body: form.element,
      footer: [
        RM.button('Cancel', function () { handle.close(); }),
        RM.button(isNew ? 'Create programme' : 'Save changes', save, 'primary')
      ]
    });

    function save() {
      const values = form.read();
      const record = Object.assign({}, programme || {}, values);
      const request = isNew
        ? RM.api.create('programmes', record)
        : RM.api.update('programmes', programme.id, record);
      request.then(function () {
        handle.close();
        RM.toast(isNew ? 'Programme created.' : 'Programme saved.', 'success');
        return RM.refresh();
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) form.showErrors(err.detail.errors);
        RM.handleError(err, 'Could not save the programme');
      });
    }
  }

  function openProgrammeDetail(programmeId) {
    const programme = RM.programmeById(programmeId);
    if (!programme) return RM.toast('That programme no longer exists.', 'error');
    const children = RM.itemsForProgramme(programmeId);
    const range = RM.programmeRange(programmeId, children);

    const body = el('div', 'detail', [
      el('div', 'detail-hero', [
        el('div', null, [
          el('div', 'detail-eyebrow', 'Programme'),
          el('h3', 'detail-title', programme.name),
          programme.businessOutcome ? el('p', 'detail-lede', programme.businessOutcome) : null
        ]),
        el('div', 'detail-hero-meta', [
          RM.statusBadge(programme.status),
          RM.priorityBadge(programme.priority)
        ])
      ]),
      el('dl', 'definition-grid', [
        RM.definition('Owner', programme.owner),
        RM.definition('Programme start', range.scheduled ? RM.dates.formatDate(range.startDate) : 'Not scheduled'),
        RM.definition('Programme end', range.scheduled ? RM.dates.formatDate(range.endDate) : 'Not scheduled'),
        RM.definition('System changes', String(children.length)),
        RM.definition('Last updated', RM.dates.formatDateTime(programme.updatedAt) + (programme.updatedBy ? ' by ' + programme.updatedBy : ''), { full: true })
      ]),
      section('Description', RM.textBlock(programme.description)),
      section('Notes', RM.textBlock(programme.notes, 'No notes.')),
      section('System changes', children.length
        ? el('div', 'mini-list', children.map(function (item) {
          return el('button', { class: 'mini-row', type: 'button', onclick: function () { handle.close(); openDetail(item.id); } }, [
            el('span', 'mini-row-title', item.title),
            el('span', 'mini-row-meta', [
              RM.statusBadge(item.status),
              el('span', 'muted', item.startDate ? RM.dates.formatDate(item.startDate) + ' → ' + RM.dates.formatDate(item.endDate) : 'Not scheduled')
            ])
          ]);
        }))
        : el('p', 'muted', 'No system changes yet.'))
    ]);

    const handle = RM.modal({
      title: programme.name,
      subtitle: 'Programme',
      size: 'large',
      body: body,
      footer: [
        RM.button('Delete', function () { deleteProgramme(programme, handle); }, 'danger'),
        el('span', 'foot-spacer'),
        RM.button('View history', function () { openHistory(programme.id, programme.name); }),
        RM.button('+ Add System Change', function () { handle.close(); openItemForm(null, programme.id); }),
        RM.button('Edit programme', function () { handle.close(); openProgrammeForm(programme); }, 'primary')
      ]
    });
  }

  function deleteProgramme(programme, handle) {
    const children = RM.itemsForProgramme(programme.id);
    if (children.length === 0) {
      RM.confirm({
        title: 'Delete programme',
        message: 'Delete "' + programme.name + '"?',
        confirmLabel: 'Delete programme',
        danger: true
      }).then(function (ok) {
        if (ok) doDelete(false);
      });
      return;
    }

    const affectedDependencies = RM.records('dependencies').filter(function (dependency) {
      return children.some(function (child) { return child.id === dependency.fromItemId || child.id === dependency.toItemId; });
    });

    RM.confirm({
      title: 'Delete programme and all children?',
      message: 'This programme contains ' + children.length + ' roadmap item' + (children.length === 1 ? '' : 's') + '.',
      detail: 'Deleting "' + programme.name + '" will also delete every system change underneath it' +
        (affectedDependencies.length ? ' and ' + affectedDependencies.length + ' dependency record(s) that refer to them' : '') +
        '. A backup is taken first, and this cannot be undone from the roadmap screen.',
      confirmLabel: 'Delete programme and all children',
      cancelLabel: 'Cancel',
      danger: true
    }).then(function (ok) {
      if (ok) doDelete(true);
    });

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
  /* Roadmap item                                                      */
  /* ---------------------------------------------------------------- */

  function itemFields(quick) {
    const core = [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'shortTitle', label: 'Short title', hint: 'Shown on the roadmap bar.' },
      {
        name: 'programmeId', label: 'Programme', required: true, type: 'select', allowEmpty: true,
        emptyLabel: '- choose a programme -',
        options: function () {
          return RM.records('programmes').map(function (p) { return { value: p.id, label: p.name }; });
        }
      },
      { name: 'systemArea', label: 'System', type: 'select', options: RM.selectOptions('systems') },
      { name: 'subArea', label: 'Sub area' },
      { name: 'type', label: 'Type', type: 'select', options: RM.selectOptions('itemTypes') },
      { name: 'status', label: 'Status', type: 'select', options: RM.selectOptions('statuses') },
      { name: 'priority', label: 'Priority', type: 'select', options: RM.selectOptions('priorities') },
      { name: 'currentPhase', label: 'Current phase', type: 'select', options: RM.selectOptions('milestoneTypes') },
      { name: 'startDate', label: 'Start date', type: 'date' },
      { name: 'endDate', label: 'End date', type: 'date' },
      { name: 'targetDate', label: 'Target date', type: 'date' },
      { name: 'owner', label: 'Owner' }
    ];
    if (quick) {
      return core.concat([{ name: 'description', label: 'Description', type: 'textarea', full: true, rows: 3 }]);
    }

    const resourceTypes = RM.options.active('resourceTypes');
    const estimateFields = [];
    estimateFields.push({ type: 'section', label: 'Fast MVP (higher risk)' });
    resourceTypes.forEach(function (type) {
      estimateFields.push({ name: 'estimates.fast.days.' + type.id, label: type.name + ' days', type: 'number', min: 0, step: '0.5' });
    });
    estimateFields.push({ name: 'estimates.fast.risk', label: 'Risk', full: true });
    estimateFields.push({ name: 'estimates.fast.notes', label: 'Approach notes', type: 'textarea', full: true, rows: 2 });
    estimateFields.push({ type: 'section', label: 'Standard delivery' });
    resourceTypes.forEach(function (type) {
      estimateFields.push({ name: 'estimates.standard.days.' + type.id, label: type.name + ' days', type: 'number', min: 0, step: '0.5' });
    });
    estimateFields.push({ name: 'estimates.standard.risk', label: 'Risk', full: true });
    estimateFields.push({ name: 'estimates.standard.notes', label: 'Approach notes', type: 'textarea', full: true, rows: 2 });

    return core.concat([
      { type: 'section', label: 'Ownership' },
      { name: 'businessOwner', label: 'Business owner' },
      { name: 'productOwner', label: 'Product owner' },
      { name: 'technicalOwner', label: 'Technical owner' },
      { name: 'deliveryOwner', label: 'Delivery owner' },
      { type: 'section', label: 'Business information' },
      { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 3 },
      { name: 'businessOutcome', label: 'Business outcome', type: 'textarea', full: true, rows: 2 },
      { name: 'problemStatement', label: 'Problem statement', type: 'textarea', full: true, rows: 2 },
      { type: 'section', label: 'Scope' },
      { name: 'scope', label: 'Scope', type: 'textarea', full: true, rows: 3 },
      { name: 'outOfScope', label: 'Out of scope', type: 'textarea', full: true, rows: 2 },
      { name: 'assumptions', label: 'Assumptions', type: 'textarea', full: true, rows: 2 },
      { type: 'section', label: 'Dependencies described in words' },
      { name: 'systemDependencies', label: 'System dependencies', type: 'textarea', full: true, rows: 2 },
      { name: 'businessDependencies', label: 'Business dependencies', type: 'textarea', full: true, rows: 2 },
      { name: 'dataDependencies', label: 'Data dependencies', type: 'textarea', full: true, rows: 2 },
      { type: 'section', label: 'Delivery approach' },
      { name: 'recommendedApproach', label: 'Recommended approach', type: 'textarea', full: true, rows: 2 },
      { name: 'tradeOffs', label: 'Trade-offs', type: 'textarea', full: true, rows: 2 },
      { name: 'pocNotes', label: 'POC information', type: 'textarea', full: true, rows: 2 }
    ], estimateFields, [
      { type: 'section', label: 'Other' },
      { name: 'comments', label: 'Comments', type: 'textarea', full: true, rows: 2 },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
    ]);
  }

  function openItemForm(item, programmeId, options) {
    const opts = options || {};
    const isNew = !item;
    const quick = opts.quick === undefined ? isNew : opts.quick;
    const values = Object.assign({
      programmeId: programmeId || '',
      status: 'idea',
      priority: 'medium'
    }, item || {});

    const form = RM.form(itemFields(quick), values);
    const body = el('div', null, [form.element]);

    const footer = [
      RM.button('Cancel', function () { handle.close(); }),
      quick ? RM.button('More fields', function () { handle.close(); openItemForm(item, programmeId, { quick: false }); }) : null,
      RM.button(isNew ? 'Create system change' : 'Save changes', save, 'primary')
    ];

    const handle = RM.modal({
      title: isNew ? 'New system change' : 'Edit: ' + item.title,
      subtitle: quick ? 'Capture the essentials now - the rest can be completed later from More Info.' : 'All delivery detail for this change.',
      size: 'large',
      body: body,
      footer: footer
    });

    function save() {
      const record = Object.assign({}, item || {}, form.read());
      const request = isNew
        ? RM.api.create('roadmapItems', record)
        : RM.api.update('roadmapItems', item.id, record);
      request.then(function (response) {
        handle.close();
        RM.toast(isNew ? 'System change created.' : 'Changes saved.', 'success');
        return RM.refresh().then(function () {
          if (isNew && response.record) openDetail(response.record.id);
        });
      }).catch(function (err) {
        if (err && err.code === 'VALIDATION' && err.detail) form.showErrors(err.detail.errors);
        RM.handleError(err, 'Could not save the system change');
      });
    }
  }

  function deleteItem(item, handle) {
    const deps = RM.dependenciesFor(item.id);
    const linked = deps.dependsOn.length + deps.blocks.length;
    RM.confirm({
      title: 'Delete system change',
      message: 'Delete "' + item.title + '"?',
      detail: linked
        ? linked + ' dependency record(s) refer to this item and will be removed as well, so no orphan dependencies are left behind.'
        : null,
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
  /* More info                                                         */
  /* ---------------------------------------------------------------- */

  const TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'scope', label: 'Scope' },
    { id: 'dependencies', label: 'Dependencies' },
    { id: 'risks', label: 'Risks & Decisions' },
    { id: 'delivery', label: 'Delivery' },
    { id: 'resources', label: 'Resources' },
    { id: 'milestones', label: 'Milestones' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'history', label: 'History' }
  ];

  function openDetail(itemId, tabId) {
    const item = RM.itemById(itemId);
    if (!item) return RM.toast('That roadmap item no longer exists.', 'error');
    const programme = RM.programmeById(item.programmeId);
    let current = tabId || 'summary';

    const tabBar = el('div', 'tabs');
    const panel = el('div', 'tab-panel');

    TABS.forEach(function (tab) {
      const button = el('button', {
        class: 'tab' + (tab.id === current ? ' tab-active' : ''),
        type: 'button',
        onclick: function () {
          current = tab.id;
          Array.prototype.forEach.call(tabBar.children, function (child) {
            child.classList.toggle('tab-active', child.dataset.tab === tab.id);
          });
          drawPanel();
        },
        dataset: { tab: tab.id }
      }, tab.label);
      tabBar.appendChild(button);
    });

    const body = el('div', 'detail', [
      el('div', 'detail-hero', [
        el('div', null, [
          el('div', 'detail-eyebrow', programme ? programme.name : 'No programme'),
          el('h3', 'detail-title', item.title),
          item.businessOutcome ? el('p', 'detail-lede', item.businessOutcome) : null
        ]),
        el('div', 'detail-hero-meta', [
          item.systemArea ? el('span', 'pill', RM.options.name('systems', item.systemArea)) : null,
          RM.statusBadge(item.status),
          RM.priorityBadge(item.priority)
        ])
      ]),
      tabBar,
      panel
    ]);

    const handle = RM.modal({
      title: item.title,
      subtitle: programme ? programme.name : '',
      size: 'large',
      body: body,
      footer: [
        RM.button('Delete', function () { deleteItem(item, handle); }, 'danger'),
        el('span', 'foot-spacer'),
        RM.button('Close', function () { handle.close(); }),
        RM.button('Edit', function () { handle.close(); openItemForm(item, null, { quick: false }); }, 'primary')
      ]
    });

    drawPanel();

    function drawPanel() {
      RM.clear(panel);
      const fresh = RM.itemById(itemId) || item;
      panel.appendChild(buildTab(current, fresh, handle, drawPanel));
    }
  }

  function buildTab(tabId, item, handle, refreshPanel) {
    switch (tabId) {
      case 'scope': return scopeTab(item);
      case 'dependencies': return dependenciesTab(item, handle);
      case 'risks': return risksTab(item, refreshPanel);
      case 'delivery': return deliveryTab(item);
      case 'resources': return resourcesTab(item);
      case 'milestones': return milestonesTab(item, refreshPanel);
      case 'tickets': return ticketsTab(item, refreshPanel);
      case 'history': return historyTab(item);
      default: return summaryTab(item);
    }
  }

  function summaryTab(item) {
    const programme = RM.programmeById(item.programmeId);
    return el('div', 'stack', [
      el('dl', 'definition-grid', [
        RM.definition('Programme', programme ? programme.name : 'Not set'),
        RM.definition('System', RM.options.name('systems', item.systemArea)),
        RM.definition('Sub area', item.subArea),
        RM.definition('Type', RM.options.name('itemTypes', item.type)),
        RM.definition('Status', RM.options.name('statuses', item.status)),
        RM.definition('Priority', RM.options.name('priorities', item.priority)),
        RM.definition('Current phase', RM.options.name('milestoneTypes', item.currentPhase)),
        RM.definition('Start date', RM.dates.formatDate(item.startDate) || 'Not scheduled'),
        RM.definition('End date', RM.dates.formatDate(item.endDate) || 'Not scheduled'),
        RM.definition('Target date', RM.dates.formatDate(item.targetDate)),
        RM.definition('Business owner', item.businessOwner),
        RM.definition('Product owner', item.productOwner),
        RM.definition('Technical owner', item.technicalOwner),
        RM.definition('Delivery owner', item.deliveryOwner)
      ]),
      section('Description', RM.textBlock(item.description)),
      section('Business outcome', RM.textBlock(item.businessOutcome)),
      section('Problem statement', RM.textBlock(item.problemStatement)),
      section('Comments', RM.textBlock(item.comments, 'No comments.')),
      el('p', 'muted small', 'Last updated ' + RM.dates.formatDateTime(item.updatedAt) + (item.updatedBy ? ' by ' + item.updatedBy : ''))
    ]);
  }

  function scopeTab(item) {
    return el('div', 'stack', [
      section('Scope', RM.textBlock(item.scope)),
      section('Out of scope', RM.textBlock(item.outOfScope)),
      section('Assumptions', RM.textBlock(item.assumptions)),
      section('Notes', RM.textBlock(item.notes, 'No notes.'))
    ]);
  }

  function dependenciesTab(item, handle) {
    const deps = RM.dependenciesFor(item.id);
    const gates = item.gates || [];

    return el('div', 'stack', [
      el('div', 'section-head', [
        el('h4', null, 'Depends on'),
        RM.button('+ Add dependency', function () {
          RM.dependencyView.openForm(null, { toItemId: item.id });
        })
      ]),
      deps.dependsOn.length ? dependencyList(deps.dependsOn, 'fromItemId', handle) : el('p', 'muted', 'Nothing blocks this item.'),
      el('h4', null, 'Blocks'),
      deps.blocks.length ? dependencyList(deps.blocks, 'toItemId', handle) : el('p', 'muted', 'This item does not block anything.'),
      el('h4', null, 'Gates'),
      gates.length ? el('div', 'mini-list', gates.map(function (gate) {
        return el('div', 'mini-row', [
          el('span', 'mini-row-title', gate.title),
          el('span', 'mini-row-meta', [
            el('span', 'pill', gate.status || 'open'),
            gate.requiredByDate ? el('span', 'muted', 'Required by ' + RM.dates.formatDate(gate.requiredByDate)) : null
          ])
        ]);
      })) : el('p', 'muted', 'No gates recorded.'),
      section('System dependencies', RM.textBlock(item.systemDependencies)),
      section('Business dependencies', RM.textBlock(item.businessDependencies)),
      section('Data dependencies', RM.textBlock(item.dataDependencies))
    ]);

    function dependencyList(list, field, modalHandle) {
      return el('div', 'mini-list', list.map(function (dependency) {
        const otherId = dependency[field];
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

  function risksTab(item, refreshPanel) {
    const risks = item.risks || [];
    const gates = item.gates || [];

    return el('div', 'stack', [
      el('div', 'section-head', [el('h4', null, 'Risks'), RM.button('+ Add risk', function () { editRisk(item, null, refreshPanel); })]),
      risks.length ? el('div', 'card-list', risks.map(function (risk) {
        return el('div', 'card' + (risk.status !== 'closed' ? ' card-attention' : ''), [
          el('div', 'card-head', [
            el('strong', null, risk.title),
            el('span', 'card-actions', [
              el('button', { class: 'link-button', type: 'button', onclick: function () { editRisk(item, risk, refreshPanel); } }, 'Edit'),
              el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { removeChild(item, 'risks', risk, refreshPanel, risk.title); } }, 'Delete')
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

      el('div', 'section-head', [el('h4', null, 'Decisions & gates'), RM.button('+ Add decision / gate', function () { editGate(item, null, refreshPanel); })]),
      gates.length ? el('div', 'card-list', gates.map(function (gate) {
        return el('div', 'card' + (gate.status !== 'closed' && gate.status !== 'decided' ? ' card-attention' : ''), [
          el('div', 'card-head', [
            el('strong', null, gate.title),
            el('span', 'card-actions', [
              el('button', { class: 'link-button', type: 'button', onclick: function () { editGate(item, gate, refreshPanel); } }, 'Edit'),
              el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { removeChild(item, 'gates', gate, refreshPanel, gate.title); } }, 'Delete')
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

  function deliveryTab(item) {
    const resourceTypes = RM.options.active('resourceTypes');
    return el('div', 'stack', [
      el('div', 'compare-grid', [
        estimateCard('Fast MVP', (item.estimates || {}).fast, resourceTypes, 'compare-fast'),
        estimateCard('Standard delivery', (item.estimates || {}).standard, resourceTypes, 'compare-standard')
      ]),
      section('Recommended approach', RM.textBlock(item.recommendedApproach)),
      section('Trade-offs', RM.textBlock(item.tradeOffs)),
      section('POC information', RM.textBlock(item.pocNotes))
    ]);
  }

  function estimateCard(title, option, resourceTypes, modifier) {
    const days = (option && option.days) || {};
    const total = resourceTypes.reduce(function (sum, type) { return sum + (Number(days[type.id]) || 0); }, 0);
    return el('div', 'compare-card ' + modifier, [
      el('div', 'compare-head', [el('h4', null, title), el('span', 'compare-total', total + ' days')]),
      el('table', 'mini-table', [
        el('tbody', null, resourceTypes.map(function (type) {
          return el('tr', null, [
            el('td', null, type.name),
            el('td', 'numeric', String(Number(days[type.id]) || 0))
          ]);
        }))
      ]),
      el('dl', 'definition-grid definition-grid-tight', [
        RM.definition('Risk', option && option.risk, { full: true }),
        RM.definition('Notes', option && option.notes, { full: true })
      ])
    ]);
  }

  function resourcesTab(item) {
    const resourceTypes = RM.options.active('resourceTypes');
    const fast = ((item.estimates || {}).fast || {}).days || {};
    const standard = ((item.estimates || {}).standard || {}).days || {};
    return el('div', 'stack', [
      el('table', 'table', [
        el('thead', null, el('tr', null, [
          el('th', null, 'Resource'),
          el('th', 'numeric', 'Fast MVP (days)'),
          el('th', 'numeric', 'Standard (days)')
        ])),
        el('tbody', null, resourceTypes.map(function (type) {
          return el('tr', null, [
            el('td', null, type.name),
            el('td', 'numeric', String(Number(fast[type.id]) || 0)),
            el('td', 'numeric', String(Number(standard[type.id]) || 0))
          ]);
        }))
      ]),
      el('p', 'muted small', 'Effort is used by the Resources screen to show demand against the configured scenario capacity.')
    ]);
  }

  function milestonesTab(item, refreshPanel) {
    const milestones = (item.milestones || []).slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
    return el('div', 'stack', [
      el('div', 'section-head', [el('h4', null, 'Milestones'), RM.button('+ Add milestone', function () { editMilestone(item, null, refreshPanel); })]),
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
              el('button', { class: 'link-button', type: 'button', onclick: function () { editMilestone(item, milestone, refreshPanel); } }, 'Edit'),
              el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { removeChild(item, 'milestones', milestone, refreshPanel, milestone.name); } }, 'Delete')
            ])
          ]);
        }))
      ]) : el('p', 'muted', 'No milestones recorded. Milestones appear as markers on the roadmap.')
    ]);
  }

  function ticketsTab(item, refreshPanel) {
    const tickets = item.tickets || [];
    return el('div', 'stack', [
      el('div', 'section-head', [el('h4', null, 'Delivery tickets / stories'), RM.button('+ Add ticket', function () { editTicket(item, null, refreshPanel); })]),
      tickets.length ? el('div', 'card-list', tickets.map(function (ticket) {
        return el('div', 'card', [
          el('div', 'card-head', [
            el('strong', null, ticket.title),
            el('span', 'card-actions', [
              el('button', { class: 'link-button', type: 'button', onclick: function () { showTicket(item, ticket, refreshPanel); } }, 'Open'),
              el('button', { class: 'link-button link-danger', type: 'button', onclick: function () { removeChild(item, 'tickets', ticket, refreshPanel, ticket.title); } }, 'Delete')
            ])
          ]),
          el('div', 'card-meta', [
            el('span', 'pill', ticket.id),
            ticket.system ? el('span', 'pill', RM.options.name('systems', ticket.system)) : null,
            RM.statusBadge(ticket.status),
            ticket.owner ? el('span', 'muted', ticket.owner) : null,
            ticket.externalReference ? el('span', 'muted', 'Ref: ' + ticket.externalReference) : null
          ]),
          ticket.description ? el('p', null, ticket.description) : null
        ]);
      })) : el('p', 'muted', 'No tickets yet. Tickets are internal roadmap records - no Jira connection is needed.')
    ]);
  }

  function showTicket(item, ticket, refreshPanel) {
    const handle = RM.modal({
      title: ticket.title,
      subtitle: 'Ticket ' + ticket.id,
      size: 'medium',
      body: el('div', 'stack', [
        el('dl', 'definition-grid', [
          RM.definition('System', RM.options.name('systems', ticket.system)),
          RM.definition('Status', RM.options.name('statuses', ticket.status)),
          RM.definition('Owner', ticket.owner),
          RM.definition('External reference', ticket.externalReference)
        ]),
        section('Description', RM.textBlock(ticket.description)),
        section('Acceptance criteria', RM.textBlock(ticket.acceptanceCriteria)),
        section('Notes', RM.textBlock(ticket.notes, 'No notes.'))
      ]),
      footer: [
        RM.button('Close', function () { handle.close(); }),
        RM.button('Edit ticket', function () { handle.close(); editTicket(item, ticket, refreshPanel); }, 'primary')
      ]
    });
  }

  /* ---------------------------------------------------------------- */
  /* Nested collection editors                                         */
  /* ---------------------------------------------------------------- */

  function childEditor(config) {
    const item = config.item;
    const existing = config.existing;
    const form = RM.form(config.fields, existing || config.defaults || {});
    const handle = RM.modal({
      title: (existing ? 'Edit ' : 'Add ') + config.noun,
      subtitle: item.title,
      size: 'medium',
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
        { name: 'owner', label: 'Owner' },
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
        { name: 'owner', label: 'Owner' },
        { name: 'requiredByDate', label: 'Required by', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', allowEmpty: true, options: [{ value: 'open', label: 'Open' }, { value: 'decided', label: 'Decided' }, { value: 'closed', label: 'Closed' }] },
        { name: 'decisionDate', label: 'Decision date', type: 'date' },
        { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 2 },
        { name: 'decision', label: 'Decision', type: 'textarea', full: true, rows: 2 },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
      ]
    });
  }

  function editTicket(item, ticket, refreshPanel) {
    childEditor({
      item: item, existing: ticket, collection: 'tickets', prefix: 'TKT', noun: 'ticket',
      onSaved: refreshPanel,
      defaults: { roadmapItemId: item.id, status: 'ready', system: item.systemArea },
      fields: [
        { name: 'title', label: 'Title', required: true, full: true },
        { name: 'system', label: 'System', type: 'select', options: RM.selectOptions('systems') },
        { name: 'status', label: 'Status', type: 'select', options: RM.selectOptions('statuses') },
        { name: 'owner', label: 'Owner' },
        { name: 'externalReference', label: 'External reference', hint: 'Optional - e.g. a Jira number. There is no Jira integration.' },
        { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 3 },
        { name: 'acceptanceCriteria', label: 'Acceptance criteria', type: 'textarea', full: true, rows: 3 },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
      ]
    });
  }

  /* ---------------------------------------------------------------- */
  /* History                                                           */
  /* ---------------------------------------------------------------- */

  function historyTab(item) {
    const container = el('div', 'stack', [el('p', 'muted', 'Loading history...')]);
    RM.api.audit({ recordId: item.id, limit: 100 }).then(function (payload) {
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

  /** Shared audit renderer (also used by the Data screen). */
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

  function section(title, content) {
    return el('section', 'detail-section', [el('h4', null, title), content]);
  }

  RM.editor = {
    openProgrammeForm: openProgrammeForm,
    openProgrammeDetail: openProgrammeDetail,
    openItemForm: openItemForm,
    openDetail: openDetail,
    deleteItem: deleteItem,
    deleteProgramme: deleteProgramme,
    openHistory: openHistory,
    section: section
  };
}(window.RM));
