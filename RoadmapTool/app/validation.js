'use strict';

/**
 * Server-side validation. Nothing reaches a data file without passing through
 * here: malformed input must never be able to damage an existing dataset.
 *
 * Every validator returns { ok, errors: [{field, message}], record }.
 * `record` is a cleaned copy - unknown fields are kept (so the format can grow)
 * but known fields are coerced to the right shape.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function result(errors, record) {
  return { ok: errors.length === 0, errors: errors, record: record };
}

function str(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function trimmed(value) {
  return str(value).trim();
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'Yes' || value === 'yes';
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function isIsoDate(value) {
  if (!ISO_DATE.test(str(value))) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function optionalDate(errors, value, field, label) {
  const v = trimmed(value);
  if (!v) return '';
  if (!isIsoDate(v)) {
    errors.push({ field: field, message: label + ' must be a valid date (YYYY-MM-DD).' });
    return '';
  }
  return v;
}

function requireText(errors, value, field, label) {
  const v = trimmed(value);
  if (!v) errors.push({ field: field, message: label + ' is required.' });
  return v;
}

function stamp(record, existing, editor) {
  const now = new Date().toISOString();
  const who = trimmed(editor) || 'Unknown';
  record.createdAt = (existing && existing.createdAt) || record.createdAt || now;
  record.createdBy = (existing && existing.createdBy) || record.createdBy || who;
  record.updatedAt = now;
  record.updatedBy = who;
  return record;
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

function validateProgramme(input, context) {
  const errors = [];
  const ctx = context || {};
  const src = input || {};
  const record = Object.assign({}, ctx.existing || {}, src);

  record.id = trimmed(record.id);
  record.name = requireText(errors, record.name, 'name', 'Programme name');
  record.shortName = trimmed(record.shortName) || record.name.slice(0, 40);
  record.description = str(record.description);
  record.businessOutcome = str(record.businessOutcome);
  record.owner = trimmed(record.owner);
  record.status = trimmed(record.status);
  record.priority = trimmed(record.priority);
  record.colour = trimmed(record.colour) || '#2563eb';
  record.notes = str(record.notes);

  if (record.colour && !/^#[0-9a-fA-F]{6}$/.test(record.colour)) {
    errors.push({ field: 'colour', message: 'Colour must be a hex value such as #2563eb.' });
  }
  checkUniqueId(errors, record.id, ctx);

  stamp(record, ctx.existing, ctx.editor);
  return result(errors, record);
}

/* ------------------------------------------------------------------ */
/* Roadmap item                                                        */
/* ------------------------------------------------------------------ */

function validateRoadmapItem(input, context) {
  const errors = [];
  const ctx = context || {};
  const src = input || {};
  const record = Object.assign({}, ctx.existing || {}, src);

  record.id = trimmed(record.id);
  record.title = requireText(errors, record.title, 'title', 'Title');
  record.shortTitle = trimmed(record.shortTitle) || record.title.slice(0, 40);
  record.programmeId = trimmed(record.programmeId);

  if (!record.programmeId) {
    errors.push({ field: 'programmeId', message: 'A roadmap item must belong to a programme.' });
  } else if (Array.isArray(ctx.programmes) && !ctx.programmes.some(function (p) { return p.id === record.programmeId; })) {
    errors.push({ field: 'programmeId', message: 'Programme ' + record.programmeId + ' does not exist.' });
  }

  // Systems and types are multi-select. Records written by an older version
  // carried a single value, so those are folded into the list on first save.
  record.systemAreas = idList(record.systemAreas, record.systemArea);
  record.types = idList(record.types, record.type);
  delete record.systemArea;
  delete record.type;
  record.subArea = trimmed(record.subArea);
  record.stream = trimmed(record.stream);
  record.status = trimmed(record.status);
  record.priority = trimmed(record.priority);
  record.currentPhase = trimmed(record.currentPhase);

  record.startDate = optionalDate(errors, record.startDate, 'startDate', 'Start date');
  record.endDate = optionalDate(errors, record.endDate, 'endDate', 'End date');
  record.targetDate = optionalDate(errors, record.targetDate, 'targetDate', 'Target date');

  if (record.startDate && record.endDate && record.endDate < record.startDate) {
    errors.push({ field: 'endDate', message: 'End date must be the same as, or after, the start date.' });
  }

  ['description', 'businessOutcome', 'problemStatement',
    'systemDependencies', 'businessDependencies', 'dataDependencies', 'recommendedApproach',
    'tradeOffs', 'pocNotes', 'comments', 'notes'].forEach(function (field) {
    record[field] = str(record[field]);
  });
  // The scope section was removed from the tool; drop it from stored records.
  ['scope', 'outOfScope', 'assumptions'].forEach(function (field) { delete record[field]; });

  ['businessOwner', 'productOwner', 'technicalOwner', 'deliveryOwner', 'owner'].forEach(function (field) {
    record[field] = trimmed(record[field]);
  });
  if (!record.owner) record.owner = record.deliveryOwner || record.productOwner || record.businessOwner || '';

  record.backlogId = trimmed(record.backlogId);
  record.milestones = validateChildList(errors, record.milestones, 'milestones', validateMilestone);
  record.risks = validateChildList(errors, record.risks, 'risks', validateRisk);
  record.gates = validateChildList(errors, record.gates, 'gates', validateGate);
  record.tasks = validateChildList(errors, tasksOf(record), 'tasks', function (child, errs, field) {
    return validateTask(child, errs, field, record.id);
  });
  delete record.tickets;
  record.estimates = validateEstimates(record.estimates);

  checkUniqueId(errors, record.id, ctx);
  stamp(record, ctx.existing, ctx.editor);
  return result(errors, record);
}

function validateChildList(errors, value, label, validator) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(function (child, index) {
    const cleaned = validator(child || {}, errors, label + '[' + index + ']');
    if (cleaned.id) {
      if (seen.has(cleaned.id)) {
        errors.push({ field: label, message: 'Duplicate id ' + cleaned.id + ' in ' + label + '.' });
      }
      seen.add(cleaned.id);
    }
    return cleaned;
  });
}

function validateMilestone(child, errors, field) {
  return {
    id: trimmed(child.id),
    name: trimmed(child.name),
    date: optionalDate(errors, child.date, field, 'Milestone date'),
    status: trimmed(child.status),
    notes: str(child.notes)
  };
}

function validateRisk(child, errors, field) {
  const out = {
    id: trimmed(child.id),
    title: trimmed(child.title),
    description: str(child.description),
    impact: trimmed(child.impact),
    probability: trimmed(child.probability),
    mitigation: str(child.mitigation),
    owner: trimmed(child.owner),
    status: trimmed(child.status) || 'open'
  };
  if (!out.title) errors.push({ field: field, message: 'Every risk needs a title.' });
  return out;
}

function validateGate(child, errors, field) {
  const out = {
    id: trimmed(child.id),
    title: trimmed(child.title),
    description: str(child.description),
    owner: trimmed(child.owner),
    requiredByDate: optionalDate(errors, child.requiredByDate, field, 'Required-by date'),
    status: trimmed(child.status) || 'open',
    decision: str(child.decision),
    decisionDate: optionalDate(errors, child.decisionDate, field, 'Decision date'),
    notes: str(child.notes)
  };
  if (!out.title) errors.push({ field: field, message: 'Every decision or gate needs a title.' });
  return out;
}

/**
 * Tasks are level 3 of the roadmap: the work under a system change. Effort is
 * captured here and rolls up to the system change and then to the programme.
 */
function validateTask(child, errors, field, roadmapItemId) {
  const out = {
    id: trimmed(child.id),
    roadmapItemId: trimmed(child.roadmapItemId) || trimmed(roadmapItemId),
    name: trimmed(child.name) || trimmed(child.title),
    description: str(child.description),
    status: trimmed(child.status),
    owner: trimmed(child.owner),
    stream: trimmed(child.stream),
    okrIds: idList(child.okrIds, ''),
    links: cleanLinks(errors, child.links, field, child.externalReference),
    days: cleanDays(child.days),
    notes: str(child.notes)
  };
  if (!out.name) errors.push({ field: field, message: 'Every task needs a name.' });
  return out;
}

/** Accepts an older version's tickets as tasks so nothing is lost on upgrade. */
function tasksOf(record) {
  if (Array.isArray(record.tasks) && record.tasks.length) return record.tasks;
  if (Array.isArray(record.tickets) && record.tickets.length) return record.tickets;
  return Array.isArray(record.tasks) ? record.tasks : [];
}

function cleanLinks(errors, value, field, legacyReference) {
  const source = Array.isArray(value) ? value.slice() : [];
  if (!source.length && trimmed(legacyReference)) {
    source.push({ label: trimmed(legacyReference), url: trimmed(legacyReference) });
  }
  return source.map(function (entry) {
    const raw = (entry && typeof entry === 'object') ? entry : { url: entry };
    const url = trimmed(raw.url);
    const label = trimmed(raw.label) || url;
    return { label: label, url: url };
  }).filter(function (entry) { return entry.label || entry.url; });
}

function cleanDays(value) {
  const src = (value && typeof value === 'object') ? value : {};
  const days = {};
  Object.keys(src).forEach(function (key) {
    const amount = num(src[key], 0);
    days[key] = amount < 0 ? 0 : amount;
  });
  return days;
}

/** Normalises a multi-select value, tolerating a single legacy string. */
function idList(value, legacySingle) {
  const source = Array.isArray(value) ? value : (value ? [value] : []);
  const list = source.slice();
  const single = trimmed(legacySingle);
  if (!list.length && single) list.push(single);
  const seen = new Set();
  const out = [];
  list.forEach(function (entry) {
    const id = trimmed(entry);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function validateEstimates(value) {
  const src = (value && typeof value === 'object') ? value : {};
  return { fast: estimateOption(src.fast), standard: estimateOption(src.standard) };
}

function estimateOption(option) {
  const src = (option && typeof option === 'object') ? option : {};
  const days = {};
  const srcDays = (src.days && typeof src.days === 'object') ? src.days : {};
  Object.keys(srcDays).forEach(function (key) {
    const value = num(srcDays[key], 0);
    days[key] = value < 0 ? 0 : value;
  });
  return { days: days, risk: str(src.risk), notes: str(src.notes) };
}

/* ------------------------------------------------------------------ */
/* Dependency                                                          */
/* ------------------------------------------------------------------ */

function validateDependency(input, context) {
  const errors = [];
  const warnings = [];
  const ctx = context || {};
  const record = Object.assign({}, ctx.existing || {}, input || {});

  record.id = trimmed(record.id);
  record.fromItemId = requireText(errors, record.fromItemId, 'fromItemId', 'The "from" roadmap item');
  record.toItemId = requireText(errors, record.toItemId, 'toItemId', 'The "to" roadmap item');
  record.dependencyType = trimmed(record.dependencyType);
  record.description = str(record.description);
  record.status = trimmed(record.status) || 'open';
  record.owner = trimmed(record.owner);
  record.blocking = bool(record.blocking);
  record.notes = str(record.notes);

  const items = Array.isArray(ctx.roadmapItems) ? ctx.roadmapItems : null;
  if (items) {
    if (record.fromItemId && !items.some(function (i) { return i.id === record.fromItemId; })) {
      errors.push({ field: 'fromItemId', message: 'Roadmap item ' + record.fromItemId + ' does not exist.' });
    }
    if (record.toItemId && !items.some(function (i) { return i.id === record.toItemId; })) {
      errors.push({ field: 'toItemId', message: 'Roadmap item ' + record.toItemId + ' does not exist.' });
    }
  }

  if (record.fromItemId && record.fromItemId === record.toItemId) {
    errors.push({ field: 'toItemId', message: 'An item cannot depend on itself.' });
  }

  if (Array.isArray(ctx.dependencies)) {
    const duplicate = ctx.dependencies.some(function (d) {
      return d.id !== record.id && d.fromItemId === record.fromItemId && d.toItemId === record.toItemId;
    });
    if (duplicate) {
      warnings.push({ field: 'toItemId', message: 'A dependency between these two items already exists.' });
    }
  }

  checkUniqueId(errors, record.id, ctx);
  stamp(record, ctx.existing, ctx.editor);
  const out = result(errors, record);
  out.warnings = warnings;
  return out;
}

/* ------------------------------------------------------------------ */
/* Backlog                                                             */
/* ------------------------------------------------------------------ */

function validateBacklogItem(input, context) {
  const errors = [];
  const ctx = context || {};
  const record = Object.assign({}, ctx.existing || {}, input || {});

  record.id = trimmed(record.id);
  record.change = requireText(errors, record.change, 'change', 'Change');
  record.programme = trimmed(record.programme);
  record.systemArea = trimmed(record.systemArea);
  record.subAreaDepartment = trimmed(record.subAreaDepartment);
  record.type = trimmed(record.type);
  record.currentStatus = trimmed(record.currentStatus);
  record.dependencyPrerequisite = str(record.dependencyPrerequisite);
  record.otherSystemsImpacted = str(record.otherSystemsImpacted);
  record.processesImpacted = str(record.processesImpacted);
  record.owner = trimmed(record.owner);
  record.priority = trimmed(record.priority);
  record.comment = str(record.comment);
  record.promoted = bool(record.promoted);
  record.roadmapItemId = trimmed(record.roadmapItemId);

  // Optional dates and effort, so a backlog item can be costed and included
  // in a resource scenario before it is scheduled on the roadmap.
  record.startDate = optionalDate(errors, record.startDate, 'startDate', 'Start date');
  record.endDate = optionalDate(errors, record.endDate, 'endDate', 'End date');
  if (record.startDate && record.endDate && record.endDate < record.startDate) {
    errors.push({ field: 'endDate', message: 'End date must be the same as, or after, the start date.' });
  }
  record.stream = trimmed(record.stream);
  record.days = cleanDays(record.days);

  checkUniqueId(errors, record.id, ctx);
  stamp(record, ctx.existing, ctx.editor);
  return result(errors, record);
}

/* ------------------------------------------------------------------ */
/* Resource scenario                                                   */
/* ------------------------------------------------------------------ */

function validateResourceScenario(input, context) {
  const errors = [];
  const ctx = context || {};
  const record = Object.assign({}, ctx.existing || {}, input || {});

  record.id = trimmed(record.id);
  record.name = requireText(errors, record.name, 'name', 'Scenario name');
  record.description = str(record.description);
  record.active = bool(record.active);

  // Capacity is planned per stream, per resource type, per month:
  //   allocations[streamId][resourceTypeId]["2026-10"] = 1.5 (FTE)
  record.allocations = cleanAllocations(errors, record.allocations, record.resources);
  delete record.resources;

  // Backlog items chosen to count towards this scenario's demand.
  record.includedBacklogIds = idList(record.includedBacklogIds, '');

  checkUniqueId(errors, record.id, ctx);
  stamp(record, ctx.existing, ctx.editor);
  return result(errors, record);
}

/**
 * Cleans the monthly capacity grid. A scenario written by an older version
 * carried one figure per resource type with no stream or month; that is kept
 * as an "unassigned stream" baseline rather than thrown away.
 */
function cleanAllocations(errors, value, legacyResources) {
  const out = {};
  const source = (value && typeof value === 'object') ? value : {};

  Object.keys(source).forEach(function (streamId) {
    const stream = (source[streamId] && typeof source[streamId] === 'object') ? source[streamId] : {};
    const cleanedStream = {};
    Object.keys(stream).forEach(function (typeId) {
      const months = (stream[typeId] && typeof stream[typeId] === 'object') ? stream[typeId] : {};
      const cleanedMonths = {};
      Object.keys(months).forEach(function (month) {
        if (!/^\d{4}-\d{2}$/.test(month)) {
          errors.push({ field: 'allocations', message: 'Month "' + month + '" must be written as YYYY-MM.' });
          return;
        }
        const amount = num(months[month], 0);
        if (amount < 0) {
          errors.push({ field: 'allocations', message: 'Capacity cannot be negative (' + month + ').' });
          return;
        }
        if (amount === 0) return; // an empty cell is simply not stored
        cleanedMonths[month] = amount;
      });
      if (Object.keys(cleanedMonths).length) cleanedStream[trimmed(typeId)] = cleanedMonths;
    });
    if (Object.keys(cleanedStream).length) out[trimmed(streamId)] = cleanedStream;
  });

  if (!Object.keys(out).length && legacyResources && typeof legacyResources === 'object') {
    const months = upcomingMonths(24);
    const baseline = {};
    Object.keys(legacyResources).forEach(function (typeId) {
      const amount = num(legacyResources[typeId], 0);
      if (amount <= 0) return;
      const monthly = {};
      months.forEach(function (month) { monthly[month] = amount; });
      baseline[trimmed(typeId)] = monthly;
    });
    if (Object.keys(baseline).length) out.unassigned = baseline;
  }
  return out;
}

/** The current month and the following ones, as YYYY-MM. */
function upcomingMonths(count) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(year + '-' + String(month).padStart(2, '0'));
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const OPTION_LISTS = ['systems', 'itemTypes', 'statuses', 'priorities', 'milestoneTypes',
  'dependencyTypes', 'resourceTypes', 'resourceStreams', 'people'];

function validateSettings(input, context) {
  const errors = [];
  const ctx = context || {};
  const base = ctx.existing || {};
  const record = Object.assign({}, base, input || {});

  record.appName = trimmed(record.appName) || 'Roadmap Tool';
  record.organisation = trimmed(record.organisation);

  const port = num(record.port, 4310);
  if (port < 1 || port > 65535) {
    errors.push({ field: 'port', message: 'Port must be between 1 and 65535.' });
  }
  record.port = Math.round(port);
  record.host = trimmed(record.host) || '0.0.0.0';

  record.defaultView = trimmed(record.defaultView) || 'roadmap';
  record.defaultRoadmapMode = record.defaultRoadmapMode === 'executive' ? 'executive' : 'detailed';
  record.defaultTimescale = ['month', 'quarter', 'year'].indexOf(record.defaultTimescale) >= 0 ? record.defaultTimescale : 'month';
  record.roadmapStart = optionalDate(errors, record.roadmapStart, 'roadmapStart', 'Roadmap start');
  record.roadmapEnd = optionalDate(errors, record.roadmapEnd, 'roadmapEnd', 'Roadmap end');
  if (record.roadmapStart && record.roadmapEnd && record.roadmapEnd < record.roadmapStart) {
    errors.push({ field: 'roadmapEnd', message: 'Roadmap end must be after roadmap start.' });
  }
  record.showMilestones = bool(record.showMilestones);
  record.showTodayLine = bool(record.showTodayLine);
  record.backupsToKeep = Math.max(1, Math.min(500, Math.round(num(record.backupsToKeep, 50))));
  record.auditEntriesToKeep = Math.max(100, Math.min(50000, Math.round(num(record.auditEntriesToKeep, 5000))));
  record.workingDaysPerMonth = Math.max(1, Math.min(31, num(record.workingDaysPerMonth, 21)));
  record.settingsPassword = str(record.settingsPassword);

  OPTION_LISTS.forEach(function (listName) {
    record[listName] = cleanOptionList(errors, record[listName], listName);
  });

  record.quarters = cleanQuarters(errors, record.quarters);
  record.okrs = cleanOkrs(errors, record.okrs);
  return result(errors, record);
}

/** OKRs have two levels: objectives, each with its own key results. */
function cleanOkrs(errors, value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  value.forEach(function (entry) {
    const src = (entry && typeof entry === 'object') ? entry : { name: entry };
    const name = trimmed(src.name);
    if (!name) return;
    const id = trimmed(src.id) || slugify(name);
    if (seen.has(id)) {
      errors.push({ field: 'okrs', message: 'Duplicate objective "' + name + '".' });
      return;
    }
    seen.add(id);
    const children = [];
    (Array.isArray(src.children) ? src.children : []).forEach(function (child) {
      const childSrc = (child && typeof child === 'object') ? child : { name: child };
      const childName = trimmed(childSrc.name);
      if (!childName) return;
      const childId = trimmed(childSrc.id) || slugify(childName);
      if (seen.has(childId)) {
        errors.push({ field: 'okrs', message: 'Duplicate key result "' + childName + '".' });
        return;
      }
      seen.add(childId);
      children.push({ id: childId, name: childName, active: childSrc.active === undefined ? true : bool(childSrc.active) });
    });
    out.push({ id: id, name: name, active: src.active === undefined ? true : bool(src.active), children: children });
  });
  return out;
}

function cleanOptionList(errors, value, listName) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  value.forEach(function (option) {
    const src = (option && typeof option === 'object') ? option : { name: option };
    const name = trimmed(src.name);
    if (!name) return;
    const id = trimmed(src.id) || slugify(name);
    if (seen.has(id)) {
      errors.push({ field: listName, message: 'Duplicate entry "' + name + '" in ' + listName + '.' });
      return;
    }
    seen.add(id);
    const entry = { id: id, name: name, active: src.active === undefined ? true : bool(src.active) };
    if (src.colour) {
      const colour = trimmed(src.colour);
      if (!/^#[0-9a-fA-F]{6}$/.test(colour)) {
        errors.push({ field: listName, message: 'Colour for "' + name + '" must be a hex value such as #2563eb.' });
      } else {
        entry.colour = colour;
      }
    }
    out.push(entry);
  });
  return out;
}

function cleanQuarters(errors, value) {
  if (!Array.isArray(value) || value.length === 0) return [];
  const out = [];
  value.forEach(function (q, index) {
    const src = (q && typeof q === 'object') ? q : {};
    const name = trimmed(src.name) || 'Q' + (index + 1);
    const entry = {
      id: trimmed(src.id) || slugify(name),
      name: name,
      startMonth: Math.round(num(src.startMonth, 1)),
      startDay: Math.round(num(src.startDay, 1)),
      endMonth: Math.round(num(src.endMonth, 3)),
      endDay: Math.round(num(src.endDay, 31))
    };
    if (entry.startMonth < 1 || entry.startMonth > 12 || entry.endMonth < 1 || entry.endMonth > 12) {
      errors.push({ field: 'quarters', message: name + ': month must be between 1 and 12.' });
    }
    if (entry.startDay < 1 || entry.startDay > 31 || entry.endDay < 1 || entry.endDay > 31) {
      errors.push({ field: 'quarters', message: name + ': day must be between 1 and 31.' });
    }
    out.push(entry);
  });
  return out;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function checkUniqueId(errors, id, ctx) {
  if (!id || !Array.isArray(ctx.siblings)) return;
  const clash = ctx.siblings.some(function (record) {
    return record && record.id === id && record !== ctx.existing;
  });
  if (clash) {
    errors.push({ field: 'id', message: 'Id ' + id + ' is already in use.' });
  }
}

const VALIDATORS = {
  programmes: validateProgramme,
  roadmapItems: validateRoadmapItem,
  dependencies: validateDependency,
  backlog: validateBacklogItem,
  resourceScenarios: validateResourceScenario,
  settings: validateSettings
};

function validate(dataset, input, context) {
  const validator = VALIDATORS[dataset];
  if (!validator) {
    return result([{ field: 'dataset', message: 'Dataset ' + dataset + ' cannot be edited directly.' }], null);
  }
  return validator(input, context);
}

/**
 * Whole-dataset check used by imports and restores. Everything is validated
 * before a single byte is written, so a bad import cannot half-apply.
 */
function validateBundle(bundle) {
  const errors = [];
  const cleaned = {};
  const programmes = Array.isArray(bundle.programmes) ? bundle.programmes : [];
  const roadmapItems = Array.isArray(bundle.roadmapItems) ? bundle.roadmapItems : [];

  cleaned.programmes = runList('programmes', programmes, errors, function (record, siblings) {
    return validateProgramme(record, { siblings: siblings, editor: bundle.editor, existing: record });
  });
  cleaned.roadmapItems = runList('roadmapItems', roadmapItems, errors, function (record, siblings) {
    return validateRoadmapItem(record, { siblings: siblings, programmes: programmes, editor: bundle.editor, existing: record });
  });
  cleaned.dependencies = runList('dependencies', bundle.dependencies || [], errors, function (record, siblings) {
    return validateDependency(record, { siblings: siblings, roadmapItems: roadmapItems, dependencies: siblings, editor: bundle.editor, existing: record });
  });
  cleaned.backlog = runList('backlog', bundle.backlog || [], errors, function (record, siblings) {
    return validateBacklogItem(record, { siblings: siblings, editor: bundle.editor, existing: record });
  });
  cleaned.resourceScenarios = runList('resourceScenarios', bundle.resourceScenarios || [], errors, function (record, siblings) {
    return validateResourceScenario(record, { siblings: siblings, editor: bundle.editor, existing: record });
  });

  if (bundle.settings) {
    const settings = validateSettings(bundle.settings, { existing: bundle.settings });
    settings.errors.forEach(function (e) { errors.push({ dataset: 'settings', field: e.field, message: e.message }); });
    cleaned.settings = settings.record;
  }

  return { ok: errors.length === 0, errors: errors, data: cleaned };
}

function runList(dataset, list, errors, validator) {
  if (!Array.isArray(list)) return [];
  const accepted = [];
  list.forEach(function (record, index) {
    const outcome = validator(record || {}, accepted);
    if (!outcome.record.id) {
      errors.push({ dataset: dataset, row: index + 1, field: 'id', message: 'Record is missing an id.' });
      return;
    }
    outcome.errors.forEach(function (e) {
      errors.push({ dataset: dataset, row: index + 1, recordId: outcome.record.id, field: e.field, message: e.message });
    });
    accepted.push(outcome.record);
  });
  return accepted;
}

module.exports = {
  validate: validate,
  validateProgramme: validateProgramme,
  validateRoadmapItem: validateRoadmapItem,
  validateDependency: validateDependency,
  validateBacklogItem: validateBacklogItem,
  validateResourceScenario: validateResourceScenario,
  validateSettings: validateSettings,
  validateBundle: validateBundle,
  isIsoDate: isIsoDate,
  slugify: slugify,
  bool: bool,
  num: num,
  trimmed: trimmed
};
