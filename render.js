/* ===========================================================================
   render.js — shared renderers for every HMAX workspace.

   Four invariant patterns live here and nowhere else, so they cannot drift
   between screens:

     1. provenance  — any system-authored value is badged as a suggestion
     2. gate        — every stage states who holds the pen and what unblocks it
     3. handover    — a join between roles is an event with a named ask
     4. depth       — detail appears by declared level, never by toggle hacks

   Everything reads from window.HMAX (data.js). No screen holds its own data.
   ========================================================================= */
(function (global) {
'use strict';

var H = global.HMAX;
if (!H) { throw new Error('render.js requires data.js to be loaded first'); }

var C = H.compute, Q = H.query;

/* ---------------------------------------------------------------- basics */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
  });
}
function initials(n) {
  return String(n || '').split(' ').map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase();
}
function num(n, d) {
  if (n == null) return '—';
  var v = Number(n);
  return d ? v.toFixed(d) : String(v);
}
function money(v, sym) {
  if (v == null) return '—';
  return (sym || '£') + (v >= 1000 ? Math.round(v / 1000) + 'k' : v);
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

/* deterministic pseudo-random so schematic charts are stable across reloads */
function seeded(seed) {
  var x = 0;
  for (var i = 0; i < String(seed).length; i++) x = (x * 31 + String(seed).charCodeAt(i)) % 100000;
  return function () { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

/* ------------------------------------------------------------ lookups */

function stageOf(c) {
  for (var i = 0; i < H.STAGES.length; i++) if (H.STAGES[i].key === c.stage.key) return H.STAGES[i];
  return H.STAGES[0];
}
function lineOf(id) {
  for (var i = 0; i < H.NETWORK.lines.length; i++) if (H.NETWORK.lines[i].id === id) return H.NETWORK.lines[i];
  return null;
}
function segOf(id) {
  for (var i = 0; i < H.NETWORK.segments.length; i++) if (H.NETWORK.segments[i].id === id) return H.NETWORK.segments[i];
  return null;
}
function whereOf(c) {
  var sc = c.scope, parts = [];
  var line = lineOf(sc.lineId), seg = segOf(sc.segmentId);
  if (line) parts.push(line.name);
  if (seg) parts.push(seg.id + ' ' + seg.name);
  else if (sc.segmentId) parts.push(sc.segmentId);
  if (sc.direction) parts.push(sc.direction === 'Both' ? 'both directions' : sc.direction.toLowerCase());
  if (sc.fleet) parts.push(sc.fleet);
  return parts.join(' · ');
}
function personOf(roleId) {
  var r = H.ROLES[roleId];
  return r ? r.person : 'Unassigned';
}

/* -------------------------------------------------- 1. PROVENANCE pattern */

var SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">' +
  '<path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>';

function smartTag(label) {
  return '<span class="smart-tag">' + SPARK + (label || 'Suggested') + '</span>';
}
function sref(id) {
  var svc = Q.serviceById(id);
  if (!svc) return '';
  return '<span class="service-ref" data-svc="' + esc(id) + '" title="' +
    esc(svc.name + ' \u2014 ' + svc.does) + '">' + SPARK + esc(id) + '</span>';
}

/* The single rule: a Value produced by the system can never be presented as
   though a person authored it, and a human edit never erases the original. */
function provenance(v, opts) {
  if (!v) return '';
  opts = opts || {};
  if (v.kind === 'system') {
    return smartTag(opts.label) + (v.by ? ' ' + sref(v.by) : '');
  }
  var verb = v.edited ? 'Revised by ' : 'Confirmed by ';
  return '<span class="smart-tag subtle">' + verb + esc(v.by || 'a person') + '</span>';
}

function overrideNote(v) {
  if (!v || !v.edited || !v.was) return '';
  return '<div class="override-note">' +
    '<div class="on-label">Replaced the original reading</div>' +
    '<div class="on-was">' + esc(v.was) + '</div></div>';
}

function cannotConclude(title, why, next, service) {
  return '<div class="cannot-conclude">' +
    '<span class="cc-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
    '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></span>' +
    '<div><div class="cc-title">' + esc(title) + '</div>' +
    '<div class="cc-why">' + esc(why) + '</div>' +
    (next ? '<div class="cc-next">' + esc(next) + ' ' + (service ? sref(service) : '') + '</div>' : '') +
    '</div></div>';
}

/* ------------------------------------------------------- 2. GATE pattern */

var GB_ICON = {
  yours:   '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  waiting: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  blocked: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  done:    '<path d="M20 6 9 17l-5-5"/>'
};

function gateVariant(c, viewer) {
  var na = C.nextAction(c);
  if (na.tone === 'blocked') return 'blocked';
  if (na.tone === 'done') return 'done';
  if (na.role && na.role === viewer) return 'yours';
  return 'waiting';
}

function gateBanner(c, viewer, opts) {
  opts = opts || {};
  var na = C.nextAction(c);
  var variant = gateVariant(c, viewer);
  var who = na.role ? H.ROLES[na.role] : null;
  var label = variant === 'yours' ? 'Waiting on you'
            : variant === 'blocked' ? 'Blocked'
            : variant === 'done' ? 'Closed'
            : who ? 'Waiting on ' + who.person : 'Unassigned';

  var st = stageOf(c);
  var detail;
  if (variant === 'done' && c.outcome) {
    detail = c.outcome.reasoning;
  } else if (c.blocked) {
    detail = c.blocked.reason;
  } else if (c.decisionPending && c.decisionPending.asks) {
    detail = c.decisionPending.asks + '.';
  } else {
    detail = 'To clear this stage: ' + st.gate.charAt(0).toLowerCase() + st.gate.slice(1) + '.';
  }

  var actions = '';
  if (variant === 'yours' && opts.actions) actions = '<div class="gb-actions">' + opts.actions + '</div>';

  return '<div class="gate-banner ' + variant + '">' +
    '<div class="gb-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' + GB_ICON[variant] + '</svg></div>' +
    '<div style="min-width:0">' +
      '<div class="gb-label">' + esc(label) + '</div>' +
      '<div class="gb-what">' + esc(na.what) + (opts.showId === false ? '' : ' · ' + esc(c.id)) + '</div>' +
      '<div class="gb-detail">' + esc(detail) + '</div>' +
      (c.blocked && c.blocked.by ? '<div class="mt-1.5">' + sref(c.blocked.by) + '</div>' : '') +
    '</div>' + actions +
  '</div>';
}

/* --------------------------------------------------- 3. HANDOVER pattern */

function handover(fromRole, toRole, ask, when, state) {
  var f = H.ROLES[fromRole], t = H.ROLES[toRole];
  if (!f || !t) return '';
  return '<div class="handover-card ' + (state || '') + '">' +
    '<div class="hc-party"><span class="hc-avatar">' + esc(f.initials || initials(f.person)) + '</span>' +
      '<span><span class="hc-name" style="display:block">' + esc(f.person) + '</span>' +
      '<span class="hc-role" style="display:block">' + esc(f.short) + '</span></span></div>' +
    '<span class="hc-arrow"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>' +
    '<div class="hc-party"><span class="hc-avatar to">' + esc(t.initials || initials(t.person)) + '</span>' +
      '<span><span class="hc-name" style="display:block">' + esc(t.person) + '</span>' +
      '<span class="hc-role" style="display:block">' + esc(t.short) + '</span></span></div>' +
    '<div class="hc-ask">' + esc(ask) + '</div>' +
    (when ? '<div class="hc-when">' + esc(when) + '</div>' : '') +
  '</div>';
}

/* ----------------------------------------------------------- the stepper */

function stepper(c) {
  var idx = C.stageIndex(c);
  var n = H.STAGES.length;
  var pct = n > 1 ? (idx / (n - 1)) * 100 : 0;
  var inset = 100 / (n * 2);

  var nodes = H.STAGES.map(function (s, i) {
    var state = C.stageState(c, s.key);
    var mark = state === 'done' ? '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.2" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>' : (i + 1);
    return '<div class="stepper-node" title="' + esc(s.gate) + '">' +
      '<div class="stepper-dot ' + state + '">' + mark + '</div>' +
      '<div class="stepper-label ' + state + '">' + esc(s.label) + '</div>' +
    '</div>';
  }).join('');

  var na = C.nextAction(c);
  var st = stageOf(c);
  var due = C.daysUntilDue(c);
  var meta = c.outcome ? 'Closed ' + esc(c.closed || '')
           : due == null ? plural(C.daysOpen(c), 'day') + ' open'
           : due < 0 ? Math.abs(due) + ' days overdue'
           : due === 0 ? 'Due today' : 'Due in ' + plural(due, 'day');

  return '<div class="progress-card">' +
    '<div class="progress-card-head">' +
      '<div><div class="progress-eyebrow">Case lifecycle</div>' +
        '<div class="progress-substep">Step ' + (idx + 1) + ' of ' + n + ' · ' + esc(st.label) + '</div></div>' +
      '<div class="progress-substep" style="text-align:right">' + esc(meta) + '</div>' +
    '</div>' +
    '<div class="stepper-track">' +
      '<div class="stepper-line" style="left:' + inset + '%;right:' + inset + '%"></div>' +
      '<div class="stepper-line-fill" style="left:' + inset + '%;width:' + (pct * (100 - inset * 2) / 100) + '%"></div>' +
      nodes +
    '</div>' +
    '<div class="stepper-divider"></div>' +
    '<div class="stepper-next">' +
      '<div class="stepper-next-icon"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>' +
      '<div class="stepper-next-text"><b>' + esc(na.what) + '</b>' +
        (na.role ? ' — ' + esc(personOf(na.role)) + ', ' + esc(H.ROLES[na.role].short) : '') +
        '<div style="color:var(--text-tertiary);font-size:11.5px;margin-top:2px">' + esc(st.gate) + '</div></div>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------ queue rows */

function queueGroup(title, n, note) {
  return '<div class="queue-group"><span class="queue-group-title">' + esc(title) + '</span>' +
    '<span class="queue-group-count">' + n + '</span>' +
    (note ? '<span class="text-[11px]" style="color:var(--text-tertiary)">' + esc(note) + '</span>' : '') +
    '<span class="queue-group-rule"></span></div>';
}

function queueRow(c, viewer) {
  var na = C.nextAction(c);
  var variant = gateVariant(c, viewer);
  var cls = c.outcome ? 'is-closed' : variant === 'blocked' ? 'is-blocked' : variant === 'yours' ? 'is-yours' : '';
  var conf = c.confidenceDetail ? c.confidenceDetail.tier : null;

  return '<div class="queue-row ' + cls + '" onclick="location.href=\'case.html?id=' + esc(c.id) + '\'">' +
    '<div style="min-width:0">' +
      '<div class="qr-id">' + esc(c.id) +
        (conf ? ' · <span style="color:var(--text-tertiary)">' + esc(conf) + ' confidence</span>' : '') + '</div>' +
      '<div class="qr-title">' + esc(c.title) + '</div>' +
      '<div class="qr-where">' + esc(whereOf(c)) + '</div>' +
    '</div>' +
    '<div>' +
      '<span class="stage-pill" style="background:var(--bg-elev-3);color:var(--text-secondary)">' + esc(C.stageLabel(c)) + '</span>' +
      (c.outcome ? '' :
        '<div class="text-[10.5px] mt-1.5" style="color:var(--text-tertiary)">' +
        C.readinessMet(c) + ' of ' + C.readinessTotal(c) + ' checks met</div>') +
    '</div>' +
    '<div class="queue-need ' + na.tone + '">' +
      '<span class="qn-what">' + esc(na.what) + '</span>' +
      '<span class="qn-who">' + esc(na.role ? personOf(na.role) : 'Unassigned') + '</span>' +
    '</div>' +
    '<div>' +
      '<div class="qr-impact">' + (c.metrics && c.metrics.annualMWh != null ? c.metrics.annualMWh : '—') + '</div>' +
      '<div class="qr-impact-unit" style="text-align:right">MWh/yr</div>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------- readiness */

function readinessList(c) {
  return c.readiness.map(function (r) {
    var met = r.state === 'met';
    var isSystem = /^S\d+$/.test(r.by || '');
    return '<div class="readiness-row">' +
      '<div class="flex items-start gap-2.5" style="min-width:0">' +
        '<span class="readiness-dot ' + (met ? '' : 'open') + '" style="margin-top:6px"></span>' +
        '<div><div class="text-[12.5px]" style="color:' + (met ? 'var(--text-primary)' : 'var(--text-secondary)') + '">' + esc(r.q) + '</div>' +
        (r.by ? '<div class="text-[10.5px] mt-0.5" style="color:var(--text-tertiary)">' +
          (isSystem ? 'Assessed by ' : 'Confirmed by ') + esc(r.by) + (r.at ? ' · ' + esc(r.at) : '') + '</div>' : '') +
        '</div></div>' +
      '<div class="flex items-center gap-2">' + (isSystem ? sref(r.by) : '') +
        '<span class="text-[10.5px] font-bold uppercase tracking-[.05em]" style="color:' + (met ? 'var(--green)' : 'var(--text-tertiary)') + '">' +
        (met ? 'Met' : 'Open') + '</span></div>' +
    '</div>';
  }).join('');
}

function readinessMeter(c) {
  var met = C.readinessMet(c), tot = C.readinessTotal(c);
  var pct = tot ? (met / tot) * 100 : 0;
  return '<div class="flex items-center gap-3">' +
    '<div class="readiness-progress-track" style="flex:1">' +
      '<div class="readiness-progress-fill" style="width:' + pct + '%;' + (met === tot ? 'background:var(--green)' : '') + '"></div>' +
    '</div>' +
    '<span class="mono text-[11.5px] font-bold" style="color:' + (met === tot ? 'var(--green)' : 'var(--amber)') + '">' +
    met + '/' + tot + '</span></div>';
}

/* ------------------------------------------------------ evidence reading */

function readingBlock(b, opts) {
  opts = opts || {};
  var r = b.reading;
  return '<div class="reading' + (r.edited ? ' edited' : '') + '">' +
    '<div class="rd-body">' +
      '<div class="rd-head">' + provenance(r) + '</div>' +
      '<div class="rd-text">' + esc(r.v) + '</div>' +
      overrideNote(r) +
      (opts.method ? '<div class="text-[10.5px] mt-2" data-depth-min="L3" style="color:var(--text-tertiary)">Method: ' +
        esc(b.method) + ' · n=' + b.n + '</div>' : '') +
    '</div></div>';
}

/* --------------------------------------------------- comparability matrix */

function comparability(bl) {
  var h = '<div class="comparability-matrix">' +
    '<div class="cm-head">Comparability factor</div>' +
    '<div class="cm-head" style="text-align:right">Match</div>' +
    '<div class="cm-head">Basis</div>';
  bl.comparability.factors.forEach(function (f) {
    h += '<div class="cm-cell factor"><span class="cm-match ' + esc(f.state) + '"></span>' + esc(f.factor) + '</div>' +
      '<div class="cm-cell" style="justify-content:flex-end"><span class="cm-state ' + esc(f.state) + '">' + esc(f.state) + '</span></div>' +
      '<div class="cm-cell">' + esc(f.note) + '</div>';
  });
  return h + '</div>';
}

function baselineAlternatives(bl) {
  return '<div data-depth-min="L3">' +
    '<div class="text-[10.5px] font-bold tracking-[.05em] uppercase mb-2" style="color:var(--text-tertiary)">Alternatives considered and rejected ' + sref('S2') + '</div>' +
    bl.alternatives.map(function (a) {
      return '<div class="text-[11.5px] mb-1.5" style="color:var(--text-secondary)">' +
        '<span class="mono" style="color:var(--text-tertiary)">' + esc(a.id) + '</span> ' + esc(a.label) +
        ' — <span style="color:var(--text-tertiary)">' + esc(a.rejected) + '</span></div>';
    }).join('') + '</div>';
}

/* ----------------------------------------------------------- budget meter */

function budgetMeter(c) {
  var m = c.metrics, lever = c.levers && c.levers[0];
  if (!lever || m.timeBudget == null) return '';
  var cur = H.CURRENCIES[lever.currency];
  var spentPct = (m.timeCost / m.timeBudget) * 100;
  var maxPct = ((m.timeBudget - m.timeFloor) / m.timeBudget) * 100;
  var over = m.timeCost > (m.timeBudget - m.timeFloor);

  return '<div class="flex items-baseline justify-between mb-2.5">' +
      '<div class="text-[12.5px]" style="color:var(--text-secondary)">' + esc(cur.label) +
        ' budget — held by ' + esc(personOf(C.approverRole(c))) +
        ' <span class="currency-chip ml-1.5">' + esc(lever.currency) + '</span></div>' +
      '<div class="mono text-[12px]" style="color:var(--text-secondary)">+' + m.timeCost + 's of ' + m.timeBudget + 's</div>' +
    '</div>' +
    '<div class="budget-meter' + (over ? ' over' : '') + '">' +
      '<div class="bm-proposed" style="width:' + spentPct + '%"></div>' +
      '<div class="bm-floor" style="left:' + maxPct + '%"></div>' +
    '</div>' +
    '<div class="budget-legend">' +
      '<span class="bl-key"><span class="bl-swatch" style="background:var(--amber)"></span>This decision · +' + m.timeCost + 's</span>' +
      '<span class="bl-key"><span class="bl-swatch" style="background:var(--red)"></span>Recovery floor · ' + m.timeFloor + 's must remain</span>' +
      '<span class="bl-key" style="margin-left:auto;color:var(--text-secondary)">' + m.timeRetained + 's retained if approved</span>' +
    '</div>';
}

/* -------------------------------------------------------- scenario cards */

function scenarioCards(c, selectedId) {
  if (!c.scenarios || !c.scenarios.length) return '';
  var sel = selectedId || (c.scenarioSelected && c.scenarioSelected.v) || (c.scenarioRecommended && c.scenarioRecommended.v);
  return '<div class="grid grid-cols-3 gap-3">' + c.scenarios.map(function (s) {
    var isRec = s.recommended;
    var isSel = s.id === sel;
    var gainPct = Math.min(100, Math.abs(s.energyPct) / 8 * 100);
    var payPct = Math.min(100, (s.timeCost / 30) * 100);
    return '<div class="bundle-card' + (isSel ? ' recommended' : '') + '" style="position:relative;cursor:pointer" data-scenario="' + esc(s.id) + '">' +
      (isRec ? '<span class="suggested-flag">Suggested</span>' : '') +
      '<div class="flex items-baseline justify-between">' +
        '<span class="mono text-[10.5px]" style="color:var(--text-tertiary)">' + esc(s.id) + '</span>' +
        '<span class="text-[10px] font-bold uppercase tracking-[.04em]" style="color:var(--text-tertiary)">' + esc(s.confidence) + '</span></div>' +
      '<div class="text-[13.5px] font-semibold mt-1">' + esc(s.label) + '</div>' +
      '<div class="mt-3 flex items-baseline gap-1.5">' +
        '<span class="mono text-[20px] font-bold">' + s.annualMWh + '</span>' +
        '<span class="text-[11px]" style="color:var(--text-tertiary)">MWh/yr</span></div>' +
      '<div class="text-[11.5px] mt-0.5" style="color:var(--text-secondary)">' + s.energyPct + '% intensity · ' + money(s.value) + '/yr</div>' +
      '<div class="gainpay-track mt-3">' +
        '<div class="gainpay-gain" style="width:' + gainPct + '%"></div>' +
        '<div class="gainpay-pay" style="width:' + payPct + '%"></div></div>' +
      '<div class="flex justify-between text-[10.5px] mt-1.5" style="color:var(--text-tertiary)">' +
        '<span>+' + s.timeCost + 's runtime</span><span>' + s.retained + 's retained</span></div>' +
      (String(s.draws).indexOf(',') > -1
        ? '<div class="text-[10.5px] mt-2" style="color:var(--amber)">Also draws capacity</div>' : '') +
    '</div>';
  }).join('') + '</div>';
}

/* --------------------------------------------------------- verification */

function realisationBar(c) {
  var o = c.outcome;
  if (!o) return '';
  var pct = o.realisation;
  var cls = pct >= 85 ? '' : pct >= 50 ? ' short' : ' none';
  return '<div class="realisation-bar">' +
    '<div class="rb-modelled"></div>' +
    '<div class="rb-verified' + cls + '" style="width:' + Math.min(pct, 100) + '%"></div>' +
    '<div class="rb-value">' + o.verified + ' ' + esc(o.unit) + ' verified' +
      '<span class="rb-pct">of ' + o.modelled + ' modelled · ' + pct + '%</span></div>' +
  '</div>';
}

function confounderRows(c) {
  if (!c.plan || !c.plan.confounders) return '';
  var observed = {};
  if (c.outcome && c.outcome.confoundersObserved) {
    c.outcome.confoundersObserved.forEach(function (x) { observed[x.what] = x; });
  }
  return c.plan.confounders.map(function (name) {
    var hit = null;
    for (var k in observed) { if (k.indexOf(name) > -1 || name.indexOf(k.split(',')[0]) > -1) hit = observed[k]; }
    var state = !c.outcome ? 'untested' : hit ? 'present' : 'cleared';
    var test = !c.outcome
      ? 'Will be watched across the ' + esc(c.plan.window) + ' window.'
      : hit ? esc(hit.what) + ' — assessed ' + esc(hit.assessed) + (hit.by ? ' by ' + esc(hit.by) : '')
            : 'No qualifying event within the ' + esc(c.plan.window) + ' window.';
    return '<div class="confounder-row">' +
      '<div><div class="cf-name">' + esc(name) + '</div><div class="cf-test">' + test + '</div></div>' +
      '<div class="cf-status ' + state + '">' + state + '</div></div>';
  }).join('');
}

function planCard(c) {
  var p = c.plan;
  if (!p) return '';
  var locked = !!p.lockedAt;
  return '<div class="plan-lock p-4">' +
    '<div class="flex items-center justify-between mb-3">' +
      '<div class="flex items-center gap-2">' +
        '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:' + (locked ? 'var(--green)' : 'var(--text-tertiary)') + '">' +
        (locked ? '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
                : '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>') + '</svg>' +
        '<span class="text-[12.5px] font-semibold">Measurement plan</span></div>' +
      '<span class="text-[10.5px] font-bold uppercase tracking-[.05em]" style="color:' + (locked ? 'var(--green)' : 'var(--text-tertiary)') + '">' +
        (locked ? 'Locked ' + esc(String(p.lockedAt).slice(0, 10)) : 'Draft') + '</span>' +
    '</div>' +
    '<div class="grid grid-cols-3 gap-3 text-[11.5px]">' +
      '<div><div style="color:var(--text-tertiary)">Basis</div><div class="mt-0.5">' + esc(p.basis) + '</div></div>' +
      '<div><div style="color:var(--text-tertiary)">Window</div><div class="mt-0.5">' + esc(p.window) + '</div></div>' +
      '<div><div style="color:var(--text-tertiary)">Threshold</div><div class="mt-0.5">' + esc(p.threshold) + '</div></div>' +
    '</div>' +
    (p.draftedBy ? '<div class="mt-3 pt-3" style="border-top:1px solid var(--border-soft)">' + provenance(p.draftedBy, { label: 'Drafted' }) + '</div>' : '') +
  '</div>';
}

/* --------------------------------------------------------------- trust */

function coverageGrid() {
  var h = '<div class="coverage-grid">' +
    '<div class="cg-head">Canonical record</div>' +
    '<div class="cg-head" style="text-align:right">Coverage</div>' +
    '<div class="cg-head">If absent</div>';
  H.SOURCES.forEach(function (s) {
    var lvl = s.coverage >= 90 ? '' : s.coverage >= 70 ? ' low' : ' critical';
    h += '<div class="cg-cell src">' + esc(s.record) +
        '<div class="text-[10.5px] mt-0.5" style="color:var(--text-tertiary)">' + esc(s.source) +
        (s.mandatory ? ' · required' : '') + '</div></div>' +
      '<div class="cg-cell pct">' + s.coverage + '%<div class="cg-meter' + lvl + '"><i style="width:' + s.coverage + '%"></i></div></div>' +
      '<div class="cg-cell">' + esc(s.degrades) + '</div>';
  });
  return h + '</div>';
}

function envelopeBand(c, bl) {
  var tol = parseFloat(String(bl.band).replace(/[^0-9.]/g, '')) || 2;
  var lo = 100 - tol * 4, hi = 100 + tol * 10;
  function pos(v) { return Math.max(2, Math.min(98, ((v - lo) / (hi - lo)) * 100)); }
  var obs = (c.metrics.observed / c.metrics.baseline) * 100;
  return '<div class="envelope-band">' +
    '<div class="eb-axis"></div>' +
    '<div class="eb-band" style="left:' + pos(100 - tol) + '%;width:' + (pos(100 + tol) - pos(100 - tol)) + '%"></div>' +
    '<div class="eb-point" style="left:' + pos(100) + '%"></div>' +
    '<div class="eb-observed" style="left:' + pos(obs) + '%"></div>' +
    '<div class="eb-tick" style="left:' + pos(100) + '%">baseline 100 ' + esc(bl.band) + '</div>' +
    '<div class="eb-tick" style="left:' + pos(obs) + '%">observed ' + obs.toFixed(0) + '</div>' +
  '</div>';
}

function precedentCard(c) {
  var all = Q.precedentFor(c);
  var matches = all.filter(function (p) { return p.realisation != null; });
  if (!all.length) {
    return cannotConclude('No comparable precedent',
      'No closed case shares this lever type, so realisation cannot be anticipated from history.',
      'Treat the modelled figure as unvalidated.', 'S7');
  }
  if (!matches.length) {
    return cannotConclude('Precedent exists but is not yet measured',
      all.length + ' comparable case' + (all.length > 1 ? 's are' : ' is') + ' still inside its measurement window.',
      'Realisation cannot be anticipated until at least one closes.', 'S7');
  }
  var avg = Math.round(matches.reduce(function (a, p) { return a + p.realisation; }, 0) / matches.length);
  return '<div class="precedent-card p-4">' +
    '<div class="flex items-center gap-2 mb-2.5">' + smartTag('Precedent') + sref('S7') +
      '<span class="ml-auto mono text-[12px] font-bold" style="color:var(--accent)">' + avg + '% average realisation</span></div>' +
    all.map(function (p) {
      var m = p.realisation != null;
      return '<div class="flex items-center gap-3 py-1.5 text-[11.5px]">' +
        '<span class="mono" style="color:var(--text-tertiary)">' + esc(p.caseId) + '</span>' +
        '<span style="color:var(--text-secondary)">' + esc(p.lever) + '</span>' +
        '<span class="ml-auto mono" style="color:var(--text-secondary)">' +
          (m ? p.modelled + ' → ' + p.verified + ' MWh' : p.modelled + ' MWh · in window') + '</span>' +
        '<span class="mono font-bold" style="width:38px;text-align:right;color:' +
          (!m ? 'var(--text-tertiary)' : p.realisation >= 85 ? 'var(--green)' : 'var(--amber)') + '">' +
          (m ? p.realisation + '%' : '—') + '</span>' +
      '</div>';
    }).join('') +
  '</div>';
}

/* ---------------------------------------------------------------- trail */

function trail(c) {
  return '<div>' + c.trail.map(function (t, i) {
    var isSys = t.kind === 'system';
    return '<div class="flex gap-3">' +
      '<div class="flex flex-col items-center">' +
        '<div class="trail-icon ' + (isSys ? 'auto' : 'human') + '">' + (isSys ? '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>' : esc(initials(t.actor))) + '</div>' +
        (i < c.trail.length - 1 ? '<div class="timeline-line" style="min-height:18px"></div>' : '') +
      '</div>' +
      '<div class="pb-4" style="min-width:0">' +
        '<div class="flex items-center gap-2 flex-wrap">' +
          '<span class="text-[12px] font-semibold">' + esc(isSys ? (Q.serviceById(t.actor) ? Q.serviceById(t.actor).name : t.actor) : t.actor) + '</span>' +
          (isSys ? sref(t.actor) : '') +
          '<span class="mono text-[10.5px]" style="color:var(--text-tertiary)">' + esc(String(t.at).replace('T', ' ')) + '</span></div>' +
        '<div class="text-[11.5px] mt-1" style="color:var(--text-secondary);line-height:1.55">' + esc(t.text) + '</div>' +
      '</div></div>';
  }).join('') + '</div>';
}

/* ------------------------------------------------------- schematic charts
   Structural, not literal. They show shape and relationship so a reviewer can
   read the argument; the real product renders measured series here.
   --------------------------------------------------------------------- */

function chart(kind, seed, opts) {
  opts = opts || {};
  var rnd = seeded(seed || kind);
  var W = 100, Hh = 100, svg = '';

  function path(pts, cls) {
    return '<polyline points="' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" ' + cls + '/>';
  }

  if (kind === 'trend') {
    var base = [], obs = [];
    for (var i = 0; i <= 11; i++) {
      var x = (i / 11) * W;
      base.push([x, 68 + rnd() * 3]);
      obs.push([x, 30 + rnd() * 8]);
    }
    svg += '<rect x="0" y="26" width="100" height="18" fill="rgba(240,100,95,.07)"/>';
    svg += path(base, 'stroke="var(--text-tertiary)" stroke-width="1.2" stroke-dasharray="3 2"');
    svg += path(obs, 'stroke="var(--amber)" stroke-width="1.8"');
  } else if (kind === 'distance-profile') {
    var bars = 14;
    for (var b = 0; b < bars; b++) {
      var hgt = b > 4 && b < 10 ? 40 + rnd() * 34 : 12 + rnd() * 16;
      svg += '<rect x="' + (b * (W / bars) + 1) + '" y="' + (100 - hgt) + '" width="' + (W / bars - 2) + '" height="' + hgt +
        '" fill="' + (b > 4 && b < 10 ? 'var(--amber)' : 'var(--border)') + '" rx="1"/>';
    }
  } else if (kind === 'unit-distribution') {
    var units = 14;
    for (var u = 0; u < units; u++) {
      var high = u < 11;
      var hh = high ? 44 + rnd() * 30 : 14 + rnd() * 10;
      svg += '<rect x="' + (u * (W / units) + 1) + '" y="' + (100 - hh) + '" width="' + (W / units - 2) + '" height="' + hh +
        '" fill="' + (high ? 'var(--amber)' : 'var(--accent)') + '" rx="1"/>';
    }
  } else if (kind === 'speed-envelope') {
    var hi = [], lo = [], mid = [];
    for (var k = 0; k <= 12; k++) {
      var xx = (k / 12) * W;
      var centre = 50 - Math.sin((k / 12) * Math.PI) * 28;
      var spread = 8 + rnd() * 10;
      hi.push([xx, centre - spread]); lo.push([xx, centre + spread]); mid.push([xx, centre]);
    }
    svg += '<polygon points="' + hi.concat(lo.slice().reverse()).map(function (p) { return p[0] + ',' + p[1]; }).join(' ') +
      '" fill="rgba(122,167,255,.14)"/>';
    svg += path(mid, 'stroke="var(--blue)" stroke-width="1.6"');
  } else if (kind === 'condition-matrix') {
    var cols = 8, rows = 4;
    for (var r2 = 0; r2 < rows; r2++) {
      for (var c2 = 0; c2 < cols; c2++) {
        var v = rnd();
        var col = v > 0.72 ? 'var(--amber)' : v > 0.45 ? 'rgba(245,185,92,.35)' : 'var(--bg-elev-3)';
        svg += '<rect x="' + (c2 * (W / cols) + 1) + '" y="' + (r2 * (Hh / rows) + 1) + '" width="' + (W / cols - 2) +
          '" height="' + (Hh / rows - 2) + '" fill="' + col + '" rx="1.5"/>';
      }
    }
  } else if (kind === 'counterfactual') {
    var a = [], cf = [];
    for (var t2 = 0; t2 <= 11; t2++) {
      var x2 = (t2 / 11) * W;
      a.push([x2, 32 + rnd() * 6]);
      cf.push([x2, 58 + rnd() * 5]);
    }
    svg += path(a, 'stroke="var(--amber)" stroke-width="1.7"');
    svg += path(cf, 'stroke="var(--accent)" stroke-width="1.7" stroke-dasharray="3 2"');
    svg += '<rect x="0" y="34" width="100" height="26" fill="rgba(94,234,212,.07)"/>';
  } else if (kind === 'pipeline') {
    var stages = opts.data || [];
    var max = Math.max.apply(null, stages.map(function (s) { return s.count; }).concat([1]));
    stages.forEach(function (s, i) {
      var hh2 = (s.count / max) * 74;
      svg += '<rect x="' + (i * (W / stages.length) + 2) + '" y="' + (86 - hh2) + '" width="' + (W / stages.length - 4) +
        '" height="' + Math.max(hh2, 1.5) + '" fill="var(--accent)" opacity="' + (0.35 + 0.65 * (s.count / max)) + '" rx="1"/>';
    });
  }

  return '<div class="chart-frame" style="' + (opts.height ? 'height:' + opts.height + 'px' : '') + '">' +
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + svg + '</svg></div>';
}

/* --------------------------------------------------------------- KPI card */

function kpi(label, value, unit, sub, tone) {
  return '<div class="kpi-card rounded-xl p-4">' +
    '<div class="text-[10.5px] font-bold tracking-[.06em] uppercase" style="color:var(--text-tertiary)">' + esc(label) + '</div>' +
    '<div class="flex items-baseline gap-1.5 mt-2">' +
      '<span class="mono text-[24px] font-bold"' + (tone ? ' style="color:var(--' + tone + ')"' : '') + '>' + esc(value) + '</span>' +
      (unit ? '<span class="text-[11px]" style="color:var(--text-tertiary)">' + esc(unit) + '</span>' : '') +
    '</div>' +
    (sub ? '<div class="text-[11.5px] mt-1.5" style="color:var(--text-secondary);line-height:1.5">' + sub + '</div>' : '') +
  '</div>';
}

/* --------------------------------------------------------------- export */

global.HMAX.render = {
  esc: esc, initials: initials, num: num, money: money, plural: plural,
  stageOf: stageOf, whereOf: whereOf, lineOf: lineOf, segOf: segOf, personOf: personOf,
  smartTag: smartTag, sref: sref, provenance: provenance, overrideNote: overrideNote,
  cannotConclude: cannotConclude,
  gateBanner: gateBanner, gateVariant: gateVariant, handover: handover,
  stepper: stepper, queueRow: queueRow, queueGroup: queueGroup,
  readinessList: readinessList, readinessMeter: readinessMeter,
  readingBlock: readingBlock, comparability: comparability, baselineAlternatives: baselineAlternatives,
  budgetMeter: budgetMeter, scenarioCards: scenarioCards,
  realisationBar: realisationBar, confounderRows: confounderRows, planCard: planCard,
  coverageGrid: coverageGrid, envelopeBand: envelopeBand, precedentCard: precedentCard,
  trail: trail, chart: chart, kpi: kpi
};

})(typeof window !== 'undefined' ? window : globalThis);
