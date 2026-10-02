/* ============================================================
   shiki-photo.js — 写真1枚で占う手相・人相（v2.2）
   ・手のひら／お顔を1枚撮るだけ。点の読み取りは MediaPipe（端末の中だけ）、
     線と比率の計算は shiki-vision-core.js、文章は shiki-data.js（PALM_AUTO・FACE_AUTO）
   ・写真はこの画面を開いている間だけ使う。保存も送信もしない
     （端末に残すのは、読み取った結果の記号と、線画のための点の位置だけ）
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
  const KEY = { palm: 'miryoku_shiki_palm2_v1', face: 'miryoku_shiki_face2_v1' };
  const session = { palm: null, face: null };            // 撮った写真（この画面を開いている間だけ）
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const round = (v, d) => Math.round(v * (d || 10)) / (d || 10);
  const CORE = () => window.ShikiVisionCore;
  const VIS = () => window.ShikiVision;

  // ============================================================
  // 入口
  // ============================================================
  function heroStyle(kind) {
    return `background-image:url('assets/img/types/_hero-${kind}.jpg'), linear-gradient(135deg, #fbeff0, #f1ecf5)`;
  }
  function shootButtons(kind, again) {
    const cap = kind === 'palm' ? 'environment' : 'user';
    const main = kind === 'palm' ? (again || '手のひらを撮る') : (again || '自撮りする');
    return `
      <div class="shoot">
        <label class="btn btn-block shoot-main"><input type="file" accept="image/*" capture="${cap}" data-shoot="${kind}" hidden><span class="shoot-ico" aria-hidden="true"></span>${esc(main)}</label>
        <label class="btn-outline btn-block shoot-sub"><input type="file" accept="image/*" data-shoot="${kind}" hidden>アルバムから選ぶ</label>
      </div>`;
  }
  function renderIntro(kind, root) {
    const saved = store.get(KEY[kind]);
    let resume = '';
    if (kind === 'palm' && saved && saved.hands) {
      resume = ['left', 'right'].filter((h) => saved.hands[h]).map((h) => `<button type="button" class="link-btn" data-photo-show="${h}">${esc(D.PALM_AUTO.hands[h].label)}の結果を見る</button>`).join('');
    } else if (kind === 'face' && saved && saved.c) resume = '<a class="link-btn" href="#face/result">前回の結果を見る</a>';
    const palm = kind === 'palm';
    root.innerHTML = `
      <div class="photo-intro">
        <div class="hands-hero" style="${heroStyle(kind)}"></div>
        <p class="ch-label center">写真1枚で、${palm ? '手相' : '人相'}占い</p>
        <h2 class="sec-title">${palm ? '手のひらを、撮るだけ。' : 'お顔を、撮るだけ。'}</h2>
        <p class="sec-lead">${palm
          ? '手の形と、生命線・知能線・感情線・運命線を読み取って、<br>あなたの手相を読み解きます。'
          : '輪郭・眉・目・鼻・口元のバランスから、<br>あなたの顔立ちのタイプと、印象を整えるヒントをお伝えします。'}</p>
        ${shootButtons(kind)}
        <ul class="shoot-tips">
          ${palm
            ? '<li><b>明るい場所で</b><span>窓際や、明るい照明の下で</span></li><li><b>手のひらを大きく</b><span>手首から指先まで、画面いっぱいに</span></li><li><b>指を自然に開いて</b><span>手のひらを平らにして</span></li>'
            : '<li><b>正面から</b><span>カメラを目の高さにして</span></li><li><b>額と眉を出して</b><span>前髪を上げると、より正確に</span></li><li><b>真顔で</b><span>笑わない、自然な表情で</span></li>'}
        </ul>
        ${palm ? '<p class="shoot-note">左手は「生まれ持ったもの」、右手は「これまで育ててきたもの」を表すといわれます。どちらの手でも読めます。両手を撮ると、左右の違いも読み解きます。</p>' : ''}
        <p class="privacy"><b>写真はこの端末の中だけで読み取ります。保存も送信もしません。</b><br>初めてのときだけ、読み取りの準備に少し時間がかかります（約${palm ? '20' : '16'}MB・Wi-Fiがおすすめ）。</p>
        ${resume ? `<p class="result-actions">${resume}</p>` : ''}
        <p class="alt-link"><a href="#${kind}/${palm ? 'select' : '1'}">写真を使わずに、図を見て選ぶ</a></p>
      </div>`;
  }

  // ============================================================
  // 読み取り中
  // ============================================================
  const STEPS = {
    palm: ['準備', '手を探す', '線をたどる', '読み解く'],
    face: ['準備', 'お顔を探す', '比率を測る', '読み解く']
  };
  function renderAnalyzing(kind, root, url) {
    root.innerHTML = `
      <div class="analyzing" data-kind="${kind}">
        <div class="an-photo"><img src="${url}" alt=""><div class="an-scan"></div></div>
        <p class="an-msg" id="an-msg">準備しています…</p>
        <div class="an-bar"><span id="an-bar"></span></div>
        <ol class="an-steps">${STEPS[kind].map((s, i) => `<li data-i="${i}">${esc(s)}</li>`).join('')}</ol>
      </div>`;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  function step(i, msg, pct) {
    const m = $('#an-msg'); if (m && msg) m.textContent = msg;
    const b = $('#an-bar'); if (b && pct != null) b.style.width = Math.round(pct * 100) + '%';
    document.querySelectorAll('.an-steps li').forEach((li) => {
      const k = +li.getAttribute('data-i');
      li.classList.toggle('done', k < i); li.classList.toggle('on', k === i);
    });
  }
  function renderError(kind, root, title, body) {
    root.innerHTML = `
      <div class="photo-error">
        <p class="ch-label center">もう一度お願いします</p>
        <h2 class="sec-title">${esc(title)}</h2>
        <p class="sec-lead">${body}</p>
        ${shootButtons(kind, kind === 'palm' ? '手のひらを撮り直す' : '撮り直す')}
        <p class="alt-link"><a href="#${kind}/${kind === 'palm' ? 'select' : '1'}">写真を使わずに、図を見て選ぶ</a></p>
      </div>`;
  }

  async function analyze(kind, blob) {
    const root = $(`#${kind}-root`);
    if (!root) return;
    const V = VIS(), C = CORE();
    const url = URL.createObjectURL(blob);
    renderAnalyzing(kind, root, url);
    const t0 = performance.now();
    try {
      if (!V || !C || !V.supported()) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
      step(0, '読み取りの準備をしています…', 0.02);
      await V.load(kind === 'palm' ? 'hand' : 'face', (p) => step(0, p < 1 ? `読み取りの準備をしています… ${Math.round(p * 100)}%` : '準備ができました', p * 0.5));
      step(1, kind === 'palm' ? '手のひらを探しています…' : 'お顔を探しています…', 0.55);
      const canvas = await V.readImage(blob, kind === 'palm' ? 1800 : 1400);
      await wait(250);
      if (kind === 'palm') await analyzePalm(root, canvas, url);
      else await analyzeFace(root, canvas, url);
    } catch (e) {
      console.error(e);
      URL.revokeObjectURL(url);
      if (e && e.code === 'unsupported') renderError(kind, root, 'この端末では読み取れませんでした', 'お使いのブラウザでは、写真の読み取りができないようです。下の「図を見て選ぶ」から占えます。');
      else renderError(kind, root, '読み取りがうまくいきませんでした', '通信が不安定だったか、写真が大きすぎたかもしれません。もう一度お試しください。');
    }
    void t0;
  }

  // ---------- 手相 ----------
  async function analyzePalm(root, canvas, url) {
    const V = VIS(), C = CORE();
    const det = await V.detectHand(canvas);
    if (!det) {
      URL.revokeObjectURL(url);
      renderError('palm', root, '手のひらが見つかりませんでした', '明るい場所で、手首から指先までが画面に入るように撮ってください。指は自然に開いて、手のひら側をカメラに向けます。');
      return;
    }
    step(2, '線をたどっています…', 0.7);
    await wait(120);
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const r = C.readPalm({ data: data.data, width: canvas.width, height: canvas.height }, det.lm);
    // 手の甲を撮ったかもしれないとき（手の向きの判定が食い違う）
    const back = det.handedness && det.score >= 0.85 && det.handedness.toLowerCase() !== r.hand;
    step(3, '手相を読み解いています…', 0.9);
    await wait(500);
    const rd = r.read;
    const simplify = (run) => (run ? C.simplify(run.pts, 4).map((p) => [p.x, p.y]) : null);
    const lines = {};
    if (rd.life) lines.life = simplify(r.lines.life.run);
    if (rd.head) lines.head = simplify(r.lines.head.run);
    if (rd.heart) lines.heart = simplify(r.lines.heart.run);
    if (rd.fate && rd.fate.key !== 'none') lines.fate = simplify(r.lines.fate.run);
    if (rd.sun) lines.sun = simplify(r.lines.sun.run);
    const rec = {
      hand: r.hand, at: Date.now(), back,
      shape: r.shape, m: { square: round(r.measure.square, 1000), finger: round(r.measure.finger, 1000), indexRing: round(r.measure.indexRing, 1000), pinkyRing: round(r.measure.pinkyRing, 1000) },
      read: rd,
      draw: { P: r.P.map((p) => [Math.round(p.x), Math.round(p.y)]), lines }
    };
    const st = store.get(KEY.palm) || { hands: {} };
    st.hands = st.hands || {};
    st.hands[r.hand] = rec; st.current = r.hand;
    store.set(KEY.palm, st);
    session.palm = { hand: r.hand, rgb: r.warp.rgb, url };
    step(4, 'できました', 1);
    await wait(250);
    if (location.hash === '#palm/result') render('palm', 'result'); else location.hash = '#palm/result';
  }

  // ---------- 人相 ----------
  async function analyzeFace(root, canvas, url) {
    const V = VIS(), C = CORE();
    const det = await V.detectFace(canvas);
    if (!det) {
      URL.revokeObjectURL(url);
      renderError('face', root, 'お顔が見つかりませんでした', '正面から、お顔全体が画面に入るように撮ってください。明るい場所だと、より正確に読み取れます。');
      return;
    }
    step(2, '輪郭と、眉・目・鼻・口元の比率を測っています…', 0.72);
    await wait(300);
    const m = C.faceMeasures(det.lm, det.matrix);
    if (Math.abs(m.pose.yaw) > 20 || Math.abs(m.pose.pitch) > 25) {
      URL.revokeObjectURL(url);
      renderError('face', root, 'お顔が斜めを向いているようです', '比率を正しく測るために、カメラを目の高さにして、正面から撮ってください。');
      return;
    }
    const c = C.classifyFace(m);
    step(3, '人相を読み解いています…', 0.9);
    await wait(500);
    const keep = Object.keys(C.FACE_REF);
    const rec = { at: Date.now(), c, m: Object.fromEntries(keep.map((k) => [k, round(m[k], 1000)])), tilted: Math.abs(m.pose.yaw) > 10, draw: C.faceDrawing(det.lm) };
    store.set(KEY.face, rec);
    session.face = { url };
    step(4, 'できました', 1);
    await wait(250);
    if (location.hash === '#face/result') render('face', 'result'); else location.hash = '#face/result';
  }

  // ============================================================
  // 共通の部品
  // ============================================================
  function chips(list) { return `<ul class="type-keys hand-keys">${list.filter(Boolean).map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`; }

  // ---------- 呼びかけ（生年月日の入力でお名前があれば「〇〇さん」） ----------
  function reading() { return (window.ShikiApp && window.ShikiApp.getReading && window.ShikiApp.getReading()) || null; }
  function whoName() { const r = reading(); return r && r.p && r.p.name ? String(r.p.name).trim() : ''; }
  const whoSan = () => (whoName() ? `${whoName()}さん` : 'あなた');

  // ---------- あなたらしさの核 ----------
  function coreCallout(kind, list) {
    const top = list && list[0];
    if (!top || top.score < 0.6) return '';
    const where = kind === 'palm' ? '手' : 'お顔';
    const more = list.slice(1, 3).filter((d) => d.score >= 0.8).map((d) => `「${esc(d.phrase)}」`).join('と');
    return `
      <div class="core-callout">
        <span class="cc-label">${esc(whoSan())}らしさの核</span>
        <p>${esc(whoSan())}の${where}でいちばん個性が出ているのは、<b>「${esc(top.phrase)}」</b>。${more ? `次に${more}が目立ちます。` : ''}</p>
      </div>`;
  }

  // ---------- あなたの実測 ----------
  function measurePanel(kind, rec) {
    const rows = window.ShikiTotal ? window.ShikiTotal.measureRows(kind, rec) : [];
    if (!rows.length) return '';
    return `
      <section class="chapter measure">
        <p class="ch-label">${esc(whoSan())}の実測</p>
        <h2>写真から測った、${esc(whoSan())}の${kind === 'palm' ? '手' : 'お顔'}</h2>
        <ul class="ms-list">${rows.map((r) => `
          <li>
            <div class="ms-top"><span class="ms-label">${esc(r.label)}</span><span class="ms-right"><b class="ms-val">${esc(r.value)}</b><em class="ms-word${r.word === '平均に近い' ? ' is-avg' : ''}">${esc(r.word)}</em></span></div>
            <div class="ms-bar" aria-hidden="true"><i class="ms-avg"></i><i class="ms-dot" style="left:${r.pos}%"></i></div>
          </li>`).join('')}
        </ul>
        <p class="fine">中央の線が平均です（検証用の写真で測った目安）。平均から離れているところほど、${esc(whoSan())}らしさが出ているところです。</p>
      </section>`;
  }

  // ---------- 総合鑑定：3つの材料を集める ----------
  function collectSources() {
    const src = { name: whoName() };
    const r = reading();
    if (r) {
      const per = window.ShikiApp.periodOf ? window.ShikiApp.periodOf(r.stemIdx) : null;
      src.birth = {
        stemKey: r.stem.key, stemGogyo: D.GOGYO.indexOf(r.stem.gogyo), seasonKey: r.season.key, typeKey: r.typeKey,
        typeName: window.ShikiApp.typeName(r.stem, r.season), catch: r.type.catch, keyword: (r.type.keywords || [])[0] || '',
        period: per && per.year ? { theme: per.year.theme, tip: per.year.tip } : null
      };
    }
    const ps = store.get(KEY.palm);
    if (ps && ps.hands && (ps.hands.right || ps.hands.left)) {
      const hand = ps.hands.right ? 'right' : 'left', rec = ps.hands[hand];
      if (rec && rec.shape) src.palm = { shape: rec.shape.shape, rec, hand };
    }
    const fr = store.get(KEY.face);
    if (fr && fr.c) src.face = { type: fr.c.type, thirds: fr.c.thirds, rec: fr };
    return src;
  }
  function status() { const s = collectSources(); return { birth: !!s.birth, palm: !!s.palm, face: !!s.face }; }
  function statusChips(s) {
    const T = D.TOTAL.roles;
    const one = (k, href) => `<a class="ts-chip${s[k] ? ' on' : ''}" href="${href}"><small>${esc(T[k].from)}</small><b>${esc(T[k].label)}</b><i>${s[k] ? '読みました' : 'まだ'}</i></a>`;
    return `<div class="ts-chips">${one('birth', s.birth ? '#result' : '#input')}${one('palm', '#palm')}${one('face', '#face')}</div>`;
  }
  // 各結果画面の終わりに置く「総合鑑定」の入口
  function totalTeaser() {
    const src = collectSources(), T = D.TOTAL;
    const s = { birth: !!src.birth, palm: !!src.palm, face: !!src.face };
    const n = s.birth + s.palm + s.face;
    if (n >= 2 && window.ShikiTotal) {
      const syn = window.ShikiTotal.synthesize(src);
      return `
        <section class="total-teaser">
          <p class="ch-label center">${esc(T.title)}</p>
          <h2 class="tt-title">3つの角度を重ねた、${esc(whoSan())}だけの鑑定</h2>
          ${statusChips(s)}
          <p class="tt-sentence">${esc(syn.sentence)}。</p>
          <a class="btn btn-block" href="#total">総合鑑定を読む</a>
        </section>`;
    }
    return `
      <section class="total-teaser is-invite">
        <p class="ch-label center">${esc(T.title)}</p>
        <h2 class="tt-title">3つの角度を重ねると、${esc(whoSan())}だけの鑑定に</h2>
        ${statusChips(s)}
        <p class="tt-invite">${esc(T.invite)}</p>
      </section>`;
  }

  function card(label, title, body, tip) {
    return `
      <section class="chapter">
        <p class="ch-label">${label}</p>
        <h2>${esc(title)}</h2>
        ${body}
        ${tip ? `<div class="beauty-tip"><span>ひとことアドバイス</span><p>${esc(tip)}</p></div>` : ''}
      </section>`;
  }
  const P_ = (t) => (t ? `<p>${esc(t)}</p>` : '');

  // ============================================================
  // 手相の結果
  // ============================================================
  const LINE_ORDER = ['life', 'head', 'heart', 'fate', 'sun'];
  function lineColor(k) { const L = D.PALM_AUTO.lines[k]; return L ? L.color : '#999'; }

  // 写真の上に線を描いた図（写真があるときだけ）
  function palmPhotoCanvas(rec, rgb) {
    const W = 440, H = 440;
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.className = 'palm-photo';
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgb), W, H), 0, 0);
    const cx = c.getContext('2d');
    const flip = rec.hand === 'left';
    if (flip) { cx.translate(W, 0); cx.scale(-1, 1); }
    cx.drawImage(tmp, 0, 0);
    cx.setTransform(1, 0, 0, 1, 0, 0);
    drawLines(cx, rec, flip, W, true);
    return c;
  }
  function drawLines(cx, rec, flip, W, onPhoto) {
    for (const k of LINE_ORDER) {
      const pts = rec.draw.lines[k];
      if (!pts || pts.length < 2) continue;
      const faint = (k === 'fate' && rec.read.fate.state === 'faint') || (rec.read[k] && rec.read[k].state === 'faint');
      const path = () => { cx.beginPath(); pts.forEach(([x, y], i) => { const X = flip ? W - x : x; i ? cx.lineTo(X, y) : cx.moveTo(X, y); }); };
      cx.lineCap = 'round'; cx.lineJoin = 'round';
      if (onPhoto) { path(); cx.strokeStyle = 'rgba(255,255,255,.75)'; cx.lineWidth = 7; cx.setLineDash([]); cx.stroke(); }
      path(); cx.strokeStyle = lineColor(k); cx.lineWidth = onPhoto ? 3.6 : 4; cx.setLineDash(faint ? [7, 6] : []); cx.stroke();
    }
    cx.setLineDash([]);
  }
  // 写真がないとき（あとで開いたとき）：手の形と線だけの図
  function smoothClosed(a) {
    const pts = a.concat([a[0], a[1]]);
    let d = `M${((pts[0][0] + pts[1][0]) / 2).toFixed(1)},${((pts[0][1] + pts[1][1]) / 2).toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
    }
    return d + ' Z';
  }
  function palmSvg(rec) {
    const P = rec.draw.P, flip = rec.hand === 'left', W = 440;
    const fx = (x) => (flip ? W - x : x);
    const q = (i) => [fx(P[i][0]), P[i][1]];
    const Wp = Math.abs(P[5][0] - P[17][0]) || 200;
    const side = flip ? -1 : 1;                                   // 親指側の向き（図の上で）
    // 手のひらの輪郭：手首 → 親指のつけ根 → 指の付け根 → 小指側のふち
    const palm = [
      [fx(P[0][0]) + side * 0.30 * Wp, P[0][1] + 6], q(1), q(2),
      [fx(P[5][0]) + side * 0.05 * Wp, P[5][1] - 6], [fx(P[9][0]), P[9][1] - 10], [fx(P[13][0]), P[13][1] - 8],
      [fx(P[17][0]) - side * 0.06 * Wp, P[17][1] - 4], [fx(P[17][0]) - side * 0.20 * Wp, P[17][1] + 0.25 * Wp],
      [fx(P[0][0]) - side * 0.42 * Wp, P[0][1] - 0.3 * Wp], [fx(P[0][0]) - side * 0.28 * Wp, P[0][1] + 6]
    ];
    const finger = (ids, w) => `<polyline points="${ids.map((i) => q(i).join(',')).join(' ')}" class="hs-finger" stroke-width="${w.toFixed(1)}"/>`;
    const lines = LINE_ORDER.map((k) => {
      const pts = rec.draw.lines[k];
      if (!pts || pts.length < 2) return '';
      const faint = (k === 'fate' && rec.read.fate.state === 'faint') || (rec.read[k] && rec.read[k].state === 'faint');
      return `<polyline points="${pts.map(([x, y]) => `${fx(x)},${y}`).join(' ')}" class="hs-line" stroke="${lineColor(k)}"${faint ? ' stroke-dasharray="7 6"' : ''}/>`;
    }).join('');
    // 図の範囲：手全体（指先・親指・手首）が入るように
    const all = P.map((_, i) => q(i)).concat(palm);
    const pad = 0.14 * Wp;
    const x0 = Math.min(...all.map((p) => p[0])) - pad, x1 = Math.max(...all.map((p) => p[0])) + pad;
    const y0 = Math.min(...all.map((p) => p[1])) - pad, y1 = Math.max(...all.map((p) => p[1])) + pad * 0.6;
    return `<svg class="palm-drawing" viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}" aria-hidden="true">
      ${finger([1, 2, 3, 4], 0.22 * Wp)}${finger([5, 6, 7, 8], 0.2 * Wp)}${finger([9, 10, 11, 12], 0.21 * Wp)}${finger([13, 14, 15, 16], 0.2 * Wp)}${finger([17, 18, 19, 20], 0.17 * Wp)}
      <path d="${smoothClosed(palm)}" class="hs-palm"/>
      ${lines}
    </svg>`;
  }
  function legend(rec) {
    return `<ul class="line-legend">${LINE_ORDER.filter((k) => rec.draw.lines[k]).map((k) => `<li><i style="background:${lineColor(k)}"></i>${esc(D.PALM_AUTO.lines[k].title)}</li>`).join('')}</ul>`;
  }

  // 知能線・感情線は「〜し、」でつなぎ、最後の一つだけ「〜な／〜する」の形にして「人」で結ぶ
  function palmSentence(rec) {
    const A = D.PALM_AUTO, rd = rec.read;
    const t = [];
    if (rd.head && A.lines.head[rd.head.key]) t.push(A.lines.head[rd.head.key]);
    if (rd.heart && A.lines.heart[rd.heart.key]) t.push(A.lines.heart[rd.heart.key]);
    if (rd.life && A.lines.life[rd.life.key]) t.push(A.lines.life[rd.life.key]);
    if (!t.length) return '';
    return t.map((o, i) => (i === t.length - 1 ? (o.traitEnd || o.trait) : o.trait)).join('、') + '人';
  }

  function palmCards(rec) {
    const A = D.PALM_AUTO, rd = rec.read, out = [];
    const sh = A.shape[rec.shape.shape];
    out.push(card(`手の形　${esc(sh.sub)}`, `${sh.name} ― ${sh.keyword}の人`, P_(sh.text), sh.tip));
    // 生命線
    const L = A.lines;
    if (rd.life) {
      const o = L.life[rd.life.key];
      out.push(card(`<i class="dot" style="background:${L.life.color}"></i>${esc(L.life.title)}　${esc(o.label)}`, L.life.chapter,
        P_(o.text) + (rd.life.long ? P_(L.life.long) : '') + (rd.life.state === 'faint' ? P_(L.life.faint) : ''), o.tip));
    } else out.push(card(`${esc(L.life.title)}`, L.life.chapter, P_(A.unclear)));
    // 知能線
    if (rd.head) {
      const o = L.head[rd.head.key], st = rd.headStart && L.head[rd.headStart];
      out.push(card(`<i class="dot" style="background:${L.head.color}"></i>${esc(L.head.title)}　${esc(o.label)}`, L.head.chapter,
        P_(o.text) + (rd.head.long ? P_(L.head.long) : '') + (st ? `<p class="sub-note"><b>${esc(st.label)}</b>　${esc(st.text)}</p>` : '') + (rd.head.state === 'faint' ? P_(L.head.faint) : '')));
    } else out.push(card(`${esc(L.head.title)}`, L.head.chapter, P_(A.unclear)));
    // 感情線
    if (rd.heart) {
      const o = L.heart[rd.heart.key];
      out.push(card(`<i class="dot" style="background:${L.heart.color}"></i>${esc(L.heart.title)}　${esc(o.label)}`, L.heart.chapter,
        P_(o.text) + P_(L.heart[rd.heart.curve]) + (rd.heart.state === 'faint' ? P_(L.heart.faint) : '')));
    } else out.push(card(`${esc(L.heart.title)}`, L.heart.chapter, P_(L.heart.none)));
    // 運命線
    const fk = rd.fate.key === 'clear' ? (rd.fate.from === 'middle' ? 'clear_middle' : 'clear_wrist') : rd.fate.key;
    const fo = L.fate[fk];
    out.push(card(`${rd.fate.key !== 'none' ? `<i class="dot" style="background:${L.fate.color}"></i>` : ''}${esc(L.fate.title)}　${esc(fo.label)}`, L.fate.chapter, P_(fo.text)));
    if (rd.sun) out.push(card(`<i class="dot" style="background:${L.sun.color}"></i>${esc(L.sun.title)}`, 'あなたの手にある、幸運の印', P_(L.sun.text)));
    // 指
    const F = A.fingers, fi = F[rec.shape.indexRing];
    out.push(card(`指　${esc(fi.label)}`, '指が語る、才能のかたち', P_(fi.text) + (rec.shape.pinky === 'long' ? `<p class="sub-note"><b>${esc(F.pinkyLong.label)}</b>　${esc(F.pinkyLong.text)}</p>` : '')));
    return out.join('');
  }

  function palmKeywords(rec) {
    const A = D.PALM_AUTO, rd = rec.read, L = A.lines;
    const k = [A.shape[rec.shape.shape].keyword];
    if (rd.life) k.push(L.life[rd.life.key].keyword);
    if (rd.head) k.push(L.head[rd.head.key].keyword);
    if (rd.heart) k.push(L.heart[rd.heart.key].keyword);
    const fk = rd.fate.key === 'clear' ? (rd.fate.from === 'middle' ? 'clear_middle' : 'clear_wrist') : rd.fate.key;
    if (rd.fate.key !== 'none') k.push(L.fate[fk].keyword);
    if (rd.sun) k.push(L.sun.keyword);
    k.push(A.fingers[rec.shape.indexRing].keyword);
    return [...new Set(k)];
  }

  function palmCompare(st) {
    const l = st.hands.left, r = st.hands.right;
    if (!l || !r) return '';
    const A = D.PALM_AUTO, L = A.lines;
    const rows = [];
    const add = (title, a, b, ka, kb) => { if (a && b && a !== b) rows.push({ title, a, b, ka, kb }); };
    add('手の形', A.shape[l.shape.shape].name, A.shape[r.shape.shape].name, A.shape[l.shape.shape].keyword, A.shape[r.shape.shape].keyword);
    for (const k of ['life', 'head', 'heart']) {
      const a = l.read[k], b = r.read[k];
      if (a && b) add(L[k].title, L[k][a.key].label, L[k][b.key].label, L[k][a.key].keyword, L[k][b.key].keyword);
    }
    const fkey = (x) => (x.read.fate.key === 'clear' ? (x.read.fate.from === 'middle' ? 'clear_middle' : 'clear_wrist') : x.read.fate.key);
    add(L.fate.title, L.fate[fkey(l)].label, L.fate[fkey(r)].label, L.fate[fkey(l)].keyword, L.fate[fkey(r)].keyword);
    return `
      <section class="chapter lr-compare">
        <p class="ch-label">左手と右手</p>
        <h2>生まれ持ったものと、育ててきたもの</h2>
        ${rows.length ? `
          <p>左手には生まれ持ったもの、右手にはこれまで育ててきたものが表れるといわれます。左右で違うところは、あなたが自分の生き方で育ててきたところです。</p>
          <ul class="lr-list">${rows.map((d) => `<li><b>${esc(d.title)}</b>
            <span class="lr-cell"><i>左手</i>${esc(d.a)}<em>${esc(d.ka)}</em></span>
            <span class="lr-cell"><i>右手</i>${esc(d.b)}<em>${esc(d.kb)}</em></span></li>`).join('')}</ul>
          <p class="lr-sum">右手に表れているのは、あなたが育ててきた<b>「${esc([...new Set(rows.map((d) => d.kb))].join('・'))}」</b>です。</p>`
        : '<p>左右の手で、手の形も主な線もほとんど同じでした。生まれ持った素質を、そのまままっすぐ育ててきた人といえます。</p>'}
      </section>`;
  }

  function renderPalm(root) {
    const st = store.get(KEY.palm);
    const hand = st && (st.current || (st.hands && (st.hands.right ? 'right' : 'left')));
    const rec = st && st.hands && st.hands[hand];
    if (!rec) { location.replace('#palm'); return; }
    const A = D.PALM_AUTO, other = hand === 'left' ? 'right' : 'left';
    const sh = A.shape[rec.shape.shape];
    const sentence = palmSentence(rec);
    const photo = session.palm && session.palm.hand === hand;
    root.innerHTML = `
      <article class="hands-result photo-result">
        <p class="ch-label center">${esc(whoSan())}の${esc(A.hands[hand].lead)}</p>
        <div class="palm-card" id="palm-fig">
          ${photo ? '' : palmSvg(rec)}
          ${legend(rec)}
          <p class="palm-caption">${photo ? `${esc(whoSan())}の${esc(A.hands[hand].label)}から読み取った線` : `${esc(whoSan())}の${esc(A.hands[hand].label)}から読み取った手の形と線（写真は保存していません）`}</p>
        </div>
        ${rec.back ? '<p class="notice">手の甲が写っていたかもしれません。手のひら側を撮ると、より正確に読めます。</p>' : ''}
        <p class="hands-sentence">${esc(whoSan())}は、${esc(sh.trait)}<br><b>「${esc(sh.name)}」</b>の人。${sentence ? `<br>線が語るのは、${esc(sentence)}です。` : ''}</p>
        ${chips(palmKeywords(rec))}
        ${window.ShikiTotal ? coreCallout('palm', window.ShikiTotal.palmDistinct(rec)) : ''}
        ${measurePanel('palm', rec)}
        ${palmCards(rec)}
        ${palmCompare(st)}
        ${totalTeaser()}
        <p class="disclaimer">${esc(A.note)}</p>
        <div class="next">
          ${st.hands[other]
            ? `<button type="button" class="btn" data-photo-show="${other}">${esc(A.hands[other].label)}の結果を見る</button>`
            : `<label class="btn"><input type="file" accept="image/*" capture="environment" data-shoot="palm" hidden>${esc(A.hands[other].label)}も撮って、左右を比べる</label>`}
          <a class="btn-outline" href="#face">人相も占う</a>
          <label class="btn-outline"><input type="file" accept="image/*" capture="environment" data-shoot="palm" hidden>手のひらを撮り直す</label>
        </div>
      </article>`;
    if (photo) {
      const fig = $('#palm-fig');
      fig.insertBefore(palmPhotoCanvas(rec, session.palm.rgb), fig.firstChild);
    }
  }

  // ============================================================
  // 人相の結果
  // ============================================================
  function faceSvgDrawing(d, type) {
    const path = (a, close) => `M${a.map((p) => p.join(',')).join(' L')}${close ? ' Z' : ''}`;
    // なめらかな曲線にする（折れ線を2次ベジェでつなぐ）
    const smooth = (a, close) => {
      if (a.length < 3) return path(a, close);
      const pts = close ? a.concat([a[0], a[1]]) : a;
      let dstr = `M${((pts[0][0] + pts[1][0]) / 2).toFixed(1)},${((pts[0][1] + pts[1][1]) / 2).toFixed(1)}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        dstr += ` Q${pts[i][0]},${pts[i][1]} ${mx.toFixed(1)},${my.toFixed(1)}`;
      }
      return dstr + (close ? ' Z' : '');
    };
    const blush = d.cheekR && d.cheekL
      ? `<ellipse cx="${d.cheekR[0]}" cy="${d.cheekR[1]}" rx="26" ry="16" fill="url(#fd-blush)"/><ellipse cx="${d.cheekL[0]}" cy="${d.cheekL[1]}" rx="26" ry="16" fill="url(#fd-blush)"/>`
      : '';
    return `<svg class="face-drawing" viewBox="0 0 ${d.w} ${d.h}" aria-hidden="true" data-type="${type}">
      <defs><radialGradient id="fd-blush"><stop offset="0" stop-color="#f2a7ae" stop-opacity=".55"/><stop offset="1" stop-color="#f2a7ae" stop-opacity="0"/></radialGradient></defs>
      <path d="${smooth(d.oval, true)}" class="fd-oval"/>
      ${blush}
      <path d="${smooth(d.browR, true)}" class="fd-brow"/><path d="${smooth(d.browL, true)}" class="fd-brow"/>
      <path d="${smooth(d.eyeR, true)}" class="fd-eye"/><path d="${smooth(d.eyeL, true)}" class="fd-eye"/>
      <circle cx="${d.irisR[0]}" cy="${d.irisR[1]}" r="${d.irisR[2]}" class="fd-iris"/><circle cx="${d.irisL[0]}" cy="${d.irisL[1]}" r="${d.irisL[2]}" class="fd-iris"/>
      <path d="${smooth(d.noseBridge)}" class="fd-nose"/><path d="${smooth(d.noseBase)}" class="fd-nose"/>
      <path d="${smooth(d.lipOut, true)}" class="fd-lip"/><path d="${smooth(d.lipIn, true)}" class="fd-lipline"/>
    </svg>`;
  }

  function faceCards(c, meas) {
    const F = D.FACE_AUTO.parts, out = [];
    // 輪郭
    const o = F.outline[c.outline];
    out.push(card(`${esc(F.outline.title)}　${esc(o.label)}`, F.outline.chapter, P_(o.text), o.tip));
    // 眉
    const b = F.brow[c.brow];
    let bBody = P_(b.text);
    if (c.browThick) bBody += P_(F.brow[c.browThick]);
    const bSub = [c.browEye && F.brow[c.browEye], c.browGap && F.brow[c.browGap]].filter(Boolean);
    bBody += bSub.map((x) => `<p class="sub-note"><b>${esc(x.label)}</b>　${esc(x.text)}</p>`).join('');
    out.push(card(`${esc(F.brow.title)}　${esc(b.label)}`, F.brow.chapter, bBody, b.tip));
    // 目
    const e = F.eye[c.eye];
    let eBody = P_(e.text) + P_(F.eye[c.eyeTilt]);
    let eTip = e.tip;
    if (c.eyeTilt === 'up') eTip = F.eye.upTip; else if (c.eyeTilt === 'down') eTip = F.eye.downTip;
    if (c.eyeGap) { const g = F.eye[c.eyeGap]; eBody += `<p class="sub-note"><b>${esc(g.label)}</b>　${esc(g.text)}</p>`; eTip += g.tip; }
    out.push(card(`${esc(F.eye.title)}　${esc(e.label)}`, F.eye.chapter, eBody, eTip));
    // 鼻
    const n = F.nose[c.noseLen];
    out.push(card(`${esc(F.nose.title)}　${esc(n.label)}`, F.nose.chapter, P_(n.text) + (c.noseWide ? P_(F.nose[c.noseWide]) : ''),
      c.noseWide === 'wide' ? F.nose.tipWide : c.noseWide === 'narrow' ? F.nose.tipNarrow : F.nose.tip));
    // 口元
    const m = F.mouth[c.mouth];
    const mTip = c.corner === 'down' ? F.mouth.tipDown : c.lips === 'thin' ? F.mouth.tipThin : c.mouth === 'big' ? F.mouth.tipBig : c.mouth === 'small' ? F.mouth.tipSmall : F.mouth.tipThin;
    out.push(card(`${esc(F.mouth.title)}　${esc(m.label)}`, F.mouth.chapter, P_(m.text) + (c.lips ? P_(F.mouth[c.lips]) : '') + P_(F.mouth[c.corner]), mTip));
    // あご
    const ch = F.chin[c.chin];
    out.push(card(`${esc(F.chin.title)}　${esc(ch.label)}`, F.chin.chapter, P_(ch.text) + (c.philtrumLong ? P_(F.chin.philtrum) : ''), F.chin.tip));
    // その人の個性が強く出ている章から順に（同じ強さなら いつもの順）
    const parts = ['outline', 'brow', 'eye', 'nose', 'mouth', 'chin'];
    const sc = (meas && window.ShikiTotal) ? window.ShikiTotal.facePartScores(meas) : {};
    const order = parts.map((p, i) => ({ p, i, s: sc[p] || 0 })).sort((a, b) => (b.s - a.s) || (a.i - b.i));
    return order.map((o, k) => (k === 0 && o.s >= 0.6 ? out[o.i].replace('<section class="chapter">', `<section class="chapter is-core"><span class="core-badge">${esc(whoSan())}らしさがいちばん出ているところ</span>`) : out[o.i])).join('');
  }

  function fukuPoints(c) {
    const F = D.FACE_AUTO.parts, T = D.FACE_AUTO.thirds, pts = [];
    if (c.corner === 'up') pts.push({ t: '口角が上がった「福相」', d: '明るさが、よい縁と運を呼び込みます。' });
    if (c.browGap === 'gapWide') pts.push({ t: '広い眉間（印堂）', d: '運の入り口が広く、人の良さを見つける人。' });
    if (c.browEye === 'eyeWide') pts.push({ t: 'ゆとりある眉と目のあいだ（田宅宮）', d: 'おおらかさと、家庭運のしるし。' });
    if (c.noseWide === 'wide') pts.push({ t: 'しっかりした小鼻', d: '豊かさを蓄えるといわれる相。' });
    if (c.chin === 'full') pts.push({ t: 'しっかりしたあご（地閣）', d: '人生後半の人望と家庭運のしるし。' });
    if (c.thirds === 'lower') pts.push({ t: T.lower.label, d: '年齢を重ねるほど運が厚くなる相。' });
    if (c.philtrumLong) pts.push({ t: '長めの人中', d: '粘り強さと、人生後半の運の厚さ。' });
    if (c.eye === 'round') pts.push({ t: '表情豊かな目', d: '素直さと表現力で、人から愛されます。' });
    if (c.lips === 'full') pts.push({ t: 'ふっくらした唇', d: '情の深さと、愛情の豊かさのしるし。' });
    void F;
    return pts.slice(0, 3);
  }

  function renderFace(root) {
    const rec = store.get(KEY.face);
    if (!rec || !rec.c) { location.replace('#face'); return; }
    const A = D.FACE_AUTO, c = rec.c, T = A.types[c.type], TH = A.thirds;
    const pts = fukuPoints(c);
    const lm = rec.m.lowerMid || 0.87;
    const barMid = 100, barLow = Math.round(lm * 100);
    root.innerHTML = `
      <article class="hands-result photo-result face-result" data-type="${c.type}">
        <p class="ch-label center">${esc(whoSan())}のお顔から読み取った人相</p>
        <div class="face-card">
          ${faceSvgDrawing(rec.draw, c.type)}
          <p class="palm-caption">写真から描いた、${esc(whoSan())}のお顔の線画（写真は保存していません）</p>
        </div>
        <div class="face-type">
          <p class="ft-label">${esc(whoSan())}の顔立ちのタイプ</p>
          <p class="ft-name">${esc(T.name)}<small>${esc(T.reading)}</small></p>
          <p class="ft-catch">${esc(T.catch)}</p>
          <p class="ft-axis">${esc(T.axis)}</p>
        </div>
        ${rec.tilted ? '<p class="notice">お顔が少し斜めを向いていたため、左右の比率は目安です。正面から撮ると、より正確に読めます。</p>' : ''}
        <p class="hands-sentence">${esc(T.text)}</p>
        ${chips(T.keywords)}
        ${window.ShikiTotal ? coreCallout('face', window.ShikiTotal.faceDistinct(rec.m)) : ''}
        ${measurePanel('face', rec)}
        ${pts.length ? `<section class="chapter fuku"><p class="ch-label">${esc(whoSan())}のお顔の福相ポイント</p><h2>運を呼ぶ、${esc(whoSan())}の強み</h2><ol class="fuku-list">${pts.map((p) => `<li><b>${esc(p.t)}</b><span>${esc(p.d)}</span></li>`).join('')}</ol></section>` : ''}
        <section class="chapter">
          <p class="ch-label">${esc(TH.title)}　${esc(TH[c.thirds].label)}</p>
          <h2>${esc(TH.chapter)}</h2>
          <p class="thirds-intro">${esc(TH.intro)}</p>
          <div class="thirds-bars" aria-hidden="true">
            <div><span>中停<small>眉〜鼻の下</small></span><i style="width:${barMid}%"></i></div>
            <div><span>下停<small>鼻の下〜あご</small></span><i style="width:${Math.min(120, barLow)}%"></i></div>
          </div>
          ${P_(TH[c.thirds].text)}
          <div class="beauty-tip"><span>ひとことアドバイス</span><p>${esc(TH.tip)}</p></div>
        </section>
        ${faceCards(c, rec.m)}
        <section class="chapter look">
          <p class="ch-label">「${esc(T.name)}」の魅力を引き出す</p>
          <h2>メイク・髪・装いのヒント</h2>
          <dl class="look-list"><dt>メイク</dt><dd>${esc(T.beauty.make)}</dd><dt>髪</dt><dd>${esc(T.beauty.hair)}</dd><dt>装い</dt><dd>${esc(T.beauty.item)}</dd></dl>
        </section>
        ${totalTeaser()}
        <p class="disclaimer">${esc(A.note)}</p>
        <div class="next">
          <a class="btn" href="#palm">手相も占う</a>
          <label class="btn-outline"><input type="file" accept="image/*" capture="user" data-shoot="face" hidden>撮り直す</label>
        </div>
      </article>`;
  }

  // ============================================================
  // 総合鑑定（#total）— 生年月日・手相・人相を重ねて読む鑑定書
  // ============================================================
  function totalTiles(src) {
    const T = D.TOTAL.roles;
    const b = src.birth, pm = src.palm, fc = src.face;
    const head = (k) => `<small>${esc(T[k].label)}<i>${esc(T[k].from)}</i></small>`;
    const birth = b
      ? `<a class="tile" href="#result" data-season="${b.seasonKey}"><span class="tile-art tile-img" style="background-image:url('assets/img/types/thumb/${b.typeKey}.jpg'), linear-gradient(160deg, var(--s1), var(--s2))"></span>${head('birth')}<b>${esc(b.typeName)}</b><span>${esc(b.catch)}</span></a>`
      : `<a class="tile is-empty" href="#input"><span class="tile-art"></span>${head('birth')}<b>まだ</b><span>生年月日を入れる</span></a>`;
    const palm = pm
      ? `<a class="tile" href="#palm/result"><span class="tile-art">${palmSvg(pm.rec)}</span>${head('palm')}<b>${esc(D.PALM_AUTO.shape[pm.shape].name)}</b><span>${esc(D.PALM_AUTO.shape[pm.shape].keyword)}の人</span></a>`
      : `<a class="tile is-empty" href="#palm"><span class="tile-art"></span>${head('palm')}<b>まだ</b><span>手のひらを撮る</span></a>`;
    const face = fc
      ? `<a class="tile" href="#face/result"><span class="tile-art">${faceSvgDrawing(fc.rec.draw, fc.type)}</span>${head('face')}<b>${esc(D.FACE_AUTO.types[fc.type].name)}</b><span>${esc(D.FACE_AUTO.types[fc.type].catch)}</span></a>`
      : `<a class="tile is-empty" href="#face"><span class="tile-art"></span>${head('face')}<b>まだ</b><span>自撮りする</span></a>`;
    return `<div class="total-trio">${birth}${palm}${face}</div>`;
  }
  function renderTotal(root) {
    const T = D.TOTAL, src = collectSources();
    const n = !!src.birth + !!src.palm + !!src.face;
    const who = whoSan();
    const head = `
      <p class="ch-label center">${esc(T.title)}</p>
      <h1 class="total-title">${esc(who)}の総合鑑定</h1>
      <p class="total-sub">生年月日・手相・人相 ― 3つの角度を重ねて読む、${esc(who)}だけの鑑定書</p>
      ${totalTiles(src)}`;
    if (n < 2 || !window.ShikiTotal) {
      root.innerHTML = `<article class="total">${head}<p class="tt-invite">${esc(T.invite)}</p>
        <div class="next">${!src.palm ? '<a class="btn" href="#palm">手のひらを撮る</a>' : ''}${!src.face ? '<a class="btn" href="#face">自撮りして人相を見る</a>' : ''}${!src.birth ? '<a class="btn" href="#input">生年月日を入れる</a>' : ''}</div></article>`;
      return;
    }
    const syn = window.ShikiTotal.synthesize(src);
    root.innerHTML = `
      <article class="total">
        ${head}
        <section class="total-core">
          <p class="tc-label">ひとことで言うと</p>
          <p class="tc-sentence">${esc(who)}は、${esc(syn.sentence)}。</p>
        </section>
        <section class="chapter">
          <p class="ch-label">${esc(T.traitsTitle)}</p>
          <h2>${esc(who)}を形づくるもの</h2>
          <ul class="trait-list">${syn.traits.map((t) => `<li data-role="${t.role}"><small>${esc(t.label)}<i>${esc(t.from)}</i></small><b>${esc(t.text)}</b></li>`).join('')}</ul>
        </section>
        ${syn.sections.map((sec) => `
          <section class="chapter">
            <p class="ch-label">${esc(sec.chapter)}</p>
            ${sec.title ? `<h2>${esc(sec.title)}</h2>` : ''}
            <p>${esc(sec.text)}</p>
          </section>`).join('')}
        <p class="disclaimer">${esc(T.note)}</p>
        <div class="next">
          ${!src.palm ? '<a class="btn" href="#palm">手のひらも撮って、もっと深く</a>' : ''}
          ${!src.face ? '<a class="btn" href="#face">自撮りして、もっと深く</a>' : ''}
          ${!src.birth ? '<a class="btn" href="#input">生年月日も入れて、もっと深く</a>' : ''}
          ${src.birth ? '<a class="btn-outline" href="#result">生年月日の結果を見る</a>' : ''}
          ${src.palm ? '<a class="btn-outline" href="#palm/result">手相の結果を見る</a>' : ''}
          ${src.face ? '<a class="btn-outline" href="#face/result">人相の結果を見る</a>' : ''}
        </div>
      </article>`;
  }

  // ============================================================
  // 画面の切り替え
  // ============================================================
  function render(kind, step) {
    const root = $(`#${kind}-root`);
    if (!root) return;
    if (step === 'result') (kind === 'palm' ? renderPalm : renderFace)(root);
    else renderIntro(kind, root);
  }

  document.addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-shoot]');
    if (!inp || !inp.files || !inp.files[0]) return;
    const kind = inp.getAttribute('data-shoot');
    const f = inp.files[0];
    inp.value = '';
    if (kind === 'palm' && location.hash !== '#palm') history.replaceState(null, '', '#palm');
    if (kind === 'face' && location.hash !== '#face') history.replaceState(null, '', '#face');
    analyze(kind, f);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-photo-show]');
    if (!b) return;
    const st = store.get(KEY.palm);
    const h = b.getAttribute('data-photo-show');
    if (!st || !st.hands || !st.hands[h]) return;
    st.current = h; store.set(KEY.palm, st);
    if (location.hash === '#palm/result') { render('palm', 'result'); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } else location.hash = '#palm/result';
  });

  window.ShikiPhoto = { render, analyze, KEY, totalTeaser, renderTotal, status };
})();
