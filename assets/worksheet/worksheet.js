/* Zero Fluff Guides worksheet template.
 *
 * Every book's page (/tools/<short-name>) is one small HTML file holding its content as JSON in
 * <script type="application/json" id="zfg-book">. This script builds the page from it.
 *
 * Privacy: answers are saved only in this browser (localStorage). Nothing is sent anywhere.
 * Written as plain ES5 so it also runs in older e-reader browsers.
 */
(function () {
  'use strict';

  /* ---------- payoff math (also used by tests via window.ZFGWorksheet) ---------- */

  function num(v) {
    if (v === null || v === undefined) return NaN;
    var s = String(v).replace(/[$,%\s]/g, '');
    return s === '' ? NaN : parseFloat(s);
  }

  // Usable debts: positive balance and minimum; rate defaults to 0.
  function cleanDebts(debts) {
    var out = [];
    for (var i = 0; i < (debts || []).length; i++) {
      var d = debts[i], bal = num(d.balance), min = num(d.min), rate = num(d.rate);
      if (bal > 0 && min > 0) out.push({ id: d.id, name: d.name || ('Debt ' + (i + 1)), balance: bal, rate: rate > 0 ? rate : 0, min: min });
    }
    return out;
  }

  // Smallest balance first; ties go to the higher rate.
  function snowballOrder(ds) {
    return ds.slice().sort(function (a, b) { return a.balance - b.balance || b.rate - a.rate; });
  }
  // Highest rate first; ties go to the smaller balance.
  function avalancheOrder(ds) {
    return ds.slice().sort(function (a, b) { return b.rate - a.rate || a.balance - b.balance; });
  }
  // Debts picked for the top move up (in balance order); the rest stay in balance order.
  function hybridOrder(ds, picks) {
    var s = snowballOrder(ds), top = [], rest = [];
    for (var i = 0; i < s.length; i++) (picks && picks[s[i].id] ? top : rest).push(s[i]);
    return top.concat(rest);
  }
  function orderFor(method, ds, picks) {
    if (method === 'avalanche') return avalancheOrder(ds);
    if (method === 'hybrid') return hybridOrder(ds, picks);
    return snowballOrder(ds);
  }

  /* Month-by-month payoff. Each month: interest is added, every debt gets its (fixed) minimum,
   * and with rollover the rest of the fixed monthly total (all starting minimums + extra) goes to
   * the first unpaid debt in `order`, so money freed by a paid-off debt rolls on the same month.
   * Without rollover (baseline) each debt just gets its own minimum. */
  function simulate(order, extra, rollover, cap) {
    cap = cap || 600;
    var n = order.length, bal = [], cleared = [], interest = 0, paid = 0, budget = extra || 0, i, m;
    for (i = 0; i < n; i++) { bal.push(order[i].balance); cleared.push(null); budget += order[i].min; }
    for (m = 1; m <= cap; m++) {
      for (i = 0; i < n; i++) if (bal[i] > 0.005) { var it = bal[i] * order[i].rate / 1200; bal[i] += it; interest += it; }
      var pool = budget;
      for (i = 0; i < n; i++) if (bal[i] > 0.005) { var p = Math.min(order[i].min, bal[i]); bal[i] -= p; pool -= p; paid += p; }
      if (rollover) for (i = 0; i < n && pool > 0.005; i++) if (bal[i] > 0.005) { var q = Math.min(pool, bal[i]); bal[i] -= q; pool -= q; paid += q; }
      var done = true;
      for (i = 0; i < n; i++) { if (cleared[i] === null && bal[i] <= 0.005) cleared[i] = m; if (cleared[i] === null) done = false; }
      if (done) return { months: m, cleared: cleared, interest: interest, paid: paid, budget: budget };
    }
    return { months: null, cleared: cleared, interest: interest, paid: paid, budget: budget };
  }

  /* ---------- formatting ---------- */

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function money(v, cents) {
    if (!(v === v) || v === null) return '';
    var neg = v < 0, x = Math.abs(v), s = cents ? x.toFixed(2) : Math.round(x).toString(), parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-$' : '$') + parts.join('.');
  }
  function moneyIn(v) { var x = num(v); return x === x ? money(x, x % 1 !== 0) : ''; }
  function pct(v) { var x = num(v); return x === x ? (Math.round(x * 100) / 100) + '%' : ''; }
  function addMonths(start, k) { var t = start.y * 12 + start.m + k; return { y: Math.floor(t / 12), m: t % 12 }; }
  function monthLabel(ym) { return MONTHS[ym.m] + ' ' + ym.y; }
  function shortMonth(ym) { return MONTHS[ym.m].slice(0, 3) + ' ' + ym.y; }
  function dateLabel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : '';
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function duration(m) {
    if (m === null) return 'more than 50 years';
    var y = Math.floor(m / 12), r = m % 12;
    return plural(m, 'month') + (y ? ' (' + (y ? plural(y, 'year') : '') + (r ? ', ' + plural(r, 'month') : '') + ')' : '');
  }

  window.ZFGWorksheet = { num: num, cleanDebts: cleanDebts, snowballOrder: snowballOrder, avalancheOrder: avalancheOrder,
    hybridOrder: hybridOrder, orderFor: orderFor, simulate: simulate, money: money, addMonths: addMonths, monthLabel: monthLabel };

  var bookEl = document.getElementById('zfg-book');
  if (!bookEl) return;
  var BOOK = JSON.parse(bookEl.textContent);

  /* ---------- storage (this device only) ---------- */

  var KEY = 'zfg-worksheet:' + BOOK.slug, state = {}, canStore = true, saveTimer = null;
  try { state = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { state = {}; canStore = false; }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { window.localStorage.setItem(KEY, JSON.stringify(state)); setSaved('Saved on this device'); }
      catch (e) { canStore = false; setSaved('Your browser is not saving answers. Use Download to keep them.'); }
    }, 250);
  }
  var savedEl;
  function setSaved(t) { if (savedEl) savedEl.textContent = t; }

  var today = new Date();
  // iPhone/iPad (iPadOS reports itself as a Mac, so also check for touch)
  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var THIS_MONTH = { y: today.getFullYear(), m: today.getMonth() };

  /* ---------- DOM helper ---------- */

  function h(tag, attrs, kids) {
    var el = document.createElement(tag), k;
    for (k in (attrs || {})) {
      if (!attrs.hasOwnProperty(k) || attrs[k] === null || attrs[k] === undefined || attrs[k] === false) continue;
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'value') el.value = attrs[k];
      else if (k === 'checked') el.checked = !!attrs[k];
      else el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    kids = kids === undefined ? [] : [].concat(kids);
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] === null || kids[i] === undefined || kids[i] === false) continue;
      el.appendChild(typeof kids[i] === 'string' ? document.createTextNode(kids[i]) : kids[i]);
    }
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /* ---------- field definitions ---------- */

  var uid = 0;
  function newId() { uid++; return 'd' + new Date().getTime().toString(36) + uid; }

  // A new reader starts with one empty debt row and nothing else filled in (examples show only as faint placeholders).
  function applyDefaults() {
    eachField(function (f) {
      if (!f.key || state[f.key] !== undefined) return;
      if (f.type === 'debts') state[f.key] = [{ id: newId(), name: '', balance: '', rate: '', min: '' }];
    });
  }
  function eachField(fn) {
    for (var i = 0; i < BOOK.sections.length; i++)
      for (var j = 0; j < (BOOK.sections[i].fields || []).length; j++) fn(BOOK.sections[i].fields[j], BOOK.sections[i]);
  }
  function findField(type) { var r = null; eachField(function (f) { if (!r && f.type === type) r = f; }); return r; }

  // Shared values the finance widgets read.
  function debtKey() { var f = findField('debts'); return f ? f.key : 'debts'; }
  function cfg(name, fallback) { return (BOOK.keys && BOOK.keys[name]) || fallback; }
  function startMonth() {
    var v = String(state[cfg('start', 'startMonth')] || ''), m = /^(\d{4})-(\d{1,2})$/.exec(v);
    return m ? { y: +m[1], m: +m[2] - 1 } : THIS_MONTH;
  }
  function method() { return state[cfg('method', 'method')] || 'snowball'; }
  function debtsWithRateChange() {
    var ds = cleanDebts(state[debtKey()]), which = state[cfg('rateDebt', 'lenderDebt')], res = state[cfg('rateResult', 'lenderResult')],
        rate = num(state[cfg('newRate', 'newRate')]);
    if (which && res === cfg('rateLoweredValue', 'lowered') && rate >= 0)
      for (var i = 0; i < ds.length; i++) if (ds[i].id === which) ds[i] = { id: ds[i].id, name: ds[i].name, balance: ds[i].balance, rate: rate, min: ds[i].min, changed: true };
    return ds;
  }
  function plan() {
    var ds = debtsWithRateChange(), extra = num(state[cfg('extra', 'extra')]);
    if (!ds.length) return { ok: false, reason: 'Add at least one debt with a balance and a minimum payment in Chapter 1.' };
    var order = orderFor(method(), ds, state[cfg('picks', 'hybridTop')]);
    var base = simulate(snowballOrder(cleanDebts(state[debtKey()])), 0, false);
    var run = simulate(order, extra > 0 ? extra : 0, true);
    return { ok: true, debts: ds, order: order, extra: extra > 0 ? extra : 0, hasExtra: extra > 0, run: run, base: base, start: startMonth() };
  }

  /* ---------- widgets ---------- */

  var refreshers = [];          // computed parts that redraw when answers change
  function onChange() { save(); for (var i = 0; i < refreshers.length; i++) refreshers[i](); }
  function live(build) { var box = h('div'); function draw() { clear(box); var c = build(); if (c) box.appendChild(c); } refreshers.push(draw); draw(); return box; }

  function fieldWrap(f, input, forId) {
    return h('div', { 'class': 'ws-field' + (f.narrow ? ' narrow' : '') }, [
      f.label ? h('label', { 'for': forId, text: f.label }) : null, input, f.help ? h('p', { 'class': 'ws-help', text: f.help }) : null]);
  }
  function textInput(f, kind) {
    var id = 'f-' + f.key, attrs = { id: id, type: 'text', value: state[f.key] || '', autocomplete: 'off',
      oninput: function (e) { state[f.key] = e.target.value; onChange(); } };
    if (f.placeholder) attrs.placeholder = f.placeholder;
    if (kind === 'money' || kind === 'pct' || kind === 'number') attrs.inputmode = 'decimal';
    var input = h('input', attrs);
    if (kind === 'money') input = h('span', { 'class': 'money' }, input);
    if (kind === 'pct') input = h('span', { 'class': 'pct' }, input);
    return fieldWrap(f, input, id);
  }

  var W = {};
  W.text = function (f) { return textInput(f, 'text'); };
  W.money = function (f) { return textInput(f, 'money'); };
  W.percent = function (f) { return textInput(f, 'pct'); };
  W.number = function (f) { return textInput(f, 'number'); };
  W.textarea = function (f) {
    var id = 'f-' + f.key;
    return fieldWrap(f, h('textarea', { id: id, rows: f.rows || 2, value: state[f.key] || '', placeholder: f.placeholder,
      oninput: function (e) { state[f.key] = e.target.value; onChange(); } }), id);
  };
  W.date = function (f) {
    var id = 'f-' + f.key;
    return fieldWrap(f, h('input', { id: id, type: 'date', value: state[f.key] || '', 'class': 'narrow',
      onchange: function (e) { state[f.key] = e.target.value; onChange(); }, oninput: function (e) { state[f.key] = e.target.value; onChange(); } }), id);
  };
  W.checkbox = function (f) {
    return h('div', { 'class': 'ws-field' }, h('label', { 'class': 'check' }, [
      h('input', { type: 'checkbox', checked: !!state[f.key], onchange: function (e) { state[f.key] = e.target.checked; onChange(); } }),
      h('span', { text: f.label })]));
  };
  W.choice = function (f) {
    var box = h('div', { 'class': 'choices', role: 'radiogroup' }), items = [];
    function mark() { for (var i = 0; i < items.length; i++) items[i].className = 'choice' + (items[i].firstChild.checked ? ' on' : ''); }
    for (var i = 0; i < f.options.length; i++) (function (o) {
      var item = h('label', { 'class': 'choice' }, [
        h('input', { type: 'radio', name: 'f-' + f.key, value: o.value, checked: state[f.key] === o.value,
          onchange: function () { state[f.key] = o.value; mark(); onChange(); } }),
        h('span', null, [h('b', { text: o.label }), o.hint ? h('span', { text: o.hint }) : null])]);
      items.push(item); box.appendChild(item);
    })(f.options[i]);
    mark();
    return h('div', { 'class': 'ws-field' }, [f.label ? h('span', { 'class': 'ws-flabel', text: f.label }) : null, box]);
  };
  function selectEl(id, options, value, onchange) {
    var s = h('select', { id: id, onchange: onchange });
    for (var i = 0; i < options.length; i++) s.appendChild(h('option', { value: options[i][0], text: options[i][1] }));
    s.value = value === undefined || value === null ? '' : String(value);
    return s;
  }
  W.select = function (f) {
    var opts = [['', f.placeholder || 'Choose one']].concat(f.options.map(function (o) { return [o.value, o.label]; }));
    return fieldWrap(f, selectEl('f-' + f.key, opts, state[f.key], function (e) { state[f.key] = e.target.value; onChange(); }), 'f-' + f.key);
  };
  W.dayOfMonth = function (f) {
    var opts = [['', 'Choose a day']];
    for (var d = 1; d <= 28; d++) opts.push([String(d), 'The ' + ordinal(d)]);
    opts.push(['last', 'The last day of the month']);
    var w = fieldWrap(f, selectEl('f-' + f.key, opts, state[f.key], function (e) { state[f.key] = e.target.value; onChange(); }), 'f-' + f.key);
    w.className += ' narrow';
    return w;
  };
  W.monthYear = function (f) {
    var m = /^(\d{4})-(\d{1,2})$/.exec(String(state[f.key] || '')), mOpts = [['', 'Month']], yOpts = [['', 'Year']];
    for (var i = 0; i < 12; i++) mOpts.push([String(i + 1), MONTHS[i]]);
    for (var y = THIS_MONTH.y - 1; y <= THIS_MONTH.y + 5; y++) yOpts.push([String(y), String(y)]);
    var ms, ys;
    function set() { state[f.key] = ms.value && ys.value ? ys.value + '-' + ms.value : ''; onChange(); }
    ms = selectEl('f-' + f.key, mOpts, m ? +m[2] : '', set); ys = selectEl('f-' + f.key + '-y', yOpts, m ? m[1] : '', set);
    ys.setAttribute('aria-label', 'Year');
    return fieldWrap(f, h('div', { 'class': 'row2 narrow', style: 'max-width:340px' }, [ms, ys]), 'f-' + f.key);
  };
  W.list = function (f) {
    var box = h('div');
    var vals = state[f.key] || [];
    for (var i = 0; i < (f.count || vals.length); i++) (function (i) {
      var id = 'f-' + f.key + '-' + i;
      box.appendChild(h('div', { 'class': 'ws-field' }, [
        h('label', { 'for': id, text: (f.itemLabel || 'Item') + ' ' + (i + 1) + (f.itemTitles && f.itemTitles[i] ? ': ' + f.itemTitles[i] : '') }),
        h('textarea', { id: id, rows: 2, value: vals[i] || '', placeholder: (f.placeholders || [])[i] || null, oninput: function (e) { var v = (state[f.key] || []).slice(); v[i] = e.target.value; state[f.key] = v; onChange(); } })]));
    })(i);
    return h('div', null, [f.label ? h('p', { 'class': 'ws-note', text: f.label }) : null, box]);
  };
  W.note = function (f) { return h('p', { 'class': 'ws-note', text: f.text }); };

  // Chapter 1: the debt list.
  W.debts = function (f) {
    var box = h('div', { 'class': 'debts' }), wrap = h('div'), ph = f.placeholders || {};
    function row(d, i) {
      function inp(k, label, kind, ph) {
        var id = 'f-' + d.id + '-' + k, a = { id: id, type: 'text', value: d[k] || '', autocomplete: 'off', placeholder: ph || null,
          oninput: function (e) { d[k] = e.target.value; onChange(); } };
        if (kind) a.inputmode = 'decimal';
        var el = h('input', a);
        if (kind === 'money') el = h('span', { 'class': 'money' }, el);
        if (kind === 'pct') el = h('span', { 'class': 'pct' }, el);
        return h('div', { 'class': 'ws-field' }, [h('label', { 'for': id, text: label }), el]);
      }
      return h('div', { 'class': 'debt' }, [
        h('div', { 'class': 'debt-top' }, [inp('name', 'Debt ' + (i + 1) + ' name', null, ph.name),
          h('button', { type: 'button', 'class': 'remove', 'aria-label': 'Remove debt ' + (i + 1), text: 'Remove', onclick: function () {
            var list = state[f.key];
            if ((d.name || d.balance || d.rate || d.min) && !window.confirm('Remove ' + (d.name || 'this debt') + '?')) return;
            list.splice(list.indexOf(d), 1);
            if (!list.length) list.push({ id: newId(), name: '', balance: '', rate: '', min: '' });
            draw(); onChange();
          } })]),
        h('div', { 'class': 'debt-grid' }, [inp('balance', 'Balance', 'money', ph.balance), inp('rate', 'Interest rate', 'pct', ph.rate), inp('min', 'Minimum payment', 'money', ph.min)])]);
    }
    function draw() {
      clear(box);
      var list = state[f.key];
      for (var i = 0; i < list.length; i++) box.appendChild(row(list[i], i));
    }
    draw();
    wrap.appendChild(box);
    wrap.appendChild(h('div', { style: 'margin-top:12px' }, h('button', { type: 'button', 'class': 'btn secondary small', text: '+ Add a debt', onclick: function () {
      state[f.key].push({ id: newId(), name: '', balance: '', rate: '', min: '' }); draw(); onChange();
      var inputs = box.querySelectorAll('input'); if (inputs.length >= 4) inputs[inputs.length - 4].focus();
    } })));
    wrap.appendChild(live(function () {
      var ds = cleanDebts(state[f.key]), tb = 0, tm = 0;
      for (var i = 0; i < ds.length; i++) { tb += ds[i].balance; tm += ds[i].min; }
      return h('div', { 'class': 'totals' }, [h('span', null, ['Total owed: ', h('b', { text: money(tb) })]),
        h('span', null, ['Total minimums: ', h('b', { text: money(tm) + ' a month' })])]);
    }));
    return wrap;
  };

  function debtTable(order, withMonths, run, start) {
    var head = [h('th', { text: '#' }), h('th', { text: 'Debt' }), h('th', { 'class': 'n', text: 'Balance' }), h('th', { 'class': 'n hide-sm', text: 'Rate' }),
      h('th', { 'class': 'n' + (withMonths ? ' hide-sm' : ''), text: 'Minimum' })];
    if (withMonths) head.push(h('th', { 'class': 'n', text: 'Paid off' }));
    var t = h('table', { 'class': 'tbl' }, [h('thead', null, h('tr', null, head))]), tb = h('tbody');
    for (var i = 0; i < order.length; i++) {
      var d = order[i], cells = [h('td', { 'class': 'rank', text: String(i + 1) }), h('td', { text: d.name }), h('td', { 'class': 'n', text: money(d.balance) }),
        h('td', { 'class': 'n hide-sm', text: pct(d.rate) + (d.changed ? ' (new)' : '') }), h('td', { 'class': 'n' + (withMonths ? ' hide-sm' : ''), text: money(d.min) })];
      if (withMonths) cells.push(h('td', { 'class': 'n', text: run.cleared[i] ? shortMonth(addMonths(start, run.cleared[i] - 1)) : '—' }));
      tb.appendChild(h('tr', null, cells));
    }
    t.appendChild(tb);
    return t;
  }

  // Chapter 2: same debts, smallest to largest.
  W.debtsSorted = function (f) {
    return live(function () {
      var ds = cleanDebts(state[debtKey()]);
      if (!ds.length) return h('p', { 'class': 'empty', text: 'Your debts appear here in order once you fill in Chapter 1.' });
      var order = f.order === 'method' ? orderFor(method(), ds, state[cfg('picks', 'hybridTop')]) : snowballOrder(ds);
      return h('div', { 'class': 'ws-sorted' }, [f.label ? h('span', { 'class': 'ws-flabel', text: typeof f.label === 'string' ? f.label.replace('{method}', methodName()) : '' }) : null, debtTable(order)]);
    });
  };
  function methodName() {
    var f = findField('choice') , m = method();
    eachField(function (x) { if (x.key === cfg('method', 'method')) f = x; });
    for (var i = 0; f && i < f.options.length; i++) if (f.options[i].value === m) return f.options[i].label;
    return m;
  }

  // Chapter 3 (hybrid): which debts move to the top.
  W.hybridPicks = function (f) {
    return live(function () {
      var ds = snowballOrder(cleanDebts(state[debtKey()]));
      if (!ds.length) return h('p', { 'class': 'empty', text: 'Fill in your debts in Chapter 1 first.' });
      var picks = state[f.key] || {}, box = h('div', { 'class': 'ws-field' }, [h('span', { 'class': 'ws-flabel', text: f.label })]);
      for (var i = 0; i < ds.length; i++) (function (d) {
        box.appendChild(h('label', { 'class': 'check' }, [h('input', { type: 'checkbox', checked: !!picks[d.id], onchange: function (e) {
          var p = state[f.key] || {}; if (e.target.checked) p[d.id] = true; else delete p[d.id]; state[f.key] = p; onChange(); } }),
          h('span', { text: d.name + ' (' + money(d.balance) + ' at ' + pct(d.rate) + ')' })]));
      })(ds[i]);
      if (f.help) box.appendChild(h('p', { 'class': 'ws-help', text: f.help }));
      return box;
    });
  };

  // Chapter 9: pick one of the debts.
  W.debtSelect = function (f) {
    var id = 'f-' + f.key;
    return live(function () {
      var ds = cleanDebts(state[debtKey()]), opts = [['', ds.length ? 'Choose the debt' : 'Add your debts in Chapter 1 first']];
      for (var i = 0; i < ds.length; i++) opts.push([ds[i].id, ds[i].name + ' (' + pct(ds[i].rate) + ')']);
      return fieldWrap(f, selectEl(id, opts, state[f.key], function (e) { state[f.key] = e.target.value; onChange(); }), id);
    });
  };

  // Chapter 4: payoff date paying only the minimums.
  W.baseline = function (f) {
    return live(function () {
      var ds = snowballOrder(cleanDebts(state[debtKey()]));
      if (!ds.length) return h('p', { 'class': 'empty', text: 'Your baseline appears here once you fill in Chapter 1.' });
      var r = simulate(ds, 0, false), start = startMonth(), stuck = [];
      for (var i = 0; i < ds.length; i++) if (r.cleared[i] === null) stuck.push(ds[i].name);
      var box = h('div');
      box.appendChild(h('div', { 'class': 'big' }, [h('div', { 'class': 'k', text: 'Baseline payoff date (minimums only)' }),
        h('div', { 'class': 'v', text: r.months ? monthLabel(addMonths(start, r.months - 1)) : 'Never, at these minimums' }),
        h('div', { 'class': 's', text: r.months ? duration(r.months) + ' from ' + monthLabel(start) + '. Interest along the way: about ' + money(r.interest) + '.' :
          'At least one minimum doesn\'t cover the interest, so that balance never shrinks.' })]));
      if (stuck.length) box.appendChild(h('p', { 'class': 'warn', text: 'Never paid off at its minimum: ' + stuck.join(', ') + '. Check the rate and minimum, or plan extra for it.' }));
      if (f.help) box.appendChild(h('p', { 'class': 'ws-help', text: f.help }));
      return box;
    });
  };

  // Chapter 5: total going to debt each month.
  W.monthlyTotal = function (f) {
    return live(function () {
      var ds = cleanDebts(state[debtKey()]), mins = 0, extra = num(state[cfg('extra', 'extra')]);
      for (var i = 0; i < ds.length; i++) mins += ds[i].min;
      if (!(extra > 0)) return null;
      return h('div', { 'class': 'big' }, [h('div', { 'class': 'k', text: f.label || 'Total going to debt every month' }),
        h('div', { 'class': 'v', text: money(mins + extra) }),
        h('div', { 'class': 's', text: money(mins) + ' in minimums + ' + moneyIn(extra) + ' extra. This number stays the same until the last debt is gone.' })]);
    });
  };

  // Chapter 6: progress toward a savings goal.
  W.goalProgress = function (f) {
    return live(function () {
      var saved = num(state[f.savedKey]), per = num(state[f.perMonthKey]), goal = f.goal;
      saved = saved > 0 ? saved : 0;
      var pctDone = Math.min(100, Math.round(saved / goal * 100)), left = Math.max(0, goal - saved);
      var s = left <= 0 ? 'Goal reached.' : money(left) + ' to go' + (per > 0 ? ': about ' + plural(Math.ceil(left / per), 'month') + ' at ' + moneyIn(per) + ' a month.' : '.');
      return h('div', { 'class': 'ws-field' }, [h('span', { 'class': 'ws-flabel', text: (f.label || 'Progress') + ': ' + money(saved) + ' of ' + money(goal) + ' (' + pctDone + '%)' }),
        h('div', { 'class': 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(Math.round(saved)) }, h('i', { style: 'width:' + pctDone + '%' })),
        h('p', { 'class': 'ws-help', text: s })]);
    });
  };

  // Conclusion: projected debt-free date with the extra payment.
  function projectionView(p, f) {
    var box = h('div');
    if (!p.ok) { box.appendChild(h('p', { 'class': 'empty', text: p.reason })); return box; }
    var r = p.run, b = p.base, start = p.start;
    if (!p.hasExtra) box.appendChild(h('p', { 'class': 'warn', text: 'No extra payment yet. Add it in Chapter 5 to see how much sooner you finish.' }));
    box.appendChild(h('div', { 'class': 'big' }, [h('div', { 'class': 'k', text: 'Projected debt-free date' }),
      h('div', { 'class': 'v', text: r.months ? monthLabel(addMonths(start, r.months - 1)) : 'Not within 50 years' }),
      h('div', { 'class': 's', text: r.months ? duration(r.months) + ' from ' + monthLabel(start) + ', paying ' + money(r.budget) + ' a month (' + methodName().toLowerCase() + ' order).' :
        'The monthly total doesn\'t cover the interest. Raise the extra payment in Chapter 5.' })]));
    if (r.months) {
      var stats = h('div', { 'class': 'stats' });
      function stat(k, v) { stats.appendChild(h('div', { 'class': 'stat' }, [h('div', { 'class': 'k', text: k }), h('div', { 'class': 'v', text: v })])); }
      stat('Interest with your plan', money(r.interest));
      stat('Minimums only', b.months ? monthLabel(addMonths(start, b.months - 1)) : 'Never');
      if (b.months) { stat('Time saved', plural(Math.max(0, b.months - r.months), 'month')); stat('Interest saved', money(Math.max(0, b.interest - r.interest))); }
      box.appendChild(stats);
      box.appendChild(h('span', { 'class': 'ws-flabel', style: 'margin-top:16px', text: 'Payoff order' }));
      box.appendChild(debtTable(p.order, true, r, start));
      var last = addMonths(start, r.months - 1);
      if (f && f.reminderTitle) box.appendChild(h('div', { 'class': 'ws-step', style: 'margin-top:16px' }, [h('b', { text: f.reminderLabel || 'Your reminder: ' }),
        '"' + f.reminderTitle + '" in ' + monthLabel(last) + ', moving ' + money(r.budget) + ' a month into savings.']));
      for (var i = 0; i < p.debts.length; i++) if (p.debts[i].changed) { box.appendChild(h('p', { 'class': 'ws-help', text: 'Uses the new ' + pct(p.debts[i].rate) + ' rate on ' + p.debts[i].name + ' from Chapter 9.' })); break; }
    }
    if (f && f.help) box.appendChild(h('p', { 'class': 'ws-help', text: f.help }));
    return box;
  }
  W.projection = function (f) { return live(function () { return projectionView(plan(), f); }); };

  /* ---------- answers as text (summary, print, download) ---------- */

  function shown(f) {
    if (!f.showIf) return true;
    for (var k in f.showIf) if (f.showIf.hasOwnProperty(k) && state[k] !== f.showIf[k]) return false;
    return true;
  }
  function answerRows(sec) {
    var rows = [];
    for (var i = 0; i < (sec.fields || []).length; i++) {
      var f = sec.fields[i], v = state[f.key], label = f.summary || f.label;
      if (!shown(f) || f.summary === false) continue;
      switch (f.type) {
        case 'debts': var ds = cleanDebts(v), tb = 0, tm = 0; for (var j = 0; j < ds.length; j++) { tb += ds[j].balance; tm += ds[j].min; }
          rows.push(['Debts', ds.length ? plural(ds.length, 'debt') + ', ' + money(tb) + ' owed, ' + money(tm) + ' a month in minimums' : '']); break;
        case 'debtsSorted': var s = (f.order === 'method' ? orderFor(method(), cleanDebts(state[debtKey()]), state[cfg('picks', 'hybridTop')]) : snowballOrder(cleanDebts(state[debtKey()])));
          rows.push([f.summary || 'Order', s.map(function (d) { return d.name; }).join(' → ')]); break;
        case 'hybridPicks': var ps = snowballOrder(cleanDebts(state[debtKey()])).filter(function (d) { return v && v[d.id]; });
          rows.push([label || 'Moved to the top', ps.map(function (d) { return d.name; }).join(', ')]); break;
        case 'baseline': var ds2 = snowballOrder(cleanDebts(state[debtKey()]));
          if (ds2.length) { var b = simulate(ds2, 0, false); rows.push(['Baseline payoff date', b.months ? monthLabel(addMonths(startMonth(), b.months - 1)) : 'Never, at these minimums']); } break;
        case 'monthlyTotal': case 'note': case 'projection': case 'goalProgress': break;
        case 'money': rows.push([label, moneyIn(v)]); break;
        case 'percent': rows.push([label, pct(v)]); break;
        case 'checkbox': rows.push([label, v ? 'Yes' : 'Not yet']); break;
        case 'date': rows.push([label, dateLabel(v)]); break;
        case 'monthYear': rows.push([label, v ? monthLabel(startMonth()) : 'Not set (using ' + monthLabel(THIS_MONTH) + ')']); break;
        case 'dayOfMonth': rows.push([label, v === 'last' ? 'The last day of each month' : v ? 'The ' + ordinal(+v) + ' of each month' : '']); break;
        case 'choice': case 'select': var o = (f.options || []).filter(function (x) { return x.value === v; })[0]; rows.push([label, o ? o.label : '']); break;
        case 'debtSelect': var d3 = cleanDebts(state[debtKey()]).filter(function (x) { return x.id === v; })[0]; rows.push([label, d3 ? d3.name : '']); break;
        case 'list': for (var k = 0; k < (f.count || 0); k++) rows.push([(f.itemLabel || 'Item') + ' ' + (k + 1), (v || [])[k] || '']); break;
        default: rows.push([label, v ? String(v) : '']);
      }
      if (f.type === 'goalProgress') { var sv = num(state[f.savedKey]); rows.push([f.summary || 'Saved so far', money(sv > 0 ? sv : 0) + ' of ' + money(f.goal)]); }
    }
    return rows;
  }

  W.summary = function (f) {
    return live(function () {
      var box = h('div', { 'class': 'summary' });
      for (var i = 0; i < BOOK.sections.length; i++) {
        var sec = BOOK.sections[i]; if (sec.id === f.skip) continue;
        var rows = answerRows(sec), dl = h('dl');
        box.appendChild(h('h3', null, h('a', { href: '#' + sec.id }, [h('small', { text: sec.label }), sec.title])));
        for (var j = 0; j < rows.length; j++) { dl.appendChild(h('dt', { text: rows[j][0] })); dl.appendChild(h('dd', { text: rows[j][1] || '—' })); }
        box.appendChild(dl);
      }
      return box;
    });
  };

  function textExport() {
    var L = [], p = plan(), line = '------------------------------------------------------------';
    L.push(BOOK.title + ': Worksheets'); if (BOOK.subtitle) L.push(BOOK.subtitle); L.push('By ' + BOOK.author);
    L.push('Saved ' + monthLabel(THIS_MONTH).replace(/ \d+$/, '') + ' ' + today.getDate() + ', ' + today.getFullYear() + ' from zerofluffguides.com/tools/' + BOOK.slug, '');
    for (var i = 0; i < BOOK.sections.length; i++) {
      var sec = BOOK.sections[i];
      L.push(line, sec.label.toUpperCase() + ': ' + sec.title, 'Zero Fluff: ' + sec.step, '');
      var hasDebts = false;
      for (var j = 0; j < (sec.fields || []).length; j++) if (sec.fields[j].type === 'debts') hasDebts = true;
      if (hasDebts) {
        var ds = cleanDebts(state[debtKey()]);
        for (var k = 0; k < ds.length; k++) L.push('  ' + ds[k].name + ': ' + money(ds[k].balance) + ' at ' + pct(ds[k].rate) + ', minimum ' + money(ds[k].min));
      }
      if (sec.id === BOOK.planSection && p.ok) {
        L.push('  Projected debt-free date: ' + (p.run.months ? monthLabel(addMonths(p.start, p.run.months - 1)) + ', ' + duration(p.run.months) + ' from ' + monthLabel(p.start) : 'not within 50 years'));
        L.push('  Paying ' + money(p.run.budget) + ' a month. Interest with this plan: about ' + money(p.run.interest));
        for (var q = 0; q < p.order.length; q++) L.push('  ' + (q + 1) + '. ' + p.order[q].name + ': paid off ' + (p.run.cleared[q] ? monthLabel(addMonths(p.start, p.run.cleared[q] - 1)) : '-'));
      } else {
        var rows = answerRows(sec);
        for (var r = 0; r < rows.length; r++) if (!(hasDebts && rows[r][0] === 'Debts')) L.push('  ' + rows[r][0] + ': ' + (rows[r][1] || '-'));
      }
      L.push('');
    }
    L.push(line, 'Your answers are stored only in your own browser. This file is your copy.', '',
      'To continue on another device: open zerofluffguides.com/tools/' + BOOK.slug + ' there, tap "Load my answers" and choose this file.',
      'The line below holds your answers for that. Please leave it as it is.',
      DATA_TAG + JSON.stringify({ v: 1, slug: BOOK.slug, saved: today.toISOString().slice(0, 10), answers: state }));
    return L.join('\r\n');
  }

  var DATA_TAG = 'ZFG-WORKSHEET-DATA: ';
  // Accepts a file made by Download (the data line) or plain JSON of the same shape.
  function readSaved(text) {
    var i = text.indexOf(DATA_TAG), raw = i >= 0 ? text.slice(i + DATA_TAG.length).split(/\r?\n/)[0] : text, d;
    try { d = JSON.parse(raw); } catch (e) { return { error: 'This file doesn\'t contain saved worksheet answers. Choose the file you made with "Download my answers".' }; }
    if (!d || typeof d !== 'object' || !d.answers || typeof d.answers !== 'object') return { error: 'This file doesn\'t contain saved worksheet answers.' };
    if (d.slug !== BOOK.slug) return { error: 'This file holds answers for a different book\'s worksheet (' + d.slug + ').' };
    return { answers: d.answers, saved: d.saved };
  }
  function hasAnswers() {
    for (var k in state) if (state.hasOwnProperty(k)) {
      var v = state[k];
      if (k === debtKey()) { for (var i = 0; i < v.length; i++) if (v[i].name || v[i].balance || v[i].rate || v[i].min) return true; }
      else if (v && (typeof v !== 'object' || Object.keys(v).length)) return true;
    }
    return false;
  }
  function loadFile(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      var got = readSaved(String(r.result || ''));
      if (got.error) { window.alert(got.error); return; }
      if (hasAnswers() && !window.confirm('Replace the answers on this device with the ones in this file' + (got.saved ? ' (saved ' + dateLabel(got.saved) + ')' : '') + '?')) return;
      state = got.answers; applyDefaults();
      try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      renderMain(); buildPrint();
      setSaved('Loaded your answers' + (got.saved ? ' from ' + dateLabel(got.saved) : '') + (canStore ? '. They now save on this device.' : '.'));
    };
    r.onerror = function () { window.alert('That file couldn\'t be read. Try choosing it again.'); };
    r.readAsText(file);
  }

  function download() {
    var text = textExport(), name = BOOK.slug + '-worksheet.txt';
    try {
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      if (window.navigator.msSaveBlob) { window.navigator.msSaveBlob(blob, name); return; }
      var url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) {
      window.open('data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    }
  }

  function buildPrint() {
    var el = document.getElementById('ws-print'), p = plan();
    clear(el);
    el.appendChild(h('h1', { text: BOOK.title + ': Worksheets' }));
    el.appendChild(h('div', { 'class': 'p-sub', text: (BOOK.subtitle ? BOOK.subtitle + '. ' : '') + 'By ' + BOOK.author + '.' }));
    for (var i = 0; i < BOOK.sections.length; i++) {
      var sec = BOOK.sections[i], div = h('div', { 'class': 'p-sec' }, [h('div', { 'class': 'p-label', text: sec.label }), h('h2', { text: sec.title }),
        h('div', { 'class': 'p-step', text: 'Zero Fluff: ' + sec.step })]);
      var isDebts = false, isSorted = false;
      for (var j = 0; j < (sec.fields || []).length; j++) { if (sec.fields[j].type === 'debts') isDebts = true; if (sec.fields[j].type === 'debtsSorted') isSorted = sec.fields[j]; }
      if (sec.id === BOOK.planSection && p.ok) {
        var r = p.run;
        div.appendChild(h('p', { text: 'Projected debt-free date: ' + (r.months ? monthLabel(addMonths(p.start, r.months - 1)) + ', ' + duration(r.months) + ' from ' + monthLabel(p.start) + ', paying ' + money(r.budget) + ' a month. Interest: about ' + money(r.interest) + '.' : 'not within 50 years.') }));
        if (r.months) div.appendChild(printTable(p.order, function (d, q) { return r.cleared[q] ? monthLabel(addMonths(p.start, r.cleared[q] - 1)) : '-'; }, 'Paid off'));
      } else if (isDebts) {
        div.appendChild(printTable(cleanDebts(state[debtKey()])));
      } else if (isSorted && isSorted.order !== 'method') {
        var sd = snowballOrder(cleanDebts(state[debtKey()])), ol = h('ol', { 'class': 'p-order' });
        for (var o = 0; o < sd.length; o++) ol.appendChild(h('li', { text: sd[o].name + ' (' + money(sd[o].balance) + ')' }));
        if (sd.length) div.appendChild(ol);
      }
      var rows = answerRows(sec), dl = h('dl');
      for (var k = 0; k < rows.length; k++) {
        if ((isDebts && rows[k][0] === 'Debts') || (isSorted && isSorted.order !== 'method' && rows[k][0] === (isSorted.summary || 'Order')) || sec.id === BOOK.planSection) continue;
        dl.appendChild(h('dt', { text: rows[k][0] })); dl.appendChild(h('dd', { text: rows[k][1] || '______________________' }));
      }
      if (dl.firstChild) div.appendChild(dl);
      el.appendChild(div);
    }
    el.appendChild(h('div', { 'class': 'p-foot', text: 'zerofluffguides.com/tools/' + BOOK.slug + '. Your answers are stored only in your own browser.' }));
  }
  function printTable(ds, extraCol, extraHead) {
    var head = h('tr', null, [h('th', { text: '#' }), h('th', { text: 'Debt' }), h('th', { 'class': 'n', text: 'Balance' }), h('th', { 'class': 'n', text: 'Rate' }), h('th', { 'class': 'n', text: 'Minimum' })]);
    if (extraCol) head.appendChild(h('th', { 'class': 'n', text: extraHead }));
    var tb = h('tbody');
    for (var i = 0; i < ds.length; i++) {
      var tr = h('tr', null, [h('td', { text: String(i + 1) }), h('td', { text: ds[i].name }), h('td', { 'class': 'n', text: money(ds[i].balance) }),
        h('td', { 'class': 'n', text: pct(ds[i].rate) }), h('td', { 'class': 'n', text: money(ds[i].min) })]);
      if (extraCol) tr.appendChild(h('td', { 'class': 'n', text: extraCol(ds[i], i) }));
      tb.appendChild(tr);
    }
    return h('table', null, [h('thead', null, head), tb]);
  }

  window.ZFGWorksheet.exportText = textExport;
  window.ZFGWorksheet.readSaved = function (t) { return readSaved(t); };

  /* ---------- page ---------- */

  applyDefaults();
  document.documentElement.style.setProperty('--accent', BOOK.accent || '#21694A');
  if (BOOK.accentSoft) document.documentElement.style.setProperty('--accent-soft', BOOK.accentSoft);

  var root = document.getElementById('zfg-worksheet');
  root.appendChild(h('nav', null, h('div', { 'class': 'wrap' }, [
    h('a', { 'class': 'nav-mark', href: '/' }, [h('span', { 'class': 'nav-top' }, [h('span', { 'class': 'nav-zero', text: 'ZERO' }), h('span', { 'class': 'nav-fluff', text: 'FLUFF' })]),
      h('span', { 'class': 'nav-guides', text: 'GUIDES' })]),
    h('div', { 'class': 'nav-links' }, [h('a', { href: '/#books', text: 'Books' }), h('a', { href: '/privacy', text: 'Privacy' })])])));

  var main = h('main', { 'class': 'wrap' });
  root.appendChild(main);
  var fileIn = h('input', { type: 'file', accept: '.txt,.json,text/plain,application/json', 'class': 'hidden', 'aria-hidden': 'true', tabindex: '-1',
    onchange: function (e) { loadFile(e.target.files && e.target.files[0]); e.target.value = ''; } });
  root.appendChild(fileIn);
  function renderMain() {
  clear(main); refreshers = [];
  savedEl = h('span', { 'class': 'ws-saved', role: 'status', text: canStore ? 'Answers save on this device as you type' : 'Your browser is not saving answers. Use Download to keep them.' });
  var jump = h('ul', { 'class': 'ws-jump', 'aria-label': 'Jump to a chapter' });
  for (var s = 0; s < BOOK.sections.length; s++) jump.appendChild(h('li', null, h('a', { href: '#' + BOOK.sections[s].id, text: BOOK.sections[s].short || BOOK.sections[s].label })));
  main.appendChild(h('header', { 'class': 'ws-head' }, [
    h('div', { 'class': 'ws-kicker', text: (BOOK.niche ? BOOK.niche + ' · ' : '') + 'Worksheets' }),
    h('h1', { text: BOOK.title }),
    BOOK.subtitle ? h('p', { 'class': 'ws-sub', text: BOOK.subtitle + '. By ' + BOOK.author + '.' }) : null,
    BOOK.intro ? h('p', { 'class': 'ws-intro', text: BOOK.intro }) : null,
    h('div', { 'class': 'ws-private' }, h('span', null, [h('strong', { text: 'Private by design. ' }),
      'Your answers are saved only in this browser on this device. Nothing is sent anywhere: no account, no sign-up, no tracking. Use Download to keep a copy, and Load to pick up on another device.'])),
    h('div', { 'class': 'ws-tools' }, [h('button', { type: 'button', 'class': 'btn', text: 'Download my answers', onclick: download }),
      h('button', { type: 'button', 'class': 'btn secondary', text: 'Load my answers', onclick: function () { fileIn.click(); } }),
      h('button', { type: 'button', 'class': 'btn secondary', text: 'Print', onclick: function () { buildPrint(); window.print(); } }),
      h('button', { type: 'button', 'class': 'btn clear', text: 'Clear all my answers', onclick: clearAll })]),
    h('p', { 'class': 'ws-saved-line' }, savedEl),
    IOS ? h('p', { 'class': 'ws-help ws-ios-tip', text: 'On iPhone: tap the share icon, then Save to Files. To continue later, use Load my answers on this page (no need to open the file).' }) : null,
    jump]));

  for (var i = 0; i < BOOK.sections.length; i++) {
    var sec = BOOK.sections[i];
    var el = h('section', { 'class': 'ws-section', id: sec.id, 'aria-labelledby': 'h-' + sec.id }, [
      h('div', { 'class': 'ws-label', text: sec.label }), h('h2', { id: 'h-' + sec.id, text: sec.title }),
      sec.step ? h('div', { 'class': 'ws-step' }, [h('b', { text: 'Zero Fluff: ' }), sec.step]) : null]);
    for (var j = 0; j < (sec.fields || []).length; j++) (function (f) {
      if (!W[f.type]) throw new Error('Unknown worksheet field type: ' + f.type);
      var node = W[f.type](f);
      if (f.showIf) { var holder = h('div', null, node); refreshers.push(function () { holder.className = shown(f) ? '' : 'hidden'; }); holder.className = shown(f) ? '' : 'hidden'; node = holder; }
      el.appendChild(node);
    })(sec.fields[j]);
    main.appendChild(el);
  }
  }
  // Clears only after the reader confirms; the page redraws empty without reloading.
  function clearAll() {
    if (!window.confirm('Clear all your answers on this device? This can\'t be undone. Download a copy first if you want to keep them.')) return;
    clearTimeout(saveTimer);
    try { window.localStorage.removeItem(KEY); } catch (e) {}
    state = {}; applyDefaults(); renderMain(); buildPrint();
    setSaved('All answers cleared on this device.');
  }
  renderMain();
  root.appendChild(h('footer', null, h('div', { 'class': 'wrap' }, [
    '© ' + today.getFullYear() + ' Comwares Inc. — Zero Fluff Guides · ', h('a', { href: '/privacy', text: 'Privacy' })])));
  document.body.appendChild(h('div', { id: 'ws-print', 'aria-hidden': 'true' }));   // outside the page so print can show only this
  if (window.matchMedia) { var mq = window.matchMedia('print'); if (mq.addListener) mq.addListener(function (m) { if (m.matches) buildPrint(); }); }
  window.addEventListener('beforeprint', buildPrint);
  buildPrint();

  // A link to #ch1 etc. lands on that section even though the page is built by script.
  function toHash() {
    var id = decodeURIComponent((window.location.hash || '').slice(1)), t = id && document.getElementById(id);
    if (t && t.scrollIntoView) t.scrollIntoView();
  }
  toHash();
  window.addEventListener('load', toHash);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (window.scrollY < 10 || window.location.hash) toHash(); });
})();
