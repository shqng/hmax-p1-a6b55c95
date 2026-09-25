/* ============================================================================
   HMAX Energy Management — Prototype State Layer
   ----------------------------------------------------------------------------
   Single source of truth for every workspace. Screens render from this file;
   they must never contain their own copy of case, portfolio or role data.

   Structure mirrors the product object model documented in architecture.html:
     Signal -> Case -> Baseline -> Evidence -> Lever -> Scenario
            -> Decision -> Measurement plan -> Outcome -> Portfolio

   Three rules this layer enforces:
     1. Provenance is a wrapper, not a flag  -> val() / sys() / human()
     2. Lifecycle is computed, never authored -> HMAX.compute.*
     3. Visibility derives from grants        -> HMAX.can()
   ========================================================================== */

(function (global) {
'use strict';

/* ---------------------------------------------------------------------------
   0. TIME
   The prototype is set on a fixed in-fiction date so every "3 days overdue"
   and "opened 15 days ago" stays stable no matter when it is demonstrated.
   Dates are parsed field-by-field rather than by Date(string), which is only
   reliably ISO-aware in modern engines.
   ------------------------------------------------------------------------- */

var TODAY = '2026-09-23';

function parseDay(s) {
  if (!s) return null;
  if (s instanceof Date) return s.getTime();
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/* ---------------------------------------------------------------------------
   1. PROVENANCE
   Any value the system produced is wrapped so the renderer can attach the
   suggestion badge automatically. A system output can never be displayed as
   though a person authored it.
   ------------------------------------------------------------------------- */

function val(v, meta) {
  return Object.assign({ v: v, kind: 'human', by: null, at: null, model: null, edited: false, was: null }, meta || {});
}
function sys(v, service, at, model) {
  return val(v, { kind: 'system', by: service, at: at || null, model: model || null });
}
function human(v, actor, at) {
  return val(v, { kind: 'human', by: actor || null, at: at || null });
}
/* Recording an override keeps what was suggested alongside what was chosen. */
function override(original, v, actor, at) {
  return val(v, { kind: 'human', by: actor, at: at, edited: true, was: original });
}

/* ---------------------------------------------------------------------------
   2. ROLES, GRANTS AND SESSION
   Role determines landing, navigation, default depth and which controls exist.
   Controls render from grants rather than from role-name checks, so adding a
   fifth role is a data entry.
   ------------------------------------------------------------------------- */

var ROLES = {
  epm: {
    id: 'epm',
    name: 'Energy Performance Manager',
    short: 'Energy Manager',
    person: 'Anna Clark',
    initials: 'AC',
    colorVar: '--epm',
    color: '#1d5fa8',
    soft: 'rgba(29,95,168,.10)',
    home: 'overview.html',
    nav: ['overview', 'explore', 'portfolio', 'caseload', 'ledger', 'admin'],
    depth: 'L1',
    cadence: 'Weekly, with monthly reporting',
    question: 'Are we improving, and is the pipeline healthy enough to keep improving?',
    grants: {
      view:       { scope: 'all' },
      contribute: { scope: 'all' },
      own:        { stages: ['detect', 'verify'], scope: 'all' },
      approve:    { currencies: ['none'], scope: 'all' }
    },
    neverDoes: 'Builds the evidence. If they are doing analysis, the caseload is under-resourced.'
  },

  analyst: {
    id: 'analyst',
    name: 'Energy Performance Analyst',
    short: 'Analyst',
    person: 'Priya Raman',
    initials: 'PR',
    colorVar: '--ean',
    color: '#9a3f74',
    soft: 'rgba(154,63,116,.10)',
    home: 'explore.html',
    nav: ['overview', 'explore', 'runs', 'fleet', 'caseload', 'portfolio'],
    depth: 'L2',
    cadence: 'Daily — the highest-frequency user',
    question: 'What is actually going on here, and can I build a case defensible enough to survive challenge?',
    grants: {
      view:       { scope: 'all' },
      contribute: { scope: 'all' },
      own:        { stages: ['diagnose', 'simulate'], scope: 'all' },
      approve:    { currencies: [], scope: 'none' }
    },
    neverDoes: 'Decides the trade-off. Producing the recommendation and owning the consequence are separated.'
  },

  opm: {
    id: 'opm',
    name: 'Operations / Timetable Performance Manager',
    short: 'Operations Manager',
    person: 'David Osei',
    initials: 'DO',
    colorVar: '--opm',
    color: '#8a5520',
    soft: 'rgba(138,85,32,.10)',
    home: 'decisions.html',
    nav: ['decisions', 'caseload', 'overview', 'explore', 'runs', 'ledger'],
    depth: 'L2',
    cadence: 'On demand, in short reviews',
    question: 'What is this going to cost me in running time, and is it worth it?',
    grants: {
      view:       { scope: 'all' },
      contribute: { scope: 'all' },
      own:        { stages: ['release'], scope: 'line-3' },
      approve:    { currencies: ['time', 'capacity', 'none'], scope: 'line-3' },
      verdict:    { domains: ['operational', 'movement'] }
    },
    neverDoes: 'Sees cases that merely touch operations. Only real gates reach this queue.'
  },

  rse: {
    id: 'rse',
    name: 'Rolling Stock Performance Engineer',
    short: 'Rolling Stock Engineer',
    person: 'Marta Lindqvist',
    initials: 'ML',
    colorVar: '--rse',
    color: '#14706b',
    soft: 'rgba(20,112,107,.10)',
    home: 'fleet.html',
    nav: ['fleet', 'runs', 'explore', 'decisions', 'caseload'],
    depth: 'L3',
    cadence: 'On demand, deep and episodic',
    question: 'Is this my fleet\u2019s problem, and if so which units and how badly?',
    grants: {
      view:       { scope: 'all' },
      contribute: { scope: 'all' },
      own:        { stages: [], scope: 'fleet' },
      approve:    { currencies: [], scope: 'none' },
      verdict:    { domains: ['technical'] }
    },
    neverDoes: 'Manages the maintenance work itself. The boundary is the verdict and the handoff.'
  }
};

/* Navigation definitions — the sidebar is assembled from these, filtered by role.
   `group` splits the sidebar into the two halves of the product: the measurement
   surfaces a user looks at, and the managed work a user acts on. */
var NAV = {
  overview:  { label: 'Energy overview', href: 'overview.html', icon: 'pulse',   badge: null, group: 'monitor' },
  explore:   { label: 'Analysis',        href: 'explore.html',  icon: 'chart',   badge: null, group: 'monitor' },
  runs:      { label: 'Runs',            href: 'runs.html',     icon: 'route',   badge: null, group: 'monitor' },
  fleet:     { label: 'Fleet',           href: 'fleet.html',    icon: 'train',   badge: null, group: 'monitor' },
  caseload:  { label: 'Caseload',   href: 'caseload.html',  icon: 'layers',   badge: 'myCases', group: 'manage' },
  decisions: { label: 'Decisions',  href: 'decisions.html', icon: 'gavel',    badge: 'myGates', group: 'manage' },
  portfolio: { label: 'Portfolio',  href: 'portfolio.html', icon: 'target',   badge: null, group: 'manage' },
  ledger:    { label: 'Ledger',     href: 'ledger.html',    icon: 'ledger',   badge: null, group: 'manage' },
  admin:     { label: 'Administration', href: 'admin.html', icon: 'cog',      badge: null, group: 'govern' }
};

var NAV_GROUPS = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'manage',  label: 'Manage' },
  { id: 'govern',  label: 'Govern' }
];

/* ---------------------------------------------------------------------------
   3. LIFECYCLE
   Stage order and the gate each stage must clear. Nothing here is authored on
   a case — the case stores gate state, and position is derived from it.
   ------------------------------------------------------------------------- */

var STAGES = [
  { key: 'detect',   label: 'Detect',   gate: 'Candidate accepted and an owner assigned',                          pen: 'epm' },
  { key: 'diagnose', label: 'Diagnose', gate: 'Qualifying baseline confirmed and attribution ruled by a specialist', pen: 'analyst' },
  { key: 'simulate', label: 'Simulate', gate: 'At least one bundle inside the constraint envelope',                 pen: 'analyst' },
  { key: 'decide',   label: 'Decide',   gate: 'Readiness complete and the currency holder has approved',            pen: 'currencyOwner' },
  { key: 'release',  label: 'Release',  gate: 'Measurement plan locked before implementation begins',               pen: 'opm' },
  { key: 'verify',   label: 'Verify',   gate: 'Window complete and the verdict confirmed by the accountable owner', pen: 'epm' }
];

/* Currencies a lever can spend. Approval routes on these, not on who raised the case. */
var CURRENCIES = {
  none:     { label: 'No cost',  desc: 'Spends nothing beyond implementation effort', approver: 'epm', color: '--green'  },
  time:     { label: 'Time',     desc: 'Spends running time from the recovery budget', approver: 'opm', color: '--amber' },
  capacity: { label: 'Capacity', desc: 'Spends headway or path availability',          approver: 'opm', color: '--red'   },
  capital:  { label: 'Capital',  desc: 'Requires funded works or modification',        approver: 'epm', color: '--blue'  }
};

/* ---------------------------------------------------------------------------
   4. INTELLIGENT LAYER SERVICES (S1–S11)
   Each has a trigger, a human checkpoint and a declared behaviour when the data
   will not support a conclusion. Toggling `enabled` is how an operator that does
   not yet trust a service runs without it.
   ------------------------------------------------------------------------- */

var SERVICES = [
  { id: 'S1',  name: 'Signal correlation & promotion', stage: 'detect',   enabled: true,
    does: 'Scans for deviations, clusters those sharing a probable cause, promotes only clusters clearing completeness, sample and baseline thresholds.',
    checkpoint: 'Promoted candidate must be accepted into the caseload.',
    cannot: 'Holds the candidate below the promotion line and names the threshold it missed.',
    thresholds: { completeness: 70, minRuns: 30, baselineMatch: 'required' } },

  { id: 'S2',  name: 'Baseline fitting', stage: 'diagnose', enabled: true,
    does: 'Selects the best-fitting baseline, pre-computes its comparability score, and shows the alternatives it rejected with reasons.',
    checkpoint: 'Analyst confirms or substitutes the baseline; substitution is recorded.',
    cannot: 'Reports that no baseline qualifies and holds the case at Diagnose.' },

  { id: 'S3',  name: 'Comparability scoring', stage: 'diagnose', enabled: true,
    does: 'Scores gradient, stopping pattern, load, fleet, weather and period as separate factors so the weak dimension stays visible.',
    checkpoint: 'Any weak factor must be acknowledged by the analyst before readiness passes.',
    cannot: 'Marks the factor unknown rather than neutral, which lowers confidence rather than hiding the gap.' },

  { id: 'S4',  name: 'Confidence tiering', stage: 'all', enabled: true,
    does: 'Continuously recomputes the confidence tier from completeness, comparability, run count and model applicability.',
    checkpoint: 'None. The tier is evidence about the case and is never overridden by hand.',
    cannot: 'Holds the case at the lowest tier and names the limiting input.' },

  { id: 'S5',  name: 'Evidence narration', stage: 'diagnose', enabled: true,
    does: 'Writes a plain-language reading for every chart, so each graph arrives with its interpretation attached.',
    checkpoint: 'Analyst may edit or replace any reading; edits are marked as authored.',
    cannot: 'Says the pattern is not clear enough to read, rather than forcing an interpretation.' },

  { id: 'S6',  name: 'Attribution proposal', stage: 'diagnose', enabled: true,
    does: 'Proposes whether the cause is operational, movement-related or technical, with supporting and contradicting indicators.',
    checkpoint: 'The routed specialist confirms or rejects. This verdict gates Diagnose.',
    cannot: 'Proposes parallel investigation across two branches rather than forcing one answer.' },

  { id: 'S7',  name: 'Precedent matching', stage: 'simulate', enabled: true,
    does: 'Finds closed cases using a comparable lever and shows modelled saving against what was actually realised.',
    checkpoint: 'Advisory throughout; informs without constraining.',
    cannot: 'Reports that no comparable precedent exists, which should raise the perceived risk.' },

  { id: 'S8',  name: 'Route resolution & assignment', stage: 'decide', enabled: true,
    does: 'Determines the next holder from attribution, currency and asset scope, issues the assignment, and sets the due date from precedent.',
    checkpoint: 'Recipient accepts or reassigns. An unaccepted assignment escalates.',
    cannot: 'Routes to the Energy Performance Manager as the accountable default and flags the routing as unresolved.' },

  { id: 'S9',  name: 'Scenario pre-fill & ranking', stage: 'simulate', enabled: true,
    does: 'Generates bundles across the trade-off range, checks the constraint envelope, classifies actionability, ranks by realisable impact.',
    checkpoint: 'The recommended bundle is a marked suggestion; choosing another needs no justification.',
    cannot: 'Shows the blocking constraint instead of a bundle.' },

  { id: 'S10', name: 'Confounder watch', stage: 'release', enabled: true,
    does: 'Monitors the measurement window for timetable changes, fleet reallocation and loading shifts that would compromise attribution.',
    checkpoint: 'A detected confounder prompts continue, extend, or grade down.',
    cannot: 'Records the gap in its own coverage so a clean result is not over-claimed.' },

  { id: 'S11', name: 'Realisation rollup', stage: 'verify', enabled: true,
    does: 'On closure folds the verified result into portfolio totals and recomputes realisation by lever, currency and tier.',
    checkpoint: 'The Energy Manager confirms closure; the rollup follows the confirmation.',
    cannot: 'Excludes inconclusive cases from realisation while still counting them in conversion.' }
];

/* ---------------------------------------------------------------------------
   5. NETWORK
   ------------------------------------------------------------------------- */

var NETWORK = {
  operator: 'Metro Operations — Northern Network',
  lines: [
    { id: 'L1', name: 'Line 1', km: 24.6, stations: 19, fleets: ['A-series'],             intensity: 2.71, baselineId: 'BL-03' },
    { id: 'L2', name: 'Line 2', km: 31.2, stations: 23, fleets: ['A-series', 'B-series'], intensity: 2.88, baselineId: 'BL-05' },
    { id: 'L3', name: 'Line 3', km: 28.9, stations: 21, fleets: ['B-series'],             intensity: 3.04, baselineId: 'BL-07' },
    { id: 'L4', name: 'Line 4', km: 18.4, stations: 14, fleets: ['C-series'],             intensity: 2.42, baselineId: 'BL-09' }
  ],
  segments: [
    { id: 'SEG-317', lineId: 'L3', name: 'Northgate \u2192 Riverside', km: 2.4, gradient: '+1.2%', stops: 1 },
    { id: 'SEG-318', lineId: 'L3', name: 'Riverside \u2192 Kingsway',  km: 1.9, gradient: '-0.4%', stops: 1 },
    { id: 'SEG-322', lineId: 'L3', name: 'Kingsway \u2192 Eastfield',  km: 3.1, gradient: '+0.2%', stops: 1 }
  ],
  fleets: [
    { id: 'A-series', units: 34, propulsion: 'IGBT', regen: true,  inService: 2016 },
    { id: 'B-series', units: 28, propulsion: 'SiC',  regen: true,  inService: 2020 },
    { id: 'C-series', units: 19, propulsion: 'IGBT', regen: false, inService: 2011 }
  ]
};

/* ---------------------------------------------------------------------------
   6. BASELINES
   A named, versioned answer to "compared to what?" — never an implicit average.
   ------------------------------------------------------------------------- */

var BASELINES = [
  {
    id: 'BL-07', version: 4, type: 'matched-run-decile',
    label: 'Line 3 matched-run decile \u2014 B-series, northbound, off-peak',
    method: 'Best decile of comparable runs over the segment, matched on gradient, stopping pattern, load band and fleet. Rebuilt monthly on a rolling 12-week sample.',
    validFrom: '2026-07-01', validTo: null, band: '\u00b11.8%', sampleRuns: 412,
    value: 2.55, unit: 'kWh/km',
    comparability: {
      score: 'strong',
      factors: [
        { factor: 'Gradient profile',  state: 'strong',  note: 'Identical segment geometry' },
        { factor: 'Stopping pattern',  state: 'strong',  note: 'All-stations services only' },
        { factor: 'Fleet',             state: 'strong',  note: 'B-series exclusively' },
        { factor: 'Load band',         state: 'medium',  note: 'Off-peak band, \u00b118% spread retained' },
        { factor: 'Ambient',           state: 'medium',  note: 'Seasonal correction applied' },
        { factor: 'Period',            state: 'strong',  note: 'Within the same 12-week window' }
      ]
    },
    alternatives: [
      { id: 'BL-05', label: 'Line 2 peer comparison',        rejected: 'Different fleet mix and gradient profile' },
      { id: 'BL-T1', label: 'Simulated optimum (SPSIM)',     rejected: 'Outside validated applicability envelope for this segment' },
      { id: 'BL-C1', label: 'Contractual intensity target',  rejected: 'Network-level target, not segment-comparable' }
    ]
  },
  { id: 'BL-03', version: 6, type: 'matched-run-decile', label: 'Line 1 matched-run decile', method: 'As BL-07, applied to Line 1 A-series services.', validFrom: '2026-07-01', validTo: null, band: '\u00b12.1%', sampleRuns: 389, value: 2.48, unit: 'kWh/km', comparability: { score: 'strong', factors: [] }, alternatives: [] },
  { id: 'BL-05', version: 5, type: 'matched-run-decile', label: 'Line 2 matched-run decile', method: 'As BL-07, applied to Line 2 mixed-fleet services.', validFrom: '2026-07-01', validTo: null, band: '\u00b12.6%', sampleRuns: 344, value: 2.61, unit: 'kWh/km', comparability: { score: 'medium', factors: [] }, alternatives: [] },
  { id: 'BL-09', version: 3, type: 'historical-self',    label: 'Line 4 historical self \u2014 rolling 12 months', method: 'Same services, same period last year, seasonally corrected.', validFrom: '2026-04-01', validTo: null, band: '\u00b13.4%', sampleRuns: 201, value: 2.39, unit: 'kWh/km', comparability: { score: 'weak', factors: [] }, alternatives: [] }
];

/* ---------------------------------------------------------------------------
   7. CASES
   EC-2043 is the demonstration spine and is modelled completely. The remainder
   populate the queues at varied stages so the workspaces have realistic shape.
   ------------------------------------------------------------------------- */

var CASES = [

/* ===== EC-2043 — the spine ============================================== */
{
  id: 'EC-2043',
  title: 'Coasting profile adjustment for high-energy runs',
  hypothesis: sys('Coasting looks to be starting too late on the Northgate approach, adding avoidable traction demand across the last 600 m before braking.', 'S1', '2026-09-08T04:12:00Z'),

  origin: { type: 'signal', ref: 'SIG-11842', at: '2026-09-08T04:12:00Z',
            note: 'Correlated from 1,842 signals scanned in 24h; 23 candidates; 3 promoted.' },

  scope: { lineId: 'L3', segmentId: 'SEG-317', direction: 'Northbound', fleet: 'B-series', services: 'All-stations, off-peak' },

  stage: { key: 'decide' },
  gates: { detect: 'met', diagnose: 'met', simulate: 'met', decide: 'open', release: 'pending', verify: 'pending' },

  metrics: {
    observed:  3.25, baseline: 2.55, gap: 0.70, unit: 'kWh/km',
    runs: 412, annualMWh: 214, annualValue: 32000, currencySymbol: '\u00a3',
    timeCost: 11, timeBudget: 42, timeFloor: 17, timeRetained: 31
  },

  baselineId: 'BL-07',
  baselineConfirmed: human(true, 'Priya Raman', '2026-09-11T09:20:00Z'),

  confidence: sys('medium', 'S4', '2026-09-19T06:00:00Z', null),
  confidenceDetail: {
    tier: 'medium',
    limitedBy: 'Load-band spread within the matched sample',
    inputs: { completeness: 94, runs: 412, comparability: 'strong', modelApplicability: 'within envelope' }
  },

  attribution: {
    proposed: sys('operational', 'S6', '2026-09-12T11:05:00Z'),
    confirmed: human('operational', 'David Osei', '2026-09-15T14:30:00Z'),
    indicators: {
      supports: [
        'Gap concentrates in a single segment rather than across the diagram',
        'Present across 11 of 14 B-series units — not unit-specific',
        'Regenerative recovery within 2% of fleet norm on the same runs'
      ],
      contradicts: [
        'Two units show a 6% wider gap than the rest of the cohort'
      ]
    }
  },

  readiness: [
    { q: 'Is a qualifying baseline confirmed?',                 state: 'met', by: 'Priya Raman', at: '2026-09-11' },
    { q: 'Is the sample large enough to be conclusive?',        state: 'met', by: 'S4',          at: '2026-09-11' },
    { q: 'Has the cause been ruled on by the right specialist?',state: 'met', by: 'David Osei',  at: '2026-09-15' },
    { q: 'Is the lever inside the operational constraint envelope?', state: 'met', by: 'S9',     at: '2026-09-16' },
    { q: 'Is the currency the change spends declared?',         state: 'met', by: 'Priya Raman', at: '2026-09-16' },
    { q: 'Is the measurement method defined before implementation?', state: 'met', by: 'Priya Raman', at: '2026-09-17' },
    { q: 'Is an accountable owner identified for the decision?',state: 'met', by: 'S8',          at: '2026-09-17' }
  ],

  evidence: [
    { block: 'A', question: 'How large is the gap, and is it stable?',
      chart: 'trend', method: 'Matched-run intensity against BL-07, 12-week rolling',  n: 412,
      reading: sys('The gap has held between 0.66 and 0.73 kWh/km for 11 weeks running. That consistency points to a routine operating pattern, not a passing disruption.', 'S5', '2026-09-11T10:02:00Z') },

    { block: 'B', question: 'Where on the segment does it occur?',
      chart: 'distance-profile', method: 'Energy per 100 m against baseline decile', n: 412,
      reading: sys('81% of the excess builds in the last 600 m before the braking point. That places the cause at coasting initiation rather than departure acceleration.', 'S5', '2026-09-11T10:04:00Z') },

    { block: 'C', question: 'Does it affect all trains or a subset?',
      chart: 'unit-distribution', method: 'Per-unit intensity, B-series cohort', n: 14,
      reading: override(
        '11 of 14 units show the pattern, which points to an operating cause rather than a vehicle one.',
        '11 of 14 units show the pattern, which points to an operating cause rather than a vehicle one. Two units sit 6% wider and have been raised separately as EC-2051.',
        'Priya Raman', '2026-09-12T15:40:00Z') },

    { block: 'D', question: 'Is the driving profile consistent or variable?',
      chart: 'speed-envelope', method: 'Speed profile distribution, 10th\u201390th percentile band', n: 412,
      reading: sys('Coasting starts anywhere across a 340 m spread. The best decile begins 210 m earlier than the median, and that single difference accounts for most of the gap.', 'S5', '2026-09-11T10:09:00Z') },

    { block: 'E', question: 'What operating conditions accompany it?',
      chart: 'condition-matrix', method: 'Dwell, headway and regulation state at segment entry', n: 412,
      reading: sys('The widest gaps sit on runs entering the segment 20\u201340 s early. Recovery margin is being spent on higher running speed instead of held.', 'S5', '2026-09-11T10:14:00Z') },

    { block: 'F', question: 'What would change if the lever were applied?',
      chart: 'counterfactual', method: 'SPSIM re-run on the matched set with adjusted coasting point', n: 412,
      reading: sys('Moving the coasting point to the best-decile position cuts segment intensity by 4.3% for 11 s of runtime. That leaves 31 s of the 42 s recovery budget intact.', 'S9', '2026-09-16T08:30:00Z') }
  ],

  levers: [
    { id: 'LV-COAST', label: 'Coasting point adjustment', currency: 'time',
      executionPath: 'Driver advisory profile update, issued through the existing ATO speed profile revision process',
      envelope: { constraint: 'Recovery margin floor', floor: 17, unit: 's', headroom: 25, state: 'within' },
      actionability: 'within-envelope' }
  ],

  scenarios: [
    { id: 'SC-A', label: 'Margin-safe',    energyPct: -2.4, timeCost: 5,  annualMWh: 121, value: 18000, retained: 37, confidence: 'high',   recommended: false, draws: ['time'] },
    { id: 'SC-B', label: 'Balanced',       energyPct: -4.3, timeCost: 11, annualMWh: 214, value: 32000, retained: 31, confidence: 'medium', recommended: true,  draws: ['time'] },
    { id: 'SC-C', label: 'Margin-limited', energyPct: -6.1, timeCost: 24, annualMWh: 304, value: 45000, retained: 18, confidence: 'medium', recommended: false, draws: ['time', 'capacity'] }
  ],
  scenarioRecommended: sys('SC-B', 'S9', '2026-09-16T08:30:00Z'),
  scenarioSelected: human('SC-B', 'Priya Raman', '2026-09-17T11:10:00Z'),

  precedentId: 'EC-2038',

  decision: null,
  decisionPending: {
    approver: sys('opm', 'S8', '2026-09-17T11:45:00Z'),
    asks: 'Approve 11 s of the 42 s recovery budget on SEG-317 northbound. This retains 31 s against a 17 s floor and is estimated to realise 214 MWh a year.',
    recommendedPath: sys('trial', 'S7', '2026-09-17T11:45:00Z'),
    recommendedPathWhy: 'Comparable cases at medium confidence converted better when trialled first \u2014 3 of 3 precedents did.',
    due: '2026-09-26'
  },

  plan: {
    basis: 'Matched-run decile against BL-07 v4',
    window: '8 weeks',
    threshold: '\u22652.5% intensity reduction',
    confounders: ['Timetable change', 'Passenger load shift'],
    lockedAt: null,
    draftedBy: sys(true, 'S10', '2026-09-17T11:45:00Z')
  },

  outcome: null,

  owner: 'epm',
  assignee: 'analyst',
  assigneeName: 'Priya Raman',
  awaiting: { role: 'opm', what: 'approval', since: '2026-09-17' },
  due: '2026-09-26',
  opened: '2026-09-08',

  trail: [
    { at: '2026-09-08T04:12', kind: 'system', actor: 'S1',          text: 'Promoted from 23 correlated signals. Completeness 94%, 412 comparable runs.' },
    { at: '2026-09-09T08:30', kind: 'human',  actor: 'Anna Clark',  text: 'Accepted candidate and assigned to Priya Raman.' },
    { at: '2026-09-10T09:15', kind: 'system', actor: 'S2',          text: 'Fitted baseline BL-07 v4. Three alternatives rejected, each with a reason.' },
    { at: '2026-09-11T09:20', kind: 'human',  actor: 'Priya Raman', text: 'Confirmed baseline BL-07 v4.' },
    { at: '2026-09-11T10:14', kind: 'system', actor: 'S5',          text: 'Drafted readings for evidence blocks A\u2013E.' },
    { at: '2026-09-12T11:05', kind: 'system', actor: 'S6',          text: 'Proposed an operational cause. Verdict requested from Operations.' },
    { at: '2026-09-12T15:40', kind: 'human',  actor: 'Priya Raman', text: 'Edited reading on block C; raised two outlier units as EC-2051.' },
    { at: '2026-09-15T14:30', kind: 'human',  actor: 'David Osei',  text: 'Ruled cause operational. Diagnose gate met.' },
    { at: '2026-09-16T08:30', kind: 'system', actor: 'S9',          text: 'Generated three bundles and checked each against the constraint envelope. SC-B recommended.' },
    { at: '2026-09-17T11:10', kind: 'human',  actor: 'Priya Raman', text: 'Selected bundle SC-B and closed readiness 7 of 7.' },
    { at: '2026-09-17T11:45', kind: 'system', actor: 'S8',          text: 'Routed to Operations for time-budget approval, due 26 September.' }
  ]
},

/* ===== supporting cases ================================================= */
{
  id: 'EC-2051', title: 'Two B-series units with widened intensity gap',
  hypothesis: sys('Two B-series units run a 6% wider gap than their peers on identical runs. That pattern fits a propulsion or auxiliary-load condition.', 'S6', '2026-09-12T15:45:00Z'),
  origin: { type: 'manual', ref: 'EC-2043', at: '2026-09-12T15:45:00Z', note: 'Split out from EC-2043 evidence block C.' },
  scope: { lineId: 'L3', segmentId: null, direction: 'Both', fleet: 'B-series', services: 'All', units: ['B-214', 'B-227'] },
  stage: { key: 'diagnose' },
  gates: { detect: 'met', diagnose: 'open', simulate: 'pending', decide: 'pending', release: 'pending', verify: 'pending' },
  metrics: { observed: 3.44, baseline: 2.55, gap: 0.89, unit: 'kWh/km', runs: 58, annualMWh: 41, annualValue: 6200, currencySymbol: '\u00a3' },
  baselineId: 'BL-07', baselineConfirmed: human(true, 'Priya Raman', '2026-09-13T10:00:00Z'),
  confidence: sys('low', 'S4', '2026-09-19T06:00:00Z'),
  confidenceDetail: { tier: 'low', limitedBy: 'Only 58 comparable runs across two units', inputs: { completeness: 91, runs: 58, comparability: 'strong', modelApplicability: 'within envelope' } },
  attribution: { proposed: sys('technical', 'S6', '2026-09-13T11:00:00Z'), confirmed: null,
    indicators: { supports: ['Confined to two units', 'Regen recovery 7% below cohort norm'], contradicts: ['Both units recently returned from scheduled maintenance'] } },
  readiness: [
    { q: 'Is a qualifying baseline confirmed?', state: 'met', by: 'Priya Raman', at: '2026-09-13' },
    { q: 'Is the sample large enough to be conclusive?', state: 'open', by: null, at: null },
    { q: 'Has the cause been ruled on by the right specialist?', state: 'open', by: null, at: null },
    { q: 'Is the lever inside the operational constraint envelope?', state: 'open', by: null, at: null },
    { q: 'Is the currency the change spends declared?', state: 'open', by: null, at: null },
    { q: 'Is the measurement method defined before implementation?', state: 'open', by: null, at: null },
    { q: 'Is an accountable owner identified for the decision?', state: 'met', by: 'S8', at: '2026-09-13' }
  ],
  evidence: [], levers: [], scenarios: [], scenarioRecommended: null, scenarioSelected: null,
  precedentId: null, decision: null, decisionPending: null, plan: null, outcome: null,
  owner: 'epm', assignee: 'analyst', assigneeName: 'Priya Raman',
  awaiting: { role: 'rse', what: 'verdict', since: '2026-09-13' },
  due: '2026-09-24', opened: '2026-09-12',
  trail: [
    { at: '2026-09-12T15:45', kind: 'human',  actor: 'Priya Raman', text: 'Raised from EC-2043 evidence block C.' },
    { at: '2026-09-13T11:00', kind: 'system', actor: 'S6',          text: 'Proposed a technical cause. Verdict requested from Rolling Stock.' }
  ]
},

{
  id: 'EC-2047', title: 'Extended dwell absorbing recovery margin at Kingsway',
  hypothesis: sys('Dwell overrun at Kingsway northbound appears to be pushing recovery margin into higher running speed on the next segment.', 'S1', '2026-09-14T04:20:00Z'),
  origin: { type: 'signal', ref: 'SIG-11903', at: '2026-09-14T04:20:00Z', note: null },
  scope: { lineId: 'L3', segmentId: 'SEG-318', direction: 'Northbound', fleet: 'B-series', services: 'Peak' },
  stage: { key: 'simulate' },
  gates: { detect: 'met', diagnose: 'met', simulate: 'open', decide: 'pending', release: 'pending', verify: 'pending' },
  metrics: { observed: 3.11, baseline: 2.55, gap: 0.56, unit: 'kWh/km', runs: 287, annualMWh: 96, annualValue: 14500, currencySymbol: '\u00a3' },
  baselineId: 'BL-07', baselineConfirmed: human(true, 'Priya Raman', '2026-09-16T09:00:00Z'),
  confidence: sys('medium', 'S4', '2026-09-19T06:00:00Z'),
  confidenceDetail: { tier: 'medium', limitedBy: 'Peak-period load variance', inputs: { completeness: 88, runs: 287, comparability: 'medium', modelApplicability: 'within envelope' } },
  attribution: { proposed: sys('operational', 'S6', '2026-09-16T12:00:00Z'), confirmed: human('operational', 'David Osei', '2026-09-18T10:15:00Z'),
    indicators: { supports: ['Correlates with dwell overrun above 8 s', 'Absent in off-peak runs'], contradicts: [] } },
  readiness: [
    { q: 'Is a qualifying baseline confirmed?', state: 'met', by: 'Priya Raman', at: '2026-09-16' },
    { q: 'Is the sample large enough to be conclusive?', state: 'met', by: 'S4', at: '2026-09-16' },
    { q: 'Has the cause been ruled on by the right specialist?', state: 'met', by: 'David Osei', at: '2026-09-18' },
    { q: 'Is the lever inside the operational constraint envelope?', state: 'open', by: null, at: null },
    { q: 'Is the currency the change spends declared?', state: 'open', by: null, at: null },
    { q: 'Is the measurement method defined before implementation?', state: 'open', by: null, at: null },
    { q: 'Is an accountable owner identified for the decision?', state: 'met', by: 'S8', at: '2026-09-16' }
  ],
  evidence: [], levers: [], scenarios: [], scenarioRecommended: null, scenarioSelected: null,
  precedentId: null, decision: null, decisionPending: null, plan: null, outcome: null,
  owner: 'epm', assignee: 'analyst', assigneeName: 'Priya Raman',
  awaiting: { role: 'analyst', what: 'scenario', since: '2026-09-18' },
  due: '2026-09-29', opened: '2026-09-14',
  trail: [
    { at: '2026-09-14T04:20', kind: 'system', actor: 'S1',         text: 'Promoted on 287 comparable runs.' },
    { at: '2026-09-18T10:15', kind: 'human',  actor: 'David Osei', text: 'Ruled cause operational. Diagnose gate met.' }
  ]
},

{
  id: 'EC-2044', title: 'Regenerative recovery shortfall, C-series on Line 4',
  hypothesis: sys('C-series units have no regenerative capability, which leaves a structural intensity gap. No operating change will close it.', 'S1', '2026-09-09T04:15:00Z'),
  origin: { type: 'signal', ref: 'SIG-11856', at: '2026-09-09T04:15:00Z', note: null },
  scope: { lineId: 'L4', segmentId: null, direction: 'Both', fleet: 'C-series', services: 'All', units: ['C-206'] },
  stage: { key: 'diagnose' },
  gates: { detect: 'met', diagnose: 'blocked', simulate: 'pending', decide: 'pending', release: 'pending', verify: 'pending' },
  metrics: { observed: 2.94, baseline: 2.39, gap: 0.55, unit: 'kWh/km', runs: 174, annualMWh: 88, annualValue: 13200, currencySymbol: '\u00a3' },
  baselineId: 'BL-09', baselineConfirmed: null,
  confidence: sys('low', 'S4', '2026-09-19T06:00:00Z'),
  confidenceDetail: { tier: 'low', limitedBy: 'Baseline BL-09 scores weak on comparability', inputs: { completeness: 76, runs: 174, comparability: 'weak', modelApplicability: 'outside envelope' } },
  blocked: { by: 'S2', reason: 'No qualifying baseline is available. BL-09 compares the fleet against its own history across a period containing a timetable change, and no peer fleet is close enough to stand in.' },
  attribution: { proposed: sys('technical', 'S6', '2026-09-10T09:00:00Z'), confirmed: null,
    indicators: { supports: ['Uniform across all 19 units', 'Fleet has no regenerative capability'], contradicts: ['Gap is structural, so may not be an inefficiency at all'] } },
  readiness: [
    { q: 'Is a qualifying baseline confirmed?', state: 'open', by: null, at: null },
    { q: 'Is the sample large enough to be conclusive?', state: 'met', by: 'S4', at: '2026-09-10' },
    { q: 'Has the cause been ruled on by the right specialist?', state: 'open', by: null, at: null },
    { q: 'Is the lever inside the operational constraint envelope?', state: 'open', by: null, at: null },
    { q: 'Is the currency the change spends declared?', state: 'open', by: null, at: null },
    { q: 'Is the measurement method defined before implementation?', state: 'open', by: null, at: null },
    { q: 'Is an accountable owner identified for the decision?', state: 'met', by: 'S8', at: '2026-09-10' }
  ],
  evidence: [], levers: [], scenarios: [], scenarioRecommended: null, scenarioSelected: null,
  precedentId: null, decision: null, decisionPending: null, plan: null, outcome: null,
  owner: 'epm', assignee: 'analyst', assigneeName: 'Priya Raman',
  awaiting: { role: 'analyst', what: 'baseline', since: '2026-09-10' },
  due: '2026-10-02', opened: '2026-09-09',
  trail: [
    { at: '2026-09-09T04:15', kind: 'system', actor: 'S1', text: 'Promoted on 174 comparable runs.' },
    { at: '2026-09-10T09:00', kind: 'system', actor: 'S2', text: 'No qualifying baseline found. Holding the case at Diagnose.' }
  ]
},

{
  id: 'EC-2039', title: 'Speed profile smoothing, Line 1 southbound',
  hypothesis: human('Acceleration profile on departure is steeper than necessary for the achieved headway.', 'Priya Raman', '2026-08-21T10:00:00Z'),
  origin: { type: 'manual', ref: null, at: '2026-08-21T10:00:00Z', note: 'Raised from a driver feedback observation.' },
  scope: { lineId: 'L1', segmentId: null, direction: 'Southbound', fleet: 'A-series', services: 'Off-peak' },
  stage: { key: 'release' },
  gates: { detect: 'met', diagnose: 'met', simulate: 'met', decide: 'met', release: 'open', verify: 'pending' },
  metrics: { observed: 2.79, baseline: 2.48, gap: 0.31, unit: 'kWh/km', runs: 226, annualMWh: 67, annualValue: 10100, currencySymbol: '\u00a3', timeCost: 4, timeBudget: 38, timeFloor: 15, timeRetained: 34 },
  baselineId: 'BL-03', baselineConfirmed: human(true, 'Priya Raman', '2026-08-25T09:00:00Z'),
  confidence: sys('high', 'S4', '2026-09-19T06:00:00Z'),
  confidenceDetail: { tier: 'high', limitedBy: null, inputs: { completeness: 97, runs: 226, comparability: 'strong', modelApplicability: 'within envelope' } },
  attribution: { proposed: sys('movement', 'S6', '2026-08-26T09:00:00Z'), confirmed: human('movement', 'David Osei', '2026-08-29T11:00:00Z'), indicators: { supports: [], contradicts: [] } },
  readiness: [
    { q: 'Is a qualifying baseline confirmed?', state: 'met', by: 'Priya Raman', at: '2026-08-25' },
    { q: 'Is the sample large enough to be conclusive?', state: 'met', by: 'S4', at: '2026-08-25' },
    { q: 'Has the cause been ruled on by the right specialist?', state: 'met', by: 'David Osei', at: '2026-08-29' },
    { q: 'Is the lever inside the operational constraint envelope?', state: 'met', by: 'S9', at: '2026-09-01' },
    { q: 'Is the currency the change spends declared?', state: 'met', by: 'Priya Raman', at: '2026-09-01' },
    { q: 'Is the measurement method defined before implementation?', state: 'met', by: 'Priya Raman', at: '2026-09-03' },
    { q: 'Is an accountable owner identified for the decision?', state: 'met', by: 'S8', at: '2026-09-01' }
  ],
  evidence: [], levers: [], scenarios: [], scenarioRecommended: null,
  scenarioSelected: human('SC-A', 'Priya Raman', '2026-09-03T10:00:00Z'),
  precedentId: 'EC-2038',
  decision: { verdict: 'approved-trial', by: 'David Osei', role: 'opm', at: '2026-09-05T14:00:00Z',
              rationale: 'Four seconds is within delegated limit and the confidence tier is high. Approved as an 8-week trial.' },
  decisionPending: null,
  plan: { basis: 'Matched-run decile against BL-03 v6', window: '8 weeks', threshold: '\u22652.0% intensity reduction',
          confounders: ['Timetable change', 'Fleet reallocation'], lockedAt: '2026-09-05T14:10:00Z', draftedBy: sys(true, 'S10', '2026-09-05T13:50:00Z') },
  outcome: null,
  owner: 'epm', assignee: 'opm', assigneeName: 'David Osei',
  awaiting: { role: 'opm', what: 'implementation', since: '2026-09-05' },
  due: '2026-09-25', opened: '2026-08-21',
  trail: [
    { at: '2026-08-21T10:00', kind: 'human',  actor: 'Priya Raman', text: 'Case raised manually from driver feedback.' },
    { at: '2026-09-05T14:00', kind: 'human',  actor: 'David Osei',  text: 'Approved as an 8-week trial, 4 s of a 38 s budget.' },
    { at: '2026-09-05T14:10', kind: 'system', actor: 'S10',         text: 'Measurement plan locked. Now watching for confounders.' }
  ]
},

{
  id: 'EC-2038', title: 'Auxiliary load reduction during extended layover',
  hypothesis: human('Auxiliary systems remain at full demand through layovers exceeding six minutes.', 'Priya Raman', '2026-06-12T09:00:00Z'),
  origin: { type: 'simulation', ref: 'SIM-4410', at: '2026-06-12T09:00:00Z', note: null },
  scope: { lineId: 'L2', segmentId: null, direction: 'Both', fleet: 'A-series', services: 'All' },
  stage: { key: 'verify' },
  gates: { detect: 'met', diagnose: 'met', simulate: 'met', decide: 'met', release: 'met', verify: 'met' },
  metrics: { observed: 2.92, baseline: 2.61, gap: 0.31, unit: 'kWh/km', runs: 341, annualMWh: 128, annualValue: 19200, currencySymbol: '\u00a3' },
  baselineId: 'BL-05', baselineConfirmed: human(true, 'Priya Raman', '2026-06-18T09:00:00Z'),
  confidence: sys('high', 'S4', '2026-09-01T06:00:00Z'),
  confidenceDetail: { tier: 'high', limitedBy: null, inputs: { completeness: 96, runs: 341, comparability: 'strong', modelApplicability: 'within envelope' } },
  attribution: { proposed: sys('technical', 'S6', '2026-06-20T09:00:00Z'), confirmed: human('technical', 'Marta Lindqvist', '2026-06-24T15:00:00Z'), indicators: { supports: [], contradicts: [] } },
  readiness: [
    { q: 'Is a qualifying baseline confirmed?', state: 'met', by: 'Priya Raman', at: '2026-06-18' },
    { q: 'Is the sample large enough to be conclusive?', state: 'met', by: 'S4', at: '2026-06-18' },
    { q: 'Has the cause been ruled on by the right specialist?', state: 'met', by: 'Marta Lindqvist', at: '2026-06-24' },
    { q: 'Is the lever inside the operational constraint envelope?', state: 'met', by: 'S9', at: '2026-06-26' },
    { q: 'Is the currency the change spends declared?', state: 'met', by: 'Priya Raman', at: '2026-06-26' },
    { q: 'Is the measurement method defined before implementation?', state: 'met', by: 'Priya Raman', at: '2026-06-28' },
    { q: 'Is an accountable owner identified for the decision?', state: 'met', by: 'S8', at: '2026-06-26' }
  ],
  evidence: [], levers: [], scenarios: [], scenarioRecommended: null, scenarioSelected: null,
  precedentId: null,
  decision: { verdict: 'approved', by: 'Anna Clark', role: 'epm', at: '2026-06-30T10:00:00Z',
              rationale: 'No-cost lever with a high confidence tier and no operating trade-off. Approved outright.' },
  decisionPending: null,
  plan: { basis: 'Matched-run decile against BL-05 v5', window: '8 weeks', threshold: '\u22652.5% intensity reduction',
          confounders: ['Timetable change'], lockedAt: '2026-06-30T10:05:00Z', draftedBy: sys(true, 'S10', '2026-06-30T09:50:00Z') },
  outcome: { verdict: 'confirmed', modelled: 128, verified: 118, realisation: 92, unit: 'MWh/yr',
             at: '2026-09-01T09:00:00Z', by: 'Anna Clark',
             reasoning: 'Verified reduction of 2.9% against a 2.5% threshold across the full 8-week window. One confounder was observed and assessed as immaterial.',
             confoundersObserved: [{ what: 'Minor timetable adjustment, Line 2 southbound', at: '2026-07-22', assessed: 'immaterial', by: 'S10' }] },
  owner: 'epm', assignee: 'epm', assigneeName: 'Anna Clark',
  awaiting: null, due: null, opened: '2026-06-12', closed: '2026-09-01',
  trail: [
    { at: '2026-06-30T10:00', kind: 'human',  actor: 'Anna Clark', text: 'Approved outright \u2014 no-cost lever, high confidence.' },
    { at: '2026-06-30T10:05', kind: 'system', actor: 'S10',        text: 'Measurement plan locked. Now watching for confounders.' },
    { at: '2026-09-01T09:00', kind: 'system', actor: 'S11',        text: 'Outcome confirmed. 118 of 128 MWh/yr verified, 92% realisation.' }
  ]
}
];

/* ---------------------------------------------------------------------------
   8. CANDIDATES — promoted by S1, awaiting acceptance into the caseload
   ------------------------------------------------------------------------- */

var CANDIDATES = [
  { id: 'CD-0913', title: 'Braking rate variance, Line 2 northbound approach',
    scope: 'Line 2 \u00b7 SEG-214 \u00b7 A-series', gap: 0.44, unit: 'kWh/km', runs: 198, annualMWh: 72,
    completeness: 89, confidence: 'medium', promotedAt: '2026-09-19T04:10:00Z',
    reading: sys('Braking starts across a 180 m spread, and the spread is widest on services recovering from upstream delay.', 'S1', '2026-09-19T04:10:00Z') },

  { id: 'CD-0914', title: 'Off-peak intensity drift, Line 1 A-series',
    scope: 'Line 1 \u00b7 all segments \u00b7 A-series', gap: 0.29, unit: 'kWh/km', runs: 312, annualMWh: 54,
    completeness: 93, confidence: 'medium', promotedAt: '2026-09-19T04:10:00Z',
    reading: sys('Intensity has drifted 0.29 kWh/km above baseline over six weeks. No timetable or loading change accounts for it.', 'S1', '2026-09-19T04:10:00Z') },

  { id: 'CD-0915', title: 'Interstation runtime variance, Line 3 southbound',
    scope: 'Line 3 \u00b7 SEG-322 \u00b7 B-series', gap: 0.38, unit: 'kWh/km', runs: 164, annualMWh: 48,
    completeness: 84, confidence: 'low', promotedAt: '2026-09-19T04:10:00Z',
    reading: sys('Runtime varies by 26 s between the best and median decile, and most of the excess sits in the departure phase.', 'S1', '2026-09-19T04:10:00Z') }
];

/* Signals scanned but held below the promotion line — S1 states the unmet threshold. */
var HELD_SIGNALS = {
  scanned24h: 1842,
  correlated: 23,
  promoted: 3,
  held: [
    { reason: 'Data completeness below 70%',            count: 11 },
    { reason: 'Fewer than 30 comparable runs',          count: 6  },
    { reason: 'No qualifying baseline match available', count: 3  }
  ]
};

/* ---------------------------------------------------------------------------
   9. PORTFOLIO — realisation, conversion and pipeline
   ------------------------------------------------------------------------- */

var PORTFOLIO = {
  period: 'Year to date \u2014 2026',
  intensity: { current: 2.87, baseline: 2.74, unit: 'kWh/km', changePct: -1.9, direction: 'improving' },

  savings: { committedMWh: 508, verifiedMWh: 397, inFlightMWh: 281, currencySymbol: '\u00a3', verifiedValue: 59550 },

  closed: { total: 11, verified: 7, inconclusive: 2, rejected: 2 },
  realisationOnVerified: 93,
  overallConversion: 59,

  conversionByCurrency: [
    { currency: 'none',     raised: 178, converted: 160, pct: 90 },
    { currency: 'time',     raised: 124, converted: 68,  pct: 55 },
    { currency: 'capacity', raised: 84,  converted: 0,   pct: 0  }
  ],

  realisationByLever: [
    { lever: 'Auxiliary load',     cases: 3, modelled: 302, verified: 284, pct: 94 },
    { lever: 'Coasting profile',   cases: 2, modelled: 188, verified: 164, pct: 87 },
    { lever: 'Speed profile',      cases: 2, modelled: 141, verified: 131, pct: 93 },
    { lever: 'Dwell management',   cases: 1, modelled: 62,  verified: 0,   pct: null, note: 'Inconclusive' }
  ],

  pipeline: [
    { stage: 'detect',   count: 3 },
    { stage: 'diagnose', count: 2 },
    { stage: 'simulate', count: 1 },
    { stage: 'decide',   count: 1 },
    { stage: 'release',  count: 1 },
    { stage: 'verify',   count: 0 }
  ],

  atRisk: [
    { caseId: 'EC-2043', why: 'Approval outstanding 6 days', severity: 'medium' },
    { caseId: 'EC-2044', why: 'Blocked at Diagnose \u2014 no qualifying baseline', severity: 'high' },
    { caseId: 'EC-2051', why: 'Verdict outstanding from Rolling Stock', severity: 'medium' }
  ]
};

/* ---------------------------------------------------------------------------
   10. PRECEDENT — closed cases reused by S7
   ------------------------------------------------------------------------- */

var PRECEDENT = [
  { caseId: 'EC-2038', lever: 'Auxiliary load',   currency: 'none', confidence: 'high',   modelled: 128, verified: 118, realisation: 92, path: 'approved',      window: '8 weeks' },
  { caseId: 'EC-2029', lever: 'Coasting profile', currency: 'time', confidence: 'medium', modelled: 96,  verified: 84,  realisation: 88, path: 'trial',         window: '8 weeks' },
  { caseId: 'EC-2021', lever: 'Coasting profile', currency: 'time', confidence: 'medium', modelled: 92,  verified: 80,  realisation: 87, path: 'trial',         window: '12 weeks' },
  { caseId: 'EC-2014', lever: 'Speed profile',    currency: 'time', confidence: 'high',   modelled: 74,  verified: 71,  realisation: 96, path: 'approved',      window: '8 weeks' },
  { caseId: 'EC-2009', lever: 'Dwell management', currency: 'time', confidence: 'low',    modelled: 62,  verified: null, realisation: null, path: 'inconclusive', window: '8 weeks' }
];

/* Interventions that are live and inside their measurement window. They are
   not precedent yet — nothing can be learned from them until the window
   closes — but they are the reason the Verify stage is not empty. */
var VERIFYING = [
  { caseId: 'EC-2036', lever: 'Coasting profile',  scope: 'L2 \u00b7 SEG-204 southbound', modelled: 186, window: '8 weeks',  elapsedWeeks: 5, totalWeeks: 8,  trend: 'on track',    trendDetail: 'Matched-run intensity 2.7% below baseline against a 2.5% threshold.' },
  { caseId: 'EC-2031', lever: 'Dwell management', scope: 'L1 \u00b7 Central platform 2',  modelled: 94,  window: '12 weeks', elapsedWeeks: 3, totalWeeks: 12, trend: 'too early',   trendDetail: 'Below the minimum matched-run count; no reading is published yet.' }
];

/* ---------------------------------------------------------------------------
   11. DATA SOURCES — adapter coverage, read by trust.html and admin.html
   ------------------------------------------------------------------------- */

var SOURCES = [
  { record: 'Run record',      source: 'CBTC / ATO',            state: 'connected', coverage: 99, mandatory: true,
    degrades: 'Mandatory. Without it there is no unit of comparison.' },
  { record: 'Energy measure',  source: 'Substation metering',   state: 'connected', coverage: 94, mandatory: true,
    degrades: 'Mandatory. Method is carried forward and shown; modelled and measured are never mixed silently.' },
  { record: 'Movement trace',  source: 'CBTC',                  state: 'connected', coverage: 97, mandatory: false,
    degrades: 'Movement attribution and speed-profile evidence become unavailable.' },
  { record: 'Schedule record', source: 'Timetable / TMS',       state: 'connected', coverage: 100, mandatory: false,
    degrades: 'The time currency cannot be quantified, so time-spending levers cannot be approved.' },
  { record: 'Asset record',    source: 'Fleet register',        state: 'connected', coverage: 88, mandatory: false,
    degrades: 'The technical branch of attribution closes.' },
  { record: 'Network topology',source: 'Infrastructure model',  state: 'connected', coverage: 100, mandatory: false,
    degrades: 'Comparability scoring loses its strongest factor; baseline confidence is capped.' },
  { record: 'Context series',  source: 'AFC / weather feed',    state: 'partial',   coverage: 61, mandatory: false,
    degrades: 'Confounder watch runs blind, so outcomes grade partially supported more often.' }
];

var MODELS = [
  { id: 'SPSIM',  name: 'Traction simulation',        version: '4.2.1', calibration: 'calibrated', calibratedAt: '2026-08-14',
    envelope: 'B-series and A-series, gradients \u22122.0% to +2.5%, off-peak and peak loading',
    validation: 'Validated against measured energy on 1,204 revenue runs; mean error 3.1%',
    outside: ['C-series \u2014 awaiting recalibration since fleet modification'] },
  { id: 'REGEN',  name: 'Regenerative recovery model', version: '2.8.0', calibration: 'calibrated', calibratedAt: '2026-07-30',
    envelope: 'Regen-capable fleets only; receptivity modelled at substation level',
    validation: 'Validated against substation return metering; mean error 4.6%',
    outside: ['C-series \u2014 no regenerative capability'] },
  { id: 'MATCH',  name: 'Matched-run engine',          version: '3.1.4', calibration: 'current',    calibratedAt: '2026-09-01',
    envelope: 'All fleets and lines where topology and schedule records are present',
    validation: 'Deterministic matching; comparability reported per factor rather than as a composite',
    outside: [] }
];

/* ---------------------------------------------------------------------------
   12. COMPUTED — lifecycle, permissions and queues
   Nothing below is authored on a case. The stepper, queue badges and attention
   count all read these, so they cannot disagree.
   ------------------------------------------------------------------------- */

var compute = {

  stageIndex: function (c) {
    for (var i = 0; i < STAGES.length; i++) { if (STAGES[i].key === c.stage.key) return i; }
    return 0;
  },

  stageLabel: function (c) { return STAGES[compute.stageIndex(c)].label; },

  /* 'done' | 'current' | 'todo' — drives the stepper without the case storing it. */
  stageState: function (c, key) {
    var here = compute.stageIndex(c);
    var idx  = STAGES.map(function (s) { return s.key; }).indexOf(key);
    if (idx < here) return 'done';
    if (idx === here) return 'current';
    return 'todo';
  },

  readinessMet:   function (c) { return (c.readiness || []).filter(function (r) { return r.state === 'met'; }).length; },
  readinessTotal: function (c) { return (c.readiness || []).length; },
  readinessComplete: function (c) { return compute.readinessTotal(c) > 0 && compute.readinessMet(c) === compute.readinessTotal(c); },
  readinessGaps:  function (c) { return (c.readiness || []).filter(function (r) { return r.state !== 'met'; }); },

  isBlocked: function (c) { return !!c.blocked || c.gates[c.stage.key] === 'blocked'; },

  /* Which currency the case's selected scenario spends — drives approval routing. */
  currency: function (c) {
    if (!c.levers || !c.levers.length) return null;
    return c.levers[0].currency;
  },

  approverRole: function (c) {
    var cur = compute.currency(c);
    return cur && CURRENCIES[cur] ? CURRENCIES[cur].approver : 'epm';
  },

  /* The single next action, addressed to one named role. Rule 04 of the
     navigation model: a case with no next action renders as an exception. */
  nextAction: function (c) {
    if (c.outcome)   return { role: null,          what: 'Closed',                 detail: 'Outcome ' + c.outcome.verdict, tone: 'done' };
    if (c.blocked)   return { role: c.assignee,    what: 'Resolve block',          detail: c.blocked.reason, tone: 'blocked' };
    if (!c.awaiting) return { role: null,          what: 'No owner at this stage', detail: 'Requires assignment', tone: 'exception' };

    var map = {
      approval:       { what: 'Approve or reject',      tone: 'gate' },
      verdict:        { what: 'Rule on cause',          tone: 'gate' },
      baseline:       { what: 'Confirm a baseline',     tone: 'work' },
      scenario:       { what: 'Build scenario options', tone: 'work' },
      implementation: { what: 'Implement and release',  tone: 'work' },
      acceptance:     { what: 'Accept assignment',      tone: 'work' }
    };
    var m = map[c.awaiting.what] || { what: c.awaiting.what, tone: 'work' };
    return { role: c.awaiting.role, what: m.what, tone: m.tone, since: c.awaiting.since,
             detail: ROLES[c.awaiting.role] ? ROLES[c.awaiting.role].short : '' };
  },

  daysOpen: function (c, today) {
    var a = parseDay(c.opened), b = parseDay(today || TODAY);
    if (a === null || b === null) return null;
    return Math.round((b - a) / 86400000);
  },

  daysUntilDue: function (c, today) {
    if (!c.due) return null;
    var a = parseDay(today || TODAY), b = parseDay(c.due);
    if (a === null || b === null) return null;
    return Math.round((b - a) / 86400000);
  },

  /* Realisable impact = magnitude x confidence x actionability. This is the
     ranking the portfolio queue uses, not raw MWh. */
  realisableImpact: function (c) {
    var mwh  = (c.metrics && c.metrics.annualMWh) || 0;
    var conf = { high: 1.0, medium: 0.72, low: 0.42 }[c.confidenceDetail ? c.confidenceDetail.tier : 'low'] || 0.42;
    var act  = compute.isBlocked(c) ? 0.25 : (c.levers && c.levers.length ? 1.0 : 0.65);
    return Math.round(mwh * conf * act);
  }
};

/* ---------------------------------------------------------------------------
   13. PERMISSIONS
   Controls render from grants, never from role-name checks. Absence is the
   point: a role without a grant sees no control, not a disabled one.
   ------------------------------------------------------------------------- */

function can(roleId, verb, ctx) {
  var r = ROLES[roleId];
  if (!r || !r.grants[verb]) return false;
  var g = r.grants[verb];
  ctx = ctx || {};

  if (verb === 'approve') {
    if (!g.currencies || !g.currencies.length) return false;
    return !ctx.currency || g.currencies.indexOf(ctx.currency) !== -1;
  }
  if (verb === 'own') {
    if (!g.stages || !g.stages.length) return false;
    return !ctx.stage || g.stages.indexOf(ctx.stage) !== -1;
  }
  if (verb === 'verdict') {
    if (!g.domains) return false;
    return !ctx.domain || g.domains.indexOf(ctx.domain) !== -1;
  }
  return true;
}

/* ---------------------------------------------------------------------------
   14. QUERIES — what each workspace asks of the state layer
   ------------------------------------------------------------------------- */

var query = {
  caseById: function (id) {
    for (var i = 0; i < CASES.length; i++) { if (CASES[i].id === id) return CASES[i]; }
    return null;
  },

  baselineById: function (id) {
    for (var i = 0; i < BASELINES.length; i++) { if (BASELINES[i].id === id) return BASELINES[i]; }
    return null;
  },

  serviceById: function (id) {
    for (var i = 0; i < SERVICES.length; i++) { if (SERVICES[i].id === id) return SERVICES[i]; }
    return null;
  },

  precedentFor: function (c) {
    if (!c.levers || !c.levers.length) return [];
    var label = c.levers[0].label.split(' ')[0].toLowerCase();
    return PRECEDENT.filter(function (p) { return p.lever.toLowerCase().indexOf(label) === 0; });
  },

  /* Open cases assigned to this role — the caseload workbench. */
  caseloadFor: function (roleId) {
    return CASES.filter(function (c) { return !c.outcome && c.assignee === roleId; });
  },

  /* Cases where this role owes a verdict or an approval — the decision queue.
     Only genuine gates appear, which is what keeps the queue credible. */
  gatesFor: function (roleId) {
    return CASES.filter(function (c) {
      if (c.outcome || !c.awaiting) return false;
      if (c.awaiting.role !== roleId) return false;
      return ['approval', 'verdict'].indexOf(c.awaiting.what) !== -1;
    });
  },

  /* Everything genuinely requiring this role — drives the topbar attention count. */
  attentionFor: function (roleId) {
    var items = [];
    CASES.forEach(function (c) {
      if (c.outcome || !c.awaiting || c.awaiting.role !== roleId) return;
      items.push({ caseId: c.id, what: c.awaiting.what, since: c.awaiting.since });
    });
    if (roleId === 'epm') {
      CANDIDATES.forEach(function (cd) { items.push({ caseId: cd.id, what: 'acceptance', since: cd.promotedAt }); });
    }
    return items;
  },

  openCases:   function () { return CASES.filter(function (c) { return !c.outcome; }); },
  closedCases: function () { return CASES.filter(function (c) { return !!c.outcome; }); },

  /* Portfolio ranking — realisable impact, not raw magnitude. */
  ranked: function () {
    return query.openCases().slice().sort(function (a, b) {
      return compute.realisableImpact(b) - compute.realisableImpact(a);
    });
  }
};

/* ---------------------------------------------------------------------------
   15. SESSION — role persists across navigation so the switcher is usable
   ------------------------------------------------------------------------- */

var KEY = 'hmax.session';

/* In-memory mirror. localStorage can be unavailable or throw under file://
   and in private-browsing modes; the role switcher must still work, so
   storage is treated as an optional durability layer, not the source of
   truth for the current page. */
var mem = null;

function readStore() {
  try {
    var raw = global.localStorage && global.localStorage.getItem(KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    return (s && ROLES[s.role]) ? s : null;
  } catch (e) { return null; }
}

function writeStore(s) {
  mem = s;
  try { global.localStorage && global.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  return s;
}

var session = {
  get: function () {
    var s = mem || readStore() || { role: 'analyst', depth: null };
    if (!ROLES[s.role]) s = { role: 'analyst', depth: null };
    if (!s.depth) s.depth = ROLES[s.role].depth;
    mem = s;
    return s;
  },

  setRole: function (roleId) {
    if (!ROLES[roleId]) return session.get();
    return writeStore({ role: roleId, depth: ROLES[roleId].depth });
  },

  setDepth: function (depth) {
    var s = session.get();
    return writeStore({ role: s.role, depth: depth });
  },

  role: function () { return ROLES[session.get().role]; }
};

/* ---------------------------------------------------------------------------
   EXPORT
   ------------------------------------------------------------------------- */

global.HMAX = {
  val: val, sys: sys, human: human, override: override,
  ROLES: ROLES, NAV: NAV, NAV_GROUPS: NAV_GROUPS, STAGES: STAGES, CURRENCIES: CURRENCIES, SERVICES: SERVICES,
  NETWORK: NETWORK, BASELINES: BASELINES, CASES: CASES, CANDIDATES: CANDIDATES,
  HELD_SIGNALS: HELD_SIGNALS, PORTFOLIO: PORTFOLIO, PRECEDENT: PRECEDENT, VERIFYING: VERIFYING,
  SOURCES: SOURCES, MODELS: MODELS,
  compute: compute, can: can, query: query, session: session,
  TODAY: TODAY, parseDay: parseDay,
  SPINE: 'EC-2043'
};

})(typeof window !== 'undefined' ? window : globalThis);
