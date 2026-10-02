/* ============================================================
   shiki-total.js — 一人ひとりに合わせる計算（v2.3）
   ・あなたらしさの核：測った値のうち、平均からいちばん離れている特徴を見つける
   ・あなたの実測：測った値と、平均との違い（目安）
   ・総合鑑定：生年月日（本質）・手相（生き方）・人相（印象）を重ねて、その人だけの文を組み立てる
   画面を使わない計算だけ（Node でもテストできる）。文章は shiki-data.js（TOTAL・PALM_AUTO・FACE_AUTO）
   ============================================================ */
(function (global) {
  'use strict';
  const data = () => global.ShikiData;
  const core = () => global.ShikiVisionCore;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 手相の測った値の目安（実際の手2枚＋検証用の手5枚、MediaPipe で計測）
  const PALM_REF = {
    square: [0.613, 0.024], finger: [0.893, 0.018], indexRing: [1.0, 0.03], pinkyRing: [0.76, 0.03],
    reach: [0.48, 0.04], angle: [14.6, 2.3], heartT: [0.9, 0.08]
  };

  // ---------- 手相：値を取り出す ----------
  function palmValues(rec) {
    const v = {};
    if (!rec) return v;
    const m = rec.m || {}, rd = rec.read || {};
    for (const k of ['square', 'finger', 'indexRing', 'pinkyRing']) if (typeof m[k] === 'number') v[k] = m[k];
    if (rd.life && typeof rd.life.reach === 'number') v.reach = rd.life.reach;
    if (rd.head && typeof rd.head.angle === 'number') v.angle = rd.head.angle;
    if (rd.heart && typeof rd.heart.t === 'number') v.heartT = rd.heart.t;
    return v;
  }

  // ---------- あなたらしさの核（手相） ----------
  //   平均からの離れ具合（z）の大きい順。線は章の見出しと同じ分類（標準の形は核にしない）で言う。
  //   珍しい印（太陽線）や、はっきりした運命線も候補にする
  function palmDistinct(rec) {
    const F = data().PALM_AUTO.features, v = palmValues(rec), out = [];
    const rd = (rec && rec.read) || {};
    const z = (k) => (typeof v[k] === 'number' ? (v[k] - PALM_REF[k][0]) / PALM_REF[k][1] : 0);
    // 手の形・指：平均から1倍以上離れているものだけ
    for (const k of ['square', 'finger', 'indexRing', 'pinkyRing']) {
      if (typeof v[k] !== 'number') continue;
      const zz = z(k), phrase = F[k].core[zz >= 0 ? 0 : 1];
      if (phrase && Math.abs(zz) >= 1) out.push({ key: k, z: zz, score: Math.abs(zz), phrase });
    }
    // 線：章で語る分類と同じ言い方に
    if (rd.life && rd.life.key !== 'standard') out.push({ key: 'reach', z: z('reach'), score: Math.max(1, Math.abs(z('reach'))), phrase: F.reach.core[rd.life.key === 'wide' ? 0 : 1] });
    if (rd.head && rd.head.key !== 'gentle') out.push({ key: 'angle', z: z('angle'), score: Math.max(1, Math.abs(z('angle'))), phrase: F.angle.core[rd.head.key === 'steep' ? 0 : 1] });
    if (rd.heart && rd.heart.key !== 'between') out.push({ key: 'heartT', z: z('heartT'), score: Math.max(1, Math.abs(z('heartT'))), phrase: F.heartT.core[rd.heart.key === 'index' ? 0 : 1] });
    if (rd.sun) out.push({ key: 'sun', z: 3, score: 4, phrase: F.sun.core[0] });                       // 持つ人の少ない印なので、いちばん先に
    if (rd.fate && rd.fate.key === 'clear') out.push({ key: rd.fate.from === 'middle' ? 'fateMiddle' : 'fateWrist', z: 1.3, score: rd.fate.from === 'middle' ? 1.6 : 1.2, phrase: F[rd.fate.from === 'middle' ? 'fateMiddle' : 'fateWrist'].core[0] });
    return out.sort((a, b) => b.score - a.score);
  }

  // ---------- あなたらしさの核（人相） ----------
  function faceDistinct(m) {
    const F = data().FACE_AUTO.features, R = core().FACE_REF, out = [];
    for (const k of Object.keys(F)) {
      if (!m || typeof m[k] !== 'number' || !R[k]) continue;
      const z = (m[k] - R[k][0]) / R[k][1];
      const phrase = F[k].core[z >= 0 ? 0 : 1];                 // 下がりぎみの口角などは「核」にしない（null）
      // 章の分類と食い違わないよう、平均から0.9倍以上離れている特徴だけを「核」の候補に
      if (phrase && Math.abs(z) >= 0.9) out.push({ key: k, part: F[k].part, z, score: Math.abs(z), phrase });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  // 章ごとの個性の強さ（その章の特徴の z の最大）。結果の章の並び順に使う
  function facePartScores(m) {
    const s = {};
    for (const d of faceDistinct(m)) s[d.part] = Math.max(s[d.part] || 0, d.score);
    return s;
  }

  // ---------- あなたの実測 ----------
  //   value：表示する値、pos：平均を50とした位置（0〜100）、word：平均との違いの言い方
  const FMT = {
    ratio: (v) => v.toFixed(2),
    times: (v) => `${v.toFixed(2)}倍`,
    pct: (v) => `${Math.round(v * 100)}%`,
    deg: (v) => `${v.toFixed(0)}°`,
    corner: (v) => { const d = Math.atan(2 * v) * 180 / Math.PI; return `${d >= 0 ? '+' : ''}${d.toFixed(1)}°`; }
  };
  const FACE_ROWS = [
    ['lw', 'ratio'], ['lowerMid', 'ratio'], ['eyeAspect', 'ratio'], ['eyeGap', 'times'], ['browEye', 'times'],
    ['noseWide', 'times'], ['mouthW', 'times'], ['mouthCorner', 'corner']
  ];
  const PALM_ROWS = [['square', 'ratio'], ['finger', 'ratio'], ['indexRing', 'ratio'], ['pinkyRing', 'ratio'], ['reach', 'pct'], ['angle', 'deg'], ['heartT', 'pct']];
  function row(F, k, fmt, v, ref) {
    const z = (v - ref[0]) / ref[1];
    return {
      key: k, label: F[k].label, value: FMT[fmt](v), z,
      pos: Math.round(clamp(50 + z * 18, 4, 96)),
      word: z >= 0.7 ? F[k].hi : z <= -0.7 ? F[k].lo : '平均に近い'
    };
  }
  function measureRows(kind, rec) {
    if (!rec) return [];
    if (kind === 'palm') {
      const F = data().PALM_AUTO.features, v = palmValues(rec);
      return PALM_ROWS.filter(([k]) => typeof v[k] === 'number').map(([k, f]) => row(F, k, f, v[k], PALM_REF[k]));
    }
    const F = data().FACE_AUTO.features, R = core().FACE_REF, m = rec.m || {};
    return FACE_ROWS.filter(([k]) => typeof m[k] === 'number' && R[k]).map(([k, f]) => row(F, k, f, m[k], R[k]));
  }

  // ============================================================
  // 総合鑑定
  // ============================================================
  // 「動（行動的）↔ 静（思慮深い）」「柔（やわらか）↔ 凛（きりっと）」の2つの軸に置く
  const BIRTH_V = {
    kinoe: [0.4, -0.3], kinoto: [-0.1, 0.8], hinoe: [0.9, 0.4], hinoto: [-0.2, 0.6], tsuchinoe: [-0.6, -0.1],
    tsuchinoto: [-0.4, 0.7], kanoe: [0.7, -0.8], kanoto: [-0.2, -0.6], mizunoe: [0.5, 0.1], mizunoto: [-0.6, 0.5]
  };
  const SEASON_V = { spring: [0, 0.2], summer: [0.2, 0.1], autumn: [-0.1, -0.2], winter: [-0.2, -0.1] };
  const FACE_V = { hana: [0.2, 0.7], tori: [0.7, 0.5], kaze: [0.6, -0.5], tsuki: [-0.4, -0.7] };
  const HAND_ELEM = { fire: 1, earth: 2, air: 0, water: 4 };       // 火の手＝火、地の手＝土、風の手＝木、水の手＝水

  function innerOuter(stemKey, seasonKey, faceType) {
    const b = BIRTH_V[stemKey], s = SEASON_V[seasonKey] || [0, 0], f = FACE_V[faceType];
    if (!b || !f) return null;
    const inner = [b[0] + s[0], b[1] + s[1]];
    const da = f[0] - inner[0], ds = f[1] - inner[1];
    if (Math.hypot(da, ds) <= 0.55) return 'same';
    if (Math.abs(da) >= Math.abs(ds)) return da > 0 ? 'outerActive' : 'outerCalm';
    return ds > 0 ? 'outerSoft' : 'outerSharp';
  }

  function flowOf(stemGogyo, handShape) {
    const D = data(), h = HAND_ELEM[handShape];
    if (h == null || stemGogyo == null) return null;
    const b = stemGogyo;
    let key;
    if (b === h) key = 'same';
    else if (D.GEN[b] === h) key = 'birthGen';
    else if (D.GEN[h] === b) key = 'handGen';
    else if (D.KE[b] === h) key = 'birthKe';
    else key = 'handKe';
    const text = D.TOTAL.flow[key].replace(/\{b\}/g, D.GOGYO[b]).replace(/\{h\}/g, D.GOGYO[h]);
    return { key, text, birth: D.GOGYO[b], hand: D.GOGYO[h] };
  }

  // ひとことで言うと：〜を内に秘め、〜し、〜する人
  function coreSentence(src) {
    const T = data().TOTAL, parts = [];
    if (src.birth) {
      const e = T.essence[src.birth.stemKey];
      parts.push({ ren: `「${src.birth.typeName}」のように${e}を内に秘め`, end: `「${src.birth.typeName}」のように${e}を内に秘めた` });
    }
    if (src.palm && T.hand[src.palm.shape]) parts.push({ ren: T.hand[src.palm.shape][0], end: T.hand[src.palm.shape][1] });
    if (src.face && T.face[src.face.type]) parts.push({ ren: null, end: T.face[src.face.type] });
    if (!parts.length) return '';
    return parts.map((p, i) => (i === parts.length - 1 ? p.end : p.ren)).join('、') + '人';
  }

  // src = { name, birth: { stemKey, stemGogyo, seasonKey, typeName, keyword, period: {theme, tip} },
  //         palm: { shape, rec }, face: { type, thirds, rec } }
  function synthesize(src) {
    const D = data(), T = D.TOTAL;
    const have = ['birth', 'palm', 'face'].filter((k) => src[k]);
    const out = { have, count: have.length, sentence: coreSentence(src), traits: [], sections: [] };
    // あなたを形づくる3つの特徴（本質・手・顔それぞれのいちばんの個性）
    if (src.birth) out.traits.push({ role: 'birth', label: T.roles.birth.label, from: T.roles.birth.from, text: src.birth.keyword });
    if (src.palm && src.palm.rec) {
      const top = palmDistinct(src.palm.rec)[0];
      out.traits.push({ role: 'palm', label: T.roles.palm.label, from: T.roles.palm.from, text: top ? top.phrase : D.PALM_AUTO.shape[src.palm.shape].name });
    }
    if (src.face && src.face.rec) {
      const top = faceDistinct(src.face.rec.m)[0];
      out.traits.push({ role: 'face', label: T.roles.face.label, from: T.roles.face.from, text: top ? top.phrase : D.FACE_AUTO.types[src.face.type].name });
    }
    // 内面と印象（生年月日×人相）
    if (src.birth && src.face) {
      const k = innerOuter(src.birth.stemKey, src.birth.seasonKey, src.face.type);
      if (k) {
        const text = T.innerOuter[k].text.replace(/\{e\}/g, T.essence[src.birth.stemKey]).replace(/\{fc\}/g, D.FACE_AUTO.types[src.face.type].catch);
        out.sections.push({ key: 'innerOuter', chapter: T.innerOuter.chapter, title: T.innerOuter[k].title, text, kind: k });
      }
    }
    // 本質と生き方（生年月日×手相）
    if (src.birth && src.palm) {
      const f = flowOf(src.birth.stemGogyo, src.palm.shape);
      if (f) out.sections.push({ key: 'flow', chapter: T.flow.chapter, title: `${f.birth}の本質 × ${f.hand}の手`, text: f.text, kind: f.key });
    }
    // これからの運の流れ（人相の三停・手相の運命線・今年の流れ）
    const tm = T.timing, lines = [];
    const thirds = src.face && src.face.thirds;
    const fate = src.palm && src.palm.rec && src.palm.rec.read && src.palm.rec.read.fate;
    const fk = fate ? (fate.key === 'clear' ? (fate.from === 'middle' ? 'clear_middle' : 'clear_wrist') : fate.key) : null;
    if (thirds === 'lower' && fk === 'clear_middle') lines.push(tm.both);
    else {
      if (thirds && tm.thirds[thirds]) lines.push(tm.thirds[thirds]);
      if (fk && tm.fate[fk]) lines.push(tm.fate[fk]);
    }
    if (src.birth && src.birth.period) lines.push(tm.year.replace('{t}', src.birth.period.theme).replace('{tip}', src.birth.period.tip));
    if (lines.length) out.sections.push({ key: 'timing', chapter: tm.chapter, title: null, text: lines.join(''), kind: 'timing' });
    return out;
  }

  global.ShikiTotal = { PALM_REF, palmValues, palmDistinct, faceDistinct, facePartScores, measureRows, innerOuter, flowOf, coreSentence, synthesize };
})(typeof window !== 'undefined' ? window : globalThis);
