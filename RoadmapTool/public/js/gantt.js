'use strict';

/**
 * Timeline maths and rendering for the roadmap Gantt.
 *
 * The timeline is a list of equal-width columns (months, quarters or years).
 * A date maps to a pixel position by finding its column and interpolating
 * inside it, which keeps bars exactly aligned with the grid.
 */
(function (RM) {
  const COLUMN_WIDTH = { month: 92, quarter: 120, year: 150 };

  /* ---------------------------------------------------------------- */
  /* Quarter handling (boundaries come from Settings)                  */
  /* ---------------------------------------------------------------- */

  function quarterDefinitions() {
    const quarters = RM.settings().quarters;
    if (Array.isArray(quarters) && quarters.length) return quarters;
    return [
      { id: 'q1', name: 'Q1', startMonth: 1, startDay: 1, endMonth: 3, endDay: 31 },
      { id: 'q2', name: 'Q2', startMonth: 4, startDay: 1, endMonth: 6, endDay: 30 },
      { id: 'q3', name: 'Q3', startMonth: 7, startDay: 1, endMonth: 9, endDay: 30 },
      { id: 'q4', name: 'Q4', startMonth: 10, startDay: 1, endMonth: 12, endDay: 31 }
    ];
  }

  /** Builds concrete quarter periods (with real dates) covering a year span. */
  function quarterPeriods(fromYear, toYear) {
    const definitions = quarterDefinitions();
    const periods = [];
    for (let year = fromYear - 1; year <= toYear + 1; year += 1) {
      definitions.forEach(function (definition) {
        const start = new Date(year, definition.startMonth - 1, definition.startDay);
        // A quarter whose end month is before its start month runs into the next year.
        const endYear = (definition.endMonth < definition.startMonth ||
          (definition.endMonth === definition.startMonth && definition.endDay < definition.startDay))
          ? year + 1 : year;
        const end = new Date(endYear, definition.endMonth - 1, definition.endDay);
        periods.push({
          key: definition.id + '-' + year,
          name: definition.name,
          label: definition.name + ' ' + year,
          year: year,
          start: start,
          endExclusive: RM.dates.addDays(end, 1)
        });
      });
    }
    periods.sort(function (a, b) { return a.start - b.start; });
    return periods;
  }

  function quarterForDate(date, periods) {
    for (let i = 0; i < periods.length; i += 1) {
      if (date >= periods[i].start && date < periods[i].endExclusive) return periods[i];
    }
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return { key: 'cal-' + date.getFullYear() + '-' + quarter, label: 'Q' + quarter + ' ' + date.getFullYear(), year: date.getFullYear() };
  }

  /* ---------------------------------------------------------------- */
  /* Timeline construction                                             */
  /* ---------------------------------------------------------------- */

  /**
   * @param {Array} items    roadmap items being drawn
   * @param {string} scale   month | quarter | year
   */
  function buildTimeline(items, scale) {
    const settings = RM.settings();
    const dates = [];
    (items || []).forEach(function (item) {
      // A system change's window is the span of its tasks, so the timeline has
      // to be wide enough for those, not just for the dates typed on the change.
      const range = RM.itemRange(item);
      if (range.startDate) dates.push(range.startDate);
      if (range.endDate) dates.push(range.endDate);
      if (item.targetDate) dates.push(item.targetDate);
      (item.milestones || []).forEach(function (milestone) {
        if (milestone.date) dates.push(milestone.date);
      });
    });

    let min = settings.roadmapStart || '';
    let max = settings.roadmapEnd || '';
    if (!min || !max) {
      dates.sort();
      if (!min) min = dates[0] || RM.dates.todayIso();
      if (!max) max = dates[dates.length - 1] || RM.dates.todayIso();
    }

    let start = RM.dates.parseIso(min) || new Date();
    let end = RM.dates.parseIso(max) || new Date();
    if (end < start) end = new Date(start.getTime());

    // Always show a little context either side, and never less than a year.
    start = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    end = new Date(end.getFullYear(), end.getMonth() + 2, 0);
    if (RM.dates.daysBetween(start, end) < 330) {
      end = new Date(start.getFullYear() + 1, start.getMonth(), 0);
    }

    const columns = scale === 'year' ? yearColumns(start, end)
      : scale === 'quarter' ? quarterColumns(start, end)
        : monthColumns(start, end);

    const width = COLUMN_WIDTH[scale] || COLUMN_WIDTH.month;
    let offset = 0;
    columns.forEach(function (column) {
      column.left = offset;
      column.width = width;
      offset += width;
    });

    const timeline = {
      scale: scale,
      columns: columns,
      columnWidth: width,
      totalWidth: offset,
      start: columns.length ? columns[0].start : start,
      endExclusive: columns.length ? columns[columns.length - 1].endExclusive : end,
      groups: buildGroups(columns, scale)
    };

    timeline.dateToX = function (date) { return dateToX(timeline, date); };
    timeline.bar = function (startIso, endIso) { return bar(timeline, startIso, endIso); };
    timeline.xToDate = function (x) { return xToDate(timeline, x); };
    timeline.todayX = todayX(timeline);
    return timeline;
  }

  function monthColumns(start, end) {
    const columns = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      columns.push({
        key: 'm-' + cursor.getFullYear() + '-' + cursor.getMonth(),
        label: RM.dates.MONTHS[cursor.getMonth()],
        sublabel: cursor.getMonth() === 0 ? String(cursor.getFullYear()) : '',
        start: new Date(cursor.getTime()),
        endExclusive: next
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return columns;
  }

  function quarterColumns(start, end) {
    const periods = quarterPeriods(start.getFullYear(), end.getFullYear());
    return periods
      .filter(function (period) { return period.endExclusive > start && period.start <= end; })
      .map(function (period) {
        return {
          key: period.key,
          label: period.name,
          sublabel: String(period.year),
          start: period.start,
          endExclusive: period.endExclusive,
          year: period.year
        };
      });
  }

  function yearColumns(start, end) {
    const columns = [];
    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      columns.push({
        key: 'y-' + year,
        label: String(year),
        sublabel: '',
        start: new Date(year, 0, 1),
        endExclusive: new Date(year + 1, 0, 1)
      });
    }
    return columns;
  }

  /** The upper header row: quarters above months, years above quarters. */
  function buildGroups(columns, scale) {
    if (!columns.length) return [];
    if (scale === 'year') return [];
    const periods = scale === 'month'
      ? quarterPeriods(columns[0].start.getFullYear(), columns[columns.length - 1].start.getFullYear())
      : null;

    const groups = [];
    columns.forEach(function (column) {
      const key = scale === 'month'
        ? quarterForDate(column.start, periods)
        : { key: 'y-' + column.start.getFullYear(), label: String(column.start.getFullYear()) };
      const last = groups[groups.length - 1];
      if (last && last.key === key.key) {
        last.width += column.width;
        return;
      }
      groups.push({ key: key.key, label: key.label, left: column.left, width: column.width });
    });
    return groups;
  }

  function dateToX(timeline, date) {
    if (!date) return null;
    const columns = timeline.columns;
    if (!columns.length) return 0;
    if (date <= columns[0].start) return 0;
    const last = columns[columns.length - 1];
    if (date >= last.endExclusive) return timeline.totalWidth;
    for (let i = 0; i < columns.length; i += 1) {
      const column = columns[i];
      if (date >= column.start && date < column.endExclusive) {
        const span = column.endExclusive - column.start;
        return column.left + ((date - column.start) / span) * column.width;
      }
    }
    return timeline.totalWidth;
  }

  function xToDate(timeline, x) {
    const columns = timeline.columns;
    if (!columns.length) return null;
    const clamped = Math.max(0, Math.min(timeline.totalWidth, x));
    for (let i = 0; i < columns.length; i += 1) {
      const column = columns[i];
      if (clamped >= column.left && clamped < column.left + column.width) {
        const ratio = (clamped - column.left) / column.width;
        const span = column.endExclusive - column.start;
        return new Date(column.start.getTime() + ratio * span);
      }
    }
    return new Date(columns[columns.length - 1].endExclusive.getTime() - 86400000);
  }

  /** Pixel geometry for a bar, or null when the item is not scheduled. */
  function bar(timeline, startIso, endIso) {
    const start = RM.dates.parseIso(startIso);
    const end = RM.dates.parseIso(endIso);
    if (!start && !end) return null;
    const from = start || end;
    const to = RM.dates.addDays(end || start, 1); // end date is inclusive
    if (to <= timeline.start || from >= timeline.endExclusive) return null;
    const left = dateToX(timeline, from);
    const right = dateToX(timeline, to);
    return { left: left, width: Math.max(right - left, 8) };
  }

  function todayX(timeline) {
    const today = RM.dates.parseIso(RM.dates.todayIso());
    if (!today || today < timeline.start || today >= timeline.endExclusive) return null;
    return dateToX(timeline, today);
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  function renderHeader(timeline, leftLabel) {
    const el = RM.el;
    const flags = keyDateFlags(timeline);
    const groups = el('div', 'tl-groups', timeline.groups.map(function (group) {
      return el('div', { class: 'tl-group', style: { left: group.left + 'px', width: group.width + 'px' } }, group.label);
    }));
    const cells = el('div', 'tl-cells', timeline.columns.map(function (column) {
      return el('div', { class: 'tl-cell', style: { left: column.left + 'px', width: column.width + 'px' } }, [
        el('span', 'tl-cell-label', column.label),
        column.sublabel ? el('span', 'tl-cell-sub', column.sublabel) : null
      ]);
    }));

    const rows = flags.reduce(function (max, flag) {
      return Math.max(max, Math.round(parseFloat(flag.style.top) / 16) + 1);
    }, 0);
    const extra = rows > 1 ? (rows - 1) * 16 : 0;

    const head = el('div', 'gantt-head', [
      el('div', 'gantt-left gantt-head-left', leftLabel || 'Programme / Change'),
      el('div', {
        class: 'gantt-time gantt-head-time',
        style: { width: timeline.totalWidth + 'px', height: (66 + extra) + 'px' }
      }, [
        flags,
        timeline.groups.length ? groups : null,
        cells
      ])
    ]);
    if (extra) {
      const time = head.querySelector('.gantt-head-time');
      time.querySelector('.tl-groups').style.top = (14 + extra) + 'px';
      time.querySelector('.tl-cells').style.top = (40 + extra) + 'px';
    }
    return head;
  }

  /** The scrolling area: sticky left column, scrolling time axis. */
  function renderShell(timeline, rows, leftLabel) {
    const el = RM.el;
    const body = el('div', 'gantt-body', rows);
    const grid = el('div', 'gantt-grid', [renderHeader(timeline, leftLabel), body]);
    grid.style.setProperty('--col-width', timeline.columnWidth + 'px');
    grid.style.setProperty('--time-width', timeline.totalWidth + 'px');
    return el('div', 'gantt-scroll', grid);
  }

  function timeCell(timeline, children) {
    const cell = RM.el('div', { class: 'gantt-time', style: { width: timeline.totalWidth + 'px' } }, children);
    keyDatePositions(timeline).forEach(function (entry) {
      cell.appendChild(RM.el('div', {
        class: 'key-date-line',
        style: { left: entry.x + 'px', borderColor: entry.colour },
        title: entry.name + ' \u00b7 ' + RM.dates.formatDate(entry.date)
      }));
    });
    if (timeline.todayX !== null && RM.settings().showTodayLine !== false) {
      cell.appendChild(RM.el('div', { class: 'today-line', style: { left: timeline.todayX + 'px' } }));
    }
    return cell;
  }

  /** Key dates that fall inside the visible timeline, with their x position. */
  function keyDatePositions(timeline) {
    if (!RM.state.ui.showKeyDates) return [];
    return RM.keyDates().map(function (entry) {
      const date = RM.dates.parseIso(entry.date);
      if (!date || date < timeline.start || date >= timeline.endExclusive) return null;
      return {
        id: entry.id, name: entry.name, date: entry.date,
        colour: entry.colour || '#b45309',
        x: timeline.dateToX(date)
      };
    }).filter(Boolean).sort(function (a, b) { return a.x - b.x; });
  }

  /**
   * The flags above the timeline. Two key dates close together would sit on
   * top of each other, so they are stacked instead.
   */
  function keyDateFlags(timeline) {
    const entries = keyDatePositions(timeline);
    if (!entries.length) return [];
    const rows = [];
    // The TODAY flag owns the first row where it sits, so nothing lands on it.
    if (timeline.todayX !== null && RM.settings().showTodayLine !== false) {
      rows[0] = timeline.todayX + 26;
    }
    return entries.map(function (entry) {
      const width = Math.min(190, 24 + entry.name.length * 6);
      let row = 0;
      while (rows[row] !== undefined && rows[row] > entry.x - width / 2 - 6) row += 1;
      rows[row] = entry.x + width / 2;
      return RM.el('div', {
        class: 'key-date-flag',
        style: {
          left: entry.x + 'px',
          top: (2 + row * 16) + 'px',
          background: RM.fade(entry.colour, 0.14),
          borderColor: RM.fade(entry.colour, 0.45),
          color: entry.colour
        },
        title: entry.name + ' \u00b7 ' + RM.dates.formatDate(entry.date)
      }, entry.name);
    });
  }

  function todayMarker(timeline) {
    if (timeline.todayX === null || RM.settings().showTodayLine === false) return null;
    return RM.el('div', { class: 'today-flag', style: { left: timeline.todayX + 'px', top: '2px' } }, 'TODAY');
  }

  RM.gantt = {
    keyDateFlags: keyDateFlags,
    keyDatePositions: keyDatePositions,
    buildTimeline: buildTimeline,
    renderShell: renderShell,
    renderHeader: renderHeader,
    timeCell: timeCell,
    todayMarker: todayMarker,
    quarterPeriods: quarterPeriods,
    quarterForDate: quarterForDate,
    COLUMN_WIDTH: COLUMN_WIDTH
  };
}(window.RM));
