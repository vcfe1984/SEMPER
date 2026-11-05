// 朗讀：用裝置內建的語音（Web Speech API）以粵語或普通話讀出當前時辰的經文。
// 不經網絡、不收費；語音的質素取決於裝置（iPhone/iPad、Android、Mac、Windows 各有內建中文語音）。
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const LANGS = { yue: { label: '粵語', want: ['zh-HK', 'yue-HK', 'yue', 'zh-yue'] }, cmn: { label: '普通話', want: ['zh-TW', 'zh-CN', 'cmn-Hant-TW', 'cmn-Hans-CN', 'zh'] } };
const RATES = [[0.75, '慢'], [0.9, '中'], [1.1, '快']];
let queue = [], pos = 0, playing = false, paused = false, store, $bar, gen = 0;   // gen: ignore events of cancelled utterances

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

function speakNext() {
  if (!playing || paused) return;
  document.querySelectorAll('#office .speaking').forEach((x) => x.classList.remove('speaking'));
  if (pos >= queue.length) { stop(); return; }
  const { el, t } = queue[pos];
  el.classList.add('speaking');
  const r = el.getBoundingClientRect();
  if (r.top < 110 || r.bottom > innerHeight - 90) window.scrollBy({ top: r.top - 140, behavior: 'smooth' });
  const lang = store.get('ttsLang', 'yue');
  const u = new SpeechSynthesisUtterance(t);
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.lang = v ? v.lang : LANGS[lang].want[0];
  u.rate = store.get('ttsRate', 0.9);
  const my = ++gen;
  u.onend = () => { if (my === gen && playing && !paused) { pos++; speakNext(); } };
  u.onerror = () => { if (my === gen && playing && !paused) { pos++; speakNext(); } };
  synth.speak(u);
}

export function stop() {
  gen++; playing = false; paused = false; queue = []; pos = 0;
  if (synth) synth.cancel();
  document.querySelectorAll('#office .speaking').forEach((x) => x.classList.remove('speaking'));
  paint();
}
function play() {
  if (!synth) return;
  if (paused) { gen++; paused = false; synth.cancel(); speakNext(); paint(); return; }   // resume from the current paragraph
  const lang = store.get('ttsLang', 'yue');
  if (!voiceFor(lang) && synth.getVoices().length) msg(lang);
  queue = collect();
  // start from the first paragraph on screen
  const first = queue.findIndex((q) => q.el.getBoundingClientRect().bottom > 120);
  pos = Math.max(0, first); playing = true; paused = false;
  gen++; synth.cancel(); speakNext(); paint();
}
function pause() { gen++; paused = true; synth.cancel(); paint(); }

function msg(lang) {
  const el = $bar.querySelector('.tts-msg');
  el.textContent = `此裝置未有${LANGS[lang].label}語音。iPhone：設定 › 輔助使用 › 朗讀內容 › 聲音 › 中文；Android：設定 › 文字轉語音；Windows：設定 › 時間與語言 › 語音。`;
  el.hidden = false; setTimeout(() => { el.hidden = true; }, 9000);
}

function paint() {
  if (!$bar) return;
  const lang = store.get('ttsLang', 'yue'), rate = store.get('ttsRate', 0.9);
  $bar.querySelector('[data-tts="play"]').textContent = playing && !paused ? '❚❚' : '▶ 朗讀';
  $bar.querySelector('[data-tts="stop"]').hidden = !playing;
  $bar.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === lang));
  $bar.querySelector('[data-tts="rate"]').textContent = (RATES.find((r) => r[0] === rate) || RATES[1])[1] + '速';
}

export function initTTS(st) {
  store = st;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;   // browser without speech: no bar
  synth.getVoices(); synth.onvoiceschanged = () => synth.getVoices();
  $bar = document.createElement('div');
  $bar.className = 'tts';
  $bar.innerHTML = `<p class="tts-msg" hidden></p><div class="tts-row">
    <button class="pill" data-tts="play">▶ 朗讀</button><button class="pill" data-tts="stop" hidden>■</button>
    <span class="tts-sp"></span>
    <span class="seg"><button class="pill" data-lang="yue">粵語</button><button class="pill" data-lang="cmn">普通話</button></span>
    <button class="pill" data-tts="rate"></button></div>`;
  document.body.appendChild($bar);
  $bar.querySelector('[data-tts="play"]').onclick = () => (playing && !paused ? pause() : play());
  $bar.querySelector('[data-tts="stop"]').onclick = stop;
  $bar.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => {
    store.set('ttsLang', b.dataset.lang); paint();
    if (playing) { gen++; synth.cancel(); paused = false; speakNext(); }
  });
  $bar.querySelector('[data-tts="rate"]').onclick = () => {
    const i = RATES.findIndex((r) => r[0] === store.get('ttsRate', 0.9));
    store.set('ttsRate', RATES[(i + 1) % RATES.length][0]); paint();
    if (playing && !paused) { gen++; synth.cancel(); speakNext(); }
  };
  document.body.classList.add('has-tts');
  paint();
}
