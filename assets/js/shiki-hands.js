/* ============================================================
   shiki-hands.js — 手相・人相「図を見て選ぶ」方式（v2.1 → v2.2 からは予備の入口）
   ・v2.2 から、手相・人相は「写真1枚で読む」方式（shiki-photo.js）が基本。
     この図を見て選ぶ方式は、写真の読み取りが使えない端末や、写真を使いたくない人のための入口として残す
     （#palm/select・#palm/1〜6・#palm/answers／#face/1〜5・#face/answers）
   ・図を見比べていちばん近い形を選んでもらい、その組み合わせを読み解く。写真は見比べ用に画面に出すだけで、保存も送信もしない
   ・図はすべて SVG で描く（線の位置を正確にし、軽くするため）
   ============================================================ */
(function () {
  'use strict';
  const D = window.ShikiData;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };
  const KEYS = { palm: 'miryoku_shiki_palm_v1', face: 'miryoku_shiki_face_v1' };
  const photos = { palm: null, face: null };   // 見比べ用の写真（メモリ上だけ）

  // ============================================================
  // 手相の図（右手・手のひら側。左手は左右反転して描く）
  // ============================================================
  const HAND = 'M 86 382 C 72 350, 62 300, 64 250 C 65 215, 66 195, 66 178 L 66 118 C 66 96, 98 96, 98 118 L 98 176 L 100 176 L 100 82 C 100 58, 138 58, 138 82 L 138 160 L 140 160 L 140 68 C 140 42, 180 42, 180 68 L 180 160 L 182 160 L 182 90 C 182 66, 220 66, 220 90 L 220 170 C 221 185, 222 196, 224 205 C 238 200, 256 190, 272 176 C 286 164, 302 176, 292 192 C 280 212, 262 232, 250 258 C 238 286, 230 322, 222 350 C 218 364, 212 376, 206 382 Z';
  const LIFE = {
    wide:   ['M 219 198 C 160 214, 140 300, 186 374'],
    narrow: ['M 219 198 C 192 222, 184 300, 204 372'],
    fork:   ['M 219 198 C 164 214, 148 290, 176 338', 'M 176 338 C 166 352, 160 364, 156 376', 'M 176 338 C 184 352, 192 364, 200 376'],
    double: ['M 219 198 C 160 214, 140 300, 186 374', 'M 212 226 C 190 246, 184 300, 200 356']
  };
  const HEAD_START = { joined: [219, 198], apart: [219, 183] };   // 離れている＝生命線の始まりより少し上、手のひらの縁から
  function headPaths(start, dir) {
    const [x, y] = HEAD_START[start] || HEAD_START.joined;
    if (dir === 'straight') return [`M ${x} ${y} C ${x - 44} ${y + 8}, 126 210, 78 214`];
    if (dir === 'steep') return [`M ${x} ${y} C ${x - 42} ${y + 24}, 140 272, 116 320`];
    if (dir === 'fork') return [`M ${x} ${y} C ${x - 44} ${y + 14}, 130 232, 104 252`, 'M 104 252 C 96 250, 88 248, 78 246', 'M 104 252 C 98 262, 92 272, 86 282'];
    return [`M ${x} ${y} C ${x - 44} ${y + 14}, 128 234, 88 262`];   // gentle（既定）
  }
  const HEART = {
    index:   ['M 71 196 C 112 186, 160 176, 203 173'],
    between: ['M 71 196 C 110 188, 150 180, 181 170'],
    middle:  ['M 71 196 C 102 192, 132 188, 160 182'],
    fork:    ['M 71 196 C 110 187, 150 179, 182 176', 'M 182 176 C 188 172, 194 168, 200 164', 'M 182 176 C 188 179, 194 181, 201 183']
  };
  const FATE = {
    clear:   ['M 150 378 C 152 320, 156 250, 160 182'],
    partial: ['M 156 296 C 157 254, 158 218, 160 182'],
    none:    []
  };
  const MARKS = {
    sun:      ['M 124 296 C 122 250, 120 212, 119 178'],
    masukake: ['M 71 204 C 120 198, 170 200, 216 202'],
    mystic:   ['M 132 190 L 146 204', 'M 146 190 L 132 204'],
    buddha:   ['M 266 196 Q 276 187 286 196 Q 276 205 266 196 Z']
  };

  const CREASES = [
    'M 71 150 L 93 150', 'M 72 126 L 92 126',
    'M 105 132 L 133 132', 'M 106 100 L 132 100',
    'M 145 128 L 175 128', 'M 146 92 L 174 92',
    'M 187 140 L 215 140', 'M 188 108 L 214 108'
  ];
  // 見分けにくい質問だけ、関係するところを拡大して見せる（右手の座標で指定）
  const ZOOM = { headStart: [128, 136, 150, 110], heart: [56, 116, 190, 116] };
  function palmSvg(hand, layers, cls, zoomKey) {
    const flip = hand === 'left' ? ' transform="translate(300,0) scale(-1,1)"' : '';
    const draw = (paths, kind) => paths.map((d) => `<path d="${d}" class="pl-${kind}"/>`).join('');
    let vb = '0 0 300 400';
    const z = zoomKey && ZOOM[zoomKey];
    if (z) { const x = hand === 'left' ? 300 - z[0] - z[2] : z[0]; vb = `${x} ${z[1]} ${z[2]} ${z[3]}`; }
    return `<svg class="palm-svg ${cls || ''}${z ? ' palm-zoom' : ''}" viewBox="${vb}" aria-hidden="true"><g${flip}>
      <path d="${HAND}" class="pl-hand"/>
      ${CREASES.map((d) => `<path d="${d}" class="pl-crease"/>`).join('')}
      ${layers.map((l) => draw(l.paths, l.kind)).join('')}
    </g></svg>`;
  }
  function palmOptionLayers(qKey, oKey) {
    const faintMain = [{ paths: LIFE.wide, kind: 'faint' }, { paths: headPaths('joined', 'gentle'), kind: 'faint' }, { paths: HEART.between, kind: 'faint' }];
    switch (qKey) {
      case 'life': return [{ paths: LIFE[oKey], kind: 'main' }];
      case 'headStart': return [{ paths: LIFE.wide, kind: 'faint' }, { paths: headPaths(oKey, 'gentle'), kind: 'main' }];
      case 'head': return [{ paths: LIFE.wide, kind: 'faint' }, { paths: headPaths('joined', oKey), kind: 'main' }];
      case 'heart': return [{ paths: HEART[oKey], kind: 'main' }];
      case 'fate': return [{ paths: LIFE.wide, kind: 'faint' }, { paths: FATE[oKey], kind: 'main' }];
      case 'marks': return faintMain.concat([{ paths: MARKS[oKey], kind: 'mark' }]);
      default: return [];
    }
  }
  function palmComposite(a) {
    const L = [];
    if (a.life && LIFE[a.life]) L.push({ paths: LIFE[a.life], kind: 'main' });
    if (a.head || a.headStart) L.push({ paths: headPaths(a.headStart || 'joined', a.head || 'gentle'), kind: 'main' });
    if (a.heart && HEART[a.heart]) L.push({ paths: HEART[a.heart], kind: 'main' });
    if (a.fate && FATE[a.fate]) L.push({ paths: FATE[a.fate], kind: 'main' });
    (a.marks || []).forEach((m) => { if (MARKS[m]) L.push({ paths: MARKS[m], kind: 'mark' }); });
    return L;
  }

  // ============================================================
  // 人相の図
  // ============================================================
  const FACE_SVG = {
    outline: {
      round:    { vb: '0 0 100 120', d: ['M 50 14 C 84 14, 92 44, 92 66 C 92 94, 74 112, 50 112 C 26 112, 8 94, 8 66 C 8 44, 16 14, 50 14 Z'] },
      oval:     { vb: '0 0 100 120', d: ['M 50 10 C 80 10, 88 44, 84 74 C 80 100, 64 114, 50 114 C 36 114, 20 100, 16 74 C 12 44, 20 10, 50 10 Z'] },
      long:     { vb: '0 0 100 120', d: ['M 50 4 C 74 4, 80 36, 79 72 C 78 102, 64 118, 50 118 C 36 118, 22 102, 21 72 C 20 36, 26 4, 50 4 Z'] },
      square:   { vb: '0 0 100 120', d: ['M 18 36 C 18 12, 82 12, 82 36 L 83 82 C 83 94, 76 102, 64 108 C 58 111, 54 113, 50 113 C 46 113, 42 111, 36 108 C 24 102, 17 94, 17 82 Z'] },
      triangle: { vb: '0 0 100 120', d: ['M 12 38 C 12 10, 88 10, 88 38 C 88 62, 74 92, 50 114 C 26 92, 12 62, 12 38 Z'] }
    },
    brow: {
      straight: { vb: '0 0 120 40', d: ['M 52 21 L 12 20', 'M 68 21 L 108 20'] },
      arch:     { vb: '0 0 120 40', d: ['M 52 24 Q 32 8 12 22', 'M 68 24 Q 88 8 108 22'] },
      angled:   { vb: '0 0 120 40', d: ['M 52 23 L 28 12 L 12 22', 'M 68 23 L 92 12 L 108 22'] },
      down:     { vb: '0 0 120 40', d: ['M 52 18 Q 32 13 12 29', 'M 68 18 Q 88 13 108 29'] }
    },
    eye: {
      round:    { vb: '0 0 120 50', d: ['M 12 26 Q 30 8 50 26 Q 30 42 12 26 Z', 'M 70 26 Q 90 8 108 26 Q 90 42 70 26 Z'], iris: [[31, 25, 8], [89, 25, 8]] },
      almond:   { vb: '0 0 120 50', d: ['M 8 27 Q 30 15 52 25 Q 30 33 8 27 Z', 'M 68 25 Q 90 15 112 27 Q 90 33 68 25 Z'], iris: [[31, 25, 5], [89, 25, 5]] },
      droopy:   { vb: '0 0 120 50', d: ['M 10 32 Q 26 12 50 22 Q 34 36 10 32 Z', 'M 70 22 Q 94 12 110 32 Q 86 36 70 22 Z'], iris: [[31, 25, 6.5], [89, 25, 6.5]] },
      upturned: { vb: '0 0 120 50', d: ['M 10 18 Q 30 14 50 28 Q 26 38 10 18 Z', 'M 70 28 Q 90 14 110 18 Q 94 38 70 28 Z'], iris: [[31, 26, 6.5], [89, 26, 6.5]] }
    },
    nose: {
      high:  { vb: '0 0 80 90', d: ['M 37 6 C 39 30, 38 50, 34 64', 'M 24 72 Q 30 62 40 67 Q 50 62 56 72'] },
      round: { vb: '0 0 80 90', d: ['M 38 18 C 39 38, 37 52, 35 60', 'M 16 72 Q 20 56 34 66 Q 40 70 46 66 Q 60 56 64 72'] },
      small: { vb: '0 0 80 90', d: ['M 39 34 C 40 46, 39 54, 37 60', 'M 29 69 Q 33 62 40 66 Q 47 62 51 69'] }
    },
    mouth: {
      up:   { vb: '0 0 100 40', d: ['M 14 16 Q 50 36 86 16', 'M 14 16 L 10 12', 'M 86 16 L 90 12'] },
      flat: { vb: '0 0 100 40', d: ['M 14 22 Q 50 27 86 22'] },
      down: { vb: '0 0 100 40', d: ['M 14 27 Q 50 17 86 27'] }
    }
  };
  function faceSvg(qKey, oKey) {
    const g = FACE_SVG[qKey] && FACE_SVG[qKey][oKey];
    if (!g) return '';
    const iris = (g.iris || []).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" class="fc-iris"/>`).join('');
    return `<svg class="face-svg face-${qKey}" viewBox="${g.vb}" aria-hidden="true">${g.d.map((d) => `<path d="${d}" class="fc-line"/>`).join('')}${iris}</svg>`;
  }

  // ============================================================
  // 画面
  // ============================================================
  const CFG = {
    palm: { data: () => D.PALM, title: '手相で占う', total: () => D.PALM.questions.length, capture: 'environment', photoLabel: '手のひらを撮って、見比べながら選ぶ', hero: '_hero-palm' },
    face: { data: () => D.FACE, title: '人相で占う', total: () => D.FACE.questions.length, capture: 'user', photoLabel: '自撮りをして、見比べながら選ぶ', hero: '_hero-face' }
  };

  function load(kind) {
    const st = store.get(KEYS[kind]) || { hand: null, answers: {}, done: false, saved: {} };
    if (!st.saved) st.saved = (kind === 'palm' && st.done && st.hand) ? { [st.hand]: Object.assign({}, st.answers) } : {};   // 旧形式（片手だけ）の保存を引き継ぐ
    return st;
  }
  function save(kind, st) { store.set(KEYS[kind], st); }

  function photoBlock(kind) {
    const url = photos[kind];
    return `
      <div class="photo-assist">
        ${url ? `<div class="photo-frame"><img src="${url}" alt="見比べ用の写真"></div>` : ''}
        <label class="photo-btn">
          <input type="file" accept="image/*" capture="${CFG[kind].capture}" data-photo="${kind}" hidden>
          <span>${url ? '写真を撮り直す' : esc(CFG[kind].photoLabel)}</span>
        </label>
        <p class="fine">写真は、この画面に表示するだけです。保存も送信もしません。</p>
      </div>`;
  }

  function renderIntro(kind, root) {
    const st = load(kind);
    const heroStyle = `background-image:url('assets/img/types/${CFG[kind].hero}.jpg'), linear-gradient(135deg, #fbeff0, #f1ecf5)`;
    const savedHands = kind === 'palm' ? ['left', 'right'].filter((h) => st.saved && st.saved[h]) : [];
    const resume = kind === 'palm'
      ? savedHands.map((h) => `<button type="button" class="link-btn" data-show-hand="${h}">${esc(D.PALM.hands[h].label)}の結果を見る</button>`).join('')
      : (st.done ? `<a class="link-btn" href="#${kind}/answers">前回の結果を見る</a>` : '');
    if (kind === 'palm') {
      root.innerHTML = `
        <div class="hands-hero" style="${heroStyle}"></div>
        <h2 class="sec-title">図を見て選ぶ手相</h2>
        <p class="sec-lead">図を見ながら、あなたの手にいちばん近い形を選んでください。6つの質問で、あなたの手相を読み解きます。<br><a class="link-btn" href="#palm">写真1枚で占うほうへ戻る</a></p>
        <div class="hand-choose">
          <p class="hc-q">どちらの手を見ますか？</p>
          <div class="hc-grid">
            <button type="button" class="hc-btn" data-hand="left"><b>左手</b><span>生まれ持ったもの</span></button>
            <button type="button" class="hc-btn" data-hand="right"><b>右手</b><span>育ててきたもの</span></button>
          </div>
          <p class="fine">手相では、左手に生まれ持ったもの、右手にこれまで育ててきたものが表れるといわれます。迷ったら、左手から。</p>
        </div>
        <div class="intro-tip">明るい場所で、手を軽く開いて見てください。線が見えにくいときは、手を少しすぼめると浮かび上がります。</div>
        <p class="result-actions">${resume}</p>`;
    } else {
      root.innerHTML = `
        <div class="hands-hero" style="${heroStyle}"></div>
        <h2 class="sec-title">人相で占う</h2>
        <p class="sec-lead">お顔には、その人の気質が表れるといわれます。<br>鏡や自撮りを見ながら、いちばん近い形を選んでください。5つの質問で、あなたの人相と、印象を整えるヒントをお伝えします。</p>
        <div class="intro-tip">お化粧をしていない、自然な状態で見るのがおすすめです。人相は、表情や習慣で変わっていくものです。</div>
        <div class="start-row"><a class="btn btn-block" href="#face/1">人相を見てもらう</a></div>
        <p class="result-actions">${resume}</p>`;
    }
  }

  function renderQuestion(kind, n, root) {
    const data = CFG[kind].data();
    const q = data.questions[n - 1];
    if (!q) { location.replace(`#${kind}/answers`); return; }
    const st = load(kind);
    if (kind === 'palm' && !st.hand) { location.replace('#palm/select'); return; }
    const total = data.questions.length;
    const dots = Array.from({ length: total }, (_, i) => `<span class="${i < n ? 'on' : ''}"></span>`).join('');
    const chosen = st.answers[q.key];
    const opts = q.options.map((o) => {
      const on = q.multi ? (chosen || []).includes(o.key) : chosen === o.key;
      const art = kind === 'palm' ? palmSvg(st.hand, palmOptionLayers(q.key, o.key), '', q.key) : faceSvg(q.key, o.key);
      return `<button type="button" class="q-opt${on ? ' on' : ''}" data-q="${q.key}" data-o="${o.key}" aria-pressed="${on}">
        <span class="opt-art">${art}</span><span class="opt-label">${esc(o.label)}</span></button>`;
    }).join('');
    const handNote = kind === 'palm' ? `<p class="q-hand">${esc(D.PALM.hands[st.hand].label)}で見ています（図も${esc(D.PALM.hands[st.hand].label)}の向きです）</p>` : '';
    root.innerHTML = `
      <div class="q-head">
        <a class="q-back" href="#${kind}${n > 1 ? '/' + (n - 1) : (kind === 'palm' ? '/select' : '')}">← 戻る</a>
        <span class="q-count">${n} / ${total}</span>
      </div>
      <div class="q-dots" aria-hidden="true">${dots}</div>
      <p class="ch-label">${esc(CFG[kind].title)}</p>
      <h2 class="q-title">${esc(q.title)}</h2>
      <p class="q-ask">${esc(q.ask)}</p>
      <p class="q-hint">${esc(q.hint)}</p>
      ${handNote}
      ${photoBlock(kind)}
      <div class="opts${kind === 'face' ? ' opts-face' : ''}">${opts}</div>
      ${q.multi
        ? `<div class="q-next"><button type="button" class="btn btn-block" data-next="${kind}">${(chosen || []).length ? '選んだ印で読み解く' : 'どれも見当たらない'}</button></div>`
        : `<div class="q-skip"><button type="button" class="link-plain" data-skip="${kind}" data-q="${q.key}">よく分からないので、とばす</button></div>`}`;
  }

  function chips(list) { return `<ul class="type-keys hand-keys">${list.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`; }
  function typeTie() {
    const r = window.ShikiApp && window.ShikiApp.getReading && window.ShikiApp.getReading();
    if (!r) return `<div class="tie"><p>生年月日から読む「生まれ持った本質」とあわせて見ると、あなたの輪郭がもっとはっきりします。</p><a class="link-btn" href="#input">生年月日のタイプを見る</a></div>`;
    return `<div class="tie" data-season="${r.season.key}"><p>生年月日から読んだあなたは「<b>${esc(window.ShikiApp.typeName(r.stem, r.season))}</b>」タイプ。キーワードは「${esc((r.type.keywords || []).join('・'))}」。手相・人相とあわせて、あなたの輪郭を確かめてみてください。</p><a class="link-btn" href="#result">生まれ持った本質を読む</a></div>`;
  }

  // 左手（生まれ持ったもの）と右手（育ててきたもの）で、形が違う線を並べる
  function handsCompare(hand, cur, other) {
    const L = hand === 'left' ? cur : other, R = hand === 'left' ? other : cur;
    const Q = D.PALM.questions;
    const diffs = ['life', 'headStart', 'head', 'heart', 'fate'].map((k) => {
      const q = Q.find((x) => x.key === k);
      const lo = q && q.options.find((o) => o.key === L[k]), ro = q && q.options.find((o) => o.key === R[k]);
      return lo && ro && lo.key !== ro.key ? { q, lo, ro } : null;
    }).filter(Boolean);
    return `
      <section class="chapter lr-compare">
        <p class="ch-label">左手と右手</p>
        <h2>生まれ持ったものと、育ててきたもの</h2>
        ${diffs.length ? `
          <p>左手には生まれ持ったもの、右手にはこれまで育ててきたものが表れるといわれます。左右で形が違う線は、あなたが自分の生き方で育ててきたところです。</p>
          <ul class="lr-list">${diffs.map((d) => `<li><b>${esc(d.q.title)}</b>
            <span class="lr-cell"><i>左手</i>${esc(d.lo.label)}<em>${esc(d.lo.keyword)}</em></span>
            <span class="lr-cell"><i>右手</i>${esc(d.ro.label)}<em>${esc(d.ro.keyword)}</em></span></li>`).join('')}</ul>
          <p class="lr-sum">右手に表れているのは、あなたが育ててきた<b>「${esc(diffs.map((d) => d.ro.keyword).join('・'))}」</b>です。</p>`
        : `<p>左右の手で、主な線の形がほとんど同じでした。生まれ持った素質を、そのまままっすぐ育ててきた人といえます。</p>`}
      </section>`;
  }

  function renderPalmResult(root) {
    const st = load('palm');
    if (!st.hand) { location.replace('#palm/select'); return; }
    st.done = true;
    st.saved = st.saved || {};
    st.saved[st.hand] = Object.assign({}, st.answers);
    save('palm', st);
    const a = st.answers, Q = D.PALM.questions;
    const otherHand = st.hand === 'left' ? 'right' : 'left';
    const otherAns = st.saved[otherHand];
    const pick = (qk) => { const q = Q.find((x) => x.key === qk); return q && q.options.find((o) => o.key === a[qk]); };
    const life = pick('life'), head = pick('head'), heart = pick('heart'), start = pick('headStart'), fate = pick('fate');
    const marks = (a.marks || []).map((m) => Q.find((x) => x.key === 'marks').options.find((o) => o.key === m)).filter(Boolean);
    const keys = [life, start, head, heart, fate].filter(Boolean).map((o) => o.keyword).concat(marks.map((m) => m.keyword));
    const traits = [head && head.trait, heart && heart.trait].filter(Boolean);
    const sentence = life ? `${traits.length ? traits.join('、') + '、' : ''}${life.trait}人` : '';
    const section = (q, opt, extra) => opt ? `
      <section class="chapter">
        <p class="ch-label">${esc(q.title)}　${esc(opt.label)}</p>
        <h2>${esc(q.chapter)}</h2>
        <p>${esc(opt.text)}</p>${extra || ''}
      </section>` : '';
    const qOf = (k) => Q.find((x) => x.key === k);
    root.innerHTML = `
      <article class="hands-result">
        <p class="ch-label center">${esc(D.PALM.hands[st.hand].lead)}</p>
        <div class="palm-card">${palmSvg(st.hand, palmComposite(a), 'palm-big')}<p class="palm-caption">あなたが選んだ線で描いた、${esc(D.PALM.hands[st.hand].label)}の手相図</p></div>
        ${sentence ? `<p class="hands-sentence">あなたの手相が語るのは、<br><b>${esc(sentence)}</b>です。</p>` : ''}
        ${keys.length ? chips(keys) : ''}
        ${section(qOf('life'), life)}
        ${section(qOf('head'), head, start ? `<p class="sub-note"><b>${esc(start.label)}</b>　${esc(start.text)}</p>` : '')}
        ${!head && start ? section(qOf('headStart'), start) : ''}
        ${section(qOf('heart'), heart)}
        ${section(qOf('fate'), fate)}
        ${marks.length ? `<section class="chapter"><p class="ch-label">特別な印</p><h2>${esc(qOf('marks').chapter)}</h2>${marks.map((m) => `<p><b>${esc(m.label.replace(/（.*）/, ''))}</b>　${esc(m.text)}</p>`).join('')}</section>` : ''}
        ${otherAns ? handsCompare(st.hand, a, otherAns) : ''}
        ${typeTie()}
        <p class="disclaimer">手相は、生き方や年齢とともに変わっていくといわれます。いまの手が語ることとして、心に響いたところだけ受け取ってください。健康や将来を断定するものではありません。</p>
        <div class="next">
          <a class="btn" href="#palm">写真1枚で占ってみる</a>
          <a class="btn-outline" href="#face">人相でも占う</a>
          <button type="button" class="btn-outline" data-retry="palm">もう一度、図で選ぶ</button>
          ${otherAns
            ? `<button type="button" class="btn-outline" data-show-hand="${otherHand}">${esc(D.PALM.hands[otherHand].label)}の結果を見る</button>`
            : `<button type="button" class="btn-outline" data-other-hand="${otherHand}">${esc(D.PALM.hands[otherHand].label)}でも見てみる</button>`}
        </div>
      </article>`;
  }

  function renderFaceResult(root) {
    const st = load('face');
    st.done = true; save('face', st);
    const Q = D.FACE.questions;
    const picked = Q.map((q) => ({ q, o: q.options.find((o) => o.key === st.answers[q.key]) })).filter((x) => x.o);
    const keys = picked.map((x) => x.o.keyword);
    root.innerHTML = `
      <article class="hands-result">
        <p class="ch-label center">あなたの人相が語ること</p>
        <div class="face-grid">${picked.map((x) => `<div class="face-cell">${faceSvg(x.q.key, x.o.key)}<small>${esc(x.q.title)}</small><b>${esc(x.o.label)}</b></div>`).join('')}</div>
        ${keys.length ? `<p class="hands-sentence">あなたのお顔に表れているのは、</p>${chips(keys)}` : '<p class="hands-sentence">選んだ項目がありませんでした。</p>'}
        ${picked.map((x) => `
          <section class="chapter">
            <p class="ch-label">${esc(x.q.title)}　${esc(x.o.label)}</p>
            <h2>${esc(x.q.chapter)}</h2>
            <p>${esc(x.o.text)}</p>
            <div class="beauty-tip"><span>印象を整えるヒント</span><p>${esc(x.o.tip)}</p></div>
          </section>`).join('')}
        ${typeTie()}
        <p class="disclaimer">人相は、表情や習慣、お化粧で変わっていくものです。生まれつきの顔で人を決めつけるものではありません。今日の表情が、明日の人相をつくります。</p>
        <div class="next">
          <a class="btn" href="#face">写真1枚で占ってみる</a>
          <a class="btn-outline" href="#palm">手相でも占う</a>
          <button type="button" class="btn-outline" data-retry="face">もう一度、図で選ぶ</button>
        </div>
      </article>`;
  }

  function render(kind, step) {
    const root = $(`#${kind}-root`);
    if (!root) return;
    const photo = window.ShikiPhoto;
    if (!step || step === 'result') {                       // 写真で占う（基本）
      if (photo) return photo.render(kind, step || '');
      if (!step) return kind === 'palm' ? renderIntro('palm', root) : location.replace('#face/1');
      return location.replace(`#${kind}/answers`);
    }
    if (step === 'select') return renderIntro('palm', root);  // 図で選ぶ手相の入口（手の選択）
    if (step === 'answers') return (kind === 'palm' ? renderPalmResult : renderFaceResult)(root);
    renderQuestion(kind, parseInt(step, 10) || 1, root);
  }

  // ---------- 操作 ----------
  function startHand(hand) {
    const st = load('palm');
    st.hand = hand; st.answers = {}; st.done = false; st.saved = st.saved || {};
    save('palm', st);
    location.hash = '#palm/1';
  }
  document.addEventListener('click', (e) => {
    const hb = e.target.closest('.hc-btn');
    if (hb) {
      startHand(hb.getAttribute('data-hand')); return;
    }
    const other = e.target.closest('[data-other-hand]');
    if (other) { e.preventDefault(); startHand(other.getAttribute('data-other-hand')); return; }
    const show = e.target.closest('[data-show-hand]');
    if (show) {
      const st = load('palm'), h = show.getAttribute('data-show-hand');
      if (!st.saved || !st.saved[h]) return;
      st.hand = h; st.answers = Object.assign({}, st.saved[h]); st.done = true; save('palm', st);
      if (location.hash === '#palm/answers') { render('palm', 'answers'); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } else location.hash = '#palm/answers';
      return;
    }
    const opt = e.target.closest('.q-opt');
    if (opt) {
      const kind = location.hash.startsWith('#face') ? 'face' : 'palm';
      const qk = opt.getAttribute('data-q'), ok = opt.getAttribute('data-o');
      const data = CFG[kind].data(), q = data.questions.find((x) => x.key === qk);
      const st = load(kind);
      if (q.multi) {
        const cur = new Set(st.answers[qk] || []);
        cur.has(ok) ? cur.delete(ok) : cur.add(ok);
        st.answers[qk] = [...cur]; save(kind, st);
        render(kind, String(data.questions.indexOf(q) + 1));
        return;
      }
      st.answers[qk] = ok; save(kind, st);
      const n = data.questions.indexOf(q) + 1;
      setTimeout(() => { location.hash = n < data.questions.length ? `#${kind}/${n + 1}` : `#${kind}/answers`; }, 180);
      opt.classList.add('on');
      return;
    }
    const skip = e.target.closest('[data-skip]');
    if (skip) {
      const kind = skip.getAttribute('data-skip'), qk = skip.getAttribute('data-q');
      const data = CFG[kind].data(), st = load(kind);
      delete st.answers[qk]; save(kind, st);
      const n = data.questions.findIndex((x) => x.key === qk) + 1;
      location.hash = n < data.questions.length ? `#${kind}/${n + 1}` : `#${kind}/answers`;
      return;
    }
    const nx = e.target.closest('[data-next]');
    if (nx) { location.hash = `#${nx.getAttribute('data-next')}/answers`; return; }
    const rt = e.target.closest('[data-retry]');
    if (rt) {
      const kind = rt.getAttribute('data-retry');
      if (kind === 'palm') { location.hash = '#palm/select'; return; }   // 手相は手を選び直すところから（左右の結果は残す）
      store.del(KEYS[kind]);
      location.hash = '#face/1';
    }
  });
  document.addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-photo]');
    if (!inp || !inp.files || !inp.files[0]) return;
    const kind = inp.getAttribute('data-photo');
    if (photos[kind]) { try { URL.revokeObjectURL(photos[kind]); } catch (_) {} }
    photos[kind] = URL.createObjectURL(inp.files[0]);
    const step = (location.hash.split('/')[1]) || '';
    render(kind, step);
  });

  window.ShikiHands = { render, palmSvg, palmComposite, palmOptionLayers, handsCompare, faceSvg, FACE_SVG, LIFE, HEART, FATE, MARKS, headPaths };
})();
