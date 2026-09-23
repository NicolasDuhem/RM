'use strict';

/**
 * Roadmap Tool - local HTTP server.
 *
 * Deliberately tiny: Node's own http module, no framework, no dependencies.
 * It serves /public and a small JSON API over the flat files in /data.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

const store = require('./fileStore');
const backup = require('./backup');
const validation = require('./validation');
const csv = require('./csv');
const csvSchema = require('./csvSchema');
const guide = require('./guide');
const defaults = require('./defaults');

const ROOT = store.paths().root;
const PUBLIC_DIR = path.join(ROOT, 'public');
const EXPORT_DIR = store.paths().exports;
const LOG_FILE = path.join(store.paths().logs, 'server.log');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */

function log(level, message, detail) {
  const line = '[' + new Date().toISOString() + '] ' + level + ' ' + message +
    (detail ? ' :: ' + (detail.stack || JSON.stringify(detail)) : '') + '\n';
  try {
    store.ensureDirectories();
    fs.appendFileSync(LOG_FILE, line);
  } catch (ignore) { /* logging must never break a request */ }
  if (level === 'ERROR') process.stderr.write(line);
}

/* ------------------------------------------------------------------ */
/* Request helpers                                                     */
/* ------------------------------------------------------------------ */

function sendJson(res, statusCode, body) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

function sendError(res, err) {
  const code = err && err.code ? err.code : 'ERROR';
  let statusCode = 500;
  if (code === 'CONFLICT') statusCode = 409;
  else if (code === 'VALIDATION') statusCode = 422;
  else if (code === 'NOT_FOUND' || code === 'UNKNOWN_DATASET') statusCode = 404;
  else if (code === 'BAD_REQUEST' || code === 'BAD_BACKUP' || code === 'INVALID_PAYLOAD') statusCode = 400;
  else if (code === 'HAS_CHILDREN') statusCode = 409;
  else if (code === 'BAD_PASSWORD') statusCode = 403;
  else if (code === 'LOCKED') statusCode = 423;
  else if (code === 'CORRUPT_FILE') statusCode = 500;

  if (statusCode >= 500) log('ERROR', 'Request failed', err);
  else log('WARN', code + ': ' + err.message);

  sendJson(res, statusCode, {
    error: {
      code: code,
      message: err && err.message ? err.message : 'Something went wrong.',
      detail: err && err.detail ? err.detail : null
    }
  });
}

function readBody(req, limitBytes) {
  const limit = limitBytes || 40 * 1024 * 1024;
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(new store.StoreError('BAD_REQUEST', 'That upload is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(new store.StoreError('BAD_REQUEST', 'The request body was not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function badRequest(message) {
  return new store.StoreError('BAD_REQUEST', message);
}

function validationError(errors, warnings) {
  const err = new store.StoreError('VALIDATION', 'Please correct the highlighted fields before saving.', {
    errors: errors,
    warnings: warnings || []
  });
  return err;
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

const SKIP_DIFF_FIELDS = ['updatedAt', 'updatedBy', 'createdAt', 'createdBy'];

function diffRecords(before, after) {
  const changes = [];
  const keys = new Set(Object.keys(before || {}).concat(Object.keys(after || {})));
  keys.forEach(function (key) {
    if (SKIP_DIFF_FIELDS.indexOf(key) >= 0) return;
    const a = before ? before[key] : undefined;
    const b = after ? after[key] : undefined;
    if (isScalar(a) && isScalar(b)) {
      if (String(a === undefined ? '' : a) !== String(b === undefined ? '' : b)) {
        changes.push({ field: key, from: a === undefined ? '' : a, to: b === undefined ? '' : b });
      }
      return;
    }
    if (JSON.stringify(a === undefined ? null : a) !== JSON.stringify(b === undefined ? null : b)) {
      changes.push({ field: key, from: summarise(a), to: summarise(b) });
    }
  });
  return changes;
}

function isScalar(value) {
  return value === null || value === undefined ||
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function summarise(value) {
  if (Array.isArray(value)) return value.length + ' item(s)';
  if (value && typeof value === 'object') return 'updated';
  return value === undefined ? '' : value;
}

function recordAudit(entry) {
  try {
    let keep = 5000;
    try { keep = Number(store.records('settings').auditEntriesToKeep) || 5000; } catch (ignore) { /* default */ }
    store.save('audit', null, function (records) {
      const id = store.nextId('AUD', records.map(function (r) { return r.id; }));
      const full = Object.assign({ id: id, timestamp: new Date().toISOString() }, entry);
      const next = records.concat([full]);
      return next.length > keep ? next.slice(next.length - keep) : next;
    }, { skipBackup: true });
  } catch (err) {
    log('WARN', 'Could not write audit entry', err);
  }
}

function auditChange(action, dataset, record, before, editor, extra) {
  const changes = (action === 'Updated') ? diffRecords(before, record) : [];
  recordAudit(Object.assign({
    editor: validation.trimmed(editor) || 'Unknown',
    action: action,
    recordType: store.definition(dataset).label,
    dataset: dataset,
    recordId: record ? record.id : (before ? before.id : ''),
    recordName: displayName(dataset, record || before),
    changes: changes,
    before: action === 'Created' ? null : compact(before),
    after: action === 'Deleted' ? null : compact(record)
  }, extra || {}));
}

function displayName(dataset, record) {
  if (!record) return '';
  switch (dataset) {
    case 'programmes': return record.name || record.id;
    case 'roadmapItems': return record.title || record.id;
    case 'backlog': return record.change || record.id;
    case 'dependencies': return (record.fromItemId || '?') + ' -> ' + (record.toItemId || '?');
    case 'resourceScenarios': return record.name || record.id;
    case 'settings': return 'Settings';
    default: return record.id || '';
  }
}

/** Keeps audit.json readable: nested collections are summarised, not copied. */
function compact(record) {
  if (!record || typeof record !== 'object') return record === undefined ? null : record;
  const out = {};
  Object.keys(record).forEach(function (key) {
    const value = record[key];
    if (Array.isArray(value)) { out[key] = value.length + ' item(s)'; return; }
    if (value && typeof value === 'object') { return; }
    out[key] = value;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Dataset helpers                                                     */
/* ------------------------------------------------------------------ */

const EDITABLE = ['programmes', 'roadmapItems', 'dependencies', 'backlog', 'resourceScenarios'];

function requireEditable(name) {
  if (EDITABLE.indexOf(name) < 0) {
    throw new store.StoreError('UNKNOWN_DATASET', 'Dataset "' + name + '" cannot be edited this way.');
  }
  return name;
}

function contextFor(dataset, siblings, existing, editor) {
  const ctx = { siblings: siblings, existing: existing, editor: editor };
  if (dataset === 'roadmapItems') ctx.programmes = store.records('programmes');
  if (dataset === 'dependencies') {
    ctx.roadmapItems = store.records('roadmapItems');
    ctx.dependencies = siblings;
  }
  return ctx;
}

function createRecord(dataset, body) {
  requireEditable(dataset);
  const editor = body.editor;
  let created = null;
  const outcome = store.save(dataset, body.revision, function (records) {
    const record = Object.assign({}, body.record || {});
    record.id = store.nextIdFor(dataset, records);
    const checked = validation.validate(dataset, record, contextFor(dataset, records, null, editor));
    if (!checked.ok) throw validationError(checked.errors, checked.warnings);
    if (checked.warnings && checked.warnings.length && !body.acceptWarnings) {
      throw validationError([], checked.warnings);
    }
    created = checked.record;
    return records.concat([checked.record]);
  });
  auditChange('Created', dataset, created, null, editor);
  return { revision: outcome.revision, updatedAt: outcome.updatedAt, record: created };
}

function updateRecord(dataset, id, body) {
  requireEditable(dataset);
  const editor = body.editor;
  let updated = null;
  let before = null;
  const outcome = store.save(dataset, body.revision, function (records) {
    const index = records.findIndex(function (r) { return r.id === id; });
    if (index < 0) throw new store.StoreError('NOT_FOUND', 'That record no longer exists. It may have been deleted by someone else.');
    before = records[index];
    const merged = Object.assign({}, body.record || {}, { id: id });
    const checked = validation.validate(dataset, merged, contextFor(dataset, records, before, editor));
    if (!checked.ok) throw validationError(checked.errors, checked.warnings);
    if (checked.warnings && checked.warnings.length && !body.acceptWarnings) {
      throw validationError([], checked.warnings);
    }
    updated = checked.record;
    const next = records.slice();
    next[index] = checked.record;
    return next;
  });
  auditChange('Updated', dataset, updated, before, editor);
  return { revision: outcome.revision, updatedAt: outcome.updatedAt, record: updated };
}

function deleteRecord(dataset, id, body) {
  requireEditable(dataset);
  const editor = body.editor;
  const revisions = body.revisions || {};

  if (dataset === 'programmes') {
    throw badRequest('Use the programme delete endpoint so child items are handled explicitly.');
  }

  // Roadmap items: remove the dependencies that point at them so the
  // dependency register never holds orphan records.
  if (dataset === 'roadmapItems') {
    let removed = null;
    let removedDeps = [];
    const result = store.saveMany([
      {
        dataset: 'roadmapItems',
        expectedRevision: body.revision,
        mutate: function (records) {
          const found = records.find(function (r) { return r.id === id; });
          if (!found) throw new store.StoreError('NOT_FOUND', 'That roadmap item no longer exists.');
          removed = found;
          return records.filter(function (r) { return r.id !== id; });
        }
      },
      {
        dataset: 'dependencies',
        expectedRevision: revisions.dependencies,
        mutate: function (records) {
          removedDeps = records.filter(function (d) { return d.fromItemId === id || d.toItemId === id; });
          return records.filter(function (d) { return d.fromItemId !== id && d.toItemId !== id; });
        }
      }
    ]);
    auditChange('Deleted', 'roadmapItems', null, removed, editor, {
      note: removedDeps.length ? removedDeps.length + ' linked dependency record(s) removed.' : ''
    });
    removedDeps.forEach(function (dep) { auditChange('Deleted', 'dependencies', null, dep, editor); });
    return { revisions: result, removedDependencies: removedDeps.length };
  }

  let removed = null;
  const outcome = store.save(dataset, body.revision, function (records) {
    const found = records.find(function (r) { return r.id === id; });
    if (!found) throw new store.StoreError('NOT_FOUND', 'That record no longer exists.');
    removed = found;
    return records.filter(function (r) { return r.id !== id; });
  });
  auditChange('Deleted', dataset, null, removed, editor);
  return { revision: outcome.revision, updatedAt: outcome.updatedAt };
}

function deleteProgramme(body) {
  const id = validation.trimmed(body.id);
  if (!id) throw badRequest('No programme was supplied.');
  const editor = body.editor;
  const revisions = body.revisions || {};
  const items = store.records('roadmapItems');
  const children = items.filter(function (i) { return i.programmeId === id; });

  if (children.length > 0 && !body.cascade) {
    throw new store.StoreError('HAS_CHILDREN',
      'This programme contains ' + children.length + ' roadmap item(s).',
      { childCount: children.length, children: children.map(function (c) { return { id: c.id, title: c.title }; }) });
  }

  const childIds = children.map(function (c) { return c.id; });
  let removedProgramme = null;
  let removedDeps = [];

  const result = store.saveMany([
    {
      dataset: 'programmes',
      expectedRevision: revisions.programmes,
      mutate: function (records) {
        const found = records.find(function (r) { return r.id === id; });
        if (!found) throw new store.StoreError('NOT_FOUND', 'That programme no longer exists.');
        removedProgramme = found;
        return records.filter(function (r) { return r.id !== id; });
      }
    },
    {
      dataset: 'roadmapItems',
      expectedRevision: revisions.roadmapItems,
      mutate: function (records) {
        return records.filter(function (r) { return r.programmeId !== id; });
      }
    },
    {
      dataset: 'dependencies',
      expectedRevision: revisions.dependencies,
      mutate: function (records) {
        removedDeps = records.filter(function (d) {
          return childIds.indexOf(d.fromItemId) >= 0 || childIds.indexOf(d.toItemId) >= 0;
        });
        return records.filter(function (d) {
          return childIds.indexOf(d.fromItemId) < 0 && childIds.indexOf(d.toItemId) < 0;
        });
      }
    },
    {
      dataset: 'backlog',
      expectedRevision: revisions.backlog,
      mutate: function (records) {
        // Promoted backlog items simply lose their roadmap link.
        return records.map(function (b) {
          if (b.roadmapItemId && childIds.indexOf(b.roadmapItemId) >= 0) {
            return Object.assign({}, b, { roadmapItemId: '', promoted: false });
          }
          return b;
        });
      }
    }
  ]);

  auditChange('Deleted', 'programmes', null, removedProgramme, editor, {
    note: children.length + ' roadmap item(s) and ' + removedDeps.length + ' dependency record(s) removed.'
  });
  children.forEach(function (child) { auditChange('Deleted', 'roadmapItems', null, child, editor); });

  return { revisions: result, removedItems: children.length, removedDependencies: removedDeps.length };
}

function promoteBacklogItem(body) {
  const backlogId = validation.trimmed(body.backlogId);
  if (!backlogId) throw badRequest('No backlog item was supplied.');
  const editor = body.editor;
  const revisions = body.revisions || {};
  const existingBacklog = store.records('backlog').find(function (b) { return b.id === backlogId; });
  if (!existingBacklog) throw new store.StoreError('NOT_FOUND', 'That backlog item no longer exists.');

  let newProgramme = null;
  let newItem = null;

  const operations = [];

  const programmeInput = body.newProgramme;
  let programmeId = validation.trimmed(body.programmeId);

  operations.push({
    dataset: 'programmes',
    expectedRevision: revisions.programmes,
    mutate: function (records) {
      if (programmeInput && validation.trimmed(programmeInput.name)) {
        const draft = Object.assign({}, programmeInput);
        draft.id = store.nextIdFor('programmes', records);
        const checked = validation.validateProgramme(draft, { siblings: records, editor: editor });
        if (!checked.ok) throw validationError(checked.errors);
        newProgramme = checked.record;
        programmeId = checked.record.id;
        return records.concat([checked.record]);
      }
      if (!programmeId || !records.some(function (p) { return p.id === programmeId; })) {
        throw validationError([{ field: 'programmeId', message: 'Choose an existing programme or enter a new programme name.' }]);
      }
      return records;
    }
  });

  operations.push({
    dataset: 'roadmapItems',
    expectedRevision: revisions.roadmapItems,
    mutate: function (records) {
      const draft = Object.assign({
        title: existingBacklog.change,
        systemArea: existingBacklog.systemArea,
        subArea: existingBacklog.subAreaDepartment,
        type: existingBacklog.type,
        status: existingBacklog.currentStatus,
        priority: existingBacklog.priority,
        owner: existingBacklog.owner,
        productOwner: existingBacklog.owner,
        description: existingBacklog.comment,
        systemDependencies: existingBacklog.otherSystemsImpacted,
        businessDependencies: existingBacklog.processesImpacted,
        notes: existingBacklog.dependencyPrerequisite
          ? 'Prerequisite from backlog: ' + existingBacklog.dependencyPrerequisite
          : ''
      }, body.item || {});
      draft.programmeId = programmeId;
      draft.backlogId = backlogId;
      draft.id = store.nextIdFor('roadmapItems', records);
      const programmes = newProgramme ? store.records('programmes').concat([newProgramme]) : store.records('programmes');
      const checked = validation.validateRoadmapItem(draft, { siblings: records, programmes: programmes, editor: editor });
      if (!checked.ok) throw validationError(checked.errors);
      newItem = checked.record;
      return records.concat([checked.record]);
    }
  });

  operations.push({
    dataset: 'backlog',
    expectedRevision: revisions.backlog,
    mutate: function (records) {
      return records.map(function (b) {
        if (b.id !== backlogId) return b;
        return Object.assign({}, b, {
          promoted: true,
          roadmapItemId: newItem ? newItem.id : '',
          updatedAt: new Date().toISOString(),
          updatedBy: validation.trimmed(editor) || 'Unknown'
        });
      });
    }
  });

  const result = store.saveMany(operations);
  if (newProgramme) auditChange('Created', 'programmes', newProgramme, null, editor);
  auditChange('Created', 'roadmapItems', newItem, null, editor, { note: 'Promoted from backlog item ' + backlogId + '.' });
  recordAudit({
    editor: validation.trimmed(editor) || 'Unknown',
    action: 'Promoted',
    recordType: 'Backlog Item',
    dataset: 'backlog',
    recordId: backlogId,
    recordName: existingBacklog.change,
    changes: [],
    note: 'Promoted to roadmap item ' + (newItem ? newItem.id : '')
  });

  return { revisions: result, record: newItem, programme: newProgramme, programmeId: programmeId };
}

function saveSettings(body) {
  const editor = body.editor;
  let before = null;
  let after = null;
  const outcome = store.save('settings', body.revision, function (settings) {
    before = settings;
    requireSettingsPassword(settings, body.password);
    const checked = validation.validateSettings(body.settings, { existing: settings });
    if (!checked.ok) throw validationError(checked.errors);
    after = checked.record;
    return checked.record;
  });
  auditChange('Updated', 'settings', after, before, editor);
  return { revision: outcome.revision, updatedAt: outcome.updatedAt, settings: after };
}

/**
 * The Settings screen is password protected. This is a speed bump that keeps
 * the shared lists from being changed by accident - it is not security, and
 * the application still has no user accounts.
 */
function requireSettingsPassword(settings, supplied) {
  const expected = validation.trimmed(settings && settings.settingsPassword);
  if (!expected) return;
  if (validation.trimmed(supplied) !== expected) {
    throw new store.StoreError('BAD_PASSWORD', 'That settings password is not correct.');
  }
}

function checkSettingsPassword(body) {
  const settings = store.records('settings');
  const expected = validation.trimmed(settings.settingsPassword);
  return { ok: !expected || validation.trimmed(body.password) === expected, required: !!expected };
}

/* ------------------------------------------------------------------ */
/* Export / import                                                     */
/* ------------------------------------------------------------------ */

function fileStamp() {
  const d = new Date();
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
}

function buildBundle() {
  const bundle = {
    exportedAt: new Date().toISOString(),
    application: 'Roadmap Tool',
    formatVersion: 1
  };
  store.EXPORTABLE.forEach(function (name) {
    const def = store.definition(name);
    const data = store.read(name);
    bundle[name] = data[def.key];
    bundle[name + 'Revision'] = data.revision;
  });
  return bundle;
}

function writeExport(fileName, contents) {
  store.ensureDirectories();
  const target = path.join(EXPORT_DIR, fileName);
  fs.writeFileSync(target, contents, 'utf8');
  return target;
}

function exportCsv(dataset) {
  const settings = store.records('settings');
  const columns = csvSchema.schemaFor(dataset, settings);
  if (!columns) throw badRequest('There is no CSV format for "' + dataset + '".');
  const rows = store.records(dataset);
  return csv.stringify(columns.map(function (column) {
    return {
      header: column.header,
      value: function (row) { return csvSchema.toCell(column, row, settings); }
    };
  }), rows);
}

/** A flat register of every task under every system change. */
function exportTasksCsv() {
  const settings = store.records('settings');
  const programmes = store.records('programmes');
  const columns = csvSchema.taskColumns(settings);
  const rows = [];

  store.records('roadmapItems').forEach(function (item) {
    const programme = programmes.find(function (p) { return p.id === item.programmeId; });
    (item.tasks || []).forEach(function (task) {
      rows.push(Object.assign({}, task, {
        roadmapItemId: item.id,
        roadmapItemTitle: item.title,
        programmeName: programme ? programme.name : '',
        stream: task.stream || item.stream || '',
        okrNames: (task.okrIds || []).map(function (id) { return okrName(settings, id); }).filter(Boolean).join('; '),
        linkText: (task.links || []).map(function (link) {
          return link.label && link.label !== link.url ? link.label + ' <' + link.url + '>' : link.url;
        }).join('; ')
      }));
    });
  });

  return csv.stringify(columns.map(function (column) {
    return {
      header: column.header,
      value: function (row) { return csvSchema.toCell(column, row, settings); }
    };
  }), rows);
}

function okrName(settings, id) {
  const objectives = Array.isArray(settings.okrs) ? settings.okrs : [];
  for (let i = 0; i < objectives.length; i += 1) {
    if (objectives[i].id === id) return objectives[i].name;
    const children = objectives[i].children || [];
    for (let j = 0; j < children.length; j += 1) {
      if (children[j].id === id) return objectives[i].name + ' / ' + children[j].name;
    }
  }
  return id;
}

function importBundle(body) {
  const bundle = body.bundle;
  if (!bundle || typeof bundle !== 'object') throw badRequest('No backup content was supplied.');
  const editor = validation.trimmed(body.editor) || 'Unknown';

  const checked = validation.validateBundle(Object.assign({ editor: editor }, bundle));
  if (!checked.ok) throw validationError(checked.errors);

  const operations = [];
  ['programmes', 'roadmapItems', 'dependencies', 'backlog', 'resourceScenarios'].forEach(function (name) {
    if (!Object.prototype.hasOwnProperty.call(bundle, name)) return;
    operations.push({
      dataset: name,
      expectedRevision: null,
      mutate: function () { return checked.data[name]; }
    });
  });
  if (bundle.settings && body.includeSettings !== false) {
    operations.push({
      dataset: 'settings',
      expectedRevision: null,
      mutate: function () { return checked.data.settings; }
    });
  }
  if (operations.length === 0) throw badRequest('That file did not contain any roadmap data.');

  const revisions = store.saveMany(operations);
  recordAudit({
    editor: editor,
    action: 'Imported',
    recordType: 'Complete backup',
    dataset: 'all',
    recordId: '',
    recordName: 'JSON import',
    changes: [],
    note: operations.map(function (op) { return op.dataset; }).join(', ')
  });
  return { revisions: revisions };
}

/**
 * Additive import: adds programmes, system changes and tasks drafted outside
 * the tool without touching anything already on the roadmap.
 *
 * Ids are always assigned here, so a file written by hand (or by a chat
 * assistant following the JSON guide) never has to invent one. A programme
 * whose name already exists is reused rather than duplicated.
 */
function importAdditions(body) {
  const bundle = body.bundle;
  if (!bundle || typeof bundle !== 'object') throw badRequest('No content was supplied.');
  const editor = validation.trimmed(body.editor) || 'Unknown';

  const incomingProgrammes = Array.isArray(bundle.programmes) ? bundle.programmes : [];
  const incomingItems = Array.isArray(bundle.roadmapItems) ? bundle.roadmapItems : [];
  if (!incomingProgrammes.length && !incomingItems.length) {
    throw badRequest('That file contained no programmes and no system changes.');
  }

  const errors = [];
  const createdProgrammes = [];
  const createdItems = [];

  const revisions = store.saveMany([
    {
      dataset: 'programmes',
      expectedRevision: null,
      mutate: function (records) {
        const next = records.slice();
        incomingProgrammes.forEach(function (input, index) {
          const draft = Object.assign({}, input);
          delete draft.id;
          const name = validation.trimmed(draft.name);
          if (!name) {
            errors.push({ field: 'programmes', message: 'Programme ' + (index + 1) + ' has no name.' });
            return;
          }
          const existing = next.find(function (programme) {
            return programme.name.toLowerCase() === name.toLowerCase();
          });
          if (existing) return; // reuse it rather than create a second one
          draft.id = store.nextIdFor('programmes', next);
          const checked = validation.validateProgramme(draft, { siblings: next, editor: editor });
          checked.errors.forEach(function (error) {
            errors.push({ field: 'programmes', message: 'Programme "' + name + '": ' + error.message });
          });
          next.push(checked.record);
          createdProgrammes.push(checked.record);
        });
        return next;
      }
    },
    {
      dataset: 'roadmapItems',
      expectedRevision: null,
      mutate: function (records) {
        const programmes = store.records('programmes').concat(createdProgrammes);
        const next = records.slice();
        const childCounters = nestedIdCounters(next);

        incomingItems.forEach(function (input, index) {
          const draft = Object.assign({}, input);
          delete draft.id;
          const label = validation.trimmed(draft.title) || 'System change ' + (index + 1);
          const programme = resolveProgramme(programmes, draft);
          if (!programme) {
            errors.push({
              field: 'roadmapItems',
              message: '"' + label + '" does not name a programme that exists in this file or on the roadmap.'
            });
            return;
          }
          draft.programmeId = programme.id;
          delete draft.programme;
          draft.id = store.nextIdFor('roadmapItems', next);

          ['milestones', 'risks', 'gates', 'tasks'].forEach(function (collection) {
            const prefix = { milestones: 'MS', risks: 'RISK', gates: 'GAT', tasks: 'TSK' }[collection];
            const incoming = Array.isArray(draft[collection]) ? draft[collection] : [];
            draft[collection] = incoming.map(function (child) {
              const copy = Object.assign({}, child);
              childCounters[prefix] += 1;
              copy.id = prefix + '-' + String(childCounters[prefix]).padStart(4, '0');
              if (collection === 'tasks') copy.roadmapItemId = draft.id;
              return copy;
            });
          });

          const checked = validation.validateRoadmapItem(draft, {
            siblings: next, programmes: programmes, editor: editor
          });
          checked.errors.forEach(function (error) {
            errors.push({ field: 'roadmapItems', message: '"' + label + '": ' + error.message });
          });
          next.push(checked.record);
          createdItems.push(checked.record);
        });

        if (errors.length) throw validationError(errors);
        return next;
      }
    }
  ]);

  const warnings = unknownValueWarnings(createdProgrammes, createdItems);

  createdProgrammes.forEach(function (programme) { auditChange('Created', 'programmes', programme, null, editor); });
  createdItems.forEach(function (item) { auditChange('Created', 'roadmapItems', item, null, editor); });
  recordAudit({
    editor: editor,
    action: 'Imported',
    recordType: 'Roadmap additions',
    dataset: 'all',
    recordId: '',
    recordName: createdProgrammes.length + ' programme(s), ' + createdItems.length + ' system change(s)',
    changes: [],
    note: 'Added to the roadmap from a JSON file. Nothing existing was replaced.'
  });

  return {
    revisions: revisions,
    programmes: createdProgrammes.length,
    roadmapItems: createdItems.length,
    tasks: createdItems.reduce(function (total, item) { return total + (item.tasks || []).length; }, 0),
    reusedProgrammes: incomingProgrammes.length - createdProgrammes.length,
    warnings: warnings
  };
}

/**
 * The import accepts a value that is not in Settings rather than refusing the
 * whole file, but it says so: a status or stream nobody recognises is almost
 * always a mistake in the file.
 */
function unknownValueWarnings(programmes, items) {
  const settings = store.records('settings');
  const warnings = [];
  const seen = new Set();

  function known(listName, id) {
    if (!id) return true;
    const list = Array.isArray(settings[listName]) ? settings[listName] : [];
    return list.some(function (entry) { return entry.id === id; });
  }

  function note(listName, id, where) {
    const key = listName + '|' + id;
    if (!id || known(listName, id) || seen.has(key)) return;
    seen.add(key);
    warnings.push(where + ' "' + id + '" is not in Settings, so it will show as unknown.');
  }

  programmes.forEach(function (programme) {
    note('statuses', programme.status, 'Status');
    note('priorities', programme.priority, 'Priority');
  });

  items.forEach(function (item) {
    note('statuses', item.status, 'Status');
    note('priorities', item.priority, 'Priority');
    note('resourceStreams', item.stream, 'Resource stream');
    note('milestoneTypes', item.currentPhase, 'Phase');
    (item.systemAreas || []).forEach(function (id) { note('systems', id, 'System'); });
    (item.types || []).forEach(function (id) { note('itemTypes', id, 'Type'); });
    (item.tasks || []).forEach(function (task) {
      note('statuses', task.status, 'Task status');
      note('resourceStreams', task.stream, 'Task resource stream');
      (task.okrIds || []).forEach(function (id) {
        const objectives = Array.isArray(settings.okrs) ? settings.okrs : [];
        const found = objectives.some(function (objective) {
          return objective.id === id || (objective.children || []).some(function (child) { return child.id === id; });
        });
        const key = 'okr|' + id;
        if (found || seen.has(key)) return;
        seen.add(key);
        warnings.push('OKR "' + id + '" is not in Settings, so it will show as unknown.');
      });
    });
  });

  return warnings;
}

/** Accepts a programme by id, or by name (so files can stay readable). */
function resolveProgramme(programmes, draft) {
  const byId = validation.trimmed(draft.programmeId);
  if (byId) {
    const match = programmes.find(function (programme) { return programme.id === byId; });
    if (match) return match;
  }
  const reference = validation.trimmed(draft.programme || draft.programmeName || draft.programmeId);
  if (!reference) return null;
  return programmes.find(function (programme) {
    return programme.id === reference || programme.name.toLowerCase() === reference.toLowerCase();
  }) || null;
}

/** Highest number already used by each nested id prefix, across every item. */
function nestedIdCounters(items) {
  const counters = { MS: 0, RISK: 0, GAT: 0, TSK: 0 };
  items.forEach(function (item) {
    [['milestones', 'MS'], ['risks', 'RISK'], ['gates', 'GAT'], ['tasks', 'TSK']].forEach(function (pair) {
      (item[pair[0]] || []).forEach(function (child) {
        const match = new RegExp('^' + pair[1] + '-(\\d+)$').exec(String(child.id || ''));
        if (match) counters[pair[1]] = Math.max(counters[pair[1]], parseInt(match[1], 10));
      });
    });
  });
  return counters;
}

function importCsv(body) {
  const dataset = validation.trimmed(body.dataset);
  requireEditable(dataset);
  const settings = store.records('settings');
  const columns = csvSchema.schemaFor(dataset, settings);
  if (!columns) throw badRequest('There is no CSV format for "' + dataset + '".');

  const parsed = csv.parse(body.csv || '');
  if (parsed.rows.length === 0) throw badRequest('That CSV file contained no data rows.');

  const byHeader = {};
  columns.forEach(function (column) { byHeader[column.header.toLowerCase()] = column; });

  const unknown = parsed.headers.filter(function (header) {
    return header && !byHeader[header.toLowerCase()];
  });

  const existing = store.records(dataset);
  const existingById = {};
  existing.forEach(function (record) { existingById[record.id] = record; });

  const mode = body.mode === 'replace' ? 'replace' : 'merge';
  const editor = validation.trimmed(body.editor) || 'Unknown';
  const errors = [];
  const drafts = [];
  const usedIds = new Set();

  parsed.rows.forEach(function (row, index) {
    const rowNumber = index + 2; // header is row 1
    const base = {};
    parsed.headers.forEach(function (header) {
      const column = byHeader[String(header).toLowerCase()];
      if (!column) return;
      csvSchema.setPath(base, column.field, csvSchema.fromCell(column, row[header], settings));
    });

    const id = validation.trimmed(base.id);
    if (id && usedIds.has(id)) {
      errors.push({ row: rowNumber, field: 'Id', message: 'Id ' + id + ' appears more than once in the file.' });
      return;
    }
    if (id) usedIds.add(id);
    drafts.push({ rowNumber: rowNumber, id: id, base: base });
  });

  if (errors.length) throw validationError(errors.map(decorate), unknown.length ? unknownWarning(unknown) : []);

  // Validate everything against a simulated result before writing anything.
  const programmes = store.records('programmes');
  const roadmapItems = store.records('roadmapItems');
  const simulated = mode === 'replace' ? [] : existing.slice();
  const outcomes = [];

  drafts.forEach(function (draft) {
    const previous = draft.id ? existingById[draft.id] : null;
    const merged = Object.assign({}, previous || {}, draft.base);
    if (!merged.id) {
      merged.id = store.nextIdFor(dataset, simulated.concat(existing));
    }
    const ctx = {
      siblings: simulated.filter(function (r) { return r.id !== merged.id; }),
      existing: previous || null,
      editor: editor,
      programmes: programmes,
      roadmapItems: roadmapItems,
      dependencies: simulated
    };
    const checked = validation.validate(dataset, merged, ctx);
    checked.errors.forEach(function (e) {
      errors.push({ row: draft.rowNumber, field: e.field, message: e.message });
    });
    const index = simulated.findIndex(function (r) { return r.id === checked.record.id; });
    if (index >= 0) simulated[index] = checked.record; else simulated.push(checked.record);
    outcomes.push({ record: checked.record, isNew: !previous });
  });

  if (errors.length) throw validationError(errors.map(decorate), unknown.length ? unknownWarning(unknown) : []);

  const outcome = store.save(dataset, body.revision === undefined ? null : body.revision, function () {
    return simulated;
  });

  recordAudit({
    editor: editor,
    action: 'Imported',
    recordType: store.definition(dataset).label,
    dataset: dataset,
    recordId: '',
    recordName: 'CSV import',
    changes: [],
    note: outcomes.length + ' row(s) imported (' + mode + ').'
  });

  return {
    revision: outcome.revision,
    imported: outcomes.length,
    created: outcomes.filter(function (o) { return o.isNew; }).length,
    updated: outcomes.filter(function (o) { return !o.isNew; }).length,
    ignoredColumns: unknown
  };

  function decorate(e) {
    return { field: e.field, message: 'Row ' + e.row + ': ' + e.message };
  }

  function unknownWarning(list) {
    return [{ field: 'columns', message: 'Ignored unrecognised column(s): ' + list.join(', ') }];
  }
}

function applySampleData(body) {
  const mode = body.mode === 'empty' ? 'empty' : 'sample';
  const editor = validation.trimmed(body.editor) || 'Unknown';
  const sample = defaults.sampleData();
  const operations = ['programmes', 'roadmapItems', 'dependencies', 'backlog', 'resourceScenarios'].map(function (name) {
    return {
      dataset: name,
      expectedRevision: null,
      mutate: function () { return mode === 'empty' ? [] : sample[name]; }
    };
  });
  const revisions = store.saveMany(operations);
  recordAudit({
    editor: editor,
    action: mode === 'empty' ? 'Cleared' : 'Loaded sample data',
    recordType: 'All roadmap data',
    dataset: 'all',
    recordId: '',
    recordName: mode === 'empty' ? 'All roadmap records removed' : 'Sample roadmap loaded',
    changes: [],
    note: 'A backup of the previous data was taken first.'
  });
  return { revisions: revisions, mode: mode };
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, pathname, query) {
  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method.toUpperCase();
  const head = segments[0];

  if (method === 'GET' && head === 'health') {
    return sendJson(res, 200, store.checkHealth());
  }

  if (method === 'GET' && head === 'bootstrap') {
    const health = store.checkHealth();
    if (!health.ok) {
      return sendJson(res, 200, { health: health, datasets: null });
    }
    return sendJson(res, 200, { health: health, datasets: store.readAll(store.EXPORTABLE) });
  }

  if (method === 'GET' && head === 'dataset' && segments[1]) {
    return sendJson(res, 200, store.read(segments[1]));
  }

  if (method === 'POST' && head === 'dataset' && segments[1] && segments[2]) {
    const dataset = segments[1];
    const action = segments[2];
    const body = await readBody(req);
    if (action === 'create') return sendJson(res, 200, createRecord(dataset, body));
    if (action === 'update') {
      const id = validation.trimmed(body.id || (body.record && body.record.id));
      if (!id) throw badRequest('No record id was supplied.');
      return sendJson(res, 200, updateRecord(dataset, id, body));
    }
    if (action === 'delete') {
      const id = validation.trimmed(body.id);
      if (!id) throw badRequest('No record id was supplied.');
      return sendJson(res, 200, deleteRecord(dataset, id, body));
    }
    throw badRequest('Unknown action "' + action + '".');
  }

  if (method === 'POST' && head === 'programmes' && segments[1] === 'delete') {
    return sendJson(res, 200, deleteProgramme(await readBody(req)));
  }

  if (method === 'POST' && head === 'backlog' && segments[1] === 'promote') {
    return sendJson(res, 200, promoteBacklogItem(await readBody(req)));
  }

  if (method === 'POST' && head === 'settings' && segments[1] === 'save') {
    return sendJson(res, 200, saveSettings(await readBody(req)));
  }

  if (method === 'POST' && head === 'settings' && segments[1] === 'unlock') {
    return sendJson(res, 200, checkSettingsPassword(await readBody(req)));
  }

  if (method === 'GET' && head === 'audit') {
    const limit = Math.min(2000, Math.max(1, Number(query.limit) || 300));
    let records = store.records('audit').slice().reverse();
    if (query.recordId) {
      records = records.filter(function (entry) { return entry.recordId === query.recordId; });
    }
    if (query.dataset) {
      records = records.filter(function (entry) { return entry.dataset === query.dataset; });
    }
    return sendJson(res, 200, { records: records.slice(0, limit), total: records.length });
  }

  if (head === 'backups') {
    if (method === 'GET') {
      return sendJson(res, 200, { backups: backup.listBackups(query.dataset || null) });
    }
    if (method === 'POST' && segments[1] === 'create') {
      const body = await readBody(req);
      const created = body.dataset ? [backup.createBackup(body.dataset, 'manual')] : backup.createFullBackup('manual');
      recordAudit({
        editor: validation.trimmed(body.editor) || 'Unknown',
        action: 'Backup',
        recordType: 'Backup',
        dataset: body.dataset || 'all',
        recordId: '',
        recordName: created.length + ' file(s)',
        changes: []
      });
      return sendJson(res, 200, { created: created.filter(Boolean) });
    }
    if (method === 'POST' && segments[1] === 'restore') {
      const body = await readBody(req);
      const restored = backup.restoreBackup(body.file);
      recordAudit({
        editor: validation.trimmed(body.editor) || 'Unknown',
        action: 'Restored',
        recordType: store.definition(restored.dataset).label,
        dataset: restored.dataset,
        recordId: '',
        recordName: restored.file,
        changes: [],
        note: 'The previous file was backed up before the restore.'
      });
      return sendJson(res, 200, restored);
    }
  }

  if (method === 'GET' && head === 'export' && segments[1] === 'guide') {
    const text = guide.build();
    const fileName = 'RoadmapJsonGuide_' + fileStamp() + '.md';
    writeExport(fileName, text);
    res.writeHead(200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + fileName + '"',
      'X-Roadmap-Export-File': fileName,
      'Content-Length': Buffer.byteLength(text)
    });
    return res.end(text);
  }

  if (method === 'GET' && head === 'export' && segments[1] === 'json') {
    const bundle = buildBundle();
    const fileName = 'RoadmapBackup_' + fileStamp() + '.json';
    const text = JSON.stringify(bundle, null, 2);
    writeExport(fileName, text);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + fileName + '"',
      'X-Roadmap-Export-File': fileName,
      'Content-Length': Buffer.byteLength(text)
    });
    return res.end(text);
  }

  if (method === 'GET' && head === 'export' && segments[1] === 'csv' && segments[2]) {
    const dataset = segments[2];
    const text = dataset === 'tasks' ? exportTasksCsv() : exportCsv(dataset);
    const baseName = dataset === 'tasks' ? 'tasks' : store.definition(dataset).file.replace(/\.json$/, '');
    const fileName = baseName + '_' + fileStamp() + '.csv';
    writeExport(fileName, text);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + fileName + '"',
      'X-Roadmap-Export-File': fileName,
      'Content-Length': Buffer.byteLength(text)
    });
    return res.end(text);
  }

  if (method === 'POST' && head === 'import' && segments[1] === 'json') {
    return sendJson(res, 200, importBundle(await readBody(req)));
  }

  if (method === 'POST' && head === 'import' && segments[1] === 'csv') {
    return sendJson(res, 200, importCsv(await readBody(req)));
  }

  if (method === 'POST' && head === 'import' && segments[1] === 'add') {
    return sendJson(res, 200, importAdditions(await readBody(req)));
  }

  if (method === 'POST' && head === 'sample') {
    return sendJson(res, 200, applySampleData(await readBody(req)));
  }

  throw new store.StoreError('NOT_FOUND', 'Unknown API route: ' + pathname);
}

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */

function serveStatic(req, res, pathname) {
  let relative = decodeURIComponent(pathname);
  if (relative === '/' || relative === '') relative = '/index.html';
  const target = path.join(PUBLIC_DIR, path.normalize(relative).replace(/^([/\\])+/, ''));

  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const ext = path.extname(target).toLowerCase();
  const body = fs.readFileSync(target);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Content-Length': body.length
  });
  res.end(body);
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

function createServer() {
  return http.createServer(function (req, res) {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname || '/';

    if (pathname.startsWith('/api/')) {
      Promise.resolve()
        .then(function () { return handleApi(req, res, pathname, parsed.query || {}); })
        .catch(function (err) { sendError(res, err); });
      return;
    }

    try {
      serveStatic(req, res, pathname);
    } catch (err) {
      log('ERROR', 'Static file failed', err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('The application could not serve that file.');
    }
  });
}

function openBrowser(address) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', address], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [address], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [address], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    log('WARN', 'Could not open the browser automatically', err);
  }
}

function start() {
  const created = store.ensureFiles();
  if (created.length) {
    process.stdout.write('  Created missing data file(s): ' + created.join(', ') + '\n');
  }

  const health = store.checkHealth();
  if (!health.ok) {
    process.stdout.write('\n  ** Data problem detected **\n');
    health.problems.forEach(function (problem) {
      process.stdout.write('  ' + problem.file + ' is not valid JSON.\n');
      if (problem.latestBackupAt) {
        process.stdout.write('  Last valid backup: ' + problem.latestBackupAt + '\n');
      }
    });
    process.stdout.write('  The file has NOT been overwritten. Use Data -> Restore in the app.\n\n');
  }

  let settings;
  try {
    settings = store.records('settings');
  } catch (err) {
    settings = defaults.defaultSettings();
  }

  // ROADMAP_PORT=0 asks the operating system for any free port (used by the tests).
  const envPort = Number(process.env.ROADMAP_PORT);
  const port = Number.isFinite(envPort) && envPort >= 0 && process.env.ROADMAP_PORT !== ''
    ? envPort
    : (Number(settings.port) || 4310);
  const host = process.env.ROADMAP_HOST || settings.host || '0.0.0.0';

  const server = createServer();

  server.on('error', function (err) {
    if (err.code === 'EADDRINUSE') {
      process.stdout.write('\n  Port ' + port + ' is already in use.\n' +
        '  Either the Roadmap Tool is already running, or another program has taken the port.\n' +
        '  Change "port" in data/settings.json and start again.\n\n');
    } else {
      log('ERROR', 'Server error', err);
      process.stdout.write('\n  The server could not start: ' + err.message + '\n\n');
    }
    process.exitCode = 1;
  });

  server.listen(port, host, function () {
    const local = 'http://localhost:' + port;
    process.stdout.write('\n  Roadmap Tool is running.\n');
    process.stdout.write('  On this machine : ' + local + '\n');
    if (host === '0.0.0.0') {
      process.stdout.write('  On the network  : http://' + require('os').hostname() + ':' + port + '\n');
    }
    process.stdout.write('  Data folder     : ' + store.paths().data + '\n');
    process.stdout.write('  Press Ctrl+C to stop.\n\n');
    if (process.argv.indexOf('--open') >= 0) openBrowser(local);
  });

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { start: start, createServer: createServer };
