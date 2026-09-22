'use strict';

/**
 * Minimal, dependency-free CSV support (RFC 4180 style) so roadmap data can be
 * opened in Excel without Excel ever becoming the storage format.
 */

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function stringify(columns, rows) {
  const header = columns.map(function (c) { return escapeCell(c.header); }).join(',');
  const body = rows.map(function (row) {
    return columns.map(function (c) { return escapeCell(c.value(row)); }).join(',');
  });
  // BOM keeps Excel happy with accented characters.
  return '﻿' + [header].concat(body).join('\r\n') + '\r\n';
}

function parse(text) {
  const input = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      cell += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue; }
    cell += ch; i += 1;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(function (h) { return String(h).trim(); });
  const records = [];
  rows.slice(1).forEach(function (values) {
    if (values.every(function (v) { return String(v).trim() === ''; })) return;
    const record = {};
    headers.forEach(function (header, index) {
      record[header] = values[index] === undefined ? '' : values[index];
    });
    records.push(record);
  });
  return { headers: headers, rows: records };
}

module.exports = { stringify: stringify, parse: parse, escapeCell: escapeCell };
