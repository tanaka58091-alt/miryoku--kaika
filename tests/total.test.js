/* 一人ひとりに合わせる計算（shiki-total.js）のテスト。 node tests/total.test.js
   ・総合鑑定：40タイプ × 手の形4 × 顔立ち4（とその欠けた組み合わせ）すべてで、文が崩れないこと
   ・あなたらしさの核：章の分類と食い違わないこと
   ・あなたの実測：値と位置が正しく出ること */
const path = require('path');
global.window = globalThis;
const root = path.join(__dirname, '..', 'assets', 'js');
require(path.join(root, 'shiki-data.js'));
require(path.join(root, 'shiki-vision-core.js'));
require(path.join(root, 'shiki-total.js'));
const D = window.ShikiData, T = window.ShikiTotal, C = window.ShikiVisionCore;

let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else { fail++; console.log('✗', name, info === undefined ? '' : JSON.stringify(info)); } };
const clean = (t) => typeof t === 'string' && t.length > 0 && !/undefined|null|NaN|\{|\}/.test(t);

// ---------- 総合鑑定：すべての組み合わせ ----------
const SHAPES = ['fire', 'earth', 'air', 'water'], FACES = ['hana', 'tori', 'kaze', 'tsuki'];
const birthOf = (stem, season) => ({
  stemKey: stem.key, stemGogyo: D.GOGYO.indexOf(stem.gogyo), seasonKey: season.key, typeKey: `${stem.key}-${season.key}`,
  typeName: `${season.name}の${stem.name}`, catch: D.TYPES[`${stem.key}-${season.key}`].catch, keyword: D.TYPES[`${stem.key}-${season.key}`].keywords[0],
  period: { theme: D.PERIOD[0].theme, tip: D.PERIOD[0].tip }
});
const palmOf = (shape, fate) => ({ shape, rec: { shape: { shape, indexRing: 'even', pinky: 'standard' }, m: { square: 0.6, finger: 0.9, indexRing: 1, pinkyRing: 0.76 }, read: { life: { key: 'wide', reach: 0.55, state: 'clear' }, head: { key: 'steep', angle: 30, state: 'clear' }, fate: fate || { key: 'clear', from: 'middle', state: 'clear' }, sun: false } } });
const faceOf = (type, thirds) => ({ type, thirds: thirds || 'lower', rec: { c: { type, thirds: thirds || 'lower' }, m: Object.fromEntries(Object.entries(C.FACE_REF).map(([k, v]) => [k, v[0] + v[1] * 1.5])) } });
let allOk = true, firstBad = null, n = 0;
const ioKinds = new Set(), flowKinds = new Set();
for (const stem of D.STEMS) for (const season of D.SEASONS) for (const sh of SHAPES) for (const ft of FACES) {
  const s = T.synthesize({ birth: birthOf(stem, season), palm: palmOf(sh), face: faceOf(ft) });
  n++;
  const io = s.sections.find((x) => x.key === 'innerOuter'), fl = s.sections.find((x) => x.key === 'flow'), tm = s.sections.find((x) => x.key === 'timing');
  if (io) ioKinds.add(io.kind);
  if (fl) flowKinds.add(fl.kind);
  const good = s.count === 3 && /人$/.test(s.sentence) && clean(s.sentence) && s.traits.length === 3 && s.traits.every((t) => clean(t.text))
    && io && clean(io.text) && clean(io.title) && fl && clean(fl.text) && tm && clean(tm.text);
  if (!good && allOk) { allOk = false; firstBad = { stem: stem.key, season: season.key, sh, ft, s }; }
}
ok(`総合鑑定：${n}通りすべてで文が崩れない`, allOk, firstBad);
ok('総合鑑定：内面と印象の5つの形がすべて出る', ioKinds.size === 5, [...ioKinds]);
ok('総合鑑定：本質と生き方の5つの関係（同じ・生む・生まれる・整える・抑える）がすべて出る', flowKinds.size === 5, [...flowKinds]);

// 欠けた組み合わせ（2つだけ・1つだけ）
const b0 = birthOf(D.STEMS[8], D.SEASONS[3]);
const pair = (src) => T.synthesize(src);
const bp = pair({ birth: b0, palm: palmOf('fire') }), bf = pair({ birth: b0, face: faceOf('hana') }), pf = pair({ palm: palmOf('water'), face: faceOf('tsuki') });
ok('2つ（生年月日＋手相）：一文と本質×生き方', bp.count === 2 && /人$/.test(bp.sentence) && clean(bp.sentence) && bp.sections.some((x) => x.key === 'flow') && !bp.sections.some((x) => x.key === 'innerOuter'), bp);
ok('2つ（生年月日＋人相）：一文と内面×印象', bf.count === 2 && /人$/.test(bf.sentence) && bf.sections.some((x) => x.key === 'innerOuter') && !bf.sections.some((x) => x.key === 'flow'), bf);
ok('2つ（手相＋人相）：一文と運の流れ', pf.count === 2 && /人$/.test(pf.sentence) && pf.sections.some((x) => x.key === 'timing'), pf);
ok('一文の結び：生年月日だけ', T.coreSentence({ birth: b0 }) === '「冬の海」のように深くおおらかな心を内に秘めた人', T.coreSentence({ birth: b0 }));
ok('一文の結び：手相だけ', T.coreSentence({ palm: { shape: 'water' } }) === '豊かな感受性で人に寄り添う人');
ok('一文の結び：3つ', T.coreSentence({ birth: b0, palm: { shape: 'fire' }, face: { type: 'kaze' } }) === '「冬の海」のように深くおおらかな心を内に秘め、情熱と行動力で道をひらき、自然体の爽やかさで人の心を軽くする人');
ok('内面と印象には、その人の本質と顔立ちのことばが入る', (() => { const io = bf.sections.find((x) => x.key === 'innerOuter'); return io.text.includes(D.TOTAL.essence.mizunoe) && io.text.includes(D.FACE_AUTO.types.hana.catch); })(), bf.sections);
ok('本質×生き方：水は火を整える（相剋）', (() => { const f = T.flowOf(4, 'fire'); return f.key === 'birthKe' && f.text.includes('「水」') && f.text.includes('「火」'); })(), T.flowOf(4, 'fire'));
ok('本質×生き方：木は火を生む（相生）', T.flowOf(0, 'fire').key === 'birthGen');
ok('本質×生き方：同じ五行', T.flowOf(4, 'water').key === 'same');
ok('運の流れ：下停＋中ほどからの運命線は「後半に開く運」で重ねる', pair({ palm: palmOf('fire', { key: 'clear', from: 'middle' }), face: faceOf('kaze', 'lower') }).sections.find((x) => x.key === 'timing').text.includes(D.TOTAL.timing.both));

// ---------- あなたらしさの核：章の分類と食い違わない ----------
const R = T.PALM_REF;
for (const [reach, key] of [[0.43, 'narrow'], [0.48, 'standard'], [0.55, 'wide']]) {
  const rec = { shape: { shape: 'fire' }, m: {}, read: { life: { key, reach }, fate: { key: 'none' } } };
  const lifeCore = T.palmDistinct(rec).find((d) => d.key === 'reach');
  const want = key === 'standard' ? undefined : D.PALM_AUTO.features.reach.core[key === 'wide' ? 0 : 1];
  ok(`手相の核：生命線（${key}）と章の言い方が一致`, (lifeCore && lifeCore.phrase) === want, lifeCore);
}
ok('手相の核：太陽線は最優先', T.palmDistinct({ shape: { shape: 'fire' }, m: { square: 0.7 }, read: { sun: true, fate: { key: 'none' } } })[0].key === 'sun');
ok('手相の核：平均に近い指は核にしない', !T.palmDistinct({ shape: { shape: 'fire' }, m: { square: R.square[0], finger: R.finger[0], indexRing: 1, pinkyRing: R.pinkyRing[0] }, read: { fate: { key: 'none' } } }).length);
// 人相：ランダムな顔で、核はすべて平均から0.9倍以上・言い方あり
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / 0.7071; };
let faceOkAll = true, bad = null;
for (let i = 0; i < 500; i++) {
  const m = Object.fromEntries(Object.entries(C.FACE_REF).map(([k, v]) => [k, v[0] + gauss() * v[1] * 1.3]));
  const list = T.faceDistinct(m);
  if (!list.every((d) => d.score >= 0.9 && clean(d.phrase) && d.part)) { faceOkAll = false; bad = list; break; }
  const sc = T.facePartScores(m);
  if (Object.keys(sc).some((p) => !['outline', 'thirds', 'brow', 'eye', 'nose', 'mouth', 'chin'].includes(p))) { faceOkAll = false; bad = sc; break; }
}
ok('人相の核：500通りの顔で、平均から0.9倍以上の特徴だけ・言い方あり', faceOkAll, bad);
ok('人相の核：いちばん離れた特徴が先頭', (() => { const m = Object.fromEntries(Object.entries(C.FACE_REF).map(([k, v]) => [k, v[0]])); m.eyeGap = C.FACE_REF.eyeGap[0] + C.FACE_REF.eyeGap[1] * 2.5; m.lw = C.FACE_REF.lw[0] + C.FACE_REF.lw[1] * 1.2; const l = T.faceDistinct(m); return l[0].key === 'eyeGap' && l[1].key === 'lw'; })());

// ---------- あなたの実測 ----------
const rowsF = T.measureRows('face', faceOf('hana').rec);
ok('実測（人相）：8項目', rowsF.length === 8, rowsF.map((r) => r.key));
ok('実測（人相）：値と位置が正しい形', rowsF.every((r) => clean(r.value) && r.pos >= 4 && r.pos <= 96 && clean(r.word) && clean(r.label)), rowsF);
const rowsP = T.measureRows('palm', palmOf('fire').rec);
ok('実測（手相）：測れた項目だけ（6項目）', rowsP.length === 6, rowsP.map((r) => r.key));
ok('実測：平均ちょうどは「平均に近い」で中央', (() => { const m = Object.fromEntries(Object.entries(C.FACE_REF).map(([k, v]) => [k, v[0]])); const r = T.measureRows('face', { m }); return r.every((x) => x.pos === 50 && x.word === '平均に近い'); })());
ok('実測：口角は角度で表示', /°$/.test(rowsF.find((r) => r.key === 'mouthCorner').value));
ok('実測：何も測れていなければ空', T.measureRows('palm', null).length === 0 && T.measureRows('face', { m: {} }).length === 0);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
