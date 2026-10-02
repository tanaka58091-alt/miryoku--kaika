/* 四季の40タイプ（v2.0）の計算テスト。 node tests/shiki.test.js */
const path = require('path');
global.window = globalThis;
global.document = { readyState: 'loading', addEventListener() {}, documentElement: { classList: { add() {}, remove() {} } } };
const root = path.join(__dirname, '..', 'assets', 'js');
require(path.join(root, 'ephemeris.js'));
require(path.join(root, 'calc.js'));
require(path.join(root, 'shiki-data.js'));
require(path.join(root, 'shiki-app.js'));
require(path.join(root, 'shiki-hands.js'));
const A = window.ShikiApp, D = window.ShikiData, H = window.ShikiHands;

let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else { fail++; console.log('✗', name, info === undefined ? '' : JSON.stringify(info)); } };
const typeOf = (y, m, d, hour) => A.readPerson({ y, m, d, hour: hour === undefined ? null : hour }).typeKey;

// --- タイプの確定 ---
ok('1980/3/15 は春の灯火', typeOf(1980, 3, 15) === 'hinoto-spring', typeOf(1980, 3, 15));
ok('2000/2/4 8時は立春前で冬', typeOf(2000, 2, 4, 8).endsWith('-winter'), typeOf(2000, 2, 4, 8));
ok('2000/2/4 22時は立春後で春', typeOf(2000, 2, 4, 22).endsWith('-spring'), typeOf(2000, 2, 4, 22));
ok('立夏の翌日は夏', typeOf(1990, 5, 7).endsWith('-summer'), typeOf(1990, 5, 7));
ok('立秋の翌日は秋', typeOf(1990, 8, 9).endsWith('-autumn'), typeOf(1990, 8, 9));
ok('立冬の翌日は冬', typeOf(1990, 11, 9).endsWith('-winter'), typeOf(1990, 11, 9));
ok('1月生まれは冬', typeOf(1975, 1, 20).endsWith('-winter'), typeOf(1975, 1, 20));
ok('夜子時：23時台は翌日の日干', A.readPerson({ y: 2000, m: 2, d: 4, hour: 22 }).stemIdx !== A.readPerson({ y: 2000, m: 2, d: 4, hour: 23 }).stemIdx);

// --- 時刻が分からないときの季節の境目 ---
const u = A.readPerson({ y: 2000, m: 2, d: 4, hour: null }).unc.season;
ok('立春当日は季節の境目として検出', !!u && u.before === 3 && u.after === 0, u);
ok('境目の時刻がそれらしい（2000年の立春は21時台）', u && u.hour > 20 && u.hour < 23, u && u.hour);
ok('ふつうの日は境目なし', A.readPerson({ y: 1980, m: 3, d: 15, hour: null }).unc.season === null);

// --- 日付の検証 ---
ok('2/30 は存在しない', !A.isRealDate(1980, 2, 30));
ok('平年の2/29 は存在しない', !A.isRealDate(1981, 2, 29));
ok('閏年の2/29 は存在する', A.isRealDate(1980, 2, 29));
ok('4/31 は存在しない', !A.isRealDate(1990, 4, 31));

// --- 1万人で40タイプの出現を確認（偏りが極端でないこと） ---
const count = {};
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const N = 10000;
for (let i = 0; i < N; i++) {
  const y = 1940 + Math.floor(rnd() * 70), m = 1 + Math.floor(rnd() * 12);
  const d = 1 + Math.floor(rnd() * new Date(y, m, 0).getDate());
  const k = typeOf(y, m, d); count[k] = (count[k] || 0) + 1;
}
const keys = Object.keys(count);
const min = Math.min(...Object.values(count)) / N * 100, max = Math.max(...Object.values(count)) / N * 100;
ok('1万人で40タイプすべてが出る', keys.length === 40, keys.length);
ok('どのタイプも 1.5%〜3.5% に収まる（均等なら2.5%）', min > 1.5 && max < 3.5, { min: min.toFixed(2), max: max.toFixed(2) });
ok('全タイプに解説データがある', keys.every((k) => D.TYPES[k] && D.TYPES[k].note && D.TYPES[k].catch));

// --- 相性：全100通りに種類が付き、向きが対称であること ---
const pairKind = { give: 'receive', receive: 'give', shape: 'shaped', shaped: 'shape', same: 'same', kango: 'kango' };
let allOk = true, symOk = true;
for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
  const c = A.compatOf(a, b), r = A.compatOf(b, a);
  if (!c || !D.COMPAT_TEXT[c.kind]) allOk = false;
  if (pairKind[c.kind] !== r.kind) symOk = false;
}
ok('相性：100通りすべてに解説がある', allOk);
ok('相性：AとB、BとAで向きが対称', symOk);
ok('干合：甲と己は惹かれ合う', A.compatOf(0, 5).kind === 'kango');
ok('比和：丙と丁は似た者どうし', A.compatOf(2, 3).kind === 'same');
ok('相生：木は火を育てる（甲→丙）', A.compatOf(0, 2).kind === 'give');

// --- 今の流れ ---
const per = A.periodOf(3);
ok('今年・今月の流れが出る', per.year && per.month && per.year.theme && per.month.theme, per);

// --- 数秘・星座 ---
const r = A.readPerson({ y: 1980, m: 3, d: 15, hour: 14 });
ok('1980/3/15 の太陽星座は魚座', r.sun === 11, r.sun);
ok('ライフパスに解説がある', !!D.LIFE_PATH[r.lp], r.lp);

// --- 手相（v2.1）：データと図がそろっていること ---
const PQ = D.PALM.questions;
ok('手相：6問ある', PQ.length === 6, PQ.length);
ok('手相：全選択肢に名前・解説・キーワードがある', PQ.every((q) => q.title && q.chapter && q.options.length >= 2 && q.options.every((o) => o.key && o.label && o.text && o.keyword)));
ok('手相：生命線・知能線・感情線には「人となり」の一言がある', ['life', 'head', 'heart'].every((k) => PQ.find((q) => q.key === k).options.every((o) => o.trait)));
const geo = { life: (k) => H.LIFE[k], headStart: (k) => H.headPaths(k, 'gentle'), head: (k) => H.headPaths('joined', k), heart: (k) => H.HEART[k], fate: (k) => H.FATE[k], marks: (k) => H.MARKS[k] };
ok('手相：全選択肢に図の線がある（運命線「見当たらない」以外）', PQ.every((q) => q.options.every((o) => { const g = geo[q.key](o.key); return Array.isArray(g) && (g.length > 0 || (q.key === 'fate' && o.key === 'none')); })));
ok('手相：全選択肢の図が描ける', PQ.every((q) => q.options.every((o) => /<svg[\s\S]*<\/svg>/.test(H.palmSvg('right', H.palmOptionLayers(q.key, o.key), '', q.key)))));
const pts = (d) => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const start = (d) => pts(d).slice(0, 2), end = (d) => pts(d).slice(-2);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const apartStart = start(H.headPaths('apart', 'gentle')[0]), joinedStart = start(H.headPaths('joined', 'gentle')[0]);
ok('手相：知能線「つながっている」は生命線と同じ点から始まる', dist(joinedStart, start(H.LIFE.wide[0])) < 1, joinedStart);
ok('手相：知能線「離れている」は生命線の始まりより上から始まる', apartStart[1] < joinedStart[1] - 10, apartStart);
const heartEnds = Object.values(H.HEART).flat().map(end);
ok('手相：感情線の終わりが知能線の始まりに重ならない', heartEnds.every((e) => dist(e, apartStart) >= 15 && dist(e, joinedStart) >= 15), heartEnds.map((e) => Math.round(Math.min(dist(e, apartStart), dist(e, joinedStart)))));
ok('手相：左手は左右反転して描く', /scale\(-1,1\)/.test(H.palmSvg('left', [], '')) && !/scale\(-1,1\)/.test(H.palmSvg('right', [], '')));
ok('手相：左手の拡大図は反対側を切り取る', /viewBox="22 136 150 110"/.test(H.palmSvg('left', [], '', 'headStart')) && /viewBox="128 136 150 110"/.test(H.palmSvg('right', [], '', 'headStart')));
const full = { life: 'wide', headStart: 'apart', head: 'fork', heart: 'fork', fate: 'clear', marks: ['sun', 'mystic'] };
ok('手相：選んだ線から手相図を組み立てる', H.palmComposite(full).length === 6, H.palmComposite(full).length);
const same = H.handsCompare('left', full, full), diff = H.handsCompare('left', full, Object.assign({}, full, { heart: 'index', life: 'narrow' }));
ok('手相：左右が同じなら「そのまま育ててきた」', /ほとんど同じ/.test(same) && !/lr-list/.test(same));
ok('手相：左右で違う線だけを並べ、右手のキーワードでまとめる', (diff.match(/<li>/g) || []).length === 2 && /マイペース・一途さ/.test(diff), diff.match(/lr-sum[^<]*<b>[^<]*/));

// --- 人相（v2.1） ---
const FQ = D.FACE.questions;
ok('人相：5問ある', FQ.length === 5, FQ.length);
ok('人相：全選択肢に解説・ヒント・キーワードがある', FQ.every((q) => q.title && q.chapter && q.options.every((o) => o.key && o.label && o.text && o.tip && o.keyword)));
ok('人相：全選択肢の図が描ける', FQ.every((q) => q.options.every((o) => /<svg[\s\S]*<path/.test(H.faceSvg(q.key, o.key)))));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
