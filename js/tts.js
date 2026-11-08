// 朗讀：用裝置內建的語音（Web Speech API）以粵語或普通話讀出當前時辰的經文。
// 不經網絡、不收費；語音的質素取決於裝置（iPhone/iPad、Android、Mac、Windows 各有內建中文語音）。
// 介面：底部小條（目前段落 + ⏮ ▶ ⏭）；按小條打開「朗讀」面板：語音說明、由哪一段開始、語言及速度。
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const LANGS = { yue: { label: '粵語', want: ['zh-HK', 'yue-HK', 'yue', 'zh-yue'] }, cmn: { label: '普通話', want: ['zh-TW', 'zh-CN', 'cmn-Hant-TW', 'cmn-Hans-CN', 'zh'] } };
const SPEEDS = { slow: [0.6, '慢'], mid: [0.9, '中'] };   // no fast speed (Fr. Gervais, 9 Nov 2026)
const NUM = '一二三四五六七八九十';
let queue = [], pos = 0, playing = false, paused = false, store, $bar, $sheet, gen = 0;   // gen: ignore events of cancelled utterances
let marks = [], startAt = 0;   // start points (sections; each psalm of the psalmody) and the one chosen

const speed = () => (SPEEDS[store.get('ttsSpeed', 'mid')] ? store.get('ttsSpeed', 'mid') : 'mid');
const norm = (l) => (l || '').toLowerCase().replace('_', '-');
function voiceFor(lang) {
  const vs = synth ? synth.getVoices() : [];
  for (const w of LANGS[lang].want) {
    const m = vs.filter((v) => norm(v.lang) === norm(w) || norm(v.lang).startsWith(norm(w) + '-'));
    if (m.length) return m.find((v) => v.localService) || m[0];
  }
  return null;
}

// what is read: the prayer texts; not rubrics, notes, headings, tabs, scripture references or the saint's bio
function collect() {
  const out = [];
  for (const el of document.querySelectorAll('#office section > p')) {
    if (el.closest('.bio') || el.matches('.rub, .epi, .ps, .part, .loading, .empty, .firsthour')) continue;
    if (!el.offsetParent) continue;   // hidden (e.g. rubrics switched off)
    if (out.some((x) => x.el === el)) continue;
    const c = el.cloneNode(true); c.querySelectorAll('.spk, .antl').forEach((x) => x.remove());
    let t = c.textContent
      .replace(/[※†＊*]/g, '')
      .replace(/[（(][^（）()]*[0-9A-Za-z][^（）()]*[）)]/g, '')      // (希3:13)、(Nunc Dimittis)
      .replace(/祢/g, '你').replace(/祂/g, '他')                        // same sound; some voices do not know these forms
      .replace(/\s+/g, '').trim();
    if (!t) continue;
    // long paragraphs in sentences (some browsers stop long utterances)
    const parts = t.length > 120 ? t.match(/[^。！？；]+[。！？；」]*/g) || [t] : [t];
    for (const p of parts) out.push({ el, t: p });
  }
  return out;
}

// start points: every section with something to read; in the psalmody each psalm/canticle (from its antiphon)
const after = (a, b) => a === b || !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
const firstFrom = (el) => queue.findIndex((q) => after(q.el, el));
function antOf(p) {   // the antiphon just before a psalm, if any
  let a = p.previousElementSibling;
  while (a && !a.matches('p.ant, p.ps, h2, h4')) a = a.previousElementSibling;
  return a && a.matches('p.ant') ? a : p;
}
const psName = (p) => p.textContent.replace(/\s*（.*$/, '').replace(/\s+/g, ' ').trim();
function findMarks() {
  const out = [];
  const head = (s) => { const h = s.querySelector('h2'); if (!h) return ''; const c = h.cloneNode(true); c.querySelectorAll('.tag').forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
  for (const s of document.querySelectorAll('#office section')) {
    if (s.matches('.bio')) continue;
    const pss = [...s.querySelectorAll(':scope > p.ps')].filter((p) => p.offsetParent);
    if (s.matches('.s-psalmody') && pss.length) {
      pss.forEach((p, i) => {
        const idx = firstFrom(antOf(p));
        if (idx >= 0 && idx < queue.length) out.push({ i: idx, label: `${pss.length > 1 ? '第' + NUM[i] + '首：' : ''}${psName(p)}` });
      });
      continue;
    }
    const idx = firstFrom(s);
    if (idx >= 0 && idx < queue.length && s.contains(queue[idx].el)) out.push({ i: idx, label: head(s) || '開始' });
    for (const p of pss) {   // a canticle inside another part (e.g. 西默盎聖歌 after the responsory)
      const j = firstFrom(antOf(p));
      if (j > idx && j < queue.length && s.contains(queue[j].el)) out.push({ i: j, label: psName(p) });
    }
  }
  return out.filter((m, k, a) => !k || m.i > a[k - 1].i);
}
const markOf = (i) => { let k = 0; marks.forEach((m, j) => { if (m.i <= i) k = j; }); return k; };

function refresh() {   // re-read the screen (called when the panel opens and before playing from the start)
  queue = collect(); marks = findMarks();
  // default start: the part on screen
  const vis = queue.findIndex((q) => q.el.getBoundingClientRect().bottom > 120);
  startAt = marks.length ? markOf(Math.max(0, vis)) : 0;
}

function speakNext() {
  if (!playing || paused) return;
  document.querySelectorAll('#office .speaking').forEach((x) => x.classList.remove('speaking'));
  if (pos >= queue.length) { stop(); return; }
  const { el, t } = queue[pos];
  el.classList.add('speaking');
  const r = el.getBoundingClientRect();
  const bottomGap = ($sheet && !$sheet.hidden ? $sheet.offsetHeight : $bar.offsetHeight) + 20;
  if (r.top < 110 || r.bottom > innerHeight - bottomGap) window.scrollBy({ top: r.top - 140, behavior: 'smooth' });
  const lang = store.get('ttsLang', 'yue');
  const u = new SpeechSynthesisUtterance(t);
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.lang = v ? v.lang : LANGS[lang].want[0];
  u.rate = SPEEDS[speed()][0];
  const my = ++gen;
  u.onend = () => { if (my === gen && playing && !paused) { pos++; speakNext(); paintPos(); } };
  u.onerror = () => { if (my === gen && playing && !paused) { pos++; speakNext(); paintPos(); } };
  synth.speak(u);
  paintPos();
}

export function stop() {
  gen++; playing = false; paused = false; queue = []; pos = 0; marks = []; startAt = 0;
  if (synth) synth.cancel();
  document.querySelectorAll('#office .speaking').forEach((x) => x.classList.remove('speaking'));
  paint();
  if ($sheet && !$sheet.hidden) requestAnimationFrame(() => { if (!playing) { refresh(); paint(); } });   // the new text is on screen by then
}
function play() {
  if (!synth) return;
  if (paused) { gen++; paused = false; synth.cancel(); speakNext(); paint(); return; }   // resume from the current paragraph
  const lang = store.get('ttsLang', 'yue');
  if (!voiceFor(lang) && synth.getVoices().length) noVoice(lang);
  if (!marks.length) refresh();
  if (!queue.length) return;
  pos = marks.length ? marks[startAt].i : 0; playing = true; paused = false;
  gen++; synth.cancel(); speakNext(); paint();
}
function pause() { gen++; paused = true; synth.cancel(); paint(); }
function jump(d) {   // ⏮ / ⏭: previous / next start point
  if (!marks.length) refresh();
  if (!marks.length) return;
  if (!playing) { startAt = Math.min(marks.length - 1, Math.max(0, startAt + d)); paint(); return; }
  let k = markOf(pos);
  if (d < 0 && pos > marks[k].i + 1) d = 0;   // ⏮ in the middle of a part: back to its beginning
  k = Math.min(marks.length - 1, Math.max(0, k + d));
  if (d > 0 && k === markOf(pos)) return;
  pos = marks[k].i; paused = false; gen++; synth.cancel(); speakNext(); paint();
}
function startFrom(k) {
  startAt = k;
  if (playing) { pos = marks[k].i; paused = false; gen++; synth.cancel(); speakNext(); }
  paint();
}

function noVoice(lang) {
  const el = $sheet.querySelector('.tts-msg');
  el.textContent = `此裝置未有${LANGS[lang].label}語音，請按下面「語音設定」加入。`;
  el.hidden = false;
  store.set('ttsNote', true); $sheet.querySelector('.tts-note').hidden = false;
  open();
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="2.6" height="14" rx="1"/><path d="M19 6.2v11.6a.9.9 0 0 1-1.4.75L9.3 12.75a.9.9 0 0 1 0-1.5l8.3-5.8A.9.9 0 0 1 19 6.2z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="16.4" y="5" width="2.6" height="14" rx="1"/><path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75l8.3-5.8a.9.9 0 0 0 0-1.5l-8.3-5.8A.9.9 0 0 0 5 6.2z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  set: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="15" cy="7" r="2.2" fill="var(--bg)"/><circle cx="9" cy="12" r="2.2" fill="var(--bg)"/><circle cx="14" cy="17" r="2.2" fill="var(--bg)"/></svg>',
  spk: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
};

function paintPos() {
  if (!$bar) return;
  const k = playing ? markOf(pos) : startAt;
  const lab = marks[k] ? marks[k].label : '';
  $bar.querySelector('.tts-now').textContent = playing ? lab : '朗讀';
  $bar.querySelector('.tts-sub').textContent = playing ? (paused ? '已暫停' : '朗讀中…') : (lab ? `由「${lab}」開始` : '按此選擇由哪裡開始');
  const sel = $sheet.querySelector('select');
  if (marks.length && sel.options.length === marks.length) sel.value = String(k);
}
function paint() {
  if (!$bar) return;
  const on = playing && !paused;
  for (const b of document.querySelectorAll('[data-tts="play"]')) { b.innerHTML = on ? ICON.pause : ICON.play; b.setAttribute('aria-label', on ? '暫停' : '朗讀'); }
  for (const b of document.querySelectorAll('[data-tts="stop"]')) b.hidden = !playing;
  const sel = $sheet.querySelector('select');
  sel.innerHTML = marks.length ? marks.map((m, k) => `<option value="${k}">${m.label}</option>`).join('') : '<option>—</option>';
  sel.disabled = !marks.length;
  const lang = store.get('ttsLang', 'yue');
  $sheet.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === lang));
  $sheet.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.speed === speed()));
  paintPos();
}

function open() {
  if (!$sheet.hidden) return;
  if (!playing) refresh();
  $sheet.hidden = false; $bar.hidden = true; document.body.classList.add('tts-on');
  paint();
}
function close() { $sheet.hidden = true; $bar.hidden = false; document.body.classList.remove('tts-on'); paint(); }

export function initTTS(st) {
  store = st;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;   // browser without speech: no bar
  synth.getVoices(); synth.onvoiceschanged = () => synth.getVoices();
  const ctrls = (big) => `<button class="tts-b" data-tts="prev" aria-label="上一段">${ICON.prev}</button>
    <button class="tts-b tts-play${big ? ' big' : ''}" data-tts="play" aria-label="朗讀">${ICON.play}</button>
    <button class="tts-b" data-tts="next" aria-label="下一段">${ICON.next}</button>`;

  $bar = document.createElement('div');
  $bar.className = 'tts';
  $bar.innerHTML = `<button class="tts-open" aria-label="打開朗讀設定"><span class="tts-ic">${ICON.spk}</span><span class="tts-lab"><span class="tts-now"></span><span class="tts-sub"></span></span></button>
    <div class="tts-ctl">${ctrls(false)}<button class="tts-b" data-tts="stop" aria-label="停止" hidden>${ICON.stop}</button></div>`;

  $sheet = document.createElement('div');
  $sheet.className = 'tts-sheet'; $sheet.hidden = true;
  $sheet.setAttribute('role', 'dialog'); $sheet.setAttribute('aria-label', '朗讀');
  $sheet.innerHTML = `<div class="tts-in">
    <button class="tts-x" aria-label="關閉">×</button>
    <h2>朗讀</h2>
    <div class="tts-note"${store.get('ttsNote', true) ? '' : ' hidden'}>
      <button class="tts-note-x" aria-label="不再顯示">×</button>
      <p><b>ⓘ</b> 朗讀所用的語音<b>並非由常頌提供</b>，而是來自你的裝置。如要加入或改善語音，請到裝置的<b>輔助使用或語音設定</b>。</p>
      <details><summary>語音設定 ›</summary>
        <ul><li><b>iPhone／iPad：</b>設定 › 輔助使用 › 朗讀內容 › 聲音 › 中文（粵語／普通話），可下載「加強版」語音。</li>
        <li><b>Android：</b>設定 › 系統 › 語言 › 文字轉語音輸出 › 偏好的引擎 › 安裝語音數據（粵語／中文）。</li>
        <li><b>Mac：</b>系統設定 › 輔助使用 › 朗讀內容 › 系統聲音 › 管理聲音。</li>
        <li><b>Windows：</b>設定 › 時間與語言 › 語音 › 新增語音。</li></ul>
        <p class="tts-fine">加入語音後，請重新開啟常頌。</p>
      </details>
    </div>
    <p class="tts-msg" hidden></p>
    <label class="tts-from" for="ttsFrom">由此開始朗讀：</label>
    <div class="tts-pick"><select id="ttsFrom"></select><button class="tts-setbtn" aria-label="語言及速度" aria-expanded="false">${ICON.set}</button></div>
    <div class="tts-set" hidden>
      <div><span>語言</span><span class="seg"><button class="pill" data-lang="yue">粵語</button><button class="pill" data-lang="cmn">普通話</button></span></div>
      <div><span>速度</span><span class="seg"><button class="pill" data-speed="slow">慢</button><button class="pill" data-speed="mid">中</button></span></div>
    </div>
    <div class="tts-big">${ctrls(true)}</div>
    <div class="tts-stoprow"><button class="pill" data-tts="stop" hidden>■ 停止</button></div>
  </div>`;
  document.body.append($sheet, $bar);

  const on = (sel, f) => document.querySelectorAll(sel).forEach((b) => b.onclick = f);
  on('[data-tts="play"]', () => (playing && !paused ? pause() : play()));
  on('[data-tts="stop"]', stop);
  on('[data-tts="prev"]', () => jump(-1));
  on('[data-tts="next"]', () => jump(1));
  $bar.querySelector('.tts-open').onclick = open;
  $sheet.querySelector('.tts-x').onclick = close;
  $sheet.querySelector('.tts-note-x').onclick = () => { store.set('ttsNote', false); $sheet.querySelector('.tts-note').hidden = true; };
  $sheet.querySelector('select').onchange = (e) => startFrom(+e.target.value);
  const sb = $sheet.querySelector('.tts-setbtn');
  sb.onclick = () => { const s = $sheet.querySelector('.tts-set'); s.hidden = !s.hidden; sb.setAttribute('aria-expanded', !s.hidden); };
  $sheet.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => {
    store.set('ttsLang', b.dataset.lang); $sheet.querySelector('.tts-msg').hidden = true; paint();
    if (playing && !paused) { gen++; synth.cancel(); speakNext(); }
  });
  $sheet.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => {
    store.set('ttsSpeed', b.dataset.speed); paint();
    if (playing && !paused) { gen++; synth.cancel(); speakNext(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$sheet.hidden) close(); });
  document.body.classList.add('has-tts');
  paint();
}
