'use strict';

/**
 * Column definitions shared by CSV export and CSV import.
 *
 * `kind` decides how a value is translated:
 *   text   - stored as-is
 *   date   - ISO date (YYYY-MM-DD)
 *   bool   - Yes / No
 *   option - stored as a settings id, shown as the settings name
 *   fast/standard days - effort per resource type
 */

function baseSchema(dataset) {
  switch (dataset) {
    case 'programmes':
      return [
        col('Id', 'id'),
        col('Name', 'name'),
        col('Short Name', 'shortName'),
        col('Description', 'description'),
        col('Business Outcome', 'businessOutcome'),
        col('Owner', 'owner'),
        option('Status', 'status', 'statuses'),
        option('Priority', 'priority', 'priorities'),
        col('Colour', 'colour'),
        col('Notes', 'notes'),
        col('Created At', 'createdAt'),
        col('Created By', 'createdBy'),
        col('Updated At', 'updatedAt'),
        col('Updated By', 'updatedBy')
      ];
    case 'roadmapItems':
      return [
        col('Id', 'id'),
        col('Programme Id', 'programmeId'),
        col('Title', 'title'),
        col('Short Title', 'shortTitle'),
        options('Systems', 'systemAreas', 'systems'),
        col('Sub Area', 'subArea'),
        options('Types', 'types', 'itemTypes'),
        option('Stream', 'stream', 'resourceStreams'),
        option('Status', 'status', 'statuses'),
        option('Priority', 'priority', 'priorities'),
        option('Current Phase', 'currentPhase', 'milestoneTypes'),
        date('Start Date', 'startDate'),
        date('End Date', 'endDate'),
        date('Target Date', 'targetDate'),
        col('Business Owner', 'businessOwner'),
        col('Product Owner', 'productOwner'),
        col('Technical Owner', 'technicalOwner'),
        col('Delivery Owner', 'deliveryOwner'),
        col('Description', 'description'),
        col('Business Outcome', 'businessOutcome'),
        col('Problem Statement', 'problemStatement'),
        col('System Dependencies', 'systemDependencies'),
        col('Business Dependencies', 'businessDependencies'),
        col('Data Dependencies', 'dataDependencies'),
        col('Recommended Approach', 'recommendedApproach'),
        col('Trade Offs', 'tradeOffs'),
        col('POC Notes', 'pocNotes'),
        col('Comments', 'comments'),
        col('Notes', 'notes'),
        col('Fast MVP Risk', 'estimates.fast.risk'),
        col('Fast MVP Notes', 'estimates.fast.notes'),
        col('Standard Risk', 'estimates.standard.risk'),
        col('Standard Notes', 'estimates.standard.notes')
      ];
    case 'dependencies':
      return [
        col('Id', 'id'),
        col('From Item Id', 'fromItemId'),
        col('To Item Id', 'toItemId'),
        option('Type', 'dependencyType', 'dependencyTypes'),
        col('Description', 'description'),
        bool('Blocking', 'blocking'),
        option('Status', 'status', 'statuses'),
        col('Owner', 'owner'),
        col('Notes', 'notes')
      ];
    case 'backlog':
      return [
        col('Id', 'id'),
        col('Programme', 'programme'),
        option('System Area', 'systemArea', 'systems'),
        col('Sub Area / Department', 'subAreaDepartment'),
        col('Change', 'change'),
        option('Type', 'type', 'itemTypes'),
        option('Current Status', 'currentStatus', 'statuses'),
        col('Dependency / Prerequisite', 'dependencyPrerequisite'),
        col('Other Systems Impacted', 'otherSystemsImpacted'),
        col('Processes Impacted', 'processesImpacted'),
        col('Owner', 'owner'),
        option('Priority', 'priority', 'priorities'),
        col('Comment', 'comment'),
        bool('Promoted', 'promoted'),
        col('Roadmap Item Id', 'roadmapItemId')
      ];
    default:
      return null;
  }
}

function col(header, field) { return { header: header, field: field, kind: 'text' }; }
function options(header, field, listName) { return { header: header, field: field, kind: 'options', list: listName }; }
function date(header, field) { return { header: header, field: field, kind: 'date' }; }
function bool(header, field) { return { header: header, field: field, kind: 'bool' }; }
function option(header, field, listName) { return { header: header, field: field, kind: 'option', list: listName }; }

/** Adds the per-resource-type effort columns configured in Settings. */
function schemaFor(dataset, settings) {
  const base = baseSchema(dataset);
  if (!base) return null;
  if (dataset !== 'roadmapItems') return base;

  const resourceTypes = (settings && Array.isArray(settings.resourceTypes)) ? settings.resourceTypes : [];
  const extra = [];
  resourceTypes.forEach(function (type) {
    extra.push({ header: 'Fast ' + type.name + ' Days', field: 'estimates.fast.days.' + type.id, kind: 'number' });
  });
  resourceTypes.forEach(function (type) {
    extra.push({ header: 'Standard ' + type.name + ' Days', field: 'estimates.standard.days.' + type.id, kind: 'number' });
  });
  return base.concat(extra);
}

function getPath(record, field) {
  return field.split('.').reduce(function (acc, key) {
    return (acc && typeof acc === 'object') ? acc[key] : undefined;
  }, record);
}

function setPath(record, field, value) {
  const parts = field.split('.');
  let node = record;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function optionName(settings, listName, id) {
  const list = (settings && Array.isArray(settings[listName])) ? settings[listName] : [];
  const match = list.find(function (entry) { return entry.id === id; });
  return match ? match.name : (id || '');
}

function optionId(settings, listName, value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) return '';
  const list = (settings && Array.isArray(settings[listName])) ? settings[listName] : [];
  const byId = list.find(function (entry) { return entry.id.toLowerCase() === text.toLowerCase(); });
  if (byId) return byId.id;
  const byName = list.find(function (entry) { return entry.name.toLowerCase() === text.toLowerCase(); });
  if (byName) return byName.id;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function toCell(column, record, settings) {
  const raw = getPath(record, column.field);
  switch (column.kind) {
    case 'bool': return raw ? 'Yes' : 'No';
    case 'option': return optionName(settings, column.list, raw);
    case 'options':
      return (Array.isArray(raw) ? raw : (raw ? [raw] : []))
        .map(function (id) { return optionName(settings, column.list, id); })
        .join('; ');
    case 'number': return raw === undefined || raw === null || raw === '' ? '' : String(raw);
    default: return raw === undefined || raw === null ? '' : String(raw);
  }
}

function fromCell(column, value, settings) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  switch (column.kind) {
    case 'bool': return /^(yes|true|y|1)$/i.test(text);
    case 'option': return optionId(settings, column.list, text);
    case 'options':
      return text
        .split(/\s*[;|]\s*/)
        .filter(Boolean)
        .map(function (part) { return optionId(settings, column.list, part); });
    case 'number': {
      if (!text) return 0;
      const n = Number(text);
      return Number.isFinite(n) ? n : 0;
    }
    default: return value === undefined || value === null ? '' : String(value);
  }
}

/**
 * Tasks live inside their roadmap item, so they get a flattened export of
 * their own. There is no task CSV import - tasks are edited on the item.
 */
function taskColumns(settings) {
  const resourceTypes = (settings && Array.isArray(settings.resourceTypes)) ? settings.resourceTypes : [];
  return [
    col('Task Id', 'id'),
    col('Roadmap Item Id', 'roadmapItemId'),
    col('Roadmap Item', 'roadmapItemTitle'),
    col('Programme', 'programmeName'),
    col('Task', 'name'),
    option('Status', 'status', 'statuses'),
    col('Owner', 'owner'),
    option('Stream', 'stream', 'resourceStreams'),
    col('OKRs', 'okrNames'),
    col('Links', 'linkText'),
    col('Description', 'description')
  ].concat(resourceTypes.map(function (type) {
    return { header: type.name + ' Days', field: 'days.' + type.id, kind: 'number' };
  }));
}

module.exports = {
  schemaFor: schemaFor,
  taskColumns: taskColumns,
  toCell: toCell,
  fromCell: fromCell,
  getPath: getPath,
  setPath: setPath,
  optionName: optionName,
  optionId: optionId
};
