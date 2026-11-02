// 組合每日日課：存檔頁面 + 紀念／自由紀念的覆蓋
import { liturgicalDay, fromIso, iso, cycles } from './calendar.js';

export const HOURS = [
  { n: '4', name: '誦讀日課', short: '誦讀' },
  { n: '1', name: '晨禱', short: '晨禱' },
  { n: '2', name: '日間祈禱', short: '日間' },
  { n: '3', name: '晚禱', short: '晚禱' },
  { n: '5', name: '夜禱', short: '夜禱' },
];
// sections that belong to the saint on (optional) memorials; psalmody etc. stay from the weekday
const SANCT = { 1: ['invit', 'hymn', 'reading', 'resp', 'gospel', 'interc', 'oratio'], 3: ['hymn', 'reading', 'resp', 'gospel', 'interc', 'oratio'], 4: ['hymn', 'r2', 'oratio'] };

let D = null;
export async function loadData(base = 'data/') {
  if (D) return D;
  const get = (f) => fetch(base + f).then((r) => r.json());
  const [days, texts, santoral, propers, commons, index] = await Promise.all(
    ['days.json', 'texts.json', 'santoral.json', 'propers.json', 'commons.json', 'index.json'].map(get));
  D = { days, texts, santoral, propers, commons, index };
  return D;
}

const latest = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);
const page = (date, hour) => (date && D.days[date] ? D.days[date][hour] : null);
const clone = (p) => ({ t: p.t, s: p.s.map((x) => ({ k: x[0], h: x[1], id: x[2], sub: x[3] })) });
const lines = (id) => (id ? D.texts[id] || [] : []);

function replaceSection(secs, key, repl) {
  const i = secs.findIndex((s) => s.k === key);
  if (i >= 0) secs[i] = { ...secs[i], ...repl, k: key };
  return i >= 0;
}
function insertAfter(secs, key, sec) {
  const i = secs.findIndex((s) => s.k === key);
  secs.splice(i >= 0 ? i + 1 : secs.length, 0, sec);
}

/** Celebration choices for the day: [{id, title, rank, kind}] — first is the default. */
export function dayInfo(dateStr) {
  const L = liturgicalDay(fromIso(dateStr), D.santoral);
  const p = L.primary;
  const choices = [{ id: '', title: p.title, rank: p.rank, kind: p.source === 'temporal' ? 'temporal' : 'primary' }];
  for (const o of L.options) choices.push({ id: o.id, title: o.title, rank: 'optional', kind: o.commemoration ? 'commemoration' : 'optional' });
  return { L, choices, inArchive: !!D.days[dateStr] };
}

/** Base page for a date + hour (archive, or composed for dates outside the archive). Returns {page, notes, from}. */
function basePage(dateStr, hour, L) {
  const notes = [];
  if (D.days[dateStr]) return { pg: clone(page(dateStr, hour)), notes, from: dateStr };
  const p = L.primary, T = L.temporal, I = D.index;
  // feasts, solemnities, All Souls: whole page from the archive
  if (p.source === 'santoral' && p.rank !== 'memorial') {
    const src = latest(I.s[p.id]);
    if (src) { notes.push(`經文取自 ${src} 的存檔`); return { pg: clone(page(src, hour)), notes, from: src }; }
  }
  const key = p.source === 'movable' ? p.key : T.key;
  let src = latest(I.t[key]);
  let pg = src && clone(page(src, hour));
  if (!pg) {
    // weekday known only as a memorial day: weekday parts from there, the rest from the same psalter week/day
    const mem = latest(I.t['~' + key]);
    const psal = T.psalter ? latest(I.p[`${T.season}|${T.psalter}|${T.wd}`]) : null;
    if (mem || psal) {
      pg = clone(page(mem || psal, hour));
      if (mem && psal && SANCT[hour]) {
        const alt = clone(page(psal, hour));
        for (const k of SANCT[hour]) { const s = alt.s.find((x) => x.k === k); if (s) replaceSection(pg.s, k, s); }
        // OoR closing prayer = the week's Sunday collect
        if (hour === '4') { const sun = latest(I.t[`${T.season}${T.week}-0`]); const so = sun && page(sun, '4'); const o = so && so.s.find((x) => x[0] === 'oratio'); if (o) replaceSection(pg.s, 'oratio', { h: o[1], id: o[2] }); }
      }
      pg.t = `${T.title}（聖詠集第${'一二三四'[T.psalter - 1] || ''}周）`;
      src = mem || psal;
      notes.push(mem ? `平日經文取自 ${mem}；其餘取自聖詠集同周同日（${psal || '—'}）` : `本日尚未收錄；經文暫取自聖詠集同周同日（${psal}），誦讀及結束禱詞可能與本周不同`);
    }
  }
  if (!pg) return { pg: null, notes: ['此日日課尚未收錄於存檔，請待禮儀委員會發佈後更新。'], from: null };
  pg.t = composedTitle(dateStr, L, hour);
  if (src) {
    notes.unshift(`經文取自 ${src} 的存檔`);
    const a = cycles(fromIso(src)).sunday, b = L.cycles.sunday;
    if (T.wd === 0 && a !== b && (hour === '1' || hour === '3')) notes.push(`主日福音對經按${a}年（本年為${b}年）`);
  }
  // obligatory memorial on a composed day → overlay from the archived memorial page
  if (p.source === 'santoral' && p.rank === 'memorial') {
    const ms = latest(I.s[p.id]);
    if (ms && SANCT[hour]) {
      const mp = clone(page(ms, hour));
      for (const k of SANCT[hour]) { const s = mp.s.find((x) => x.k === k); if (s) replaceSection(pg.s, k, s); }
      if (hour === '1') { const s = mp.s.find((x) => x.k === 'invit'); if (s) replaceSection(pg.s, 'invit', s); }
      notes.push(`紀念部分取自 ${ms}`);
    } else if (SANCT[hour]) {
      const c = D.propers[p.id];
      if (c && c.collect) replaceSection(pg.s, 'oratio', { lines: [c.collect], tag: '專用' });
    }
  }
  return { pg, notes, from: src };
}

const CNN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七', '二十八', '二十九', '三十', '三十一'];
export const HOUR_NAME = { 1: '晨禱', 2: '日間祈禱', 3: '晚禱', 4: '誦讀日課', 5: '夜禱' };
export function dateLabel(dateStr) { const [, m, d] = dateStr.split('-').map(Number); return `${CNN[m]}月${CNN[d]}日`; }
function composedTitle(dateStr, L, hour) {
  const p = L.primary, T = L.temporal;
  const rank = { solemnity: '（節日）', feast: '（慶日）', memorial: '（紀念）' }[p.rank] || '';
  const ps = T.psalter && !(p.rank === 'solemnity' || p.rank === 'feast') ? `（聖詠集第${'一二三四'[T.psalter - 1]}周）` : '';
  return `${dateLabel(dateStr)}　${p.title}${rank}${ps}　${HOUR_NAME[hour]}`;
}
function seasonOf(L) { return L.temporal.season === 'easter' ? 'easter' : 'ord'; }
function commonSection(cs, season, hour, key) {
  for (const c of cs) {
    const lib = D.commons[c]; if (!lib) continue;
    const id = (lib[season] && lib[season][hour] && lib[season][hour][key]) || (lib.ord && lib.ord[hour] && lib.ord[hour][key]);
    if (id) return { h: id[0], id: id[1], tag: `${c}通用` };
  }
  return null;
}
function collectFor(id, L) {
  const p = D.propers[id]; if (!p) return '';
  if (L.temporal.season === 'lent' && p.collect_lent) return p.collect_lent;
  if (L.temporal.season === 'easter' && p.collect_easter) return p.collect_easter;
  return p.collect;
}

/** The office to display. choiceId = '' for the default celebration, or an optional memorial id. */
export function office(dateStr, hour, choiceId = '') {
  const { L, choices } = dayInfo(dateStr);
  const { pg, notes } = basePage(dateStr, hour, L);
  if (!pg) return { title: L.primary.title, sections: [], notes, choices };
  const choice = choices.find((c) => c.id === choiceId && c.id);
  let title = pg.t;
  if (choice && SANCT[hour]) {
    const P = D.propers[choice.id] || {};
    const collect = collectFor(choice.id, L);
    if (choice.kind === 'commemoration') {
      insertAfter(pg.s, 'oratio', { k: 'commem', h: `紀念：${choice.title}`, lines: [collect || '（本紀念的集禱經尚未收錄）'], tag: '紀念' });
    } else {
      const cs = D.index.c[choice.id] || ['聖人'];
      const season = seasonOf(L);
      for (const key of SANCT[hour]) {
        if (key === 'oratio') {
          if (collect) replaceSection(pg.s, 'oratio', { lines: [collect], id: '', tag: '專用' });
          else replaceSection(pg.s, 'oratio', { tag: '本紀念尚無專用禱詞：暫用平日' });
          continue;
        }
        if (key === 'r2') {
          if (P.r2) replaceSection(pg.s, 'r2', { lines: P.r2, id: '', tag: '專用' });
          else replaceSection(pg.s, 'r2', { tag: '專用誦讀尚未收錄：暫用平日' });
          continue;
        }
        const cs1 = commonSection(cs, season, hour, key);
        if (cs1) replaceSection(pg.s, key, { h: cs1.h, id: cs1.id, lines: undefined, tag: cs1.tag });
      }
      title = `${dateLabel(dateStr)}　${choice.title}（自由紀念）（${cs[0]}通用）　${HOUR_NAME[hour]}`;
    }
    if (P.bio && (hour === '4' || hour === '1')) pg.s.unshift({ k: 'bio', h: choice.title, lines: P.bio.split('\n') });
  } else if (choice && !SANCT[hour]) {
    notes.push('日間祈禱及夜禱按平日誦念。');
  }
  const sections = pg.s.map((s) => ({ k: s.k, h: s.h, sub: s.sub, tag: s.tag, lines: s.lines || lines(s.id) }));
  return { title, sections, notes, choices };
}

export function nearestArchiveDate() { const ks = Object.keys(D.days).sort(); return { first: ks[0], last: ks[ks.length - 1] }; }
export { iso };
