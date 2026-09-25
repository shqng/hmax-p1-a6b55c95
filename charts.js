/* ===========================================================================
   HMAX — charts.js
   Data-driven SVG plots.

   render.js holds schematic diagrams used to explain mechanisms. This file
   holds real charts: every mark is positioned from a measured value, every
   axis is labelled, and every series that is compared to a baseline draws
   that baseline explicitly. Nothing here invents a shape.
   ========================================================================= */

(function (global) {
'use strict';

var H = global.HMAX;
var esc = H.render.esc;

var C = {
  axis:  'var(--text-tertiary)',
  grid:  'var(--border-soft)',
  ink:   'var(--text-secondary)',
  base:  'var(--text-tertiary)',
  good:  'var(--green)',
  warn:  'var(--amber)',
  bad:   'var(--red)',
  key:   'var(--accent)',
  blue:  'var(--blue)'
};

function nice(n) { return Math.round(n * 100) / 100; }
function fmt(n, dp) { return Number(n).toFixed(dp == null ? 2 : dp); }
/* Thousands separator without relying on toLocaleString, whose output varies
   by host and locale and has already produced "5,271.00" where "5,271" was
   meant. */
function fmtInt(n) {
  var s = String(Math.round(Number(n))), neg = s.charAt(0) === '-';
  if (neg) s = s.substring(1);
  var out = '';
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return (neg ? '-' : '') + out;
}
function toneColour(t) {
  return t === 'good' || t === 'green' ? C.good : t === 'warn' || t === 'amber' ? C.warn :
         t === 'bad' || t === 'red' ? C.bad : t === 'blue' ? C.blue :
         t === 'tertiary' ? C.axis : C.key;
}
function svgWrap(w, h, body, cls) {
  return '<svg class="' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" ' +
    'style="width:100%;height:auto;display:block;overflow:visible" role="img">' + body + '</svg>';
}
function txt(x, y, s, size, colour, anchor, weight) {
  return '<text x="' + x + '" y="' + y + '" font-size="' + (size || 9) + '" fill="' + (colour || C.axis) +
    '" text-anchor="' + (anchor || 'middle') + '" font-weight="' + (weight || 400) +
    '" font-family="IBM Plex Mono, monospace">' + esc(String(s)) + '</text>';
}

/* --------------------------------------------------------------- 1. SERIES
   A measured series against its baseline. The area between them is the point
   of the chart, so it is filled rather than left to be inferred.
   opts: {height, yLabel, baselineLabel, valueLabel, dp, invert}
   ----------------------------------------------------------------------- */

function series(data, opts) {
  opts = opts || {};
  var W = 640, Hh = opts.height || 190;
  var padL = 40, padR = 12, padT = 14, padB = 26;
  var iw = W - padL - padR, ih = Hh - padT - padB;

  var vals = [];
  data.forEach(function (d) { vals.push(d.value); if (d.baseline != null) vals.push(d.baseline); });
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  var span = (hi - lo) || 1;
  lo -= span * 0.35; hi += span * 0.25;

  function X(i) { return padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw); }
  function Y(v) { return padT + ih - ((v - lo) / (hi - lo)) * ih; }

  var s = '';
  var ticks = 4, i;
  for (i = 0; i <= ticks; i++) {
    var tv = lo + ((hi - lo) / ticks) * i, ty = Y(tv);
    s += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty +
      '" stroke="' + C.grid + '" stroke-width="1"/>';
    s += txt(padL - 7, ty + 3, fmt(tv, opts.dp == null ? 2 : opts.dp), 9, C.axis, 'end');
  }

  var hasBase = data[0] && data[0].baseline != null;
  if (hasBase) {
    var poly = [], j;
    for (j = 0; j < data.length; j++) poly.push(X(j) + ',' + Y(data[j].value));
    for (j = data.length - 1; j >= 0; j--) poly.push(X(j) + ',' + Y(data[j].baseline));
    var over = data[data.length - 1].value > data[data.length - 1].baseline;
    s += '<polygon points="' + poly.join(' ') + '" fill="' +
      (over ? 'rgba(245,185,92,.13)' : 'rgba(94,234,212,.10)') + '"/>';
    s += '<polyline points="' + data.map(function (d, k) { return X(k) + ',' + Y(d.baseline); }).join(' ') +
      '" fill="none" stroke="' + C.base + '" stroke-width="1.4" stroke-dasharray="4 3"/>';
  }

  s += '<polyline points="' + data.map(function (d, k) { return X(k) + ',' + Y(d.value); }).join(' ') +
    '" fill="none" stroke="' + (opts.colour || C.key) + '" stroke-width="2" stroke-linejoin="round"/>';

  data.forEach(function (d, k) {
    var last = k === data.length - 1;
    s += '<circle cx="' + X(k) + '" cy="' + Y(d.value) + '" r="' + (last ? 3.6 : 2.1) + '" fill="' +
      (opts.colour || C.key) + '"/>';
    if (k % Math.ceil(data.length / 8) === 0 || last) {
      s += txt(X(k), Hh - 8, d.week || d.label || k, 9, C.axis);
    }
  });

  if (opts.yLabel) s += txt(padL - 7, padT - 4, opts.yLabel, 8.5, C.axis, 'end', 600);
  return svgWrap(W, Hh, s);
}

/* ------------------------------------------------------------ 2. SPARKLINE
   Inline trend for table rows. No axes — it carries direction only.
   ----------------------------------------------------------------------- */

function sparkline(values, opts) {
  opts = opts || {};
  var W = 56, Hh = 18;
  var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
  var span = (hi - lo) || 1;
  var pts = values.map(function (v, i) {
    return (i / (values.length - 1)) * W + ',' + (Hh - 2 - ((v - lo) / span) * (Hh - 4));
  }).join(' ');
  return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" style="width:' + W + 'px;height:' + Hh +
    'px;display:block;overflow:visible"><polyline points="' + pts + '" fill="none" stroke="' +
    (opts.colour || C.axis) + '" stroke-width="1.4"/></svg>';
}

/* ---------------------------------------------------------- 3. RANKED BARS
   Horizontal, sorted, with a baseline rule. Used wherever the question is
   "which of these is worst" — the ranking must be visible without reading.
   items: [{label, value, baseline, sub, tone, href, flag}]
   ----------------------------------------------------------------------- */

function rankedBars(items, opts) {
  opts = opts || {};
  var max = 0;
  items.forEach(function (d) { max = Math.max(max, d.value, d.baseline || 0); });
  max *= 1.08;

  return '<div class="rb">' + items.map(function (d) {
    var over = d.baseline != null && d.value > d.baseline;
    var tone = d.tone || (over ? 'warn' : 'key');
    var wv = (d.value / max) * 100, wb = d.baseline != null ? (d.baseline / max) * 100 : null;
    var body =
      '<div class="rb-row">' +
        '<div class="rb-label">' +
          '<span class="rb-name">' + esc(d.label) + '</span>' +
          (d.sub ? '<span class="rb-sub">' + esc(d.sub) + '</span>' : '') +
        '</div>' +
        '<div class="rb-track">' +
          '<div class="rb-fill" style="width:' + wv.toFixed(1) + '%;background:' + toneColour(tone) + '"></div>' +
          (wb != null ? '<div class="rb-base" style="left:' + wb.toFixed(1) + '%"></div>' : '') +
        '</div>' +
        '<div class="rb-value mono">' + esc(opts.format ? opts.format(d.value) : fmt(d.value, opts.dp)) + '</div>' +
        (d.baseline != null
          ? '<div class="rb-delta mono" style="color:' + (over ? C.warn : C.good) + '">' +
              (over ? '+' : '') + fmt((d.value - d.baseline) / d.baseline * 100, 1) + '%</div>'
          : '<div class="rb-delta"></div>') +
        (d.flag ? '<span class="rb-flag">' + esc(d.flag) + '</span>' : '<span class="rb-flag"></span>') +
      '</div>';
    return d.href ? '<a class="rb-link" href="' + esc(d.href) + '">' + body + '</a>' : body;
  }).join('') + '</div>';
}

/* -------------------------------------------------------------- 4. COLUMNS
   Vertical bars for an ordered independent variable: hour of day, or the
   bins of a distribution. A baseline series draws as a dashed rule.
   items: [{label, value, baseline, tone}]
   ----------------------------------------------------------------------- */

function columns(items, opts) {
  opts = opts || {};
  var W = 640, Hh = opts.height || 170;
  var padL = 36, padR = 10, padT = 12, padB = 24;
  var iw = W - padL - padR, ih = Hh - padT - padB;
  var max = 0;
  items.forEach(function (d) { max = Math.max(max, d.value, d.baseline || 0); });
  var min = opts.zero === false ? Math.min.apply(null, items.map(function (d) {
    return Math.min(d.value, d.baseline == null ? d.value : d.baseline);
  })) * 0.94 : 0;
  max *= 1.06;

  var bw = iw / items.length;
  var s = '', i;
  for (i = 0; i <= 3; i++) {
    var tv = min + ((max - min) / 3) * i;
    var ty = padT + ih - ((tv - min) / (max - min)) * ih;
    s += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty + '" stroke="' + C.grid + '"/>';
    s += txt(padL - 6, ty + 3, opts.tickFormat ? opts.tickFormat(tv) : fmt(tv, opts.dp == null ? 2 : opts.dp), 9, C.axis, 'end');
  }

  items.forEach(function (d, k) {
    var x = padL + k * bw;
    var y = padT + ih - ((d.value - min) / (max - min)) * ih;
    var h = padT + ih - y;
    s += '<rect x="' + (x + bw * 0.16) + '" y="' + y + '" width="' + (bw * 0.68) + '" height="' + Math.max(h, 1) +
      '" fill="' + toneColour(d.tone) + '" opacity="' + (d.dim ? 0.4 : 0.9) + '" rx="1.5"/>';
    if (d.baseline != null) {
      var by = padT + ih - ((d.baseline - min) / (max - min)) * ih;
      s += '<line x1="' + (x + bw * 0.1) + '" y1="' + by + '" x2="' + (x + bw * 0.9) + '" y2="' + by +
        '" stroke="' + C.base + '" stroke-width="1.3" stroke-dasharray="3 2"/>';
    }
    if (d.label && (items.length <= 14 || k % Math.ceil(items.length / 12) === 0)) {
      s += txt(x + bw / 2, Hh - 8, d.label, 8.5, C.axis);
    }
  });
  return svgWrap(W, Hh, s);
}

/* -------------------------------------------------------- 5. RUN PROFILE
   Speed against distance with station markers and a power band beneath.
   This is the only chart in the product that shows a single service, and it
   is what makes an argument about driving behaviour checkable.
   ----------------------------------------------------------------------- */

function runProfile(trace, opts) {
  opts = opts || {};
  var W = 640, Hh = opts.height || 220;
  var padL = 34, padR = 12, padT = 14;
  var speedH = Hh - 96, powerH = 44, gap = 14, axisH = 22;
  var iw = W - padL - padR;
  var dist = trace.distance;
  var vmax = 0;
  trace.points.forEach(function (p) { vmax = Math.max(vmax, p.speed); });
  vmax = Math.ceil(vmax / 10) * 10;

  function X(km) { return padL + (km / dist) * iw; }
  function Yv(v) { return padT + speedH - (v / vmax) * speedH; }

  var s = '', i;
  for (i = 0; i <= 2; i++) {
    var tv = (vmax / 2) * i, ty = Yv(tv);
    s += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty + '" stroke="' + C.grid + '"/>';
    s += txt(padL - 6, ty + 3, tv, 9, C.axis, 'end');
  }

  trace.marks.forEach(function (m) {
    s += '<line x1="' + X(m.km) + '" y1="' + padT + '" x2="' + X(m.km) + '" y2="' + (padT + speedH) +
      '" stroke="' + C.grid + '" stroke-dasharray="2 3"/>';
  });

  if (opts.reference) {
    s += '<polyline points="' + opts.reference.points.map(function (p) {
      return X(p.km) + ',' + Yv(p.speed);
    }).join(' ') + '" fill="none" stroke="' + C.base + '" stroke-width="1.3" stroke-dasharray="4 3"/>';
  }

  s += '<polyline points="' + trace.points.map(function (p) { return X(p.km) + ',' + Yv(p.speed); }).join(' ') +
    '" fill="none" stroke="' + (opts.colour || C.key) + '" stroke-width="1.7" stroke-linejoin="round"/>';
  s += txt(padL - 6, padT - 3, 'km/h', 8.5, C.axis, 'end', 600);

  var pTop = padT + speedH + gap;
  var mid = pTop + powerH / 2;
  s += '<line x1="' + padL + '" y1="' + mid + '" x2="' + (W - padR) + '" y2="' + mid + '" stroke="' + C.grid + '"/>';
  trace.points.forEach(function (p, k) {
    if (k % 2) return;
    var h = Math.abs(p.power) * (powerH / 2);
    var y = p.power >= 0 ? mid - h : mid;
    s += '<rect x="' + X(p.km) + '" y="' + y + '" width="1.6" height="' + Math.max(h, 0.6) +
      '" fill="' + (p.power >= 0 ? C.warn : C.good) + '" opacity=".75"/>';
  });
  s += txt(padL - 6, mid - powerH / 2 + 8, 'draw', 8.5, C.warn, 'end', 600);
  s += txt(padL - 6, mid + powerH / 2 - 1, 'regen', 8.5, C.good, 'end', 600);

  var labelY = Hh - axisH + 12;
  var lastX = -60;
  trace.marks.forEach(function (m, k) {
    var x = X(m.km);
    if (x - lastX < 54 && k !== trace.marks.length - 1) return;
    lastX = x;
    s += txt(x, labelY, m.name.length > 11 ? m.name.slice(0, 10) + '\u2026' : m.name, 8.5, C.axis);
  });
  return svgWrap(W, Hh, s);
}

/* ------------------------------------------------------------ 6. STACK BAR
   Composition. Negative values (regenerated energy) draw below the axis so
   the recovered share is not mistaken for consumption.
   ----------------------------------------------------------------------- */

function stack(items, opts) {
  opts = opts || {};
  var total = 0;
  items.forEach(function (d) { if (d.mwh > 0 || d.value > 0) total += (d.mwh != null ? d.mwh : d.value); });
  return '<div class="stackbar">' + items.map(function (d) {
    var v = d.mwh != null ? d.mwh : d.value;
    if (v <= 0) return '';
    return '<div class="stackbar-seg" style="width:' + (v / total * 100).toFixed(2) + '%;background:' +
      toneColour(d.tone) + '" title="' + esc(d.label) + '"></div>';
  }).join('') + '</div>' +
  '<div class="stackkey">' + items.map(function (d) {
    var v = d.mwh != null ? d.mwh : d.value;
    return '<div class="stackkey-item">' +
      '<span class="stackkey-dot" style="background:' + toneColour(d.tone) + '"></span>' +
      '<span class="stackkey-label">' + esc(d.label) + '</span>' +
      '<span class="stackkey-value mono">' + (v < 0 ? '\u2212' : '') + fmtInt(Math.abs(v)) +
      (opts.unit ? ' ' + opts.unit : '') + '</span>' +
      (d.note ? '<span class="stackkey-note">' + esc(d.note) + '</span>' : '') +
    '</div>';
  }).join('') + '</div>';
}

/* -------------------------------------------------------------- 7. SCATTER
   Two measured variables, used to test whether a proposed contributor moves
   with the outcome at all before anyone claims that it does.
   points: [{x, y, label, tone, size}]
   ----------------------------------------------------------------------- */

function scatter(points, opts) {
  opts = opts || {};
  var W = 640, Hh = opts.height || 200;
  var padL = 40, padR = 14, padT = 14, padB = 30;
  var iw = W - padL - padR, ih = Hh - padT - padB;
  var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var xp = (x1 - x0) * 0.08 || 1, yp = (y1 - y0) * 0.12 || 1;
  x0 -= xp; x1 += xp; y0 -= yp; y1 += yp;

  function X(v) { return padL + ((v - x0) / (x1 - x0)) * iw; }
  function Y(v) { return padT + ih - ((v - y0) / (y1 - y0)) * ih; }

  var s = '', i;
  for (i = 0; i <= 3; i++) {
    var tv = y0 + ((y1 - y0) / 3) * i, ty = Y(tv);
    s += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty + '" stroke="' + C.grid + '"/>';
    s += txt(padL - 6, ty + 3, fmt(tv, opts.ydp == null ? 2 : opts.ydp), 9, C.axis, 'end');
  }
  for (i = 0; i <= 4; i++) {
    var xv = x0 + ((x1 - x0) / 4) * i;
    s += txt(X(xv), Hh - 12, fmt(xv, opts.xdp == null ? 0 : opts.xdp), 9, C.axis);
  }

  if (opts.fit !== false && points.length > 3) {
    var n = points.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    points.forEach(function (p) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; });
    var m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    var b = (sy - m * sx) / n;
    if (isFinite(m)) {
      s += '<line x1="' + X(x0) + '" y1="' + Y(m * x0 + b) + '" x2="' + X(x1) + '" y2="' + Y(m * x1 + b) +
        '" stroke="' + C.base + '" stroke-width="1.3" stroke-dasharray="4 3"/>';
    }
  }

  points.forEach(function (p) {
    s += '<circle cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="' + (p.size || 3) + '" fill="' +
      toneColour(p.tone) + '" opacity="' + (p.tone ? 0.95 : 0.55) + '"/>';
    if (p.label) s += txt(X(p.x) + (p.size || 3) + 4, Y(p.y) + 3, p.label, 8.5, C.ink, 'start');
  });
  if (opts.xLabel) s += txt(W / 2, Hh - 1, opts.xLabel, 8.5, C.axis, 'middle', 600);
  if (opts.yLabel) s += txt(padL - 6, padT - 3, opts.yLabel, 8.5, C.axis, 'end', 600);
  return svgWrap(W, Hh, s);
}

/* -------------------------------------------------------------- 8. HEATMAP
   Location against time. The fastest way to see whether a problem is
   everywhere-sometimes or somewhere-always.
   rows: [{label, cells:[{v, label}]}], cols: [labels]
   ----------------------------------------------------------------------- */

function heatmap(rows, cols, opts) {
  opts = opts || {};
  var vals = [];
  rows.forEach(function (r) { r.cells.forEach(function (c) { if (c.v != null) vals.push(c.v); }); });
  var lo = opts.min != null ? opts.min : Math.min.apply(null, vals);
  var hi = opts.max != null ? opts.max : Math.max.apply(null, vals);

  function cell(v) {
    if (v == null) return 'var(--bg-elev-2)';
    var t = (v - lo) / ((hi - lo) || 1);
    if (t < 0.34) return 'rgba(94,234,212,' + (0.10 + t * 0.5).toFixed(2) + ')';
    if (t < 0.67) return 'rgba(245,185,92,' + (0.12 + (t - 0.34) * 0.9).toFixed(2) + ')';
    return 'rgba(240,100,95,' + (0.18 + (t - 0.67) * 1.5).toFixed(2) + ')';
  }

  return '<div class="hm">' +
    '<div class="hm-row hm-head"><div class="hm-label"></div>' +
      cols.map(function (c) { return '<div class="hm-col">' + esc(c) + '</div>'; }).join('') + '</div>' +
    rows.map(function (r) {
      return '<div class="hm-row">' +
        '<div class="hm-label" title="' + esc(r.label) + '">' + esc(r.label) + '</div>' +
        r.cells.map(function (c) {
          return '<div class="hm-cell" style="background:' + cell(c.v) + '" title="' +
            esc((c.label || '') + (c.v != null ? ' ' + fmt(c.v, 2) : ' no data')) + '"></div>';
        }).join('') +
      '</div>';
    }).join('') + '</div>';
}

/* ------------------------------------------------------------ 9. GAUGE BAR
   A single value against its baseline and an acceptable band. Used in KPI
   positions where a number alone would not say whether it is acceptable.
   ----------------------------------------------------------------------- */

function gauge(value, baseline, opts) {
  opts = opts || {};
  var band = opts.band == null ? 0.04 : opts.band;
  var lo = Math.min(value, baseline) * 0.92;
  var hi = Math.max(value, baseline) * 1.06;
  function pct(v) { return ((v - lo) / (hi - lo) * 100).toFixed(1); }
  var over = value > baseline * (1 + band);
  return '<div class="gauge">' +
    '<div class="gauge-band" style="left:' + pct(baseline * (1 - band)) + '%;width:' +
      (pct(baseline * (1 + band)) - pct(baseline * (1 - band))).toFixed(1) + '%"></div>' +
    '<div class="gauge-base" style="left:' + pct(baseline) + '%"></div>' +
    '<div class="gauge-mark" style="left:' + pct(value) + '%;background:' +
      (over ? C.warn : C.good) + '"></div>' +
  '</div>';
}

/* ------------------------------------------------------------ 10. DELTA
   Signed percentage against a baseline, coloured by whether the direction is
   good. Energy is inverted: below baseline is good.
   ----------------------------------------------------------------------- */

function delta(value, baseline, opts) {
  opts = opts || {};
  if (baseline == null || !isFinite(baseline) || baseline === 0) {
    return '<span class="delta delta-none">no baseline</span>';
  }
  var pct = (value - baseline) / baseline * 100;
  var good = opts.higherIsBetter ? pct > 0 : pct < 0;
  var flat = Math.abs(pct) < (opts.tolerance == null ? 1.5 : opts.tolerance);
  return '<span class="delta ' + (flat ? 'delta-flat' : good ? 'delta-good' : 'delta-bad') + '">' +
    (pct > 0 ? '+' : pct < 0 ? '\u2212' : '') + Math.abs(pct).toFixed(1) + '%</span>';
}

/* ---------------------------------------------------- 11. CHART READING
   A chart never ships without its interpretation. This is the analytical
   surface's equivalent of render.js's reading block: system-authored text,
   visibly attributed, sitting directly beneath the marks it describes.
   ----------------------------------------------------------------------- */

function note(html, serviceId) {
  return '<div class="reading mt-3"><div class="rd-body">' +
    '<div class="rd-head">' + H.render.smartTag('Reading') +
      (serviceId ? H.render.sref(serviceId) : '') + '</div>' +
    '<div class="rd-text">' + html + '</div>' +
  '</div></div>';
}
function em(s) { return '<strong style="color:var(--text-primary);font-weight:600">' + esc(String(s)) + '</strong>'; }

H.charts = {
  series: series, sparkline: sparkline, rankedBars: rankedBars, columns: columns,
  runProfile: runProfile, stack: stack, scatter: scatter, heatmap: heatmap,
  gauge: gauge, delta: delta, note: note, em: em, toneColour: toneColour,
  fmt: fmt, fmtInt: fmtInt
};

})(this);
