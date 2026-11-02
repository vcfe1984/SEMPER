import { loadData, office, dayInfo, HOURS, dateLabel, nearestArchiveDate } from './office.js';
import { fromIso, iso, WD } from './calendar.js';

const $ = (s) => document.querySelector(s);
const store = { get(k, d) { try { const v = localStorage.getItem('rike.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rike.' + k, JSON.stringify(v)); } catch {} } };

const hkToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
function defaultHour() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 4) return '5'; if (h < 10) return '1'; if (h < 16) return '2'; if (h < 20) return '3'; return '5';
}
const S = { date: hkToday(), hour: defaultHour(), choice: {}, sub: store.get('sub', '午時') };

function parseHash() {
  const m = location.hash.match(/^#\/(\d{4}-\d\d-\d\d)?\/?(\d)?(?:\?c=([\w@]*))?/);
  if (m) { if (m[1]) S.date = m[1]; if (m[2]) S.hour = m[2]; if (m[3] !== undefined) S.choice[S.date] = m[3]; }
}
function setHash() {
  const c = S.choice[S.date];
  history.replaceState(null, '', `#/${S.date}/${S.hour}${c ? '?c=' + c : ''}`);
}

// ---------- rendering ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const marks = (s) => esc(s.replace(/\s*[※*＊†]\s*/g, ''));
const VERSE = new Set(['psalmody', 'gospel', 'invit', 'tedeum']);
const MARK_END = /[※*＊†]\s*$/;
function renderLine(l, ctx = {}) {
  let m;
  if (l.startsWith('§')) return `<h4 class="alt">${esc(l.slice(1))}</h4>`;
  if ((m = l.match(/^(領|眾|答|啟|應)\s*[：:]\s*(.*)$/))) return `<p class="vr"><span class="spk">${m[1]}：</span>${marks(m[2])}</p>`;
  if ((m = l.match(/^((?:謝主曲|讚主曲)?對經[一二三]?)\s*[：:]\s*(.*)$/))) return `<p class="ant"><span class="antl">${m[1]}：</span>${marks(m[2])}</p>`;
  if (/^(壹|貳|叁|肆|伍)$/.test(l)) return `<p class="part">${l}</p>`;
  if (/^(夜間或清晨用|日間用|午前|午時|午後)(\s*[（(].*[)）])?$/.test(l)) return `<h4 class="alt">${esc(l)}</h4>`;
  if (/^[（(][^）)]*[)）]$/.test(l) || /^\(?(任擇其一|第[一二三]式)\)?$/.test(l)) return `<p class="rub">${esc(l)}</p>`;
  if (/^「.*」/.test(l) || /^（[^）]*）$/.test(l)) return `<p class="epi">${esc(l)}</p>`;
  if (l.length < 40 && /^(聖詠|聖歌|讚主曲|西默盎|匝加利亞|聖母謝主曲|\(路)/.test(l)) return `<p class="ps">${esc(l)}</p>`;
  if (/^(恭讀|選讀)/.test(l) && l.length < 60) return `<p class="rd">${esc(l)}</p>`;
  if (/^(對答詠|領：|答：)/.test(l)) return `<p>${esc(l)}</p>`;
  let cls = '';
  if (VERSE.has(ctx.k)) cls = MARK_END.test(l) ? '' : 've';
  else if (ctx.k === 'hymn') cls = /[。；！？」]\s*$/.test(l) ? 've' : '';
  else if (l.length > 34 && !MARK_END.test(l)) cls = 'prose';
  return `<p${cls ? ` class="${cls}"` : ''}>${marks(l)}</p>`;
}
function renderSection(s, hour) {
  if (hour === '2' && s.sub && s.sub !== S.sub) return '';
  if (s.k === 'bio') return `<section class="bio"><h2 class="sh">${esc(s.h)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</section>`;
  let lines = s.lines;
  if (hour === '2' && s.k === 'hymn') { // three hymns for 午前/午時/午後 — show the selected one
    const blocks = []; let cur = null;
    for (const l of lines) { if (l.startsWith('§')) { cur = { h: l.slice(1), l: [] }; blocks.push(cur); } else if (cur) cur.l.push(l); else blocks.push(cur = { h: '', l: [l] }); }
    const pick = blocks.find((b) => b.h.startsWith(S.sub)) || blocks[0];
    lines = pick ? pick.l : lines;
  }
  const h = s.h && !/^(午前|午時|午後)/.test(s.h) ? `<h2 class="sh">${esc(s.h)}${s.tag ? ` <span class="tag">${esc(s.tag)}</span>` : ''}</h2>` : '';
  return `<section class="s-${s.k}">${h}${lines.map((l) => renderLine(l, s)).join('')}</section>`;
}

function renderCelebs(info) {
  const d = fromIso(S.date);
  const tp = info.L.temporal;
  const el = $('#celebs');
  const parts = [`<div class="day">${WD[d.getUTCDay()]}${info.L.primary.source === 'santoral' ? '・' + tp.title : ''}${tp.psalter ? `・聖詠集第${'一二三四'[tp.psalter - 1]}周` : ''}・主日${info.L.cycles.sunday}年・平日${info.L.cycles.weekday}年</div>`];
  const cur = S.choice[S.date] || '';
  if (info.choices.length > 1) {
    for (const c of info.choices) {
      const lab = c.kind === 'commemoration' ? '紀念' : c.kind === 'optional' ? '自由紀念' : ({ solemnity: '節日', feast: '慶日', memorial: '紀念' }[c.rank] || '平日');
      parts.push(`<button class="chip" data-c="${c.id}" aria-pressed="${c.id === cur}">${esc(c.title)}<small>${lab}</small></button>`);
    }
  } else {
    const c = info.choices[0];
    const lab = { solemnity: '節日', feast: '慶日', memorial: '紀念' }[c.rank] || '';
    parts.push(`<span class="chip" aria-pressed="true">${esc(c.title)}${lab ? `<small>${lab}</small>` : ''}</span>`);
  }
  el.innerHTML = parts.join('');
  el.querySelectorAll('button.chip').forEach((b) => b.onclick = () => { S.choice[S.date] = b.dataset.c; render(); });
}

function render() {
  const info = dayInfo(S.date);
  if (!info.choices.some((c) => c.id === (S.choice[S.date] || ''))) S.choice[S.date] = '';
  const [y, m, d] = S.date.split('-').map(Number);
  $('#dateLabel').textContent = `${y}年${m}月${d}日`;
  $('#datePick').value = S.date;
  renderCelebs(info);
  $('#hours').innerHTML = HOURS.map((h) => `<button role="tab" data-h="${h.n}" aria-selected="${h.n === S.hour}">${h.short}</button>`).join('');
  $('#hours').querySelectorAll('button').forEach((b) => b.onclick = () => { S.hour = b.dataset.h; render(); window.scrollTo(0, 0); });
  const r = office(S.date, S.hour, S.choice[S.date] || '');
  let html = `<h1>${esc(r.title)}</h1>`;
  if (r.notes.length) html += `<div class="notes">${r.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>`;
  if (S.hour === '2') html += `<div class="subsel">${['午前', '午時', '午後'].map((x) => `<button class="pill" data-sub="${x}" aria-pressed="${x === S.sub}">${x}</button>`).join('')}</div>`;
  html += r.sections.length ? r.sections.map((s) => renderSection(s, S.hour)).join('') : `<p class="empty">此日日課尚未收錄。</p>`;
  $('#office').innerHTML = html;
  $('#office').querySelectorAll('[data-sub]').forEach((b) => b.onclick = () => { S.sub = b.dataset.sub; store.set('sub', S.sub); render(); });
  setHash();
}

function shift(n) { const d = fromIso(S.date); S.date = iso(new Date(d.getTime() + n * 864e5)); render(); window.scrollTo(0, 0); }

function applyPrefs() {
  const root = document.documentElement;
  root.style.setProperty('--fs', store.get('fs', 19) + 'px');
  const th = store.get('theme', null); if (th) root.dataset.theme = th; else delete root.dataset.theme;
  document.body.classList.toggle('norubrics', !store.get('rubrics', true));
  $('#rubrics').checked = store.get('rubrics', true);
  document.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.theme === (th || '')));
}

async function main() {
  parseHash();
  applyPrefs();
  $('#prev').onclick = () => shift(-1);
  $('#next').onclick = () => shift(1);
  $('#today').onclick = () => { S.date = hkToday(); S.hour = defaultHour(); render(); };
  $('#datePick').onchange = (e) => { if (e.target.value) { S.date = e.target.value; render(); } };
  $('#menuBtn').onclick = () => { $('#settings').hidden = false; };
  $('#closeSettings').onclick = () => { $('#settings').hidden = true; };
  $('#settings').onclick = (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; };
  document.querySelectorAll('[data-fs]').forEach((b) => b.onclick = () => { store.set('fs', Math.max(14, Math.min(30, store.get('fs', 19) + Number(b.dataset.fs)))); applyPrefs(); });
  document.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { store.set('theme', b.dataset.theme); applyPrefs(); });
  $('#rubrics').onchange = (e) => { store.set('rubrics', e.target.checked); applyPrefs(); };
  document.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; if (e.key === 'ArrowLeft') shift(-1); if (e.key === 'ArrowRight') shift(1); });
  window.addEventListener('hashchange', () => { parseHash(); render(); });
  await loadData();
  const { first, last } = nearestArchiveDate();
  $('#coverage').textContent = `存檔日期：${first} 至 ${last}；其他日期按禮儀日曆從存檔組合。`;
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { $('#update').hidden = false; $('#updateBtn').onclick = () => w.postMessage('skip'); } }); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  }
}
main();
