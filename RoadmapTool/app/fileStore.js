'use strict';

/**
 * fileStore - the only place that touches the JSON data files.
 *
 * Rules:
 *  - every dataset file carries a revision number; saves must present the
 *    revision they were based on or the save is rejected as a conflict,
 *  - writes are atomic (temp file -> validate -> rename),
 *  - a short-lived lock file guards against two server processes writing at
 *    the same moment,
 *  - a backup of the previous content is taken before every write.
 *
 * All paths are relative to the application folder, so moving the folder
 * moves the application and its data together.
 */

const fs = require('fs');
const path = require('path');
const defaults = require('./defaults');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(ROOT, 'backups');
const EXPORT_DIR = path.join(ROOT, 'exports');
const LOG_DIR = path.join(ROOT, 'logs');
const LOCK_FILE = path.join(DATA_DIR, '.write.lock');

const LOCK_STALE_MS = 15000;
const LOCK_WAIT_MS = 5000;

/** Dataset registry. `key` is the property holding the payload in the file. */
const DATASETS = {
  programmes: { file: 'programmes.json', key: 'records', idPrefix: 'PRG', label: 'Programme' },
  roadmapItems: { file: 'roadmap-items.json', key: 'records', idPrefix: 'RM', label: 'Roadmap Item' },
  dependencies: { file: 'dependencies.json', key: 'records', idPrefix: 'DEP', label: 'Dependency' },
  backlog: { file: 'backlog.json', key: 'records', idPrefix: 'BLG', label: 'Backlog Item' },
  resourceScenarios: { file: 'resource-scenarios.json', key: 'records', idPrefix: 'SCN', label: 'Resource Scenario' },
  settings: { file: 'settings.json', key: 'settings', singleton: true, label: 'Settings' },
  audit: { file: 'audit.json', key: 'records', idPrefix: 'AUD', label: 'Audit', skipBackup: true }
};

const DATASET_NAMES = Object.keys(DATASETS);

/** Datasets that make up a complete roadmap export (audit excluded). */
const EXPORTABLE = ['programmes', 'roadmapItems', 'dependencies', 'backlog', 'resourceScenarios', 'settings'];

class StoreError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail || null;
  }
}

class ConflictError extends StoreError {
  constructor(dataset, expected, actual) {
    super('CONFLICT',
      'This data has changed since you opened it. Reload the latest version before saving your changes.',
      { dataset: dataset, expectedRevision: expected, currentRevision: actual });
  }
}

/* ------------------------------------------------------------------ */
/* Paths & bootstrap                                                   */
/* ------------------------------------------------------------------ */

function paths() {
  return { root: ROOT, data: DATA_DIR, backups: BACKUP_DIR, exports: EXPORT_DIR, logs: LOG_DIR };
}

function datasetFile(name) {
  return path.join(DATA_DIR, definition(name).file);
}

function definition(name) {
  const def = DATASETS[name];
  if (!def) throw new StoreError('UNKNOWN_DATASET', 'Unknown dataset: ' + name);
  return def;
}

function ensureDirectories() {
  [DATA_DIR, BACKUP_DIR, EXPORT_DIR, LOG_DIR].forEach(function (dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function emptyPayload(name) {
  const def = definition(name);
  const body = { revision: 1, updatedAt: new Date().toISOString() };
  body[def.key] = def.singleton ? defaults.defaultSettings() : [];
  return body;
}

/**
 * Creates any missing data file. Never touches a file that already exists,
 * even if it is unreadable - a corrupt file is reported by checkHealth().
 */
function ensureFiles() {
  ensureDirectories();
  const created = [];
  DATASET_NAMES.forEach(function (name) {
    const file = datasetFile(name);
    if (!fs.existsSync(file)) {
      writeFileAtomic(file, emptyPayload(name));
      created.push(definition(name).file);
    }
  });
  return created;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

function readRaw(name) {
  const file = datasetFile(name);
  if (!fs.existsSync(file)) return emptyPayload(name);
  const text = fs.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new StoreError('CORRUPT_FILE',
      definition(name).file + ' is not valid JSON.',
      { dataset: name, file: definition(name).file, reason: err.message });
  }
  return normalise(name, parsed);
}

function normalise(name, parsed) {
  const def = definition(name);
  const body = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  let payload = body[def.key];
  if (def.singleton) {
    payload = Object.assign(defaults.defaultSettings(), payload && typeof payload === 'object' ? payload : {});
  } else if (!Array.isArray(payload)) {
    payload = Array.isArray(body.records) ? body.records : [];
  }
  const out = {
    revision: Number.isFinite(body.revision) ? body.revision : 1,
    updatedAt: body.updatedAt || new Date().toISOString()
  };
  out[def.key] = payload;
  return out;
}

/** Returns { revision, updatedAt, records|settings } for one dataset. */
function read(name) {
  return readRaw(name);
}

/** Convenience: just the payload (array, or settings object). */
function records(name) {
  const def = definition(name);
  return readRaw(name)[def.key];
}

function readAll(names) {
  const out = {};
  (names || DATASET_NAMES).forEach(function (name) {
    out[name] = readRaw(name);
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Locking                                                             */
/* ------------------------------------------------------------------ */

function acquireLock() {
  ensureDirectories();
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      fs.writeSync(fd, String(process.pid) + ' ' + new Date().toISOString());
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (isLockStale()) {
        try { fs.unlinkSync(LOCK_FILE); } catch (ignore) { /* another process won the race */ }
        continue;
      }
      if (Date.now() > deadline) {
        throw new StoreError('LOCKED', 'Another save is in progress. Please try again in a moment.');
      }
      sleepSync(40);
    }
  }
}

function isLockStale() {
  try {
    const stat = fs.statSync(LOCK_FILE);
    return (Date.now() - stat.mtimeMs) > LOCK_STALE_MS;
  } catch (err) {
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (ignore) { /* already gone */ }
}

function sleepSync(ms) {
  // Node has no sync sleep; a tiny blocking wait is acceptable here because
  // writes are rare, small and short.
  const until = Date.now() + ms;
  while (Date.now() < until) { /* spin */ }
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

function writeFileAtomic(file, body) {
  const text = JSON.stringify(body, null, 2);
  JSON.parse(text); // never rename a file we could not parse back
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

/**
 * Saves a dataset.
 *
 * @param {string} name        dataset name
 * @param {number|null} expectedRevision  revision the caller based its edit on
 *                                        (null skips the check - imports only)
 * @param {function} mutate    receives the current payload, returns the new one
 * @param {object} options     { skipBackup }
 * @returns {{revision:number, updatedAt:string, payload:*, result:*}}
 */
function save(name, expectedRevision, mutate, options) {
  const def = definition(name);
  const opts = options || {};
  ensureDirectories();
  acquireLock();
  try {
    const current = readRaw(name);
    if (expectedRevision !== null && expectedRevision !== undefined &&
        Number(expectedRevision) !== Number(current.revision)) {
      throw new ConflictError(name, Number(expectedRevision), Number(current.revision));
    }

    const outcome = mutate(current[def.key], current);
    const payload = (outcome && Object.prototype.hasOwnProperty.call(outcome, 'payload'))
      ? outcome.payload
      : outcome;

    if (!def.singleton && !Array.isArray(payload)) {
      throw new StoreError('INVALID_PAYLOAD', 'Expected a list of records for ' + name + '.');
    }

    if (!def.skipBackup && !opts.skipBackup) {
      backupCurrent(name);
    }

    const body = { revision: Number(current.revision) + 1, updatedAt: new Date().toISOString() };
    body[def.key] = payload;
    writeFileAtomic(datasetFile(name), body);

    return {
      revision: body.revision,
      updatedAt: body.updatedAt,
      payload: payload,
      result: outcome && outcome.result !== undefined ? outcome.result : null
    };
  } finally {
    releaseLock();
  }
}

/**
 * Saves several datasets as one unit (used by cascade delete, promote and
 * import). Revisions are checked for every dataset before anything is written.
 */
function saveMany(operations, options) {
  const opts = options || {};
  ensureDirectories();
  acquireLock();
  try {
    const currents = {};
    operations.forEach(function (op) {
      const def = definition(op.dataset);
      const current = readRaw(op.dataset);
      if (op.expectedRevision !== null && op.expectedRevision !== undefined &&
          Number(op.expectedRevision) !== Number(current.revision)) {
        throw new ConflictError(op.dataset, Number(op.expectedRevision), Number(current.revision));
      }
      currents[op.dataset] = { current: current, def: def };
    });

    const prepared = operations.map(function (op) {
      const entry = currents[op.dataset];
      const payload = op.mutate(entry.current[entry.def.key], entry.current);
      if (!entry.def.singleton && !Array.isArray(payload)) {
        throw new StoreError('INVALID_PAYLOAD', 'Expected a list of records for ' + op.dataset + '.');
      }
      return { op: op, entry: entry, payload: payload };
    });

    const revisions = {};
    prepared.forEach(function (p) {
      if (!p.entry.def.skipBackup && !opts.skipBackup) backupCurrent(p.op.dataset);
      const body = { revision: Number(p.entry.current.revision) + 1, updatedAt: new Date().toISOString() };
      body[p.entry.def.key] = p.payload;
      writeFileAtomic(datasetFile(p.op.dataset), body);
      revisions[p.op.dataset] = body.revision;
    });
    return revisions;
  } finally {
    releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Backups (kept here so every write path gets one)                    */
/* ------------------------------------------------------------------ */

let backupModule = null;
function backups() {
  if (!backupModule) backupModule = require('./backup');
  return backupModule;
}

function backupCurrent(name) {
  const file = datasetFile(name);
  if (!fs.existsSync(file)) return null;
  return backups().createBackup(name);
}

/* ------------------------------------------------------------------ */
/* IDs                                                                 */
/* ------------------------------------------------------------------ */

function nextId(prefix, existingIds) {
  let max = 0;
  const pattern = new RegExp('^' + prefix + '-(\\d+)$');
  (existingIds || []).forEach(function (id) {
    const match = pattern.exec(String(id || ''));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return prefix + '-' + String(max + 1).padStart(4, '0');
}

function nextIdFor(name, list) {
  const def = definition(name);
  return nextId(def.idPrefix, (list || []).map(function (r) { return r && r.id; }));
}

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

function checkHealth() {
  ensureDirectories();
  const problems = [];
  const files = {};
  DATASET_NAMES.forEach(function (name) {
    const def = definition(name);
    const file = datasetFile(name);
    const info = { dataset: name, file: def.file, exists: fs.existsSync(file), valid: true, records: 0 };
    if (info.exists) {
      try {
        const data = readRaw(name);
        info.revision = data.revision;
        info.updatedAt = data.updatedAt;
        info.records = def.singleton ? 1 : data[def.key].length;
      } catch (err) {
        info.valid = false;
        info.error = err.message;
        const latest = backups().latestBackup(name);
        info.latestBackup = latest ? latest.file : null;
        info.latestBackupAt = latest ? latest.createdAt : null;
        problems.push(info);
      }
    }
    files[name] = info;
  });
  return { ok: problems.length === 0, problems: problems, files: files };
}

module.exports = {
  DATASETS: DATASETS,
  DATASET_NAMES: DATASET_NAMES,
  EXPORTABLE: EXPORTABLE,
  StoreError: StoreError,
  ConflictError: ConflictError,
  paths: paths,
  definition: definition,
  datasetFile: datasetFile,
  ensureDirectories: ensureDirectories,
  ensureFiles: ensureFiles,
  emptyPayload: emptyPayload,
  read: read,
  records: records,
  readAll: readAll,
  save: save,
  saveMany: saveMany,
  writeFileAtomic: writeFileAtomic,
  nextId: nextId,
  nextIdFor: nextIdFor,
  checkHealth: checkHealth
};
