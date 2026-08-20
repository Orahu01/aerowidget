// ICS (iCalendar) 購読 — Google カレンダーの「非公開 URL (iCal 形式)」等を
// 貼るだけで予定を表示できる。OAuth 不要。30 分ごとに更新。
const brand = require('../shared/brand');
'use strict';

const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();
const cache = new Map();   // url -> { events: [{start,end,allDay,title}], fetchedAt, error }
let urls = [];

async function fetchText(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': brand.UA } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// 折返し行 (RFC5545: 継続行は空白始まり) を展開
function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

// DTSTART 等の日時をパース。VALUE=DATE は終日
function parseDate(value, params) {
  if (/VALUE=DATE(?:;|$)/.test(params) || /^\d{8}$/.test(value)) {
    const y = +value.slice(0, 4), m = +value.slice(4, 6) - 1, d = +value.slice(6, 8);
    return { date: new Date(y, m, d), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  if (m[7] === 'Z') {
    return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])), allDay: false };
  }
  // TZID 付きはローカル扱い (日本のユーザーが日本の予定を見る分には実用上足りる)
  return { date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), allDay: false };
}

function parseRrule(s) {
  const out = {};
  for (const part of s.split(';')) {
    const [k, v] = part.split('=');
    out[k] = v;
  }
  return out;
}

const DAY = 86400000;
const BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// 単純な RRULE (DAILY / WEEKLY / MONTHLY / YEARLY) を期間内に展開する。
// 複雑な指定は初回のみ表示 (完全な RRULE 対応は目的外)。
function expand(ev, windowStart, windowEnd) {
  if (!ev.rrule) {
    return (ev.start >= windowStart - DAY && ev.start <= windowEnd) ? [ev.start] : [];
  }
  const r = parseRrule(ev.rrule);
  const freq = r.FREQ;
  const interval = Math.max(1, +(r.INTERVAL || 1));
  const until = r.UNTIL ? (parseDate(r.UNTIL, '') || {}).date : null;
  let count = r.COUNT ? +r.COUNT : Infinity;
  const out = [];
  const startMs = ev.start.getTime();

  const push = (d) => {
    if (until && d > until.getTime()) return false;
    if (out.length >= 100) return false;
    if (d >= windowStart - DAY && d <= windowEnd) out.push(d);
    return true;
  };

  if (freq === 'WEEKLY') {
    const days = r.BYDAY ? r.BYDAY.split(',').map(x => BYDAY[x.slice(-2)]).filter(x => x != null) : [ev.start.getDay()];
    for (let week = 0; week < 400 && count > 0; week += interval) {
      for (const dow of days) {
        const base = new Date(startMs + week * 7 * DAY);
        const shift = (dow - base.getDay() + 7) % 7;
        const d = base.getTime() + shift * DAY;
        if (d < startMs) continue;
        if (count-- <= 0) break;
        if (!push(d)) return out.map(t => new Date(t));
        if (d > windowEnd) return out.map(t => new Date(t));
      }
    }
  } else if (freq === 'DAILY') {
    for (let i = 0; i < 1000 && count-- > 0; i += interval) {
      const d = startMs + i * DAY;
      if (!push(d) || d > windowEnd) break;
    }
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const s = new Date(startMs);
    for (let i = 0; i < 60 && count-- > 0; i += interval) {
      const d = new Date(s);
      if (freq === 'MONTHLY') d.setMonth(d.getMonth() + i);
      else d.setFullYear(d.getFullYear() + i);
      if (!push(d.getTime()) || d.getTime() > windowEnd) break;
    }
  }
  return out.map(t => new Date(t));
}

function parseIcs(text, daysAhead) {
  const lines = unfold(text).split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: new Set() }; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start && cur.title) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [prop] = left.split(';');
    if (prop === 'DTSTART') {
      const p = parseDate(value, left);
      if (p) { cur.start = p.date; cur.allDay = p.allDay; }
    } else if (prop === 'DTEND') {
      const p = parseDate(value, left);
      if (p) cur.end = p.date;
    } else if (prop === 'SUMMARY') {
      cur.title = value.replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    } else if (prop === 'RRULE') {
      cur.rrule = value;
    } else if (prop === 'EXDATE') {
      const p = parseDate(value, left);
      if (p) cur.exdates.add(p.date.toDateString());
    }
  }

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const windowEnd = windowStart + Math.max(1, daysAhead || 7) * DAY;
  const out = [];
  for (const ev of events) {
    const durMs = ev.end ? (ev.end - ev.start) : 0;
    for (const occ of expand(ev, windowStart, windowEnd)) {
      if (ev.exdates.has(occ.toDateString())) continue;
      const end = new Date(occ.getTime() + durMs);
      if (end.getTime() < Date.now() - (ev.allDay ? DAY : 0)) continue; // 終了済みは出さない
      out.push({ start: occ.getTime(), end: end.getTime(), allDay: !!ev.allDay, title: ev.title });
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out.slice(0, 40);
}

async function refresh(url, daysAhead) {
  try {
    const text = await fetchText(url);
    cache.set(url, { events: parseIcs(text, daysAhead), fetchedAt: Date.now(), error: false });
  } catch (e) {
    const prev = cache.get(url);
    cache.set(url, { events: prev ? prev.events : [], fetchedAt: Date.now(), error: true });
  }
  emitter.emit('ics', { url, ...cache.get(url) });
}

// widgets = ics ウィジェット一覧 (url, daysAhead) — 購読を同期する
function sync(widgets) {
  const entries = widgets.filter(w => w.url && /^https?:\/\//.test(w.url));
  urls = entries;
  if (entries.length) {
    heartbeat.register('ics', 30 * 60 * 1000, () => {
      for (const e of urls) refresh(e.url, e.daysAhead);
    });
    for (const e of entries) if (!cache.has(e.url)) refresh(e.url, e.daysAhead);
  } else {
    heartbeat.unregister('ics');
  }
}

function snapshot() { return Object.fromEntries(cache); }

module.exports = { sync, refresh, snapshot, on: (...a) => emitter.on(...a) };
