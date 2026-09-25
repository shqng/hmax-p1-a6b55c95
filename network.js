/* ===========================================================================
   HMAX — network.js
   The measurement layer: what the platform monitors.

   data.js holds the orchestration layer (cases, decisions, services).
   This file holds the energy record itself — the network, its interstations,
   its fleet, its individual runs and their traces.

   Values are deterministic. A seeded generator fills the long tail so the
   tables have realistic spread, while every figure the case spine depends on
   is pinned by hand so the two layers never contradict each other.
   ========================================================================= */

(function (global) {
'use strict';

var H = global.HMAX;

/* --------------------------------------------------------------- seeding */

function seed(s) {
  var h = 1779033703 ^ String(s).length;
  for (var i = 0; i < String(s).length; i++) {
    h = Math.imul(h ^ String(s).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
if (!Math.imul) {
  Math.imul = function (a, b) {
    var ah = (a >>> 16) & 0xffff, al = a & 0xffff;
    var bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
  };
}
function r2(n) { return Math.round(n * 100) / 100; }
function r1(n) { return Math.round(n * 10) / 10; }
function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }

/* ------------------------------------------------------------- 1. PERIODS
   Every analytical surface is bound to a period. Changing it is the single
   most consequential control on the page, so it lives in the page header
   rather than inside a filter tray.
   ----------------------------------------------------------------------- */

var PERIODS = [
  { id: 'p28',  label: 'Last 28 days',  short: '28d', from: '2026-08-27', to: '2026-09-23', weeks: 4,  runs: 38400 },
  { id: 'p12w', label: 'Last 12 weeks', short: '12w', from: '2026-07-02', to: '2026-09-23', weeks: 12, runs: 114800 },
  { id: 'p6m',  label: 'Last 6 months', short: '6m',  from: '2026-03-24', to: '2026-09-23', weeks: 26, runs: 248200 }
];

var WEEK_LABELS = ['W27','W28','W29','W30','W31','W32','W33','W34','W35','W36','W37','W38'];

/* -------------------------------------------------------------- 2. LINES
   Extends NETWORK.lines from data.js with the measured record. The ids and
   headline intensities match data.js exactly.
   ----------------------------------------------------------------------- */

var LINE_STATIONS = {
  L3: ['Harbour Point','Dockside','Mill Lane','St Anne\u2019s','Central Exchange','Cathedral Square',
       'Victoria Park','Brunel Street','Southgate','Fairview','Northgate','Riverside','Kingsway',
       'Eastfield','Ashcroft','Whitfield','Grange Road','Meadowbank','Elmwood','Highbridge','Lakeside'],
  L1: ['Westport','Carlton','Abbey Wood','Tanners Hill','Old Market','Central Exchange','Guildhall',
       'Parkway','Bellevue','Hollow Lane','Stanmore','Clifton Vale','Redhill','Sandford','Aldergate',
       'Weirside','Foxton','Marsh End','Northport'],
  L2: ['Seaforth','Bayview','Trinity','Lower Quay','Cathedral Square','Exchange North','Regent Street',
       'Alder Park','Crossway','Broadfield','Lilywhite','Kingsmead','Havenbrook','Oakhurst','Priory',
       'Talbot Road','Dunmore','Chester Fields','Netherby','Amberley','Glasson','Winterbourne','Eastport'],
  L4: ['Airport Central','Terminal North','Deanfield','Ravensbourne','Larkhall','Old Market',
       'Copperfield','Wheatley','Sunnyside','Ferngrove','Bishopgate','Cranleigh','Selby','Carrington']
};

/* Measured line record. deltaPct is derived, never stored. */
var LINES = [
  { id: 'L3', kwhPerKm: 3.04, baseline: 2.81, baselineId: 'BL-07', mwh: 4180, regenPct: 31.4,
    runs: 11240, km: 28.9, stations: 21, fleets: ['B-series'], punctuality: 94.1, dwellMean: 34, openCases: 3,
    trendSeed: 'L3-trend', drift: 'rising' },
  { id: 'L2', kwhPerKm: 2.88, baseline: 2.79, baselineId: 'BL-05', mwh: 5310, regenPct: 33.8,
    runs: 12960, km: 31.2, stations: 23, fleets: ['A-series','B-series'], punctuality: 95.7, dwellMean: 31, openCases: 1,
    trendSeed: 'L2-trend', drift: 'flat' },
  { id: 'L1', kwhPerKm: 2.71, baseline: 2.62, baselineId: 'BL-03', mwh: 3640, regenPct: 32.9,
    runs: 10880, km: 24.6, stations: 19, fleets: ['A-series'], punctuality: 96.2, dwellMean: 29, openCases: 1,
    trendSeed: 'L1-trend', drift: 'rising' },
  { id: 'L4', kwhPerKm: 2.42, baseline: 2.44, baselineId: 'BL-09', mwh: 1980, regenPct: 18.2,
    runs: 8420,  km: 18.4, stations: 14, fleets: ['C-series'], punctuality: 97.0, dwellMean: 27, openCases: 1,
    trendSeed: 'L4-trend', drift: 'flat' }
];

/* 12-week intensity series per line, plus the network roll-up. */
function buildTrend(key, end, base, drift) {
  var rnd = seed(key), out = [], i;
  for (i = 0; i < 12; i++) {
    var t = i / 11;
    var slope = drift === 'rising' ? -0.09 * (1 - t) : drift === 'falling' ? 0.07 * (1 - t) : 0;
    out.push({
      week: WEEK_LABELS[i],
      value: r2(end + slope + (rnd() - 0.5) * 0.055),
      baseline: r2(base + (rnd() - 0.5) * 0.012)
    });
  }
  out[11].value = end;
  out[11].baseline = base;
  return out;
}

for (var li = 0; li < LINES.length; li++) {
  LINES[li].trend = buildTrend(LINES[li].trendSeed, LINES[li].kwhPerKm, LINES[li].baseline, LINES[li].drift);
}

var NETWORK_TOTAL = {
  kwhPerKm: 2.79, baseline: 2.68, mwh: 15110, mwhRecovered: 4568, regenPct: 30.2,
  km: 5416000, runs: 43500, unitsInService: 74, unitsTotal: 81,
  costPerMwh: 149, currency: '\u00a3',
  trend: (function () {
    var out = [], i;
    for (i = 0; i < 12; i++) {
      var v = 0, b = 0, w = 0;
      for (var j = 0; j < LINES.length; j++) {
        v += LINES[j].trend[i].value * LINES[j].mwh;
        b += LINES[j].trend[i].baseline * LINES[j].mwh;
        w += LINES[j].mwh;
      }
      out.push({ week: WEEK_LABELS[i], value: r2(v / w), baseline: r2(b / w) });
    }
    return out;
  })()
};

/* Where the energy goes. Sums to the network total. */
var ENERGY_SPLIT = [
  { id: 'traction',  label: 'Traction',            mwh: 12890, tone: 'accent',  note: 'Motoring energy at the pantograph' },
  { id: 'auxiliary', label: 'Auxiliary and HVAC',  mwh: 4380,  tone: 'blue',    note: 'Comfort, lighting, compressors' },
  { id: 'losses',    label: 'Distribution losses', mwh: 2408,  tone: 'tertiary',note: 'Substation to pantograph' },
  { id: 'recovered', label: 'Regenerated',         mwh: -4568, tone: 'green',   note: 'Returned to the line and accepted' }
];

/* Time-of-day intensity. Peaks are structurally more expensive per km. */
var HOURLY = (function () {
  var rnd = seed('hourly'), out = [], h;
  for (h = 5; h <= 23; h++) {
    var peak = (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
    var shoulder = h === 6 || h === 10 || h === 16 || h === 20;
    var base = peak ? 3.11 : shoulder ? 2.86 : h >= 22 ? 2.52 : 2.68;
    out.push({
      hour: h,
      label: (h < 10 ? '0' : '') + h + ':00',
      kwhPerKm: r2(base + (rnd() - 0.5) * 0.09),
      baseline: r2(base - 0.11 + (rnd() - 0.5) * 0.03),
      runs: Math.round((peak ? 3800 : shoulder ? 2600 : h >= 22 ? 900 : 1900) + rnd() * 240),
      band: peak ? 'Peak' : shoulder ? 'Shoulder' : h >= 22 ? 'Late' : 'Off-peak'
    });
  }
  return out;
})();

/* --------------------------------------------------------- 3. FLEET UNITS
   The rolling stock record. Index is the unit's intensity relative to its
   own fleet baseline, so fleets with different duty cycles stay comparable.
   ----------------------------------------------------------------------- */

var FLEET_SPEC = {
  'A-series': { units: 34, prefix: 'A', line: 'L1', altLine: 'L2', propulsion: 'IGBT', regen: true,  inService: 2016, baseKwhKm: 2.66, baseRegen: 33.0 },
  'B-series': { units: 28, prefix: 'B', line: 'L3', altLine: 'L2', propulsion: 'SiC',  regen: true,  inService: 2020, baseKwhKm: 2.81, baseRegen: 32.2 },
  'C-series': { units: 19, prefix: 'C', line: 'L4', altLine: null, propulsion: 'IGBT', regen: false, inService: 2011, baseKwhKm: 2.44, baseRegen: 18.6 }
};

/* Units whose behaviour the case spine refers to. Pinned, not generated. */
var PINNED_UNITS = {
  'B-214': { index: 118, regenPct: 24.1, brakeRate: 0.94, state: 'watch',
             note: 'Intensity gap widened over 6 weeks; regenerative recovery 8 points below fleet', caseId: 'EC-2051' },
  'B-227': { index: 114, regenPct: 25.8, brakeRate: 0.91, state: 'watch',
             note: 'Same divergence pattern as B-214, onset 2 weeks later', caseId: 'EC-2051' },
  'C-206': { index: 109, regenPct: 11.2, brakeRate: 1.02, state: 'watch',
             note: 'Recovery shortfall consistent with receptivity, not unit condition', caseId: 'EC-2044' },
  'B-203': { index: 93,  regenPct: 35.6, brakeRate: 0.88, state: 'good',
             note: 'Best-performing B-series unit; used as the within-fleet reference' }
};

var UNITS = (function () {
  var out = [], f, spec, rnd, i, id, u;
  for (f in FLEET_SPEC) {
    if (!FLEET_SPEC.hasOwnProperty(f)) continue;
    spec = FLEET_SPEC[f];
    rnd = seed('unit-' + f);
    for (i = 1; i <= spec.units; i++) {
      id = spec.prefix + '-' + (200 + i);
      /* Index is relative to the fleet's own baseline, so the generated
         population must centre on 100 — otherwise the fleet reads as
         below its own baseline and "100 is fleet-typical" becomes false. */
      var idx = Math.round(100 + (rnd() - 0.5) * 15);
      u = {
        id: id, fleet: f, line: rnd() > 0.82 && spec.altLine ? spec.altLine : spec.line,
        propulsion: spec.propulsion, regenCapable: spec.regen, inService: spec.inService,
        index: idx,
        regenPct: r1(spec.baseRegen + (rnd() - 0.5) * 3.4),
        brakeRate: r2(0.86 + rnd() * 0.12),
        runsPeriod: Math.round(310 + rnd() * 180),
        kmPeriod: Math.round(4200 + rnd() * 2100),
        state: 'normal', note: null, caseId: null,
        availability: r1(95 + rnd() * 4.6),
        lastSeen: '2026-09-' + (18 + Math.floor(rnd() * 6))
      };
      if (PINNED_UNITS[id]) {
        var p = PINNED_UNITS[id];
        p._applied = true;
        u.index = p.index; u.regenPct = p.regenPct; u.brakeRate = p.brakeRate;
        u.state = p.state; u.note = p.note; u.caseId = p.caseId || null;
      }
      u.kwhPerKm = r2(spec.baseKwhKm * u.index / 100);
      u.baseline = spec.baseKwhKm;
      out.push(u);
    }
  }
  /* A pin that matches no generated id would be dropped in silence and the
     case layer would then reference a unit that does not exist. */
  var orphan = [];
  for (var pk in PINNED_UNITS) {
    if (PINNED_UNITS.hasOwnProperty(pk) && !PINNED_UNITS[pk]._applied) orphan.push(pk);
  }
  if (orphan.length) throw new Error('network.js: pinned unit(s) match no generated id: ' + orphan.join(', '));
  return out;
})();

/* --------------------------------------------------- 4. INTERSTATIONS
   The unit of energy analysis. One record per station-to-station hop per
   direction. This is where inefficiency is actually located.
   ----------------------------------------------------------------------- */

/* Story-critical hops, pinned to the figures the cases assert. */
var PINNED_HOPS = {
  'L3-NB-11': { segmentId: 'SEG-317', km: 2.40, gradient: 1.2, kwhPerKm: 3.25, baseline: 2.55, runs: 412,
                dwellMean: 31, dwellP90: 44, runtimeMean: 148, runtimeSd: 11.4, regenPct: 27.8, coastPct: 19,
                speedClass: 'Late brake', caseId: 'EC-2043' },
  'L3-NB-12': { segmentId: 'SEG-318', km: 1.90, gradient: -0.4, kwhPerKm: 2.96, baseline: 2.62, runs: 398,
                dwellMean: 52, dwellP90: 78, runtimeMean: 121, runtimeSd: 14.8, regenPct: 30.1, coastPct: 24,
                speedClass: 'Held', caseId: 'EC-2047' },
  'L3-NB-13': { segmentId: 'SEG-322', km: 3.10, gradient: 0.2, kwhPerKm: 2.74, baseline: 2.68, runs: 401,
                dwellMean: 28, dwellP90: 39, runtimeMean: 186, runtimeSd: 8.2, regenPct: 33.4, coastPct: 36,
                speedClass: 'Coasting', caseId: null }
};

var SPEED_CLASSES = ['Coasting', 'Balanced', 'Late brake', 'Held', 'Flat out'];

function buildInterstations(lineId) {
  var stations = LINE_STATIONS[lineId];
  var line = null, i;
  for (i = 0; i < LINES.length; i++) if (LINES[i].id === lineId) line = LINES[i];
  var hops = stations.length - 1;
  var avgKm = line.km / hops;
  var out = [];

  ['NB', 'SB'].forEach(function (dir) {
    var rnd = seed(lineId + dir + 'hops');
    for (var s = 0; s < hops; s++) {
      var seq = dir === 'NB' ? s : hops - 1 - s;
      var a = dir === 'NB' ? stations[seq] : stations[seq + 1];
      var b = dir === 'NB' ? stations[seq + 1] : stations[seq];
      var key = lineId + '-' + dir + '-' + (seq + 1);
      var pinned = PINNED_HOPS[key];

      var km = r2(avgKm * (0.7 + rnd() * 0.65));
      var grad = r1((rnd() - 0.5) * 3.2);
      var dev = (rnd() - 0.46) * 0.42;
      var baseKwh = r2(line.baseline + (rnd() - 0.5) * 0.3 + Math.abs(grad) * 0.03);
      var rec = {
        id: key, lineId: lineId, direction: dir === 'NB' ? 'Northbound' : 'Southbound',
        seq: seq + 1, from: a, to: b, label: a + ' \u2192 ' + b,
        segmentId: null,
        km: km,
        gradient: grad,
        kwhPerKm: r2(baseKwh + dev),
        baseline: baseKwh,
        runs: Math.round(360 + rnd() * 90),
        dwellMean: Math.round(26 + rnd() * 16),
        dwellP90: 0,
        runtimeMean: Math.round(km / avgKm * 92 + rnd() * 30),
        runtimeSd: r1(5 + rnd() * 8),
        regenPct: r1(line.regenPct + (rnd() - 0.5) * 6),
        coastPct: Math.round(18 + rnd() * 26),
        speedClass: pick(rnd, SPEED_CLASSES),
        caseId: null
      };
      rec.dwellP90 = Math.round(rec.dwellMean * (1.3 + rnd() * 0.35));

      if (pinned) for (var k in pinned) if (pinned.hasOwnProperty(k)) rec[k] = pinned[k];

      rec.deltaPct = Math.round((rec.kwhPerKm - rec.baseline) / rec.baseline * 1000) / 10;
      rec.excessMwh = r1((rec.kwhPerKm - rec.baseline) * rec.km * rec.runs * 13 / 1000);
      out.push(rec);
    }
  });
  return out;
}

var INTERSTATIONS = [];
['L3', 'L2', 'L1', 'L4'].forEach(function (id) {
  INTERSTATIONS = INTERSTATIONS.concat(buildInterstations(id));
});

/* ------------------------------------------------------------- 5. RUNS
   Individual services. The lowest level the platform exposes, and the only
   level at which a driver-visible speed trace exists.
   ----------------------------------------------------------------------- */

var PINNED_RUNS = {
  '3N-0842': { lineId: 'L3', direction: 'Northbound', unitId: 'B-214', date: '2026-09-22', departure: '08:42',
               km: 28.9, kwhPerKm: 3.48, baseline: 2.81, stops: 20, dwellTotal: 712, runtime: 2884,
               regenPct: 24.6, coastPct: 14, band: 'Peak', flag: 'High intensity', caseId: 'EC-2051' },
  '3N-1106': { lineId: 'L3', direction: 'Northbound', unitId: 'B-206', date: '2026-09-22', departure: '11:06',
               km: 28.9, kwhPerKm: 3.19, baseline: 2.81, stops: 20, dwellTotal: 648, runtime: 2790,
               regenPct: 28.4, coastPct: 21, band: 'Off-peak', flag: 'Late braking at 4 hops', caseId: 'EC-2043' },
  '3N-1134': { lineId: 'L3', direction: 'Northbound', unitId: 'B-203', date: '2026-09-22', departure: '11:34',
               km: 28.9, kwhPerKm: 2.62, baseline: 2.81, stops: 20, dwellTotal: 601, runtime: 2812,
               regenPct: 35.1, coastPct: 38, band: 'Off-peak', flag: 'Reference run', caseId: null }
};

var RUNS = (function () {
  var out = [], rnd = seed('runs'), i, k;
  var heads = { L1: '1', L2: '2', L3: '3', L4: '4' };
  var dates = ['2026-09-22', '2026-09-21', '2026-09-20', '2026-09-19', '2026-09-18'];

  for (k in PINNED_RUNS) {
    if (!PINNED_RUNS.hasOwnProperty(k)) continue;
    var pr = PINNED_RUNS[k];
    pr.id = k;
    pr.fleet = pr.unitId.charAt(0) === 'A' ? 'A-series' : pr.unitId.charAt(0) === 'B' ? 'B-series' : 'C-series';
    out.push(pr);
  }

  for (i = 0; i < 90; i++) {
    var line = LINES[Math.floor(rnd() * LINES.length)];
    var dir = rnd() > 0.5 ? 'Northbound' : 'Southbound';
    var hour = 5 + Math.floor(rnd() * 18);
    var peak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
    var pool = UNITS.filter(function (u) { return u.line === line.id; });
    var unit = pool.length ? pool[Math.floor(rnd() * pool.length)] : UNITS[0];
    var intensity = r2(line.baseline * (unit.index / 100) * (peak ? 1.09 : 1.0) + (rnd() - 0.5) * 0.28);
    var stops = line.stations - 1;
    var rec = {
      id: heads[line.id] + (dir === 'Northbound' ? 'N' : 'S') + '-' +
          (hour < 10 ? '0' : '') + hour + (rnd() > 0.5 ? '1' : '4') + Math.floor(rnd() * 9),
      lineId: line.id, direction: dir, unitId: unit.id, fleet: unit.fleet,
      date: dates[Math.floor(rnd() * dates.length)],
      departure: (hour < 10 ? '0' : '') + hour + ':' + (rnd() > 0.5 ? '1' : '4') + Math.floor(rnd() * 9),
      km: line.km, kwhPerKm: intensity, baseline: line.baseline,
      stops: stops,
      dwellTotal: Math.round(stops * (28 + rnd() * 14) * (peak ? 1.2 : 1)),
      runtime: Math.round(line.km * 98 + rnd() * 160),
      regenPct: r1(unit.regenPct + (rnd() - 0.5) * 4),
      coastPct: Math.round(16 + rnd() * 28),
      band: peak ? 'Peak' : hour >= 22 ? 'Late' : 'Off-peak',
      flag: null, caseId: null
    };
    out.push(rec);
  }

  for (i = 0; i < out.length; i++) {
    var r = out[i];
    r.kwh = Math.round(r.kwhPerKm * r.km);
    r.deltaPct = Math.round((r.kwhPerKm - r.baseline) / r.baseline * 1000) / 10;
    if (!r.flag) {
      r.flag = r.deltaPct > 14 ? 'High intensity' : r.deltaPct < -8 ? 'Below baseline' : null;
    }
  }
  out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.departure < b.departure ? -1 : 1;
  });
  return out;
})();

/* Speed and power trace for a single run, derived from the line's hops so
   the trace and the interstation table always agree. */
function runTrace(runId) {
  var run = null, i;
  for (i = 0; i < RUNS.length; i++) if (RUNS[i].id === runId) run = RUNS[i];
  if (!run) return null;

  var hops = INTERSTATIONS.filter(function (h) {
    return h.lineId === run.lineId && h.direction === run.direction;
  }).sort(function (a, b) { return a.seq - b.seq; });

  var rnd = seed('trace-' + runId);
  var pts = [], marks = [], dist = 0, t = 0;

  hops.forEach(function (hop, hi) {
    marks.push({ km: r2(dist), name: hi === 0 ? hop.from : hop.from, dwell: hop.dwellMean });
    var samples = 14;
    var vmax = 62 + rnd() * 16;
    var coast = run.coastPct / 100;
    for (var s = 0; s <= samples; s++) {
      var f = s / samples;
      var v, p;
      if (f < 0.28) { v = vmax * (f / 0.28); p = 1.0 - f; }
      else if (f < 0.28 + (0.52 * (1 - coast))) { v = vmax * (0.97 + Math.sin(f * 9) * 0.03); p = 0.34 + rnd() * 0.08; }
      else if (f < 0.86) { v = vmax * (1 - (f - 0.5) * 0.35); p = 0.02; }
      else { v = vmax * Math.max(0, (1 - f) / 0.14); p = -0.55 * (run.regenPct / 32); }
      pts.push({
        km: r2(dist + hop.km * f),
        t: Math.round(t + hop.runtimeMean * f),
        speed: r1(Math.max(0, v)),
        power: r2(p)
      });
    }
    dist += hop.km;
    t += hop.runtimeMean + hop.dwellMean;
  });
  marks.push({ km: r2(dist), name: hops[hops.length - 1].to, dwell: 0 });
  return { run: run, points: pts, marks: marks, distance: r2(dist) };
}

/* ------------------------------------------------------- 6. DISTRIBUTIONS
   Population shapes, used to answer "is this run unusual, or is the whole
   population like this?" — the question a single average cannot answer.
   ----------------------------------------------------------------------- */

/* lo/hi default to the observed range so the top bin is always occupied.
   A fixed domain wider than the data leaves empty tail bins, which made the
   "upper tail" reading report 0% and look broken. */
function histogram(values, bins, lo, hi) {
  var i;
  if (lo == null || hi == null) {
    lo = hi = values[0];
    for (i = 1; i < values.length; i++) {
      if (values[i] < lo) lo = values[i];
      if (values[i] > hi) hi = values[i];
    }
    /* Pad proportionally. Snapping to integers would collapse a fractional
       domain such as 0.72-1.14 to 0-2 and push every value into the middle. */
    var pad = (hi - lo) * 0.02 || 1;
    lo = lo - pad; hi = hi + pad;
  }
  var out = [], w = (hi - lo) / bins;
  for (i = 0; i < bins; i++) out.push({ from: r2(lo + i * w), to: r2(lo + (i + 1) * w), count: 0 });
  values.forEach(function (v) {
    var idx = Math.floor((v - lo) / w);
    if (idx < 0) idx = 0; if (idx >= bins) idx = bins - 1;
    out[idx].count++;
  });
  return out;
}

var DISTRIBUTIONS = {
  speedProfile: [
    { label: 'Coasting',   share: 22, kwhPerKm: 2.54, runs: 2472, tone: 'green' },
    { label: 'Balanced',   share: 34, kwhPerKm: 2.78, runs: 3822, tone: 'accent' },
    { label: 'Late brake', share: 26, kwhPerKm: 3.21, runs: 2922, tone: 'amber' },
    { label: 'Held',       share: 11, kwhPerKm: 3.04, runs: 1236, tone: 'amber' },
    { label: 'Flat out',   share: 7,  kwhPerKm: 3.44, runs: 788,  tone: 'red' }
  ],
  brakingRate: (function () {
    var rnd = seed('brake'), vals = [], i;
    for (i = 0; i < 1400; i++) vals.push(r2(0.72 + rnd() * 0.16 + (rnd() > 0.88 ? 0.10 + rnd() * 0.16 : 0)));
    return histogram(vals, 12);
  })(),
  dwell: (function () {
    var rnd = seed('dwell'), vals = [], i;
    for (i = 0; i < 1800; i++) vals.push(Math.round(22 + rnd() * 20 + (rnd() > 0.84 ? 14 + rnd() * 30 : 0)));
    return histogram(vals, 12);
  })(),
  runtimeVariance: (function () {
    var rnd = seed('rtv'), vals = [], i;
    for (i = 0; i < 1600; i++) vals.push(Math.round(-18 + rnd() * 26 + (rnd() > 0.80 ? 8 + rnd() * 28 : 0)));
    return histogram(vals, 12);
  })()
};

/* ----------------------------------------------------- 7. DEVIATION FEED
   What the correlation service is currently holding. Each entry names the
   location, the size of the gap and whether it has become a case yet.
   ----------------------------------------------------------------------- */

var DEVIATIONS = [
  { id: 'DV-1184', scope: 'Line 3 \u00b7 Northgate \u2192 Riverside \u00b7 NB', lineId: 'L3',
    interstationId: 'L3-NB-11', kwhPerKm: 3.25, baseline: 2.55, runs: 412, weeks: 6,
    annualMWh: 214, persistence: 'sustained', state: 'case', caseId: 'EC-2043' },
  { id: 'DV-1201', scope: 'Line 3 \u00b7 Riverside \u2192 Kingsway \u00b7 NB peak', lineId: 'L3',
    interstationId: 'L3-NB-12', kwhPerKm: 2.96, baseline: 2.62, runs: 398, weeks: 4,
    annualMWh: 96, persistence: 'sustained', state: 'case', caseId: 'EC-2047' },
  { id: 'DV-1209', scope: 'Line 3 \u00b7 B-214 and B-227 \u00b7 all services', lineId: 'L3',
    interstationId: null, kwhPerKm: 3.31, baseline: 2.81, runs: 624, weeks: 6,
    annualMWh: 78, persistence: 'widening', state: 'case', caseId: 'EC-2051' },
  { id: 'DV-1216', scope: 'Line 2 \u00b7 Trinity \u2192 Lower Quay \u00b7 NB', lineId: 'L2',
    interstationId: 'L2-NB-3', kwhPerKm: 3.02, baseline: 2.79, runs: 288, weeks: 3,
    annualMWh: 41, persistence: 'sustained', state: 'candidate', caseId: null },
  { id: 'DV-1219', scope: 'Line 1 \u00b7 A-series \u00b7 off-peak southbound', lineId: 'L1',
    interstationId: null, kwhPerKm: 2.88, baseline: 2.62, runs: 512, weeks: 5,
    annualMWh: 63, persistence: 'sustained', state: 'candidate', caseId: null },
  { id: 'DV-1223', scope: 'Line 4 \u00b7 C-series \u00b7 regenerative recovery', lineId: 'L4',
    interstationId: null, kwhPerKm: 2.51, baseline: 2.44, runs: 740, weeks: 8,
    annualMWh: 52, persistence: 'sustained', state: 'case', caseId: 'EC-2044' },
  { id: 'DV-1228', scope: 'Line 2 \u00b7 Broadfield \u2192 Lilywhite \u00b7 SB', lineId: 'L2',
    interstationId: null, kwhPerKm: 2.94, baseline: 2.79, runs: 141, weeks: 2,
    annualMWh: 18, persistence: 'intermittent', state: 'held', caseId: null },
  { id: 'DV-1231', scope: 'Line 1 \u00b7 Parkway \u2192 Bellevue \u00b7 NB', lineId: 'L1',
    interstationId: null, kwhPerKm: 2.79, baseline: 2.62, runs: 96, weeks: 1,
    annualMWh: 11, persistence: 'emerging', state: 'held', caseId: null }
];

/* ---------------------------------------------------------------- QUERIES */

function lineById(id) { for (var i = 0; i < LINES.length; i++) if (LINES[i].id === id) return LINES[i]; return null; }
function unitById(id) { for (var i = 0; i < UNITS.length; i++) if (UNITS[i].id === id) return UNITS[i]; return null; }
function runById(id)  { for (var i = 0; i < RUNS.length; i++) if (RUNS[i].id === id) return RUNS[i]; return null; }
function hopById(id)  { for (var i = 0; i < INTERSTATIONS.length; i++) if (INTERSTATIONS[i].id === id) return INTERSTATIONS[i]; return null; }
function lineName(id) { var l = H.query.lineById ? H.query.lineById(id) : null; return l ? l.name : id; }

function hopsFor(f) {
  f = f || {};
  return INTERSTATIONS.filter(function (h) {
    if (f.lineId && h.lineId !== f.lineId) return false;
    if (f.direction && f.direction !== 'Both' && h.direction !== f.direction) return false;
    return true;
  });
}

function worstHops(f, n) {
  return hopsFor(f).slice().sort(function (a, b) { return b.excessMwh - a.excessMwh; }).slice(0, n || 10);
}

function unitsFor(f) {
  f = f || {};
  return UNITS.filter(function (u) {
    if (f.fleet && u.fleet !== f.fleet) return false;
    if (f.lineId && u.line !== f.lineId) return false;
    return true;
  });
}

function runsFor(f) {
  f = f || {};
  return RUNS.filter(function (r) {
    if (f.lineId && r.lineId !== f.lineId) return false;
    if (f.direction && f.direction !== 'Both' && r.direction !== f.direction) return false;
    if (f.fleet && r.fleet !== f.fleet) return false;
    if (f.band && r.band !== f.band) return false;
    if (f.unitId && r.unitId !== f.unitId) return false;
    return true;
  });
}

function fleetSummary() {
  var out = [], f;
  for (f in FLEET_SPEC) {
    if (!FLEET_SPEC.hasOwnProperty(f)) continue;
    var us = unitsFor({ fleet: f });
    var idx = 0, reg = 0, watch = 0;
    us.forEach(function (u) { idx += u.index; reg += u.regenPct; if (u.state === 'watch') watch++; });
    out.push({
      id: f, units: us.length, propulsion: FLEET_SPEC[f].propulsion,
      regenCapable: FLEET_SPEC[f].regen, inService: FLEET_SPEC[f].inService,
      kwhPerKm: r2(FLEET_SPEC[f].baseKwhKm * (idx / us.length) / 100),
      baseline: FLEET_SPEC[f].baseKwhKm,
      index: Math.round(idx / us.length),
      regenPct: r1(reg / us.length),
      spread: Math.max.apply(null, us.map(function (u) { return u.index; })) -
              Math.min.apply(null, us.map(function (u) { return u.index; })),
      watch: watch
    });
  }
  return out;
}

/* Deviation → case linkage, so any analytical surface can show whether what
   the user is looking at is already being managed. */
function deviationsFor(f) {
  f = f || {};
  return DEVIATIONS.filter(function (d) {
    if (f.lineId && d.lineId !== f.lineId) return false;
    if (f.state && d.state !== f.state) return false;
    return true;
  });
}
function caseForHop(hopId) {
  for (var i = 0; i < DEVIATIONS.length; i++) {
    if (DEVIATIONS[i].interstationId === hopId && DEVIATIONS[i].caseId) return DEVIATIONS[i].caseId;
  }
  return null;
}

/* The reverse direction: from a case's scope back to the measurements it was
   raised from, so a case is never a dead end. */
function contextFor(scope) {
  if (!scope) return null;
  var out = { hop: null, units: [], runs: [], lineId: scope.lineId || null };
  var i;
  if (scope.segmentId) {
    for (i = 0; i < INTERSTATIONS.length; i++) {
      if (INTERSTATIONS[i].segmentId === scope.segmentId) { out.hop = INTERSTATIONS[i]; break; }
    }
  }
  if (out.hop && !out.lineId) out.lineId = out.hop.lineId;
  for (i = 0; i < UNITS.length; i++) {
    if (scope.units && scope.units.indexOf(UNITS[i].id) > -1) out.units.push(UNITS[i]);
  }
  for (i = 0; i < RUNS.length; i++) {
    var r = RUNS[i];
    if (out.lineId && r.lineId !== out.lineId) continue;
    if (scope.direction && r.direction && r.direction !== scope.direction) continue;
    out.runs.push(r);
  }
  return out;
}

/* ---------------------------------------------------------------- EXPORT */

H.net = {
  PERIODS: PERIODS, WEEK_LABELS: WEEK_LABELS,
  LINES: LINES, LINE_STATIONS: LINE_STATIONS, TOTAL: NETWORK_TOTAL,
  ENERGY_SPLIT: ENERGY_SPLIT, HOURLY: HOURLY,
  FLEET_SPEC: FLEET_SPEC, UNITS: UNITS,
  INTERSTATIONS: INTERSTATIONS, RUNS: RUNS, DISTRIBUTIONS: DISTRIBUTIONS,
  DEVIATIONS: DEVIATIONS,
  lineById: lineById, unitById: unitById, runById: runById, hopById: hopById,
  hopsFor: hopsFor, worstHops: worstHops, unitsFor: unitsFor, runsFor: runsFor,
  fleetSummary: fleetSummary, deviationsFor: deviationsFor, caseForHop: caseForHop,
  contextFor: contextFor,
  runTrace: runTrace, histogram: histogram, seed: seed
};

})(this);
