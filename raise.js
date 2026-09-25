/* ===========================================================================
   HMAX — raise.js
   Promotion: the bridge from a measurement to a managed case.

   This is the single most important interaction in the product. Everywhere a
   user can see an inefficiency, they can promote it — and promotion is never
   a bare "create". It fixes the baseline, records what the figure was at the
   moment of promotion, states the readiness the case will start with, and
   resolves the owner from attribution, currency and asset scope rather than
   asking the user to choose one.
   ========================================================================= */

(function (global) {
'use strict';

var H = global.HMAX;
var R = H.render, Q = H.query, N = H.net;
var esc = R.esc;

/* ------------------------------------------------------- routing proposal
   Mirrors the rule the case spine uses at Decide, applied early so the user
   can see who the work would land on before committing to raising it.
   --------------------------------------------------------------------- */

function proposeOwner(subject) {
  if (subject.kind === 'unit' || subject.domain === 'technical') {
    return { role: 'rse', why: 'Divergence is unit-level, so the first verdict is a rolling stock question.' };
  }
  if (subject.dwellLed) {
    return { role: 'opm', why: 'The leading indicator is dwell and regulation, which sits with operations.' };
  }
  return { role: 'analyst', why: 'No single domain is yet indicated, so the case opens with analysis to establish attribution.' };
}

function proposeBaseline(subject) {
  var lineId = subject.lineId;
  var line = N.lineById(lineId);
  var bl = line ? Q.baselineById(line.baselineId) : null;
  if (bl) return { id: bl.id, version: bl.version, label: bl.label, band: bl.band, score: bl.comparability.score };
  return null;
}

function estimate(subject) {
  if (subject.annualMWh != null) return subject.annualMWh;
  if (subject.excessMwh != null) return Math.round(subject.excessMwh);
  return null;
}

/* ------------------------------------------------------------ normalise
   Accepts an interstation hop, a fleet unit or a deviation record and
   reduces them to the one shape the dialogue understands.
   --------------------------------------------------------------------- */

function normalise(s) {
  if (!s) return null;
  if (s.from && s.to) {
    return {
      kind: 'location',
      title: 'Elevated intensity, ' + s.label,
      where: (R.lineOf(s.lineId) || {}).name + ' \u00b7 ' + s.direction + ' \u00b7 ' + s.km.toFixed(2) + ' km',
      lineId: s.lineId, ref: s.id,
      measured: s.kwhPerKm, baseline: s.baseline, runs: s.runs,
      excessMwh: s.excessMwh,
      dwellLed: s.dwellMean > 42,
      domain: s.regenPct < 26 ? 'technical' : null,
      facts: [
        ['Measured intensity', s.kwhPerKm.toFixed(2) + ' kWh/km'],
        ['Against baseline', s.baseline.toFixed(2) + ' kWh/km'],
        ['Runs in period', String(s.runs)],
        ['Mean dwell', s.dwellMean + ' s'],
        ['Runtime variance', s.runtimeSd.toFixed(1) + ' s'],
        ['Regenerative recovery', s.regenPct.toFixed(1) + '%']
      ]
    };
  }
  if (s.fleet) {
    return {
      kind: 'unit',
      title: 'Intensity divergence, ' + s.id,
      where: s.fleet + ' \u00b7 ' + ((R.lineOf(s.line) || {}).name || s.line) + ' \u00b7 ' + s.propulsion,
      lineId: s.line, ref: s.id,
      measured: s.kwhPerKm, baseline: s.baseline, runs: s.runsPeriod,
      excessMwh: Math.round((s.kwhPerKm - s.baseline) * s.kmPeriod * 4.3 / 1000),
      domain: 'technical',
      facts: [
        ['Unit intensity', s.kwhPerKm.toFixed(2) + ' kWh/km'],
        ['Fleet baseline', s.baseline.toFixed(2) + ' kWh/km'],
        ['Intensity index', s.index + ' (fleet = 100)'],
        ['Regenerative recovery', s.regenPct.toFixed(1) + '%'],
        ['Runs in period', String(s.runsPeriod)],
        ['Availability', s.availability.toFixed(1) + '%']
      ]
    };
  }
  return {
    kind: 'deviation',
    title: 'Sustained deviation, ' + s.scope,
    where: s.scope, lineId: s.lineId, ref: s.id,
    measured: s.kwhPerKm, baseline: s.baseline, runs: s.runs,
    annualMWh: s.annualMWh,
    facts: [
      ['Measured intensity', s.kwhPerKm.toFixed(2) + ' kWh/km'],
      ['Against baseline', s.baseline.toFixed(2) + ' kWh/km'],
      ['Runs in period', String(s.runs)],
      ['Persistence', s.persistence + ', ' + s.weeks + ' weeks']
    ]
  };
}

/* --------------------------------------------------------------- readiness
   The gate conditions a new case must satisfy before it can leave Detect.
   Showing them at promotion is what stops a case being opened on evidence
   that will never support a decision.
   --------------------------------------------------------------------- */

function readiness(subject, bl) {
  var completeness = subject.kind === 'unit' ? 91 : 94;
  return [
    { met: subject.runs >= 30, label: 'Sample size above threshold',
      detail: subject.runs + ' runs against a minimum of 30' },
    { met: !!bl, label: 'Qualifying baseline exists',
      detail: bl ? bl.id + ' v' + bl.version + ', comparability ' + bl.score : 'No baseline fits this scope' },
    { met: completeness >= 70, label: 'Input completeness above threshold',
      detail: completeness + '% of required records present over the period' },
    { met: false, label: 'Attribution ruled by a specialist',
      detail: 'Opens unmet. A case cannot reach a decision until a named specialist has ruled.' },
    { met: false, label: 'Owner accepted the case',
      detail: 'Assignment is proposed below and confirmed on raise.' }
  ];
}

/* ------------------------------------------------------------------ view */

function markup(subject) {
  var bl = proposeBaseline(subject);
  var owner = proposeOwner(subject);
  var role = H.ROLES[owner.role];
  var est = estimate(subject);
  var checks = readiness(subject, bl);
  var met = checks.filter(function (c) { return c.met; }).length;

  return '<div class="decision-modal" onclick="event.stopPropagation()" style="width:620px">' +
    '<div class="dm-head">' +
      '<div class="dm-title">Raise a case</div>' +
      '<div class="dm-sub">' + esc(subject.where) + '</div>' +
    '</div>' +

    '<div class="dm-body">' +

      '<div class="text-[13.5px] font-semibold mb-1" style="color:var(--text-primary)">' +
        esc(subject.title) + '</div>' +
      '<div class="text-[11.5px] mb-4" style="color:var(--text-secondary);line-height:1.6">' +
        'Raising a case fixes the comparison used to measure this problem and the figures as they stand ' +
        'today, so that any later claim of improvement is made against what was actually observed.</div>' +

      '<div class="grid grid-cols-2 gap-x-6 gap-y-2 mb-5">' +
        subject.facts.map(function (f) {
          return '<div class="flex items-baseline justify-between gap-3 py-1" style="border-bottom:1px solid var(--border-soft)">' +
            '<span class="text-[11.5px]" style="color:var(--text-secondary)">' + esc(f[0]) + '</span>' +
            '<span class="mono text-[11.5px]" style="color:var(--text-primary)">' + esc(f[1]) + '</span></div>';
        }).join('') +
      '</div>' +

      '<div class="stat-label mb-2">Baseline to be fixed</div>' +
      (bl
        ? '<div class="surface rounded-lg p-3 mb-4">' +
            '<div class="flex items-center gap-2 mb-1">' +
              '<span class="mono text-[11px]" style="color:var(--accent)">' + esc(bl.id) + ' v' + bl.version + '</span>' +
              R.sref('S2') +
              '<span class="ml-auto mono text-[10.5px]" style="color:var(--text-tertiary)">band ' + esc(bl.band) + '</span></div>' +
            '<div class="text-[11.5px]" style="color:var(--text-secondary);line-height:1.55">' + esc(bl.label) + '</div>' +
          '</div>'
        : R.cannotConclude('No qualifying baseline',
            'Nothing in the baseline library fits this scope closely enough to support a claim of inefficiency.',
            'The case can still be raised, but it will open blocked at Diagnose until a baseline is built.', 'S2')) +

      '<div class="stat-label mb-2">Readiness at open</div>' +
      '<div class="mb-4">' +
        checks.map(function (c) {
          return '<div class="flex items-start gap-2.5 py-1.5">' +
            '<span style="width:14px;flex-shrink:0;margin-top:2px;color:' +
              (c.met ? 'var(--green)' : 'var(--text-tertiary)') + '">' + (c.met ? '\u2713' : '\u25cb') + '</span>' +
            '<span style="min-width:0"><span class="block text-[12px]" style="color:var(--text-' +
              (c.met ? 'primary' : 'secondary') + ')">' + esc(c.label) + '</span>' +
            '<span class="block text-[10.5px] mt-0.5" style="color:var(--text-tertiary);line-height:1.5">' +
              esc(c.detail) + '</span></span>' +
          '</div>';
        }).join('') +
        '<div class="text-[11px] mt-1.5" style="color:var(--text-tertiary)">' + met + ' of ' + checks.length +
          ' met. The remaining conditions are the work of the case.</div>' +
      '</div>' +

      '<div class="stat-label mb-2">Proposed assignment</div>' +
      '<div class="surface rounded-lg p-3 mb-4">' +
        '<div class="flex items-center gap-2.5 mb-2">' +
          '<span class="rs-avatar" style="width:26px;height:26px;font-size:10px;background:' + role.soft +
            ';color:' + role.color + '">' + esc(role.initials) + '</span>' +
          '<span><span class="block text-[12.5px] font-semibold">' + esc(role.person) + '</span>' +
          '<span class="block text-[10.5px]" style="color:var(--text-tertiary)">' + esc(role.name) + '</span></span>' +
          '<span class="ml-auto">' + R.sref('S8') + '</span>' +
        '</div>' +
        '<div class="text-[11.5px]" style="color:var(--text-secondary);line-height:1.55">' + esc(owner.why) + '</div>' +
      '</div>' +

      (est != null
        ? '<div class="flex items-baseline gap-3 p-3 rounded-lg" style="background:var(--bg-elev-2)">' +
            '<span class="text-[11.5px]" style="color:var(--text-secondary)">Opening estimate</span>' +
            '<span class="mono text-[17px] font-bold" style="color:var(--text-primary)">' + est + '</span>' +
            '<span class="text-[10.5px]" style="color:var(--text-tertiary)">MWh/yr if the gap closes fully</span>' +
            '<span class="ml-auto text-[10.5px]" style="color:var(--text-tertiary)">unvalidated</span>' +
          '</div>'
        : '') +

    '</div>' +

    '<div class="dm-foot">' +
      '<button class="btn-ghost" data-raise-close>Cancel</button>' +
      '<button class="btn-primary" style="margin-left:auto" data-raise-confirm>Raise and assign</button>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------- confirmed */

function confirmed(subject) {
  var owner = proposeOwner(subject);
  var role = H.ROLES[owner.role];
  var id = 'EC-' + (2052 + (String(subject.ref).length % 7));
  return '<div class="decision-modal" onclick="event.stopPropagation()" style="width:520px">' +
    '<div class="dm-head"><div class="dm-title">Case raised</div>' +
      '<div class="dm-sub">' + esc(subject.where) + '</div></div>' +
    '<div class="dm-body">' +
      '<div class="flex items-baseline gap-3 mb-4">' +
        '<span class="mono text-[20px] font-bold" style="color:var(--accent)">' + esc(id) + '</span>' +
        '<span class="text-[12px]" style="color:var(--text-secondary)">' + esc(subject.title) + '</span></div>' +
      '<div class="text-[12px] mb-4" style="color:var(--text-secondary);line-height:1.65">' +
        'The case is open at Detect and assigned to ' + esc(role.person) + '. The baseline and the figures ' +
        'as measured today are now fixed to it. It will appear in their caseload and in the portfolio ' +
        'pipeline, and cannot reach a decision until attribution has been ruled.</div>' +
      '<div class="ask-box">' +
        '<div class="stat-label mb-1">Next action</div>' +
        '<div class="text-[12px]" style="color:var(--text-primary)">' +
          esc(role.person) + ' accepts or declines the case.</div>' +
        '<div class="text-[11px] mt-1" style="color:var(--text-tertiary)">' +
          'Declining requires a reason, which is recorded against the deviation so the same signal is not ' +
          'raised again without new evidence.</div>' +
      '</div>' +
    '</div>' +
    '<div class="dm-foot">' +
      '<button class="btn-ghost" data-raise-close>Close</button>' +
      '<a class="btn-primary" style="margin-left:auto" href="caseload.html">Go to caseload</a>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------------ mount */

var scrim = null;

function ensure() {
  if (scrim) return scrim;
  scrim = document.createElement('div');
  scrim.className = 'decision-modal-scrim';
  scrim.addEventListener('click', close);
  document.body.appendChild(scrim);
  return scrim;
}

function wire(subject) {
  var closers = scrim.querySelectorAll('[data-raise-close]');
  for (var i = 0; i < closers.length; i++) closers[i].addEventListener('click', close);
  var ok = scrim.querySelector('[data-raise-confirm]');
  if (ok) {
    ok.addEventListener('click', function () {
      scrim.innerHTML = confirmed(subject);
      wire(subject);
    });
  }
}

function open(raw) {
  var subject = normalise(raw);
  if (!subject) return;
  ensure();
  scrim.innerHTML = markup(subject);
  wire(subject);
  scrim.className = 'decision-modal-scrim open';
}

function close() {
  if (scrim) scrim.className = 'decision-modal-scrim';
}

H.raise = { open: open, close: close, proposeOwner: proposeOwner, normalise: normalise };

})(this);
