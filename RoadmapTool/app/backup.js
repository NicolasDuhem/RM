'use strict';

/**
 * Rolling backups. Every write takes a copy of the previous file into
 * /backups using the name  <timestamp>_<dataset-file>  so the folder stays
 * readable and sortable. Old copies are pruned per dataset.
 */

const fs = require('fs');
const path = require('path');
const store = require('./fileStore');

const BACKUP_DIR = store.paths().backups;

function timestamp(date) {
  const d = date || new Date();
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) +
    '-' + String(d.getMilliseconds()).padStart(3, '0');
}

function keepCount() {
  try {
    const settings = store.records('settings');
    const keep = Number(settings.backupsToKeep);
    if (Number.isFinite(keep) && keep > 0) return Math.min(keep, 500);
  } catch (err) { /* settings unreadable - fall through to the default */ }
  return 50;
}

/** Copies the current file for `dataset` into /backups. */
function createBackup(dataset, label) {
  const def = store.definition(dataset);
  const source = store.datasetFile(dataset);
  if (!fs.existsSync(source)) return null;
  store.ensureDirectories();
  const suffix = label ? '_' + String(label).replace(/[^A-Za-z0-9._-]+/g, '-') : '';
  const name = timestamp() + suffix + '_' + def.file;
  const target = path.join(BACKUP_DIR, name);
  fs.copyFileSync(source, target);
  prune(dataset);
  return { dataset: dataset, file: name, createdAt: new Date().toISOString() };
}

/** Backs up every dataset at once (Data -> Create Backup). */
function createFullBackup(label) {
  return store.DATASET_NAMES.map(function (name) {
    return createBackup(name, label);
  }).filter(Boolean);
}

function parseName(fileName) {
  const match = /^(\d{4}-\d{2}-\d{2})_(\d{6})(?:-(\d{3}))?(?:_([^_]*))?_(.+\.json)$/.exec(fileName);
  if (!match) return null;
  const dataset = store.DATASET_NAMES.find(function (name) {
    return store.definition(name).file === match[5];
  });
  if (!dataset) return null;
  const t = match[2];
  const iso = match[1] + 'T' + t.slice(0, 2) + ':' + t.slice(2, 4) + ':' + t.slice(4, 6);
  return {
    file: fileName,
    dataset: dataset,
    datasetFile: match[5],
    label: match[4] || '',
    createdAt: iso,
    date: match[1],
    time: t.slice(0, 2) + ':' + t.slice(2, 4) + ':' + t.slice(4, 6)
  };
}

function listBackups(dataset) {
  store.ensureDirectories();
  const entries = fs.readdirSync(BACKUP_DIR)
    .filter(function (f) { return f.endsWith('.json'); })
    .map(parseName)
    .filter(Boolean)
    .filter(function (b) { return !dataset || b.dataset === dataset; });

  entries.forEach(function (entry) {
    try {
      entry.size = fs.statSync(path.join(BACKUP_DIR, entry.file)).size;
    } catch (err) { entry.size = 0; }
  });

  entries.sort(function (a, b) { return a.file < b.file ? 1 : a.file > b.file ? -1 : 0; });
  return entries;
}

function latestBackup(dataset) {
  return listBackups(dataset)[0] || null;
}

function prune(dataset) {
  const keep = keepCount();
  const entries = listBackups(dataset);
  entries.slice(keep).forEach(function (entry) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, entry.file)); } catch (ignore) { /* best effort */ }
  });
}

/**
 * Restores a backup over the live file. The current file is itself backed up
 * first, so a restore is always reversible.
 */
function restoreBackup(fileName) {
  const entry = parseName(path.basename(fileName || ''));
  if (!entry) {
    throw new store.StoreError('BAD_BACKUP', 'That is not a recognised backup file name.');
  }
  const source = path.join(BACKUP_DIR, entry.file);
  if (!fs.existsSync(source)) {
    throw new store.StoreError('NOT_FOUND', 'That backup no longer exists.');
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(source, 'utf8'));
  } catch (err) {
    throw new store.StoreError('CORRUPT_FILE', 'That backup is not valid JSON and cannot be restored.');
  }

  createBackup(entry.dataset, 'before-restore');

  const def = store.definition(entry.dataset);
  const current = safeRevision(entry.dataset);
  const payload = parsed && Object.prototype.hasOwnProperty.call(parsed, def.key)
    ? parsed[def.key]
    : (def.singleton ? {} : []);
  const body = { revision: current + 1, updatedAt: new Date().toISOString() };
  body[def.key] = payload;
  store.writeFileAtomic(store.datasetFile(entry.dataset), body);

  return { dataset: entry.dataset, file: entry.file, revision: body.revision };
}

function safeRevision(dataset) {
  try {
    return Number(store.read(dataset).revision) || 1;
  } catch (err) {
    return 1;
  }
}

module.exports = {
  createBackup: createBackup,
  createFullBackup: createFullBackup,
  listBackups: listBackups,
  latestBackup: latestBackup,
  restoreBackup: restoreBackup,
  prune: prune,
  timestamp: timestamp
};
