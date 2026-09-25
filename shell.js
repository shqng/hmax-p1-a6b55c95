/* ===========================================================================
   shell.js — the application frame.

   Every workspace declares only its identity; the shell draws navigation,
   role context, depth and attention. Navigation therefore cannot drift
   between screens, and a role never sees a workspace outside its own grant.

       HMAX.shell.mount({ workspace: 'caseload', title: 'Caseload' });
   ========================================================================= */
(function (global) {
'use strict';

var H = global.HMAX;
if (!H) { throw new Error('shell.js requires data.js'); }
var R = H.render, Q = H.query, C = H.compute;
var esc = R.esc;

var ICONS = {
  pulse:    '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  chart:    '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  route:    '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h3"/>',
  train:    '<rect x="4" y="3" width="16" height="13" rx="3"/><path d="M4 10h16"/><path d="M8 20l-2 2M16 20l2 2"/><circle cx="8.5" cy="13.5" r="1"/><circle cx="15.5" cy="13.5" r="1"/>',
  target:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  layers:   '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M2 16l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  gavel:    '<path d="M14 4l6 6"/><path d="M11 7 8 4 2 10l3 3Z"/><path d="M17 13l-3-3-6 6 3 3Z"/><path d="M13 20h9"/>',
  ledger:   '<path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3Z"/><path d="M4 17h16"/><path d="M9 8h7"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  cog:      '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
};

function badgeCount(key, roleId) {
  if (key === 'myCases') return Q.caseloadFor(roleId).length;
  if (key === 'myGates') return Q.gatesFor(roleId).length;
  return 0;
}

/* ------------------------------------------------------------- sidebar */

function sidebar(roleId, active) {
  var role = H.ROLES[roleId];
  var groups = {}, foot = [];

  role.nav.forEach(function (key) {
    var item = H.NAV[key];
    if (!item) return;
    var n = item.badge ? badgeCount(item.badge, roleId) : 0;
    var html = '<a href="' + esc(item.href) + '" class="sidebar-link' +
      (key === active ? ' active' : '') + (n > 0 ? ' needs' : '') + '">' +
      '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">' + ICONS[item.icon] + '</svg>' +
      '<span>' + esc(item.label) + '</span>' +
      (n > 0 ? '<span class="sidebar-badge">' + n + '</span>' : '') + '</a>';
    if (item.footer) { foot.push(html); return; }
    var g = item.group || 'manage';
    (groups[g] = groups[g] || []).push(html);
  });

  var body = H.NAV_GROUPS.map(function (g) {
    if (!groups[g.id] || !groups[g.id].length) return '';
    return '<div class="sidebar-section">' + esc(g.label) + '</div>' +
      '<nav class="sidebar-nav">' + groups[g.id].join('') + '</nav>';
  }).join('');

  return '<a class="sidebar-brand" href="index.html">' +
      '<span><span class="brand-name">HMAX</span>' +
      '<span class="brand-sub">Energy Management</span></span></a>' +
    body +
    '<div class="sidebar-foot">' + foot.join('') +
      '<div class="sidebar-context">' +
        '<div class="sc-line">' + esc(H.NETWORK.operator) + '</div>' +
        '<div class="sc-line dim">' + H.NETWORK.lines.length + ' lines · ' +
          H.NETWORK.fleets.length + ' fleets · ' + H.net.UNITS.length + ' units</div>' +
        '<div class="sc-line dim">Phase 1 · traction energy</div>' +
      '</div>' +
    '</div>';
}

/* -------------------------------------------------------------- topbar */

var ATTENTION_ASK = {
  acceptance:     'Accept or decline this candidate',
  approval:       'Approve or decline the trade-off',
  implementation: 'Confirm release and lock measurement',
  verdict:        'Rule on the proposed cause',
  scenario:       'Choose a bundle to carry to decision',
  baseline:       'Blocked on baseline — resolve or close'
};

function titleFor(id) {
  var c = Q.caseById(id);
  if (c) return c.title;
  for (var i = 0; i < H.CANDIDATES.length; i++) if (H.CANDIDATES[i].id === id) return H.CANDIDATES[i].title;
  return id;
}

function attentionRows(roleId) {
  var items = Q.attentionFor(roleId);
  if (!items.length) return '<div class="ap-empty">Nothing is waiting on you.</div>';
  return items.map(function (a) {
    var href = Q.caseById(a.caseId) ? 'case.html?id=' + a.caseId : 'portfolio.html#candidates';
    return '<a class="ap-row" href="' + esc(href) + '">' +
      '<div class="ap-what">' + esc(ATTENTION_ASK[a.what] || a.what) + '</div>' +
      '<div class="ap-title"><span class="mono">' + esc(a.caseId) + '</span> · ' + esc(titleFor(a.caseId)) + '</div>' +
      '<div class="ap-since">since ' + esc(String(a.since).slice(0, 10)) + '</div></a>';
  }).join('');
}

var DEPTHS = [
  { k: 'L1', label: 'Summary', hint: 'Position, priority and what needs a decision' },
  { k: 'L2', label: 'Working', hint: 'Evidence, scenarios and trade-offs' },
  { k: 'L3', label: 'Full',    hint: 'Method, provenance, assumptions and limits' }
];

function topbar(opts, roleId, depth) {
  var role = H.ROLES[roleId];
  var n = Q.attentionFor(roleId).length;

  var roleItems = Object.keys(H.ROLES).map(function (k) {
    var r = H.ROLES[k];
    var cnt = Q.attentionFor(k).length;
    return '<div class="rmp-item' + (k === roleId ? ' active' : '') + '" data-role="' + k + '">' +
      '<span class="rs-avatar" style="background:' + r.soft + ';color:' + r.color + '">' + esc(r.initials) + '</span>' +
      '<span style="min-width:0"><span class="rmp-name" style="display:block">' + esc(r.person) + '</span>' +
      '<span class="rmp-desc" style="display:block">' + esc(r.name) + '</span></span>' +
      '<span class="rmp-count' + (cnt ? ' live' : '') + '">' + cnt + '</span></div>';
  }).join('');

  return '<div class="topbar-slot">' +
    '<div style="min-width:0">' +
      (opts.crumb ? '<div class="ts-crumb">' + esc(opts.crumb) + '</div>' : '') +
      '<div class="ts-title">' + esc(opts.title) + '</div>' +
    '</div>' +
    '<div class="ts-right">' +

      '<div class="case-search" id="caseSearch">' +
        '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' +
        '<input type="text" id="caseSearchInput" autocomplete="off" placeholder="Find a case, segment or fleet">' +
        '<div class="case-search-results" id="caseSearchResults" style="display:none"></div>' +
      '</div>' +

      '<span class="depth-control-label">Detail</span>' +
      '<div class="depth-control" id="depthControl">' +
        DEPTHS.map(function (d) {
          return '<button data-depth="' + d.k + '"' + (d.k === depth ? ' class="active"' : '') +
            ' title="' + esc(d.label + ' — ' + d.hint) + '">' + d.k + '</button>';
        }).join('') +
      '</div>' +

      '<div style="position:relative">' +
        '<button class="smart-pill" id="smartBtn" title="Automated services contributing to this product">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>' +
          '<span class="pill-label">Intelligence</span><span class="sp-count">' + H.SERVICES.filter(function (s) { return s.enabled; }).length + '</span></button>' +
        '<div class="smart-panel" id="smartPanel" style="display:none">' +
          '<div class="sp-head">Automated services' +
            '<span class="sp-head-sub">Every one proposes and evidences. None completes a stage on its own.</span></div>' +
          H.STAGES.map(function (st) {
            var svcs = H.SERVICES.filter(function (s) { return s.stage === st.key && s.enabled; });
            if (!svcs.length) return '';
            return '<div class="sp-group"><div class="sp-stage">' + esc(st.label) + '</div>' +
              svcs.map(function (s) {
                return '<div class="sp-item">' +
                  '<span class="sp-id">' + esc(s.id) + '</span>' +
                  '<span style="min-width:0">' +
                    '<span class="sp-name">' + esc(s.name) + '</span>' +
                    '<span class="sp-stop">Stops at: ' + esc(s.checkpoint) + '</span>' +
                  '</span></div>';
              }).join('') + '</div>';
          }).join('') +
          '<a class="sp-foot" href="admin.html?view=services">Thresholds and configuration</a>' +
        '</div>' +
      '</div>' +

      '<div style="position:relative">' +
        '<button class="attention-pill' + (n > 0 ? ' has-items' : '') + '" id="attentionBtn">' +
          '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
          '<span class="pill-label">Waiting on you</span><span class="ap-count">' + n + '</span></button>' +
        '<div class="attention-panel" id="attentionPanel" style="display:none">' +
          '<div class="ap-head">' + esc(role.short) + ' · ' + esc(role.person) + '</div>' +
          attentionRows(roleId) + '</div>' +
      '</div>' +

      '<div class="role-switch" id="roleSwitch">' +
        '<span class="rs-avatar" style="background:' + role.soft + ';color:' + role.color + '">' + esc(role.initials) + '</span>' +
        '<span><span class="rs-name" style="display:block">' + esc(role.person) + '</span>' +
        '<span class="rs-role" style="display:block">' + esc(role.short) + '</span></span>' +
        '<svg class="rs-caret" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>' +
        '<div class="role-menu-panel" id="roleMenu" style="display:none">' +
          '<div class="rmp-note">Prototype control. Switches the signed-in role so each workflow can be walked end to end — the live product resolves this from the user account.</div>' +
          roleItems +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* --------------------------------------------------------------- search */

function wireSearch() {
  var wrap = document.getElementById('caseSearch');
  var input = document.getElementById('caseSearchInput');
  var box = document.getElementById('caseSearchResults');
  if (!wrap || !input || !box) return;

  var idx = [];
  H.CASES.forEach(function (c) {
    idx.push({ id: c.id, title: c.title, meta: R.whereOf(c) + ' · ' + C.stageLabel(c), href: 'case.html?id=' + c.id });
  });
  H.CANDIDATES.forEach(function (c) {
    idx.push({ id: c.id, title: c.title, meta: c.scope + ' · candidate', href: 'portfolio.html#candidates' });
  });

  function run() {
    var q = input.value.trim().toLowerCase();
    if (!q) { box.style.display = 'none'; return; }
    var hits = [];
    for (var i = 0; i < idx.length && hits.length < 6; i++) {
      if ((idx[i].id + ' ' + idx[i].title + ' ' + idx[i].meta).toLowerCase().indexOf(q) > -1) hits.push(idx[i]);
    }
    box.innerHTML = hits.length
      ? hits.map(function (r) {
          return '<a class="csr-item" href="' + esc(r.href) + '" style="min-width:0">' +
            '<span class="csr-id">' + esc(r.id) + '</span>' +
            '<span style="min-width:0"><span style="display:block;font-size:12px;color:var(--text-primary)">' + esc(r.title) + '</span>' +
            '<span style="display:block;font-size:10.5px;color:var(--text-tertiary)">' + esc(r.meta) + '</span></span></a>';
        }).join('')
      : '<div class="csr-empty">Nothing matches that.</div>';
    box.style.display = 'block';
  }

  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) box.style.display = 'none';
  });
}

/* --------------------------------------------------- operating model rail

   Present on every product screen. It states the whole operating model in one
   line — measurement feeds detection, the case spine carries the work, the
   ledger holds the result — and marks where the current workspace sits, so a
   reader never has to reconstruct how the parts relate. */

var RAIL_PHASE = {
  overview: 'measure', explore: 'measure', runs: 'measure', fleet: 'measure',
  caseload: 'spine', 'case': 'spine', decisions: 'spine', portfolio: 'spine',
  ledger: 'result', trust: null, admin: null
};

function railStageCounts() {
  var counts = {};
  H.STAGES.forEach(function (s) { counts[s.key] = 0; });
  Q.openCases().forEach(function (c) {
    var k = c.stage && c.stage.key;
    if (counts.hasOwnProperty(k)) counts[k]++;
  });
  /* Candidates are detection work that has not yet been accepted. Excluding
     them would show an empty first stage while triage is outstanding. */
  counts.detect += H.CANDIDATES.length;
  /* Released interventions inside their measurement window are Verify work
     even though the case file is no longer being edited. */
  counts.verify += H.VERIFYING.length;
  return counts;
}

function operatingRail(workspace) {
  var phase = RAIL_PHASE.hasOwnProperty(workspace) ? RAIL_PHASE[workspace] : null;
  var counts = railStageCounts();
  var totalOpen = Q.openCases().length + H.CANDIDATES.length + H.VERIFYING.length;
  var verified = H.PORTFOLIO.savings.verifiedMWh;

  var stages = H.STAGES.map(function (s) {
    var n = counts[s.key];
    return '<a class="rail-stage' + (n ? '' : ' empty') + '" href="caseload.html?stage=' + s.key + '"' +
      ' title="' + esc(s.gate) + '">' +
      '<span class="rs-n">' + n + '</span>' +
      '<span class="rs-l">' + esc(s.label) + '</span></a>';
  }).join('<span class="rail-tick"></span>');

  return '<div class="rail">' +

    '<a class="rail-phase' + (phase === 'measure' ? ' on' : '') + '" href="overview.html">' +
      '<span class="rp-k">Measure</span>' +
      '<span class="rp-v">' + H.net.UNITS.length + ' units \u00b7 ' + H.NETWORK.lines.length + ' lines</span>' +
    '</a>' +

    '<span class="rail-flow"></span>' +

    '<div class="rail-spine' + (phase === 'spine' ? ' on' : '') + '">' +
      '<span class="rail-spine-k">Case spine' +
        '<span class="rsk-n">' + totalOpen + ' in flight</span></span>' +
      '<div class="rail-stages">' + stages + '</div>' +
    '</div>' +

    '<span class="rail-flow"></span>' +

    '<a class="rail-phase' + (phase === 'result' ? ' on' : '') + '" href="ledger.html">' +
      '<span class="rp-k">Verified</span>' +
      '<span class="rp-v">' + H.charts.fmtInt(verified) + ' MWh this year</span>' +
    '</a>' +

  '</div>';
}

/* ------------------------------------------------------- role handover

   The product's argument is that a case changes hands. A role switch is
   therefore a handover, not a preference change, so the destination states
   what has just been passed and what this desk is accountable for. */

var HANDOVER_KEY = 'hmax.handover';

function stashHandover(from, to) {
  if (!window.localStorage || from === to) return;
  try {
    localStorage.setItem(HANDOVER_KEY, from + '|' + to + '|' + (new Date()).getTime());
  } catch (e) {}
}

/* What this desk is accountable for, derived from grants rather than written
   per role, so a new role configured by an operator describes itself. */
function deskHolds(roleId) {
  var g = H.ROLES[roleId].grants || {};
  var parts = [];

  var owned = (g.own && g.own.stages) || [];
  if (owned.length) {
    var labels = owned.map(function (k) {
      for (var i = 0; i < H.STAGES.length; i++) if (H.STAGES[i].key === k) return H.STAGES[i].label;
      return k;
    });
    parts.push('Owns ' + labels.join(' and '));
  }

  var dom = (g.verdict && g.verdict.domains) || [];
  if (dom.length) parts.push('rules on ' + dom.join(' and ') + ' cause');

  /* A no-cost change spends nothing, so it is an authority to approve rather
     than a currency — listing it alongside time reads as a contradiction. */
  var curr = ((g.approve && g.approve.currencies) || []).filter(function (k) { return k !== 'none'; });
  var hasNone = ((g.approve && g.approve.currencies) || []).indexOf('none') > -1;

  if (curr.length) {
    parts.push('approves changes that spend ' +
      curr.map(function (k) { return (H.CURRENCIES[k] ? H.CURRENCIES[k].label : k).toLowerCase(); }).join(' or '));
  } else if (hasNone) {
    parts.push('approves no-cost changes only');
  } else {
    parts.push('holds no approval authority');
  }

  var s = parts.join(', ') + '.';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function handoverStrip(roleId) {
  if (!window.localStorage) return '';
  var raw;
  try { raw = localStorage.getItem(HANDOVER_KEY); } catch (e) { return ''; }
  if (!raw) return '';
  try { localStorage.removeItem(HANDOVER_KEY); } catch (e) {}

  var bits = raw.split('|');
  var from = H.ROLES[bits[0]], to = bits[1], at = parseInt(bits[2], 10);
  if (!from || to !== roleId) return '';
  /* Only narrate a switch the viewer just made, never a stale one. */
  if (!at || (new Date()).getTime() - at > 60000) return '';

  var role = H.ROLES[roleId];
  var gates = Q.gatesFor(roleId);
  var waiting = Q.attentionFor(roleId);

  var line;
  if (gates.length) {
    var c = gates[0];
    line = gates.length + ' ' + (c.awaiting.what === 'verdict' ? 'verdict' : 'approval') +
      (gates.length > 1 ? 's are' : ' is') + ' waiting on this desk, starting with ' +
      '<a href="case.html?id=' + esc(c.id) + '">' + esc(c.id) + '</a> \u2014 ' + esc(c.title) + '.';
  } else if (waiting.length) {
    line = waiting.length + ' item' + (waiting.length > 1 ? 's require' : ' requires') +
      ' this role before their cases can move.';
  } else {
    line = 'Nothing is currently waiting on this desk.';
  }

  return '<div class="handover-strip" id="handoverStrip">' +
    '<div class="hs-chain">' +
      '<span class="hs-who">' +
        '<span class="hs-av" style="background:' + from.soft + ';color:' + from.color + '">' +
          esc(from.initials) + '</span>' +
        '<span class="hs-nm">' + esc(from.person) + '<em>' + esc(from.short) + '</em></span>' +
      '</span>' +
      '<span class="hs-arrow">handed to</span>' +
      '<span class="hs-who">' +
        '<span class="hs-av" style="background:' + role.soft + ';color:' + role.color + '">' +
          esc(role.initials) + '</span>' +
        '<span class="hs-nm">' + esc(role.person) + '<em>' + esc(role.short) + '</em></span>' +
      '</span>' +
    '</div>' +
    '<div class="hs-body">' +
      '<div class="hs-holds">' + esc(deskHolds(roleId)) + '</div>' +
      '<div class="hs-line">' + line + '</div>' +
    '</div>' +
    '<button class="hs-x" id="handoverClose" aria-label="Dismiss">\u00d7</button>' +
  '</div>';
}

/* ---------------------------------------------------------------- mount */

function mount(opts) {
  opts = opts || {};
  var sess = H.session.get();
  var roleId = sess.role;
  var role = H.ROLES[roleId];

  /* Absence over disabled: a workspace outside the role's grant is not
     reachable, so a role can never land on a screen it has no business in. */
  if (opts.workspace && opts.workspace !== 'case' && role.nav.indexOf(opts.workspace) === -1) {
    location.replace(role.home);
    return null;
  }

  var depth = sess.depth || role.depth;
  document.body.setAttribute('data-depth', depth);
  document.body.setAttribute('data-role', roleId);

  var sb = document.getElementById('sidebar');
  var tb = document.getElementById('topbar');
  if (sb) sb.innerHTML = sidebar(roleId, opts.workspace);
  if (tb) tb.innerHTML = topbar(opts, roleId, depth) + handoverStrip(roleId);

  var dc = document.getElementById('depthControl');
  if (dc) {
    dc.addEventListener('click', function (e) {
      var b = e.target;
      while (b && b !== dc && b.tagName !== 'BUTTON') b = b.parentNode;
      if (!b || b === dc) return;
      var d = b.getAttribute('data-depth');
      document.body.setAttribute('data-depth', d);
      H.session.setDepth(d);
      var all = dc.getElementsByTagName('button');
      for (var i = 0; i < all.length; i++) all[i].className = '';
      b.className = 'active';
      if (opts.onDepth) opts.onDepth(d);
    });
  }

  var sbtn = document.getElementById('smartBtn'), spanel = document.getElementById('smartPanel');
  if (sbtn && spanel) {
    sbtn.addEventListener('click', function (e) {
      e.stopPropagation();
      spanel.style.display = spanel.style.display === 'block' ? 'none' : 'block';
    });
    spanel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { spanel.style.display = 'none'; });
  }

  var hx = document.getElementById('handoverClose');
  if (hx) {
    hx.addEventListener('click', function () {
      var s = document.getElementById('handoverStrip');
      if (s && s.parentNode) s.parentNode.removeChild(s);
    });
  }

  var ab = document.getElementById('attentionBtn'), ap = document.getElementById('attentionPanel');
  if (ab && ap) {
    ab.addEventListener('click', function (e) {
      e.stopPropagation();
      ap.style.display = ap.style.display === 'block' ? 'none' : 'block';
    });
    ap.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { ap.style.display = 'none'; });
  }

  var rs = document.getElementById('roleSwitch'), rm = document.getElementById('roleMenu');
  if (rs && rm) {
    rs.addEventListener('click', function (e) {
      e.stopPropagation();
      var t = e.target, item = null;
      while (t && t !== rs) {
        if (t.className && String(t.className).indexOf('rmp-item') > -1) { item = t; break; }
        t = t.parentNode;
      }
      if (item) {
        var next = item.getAttribute('data-role');
        stashHandover(roleId, next);
        H.session.setRole(next);
        var onCase = location.pathname.indexOf('case.html') > -1;
        location.href = onCase ? 'case.html' + location.search : H.ROLES[next].home;
        return;
      }
      rm.style.display = rm.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', function () { rm.style.display = 'none'; });
  }

  wireSearch();
  return { role: role, roleId: roleId, depth: depth };
}

/* Convenience: the id in the query string, defaulting to the spine case. */
function param(name, fallback) {
  var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
  return m ? decodeURIComponent(m[1]) : fallback;
}

global.HMAX.shell = { mount: mount, sidebar: sidebar, topbar: topbar, param: param, ICONS: ICONS };

})(typeof window !== 'undefined' ? window : globalThis);
