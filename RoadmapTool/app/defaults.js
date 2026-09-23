'use strict';

/**
 * Default settings and optional sample ("seed") data.
 *
 * Nothing in here is business logic - it is data only. The application never
 * depends on a specific status, system, stream or programme existing: every
 * list below is editable from the Settings screen and every seed record can
 * be deleted.
 */

function defaultSettings() {
  return {
    appName: 'Roadmap Tool',
    organisation: '',
    port: 4310,
    host: '0.0.0.0',
    defaultView: 'roadmap',
    defaultRoadmapMode: 'detailed',
    defaultTimescale: 'month',
    roadmapStart: '',
    roadmapEnd: '',
    showMilestones: true,
    showTodayLine: true,
    showKeyDates: true,
    backupsToKeep: 50,
    auditEntriesToKeep: 5000,
    workingDaysPerMonth: 21,
    settingsPassword: 'Brompton2026',
    systems: list([
      'BPP', 'Salesforce', 'CSI', 'NetSuite', 'BigCommerce', 'Infor CPQ', 'PIM',
      'Databricks', 'Integration', 'Mobile App', 'Operations', 'Finance', 'Data', 'Other'
    ]),
    itemTypes: list([
      'System change', 'Process change', 'Data change', 'Integration', 'Other'
    ]),
    statuses: [
      status('not-started', 'Not started', '#94a3b8'),
      status('in-progress', 'In progress', '#2563eb'),
      status('in-uat', 'In UAT', '#7c3aed'),
      status('released', 'Released', '#16a34a'),
      status('blocked', 'Blocked', '#dc2626')
    ],
    priorities: [
      priority('critical', 'Critical', '#dc2626'),
      priority('high', 'High', '#ea580c'),
      priority('medium', 'Medium', '#2563eb'),
      priority('low', 'Low', '#64748b')
    ],
    milestoneTypes: list(['POC', 'Integration mapped', 'UAT', 'Go live']),
    dependencyTypes: list([
      'Predecessor', 'System', 'Data', 'Business Process', 'Decision', 'Gate', 'External'
    ]),
    /* Resource hierarchy, level 1: the discipline. */
    resourceTypes: [
      { id: 'po', name: 'Product owner', active: true },
      { id: 'dev', name: 'Development', active: true },
      { id: 'int', name: 'Integration', active: true },
      { id: 'data', name: 'Data engineering', active: true },
      { id: 'master-data', name: 'Master data', active: true }
    ],
    /* The two owner lists. Owner fields store the name itself, so a name
       entered before these lists existed still shows on its record. */
    productOwners: list(['Nicolas', 'Sarah', 'Priya', 'Commercial']),
    deliveryOwners: list(['Jake', 'Data team', 'Integration team', 'Operations', 'Finance']),
    /* Dates the business plans around, drawn across the whole roadmap. */
    keyDates: [
      { id: 'kd-peak', name: 'Peak season freeze', date: '2026-11-15', colour: '#b45309' },
      { id: 'kd-year-end', name: 'Financial year end', date: '2027-03-31', colour: '#7c3aed' }
    ],
    /* Resource hierarchy, level 2: the stream the capacity sits in. */
    resourceStreams: list([
      'B2B', 'D2C', 'ERP HQ', 'ERP subsidiaries', 'Ebike backend', 'Ebike app'
    ]),
    /* OKRs: objectives (level 1) with key results (level 2). */
    okrs: [
      objective('okr-dealer', 'Improve the dealer experience', [
        ['kr-order-errors', 'Reduce dealer ordering errors'],
        ['kr-self-service', 'Increase dealer self-service'],
        ['kr-availability', 'Trusted availability and lead times']
      ]),
      objective('okr-global', 'Scale globally on one platform', [
        ['kr-new-entities', 'Launch new entities on the platform'],
        ['kr-entity-flows', 'One order and stock flow per entity']
      ]),
      objective('okr-data', 'Trusted master data', [
        ['kr-product-master', 'One product master'],
        ['kr-customer-master', 'One customer and dealer master']
      ]),
      objective('okr-efficiency', 'Operational efficiency', [
        ['kr-no-rekeying', 'Remove manual rekeying'],
        ['kr-time-to-publish', 'Reduce time to publish product data']
      ])
    ],
    quarters: [
      { id: 'q1', name: 'Q1', startMonth: 1, startDay: 1, endMonth: 3, endDay: 31 },
      { id: 'q2', name: 'Q2', startMonth: 4, startDay: 1, endMonth: 6, endDay: 30 },
      { id: 'q3', name: 'Q3', startMonth: 7, startDay: 1, endMonth: 9, endDay: 30 },
      { id: 'q4', name: 'Q4', startMonth: 10, startDay: 1, endMonth: 12, endDay: 31 }
    ]
  };
}

function list(names) {
  return names.map(function (name) {
    return { id: slug(name), name: name, active: true };
  });
}

function status(id, name, colour) {
  return { id: id, name: name, colour: colour, active: true };
}

function priority(id, name, colour) {
  return { id: id, name: name, colour: colour, active: true };
}

function objective(id, name, keyResults) {
  return {
    id: id,
    name: name,
    active: true,
    children: keyResults.map(function (keyResult) {
      return { id: keyResult[0], name: keyResult[1], active: true };
    })
  };
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

/* ------------------------------------------------------------------ */
/* Sample data - demonstrates the concept, safe to delete from Data    */
/* ------------------------------------------------------------------ */

function sampleData() {
  /* The sample splits its names across the two owner lists. */
  const PRODUCT_OWNER_NAMES = ['Nicolas', 'Sarah', 'Priya', 'Commercial'];
  const now = new Date().toISOString();
  const stamp = { createdAt: now, createdBy: 'Sample data', updatedAt: now, updatedBy: 'Sample data' };

  const programmes = [
    programme('PRG-0001', 'Customer / Dealer Master & Accreditation', 'Customer & Accreditation',
      'Single dealer master with an accreditation model that drives what a dealer may buy.',
      'Dealers see only the products they are accredited to order, based on one trusted source.',
      'Nicolas', 'in-progress', 'critical', '#2563eb'),
    programme('PRG-0002', 'Product Data & PIM', 'Product Data & PIM',
      'Define the product master, translation source and the route to a PIM.',
      'One definition of product data feeding every channel and every entity.',
      'Sarah', 'in-progress', 'high', '#7c3aed'),
    programme('PRG-0003', 'BPP Global Rollout & Entity Integration', 'BPP Global Rollout',
      'Extend the B2B platform to further entities with the ERP integration behind it.',
      'Every entity orders through one platform with orders and stock flowing into finance.',
      'Jake', 'in-progress', 'critical', '#ea580c'),
    programme('PRG-0004', 'Stock Trust / Availability / Quick Ship', 'Stock Trust',
      'Make published availability trustworthy across entities and channels.',
      'Dealers trust what the platform says is available and when it ships.',
      'Priya', 'in-progress', 'high', '#0891b2')
  ];

  const roadmapItems = [
    item('RM-0001', 'PRG-0001', 'Salesforce Accreditation Model', 'Salesforce accreditation',
      ['salesforce', 'bpp'], 'Accreditation', ['system-change', 'data-change'], 'b2b',
      '2026-09-01', '2026-10-31', 'in-progress', 'critical', 'Nicolas', {
        description: 'Data model in Salesforce holding the accreditation each dealer holds, with effective dates.',
        businessOutcome: 'One authoritative record of what a dealer is accredited for.',
        problemStatement: 'Accreditation is held in spreadsheets and is not visible to the ordering platform.',
        milestones: [
          ms('MS-0001', 'POC', '2026-09-12', 'released', 'Proved the effective-dating model against three real dealers.'),
          ms('MS-0002', 'Integration mapped', '2026-10-10', 'in-progress', 'Field-by-field mapping agreed with the platform team. Blocked on the tax fields.'),
          ms('MS-0003', 'Go live', '2026-10-31', 'not-started', 'Needs the dealer confirmation round to be finished first.')
        ],
        estimates: est({ po: 5, dev: 15, int: 5, data: 0 }, 'Higher technical debt - reuses the existing account extension.',
          { po: 10, dev: 30, int: 15, data: 5 }, 'Normal', 'Proper master-data model with effective dating.'),
        risks: [risk('RISK-0001', 'Accreditation data quality', 'Existing spreadsheet data is incomplete.', 'High', 'Medium', 'Data cleanse before migration, dealer confirmation round.', 'Nicolas', 'open')],
        tasks: [
          task('TSK-0001', 'RM-0001', 'Create the accreditation object', 'in-progress', 'Nicolas', '',
            ['kr-order-errors', 'kr-customer-master'],
            [link('Jira BPP-1042', 'https://jira.example.com/browse/BPP-1042')],
            { po: 2, dev: 8, int: 0, data: 0 },
            'Object, fields, effective dating and record-level history.'),
          task('TSK-0002', 'RM-0001', 'Migrate the accreditation spreadsheet', 'not-started', 'Data team', 'erp-subsidiaries',
            ['kr-customer-master'],
            [link('Jira BPP-1043', 'https://jira.example.com/browse/BPP-1043')],
            { po: 1, dev: 2, int: 0, data: 6 },
            'Cleanse, map and load the current spreadsheet, with a dealer confirmation round.'),
          task('TSK-0003', 'RM-0001', 'Publish accreditation to the platform', 'in-progress', 'Integration team', 'b2b',
            ['kr-order-errors'],
            [], { po: 1, dev: 3, int: 6, data: 0 },
            'Expose accreditation to BPP so the catalogue can use it.')
        ]
      }),

    item('RM-0002', 'PRG-0001', 'Platform Accreditation Matrix', 'Accreditation matrix',
      ['bpp'], 'Eligibility', ['system-change'], 'b2b',
      '2026-10-15', '2026-12-15', 'in-progress', 'high', 'Jake', {
        description: 'Matrix mapping accreditation to product categories and channels.',
        businessOutcome: 'A maintainable rule set rather than hard-coded restrictions.',
        milestones: [ms('MS-0004', 'POC', '2026-10-30', 'in-progress'), ms('MS-0005', 'UAT', '2026-12-01', 'not-started')],
        estimates: est({ po: 4, dev: 12, int: 3, data: 2 }, 'Matrix held as configuration only.',
          { po: 8, dev: 25, int: 8, data: 5 }, 'Normal', 'Full maintenance UI with versioning.'),
        tasks: [
          task('TSK-0004', 'RM-0002', 'Matrix data model', 'in-progress', 'Jake', 'b2b',
            ['kr-order-errors'], [], { po: 2, dev: 6, int: 0, data: 1 },
            'Category to accreditation mapping with versioning.'),
          task('TSK-0005', 'RM-0002', 'Matrix maintenance screen', 'not-started', 'Jake', 'b2b',
            [], [link('Jira BPP-1102', 'https://jira.example.com/browse/BPP-1102')],
            { po: 3, dev: 10, int: 1, data: 0 },
            'Screen for the commercial team to maintain the matrix without IT.')
        ]
      }),

    item('RM-0003', 'PRG-0001', 'BPP Product Eligibility Restriction', 'BPP restriction',
      ['bpp', 'bigcommerce'], 'Catalogue', ['system-change'], 'b2b',
      '2026-12-01', '2027-02-15', 'not-started', 'high', 'Jake', {
        description: 'Apply the accreditation matrix to the catalogue so ineligible products are not orderable.',
        businessOutcome: 'Dealers cannot order products they are not accredited for.',
        milestones: [ms('MS-0006', 'Integration mapped', '2027-01-15', 'not-started'), ms('MS-0007', 'Go live', '2027-02-15', 'not-started')],
        estimates: est({ po: 3, dev: 10, int: 2, data: 0 }, 'Catalogue filter only, no basket revalidation.',
          { po: 8, dev: 22, int: 6, data: 2 }, 'Normal', 'Filtering plus basket and order validation.'),
        gates: [gate('GAT-0001', 'Sign-off of the accreditation matrix', 'Commercial sign-off needed before catalogue restriction goes live.', 'Commercial', '2026-12-15', 'open')],
        tasks: [
          task('TSK-0006', 'RM-0003', 'Catalogue filtering', 'not-started', 'Jake', 'b2b',
            ['kr-order-errors'], [], { po: 2, dev: 9, int: 2, data: 0 },
            'Hide products the dealer is not accredited for.'),
          task('TSK-0007', 'RM-0003', 'Basket and order validation', 'not-started', 'Jake', 'b2b',
            [], [], { po: 2, dev: 7, int: 3, data: 0 },
            'Re-check eligibility at basket and order submission.')
        ]
      }),

    item('RM-0004', 'PRG-0002', 'Product Data Definition', 'Product data definition',
      ['data', 'pim'], 'Master data', ['other'], 'erp-subsidiaries',
      '2026-09-15', '2026-11-30', 'in-progress', 'high', 'Sarah', {
        description: 'Define the product master attributes, ownership and the golden source for each attribute.',
        businessOutcome: 'Agreed definition of product data before any PIM investment.',
        milestones: [ms('MS-0008', 'POC', '2026-10-15', 'in-progress'), ms('MS-0009', 'POC', '2026-11-30', 'not-started')],
        estimates: est({ po: 10, dev: 0, int: 0, data: 5 }, 'Workshop-led definition only.',
          { po: 20, dev: 0, int: 0, data: 15 }, 'Normal', 'Full attribute catalogue with data profiling.'),
        tasks: [
          task('TSK-0008', 'RM-0004', 'Attribute catalogue workshops', 'in-progress', 'Sarah', 'erp-subsidiaries',
            ['kr-product-master'], [], { po: 8, dev: 0, int: 0, data: 2 },
            'Workshops per product family to agree the attribute list and owners.'),
          task('TSK-0009', 'RM-0004', 'Profile the current data', 'in-progress', 'Data team', 'erp-subsidiaries',
            ['kr-product-master'], [], { po: 1, dev: 0, int: 0, data: 6 },
            'Measure completeness and conflicts across the current sources.')
        ]
      }),

    item('RM-0005', 'PRG-0002', 'Translation Management Source', 'Translation source',
      ['pim', 'bigcommerce'], 'Localisation', ['system-change'], 'd2c',
      '2026-11-01', '2027-01-31', 'not-started', 'medium', 'Sarah', {
        description: 'Decide and implement where translations are mastered and how they are published.',
        businessOutcome: 'Localised content without manual spreadsheet rounds.',
        estimates: est({ po: 5, dev: 10, int: 5, data: 0 }, 'Spreadsheet-driven import.',
          { po: 12, dev: 25, int: 10, data: 5 }, 'Normal', 'Translation workflow inside the PIM.'),
        tasks: [
          task('TSK-0010', 'RM-0005', 'Translation source decision', 'not-started', 'Sarah', 'd2c',
            ['kr-time-to-publish'], [], { po: 4, dev: 0, int: 0, data: 0 },
            'Compare PIM-managed translation against the current process.'),
          task('TSK-0011', 'RM-0005', 'Publish translations to commerce', 'not-started', 'Sarah', 'd2c',
            ['kr-time-to-publish'], [], { po: 2, dev: 9, int: 5, data: 1 },
            'Feed translated content into the commerce channels.')
        ]
      }),

    item('RM-0006', 'PRG-0002', 'PIM Evaluation', 'PIM evaluation',
      ['pim'], 'Tooling', ['other'], 'erp-subsidiaries',
      '2027-01-01', '2027-03-31', 'not-started', 'medium', 'Sarah', {
        description: 'Evaluate PIM options against the agreed product data definition.',
        businessOutcome: 'An evidence-based recommendation on PIM.',
        estimates: est({ po: 10, dev: 0, int: 0, data: 3 }, 'Desk-based comparison.',
          { po: 20, dev: 5, int: 5, data: 8 }, 'Normal', 'Includes a proof of concept with two vendors.'),
        tasks: [
          task('TSK-0012', 'RM-0006', 'Requirements and vendor long list', 'not-started', 'Sarah', 'erp-subsidiaries',
            ['kr-product-master'], [], { po: 6, dev: 0, int: 0, data: 1 }, '')
        ]
      }),

    item('RM-0007', 'PRG-0003', 'NetSuite Sales Order Integration', 'NetSuite orders',
      ['netsuite', 'integration'], 'Order to cash', ['integration'], 'erp-hq',
      '2026-09-01', '2026-11-30', 'in-progress', 'critical', 'Jake', {
        description: 'Post platform orders into NetSuite with entity, pricing and tax handling.',
        businessOutcome: 'Orders reach finance without rekeying.',
        milestones: [ms('MS-0010', 'Integration mapped', '2026-10-15', 'in-progress', 'Order payload agreed; tax treatment per entity still open.'), ms('MS-0011', 'UAT', '2026-11-10', 'not-started', 'Two weeks with finance and three pilot dealers.'), ms('MS-0012', 'Go live', '2026-11-30', 'not-started', 'Cut over on a Friday evening, with the old process available for a week.')],
        estimates: est({ po: 5, dev: 20, int: 20, data: 0 }, 'Single entity, minimal error handling.',
          { po: 12, dev: 35, int: 35, data: 5 }, 'Normal', 'Multi-entity with full reconciliation.'),
        risks: [risk('RISK-0002', 'Tax configuration per entity', 'Tax treatment differs per entity and is not fully documented.', 'High', 'High', 'Finance workshop per entity before build completes.', 'Finance', 'open')],
        tasks: [
          task('TSK-0013', 'RM-0007', 'Order payload mapping', 'in-progress', 'Integration team', 'erp-hq',
            ['kr-no-rekeying'],
            [link('Jira INT-320', 'https://jira.example.com/browse/INT-320')],
            { po: 2, dev: 6, int: 12, data: 0 }, 'Map the platform order to the NetSuite sales order.'),
          task('TSK-0014', 'RM-0007', 'Error handling and retry', 'not-started', 'Integration team', 'erp-hq',
            ['kr-no-rekeying'], [], { po: 1, dev: 4, int: 8, data: 0 },
            'Retry, alerting and a visible failure queue.'),
          task('TSK-0015', 'RM-0007', 'Tax per entity', 'in-progress', 'Finance', 'erp-hq',
            [], [], { po: 3, dev: 5, int: 4, data: 0 }, 'Confirm and configure tax treatment per entity.')
        ]
      }),

    item('RM-0008', 'PRG-0003', 'NetSuite Stock Integration', 'NetSuite stock',
      ['netsuite', 'integration'], 'Inventory', ['integration'], 'erp-hq',
      '2026-10-15', '2026-12-15', 'in-progress', 'high', 'Jake', {
        description: 'Publish inventory from NetSuite to the platform on a reliable schedule.',
        businessOutcome: 'Dealers see availability that reflects the warehouse.',
        milestones: [ms('MS-0013', 'Integration mapped', '2026-11-20', 'not-started'), ms('MS-0014', 'Go live', '2026-12-15', 'not-started')],
        estimates: est({ po: 4, dev: 12, int: 15, data: 3 }, 'Scheduled file feed.',
          { po: 10, dev: 25, int: 30, data: 10 }, 'Normal', 'Event-driven inventory with reconciliation.'),
        tasks: [
          task('TSK-0016', 'RM-0008', 'Inventory feed', 'in-progress', 'Integration team', 'erp-hq',
            ['kr-availability'], [], { po: 2, dev: 6, int: 10, data: 2 },
            'Scheduled per-entity stock feed into the platform.'),
          task('TSK-0017', 'RM-0008', 'Availability calculation', 'not-started', 'Jake', 'b2b',
            ['kr-availability'], [], { po: 2, dev: 7, int: 2, data: 2 },
            'Turn raw stock into a published availability figure.')
        ]
      }),

    item('RM-0009', 'PRG-0003', 'USA Entity Rollout', 'USA rollout',
      ['bpp', 'netsuite'], 'Rollout', ['other'], 'b2b',
      '2026-12-01', '2027-02-28', 'not-started', 'high', 'Jake', {
        description: 'Enable the USA entity on the platform with local pricing, tax and logistics.',
        businessOutcome: 'USA dealers ordering through the same platform.',
        milestones: [ms('MS-0015', 'UAT', '2027-01-20', 'not-started'), ms('MS-0016', 'Go live', '2027-02-28', 'not-started')],
        estimates: est({ po: 8, dev: 10, int: 10, data: 2 }, 'Pilot with a small dealer group.',
          { po: 15, dev: 20, int: 20, data: 5 }, 'Normal', 'Full onboarding programme.'),
        tasks: [
          task('TSK-0018', 'RM-0009', 'Entity configuration', 'not-started', 'Jake', 'b2b',
            ['kr-new-entities'], [], { po: 3, dev: 6, int: 4, data: 1 },
            'Pricing, tax, shipping and payment configuration for the USA entity.'),
          task('TSK-0019', 'RM-0009', 'Dealer onboarding', 'not-started', 'Operations', 'erp-hq',
            ['kr-new-entities'], [], { po: 5, dev: 1, int: 1, data: 0 },
            'Onboard the pilot dealer group and then the rest.')
        ]
      }),

    item('RM-0010', 'PRG-0003', 'Singapore Rollout', 'Singapore rollout',
      ['bpp'], 'Rollout', ['other'], 'b2b',
      '2027-03-01', '2027-05-31', 'not-started', 'medium', 'Jake', {
        description: 'Enable the Singapore entity on the platform.',
        businessOutcome: 'APAC dealers ordering through the same platform.',
        estimates: est({ po: 6, dev: 8, int: 8, data: 2 }, 'Reuse of the USA rollout pattern.',
          { po: 12, dev: 16, int: 16, data: 4 }, 'Normal', 'Full localisation review.'),
        tasks: [
          task('TSK-0020', 'RM-0010', 'Entity configuration', 'not-started', 'Jake', 'b2b',
            ['kr-new-entities'], [], { po: 3, dev: 5, int: 5, data: 1 }, '')
        ]
      }),

    item('RM-0011', 'PRG-0003', 'Japan Rollout', 'Japan rollout',
      ['bpp'], 'Rollout', ['other'], 'b2b',
      '2027-05-01', '2027-08-31', 'not-started', 'medium', 'Jake', {
        description: 'Enable the Japan entity on the platform, including local language.',
        businessOutcome: 'Japanese dealers ordering through the same platform.',
        estimates: est({ po: 8, dev: 10, int: 10, data: 3 }, 'Reuse of the rollout pattern.',
          { po: 15, dev: 20, int: 20, data: 6 }, 'Normal', 'Includes full translation workflow.'),
        tasks: [
          task('TSK-0021', 'RM-0011', 'Entity configuration and translation', 'not-started', 'Jake', 'b2b',
            ['kr-new-entities'], [], { po: 4, dev: 6, int: 5, data: 1 }, '')
        ]
      }),

    item('RM-0012', 'PRG-0004', 'Cross-entity Stock Visibility', 'Cross-entity stock',
      ['bpp', 'netsuite'], 'Availability', ['other'], 'b2b',
      '', '', 'not-started', 'medium', 'Priya', {
        description: 'Show availability across entities so a dealer can be served from another warehouse.',
        businessOutcome: 'Fewer lost orders when local stock is unavailable.',
        notes: 'To be defined - deliberately undated until discovery completes.',
        estimates: est({ po: 0, dev: 0, int: 0, data: 0 }, '', { po: 0, dev: 0, int: 0, data: 0 }, '', ''),
        tasks: []
      })
  ];

  const dependencies = [
    dep('DEP-0001', 'RM-0001', 'RM-0002', 'predecessor', 'The matrix needs the Salesforce accreditation data model in place.', 'not-started', 'Nicolas', true),
    dep('DEP-0002', 'RM-0002', 'RM-0003', 'predecessor', 'Catalogue restriction consumes the published accreditation matrix.', 'not-started', 'Jake', true),
    dep('DEP-0003', 'RM-0003', 'RM-0009', 'gate', 'USA rollout waits for product eligibility to be enforced.', 'not-started', 'Jake', true),
    dep('DEP-0004', 'RM-0007', 'RM-0009', 'system', 'USA rollout needs order integration live.', 'not-started', 'Jake', true),
    dep('DEP-0005', 'RM-0008', 'RM-0012', 'data', 'Cross-entity visibility needs reliable per-entity stock first.', 'not-started', 'Priya', false),
    dep('DEP-0006', 'RM-0004', 'RM-0005', 'data', 'Translation source depends on the agreed product data definition.', 'not-started', 'Sarah', false)
  ];

  const backlog = [
    backlogItem('BLG-0001', 'PRG-0004', 'bpp', 'Operations', 'Quick Ship proposition', 'other', 'not-started',
      'Needs cross-entity stock visibility', 'NetSuite, BigCommerce', 'Order management', 'Priya', 'medium',
      'To be defined - proposition not agreed yet.', '', '', '', {}),
    backlogItem('BLG-0002', 'PRG-0002', 'bigcommerce', 'Product', 'BigCommerce metafield changes', 'system-change', 'not-started',
      'Product data definition', 'PIM', 'Content publishing', 'Sarah', 'medium', '',
      '2027-02-01', '2027-04-30', 'd2c', { po: 4, dev: 12, int: 4, data: 2 }),
    backlogItem('BLG-0003', 'PRG-0001', 'ebike-app', 'Service', 'Dealer self-service accreditation view', 'system-change', 'not-started',
      'Accreditation matrix', 'Salesforce', 'Dealer support', 'Nicolas', 'low', '',
      '2027-03-01', '2027-05-31', 'ebike-app', { po: 3, dev: 10, int: 2, data: 0 }),
    backlogItem('BLG-0004', '', 'finance', 'Finance', 'Automated dealer credit checks', 'process-change', 'not-started',
      'NetSuite customer master', 'NetSuite, Salesforce', 'Credit control', 'Finance', 'low', '', '', '', '', {})
  ];

  const resourceScenarios = [
    scenario('SCN-0001', 'Scenario A', 'Current team.', true, {
      b2b: { po: 0.5, dev: 1, int: 0.3, data: 0.1 },
      d2c: { po: 0.2, dev: 0.3, int: 0.1, data: 0 },
      'erp-hq': { po: 0.2, dev: 0.2, int: 0.5, data: 0.1 },
      'ebike-app': { po: 0.1, dev: 0.2, int: 0.1, data: 0 },
      'erp-subsidiaries': { po: 0.2, dev: 0.2, int: 0.1, data: 0.5 },
      'ebike-backend': { po: 0.3, dev: 0.2, int: 0.1, data: 0.1 }
    }),
    scenario('SCN-0002', 'Scenario B', 'Additional development and integration capacity from January.', false, {
      b2b: { po: 1, dev: 2, int: 0.5, data: 0.2 },
      d2c: { po: 0.5, dev: 1, int: 0.3, data: 0.1 },
      'erp-hq': { po: 0.5, dev: 0.5, int: 1, data: 0.2 },
      'ebike-app': { po: 0.2, dev: 0.5, int: 0.2, data: 0 },
      'erp-subsidiaries': { po: 0.3, dev: 0.5, int: 0.2, data: 1 },
      'ebike-backend': { po: 0.5, dev: 0.3, int: 0.2, data: 0.1 }
    })
  ];

  return {
    programmes: programmes,
    roadmapItems: roadmapItems,
    dependencies: dependencies,
    backlog: backlog,
    resourceScenarios: resourceScenarios
  };

  function programme(id, name, shortName, description, businessOutcome, owner, status, priority, colour) {
    return Object.assign({
      id: id, name: name, shortName: shortName, description: description,
      businessOutcome: businessOutcome,
      productOwners: productOwnersFor(owner), deliveryOwners: deliveryOwnersFor(owner),
      owner: productOwnersFor(owner)[0] || owner,
      status: status, priority: priority, colour: colour, notes: ''
    }, stamp);
  }

  function item(id, programmeId, title, shortTitle, systemAreas, subArea, types, stream, startDate, endDate, status, priority, owner, extra) {
    return Object.assign({
      id: id,
      programmeId: programmeId,
      title: title,
      shortTitle: shortTitle,
      systemAreas: systemAreas,
      subArea: subArea,
      types: types,
      stream: stream,
      startDate: startDate,
      endDate: endDate,
      targetDate: endDate,
      status: status,
      priority: priority,
      productOwners: productOwnersFor(owner),
      deliveryOwners: deliveryOwnersFor(owner),
      owner: productOwnersFor(owner)[0] || owner,
      description: '',
      businessOutcome: '',
      problemStatement: '',
      systemDependencies: '',
      businessDependencies: '',
      dataDependencies: '',
      recommendedApproach: '',
      tradeOffs: '',
      pocNotes: '',
      comments: '',
      notes: '',
      milestones: [],
      risks: [],
      tasks: [],
      gates: [],
      estimates: est({ po: 0, dev: 0, int: 0, data: 0 }, '', { po: 0, dev: 0, int: 0, data: 0 }, '', ''),
      backlogId: ''
    }, extra, stamp);
  }

  function productOwnersFor(owner) {
    return PRODUCT_OWNER_NAMES.indexOf(owner) >= 0 ? [owner] : ['Nicolas'];
  }

  function deliveryOwnersFor(owner) {
    return PRODUCT_OWNER_NAMES.indexOf(owner) >= 0 ? ['Jake'] : [owner];
  }

  function est(fastDays, fastRisk, standardDays, standardRisk, standardNotes) {
    return {
      fast: { days: fastDays, risk: fastRisk, notes: '' },
      standard: { days: standardDays, risk: standardRisk, notes: standardNotes || '' }
    };
  }

  function ms(id, name, date, status, notes) {
    return { id: id, name: name, date: date, status: status, notes: notes || '' };
  }

  function risk(id, title, description, impact, probability, mitigation, owner, status) {
    return { id: id, title: title, description: description, impact: impact, probability: probability, mitigation: mitigation, owner: owner, status: status };
  }

  function gate(id, title, description, owner, requiredByDate, status) {
    return { id: id, title: title, description: description, owner: owner, requiredByDate: requiredByDate, status: status, decision: '', decisionDate: '', notes: '' };
  }

  function link(label, url) {
    return { label: label, url: url };
  }

  function task(id, roadmapItemId, name, status, owner, stream, okrIds, links, days, description) {
    return {
      id: id, roadmapItemId: roadmapItemId, name: name, status: status, owner: owner,
      stream: stream, okrIds: okrIds, links: links, days: days,
      description: description, notes: ''
    };
  }

  function dep(id, fromItemId, toItemId, dependencyType, description, status, owner, blocking) {
    return { id: id, fromItemId: fromItemId, toItemId: toItemId, dependencyType: dependencyType, description: description, status: status, owner: owner, blocking: blocking, notes: '' };
  }

  function backlogItem(id, programme, systemArea, subAreaDepartment, change, type, currentStatus,
    dependencyPrerequisite, otherSystemsImpacted, processesImpacted, owner, priority, comment,
    startDate, endDate, stream, days) {
    return Object.assign({
      id: id, programme: programme, systemArea: systemArea, subAreaDepartment: subAreaDepartment,
      change: change, type: type, currentStatus: currentStatus,
      dependencyPrerequisite: dependencyPrerequisite, otherSystemsImpacted: otherSystemsImpacted,
      processesImpacted: processesImpacted, owner: owner, priority: priority, comment: comment,
      startDate: startDate || '', endDate: endDate || '', stream: stream || '', days: days || {},
      promoted: false, roadmapItemId: ''
    }, stamp);
  }

  /**
   * Builds a scenario whose monthly allocation grid is filled with the same
   * figure for every month in the sample window - the Capacity plan screen is
   * where a planner then adjusts individual months.
   */
  function scenario(id, name, description, active, perStream) {
    const months = monthRange('2026-08', 24);
    const allocations = {};
    Object.keys(perStream).forEach(function (streamId) {
      allocations[streamId] = {};
      Object.keys(perStream[streamId]).forEach(function (typeId) {
        const monthly = {};
        months.forEach(function (month) { monthly[month] = perStream[streamId][typeId]; });
        allocations[streamId][typeId] = monthly;
      });
    });
    return Object.assign({
      id: id, name: name, description: description, active: active,
      allocations: allocations,
      includedBacklogIds: id === 'SCN-0001' ? ['BLG-0002'] : []
    }, stamp);
  }

  function monthRange(startMonth, count) {
    const parts = startMonth.split('-');
    const out = [];
    let year = Number(parts[0]);
    let month = Number(parts[1]);
    for (let i = 0; i < count; i += 1) {
      out.push(year + '-' + String(month).padStart(2, '0'));
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return out;
  }
}

module.exports = { defaultSettings: defaultSettings, sampleData: sampleData, slug: slug };
