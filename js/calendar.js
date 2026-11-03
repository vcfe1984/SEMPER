// 禮儀日曆 — 香港教區（時辰頌禱）
// ES module, runs in browser and in Node (for tests). Ported from the Misal Romano app engine.

const DAY = 86400000;
export const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day));
const add = (date, n) => new Date(date.getTime() + n * DAY);
const dow = (date) => date.getUTCDay();
const diff = (a, b) => Math.round((a - b) / DAY);
export const iso = (date) => date.toISOString().slice(0, 10);
export const fromIso = (s) => { const [y, m, dd] = s.split('-').map(Number); return d(y, m, dd); };
const mmdd = (date) => iso(date).slice(5);

export const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七', '二十八', '二十九', '三十', '三十一', '三十二', '三十三', '三十四'];
export const WD = ['主日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// 香港教區：主顯節、耶穌升天節、基督聖體聖血節均移於主日
export const DEFAULTS = { epiphanySunday: true, ascensionSunday: true, corpusSunday: true };

export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return d(y, month, day);
}
export function advent1(y) { const x = d(y, 12, 25); return add(x, -(dow(x) || 7) - 21); }
function epiphany(y, o) {
  if (!o.epiphanySunday) return d(y, 1, 6);
  const j2 = d(y, 1, 2); return add(j2, (7 - dow(j2)) % 7);
}
function baptism(y, o) {
  const ep = epiphany(y, o);
  if (o.epiphanySunday && ep.getUTCDate() >= 7) return add(ep, 1);
  return add(ep, 7 - dow(ep) || 7);
}

// 優先次序（禮儀年及日曆總則 59）：數字小者優先
export const PREC = { TRIDUUM: 1, P2: 2, SOLEMNITY: 3, LORD_FEAST: 5, SUNDAY: 6, FEAST: 7, PRIV_FERIA: 9, MEMORIAL: 10, OPTIONAL: 12, FERIA: 13 };
export const RANK_LABEL = { solemnity: '節日', feast: '慶日', memorial: '紀念', optional: '自由紀念', allsouls: '' };
const psalterWeek = (w) => ((w - 1) % 4) + 1;

/** 時期專有部分 (Proper of Seasons) for a date. key identifies the temporal day. */
export function temporal(date, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const y = date.getUTCFullYear();
  const E = easter(y), A1 = advent1(y);
  const wd = dow(date);
  const t = (key, title, prec, season, extra = {}) => ({ key, title, prec, season, wd, ...extra });

  // 聖誕期
  const bap = baptism(y, o), ep = epiphany(y, o);
  if (mmdd(date) >= '12-25' || date <= bap) {
    const cy = mmdd(date) >= '12-25' ? y : y - 1;
    const x = d(cy, 12, 25);
    const hf = dow(x) === 0 ? d(cy, 12, 30) : add(x, 7 - dow(x));
    const md = mmdd(date);
    if (md === '12-25') return t('xmas', '耶穌聖誕節', 2, 'xmas', { rank: 'solemnity' });
    if (iso(date) === iso(hf)) return t('holyfamily', '聖家節', 5, 'xmas', { rank: 'feast' });
    if (md >= '12-26' && md <= '12-31') return t(`oct${date.getUTCDate()}`, `聖誕節八日慶祝期第${CN[date.getUTCDate() - 24]}日`, 9, 'xmas', { octave: true });
    if (md === '01-01') return t('mary-mother', '天主之母聖瑪利亞', 3, 'xmas', { rank: 'solemnity' });
    if (iso(date) === iso(ep)) return t('epiphany', '主顯節', 2, 'xmas', { rank: 'solemnity' });
    if (iso(date) === iso(bap)) return t('baptism', '主受洗節', 5, 'xmas', { rank: 'feast' });
    if (wd === 0) return t('xmas2-0', '聖誕節後第二主日', 6, 'xmas');
    if (date < ep) return t(`jan${date.getUTCDate()}`, `聖誕期平日：一月${CN[date.getUTCDate()]}日`, 13, 'xmas');
    return t(`postep-${wd}`, `主顯節後${WD[wd]}`, 13, 'xmas');
  }

  // 將臨期
  if (date >= A1) {
    const w = Math.floor(diff(date, A1) / 7) + 1, day = date.getUTCDate();
    if (wd === 0) return t(`adv${w}-0`, `將臨期第${CN[w]}主日`, 2, 'adv', { week: w, psalter: w });
    if (date.getUTCMonth() === 11 && day >= 17) return t(`dec${day}`, `將臨期第${CN[w]}周${WD[wd]}（十二月${CN[day]}日）`, 9, 'adv', { week: w, psalter: w, decKey: `dec${day}`, wkKey: `adv${w}-${wd}` });
    return t(`adv${w}-${wd}`, `將臨期第${CN[w]}周${WD[wd]}`, 13, 'adv', { week: w, psalter: w });
  }

  // 四旬期、逾越三日、復活期
  const ash = add(E, -46), k = diff(date, E);
  if (date >= ash && k < 0) {
    if (k === -46) return t('ash', '聖灰禮儀日', 2, 'lent', { psalter: 4 });
    if (k > -46 && k < -42) return t(`lent0-${wd}`, `聖灰禮儀後${WD[wd]}`, 9, 'lent', { psalter: 4 });
    if (k === -7) return t('palm', '聖枝主日（紀念主受難）', 2, 'lent', { psalter: 2 });
    if (k >= -6 && k <= -4) return t(`holy-${wd}`, `聖周${WD[wd]}`, 2, 'lent', { psalter: 2 });
    if (k === -3) return t('holy-4', '聖周星期四', 1, 'tri');
    if (k === -2) return t('goodfriday', '救主受難日', 1, 'tri');
    if (k === -1) return t('holysat', '聖周星期六', 1, 'tri');
    const w = Math.floor((k + 42) / 7) + 1;
    if (wd === 0) return t(`lent${w}-0`, `四旬期第${CN[w]}主日`, 2, 'lent', { week: w, psalter: psalterWeek(w) });
    return t(`lent${w}-${wd}`, `四旬期第${CN[w]}周${WD[wd]}`, 9, 'lent', { week: w, psalter: psalterWeek(w) });
  }
  if (k >= 0 && k <= 49) {
    if (k === 0) return t('easter', '耶穌復活主日', 1, 'easter', { rank: 'solemnity' });
    if (k < 7) return t(`east1-${wd}`, `復活節八日慶祝期${WD[wd]}`, 2, 'easter');
    const asc = o.ascensionSunday ? 42 : 39;
    if (k === asc) return t('ascension', '耶穌升天節', 2, 'easter', { rank: 'solemnity' });
    if (k === 49) return t('pentecost', '聖神降臨節', 2, 'easter', { rank: 'solemnity' });
    const w = Math.floor(k / 7) + 1;
    if (wd === 0) return t(`east${w}-0`, `復活期第${CN[w]}主日`, 2, 'easter', { week: w, psalter: psalterWeek(w) });
    return t(`east${w}-${wd}`, `復活期第${CN[w]}周${WD[wd]}`, 13, 'easter', { week: w, psalter: psalterWeek(w) });
  }

  // 常年期
  let w;
  if (date < ash) {
    w = Math.floor(diff(date, bap) / 7) + 1;
    if (dow(bap) === 1) w = Math.floor(diff(date, add(bap, -1)) / 7) + 1;
  } else {
    const sun = add(date, -wd);
    w = 34 - (diff(A1, sun) / 7 - 1);
  }
  const ex = { week: w, psalter: psalterWeek(w) };
  if (k === 50) return t('mother-church', '教會之母瑪利亞（紀念）', 10, 'ot', { ...ex, rank: 'memorial', movable: true, base: `ot${w}-1` });
  if (k === 56) return t('trinity', '天主聖三節', 3, 'ot', { ...ex, rank: 'solemnity' });
  if (k === (o.corpusSunday ? 63 : 60)) return t('corpus', '基督聖體聖血節', 3, 'ot', { ...ex, rank: 'solemnity' });
  if (k === 68) return t('sacred-heart', '耶穌聖心節', 3, 'ot', { ...ex, rank: 'solemnity' });
  if (k === 69) return t('immaculate-heart', '聖母無玷之心（紀念）', 10, 'ot', { ...ex, rank: 'memorial', movable: true, base: `ot${w}-6` });
  if (iso(date) === iso(add(A1, -7))) return t('christ-king', '耶穌基督普世君王節', 3, 'ot', { week: 34, psalter: 2, rank: 'solemnity' });
  if (wd === 0) return t(`ot${w}-0`, `常年期第${CN[w]}主日`, 6, 'ot', ex);
  return t(`ot${w}-${wd}`, `常年期第${CN[w]}周${WD[wd]}`, 13, 'ot', ex);
}

export function cycles(date) {
  const y = date.getUTCFullYear();
  const ly = date >= advent1(y) ? y + 1 : y;
  return { sunday: ['丙', '甲', '乙'][ly % 3], weekday: ly % 2 ? '單' : '雙', year: ly };
}

function precOf(c) {
  switch (c.rank) {
    case 'solemnity': return PREC.SOLEMNITY;
    case 'allsouls': return PREC.SOLEMNITY;
    case 'feast': return c.lord ? PREC.LORD_FEAST : PREC.FEAST;
    case 'memorial': return PREC.MEMORIAL;
    default: return PREC.OPTIONAL;
  }
}

/**
 * 某日的禮儀日：
 * { date, temporal, primary, options:[…], notes:[…] }
 * primary = the celebration said by default; options = optional memorials one may choose instead.
 */
export function liturgicalDay(date, santoral = {}, opts = {}) {
  const tp = temporal(date, opts);
  const md = mmdd(date);
  const out = { date: iso(date), temporal: tp, cycles: cycles(date), primary: null, options: [], notes: [] };
  // movable memorials behave like memorials over their weekday
  const fixed = (santoral[md] || []).map((c) => ({ ...c, prec: precOf(c), md }));
  // movable regional celebrations (per calendar, see data/calendars.json)
  const y = date.getUTCFullYear(), today = iso(date), E = easter(y), k = diff(date, E);
  const lny = opts.lny && opts.lny[y];
  const extra = (id, title, rank, more = {}) => fixed.push({ id, title, rank, md, ...more, prec: precOf({ rank, ...more }) });
  if (opts.ladyChina) {   // 中華聖母: HK/TW — Saturday before the 2nd Sunday of May; Macau — Lunar New Year (feast)
    let when = null;
    if (opts.ladyChina.when === 'may') { const m1 = d(y, 5, 1); when = iso(add(add(m1, ((7 - dow(m1)) % 7) + 7), -1)); }
    if (opts.ladyChina.when === 'lny') when = lny;
    if (today === when) extra('our-lady-china', '中華聖母', opts.ladyChina.rank || 'memorial');
  }
  if (opts.highPriest && k === 53) extra('high-priest', '我們的主耶穌基督——永恆的大司祭', 'feast', { lord: true });
  if (opts.fiveWounds && k === -44) extra('five-wounds', '耶穌五傷', 'feast', { lord: true });
  if (opts.lunarNewYear && today === lny) out.notes.push('農曆新春（可舉行新春感恩祭）');
  if (tp.movable) {
    const base = { ...tp, key: tp.base, title: tp.title };
    out.primary = { ...fixed.find(() => false), ...tp, source: 'movable' };
    out.base = base; out.notes.push(...fixed.filter((c) => c.prec <= PREC.MEMORIAL).map((c) => `${c.title}：本年從略`));
    return out;
  }
  const sorted = fixed.sort((a, b) => a.prec - b.prec);
  const best = sorted[0];
  const privileged = tp.prec <= PREC.PRIV_FERIA;

  if (!best || best.prec >= tp.prec) {
    out.primary = { ...tp, source: 'temporal' };
    for (const c of sorted) {
      if (c.prec >= PREC.MEMORIAL && tp.prec === PREC.PRIV_FERIA) out.options.push({ ...c, commemoration: true });
      else if (c.prec < PREC.MEMORIAL) out.notes.push(`${c.title}：今年因${tp.title}而從略` + (c.rank === 'solemnity' ? '（移期）' : ''));
    }
    return out;
  }
  if (best.prec <= PREC.FEAST) {
    out.primary = { ...best, source: 'santoral' };
    return out;
  }
  // 平日的紀念／自由紀念
  const oblig = sorted.filter((c) => c.prec === PREC.MEMORIAL);
  const free = sorted.filter((c) => c.prec === PREC.OPTIONAL);
  if (oblig.length) { out.primary = { ...oblig[0], source: 'santoral' }; for (const c of free) out.notes.push(`${c.title}（自由紀念）：本日從略`); }
  else { out.primary = { ...tp, source: 'temporal' }; out.options.push(...free); }
  return out;
}
