/* 写真から手相を読む計算（shiki-vision-core.js）のテスト。 node tests/vision.test.js
   位置の分かっている線を描いた「人工の手のひら画像」を作り、正しくたどれるかを確かめる。
   DEBUG=1 で scratch に確認用の PNG を書き出す */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
global.window = globalThis;
require(path.join(__dirname, '..', 'assets', 'js', 'shiki-vision-core.js'));
const V = window.ShikiVisionCore;

let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else { fail++; console.log('✗', name, info === undefined ? '' : JSON.stringify(info)); } };

// ---------- 人工の手のひら（正規化座標＝画像座標になるように置く） ----------
const LM = [
  [220, 400], [300, 360], [360, 280], [395, 225], [420, 180],
  [305, 75], [315, -10], [320, -60], [325, -100],
  [220, 60], [222, -30], [224, -85], [226, -125],
  [145, 72], [138, -10], [134, -60], [131, -98],
  [75, 105], [62, 45], [55, 8], [50, -22]
].map(([x, y]) => ({ x, y }));

function bez(p0, c1, c2, p1, t) {
  const u = 1 - t;
  if (!c2) return { x: u * u * p0.x + 2 * u * t * c1.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c1.y + t * t * p1.y };
  return { x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x, y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y };
}
function makePalm(lines, opt = {}) {
  const W = 440, H = 440, g = new Float32Array(W * H);
  const poly = V.palmPolygon(LM);
  const inside = V.fillPolygon(poly, W, H);
  let seed = opt.seed || 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    g[i] = inside[i] ? 185 + 25 * (x / W) - 15 * (y / H) + (rnd() - 0.5) * (opt.noise || 10) : 45 + rnd() * 8;
  }
  for (const L of lines) {
    const depth = L.depth || 38, sig = L.width || 1.6;
    for (let k = 0; k <= 400; k++) {
      const p = bez(L.p0, L.c1, L.c2, L.p1, k / 400);
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
        const v = depth * Math.exp(-d2 / (2 * sig * sig));
        const i = y * W + x;
        if (inside[i]) g[i] = Math.min(g[i], 200 - v - 0) ; // 線は暗く
      }
    }
  }
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = g[i] + 12; data[i * 4 + 1] = g[i]; data[i * 4 + 2] = g[i] - 8; data[i * 4 + 3] = 255; }
  return { data, width: W, height: H };
}
const P = (x, y) => ({ x, y });
const HEART = { p0: P(35, 150), c1: P(150, 150), p1: P(265, 92) };
const HEAD = { p0: P(330, 172), c1: P(220, 185), p1: P(92, 256) };
const LIFE = { p0: P(330, 172), c1: P(248, 200), c2: P(236, 330), p1: P(272, 396) };
const FATE = { p0: P(200, 396), c1: P(201, 330), p1: P(203, 262) };

// ---------- 1. 基本形：全部の線がある ----------
const img1 = makePalm([HEART, HEAD, LIFE, FATE]);
const r1 = V.readPalm(img1, LM);
ok('右手と判定（親指が右）', r1.hand === 'right', r1.hand);
ok('正規化は恒等（手首・中指の付け根がそのまま）', Math.abs(r1.P[0].x - 220) < 0.01 && Math.abs(r1.P[9].y - 60) < 0.01, [r1.P[0], r1.P[9]]);
const near = (run, curve, tol) => {
  if (!run) return false;
  let worst = 0;
  for (const p of run.pts) {
    let bd = 1e9;
    for (let k = 0; k <= 200; k++) { const q = bez(curve.p0, curve.c1, curve.c2, curve.p1, k / 200); bd = Math.min(bd, Math.hypot(q.x - p.x, q.y - p.y)); }
    worst = Math.max(worst, bd);
  }
  return worst <= tol;
};
ok('感情線をたどれる', near(r1.lines.heart.run, HEART, 6), r1.lines.heart.run && [r1.lines.heart.run.pts[0], r1.lines.heart.run.pts.slice(-1)[0]]);
ok('知能線をたどれる', near(r1.lines.head.run, HEAD, 6), r1.lines.head.run && [r1.lines.head.run.pts[0], r1.lines.head.run.pts.slice(-1)[0]]);
ok('生命線をたどれる', near(r1.lines.life.run, LIFE, 6), r1.lines.life.run && [r1.lines.life.run.pts[0], r1.lines.life.run.pts.slice(-1)[0]]);
ok('感情線：人差し指と中指のあいだ', r1.read.heart && r1.read.heart.key === 'between', r1.read.heart);
ok('知能線：ゆるやかに下がる', r1.read.head && r1.read.head.key === 'gentle', r1.read.head);
ok('知能線と生命線の始まり：つながっている', r1.read.headStart === 'joined', r1.read.headStart);
ok('運命線：途中までの線', r1.read.fate && r1.read.fate.key === 'partial', r1.read.fate);
ok('太陽線はない', r1.read.sun === false);

// ---------- 2. 形を変える：離れた始まり・まっすぐな知能線・人差し指までの感情線・大きな弧・くっきりした運命線 ----------
const HEART2 = { p0: P(35, 150), c1: P(170, 140), p1: P(300, 112) };
const HEAD2 = { p0: P(322, 150), c1: P(210, 158), p1: P(70, 168) };
const LIFE2 = { p0: P(332, 190), c1: P(180, 210), c2: P(176, 340), p1: P(260, 396) };
const FATE2 = { p0: P(160, 396), c1: P(161, 250), p1: P(164, 120) };
const img2 = makePalm([HEART2, HEAD2, LIFE2, FATE2], { seed: 11 });
const r2 = V.readPalm(img2, LM);
ok('2：感情線は人差し指の下まで', r2.read.heart && r2.read.heart.key === 'index', r2.read.heart);
ok('2：知能線はまっすぐ', r2.read.head && r2.read.head.key === 'straight', r2.read.head);
ok('2：始まりは離れている', r2.read.headStart === 'apart', r2.read.headStart);
ok('2：生命線は大きな弧', r2.read.life && r2.read.life.key === 'wide', r2.read.life);
ok('2：運命線はくっきり', r2.read.fate && r2.read.fate.key === 'clear', r2.read.fate);

// ---------- 3. 線がない手のひら：でっち上げない ----------
const img3 = makePalm([], { seed: 5, noise: 14 });
const r3 = V.readPalm(img3, LM);
ok('3：線がなければ生命線は読まない', !r3.read.life, r3.read.life);
ok('3：線がなければ感情線は読まない', !r3.read.heart, r3.read.heart);
ok('3：線がなければ運命線は「見当たらない」', r3.read.fate.key === 'none', r3.read.fate);

// ---------- 4. 左手（左右反転した写真）でも同じに読める ----------
const W = 440;
const flip = (img) => { const d = new Uint8ClampedArray(img.data.length); for (let y = 0; y < img.height; y++) for (let x = 0; x < W; x++) { const s = (y * W + x) * 4, t = (y * W + (W - 1 - x)) * 4; for (let c = 0; c < 4; c++) d[t + c] = img.data[s + c]; } return { data: d, width: img.width, height: img.height }; };
const LMf = LM.map((p) => ({ x: W - 1 - p.x, y: p.y }));
const r4 = V.readPalm(flip(img1), LMf);
ok('4：左手と判定', r4.hand === 'left', r4.hand);
ok('4：左手でも感情線・知能線・始まりが同じ', r4.read.heart && r4.read.heart.key === 'between' && r4.read.head && r4.read.head.key === 'gentle' && r4.read.headStart === 'joined', [r4.read.heart, r4.read.head, r4.read.headStart]);

// ---------- 5. 手の形 ----------
const m = V.measureHand(LM);
ok('手の比率が計算できる', m.square > 0.5 && m.square < 1 && m.finger > 0.5, m);
const cls = V.classifyHand(m);
ok('手の形は4つのどれか', ['fire', 'earth', 'air', 'water'].includes(cls.shape), cls);
ok('四角い手のひら×短い指＝地', V.classifyHand({ square: 0.66, finger: 0.85, indexRing: 1, pinkyRing: 0.8 }).shape === 'earth');
ok('長い手のひら×長い指＝水', V.classifyHand({ square: 0.57, finger: 0.93, indexRing: 1, pinkyRing: 0.8 }).shape === 'water');

// ---------- 6. 人相の分類と、文章データのそろい ----------
require(path.join(__dirname, '..', 'assets', 'js', 'shiki-data.js'));
const D = window.ShikiData, REF = V.FACE_REF;
const mean = () => Object.fromEntries(Object.entries(REF).map(([k, v]) => [k, v[0]]));
const at = (over) => Object.assign(mean(), over);
const sd = (k, z) => REF[k][0] + z * REF[k][1];
ok('人相：平均の顔は卵型・バランス・標準', (() => { const c = V.classifyFace(mean()); return c.outline === 'oval' && c.thirds === 'balanced' && c.eye === 'standard' && c.mouth === 'standard' && c.noseLen === 'standard'; })(), V.classifyFace(mean()));
ok('人相：縦に長い顔は面長', V.classifyFace(at({ lw: sd('lw', 1.5) })).outline === 'long');
ok('人相：あごが広い顔はベース型', V.classifyFace(at({ jw: sd('jw', 1.5) })).outline === 'square');
ok('人相：縦が短い顔は丸顔', V.classifyFace(at({ lw: sd('lw', -1.5) })).outline === 'round');
ok('人相：あごが細い顔は逆三角形', V.classifyFace(at({ jw: sd('jw', -1.2), cw: sd('cw', -1.0) })).outline === 'heart');
ok('人相：下停が長い', V.classifyFace(at({ lowerMid: sd('lowerMid', 1.2) })).thirds === 'lower');
ok('人相：口角が上がっている', V.classifyFace(at({ mouthCorner: 0.09 })).corner === 'up');
ok('人相：口角が下がっている', V.classifyFace(at({ mouthCorner: -0.01 })).corner === 'down');
const typeOf = (zc, za) => V.classifyFace(at({ browArch: sd('browArch', zc), eyeAspect: sd('eyeAspect', zc), lips: sd('lips', zc), lw: sd('lw', za * 0.6), noseLen: sd('noseLen', za), lowerMid: sd('lowerMid', za) })).type;
ok('人相：やわらか×大人＝花', typeOf(1, 1) === 'hana', typeOf(1, 1));
ok('人相：やわらか×若々しい＝鳥', typeOf(1, -1) === 'tori', typeOf(1, -1));
ok('人相：すっきり×若々しい＝風', typeOf(-1, -1) === 'kaze', typeOf(-1, -1));
ok('人相：すっきり×大人＝月', typeOf(-1, 1) === 'tsuki', typeOf(-1, 1));
// いろいろな顔で、分類の結果に必ず文章があること
const FA = D.FACE_AUTO, FP = FA.parts;
let faceAll = true, faceMiss = null, typeCount = {};
let seedF = 99;
const rndF = () => { seedF = (seedF * 1103515245 + 12345) % 2147483648; return seedF / 2147483648; };
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rndF(); return (u - 3) / 0.7071; };
for (let n = 0; n < 2000; n++) {
  const m = Object.fromEntries(Object.entries(REF).map(([k, v]) => [k, v[0] + gauss() * v[1] * 1.3]));
  const c = V.classifyFace(m);
  typeCount[c.type] = (typeCount[c.type] || 0) + 1;
  const need = [
    FA.types[c.type] && FA.types[c.type].name, FA.thirds[c.thirds] && FA.thirds[c.thirds].text,
    FP.outline[c.outline] && FP.outline[c.outline].tip, FP.brow[c.brow] && FP.brow[c.brow].tip,
    !c.browThick || FP.brow[c.browThick], !c.browEye || FP.brow[c.browEye].text, !c.browGap || FP.brow[c.browGap].text,
    FP.eye[c.eye] && FP.eye[c.eye].tip, FP.eye[c.eyeTilt], !c.eyeGap || FP.eye[c.eyeGap].tip,
    FP.nose[c.noseLen] && FP.nose[c.noseLen].text, !c.noseWide || FP.nose[c.noseWide],
    FP.mouth[c.mouth] && FP.mouth[c.mouth].text, !c.lips || FP.mouth[c.lips], FP.mouth[c.corner],
    FP.chin[c.chin] && FP.chin[c.chin].text
  ];
  if (need.some((x) => !x)) { faceAll = false; faceMiss = c; break; }
}
ok('人相：2000通りの顔すべてに文章がある', faceAll, faceMiss);
ok('人相：顔立ちのタイプが4つとも出る（偏りすぎない）', Object.keys(typeCount).length === 4 && Math.min(...Object.values(typeCount)) > 2000 * 0.12, typeCount);

// 手相の文章データ
const PA = D.PALM_AUTO;
ok('手相：手の形4つに名前・説明・ひとこと', ['fire', 'earth', 'air', 'water'].every((k) => PA.shape[k] && PA.shape[k].name && PA.shape[k].text && PA.shape[k].tip && PA.shape[k].trait));
ok('手相：指の文章がそろう', ['index', 'ring', 'even', 'pinkyLong'].every((k) => PA.fingers[k] && PA.fingers[k].text));
ok('手相：生命線3種に「人」で結べる言い方がある', ['wide', 'standard', 'narrow'].every((k) => PA.lines.life[k] && /[たるな]$/.test(PA.lines.life[k].trait)), ['wide', 'standard', 'narrow'].map((k) => PA.lines.life[k].trait));
ok('手相：知能線・感情線に、つなぐ形と結ぶ形がある', ['straight', 'gentle', 'steep'].every((k) => PA.lines.head[k].trait && PA.lines.head[k].traitEnd) && ['index', 'between', 'middle'].every((k) => PA.lines.heart[k].trait && PA.lines.heart[k].traitEnd));
ok('手相：運命線4種と太陽線の文章', ['clear_wrist', 'clear_middle', 'partial', 'none'].every((k) => PA.lines.fate[k] && PA.lines.fate[k].text) && !!PA.lines.sun.text);
ok('手相：線が読み取れないときの文章', !!PA.unclear && !!PA.lines.heart.none && !!PA.note);
// 読み取った結果の記号に、必ず文章があること（人工画像の結果）
for (const [name, r] of [['1', r1], ['2', r2], ['3', r3]]) {
  const rd = r.read;
  const okRead = (!rd.life || PA.lines.life[rd.life.key]) && (!rd.head || PA.lines.head[rd.head.key]) && (!rd.heart || PA.lines.heart[rd.heart.key]) && PA.shape[r.shape.shape] && PA.fingers[r.shape.indexRing];
  ok(`手相：人工画像${name}の結果に文章がある`, !!okRead, rd);
}

// ---------- 確認用の画像（DEBUG=1） ----------
if (process.env.DEBUG) {
  const out = process.env.DEBUG_DIR || '/tmp';
  const png = (file, W2, H2, rgba) => {
    const raw = Buffer.alloc((W2 * 4 + 1) * H2);
    for (let y = 0; y < H2; y++) { raw[y * (W2 * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * W2 * 4, W2 * 4).copy(raw, y * (W2 * 4 + 1) + 1); }
    const chunk = (type, data) => { const b = Buffer.alloc(8 + data.length + 4); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8); const crc = zlib.crc32 ? zlib.crc32(Buffer.concat([Buffer.from(type), data])) : 0; b.writeUInt32BE(crc >>> 0, 8 + data.length); return b; };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W2, 0); ihdr.writeUInt32BE(H2, 4); ihdr[8] = 8; ihdr[9] = 6;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  };
  for (const [name, r] of [['syn1', r1], ['syn2', r2], ['syn3', r3]]) {
    const W2 = 440 * 2, H2 = 440, rgba = new Uint8ClampedArray(W2 * H2 * 4);
    for (let y = 0; y < H2; y++) for (let x = 0; x < 440; x++) {
      const i = y * 440 + x, o = (y * W2 + x) * 4, o2 = (y * W2 + 440 + x) * 4;
      for (let c = 0; c < 3; c++) rgba[o + c] = r.warp.rgb[i * 4 + c];
      rgba[o + 3] = 255;
      const v = Math.min(255, r.R[i] * 200);
      rgba[o2] = v; rgba[o2 + 1] = v; rgba[o2 + 2] = r.mask[i] ? v : 60; rgba[o2 + 3] = 255;
    }
    const col = { heart: [230, 60, 120], head: [60, 110, 230], life: [220, 40, 40], fate: [220, 170, 30], sun: [240, 120, 20] };
    for (const k of Object.keys(col)) {
      const run = r.lines[k].run;
      for (const p of r.lines[k].path) { const o = (p.y * W2 + 440 + p.x) * 4; rgba[o] = col[k][0] * 0.4; rgba[o + 1] = col[k][1] * 0.4; rgba[o + 2] = col[k][2] * 0.4; }
      if (run) for (const p of run.pts) for (const dx of [0, 1]) { const o = (p.y * W2 + p.x + dx) * 4; rgba[o] = col[k][0]; rgba[o + 1] = col[k][1]; rgba[o + 2] = col[k][2]; }
    }
    png(path.join(out, name + '.png'), W2, H2, rgba);
  }
  console.log('debug images →', out);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
