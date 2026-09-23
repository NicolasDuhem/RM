'use strict';

/**
 * Core application module: state, API access, shared UI helpers.
 * Everything else attaches to the single global RM namespace.
 */
window.RM = (function () {
  const RM = {};

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */

  RM.state = {
    programmes: { revision: 0, records: [] },
    roadmapItems: { revision: 0, records: [] },
    dependencies: { revision: 0, records: [] },
    backlog: { revision: 0, records: [] },
    resourceScenarios: { revision: 0, records: [] },
    settings: { revision: 0, settings: {} },
    health: null,
    ui: {
      view: 'roadmap',
      roadmapMode: 'detailed',
      timescale: 'month',
      showMilestones: true,
      collapsed: {},
      expandedItems: {},
      filters: emptyFilters(),
      editorName: ''
    }
  };

  function emptyFilters() {
    return {
      programme: '', system: '', status: '', owner: '', productOwner: '',
      priority: '', type: '', phase: '', stream: '', okr: '', dateFrom: '', dateTo: '', search: ''
    };
  }
  RM.emptyFilters = emptyFilters;

  RM.records = function (dataset) {
    const entry = RM.state[dataset];
    return entry ? (entry.records || []) : [];
  };
  RM.settings = function () { return RM.state.settings.settings || {}; };
  RM.revision = function (dataset) {
    const entry = RM.state[dataset];
    return entry ? entry.revision : 0;
  };

  /* ---------------------------------------------------------------- */
  /* Local (cosmetic) preferences - never the source of truth          */
  /* ---------------------------------------------------------------- */

  const PREF_KEY = 'roadmapTool.preferences';

  function loadPrefs() {
    try {
      const raw = window.localStorage.getItem(PREF_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) { return {}; }
  }

  function savePrefs() {
    try {
      const ui = RM.state.ui;
      window.localStorage.setItem(PREF_KEY, JSON.stringify({
        view: ui.view,
        roadmapMode: ui.roadmapMode,
        timescale: ui.timescale,
        showMilestones: ui.showMilestones,
        collapsed: ui.collapsed,
        expandedItems: ui.expandedItems,
        filters: ui.filters,
        editorName: ui.editorName
      }));
    } catch (err) { /* private browsing - preferences simply do not persist */ }
  }
  RM.savePrefs = savePrefs;

  /* ---------------------------------------------------------------- */
  /* DOM helpers                                                       */
  /* ---------------------------------------------------------------- */

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (typeof props === 'string') {
      node.className = props;
    } else if (props) {
      Object.keys(props).forEach(function (key) {
        const value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class' || key === 'className') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else if (key === 'dataset') Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, value);
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (child) { append(node, child); });
      return;
    }
    if (children instanceof Node) { node.appendChild(children); return; }
    node.appendChild(document.createTextNode(String(children)));
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  RM.el = el;
  RM.clear = clear;
  RM.append = append;

  /* ---------------------------------------------------------------- */
  /* Dates                                                             */
  /* ---------------------------------------------------------------- */

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function todayIso() {
    const d = new Date();
    return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function isoOf(year, month, day) {
    return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  /** Parses an ISO date as a local date (no timezone surprises). */
  function parseIso(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parts = value.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function toIso(date) {
    if (!date) return '';
    return isoOf(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function formatDate(value) {
    const d = parseIso(value);
    if (!d) return '';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  RM.dates = {
    MONTHS: MONTHS, todayIso: todayIso, parseIso: parseIso, toIso: toIso, isoOf: isoOf,
    formatDate: formatDate, formatDateTime: formatDateTime, addDays: addDays, daysBetween: daysBetween
  };

  /* ---------------------------------------------------------------- */
  /* Settings lookups                                                  */
  /* ---------------------------------------------------------------- */

  function optionList(name) {
    const list = RM.settings()[name];
    return Array.isArray(list) ? list : [];
  }

  function activeOptions(name) {
    return optionList(name).filter(function (o) { return o.active !== false; });
  }

  function optionFor(name, id) {
    if (!id) return null;
    return optionList(name).find(function (o) { return o.id === id; }) || null;
  }

  function optionName(name, id) {
    const option = optionFor(name, id);
    return option ? option.name : (id || '');
  }

  function optionColour(name, id, fallback) {
    const option = optionFor(name, id);
    return (option && option.colour) || fallback || '#64748b';
  }

  function optionNames(name, ids) {
    return (Array.isArray(ids) ? ids : (ids ? [ids] : [])).map(function (id) {
      return optionName(name, id);
    });
  }

  RM.options = {
    list: optionList, active: activeOptions, find: optionFor, name: optionName,
    names: optionNames, colour: optionColour
  };

  /* ---------------------------------------------------------------- */
  /* OKRs - two levels: objectives, each with its own key results      */
  /* ---------------------------------------------------------------- */

  RM.okrs = {
    objectives: function () {
      const list = RM.settings().okrs;
      return Array.isArray(list) ? list : [];
    },
    /** Flat list for pickers: objectives and their key results, in order. */
    flat: function () {
      const out = [];
      RM.okrs.objectives().forEach(function (objective) {
        if (objective.active === false) return;
        out.push({ id: objective.id, name: objective.name, level: 1, objective: objective.name });
        (objective.children || []).forEach(function (keyResult) {
          if (keyResult.active === false) return;
          out.push({ id: keyResult.id, name: keyResult.name, level: 2, objective: objective.name });
        });
      });
      return out;
    },
    find: function (id) {
      let found = null;
      RM.okrs.objectives().forEach(function (objective) {
        if (objective.id === id) found = { id: id, name: objective.name, level: 1, objective: objective.name };
        (objective.children || []).forEach(function (keyResult) {
          if (keyResult.id === id) found = { id: id, name: keyResult.name, level: 2, objective: objective.name };
        });
      });
      return found;
    },
    label: function (id) {
      const found = RM.okrs.find(id);
      if (!found) return id;
      return found.level === 2 ? found.objective + ' / ' + found.name : found.name;
    },
    shortLabel: function (id) {
      const found = RM.okrs.find(id);
      return found ? found.name : id;
    }
  };

  /* ---------------------------------------------------------------- */
  /* Effort - defined on tasks, rolled up to changes and programmes    */
  /* ---------------------------------------------------------------- */

  RM.effort = {
    resourceTypes: function () { return activeOptions('resourceTypes'); },

    /** Days per resource type for one task. */
    ofTask: function (task) {
      const days = (task && task.days) || {};
      const out = {};
      RM.effort.resourceTypes().forEach(function (type) {
        out[type.id] = Number(days[type.id]) || 0;
      });
      return out;
    },

    /** Days per resource type for a system change, summed from its tasks. */
    ofItem: function (item) {
      const out = {};
      RM.effort.resourceTypes().forEach(function (type) { out[type.id] = 0; });
      ((item && item.tasks) || []).forEach(function (task) {
        const days = RM.effort.ofTask(task);
        Object.keys(out).forEach(function (typeId) { out[typeId] += days[typeId] || 0; });
      });
      return out;
    },

    /** Days per resource type for a programme, summed from its changes. */
    ofProgramme: function (programmeId) {
      const out = {};
      RM.effort.resourceTypes().forEach(function (type) { out[type.id] = 0; });
      RM.itemsForProgramme(programmeId).forEach(function (item) {
        const days = RM.effort.ofItem(item);
        Object.keys(out).forEach(function (typeId) { out[typeId] += days[typeId] || 0; });
      });
      return out;
    },

    /** Days held in one of the item's Fast MVP / Standard estimates. */
    ofEstimate: function (item, mode) {
      const estimate = ((item && item.estimates) || {})[mode] || {};
      const days = estimate.days || {};
      const out = {};
      RM.effort.resourceTypes().forEach(function (type) { out[type.id] = Number(days[type.id]) || 0; });
      return out;
    },

    total: function (days) {
      return Object.keys(days || {}).reduce(function (sum, key) { return sum + (Number(days[key]) || 0); }, 0);
    },

    format: function (value) {
      return String(Math.round((Number(value) || 0) * 10) / 10);
    }
  };

  /** The stream a task belongs to: its own, or the one on its system change. */
  RM.streamOf = function (item, task) {
    return (task && task.stream) || (item && item.stream) || '';
  };

  RM.statusBadge = function (statusId) {
    if (!statusId) return el('span', 'badge badge-empty', 'Not set');
    const colour = optionColour('statuses', statusId, '#64748b');
    return el('span', { class: 'badge', style: { background: fade(colour), color: colour, borderColor: fade(colour, 0.35) } }, optionName('statuses', statusId));
  };

  RM.priorityBadge = function (priorityId) {
    if (!priorityId) return null;
    const colour = optionColour('priorities', priorityId, '#64748b');
    return el('span', { class: 'badge badge-outline', style: { color: colour, borderColor: fade(colour, 0.4) } }, optionName('priorities', priorityId));
  };

  function fade(hex, alpha) {
    const value = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!value) return 'rgba(100,116,139,0.12)';
    const int = parseInt(value[1], 16);
    return 'rgba(' + ((int >> 16) & 255) + ',' + ((int >> 8) & 255) + ',' + (int & 255) + ',' + (alpha === undefined ? 0.12 : alpha) + ')';
  }
  RM.fade = fade;

  /* ---------------------------------------------------------------- */
  /* API                                                               */
  /* ---------------------------------------------------------------- */

  function request(method, path, body) {
    const options = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) options.body = JSON.stringify(body);
    return fetch(path, options).then(function (response) {
      const type = response.headers.get('Content-Type') || '';
      if (type.indexOf('application/json') < 0) {
        if (!response.ok) throw { code: 'HTTP_' + response.status, message: 'The server returned an unexpected response.' };
        return response.text();
      }
      return response.json().then(function (payload) {
        if (!response.ok) {
          throw (payload && payload.error) || { code: 'ERROR', message: 'Something went wrong.' };
        }
        return payload;
      });
    }, function () {
      throw {
        code: 'OFFLINE',
        message: 'The application could not reach the Roadmap server. Check that the start.bat window is still open.'
      };
    });
  }

  RM.api = {
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body); },

    bootstrap: function () { return request('GET', '/api/bootstrap'); },

    create: function (dataset, record, extra) {
      return request('POST', '/api/dataset/' + dataset + '/create', Object.assign({
        revision: RM.revision(dataset), record: record, editor: RM.editorName()
      }, extra || {}));
    },
    update: function (dataset, id, record, extra) {
      return request('POST', '/api/dataset/' + dataset + '/update', Object.assign({
        revision: RM.revision(dataset), id: id, record: record, editor: RM.editorName()
      }, extra || {}));
    },
    remove: function (dataset, id, extra) {
      return request('POST', '/api/dataset/' + dataset + '/delete', Object.assign({
        revision: RM.revision(dataset), id: id, editor: RM.editorName(),
        revisions: { dependencies: RM.revision('dependencies') }
      }, extra || {}));
    },
    deleteProgramme: function (id, cascade) {
      return request('POST', '/api/programmes/delete', {
        id: id, cascade: !!cascade, editor: RM.editorName(),
        revisions: {
          programmes: RM.revision('programmes'),
          roadmapItems: RM.revision('roadmapItems'),
          dependencies: RM.revision('dependencies'),
          backlog: RM.revision('backlog')
        }
      });
    },
    promoteBacklog: function (payload) {
      return request('POST', '/api/backlog/promote', Object.assign({
        editor: RM.editorName(),
        revisions: {
          programmes: RM.revision('programmes'),
          roadmapItems: RM.revision('roadmapItems'),
          backlog: RM.revision('backlog')
        }
      }, payload));
    },
    saveSettings: function (settings) {
      return request('POST', '/api/settings/save', {
        revision: RM.revision('settings'), settings: settings, editor: RM.editorName(),
        password: RM.settingsLock.password()
      });
    },
    audit: function (params) {
      const query = Object.keys(params || {})
        .filter(function (k) { return params[k]; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&');
      return request('GET', '/api/audit' + (query ? '?' + query : ''));
    },
    backups: function (dataset) {
      return request('GET', '/api/backups' + (dataset ? '?dataset=' + encodeURIComponent(dataset) : ''));
    },
    createBackup: function (dataset) {
      return request('POST', '/api/backups/create', { dataset: dataset || null, editor: RM.editorName() });
    },
    restoreBackup: function (file) {
      return request('POST', '/api/backups/restore', { file: file, editor: RM.editorName() });
    },
    importBundle: function (bundle, includeSettings) {
      return request('POST', '/api/import/json', { bundle: bundle, includeSettings: includeSettings !== false, editor: RM.editorName() });
    },
    importCsv: function (dataset, text, mode) {
      return request('POST', '/api/import/csv', { dataset: dataset, csv: text, mode: mode, editor: RM.editorName() });
    },
    sample: function (mode) {
      return request('POST', '/api/sample', { mode: mode, editor: RM.editorName() });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Data loading                                                      */
  /* ---------------------------------------------------------------- */

  RM.reload = function () {
    return RM.api.bootstrap().then(function (payload) {
      RM.state.health = payload.health;
      if (!payload.datasets) return payload;
      Object.keys(payload.datasets).forEach(function (name) {
        RM.state[name] = payload.datasets[name];
      });
      return payload;
    });
  };

  RM.refresh = function () {
    return RM.reload().then(function () { RM.renderView(); });
  };

  /* ---------------------------------------------------------------- */
  /* Editor name (cosmetic identity only, not security)                */
  /* ---------------------------------------------------------------- */

  RM.editorName = function () {
    return RM.state.ui.editorName || 'Unknown';
  };

  RM.setEditorName = function (name) {
    RM.state.ui.editorName = String(name || '').trim();
    savePrefs();
    const label = document.getElementById('editor-name');
    if (label) label.textContent = RM.state.ui.editorName || 'Set your name';
  };

  RM.askEditorName = function (force) {
    const current = RM.state.ui.editorName;
    if (current && !force) return Promise.resolve(current);
    return RM.prompt({
      title: 'Your name',
      message: 'Edits are labelled with your name so everybody can see who changed what. This is not a login - it is only a label.',
      label: 'Name',
      value: current,
      confirmLabel: 'Save'
    }).then(function (value) {
      if (value) RM.setEditorName(value);
      return RM.state.ui.editorName;
    });
  };

  /* ---------------------------------------------------------------- */
  /* Toasts                                                            */
  /* ---------------------------------------------------------------- */

  RM.toast = function (message, kind) {
    const host = document.getElementById('toast-host');
    if (!host) return;
    const node = el('div', 'toast toast-' + (kind || 'info'), [
      el('span', 'toast-text', message),
      el('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss', onclick: function () { node.remove(); } }, '×')
    ]);
    host.appendChild(node);
    window.setTimeout(function () { node.classList.add('toast-out'); }, 4200);
    window.setTimeout(function () { node.remove(); }, 4800);
  };

  /* ---------------------------------------------------------------- */
  /* Modals                                                            */
  /* ---------------------------------------------------------------- */

  const modalStack = [];

  RM.modal = function (config) {
    const host = document.getElementById('modal-host');
    const overlay = el('div', 'modal-overlay');
    const dialog = el('div', 'modal modal-' + (config.size || 'medium'), [
      el('div', 'modal-head', [
        el('div', 'modal-titles', [
          el('h2', 'modal-title', config.title || ''),
          config.subtitle ? el('p', 'modal-subtitle', config.subtitle) : null
        ]),
        el('button', { class: 'icon-button', type: 'button', 'aria-label': 'Close', onclick: close }, '×')
      ]),
      el('div', 'modal-body', config.body || null),
      config.footer === null ? null : el('div', 'modal-foot', config.footer || [])
    ]);
    overlay.appendChild(dialog);
    overlay.addEventListener('mousedown', function (event) {
      if (event.target === overlay && config.dismissible !== false) close();
    });
    host.appendChild(overlay);
    modalStack.push({ overlay: overlay, onClose: config.onClose, dismissible: config.dismissible !== false });
    document.body.classList.add('modal-open');

    const focusable = dialog.querySelector('input, textarea, select, button.button-primary');
    if (focusable) window.setTimeout(function () { focusable.focus(); }, 30);

    function close() {
      const index = modalStack.findIndex(function (entry) { return entry.overlay === overlay; });
      if (index >= 0) modalStack.splice(index, 1);
      overlay.remove();
      if (modalStack.length === 0) document.body.classList.remove('modal-open');
      if (config.onClose) config.onClose();
    }

    return { close: close, dialog: dialog, body: dialog.querySelector('.modal-body') };
  };

  document.addEventListener('keydown', function (event) {
    // Escape never discards a panel that is holding unsaved edits.
    if (event.key !== 'Escape' || !modalStack.length) return;
    const top = modalStack[modalStack.length - 1];
    if (!top.dismissible) return;
    top.overlay.querySelector('.icon-button').click();
  });

  RM.confirm = function (config) {
    return new Promise(function (resolve) {
      let settled = false;
      const handle = RM.modal({
        title: config.title || 'Please confirm',
        size: 'small',
        body: el('div', 'stack', [
          el('p', 'lede', config.message || ''),
          config.detail ? el('div', 'callout callout-warn', config.detail) : null
        ]),
        footer: [
          el('button', { class: 'button', type: 'button', onclick: function () { finish(false); } }, config.cancelLabel || 'Cancel'),
          el('button', {
            class: 'button ' + (config.danger ? 'button-danger' : 'button-primary'),
            type: 'button',
            onclick: function () { finish(true); }
          }, config.confirmLabel || 'Confirm')
        ],
        onClose: function () { if (!settled) { settled = true; resolve(false); } }
      });
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        handle.close();
      }
    });
  };

  RM.prompt = function (config) {
    return new Promise(function (resolve) {
      let settled = false;
      const input = el('input', { class: 'input', type: 'text', value: config.value || '', placeholder: config.placeholder || '' });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); finish(input.value.trim()); }
      });
      const handle = RM.modal({
        title: config.title || '',
        size: 'small',
        body: el('div', 'stack', [
          config.message ? el('p', 'lede', config.message) : null,
          el('label', 'field', [el('span', 'field-label', config.label || ''), input])
        ]),
        footer: [
          el('button', { class: 'button', type: 'button', onclick: function () { finish(null); } }, 'Cancel'),
          el('button', { class: 'button button-primary', type: 'button', onclick: function () { finish(input.value.trim()); } }, config.confirmLabel || 'Save')
        ],
        onClose: function () { if (!settled) { settled = true; resolve(null); } }
      });
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        handle.close();
      }
    });
  };

  /* ---------------------------------------------------------------- */
  /* Error handling                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Turns an API error into something a normal user can act on.
   * A revision conflict always offers "Reload latest" - never a silent write.
   */
  RM.handleError = function (err, context) {
    const error = err || {};
    if (error.code === 'CONFLICT') {
      RM.confirm({
        title: 'This roadmap has changed',
        message: 'This roadmap has changed since you opened this record. Reload the latest version before saving your changes.',
        detail: 'Nothing has been overwritten. Your unsaved edits in this form will be lost when you reload.',
        confirmLabel: 'Reload latest',
        cancelLabel: 'Cancel'
      }).then(function (reload) {
        if (reload) {
          // The open form is based on data that no longer exists, so it goes
          // with the reload - otherwise a second save would just conflict again.
          RM.closeAllModals();
          RM.refresh().then(function () { RM.toast('Reloaded the latest roadmap data.', 'info'); });
        }
      });
      return;
    }

    if (error.code === 'VALIDATION') {
      const problems = ((error.detail && error.detail.errors) || []).concat((error.detail && error.detail.warnings) || []);
      RM.modal({
        title: 'Please check the details',
        size: 'small',
        body: el('div', 'stack', [
          el('p', 'lede', error.message || 'Some of the information could not be saved.'),
          el('ul', 'error-list', problems.map(function (problem) {
            return el('li', null, problem.message);
          }))
        ]),
        footer: [el('button', { class: 'button button-primary', type: 'button', onclick: function () { closeTop(); } }, 'Close')]
      });
      return;
    }

    RM.toast((context ? context + ': ' : '') + (error.message || 'Something went wrong.'), 'error');
  };

  function closeTop() {
    if (modalStack.length) modalStack[modalStack.length - 1].overlay.querySelector('.icon-button').click();
  }
  RM.closeTopModal = closeTop;

  function closeAllModals() {
    while (modalStack.length) closeTop();
  }
  RM.closeAllModals = closeAllModals;

  /* ---------------------------------------------------------------- */
  /* Forms                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Builds a form from a field description and hands back a read() function.
   * Fields never save on keystroke - saving is always an explicit action.
   */
  RM.form = function (fields, values) {
    const data = values || {};
    const inputs = {};
    const wrapper = el('div', 'form-grid');

    fields.forEach(function (field) {
      if (field.type === 'section') {
        wrapper.appendChild(el('h3', 'form-section', field.label));
        return;
      }
      const id = 'f_' + field.name + '_' + Math.random().toString(36).slice(2, 7);
      const value = get(data, field.name);
      let input;

      if (field.type === 'textarea') {
        input = el('textarea', { class: 'input textarea', id: id, rows: field.rows || 3, placeholder: field.placeholder || '' });
        input.value = value === undefined || value === null ? '' : String(value);
      } else if (field.type === 'select') {
        input = el('select', { class: 'input select', id: id });
        const options = typeof field.options === 'function' ? field.options() : (field.options || []);
        if (!field.required || field.allowEmpty !== false) {
          input.appendChild(el('option', { value: '' }, field.emptyLabel || '- none -'));
        }
        options.forEach(function (option) {
          const opt = el('option', { value: option.value }, option.label);
          input.appendChild(opt);
        });
        input.value = value === undefined || value === null ? '' : String(value);
        if (input.value !== String(value === undefined || value === null ? '' : value)) {
          // The stored value is no longer in the list (e.g. deactivated) - keep it visible.
          input.appendChild(el('option', { value: value }, String(value) + ' (not in settings)'));
          input.value = value;
        }
      } else if (field.type === 'multiselect') {
        const multi = RM.multiSelect({
          values: Array.isArray(value) ? value : (value ? [value] : []),
          options: field.options,
          label: field.optionLabel || (field.list ? function (id) { return optionName(field.list, id); } : null),
          placeholder: field.placeholder
        });
        input = multi.element;
        input.dataset.multiselect = 'yes';
        input.multiSelect = multi;
      } else if (field.type === 'checkbox') {
        input = el('input', { class: 'checkbox', type: 'checkbox', id: id });
        input.checked = !!value;
      } else {
        input = el('input', {
          class: 'input', id: id,
          type: field.type || 'text',
          placeholder: field.placeholder || '',
          step: field.step, min: field.min, max: field.max
        });
        input.value = value === undefined || value === null ? '' : String(value);
      }

      inputs[field.name] = { input: input, field: field };

      const control = el('div', {
        class: 'field' + (field.full ? ' field-full' : '') + (field.type === 'checkbox' ? ' field-inline' : '')
      }, [
        el('label', { class: 'field-label', for: id }, field.label + (field.required ? ' *' : '')),
        input,
        field.hint ? el('span', 'field-hint', field.hint) : null,
        el('span', 'field-error')
      ]);
      wrapper.appendChild(control);
    });

    function read() {
      const out = {};
      Object.keys(inputs).forEach(function (name) {
        const entry = inputs[name];
        let value;
        if (entry.field.type === 'checkbox') value = entry.input.checked;
        else if (entry.field.type === 'multiselect') value = entry.input.multiSelect.read();
        else if (entry.field.type === 'number') value = entry.input.value === '' ? '' : Number(entry.input.value);
        else value = entry.input.value;
        set(out, name, value);
      });
      return out;
    }

    function showErrors(errors) {
      Object.keys(inputs).forEach(function (name) {
        const control = inputs[name].input.closest('.field');
        if (control) {
          control.classList.remove('field-invalid');
          const slot = control.querySelector('.field-error');
          if (slot) slot.textContent = '';
        }
      });
      (errors || []).forEach(function (error) {
        const entry = inputs[error.field];
        if (!entry) return;
        const control = entry.input.closest('.field');
        if (!control) return;
        control.classList.add('field-invalid');
        const slot = control.querySelector('.field-error');
        if (slot) slot.textContent = error.message;
      });
    }

    function focusFirst() {
      const first = wrapper.querySelector('input, textarea, select');
      if (first) first.focus();
    }

    return { element: wrapper, read: read, showErrors: showErrors, inputs: inputs, focus: focusFirst };
  };

  function get(object, path) {
    return String(path).split('.').reduce(function (acc, key) {
      return (acc && typeof acc === 'object') ? acc[key] : undefined;
    }, object);
  }

  function set(object, path, value) {
    const parts = String(path).split('.');
    let node = object;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
    return object;
  }
  RM.get = get;
  RM.set = set;

  RM.selectOptions = function (listName) {
    return function () {
      return RM.options.active(listName).map(function (option) {
        return { value: option.id, label: option.name };
      });
    };
  };

  /* ---------------------------------------------------------------- */
  /* Multi-select                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * A compact multi-select: the chosen values show as chips, and a popover
   * holds the checkboxes. The popover is positioned fixed so it is never
   * clipped by a scrolling modal.
   */
  RM.multiSelect = function (config) {
    let selected = (config.values || []).slice();
    const chips = el('div', 'ms-chips');
    const control = el('button', { class: 'input ms-control', type: 'button', onclick: open }, [
      chips, el('span', 'ms-caret', '\u25be')
    ]);
    const wrapper = el('div', 'ms', control);
    let panel = null;

    draw();
    return {
      element: wrapper,
      read: function () { return selected.slice(); },
      set: function (values) { selected = (values || []).slice(); draw(); }
    };

    function draw() {
      clear(chips);
      if (!selected.length) {
        chips.appendChild(el('span', 'ms-placeholder', config.placeholder || 'None selected'));
        return;
      }
      selected.forEach(function (id) {
        chips.appendChild(el('span', 'ms-chip', config.label ? config.label(id) : id));
      });
    }

    function open(event) {
      event.stopPropagation();
      if (panel) return close();
      const options = typeof config.options === 'function' ? config.options() : (config.options || []);
      const box = control.getBoundingClientRect();
      panel = el('div', {
        class: 'ms-panel',
        style: { left: Math.round(box.left) + 'px', top: Math.round(box.bottom + 4) + 'px', minWidth: Math.round(box.width) + 'px' }
      }, options.length ? options.map(function (option) {
        const input = el('input', { class: 'checkbox', type: 'checkbox' });
        input.checked = selected.indexOf(option.value) >= 0;
        input.addEventListener('change', function () {
          if (input.checked) {
            if (selected.indexOf(option.value) < 0) selected.push(option.value);
          } else {
            selected = selected.filter(function (id) { return id !== option.value; });
          }
          draw();
          if (config.onChange) config.onChange(selected.slice());
        });
        return el('label', 'ms-option' + (option.level === 2 ? ' ms-option-child' : '') + (option.level === 1 ? ' ms-option-parent' : ''), [input, el('span', null, option.label)]);
      }) : el('p', 'muted small', 'Nothing to choose from - add entries in Settings.'));

      document.body.appendChild(panel);
      const panelBox = panel.getBoundingClientRect();
      if (panelBox.bottom > window.innerHeight - 10) {
        panel.style.top = Math.max(10, Math.round(box.top - panelBox.height - 4)) + 'px';
      }
      window.setTimeout(function () { document.addEventListener('mousedown', onOutside); }, 0);
    }

    function onOutside(event) {
      if (panel && (panel.contains(event.target) || control.contains(event.target))) return;
      close();
    }

    function close() {
      document.removeEventListener('mousedown', onOutside);
      if (panel) { panel.remove(); panel = null; }
    }
  };

  /* ---------------------------------------------------------------- */
  /* Settings password                                                 */
  /* ---------------------------------------------------------------- */

  const UNLOCK_KEY = 'roadmapTool.settingsUnlocked';

  RM.settingsLock = {
    /** Unlocking lasts for this browser tab only - never remembered on disk. */
    isUnlocked: function () {
      try { return window.sessionStorage.getItem(UNLOCK_KEY) === 'yes'; } catch (err) { return false; }
    },
    password: function () {
      try { return window.sessionStorage.getItem(UNLOCK_KEY + '.value') || ''; } catch (err) { return ''; }
    },
    remember: function (password) {
      try {
        window.sessionStorage.setItem(UNLOCK_KEY, 'yes');
        window.sessionStorage.setItem(UNLOCK_KEY + '.value', password);
      } catch (err) { /* private browsing - the password is asked for again */ }
    },
    forget: function () {
      try {
        window.sessionStorage.removeItem(UNLOCK_KEY);
        window.sessionStorage.removeItem(UNLOCK_KEY + '.value');
      } catch (err) { /* nothing to forget */ }
    },
    /** Asks the server, so the password is not simply compared in the page. */
    unlock: function (password) {
      return RM.api.post('/api/settings/unlock', { password: password }).then(function (response) {
        if (response.ok) RM.settingsLock.remember(password);
        return response;
      });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Shared data helpers                                               */
  /* ---------------------------------------------------------------- */

  RM.programmeById = function (id) {
    return RM.records('programmes').find(function (p) { return p.id === id; }) || null;
  };

  RM.itemById = function (id) {
    return RM.records('roadmapItems').find(function (i) { return i.id === id; }) || null;
  };

  RM.itemsForProgramme = function (programmeId) {
    return RM.records('roadmapItems').filter(function (i) { return i.programmeId === programmeId; });
  };

  /** Programme dates are always derived from their children, never stored. */
  RM.programmeRange = function (programmeId, items) {
    const children = items || RM.itemsForProgramme(programmeId);
    let start = '';
    let end = '';
    children.forEach(function (child) {
      if (child.startDate && (!start || child.startDate < start)) start = child.startDate;
      if (child.endDate && (!end || child.endDate > end)) end = child.endDate;
    });
    return { startDate: start, endDate: end, scheduled: !!(start && end) };
  };

  RM.dependenciesFor = function (itemId) {
    const all = RM.records('dependencies');
    return {
      dependsOn: all.filter(function (d) { return d.toItemId === itemId; }),
      blocks: all.filter(function (d) { return d.fromItemId === itemId; })
    };
  };

  RM.itemLabel = function (itemId) {
    const item = RM.itemById(itemId);
    return item ? item.title : itemId;
  };

  /**
   * Options for every "who owns this" dropdown. The list is maintained in
   * Settings; names already stored but no longer in the list are kept so
   * nothing silently disappears from an old record.
   */
  RM.peopleOptions = function () {
    const names = [];
    const seen = new Set();
    activeOptions('people').forEach(function (person) {
      if (seen.has(person.name)) return;
      seen.add(person.name);
      names.push(person.name);
    });
    RM.ownersInUse().forEach(function (name) {
      if (seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
    return names.map(function (name) { return { value: name, label: name }; });
  };

  RM.ownersInUse = function () {
    const owners = new Set();
    RM.records('roadmapItems').forEach(function (item) {
      ['owner', 'businessOwner', 'productOwner', 'technicalOwner', 'deliveryOwner'].forEach(function (field) {
        if (item[field]) owners.add(item[field]);
      });
      (item.tasks || []).forEach(function (task) { if (task.owner) owners.add(task.owner); });
      (item.risks || []).forEach(function (risk) { if (risk.owner) owners.add(risk.owner); });
      (item.gates || []).forEach(function (gate) { if (gate.owner) owners.add(gate.owner); });
    });
    RM.records('programmes').forEach(function (p) { if (p.owner) owners.add(p.owner); });
    RM.records('backlog').forEach(function (b) { if (b.owner) owners.add(b.owner); });
    RM.records('dependencies').forEach(function (d) { if (d.owner) owners.add(d.owner); });
    return Array.from(owners).sort(function (a, b) { return a.localeCompare(b); });
  };

  RM.productOwnersInUse = function () {
    const owners = new Set();
    RM.records('roadmapItems').forEach(function (item) {
      if (item.productOwner) owners.add(item.productOwner);
    });
    return Array.from(owners).sort(function (a, b) { return a.localeCompare(b); });
  };

  RM.nextChildId = function (prefix, existing) {
    let max = 0;
    const pattern = new RegExp('^' + prefix + '-(\\d+)$');
    (existing || []).forEach(function (record) {
      const match = pattern.exec(String(record && record.id ? record.id : ''));
      if (match) max = Math.max(max, parseInt(match[1], 10));
    });
    // Child ids are unique across the whole roadmap, not just within one item.
    RM.records('roadmapItems').forEach(function (item) {
      ['milestones', 'risks', 'gates', 'tasks'].forEach(function (collection) {
        (item[collection] || []).forEach(function (child) {
          const match = pattern.exec(String(child.id || ''));
          if (match) max = Math.max(max, parseInt(match[1], 10));
        });
      });
    });
    return prefix + '-' + String(max + 1).padStart(4, '0');
  };

  /* ---------------------------------------------------------------- */
  /* Filtering                                                         */
  /* ---------------------------------------------------------------- */

  RM.filtersActive = function () {
    const filters = RM.state.ui.filters;
    return Object.keys(filters).some(function (key) { return filters[key]; });
  };

  RM.matchesFilters = function (item) {
    const filters = RM.state.ui.filters;
    if (filters.programme && item.programmeId !== filters.programme) return false;
    if (filters.system && (item.systemAreas || []).indexOf(filters.system) < 0) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.type && (item.types || []).indexOf(filters.type) < 0) return false;
    if (filters.stream && !itemUsesStream(item, filters.stream)) return false;
    if (filters.okr && !itemUsesOkr(item, filters.okr)) return false;
    if (filters.phase && item.currentPhase !== filters.phase) return false;
    if (filters.productOwner && item.productOwner !== filters.productOwner) return false;
    if (filters.owner) {
      const owners = [item.owner, item.businessOwner, item.productOwner, item.technicalOwner, item.deliveryOwner];
      if (owners.indexOf(filters.owner) < 0) return false;
    }
    if (filters.dateFrom && item.endDate && item.endDate < filters.dateFrom) return false;
    if (filters.dateTo && item.startDate && item.startDate > filters.dateTo) return false;
    if (filters.search && !matchesSearch(item, filters.search)) return false;
    return true;
  };

  function itemUsesStream(item, streamId) {
    if (item.stream === streamId) return true;
    return (item.tasks || []).some(function (task) { return RM.streamOf(item, task) === streamId; });
  }

  function itemUsesOkr(item, okrId) {
    return (item.tasks || []).some(function (task) { return (task.okrIds || []).indexOf(okrId) >= 0; });
  }

  function matchesSearch(item, term) {
    const needle = term.toLowerCase();
    const programme = RM.programmeById(item.programmeId);
    const haystack = [
      item.title, item.shortTitle, item.description, item.businessOutcome,
      item.notes, item.comments, item.owner, item.businessOwner, item.productOwner,
      item.technicalOwner, item.deliveryOwner, item.subArea,
      RM.options.names('systems', item.systemAreas).join(' '),
      RM.options.name('resourceStreams', item.stream),
      (item.tasks || []).map(function (task) { return task.name + ' ' + (task.owner || '') + ' ' + (task.description || ''); }).join(' '),
      programme ? programme.name : '', programme ? programme.description : ''
    ].join(' ').toLowerCase();
    return haystack.indexOf(needle) >= 0;
  }
  RM.matchesSearch = matchesSearch;

  /* ---------------------------------------------------------------- */
  /* Views                                                             */
  /* ---------------------------------------------------------------- */

  RM.views = {};

  RM.registerView = function (name, render) {
    RM.views[name] = render;
  };

  RM.setView = function (name) {
    if (!RM.views[name]) name = 'roadmap';
    RM.state.ui.view = name;
    savePrefs();
    Array.prototype.forEach.call(document.querySelectorAll('.nav-link'), function (link) {
      link.classList.toggle('nav-link-active', link.dataset.view === name);
    });
    RM.renderView();
  };

  RM.renderView = function () {
    const root = document.getElementById('view-root');
    if (!root) return;
    clear(root);
    const render = RM.views[RM.state.ui.view] || RM.views.roadmap;
    try {
      render(root);
    } catch (err) {
      root.appendChild(el('div', 'callout callout-error', 'This screen could not be drawn: ' + err.message));
      if (window.console) window.console.error(err);
    }
    root.scrollTop = 0;
  };

  /* ---------------------------------------------------------------- */
  /* Small shared UI pieces                                            */
  /* ---------------------------------------------------------------- */

  RM.pageHeader = function (title, description, actions) {
    return el('header', 'page-head', [
      el('div', null, [
        el('h1', 'page-title', title),
        description ? el('p', 'page-description', description) : null
      ]),
      actions ? el('div', 'page-actions', actions) : null
    ]);
  };

  RM.emptyState = function (title, message, action) {
    return el('div', 'empty-state', [
      el('h3', null, title),
      el('p', null, message),
      action || null
    ]);
  };

  RM.button = function (label, onClick, kind) {
    return el('button', { class: 'button ' + (kind ? 'button-' + kind : ''), type: 'button', onclick: onClick }, label);
  };

  RM.definition = function (label, value, options) {
    const opts = options || {};
    return el('div', 'definition' + (opts.full ? ' definition-full' : ''), [
      el('dt', null, label),
      el('dd', opts.muted && !value ? 'muted' : null, value || (opts.placeholder || 'Not set'))
    ]);
  };

  RM.textBlock = function (value, placeholder) {
    if (!value) return el('p', 'muted', placeholder || 'Not captured yet.');
    return el('div', 'text-block', String(value).split(/\n{2,}/).map(function (paragraph) {
      return el('p', null, paragraph.split('\n').reduce(function (acc, line, index) {
        if (index > 0) acc.push(el('br'));
        acc.push(document.createTextNode(line));
        return acc;
      }, []));
    }));
  };

  RM.downloadFile = function (fileName, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    const href = URL.createObjectURL(blob);
    const link = el('a', { href: href, download: fileName });
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(href); link.remove(); }, 0);
  };

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  RM.boot = function () {
    const prefs = loadPrefs();
    const ui = RM.state.ui;
    if (prefs.collapsed) ui.collapsed = prefs.collapsed;
    if (prefs.expandedItems) ui.expandedItems = prefs.expandedItems;
    if (prefs.filters) ui.filters = Object.assign(emptyFilters(), prefs.filters);
    if (prefs.editorName) ui.editorName = prefs.editorName;
    if (prefs.roadmapMode) ui.roadmapMode = prefs.roadmapMode;
    if (prefs.timescale) ui.timescale = prefs.timescale;
    if (prefs.showMilestones !== undefined) ui.showMilestones = prefs.showMilestones;

    document.getElementById('editor-name').textContent = ui.editorName || 'Set your name';
    document.getElementById('editor-button').addEventListener('click', function () {
      RM.askEditorName(true);
    });

    Array.prototype.forEach.call(document.querySelectorAll('.nav-link'), function (link) {
      link.addEventListener('click', function () { RM.setView(link.dataset.view); });
    });

    RM.reload().then(function (payload) {
      const settings = RM.settings();
      document.title = (settings.appName || 'Roadmap Tool');
      const brand = document.getElementById('brand-name');
      if (brand) brand.textContent = settings.appName || 'Roadmap Tool';

      if (payload.health && !payload.health.ok) {
        showHealthProblem(payload.health);
        return;
      }

      if (!prefs.roadmapMode && settings.defaultRoadmapMode) ui.roadmapMode = settings.defaultRoadmapMode;
      if (!prefs.timescale && settings.defaultTimescale) ui.timescale = settings.defaultTimescale;
      if (prefs.showMilestones === undefined) ui.showMilestones = settings.showMilestones !== false;

      RM.setView(prefs.view || settings.defaultView || 'roadmap');
      if (!ui.editorName) RM.askEditorName(false);
    }).catch(function (err) {
      const root = document.getElementById('view-root');
      clear(root);
      root.appendChild(el('div', 'callout callout-error', (err && err.message) || 'The application could not load its data.'));
    });
  };

  function showHealthProblem(health) {
    const root = document.getElementById('view-root');
    clear(root);
    root.appendChild(el('div', 'stack', [
      el('div', 'callout callout-error', [
        el('h2', null, 'Data problem detected.'),
        el('div', null, health.problems.map(function (problem) {
          return el('div', 'stack-tight', [
            el('p', null, problem.file + ' is not valid JSON.'),
            problem.latestBackupAt
              ? el('p', null, 'Last valid backup: ' + RM.dates.formatDateTime(problem.latestBackupAt))
              : el('p', null, 'No backup of this file was found.')
          ]);
        })),
        el('p', null, 'The file has not been changed. Restore a backup to recover, or repair the file by hand in the data folder.')
      ]),
      RM.button('Open data management', function () {
        RM.state.health = null;
        RM.setView('data');
      }, 'primary')
    ]));
  }

  return RM;
}());
