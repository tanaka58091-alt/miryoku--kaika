/* ============================================================
   shiki-vision-core.js — 写真から手相を読むための計算（v2.2）
   ・画面や外部ライブラリに頼らない、純粋な計算だけを置く（Node でもテストできる）
   ・手の21点（手首・指の関節・指先）の位置を受け取り、
       1) 手の形と指の長さを測る
       2) 手のひらの画像を「手首が下・指が上・親指が右」の向きにそろえ、
          しわ（暗く細い線）を強調した地図をつくり、
          線ごとに決めた範囲の中で、いちばんつながりのよい道筋をたどる
   ・写真はどこにも送らない。ここにあるのは計算だけ
   ============================================================ */
(function (global) {
  'use strict';

  // ---------- 小さな道具 ----------
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const norm = (a) => Math.hypot(a.x, a.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ============================================================
  // 1. 向きをそろえる（正規化した手のひら座標）
  //    手首(0)を下、中指の付け根(9)を真上、親指側を右に置く。左手は左右反転して右手と同じ向きにする
  // ============================================================
  const CAN = { W: 440, H: 440, cx: 220, cy: 400, L: 340 };

  function palmFrame(lm) {
    const O = lm[0], M = lm[9];
    const d = sub(M, O), l = norm(d) || 1;
    const u = { x: d.x / l, y: d.y / l };                 // 指の方向
    const v = { x: -u.y, y: u.x };
    const s = dot(sub(lm[5], lm[17]), v);
    const hand = s > 0 ? 'right' : 'left';                 // 手のひらをカメラに向けている前提
    const t = s > 0 ? v : { x: -v.x, y: -v.y };            // 親指の方向
    const k = CAN.L / l;
    const toCan = (p) => { const q = sub(p, O); return { x: CAN.cx + dot(q, t) * k, y: CAN.cy - dot(q, u) * k }; };
    const toImg = (X, Y) => { const a = (X - CAN.cx) / k, b = (CAN.cy - Y) / k; return { x: O.x + t.x * a + u.x * b, y: O.y + t.y * a + u.y * b }; };
    return { hand, k, toCan, toImg, P: lm.map(toCan) };
  }

  // 画像（RGBA）を正規化した座標に写し取る。しわが見えやすい緑を重めにした明るさを返す
  function warpPalm(img, frame) {
    const { W, H } = CAN, src = img.data, iw = img.width, ih = img.height;
    const gray = new Float32Array(W * H), rgb = new Uint8ClampedArray(W * H * 4), inside = new Uint8Array(W * H);
    for (let Y = 0; Y < H; Y++) {
      for (let X = 0; X < W; X++) {
        const p = frame.toImg(X + 0.5, Y + 0.5);
        const x = p.x - 0.5, y = p.y - 0.5;
        const i = Y * W + X;
        if (x < 0 || y < 0 || x > iw - 1.001 || y > ih - 1.001) continue;
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
        const o00 = (y0 * iw + x0) * 4, o10 = o00 + 4, o01 = o00 + iw * 4, o11 = o01 + 4;
        const px = (c) => (src[o00 + c] * (1 - fx) + src[o10 + c] * fx) * (1 - fy) + (src[o01 + c] * (1 - fx) + src[o11 + c] * fx) * fy;
        const r = px(0), g = px(1), b = px(2);
        gray[i] = 0.22 * r + 0.66 * g + 0.12 * b;
        rgb[i * 4] = r; rgb[i * 4 + 1] = g; rgb[i * 4 + 2] = b; rgb[i * 4 + 3] = 255;
        inside[i] = 1;
      }
    }
    return { gray, rgb, inside, W, H };
  }

  // ============================================================
  // 2. 手のひらの範囲（しわを探す場所）
  // ============================================================
  function palmPolygon(P) {
    const Wp = P[5].x - P[17].x, L = CAN.L;
    return [
      { x: P[5].x + 0.10 * Wp, y: P[5].y - 0.07 * L },
      { x: P[9].x, y: P[9].y - 0.11 * L },
      { x: P[13].x, y: P[13].y - 0.11 * L },
      { x: P[17].x - 0.04 * Wp, y: P[17].y - 0.09 * L },
      { x: P[17].x - 0.22 * Wp, y: P[17].y + 0.06 * L },
      { x: P[0].x - 0.46 * Wp, y: P[0].y - 0.14 * L },
      { x: P[0].x - 0.32 * Wp, y: P[0].y + 0.03 * L },
      { x: P[0].x + 0.30 * Wp, y: P[0].y + 0.03 * L },
      { x: P[1].x + 0.04 * Wp, y: P[1].y },
      { x: P[2].x - 0.10 * Wp, y: P[2].y },
      { x: P[5].x + 0.22 * Wp, y: P[5].y + 0.20 * L }
    ];
  }
  function fillPolygon(poly, W, H) {
    const m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const xs = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) m[y * W + x] = 1;
      }
    }
    return m;
  }
  function erode(m, W, H, r) {
    // 行方向→列方向の最小値フィルタ（正方形 2r+1）
    const t = new Uint16Array(W * H), o = new Uint8Array(W * H);   // 連続した長さ（255を超えるので16bit）
    for (let y = 0; y < H; y++) {
      let run = 0;
      for (let x = 0; x < W; x++) { run = m[y * W + x] ? run + 1 : 0; t[y * W + x] = run; }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      // 左右 r 以内がすべて 1 か
      const xr = Math.min(W - 1, x + r);
      if (x - r < 0 || t[y * W + xr] < (xr - (x - r) + 1)) continue;
      o[y * W + x] = 1;
    }
    const out = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) {
      let run = 0;
      const col = new Uint16Array(H);
      for (let y = 0; y < H; y++) { run = o[y * W + x] ? run + 1 : 0; col[y] = run; }
      for (let y = 0; y < H; y++) {
        const yb = Math.min(H - 1, y + r);
        if (y - r < 0 || col[yb] < (yb - (y - r) + 1)) continue;
        out[y * W + x] = 1;
      }
    }
    return out;
  }

  // ============================================================
  // 3. しわを強調した地図（多重スケールのヘッセ行列）
  // ============================================================
  function gaussKernel(s) {
    const r = Math.max(1, Math.ceil(s * 3)), k = new Float32Array(2 * r + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * s * s)); sum += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    return { k, r };
  }
  function blur(src, W, H, s) {
    const { k, r } = gaussKernel(s), tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        let a = 0;
        for (let i = -r; i <= r; i++) a += src[row + clamp(x + i, 0, W - 1)] * k[i + r];
        tmp[row + x] = a;
      }
    }
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        let a = 0;
        for (let i = -r; i <= r; i++) a += tmp[clamp(y + i, 0, H - 1) * W + x] * k[i + r];
        out[y * W + x] = a;
      }
    }
    return out;
  }
  // 大きなぼかしは箱ぼかし3回で近似（速さのため）
  function boxBlur(src, W, H, r) {
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
    for (let y = 0; y < H; y++) {
      let a = 0; const row = y * W;
      for (let i = -r; i <= r; i++) a += src[row + clamp(i, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = a / n;
        a += src[row + clamp(x + r + 1, 0, W - 1)] - src[row + clamp(x - r, 0, W - 1)];
      }
    }
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += tmp[clamp(i, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = a / n;
        a += tmp[clamp(y + r + 1, 0, H - 1) * W + x] - tmp[clamp(y - r, 0, H - 1) * W + x];
      }
    }
    return out;
  }

  // gray（明るさ）と area（手のひらの範囲）から、しわらしさの地図 R（1＝はっきりしたしわ）を返す
  //   inner：線を探してよい範囲（area をさらに内側へ縮めたもの。ふちの明暗をしわと取り違えないため）
  const RIDGE_FLOOR = 0.05;           // これより弱い凹凸は、どんな写真でもしわとは見なさない（肌のきめ・ノイズ）
  function ridgeMap(gray, W, H, area, inner) {
    // 明るさのむら（照明）を取り除く：手のひらの内側だけで大きくぼかした明るさで割る（背景の暗さを混ぜない）
    const gm = new Float32Array(W * H), mm = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { gm[i] = area[i] ? gray[i] : 0; mm[i] = area[i] ? 1 : 0; }
    let bg = gm, bw = mm;
    for (let i = 0; i < 3; i++) { bg = boxBlur(bg, W, H, 9); bw = boxBlur(bw, W, H, 9); }
    const N = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) N[i] = area[i] && bw[i] > 0.05 ? gray[i] / Math.max(8, bg[i] / bw[i]) : 1;
    const R = new Float32Array(W * H), ANG = new Float32Array(W * H);
    // 主な線は、細かいしわより太く深い。細すぎる尺度は使わない
    for (const s of [2.0, 2.8, 3.8, 5.0]) {
      const S = blur(N, W, H, s), s2 = s * s;
      for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
          const i = y * W + x;
          if (!inner[i]) continue;
          const xx = S[i - 1] - 2 * S[i] + S[i + 1];
          const yy = S[i - W] - 2 * S[i] + S[i + W];
          const xy = (S[i - W - 1] + S[i + W + 1] - S[i - W + 1] - S[i + W - 1]) / 4;
          const tr = (xx + yy) / 2, df = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
          const l1 = tr + df, l2 = tr - df;
          if (l1 <= 0) continue;                              // 暗い谷（しわ）だけ
          const r = s2 * (l1 - 0.7 * Math.abs(l2));            // 点のような暗がりは弱める
          if (r > R[i]) { R[i] = r; ANG[i] = 0.5 * Math.atan2(2 * xy, xx - yy) + Math.PI / 2; }   // 線の向き（谷を横切る向きに直交）
        }
      }
    }
    // 手のひらの中の上位3%の値でそろえる（写真ごとの写りの差をならす）。ただし線のない手で
    // ノイズを線に見せないよう、下限 RIDGE_FLOOR を設ける
    const vals = [];
    for (let i = 0; i < W * H; i++) if (inner[i]) vals.push(R[i]);
    vals.sort((a, b) => a - b);
    const p97 = vals.length ? vals[Math.floor(vals.length * 0.97)] : 0;
    const scale = Math.max(p97, RIDGE_FLOOR);
    for (let i = 0; i < W * H; i++) R[i] = inner[i] ? Math.min(1.6, R[i] / scale) : 0;
    R.p97 = p97; R.scale = scale; R.ang = ANG;
    return R;
  }

  // ============================================================
  // 4. 道筋をたどる（動的計画法）
  //    axis:'x' は x を1ずつ進め、各列で y を選ぶ。axis:'y' は y を進め、各行で x を選ぶ
  //    ・なるべく「しわらしさ」の高いところを通る
  //    ・急に曲がらない（1歩で動ける幅 maxStep、動いた分だけ減点 smooth）
  // ============================================================
  function trace(R, W, H, o) {
    const { axis, i0, i1, lo, hi, smooth = 0.05, bend = 0.04 } = o;   // 曲がりの減点は小さく（斜めの線は1歩ごとに階段状になるため）
    const stepOf = typeof o.maxStep === 'function' ? o.maxStep : () => (o.maxStep || 2);
    const MS = 4;                                             // 状態として持つ1歩の幅の上限
    const n = Math.abs(i1 - i0) + 1, lim = (axis === 'x' ? H : W) - 3;
    const ang = R.ang;
    const step = i1 >= i0 ? 1 : -1;
    // 1歩の向きと、その点のしわの向きがそろっているほど高い点（交差する別のしわに乗り移らないため）
    //   1歩の移動は、x 方向に進むとき (step, d)、y 方向に進むとき (d, step)
    const score = (i, j, d) => {
      const idx = axis === 'x' ? j * W + i : i * W + j;
      const r = R[idx];
      if (!r || !ang) return r;
      const dirA = axis === 'x' ? Math.atan2(d, step) : Math.atan2(step, d);
      const c = Math.abs(Math.cos(ang[idx] - dirA));
      return r * (0.15 + 0.85 * c * c * c * c);
    };
    const cols = [];
    let prev = null, prevA = 0;
    for (let c = 0; c < n; c++) {
      const i = i0 + c * step;
      if (i < 2 || i > (axis === 'x' ? W : H) - 3) continue;
      let a = Math.max(2, Math.ceil(lo(i))), b = Math.min(lim, Math.floor(hi(i)));
      if (b < a) { const m = clamp(Math.round((lo(i) + hi(i)) / 2), 2, lim); a = m; b = m; }
      const nj = b - a + 1, ms = Math.min(MS, stepOf(i));
      const cur = new Float32Array(nj * (2 * MS + 1)).fill(-1e9);   // [j][d]
      const bp = new Int32Array(nj * (2 * MS + 1)).fill(-1);
      for (let j = a; j <= b; j++) {
        for (let d = -ms; d <= ms; d++) {
          const k = (j - a) * (2 * MS + 1) + (d + MS);
          if (!prev) { cur[k] = score(i, j, d) - smooth * Math.abs(d); continue; }
          const pj = j - d;                                     // 1つ前の位置
          const pr = pj - prevA;
          if (pr < 0 || pr * (2 * MS + 1) >= prev.length) continue;
          let best = -1e9, arg = -1;
          for (let pd = -MS; pd <= MS; pd++) {
            const v = prev[pr * (2 * MS + 1) + (pd + MS)];
            if (v <= -1e8) continue;
            // 向きは直前の1歩とならした値で見る（斜めの線は 0,1,0,1… の階段になるため）
            const t = v - bend * Math.abs(d - pd) + score(i, j, (d + pd) / 2);
            if (t > best) { best = t; arg = pr * (2 * MS + 1) + (pd + MS); }
          }
          if (arg < 0) continue;
          cur[k] = best - smooth * Math.abs(d); bp[k] = arg;
        }
      }
      // どこにもつながらない列（範囲が大きく変わったとき）は、前の列のいちばん良い点から始め直す
      let any = false;
      for (let k = 0; k < cur.length; k++) if (cur[k] > -1e8) { any = true; break; }
      if (!any && prev) {
        let pb = 0; for (let k = 1; k < prev.length; k++) if (prev[k] > prev[pb]) pb = k;
        for (let j = a; j <= b; j++) { const k = (j - a) * (2 * MS + 1) + MS; cur[k] = prev[pb] + score(i, j, 0); bp[k] = pb; }
      }
      cols.push({ i, a, bp, cur });
      prev = cur; prevA = a;
    }
    if (!cols.length) return [];
    const last = cols[cols.length - 1];
    let kb = 0;
    for (let k = 1; k < last.cur.length; k++) if (last.cur[k] > last.cur[kb]) kb = k;
    const pts = [];
    let k = kb;
    for (let c = cols.length - 1; c >= 0 && k >= 0; c--) {
      const col = cols[c];
      const jj = col.a + Math.floor(k / (2 * MS + 1));
      const x = axis === 'x' ? col.i : jj, y = axis === 'x' ? jj : col.i;
      pts.push({ x, y, s: R[y * W + x] });
      k = col.bp[k];
    }
    return pts.reverse();
  }

  // 道筋のうち、しわが続いている区間を取り出す
  function strongRun(pts, thr, gapMax, anchor) {
    if (!pts.length) return null;
    const n = pts.length, sm = new Float32Array(n), w = 4;
    for (let i = 0; i < n; i++) {
      let a = 0, c = 0;
      for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) { a += pts[k].s; c++; }
      sm[i] = a / c;
    }
    const runs = [];
    let st = -1, lastOn = -1;
    for (let i = 0; i < n; i++) {
      if (sm[i] >= thr) {
        if (st < 0) st = i;
        else if (i - lastOn > gapMax) { runs.push([st, lastOn]); st = i; }
        lastOn = i;
      }
    }
    if (st >= 0) runs.push([st, lastOn]);
    if (!runs.length) return null;
    // 基本は最長の区間。anchor='start' のときは、始まり側 30% 以内から始まる区間を優先
    const score = (r) => (r[1] - r[0] + 1) * (anchor === 'start' && r[0] > n * 0.3 ? 0.55 : 1);
    runs.sort((p, q) => score(q) - score(p));
    let [a, b] = runs[0];
    while (a < b && pts[a].s < thr * 0.6) a++;           // なめらかにした値でつながった両端のうち、実際には弱い点を落とす
    while (b > a && pts[b].s < thr * 0.6) b--;
    let sum = 0;
    for (let i = a; i <= b; i++) sum += pts[i].s;
    return { a, b, pts: pts.slice(a, b + 1), len: b - a + 1, mean: sum / (b - a + 1), cover: (b - a + 1) / n };
  }

  // ============================================================
  // 5. 手相の線を読む
  // ============================================================
  function yAt(pts, x) {                          // x 方向に並んだ道筋の、x での y
    if (!pts || !pts.length) return null;
    let best = null, bd = 1e9;
    for (const p of pts) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } }
    return bd <= 3 ? best.y : null;
  }
  function xAt(pts, y) {
    if (!pts || !pts.length) return null;
    let best = null, bd = 1e9;
    for (const p of pts) { const d = Math.abs(p.y - y); if (d < bd) { bd = d; best = p; } }
    return bd <= 3 ? best.x : null;
  }
  const band = (x0, v0, x1, v1) => (x) => lerp(v0, v1, clamp((x - x0) / ((x1 - x0) || 1), 0, 1));

  const THR = 0.2;                                  // しわとみなす強さ（手のひら内の上位3%＝1）

  // 手相の見方の順にたどる：
  //   ① 生命線（親指のつけ根をまわる弧）→ ② その始まりから小指側へ伸びる知能線
  //   → ③ 知能線より上を、小指側のふちから伸びる感情線 → ④ 運命線・太陽線
  //   いちばん濃い横の線がいつも感情線とは限らない（知能線のほうが濃い手も多い）ため、始まる場所で見分ける
  function detectLines(R, P, W, H) {
    const L = CAN.L, Wp = P[5].x - P[17].x;
    const out = {};
    // 指の付け根（関節）を結んだ線。感情線・知能線はこれより下（手首側）を通る
    const mcpY = (x) => {
      const pts = [P[17], P[13], P[9], P[5]];
      if (x <= pts[0].x) return pts[0].y;
      for (let i = 1; i < pts.length; i++) if (x <= pts[i].x) return lerp(pts[i - 1].y, pts[i].y, (x - pts[i - 1].x) / ((pts[i].x - pts[i - 1].x) || 1));
      return pts[3].y;
    };

    // ① 生命線：人差し指と親指のあいだから、親指のつけ根をまわって手首へ
    //   内側の限界は、始まりは手のふち近く、中ほどで中指の下あたりまで、手首に向かって戻る形
    const ly0 = Math.round(Math.min(P[5].y + 0.10 * L, P[2].y - 0.05 * L)), ly1 = Math.round(P[0].y - 0.02 * L);
    const lt = (y) => clamp((y - ly0) / (ly1 - ly0), 0, 1);
    const lifeLo = (y) => {
      const t = lt(y);
      return t <= 0.4 ? lerp(P[5].x - 0.04 * Wp, P[9].x - 0.10 * Wp, Math.sin((t / 0.4) * Math.PI / 2))
                      : lerp(P[9].x - 0.10 * Wp, P[0].x - 0.08 * Wp, (t - 0.4) / 0.6);
    };
    const lifeHi = () => P[2].x + 0.05 * Wp;
    const lifePath = trace(R, W, H, { axis: 'y', i0: ly0, i1: ly1, lo: lifeLo, hi: lifeHi, maxStep: (y) => (lt(y) < 0.4 ? 4 : 3) });
    const lifeRun = strongRun(lifePath, THR, 16, 'start');
    out.life = { path: lifePath, run: lifeRun };
    const lifeTop = lifeRun ? lifeRun.pts[0] : { x: P[5].x + 0.10 * Wp, y: P[5].y + 0.22 * L };

    // ② 知能線：生命線の始まりのあたり（親指側のふち）から、小指側へ
    //   始まりは生命線の始まりの上下 0.10L 以内（つながっている／少し上から離れて始まる）
    const kx0 = Math.round(Math.max(lifeTop.x + 0.02 * L, P[5].x + 0.06 * Wp)), kx1 = Math.round(P[17].x - 0.16 * Wp);
    const kStartLo = lifeTop.y - 0.12 * L, kStartHi = lifeTop.y + 0.08 * L;
    const kLo = (x) => {
      const t = clamp((kx0 - x) / (0.25 * Wp), 0, 1);       // 始まりから 1/4 までで、範囲を広げる
      return Math.max(mcpY(x) + 0.08 * L, lerp(kStartLo, mcpY(x) + 0.08 * L, t));
    };
    const kHi = (x) => {
      const t = clamp((kx0 - x) / (0.25 * Wp), 0, 1);
      return lerp(kStartHi, P[0].y - 0.12 * L, t);
    };
    const headPath = trace(R, W, H, { axis: 'x', i0: kx0, i1: kx1, lo: kLo, hi: kHi, maxStep: 1 });   // 知能線は45°より急には曲がらない（別の線へ飛び移らないため）
    out.head = { path: headPath, run: strongRun(headPath, THR, 14, 'start') };
    const headRun = out.head.run;

    // ③ 感情線：小指側のふちから、人差し指の方へ（知能線より上）。薄い人も多いので基準を少し下げる
    const hx0 = Math.round(P[17].x - 0.18 * Wp), hx1 = Math.round(P[5].x + 0.04 * Wp);
    const hLo = (x) => mcpY(x) + 0.02 * L;                       // 指の付け根のしわは拾わない
    const hHi = (x) => {
      let v = mcpY(x) + lerp(0.30, 0.24, clamp((x - P[17].x) / Wp, 0, 1)) * L;
      const ky = headRun ? yAt(headRun.pts, x) : null;
      if (ky != null) v = Math.min(v, ky - 0.05 * L);
      return Math.max(v, hLo(x) + 4);
    };
    const heartPath = trace(R, W, H, { axis: 'x', i0: hx0, i1: hx1, lo: hLo, hi: hHi, maxStep: 2 });
    out.heart = { path: heartPath, run: strongRun(heartPath, THR * 0.85, 14, 'start') };

    // ④ 運命線：手首の上から、中指の方へまっすぐ（生命線より内側）
    const fy0 = Math.round(P[0].y - 0.03 * L), fy1 = Math.round(P[9].y + 0.12 * L);
    const fLo = () => P[9].x - 0.30 * Wp;
    const fHi = (y) => {
      let v = P[9].x + 0.24 * Wp;
      const lx = lifeRun ? xAt(lifeRun.pts, y) : null;
      if (lx != null) v = Math.min(v, lx - 0.05 * L);
      return v;
    };
    const fatePath = trace(R, W, H, { axis: 'y', i0: fy0, i1: fy1, lo: fLo, hi: fHi, maxStep: 1, smooth: 0.08, bend: 0.06 });
    out.fate = { path: fatePath, run: strongRun(fatePath, THR * 0.9, 12) };

    // 太陽線：薬指の下の縦の線（知能線から上）
    const sy0 = Math.round(P[13].y + 0.45 * L), sy1 = Math.round(P[13].y + 0.06 * L);
    const sunPath = trace(R, W, H, { axis: 'y', i0: sy0, i1: sy1, lo: () => P[13].x - 0.13 * Wp, hi: () => P[13].x + 0.10 * Wp, maxStep: 1, smooth: 0.08, bend: 0.06 });
    out.sun = { path: sunPath, run: strongRun(sunPath, THR * 1.1, 8) };
    return out;
  }

  // ============================================================
  // 6. 形を読み取って分類する
  // ============================================================
  function segLen(P, ids) { let s = 0; for (let i = 1; i < ids.length; i++) s += dist(P[ids[i - 1]], P[ids[i]]); return s; }

  // 手の形（火・地・風・水）と指
  function measureHand(P) {
    const palmLen = dist(P[0], P[9]), palmWid = dist(P[5], P[17]);
    const f = {
      thumb: segLen(P, [2, 3, 4]), index: segLen(P, [5, 6, 7, 8]), middle: segLen(P, [9, 10, 11, 12]),
      ring: segLen(P, [13, 14, 15, 16]), pinky: segLen(P, [17, 18, 19, 20])
    };
    const square = palmWid / palmLen;                // 大きいほど四角い手のひら
    const finger = f.middle / palmLen;               // 大きいほど指が長い
    const indexRing = f.index / f.ring;
    const pinkyRing = f.pinky / f.ring;
    const a = sub(P[4], P[2]), b = sub(P[8], P[5]);
    const thumbAngle = Math.acos(clamp(dot(a, b) / ((norm(a) * norm(b)) || 1), -1, 1)) * 180 / Math.PI;
    return { square, finger, indexRing, pinkyRing, thumbAngle, lengths: f };
  }
  // しきい値：MediaPipe で測った実際の手（実写2枚＋テスト写真5枚）のおおよそ中央の値。
  //   手のひらの幅/長さ 0.58〜0.65、中指の長さ/手のひら 0.87〜0.92 に分布した
  const HAND_T = { square: 0.61, finger: 0.89, indexRingHi: 1.03, indexRingLo: 0.97, pinkyLong: 0.79 };
  function classifyHand(m) {
    const sq = m.square >= HAND_T.square, longF = m.finger >= HAND_T.finger;
    const shape = sq ? (longF ? 'air' : 'earth') : (longF ? 'water' : 'fire');
    const indexRing = m.indexRing >= HAND_T.indexRingHi ? 'index' : m.indexRing <= HAND_T.indexRingLo ? 'ring' : 'even';
    const pinky = m.pinkyRing >= HAND_T.pinkyLong ? 'long' : 'standard';
    return { shape, indexRing, pinky };
  }

  // 線の濃さを「手のひら全体のしわの濃さ」と比べて3段階にする
  //   clear：手のひらの上位10%のしわより3割以上濃い／faint：上位10%並み／none：それ未満（読まない）
  function palmStats(R, mask) {
    const vals = [];
    for (let i = 0; i < R.length; i++) if (mask[i]) vals.push(R[i]);
    vals.sort((a, b) => a - b);
    const q = (p) => (vals.length ? vals[Math.floor((vals.length - 1) * p)] : 0);
    return { med: q(0.5), p90: q(0.9) };
  }
  function lineState(run, st, minLen) {
    if (!run || run.len < minLen) return 'none';
    const base = Math.max(THR, st.p90);
    if (run.mean >= base * 1.3) return 'clear';
    if (run.mean >= base) return 'faint';
    return 'none';
  }
  // 線の本当の終わり：なめらかにした濃さが、線の中ほどの濃さの 55% を下回るところまで
  function trimEnd(run) {
    const pts = run.pts, n = pts.length;
    if (n < 12) return run;
    const sorted = pts.map((p) => p.s).sort((a, b) => a - b), med = sorted[Math.floor(n / 2)];
    const w = 7;
    let end = n - 1;
    for (let i = n - 1; i > n * 0.4; i--) {
      let a = 0, c = 0;
      for (let k = Math.max(0, i - w); k <= i; k++) { a += pts[k].s; c++; }
      if (a / c >= med * 0.55) { end = i; break; }
      end = i - 1;
    }
    const kept = pts.slice(0, end + 1);
    return Object.assign({}, run, { pts: kept, len: kept.length, b: run.a + end });
  }

  // 線の分類。はっきり読めなかった線は state:'none'（その線については断定しない）
  function classifyLines(lines, P, st) {
    const L = CAN.L, Wp = P[5].x - P[17].x;
    const res = {};
    const lr = lines.life.run, hr = lines.head.run, fr = lines.fate.run, sr = lines.sun.run;
    const er = lines.heart.run ? trimEnd(lines.heart.run) : null;
    if (er) lines.heart.run = er;
    // 生命線：弧のふくらみ（親指から離れて手のひらの中央へ張り出すほど大きい弧）
    const lifeSt = lineState(lr, st, 0.3 * L);
    if (lifeSt !== 'none') {
      const xmin = Math.min(...lr.pts.map((p) => p.x));
      const reach = (P[5].x + 0.10 * Wp - xmin) / Wp;             // 始まりのふちから、どれだけ内側へ張り出すか
      const endY = lr.pts[lr.pts.length - 1].y;
      // 目安：実測の平均 0.48・ばらつき 0.04 の ±1 倍（「あなたらしさの核」と同じ基準）
      res.life = { key: reach >= 0.52 ? 'wide' : reach <= 0.44 ? 'narrow' : 'standard', long: endY >= P[0].y - 0.14 * L, state: lifeSt, reach };
    }
    // 知能線：傾き・長さ・始まり
    const headSt = lineState(hr, st, 0.3 * Wp);
    if (headSt !== 'none') {
      const s = hr.pts[0], e = hr.pts[hr.pts.length - 1];
      const ang = Math.atan2(e.y - s.y, s.x - e.x) * 180 / Math.PI;   // 下がりの角度
      const reachX = (P[5].x - e.x) / Wp;                              // 人差し指の付け根から小指側へ、どこまで届くか
      res.head = { key: ang < 12 ? 'straight' : ang < 27 ? 'gentle' : 'steep', angle: ang, long: reachX >= 0.85, state: headSt };
      if (lr) {
        const top = lr.pts.slice(0, Math.max(5, Math.round(lr.pts.length * 0.3)));
        const d = Math.min(...top.map((p) => dist(p, s)));
        res.headStart = d <= 0.06 * L ? 'joined' : 'apart';
      }
    }
    // 感情線：終わる位置とカーブ（はっきり読めたときだけ形を言う）
    const heartSt = lineState(er, st, 0.35 * Wp);
    if (heartSt !== 'none') {
      const e = er.pts[er.pts.length - 1];
      const t = (e.x - P[17].x) / Wp;                                  // 0=小指の付け根、1=人差し指の付け根
      const mid = er.pts[Math.floor(er.pts.length / 2)];
      const rise = (mid.y - e.y) / L;                                   // 終わりに向かって上がる量
      res.heart = { key: t >= 0.9 ? 'index' : t >= 0.66 ? 'between' : 'middle', curve: rise >= 0.07 ? 'curved' : 'straight', t, state: heartSt };
    }
    // 運命線：くっきり・うっすら（途中まで）・見当たらない
    const fateSt = lineState(fr, st, 0.14 * L);
    const from = fr ? (fr.pts[0].y >= P[0].y - 0.18 * L ? 'wrist' : 'middle') : null;
    if (fateSt === 'clear' && fr.cover >= 0.5) res.fate = { key: 'clear', from, state: 'clear' };
    else if (fateSt !== 'none') res.fate = { key: 'partial', from, state: fateSt };
    else res.fate = { key: 'none', state: 'none' };
    // 太陽線（はっきりあるときだけ）
    res.sun = lineState(sr, st, 0.12 * L) === 'clear';
    return res;
  }

  // 全体：画像と手の21点から読む
  function readPalm(img, lm) {
    const frame = palmFrame(lm);
    const P = frame.P;
    const warp = warpPalm(img, frame);
    const poly = palmPolygon(P);
    const area = fillPolygon(poly, CAN.W, CAN.H);
    for (let i = 0; i < area.length; i++) area[i] &= warp.inside[i];
    const mask = erode(area, CAN.W, CAN.H, 9);
    const R = ridgeMap(warp.gray, CAN.W, CAN.H, area, mask);
    const lines = detectLines(R, P, CAN.W, CAN.H);
    const hand = measureHand(P);
    const stats = palmStats(R, mask);
    return { hand: frame.hand, frame, P, warp, mask, R, poly, lines, stats, measure: hand, shape: classifyHand(hand), read: classifyLines(lines, P, stats) };
  }

  // 表示用：道筋を間引いてなめらかな線にする
  function simplify(pts, step) {
    if (!pts || pts.length < 2) return [];
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push({ x: Math.round(pts[i].x), y: Math.round(pts[i].y) });
    const l = pts[pts.length - 1];
    if (out[out.length - 1].x !== Math.round(l.x) || out[out.length - 1].y !== Math.round(l.y)) out.push({ x: Math.round(l.x), y: Math.round(l.y) });
    return out;
  }

  // ============================================================
  // 7. 顔：478点から、輪郭・三停・眉・目・鼻・口元・あごの比率を測る
  //    点の番号は MediaPipe Face Mesh の標準。R＝本人の右（写真では左側）
  // ============================================================
  const FM = {
    oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
    eyeR: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    eyeL: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    browRup: [70, 63, 105, 66, 107], browRlo: [46, 53, 52, 65, 55],
    browLup: [300, 293, 334, 296, 336], browLlo: [276, 283, 282, 295, 285],
    lipOut: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
    lipIn: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
    noseBridge: [168, 6, 197, 195, 5],
    noseBase: [129, 98, 97, 2, 326, 327, 358]
  };

  // 目の高さをそろえる（両目の黒目を結ぶ線を水平に）
  function faceFrame(lm) {
    const a = lm[468], b = lm[473];
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const th = Math.atan2(b.y - a.y, b.x - a.x), cs = Math.cos(-th), sn = Math.sin(-th);
    const P = lm.map((q) => { const dx = q.x - c.x, dy = q.y - c.y; return { x: dx * cs - dy * sn, y: dx * sn + dy * cs }; });
    // 写真が左右反転していても同じに扱えるよう、本人の右目（468）が左に来る向きにそろえる
    if (P[468].x > P[473].x) for (const q of P) q.x = -q.x;
    return { P, roll: th * 180 / Math.PI };
  }

  // 顔の向き（正面からどれだけずれているか）。行列があればそれを、なければ鼻先の位置で見る
  function facePose(P, matrix) {
    if (matrix && matrix.length >= 11) {
      const yaw = Math.asin(clamp(-matrix[2], -1, 1)) * 180 / Math.PI;
      const pitch = Math.atan2(matrix[6], matrix[10]) * 180 / Math.PI;
      return { yaw, pitch };
    }
    const mid = (P[234].x + P[454].x) / 2, w = Math.abs(P[454].x - P[234].x) || 1;
    return { yaw: ((P[1].x - mid) / w) * 90, pitch: 0 };
  }

  function browShape(P, up, lo, eyeH) {
    const tail = P[up[0]], head = P[up[up.length - 1]];
    const blen = Math.abs(head.x - tail.x) || 1;
    let arch = 0, peak = 0;
    for (let i = 1; i < up.length - 1; i++) {
      const q = P[up[i]], t = (q.x - tail.x) / (head.x - tail.x);
      const base = lerp(tail.y, head.y, t);
      if (base - q.y > arch) { arch = base - q.y; peak = i; }
    }
    let thick = 0;
    for (let i = 0; i < up.length; i++) thick += P[lo[i]].y - P[up[i]].y;
    thick /= up.length;
    const pk = P[up[peak]];
    const v1 = sub(tail, pk), v2 = sub(head, pk);
    const angle = Math.acos(clamp(dot(v1, v2) / ((norm(v1) * norm(v2)) || 1), -1, 1)) * 180 / Math.PI;
    return { len: blen, arch: arch / blen, tailDrop: (tail.y - head.y) / blen, thick: thick / eyeH, angle };
  }

  function faceMeasures(lm, matrix) {
    const { P, roll } = faceFrame(lm);
    const X = (a, b) => Math.abs(P[a].x - P[b].x), Y = (a, b) => Math.abs(P[a].y - P[b].y), D = (a, b) => dist(P[a], P[b]);
    const ipd = D(468, 473);
    const FW = X(234, 454), FL = Y(10, 152), JW = X(172, 397), CW = X(176, 400), FHW = X(54, 284);
    const upper = P[9].y - P[10].y, middle = P[2].y - P[9].y, lower = P[152].y - P[2].y;
    const eyeW = (D(33, 133) + D(263, 362)) / 2, eyeH = (Y(159, 145) + Y(386, 374)) / 2;
    const tilt = (o, i) => Math.atan2(P[i].y - P[o].y, Math.abs(P[o].x - P[i].x)) * 180 / Math.PI;   // 目尻が上ほど＋
    const bR = browShape(P, FM.browRup, FM.browRlo, eyeH), bL = browShape(P, FM.browLup, FM.browLlo, eyeH);
    const avg = (k) => (bR[k] + bL[k]) / 2;
    const mouthW = X(61, 291);
    const centerY = (P[13].y + P[14].y) / 2, cornerY = (P[61].y + P[291].y) / 2;
    return {
      pose: facePose(P, matrix), roll,
      // 輪郭
      lw: FL / FW, jw: JW / FW, cw: CW / FW, fw: FHW / FW,
      // 三停（上停は生え際ではなく額の上の方まで。比べるのは中停と下停が中心）
      upper: upper / middle, lowerMid: lower / middle,
      // 目
      eyeAspect: eyeH / eyeW, eyeTilt: (tilt(33, 133) + tilt(263, 362)) / 2, eyeGap: X(133, 362) / eyeW, eyeSize: eyeW / FW,
      // 眉
      browArch: avg('arch'), browTail: avg('tailDrop'), browThick: avg('thick'), browAngle: avg('angle'), browLen: avg('len') / eyeW,
      browEye: (((P[159].y - P[52].y) + (P[386].y - P[282].y)) / 2) / eyeH,          // 眉と目のあいだ（田宅宮）
      browGap: X(107, 336) / eyeW,                                                     // 眉と眉のあいだ（印堂）
      // 鼻
      noseLen: (P[2].y - P[168].y) / FL, noseWide: X(129, 358) / X(133, 362),
      // 口元
      mouthW: mouthW / ipd, lips: (Y(0, 13) + Y(14, 17)) / mouthW, lipUpper: Y(0, 13) / (Y(14, 17) || 1),
      mouthCorner: (centerY - cornerY) / mouthW,                                        // 口角が上がるほど＋
      // 人中・あご
      philtrum: Y(2, 0) / lower, chinLen: Y(17, 152) / lower
    };
  }

  // 線画用：顔の主な線を、幅300の枠に収めた点の列にする（写真そのものは残さない）
  function faceDrawing(lm) {
    const { P } = faceFrame(lm);
    const ids = new Set([].concat(FM.oval, FM.eyeR, FM.eyeL, FM.browRup, FM.browRlo, FM.browLup, FM.browLlo, FM.lipOut, FM.lipIn, FM.noseBridge, FM.noseBase, [468, 469, 471, 473, 474, 476, 50, 280]));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const i of FM.oval) { x0 = Math.min(x0, P[i].x); x1 = Math.max(x1, P[i].x); y0 = Math.min(y0, P[i].y); y1 = Math.max(y1, P[i].y); }
    const sc = 240 / ((x1 - x0) || 1), W = 300, H = Math.round((y1 - y0) * sc + 60);
    const pt = {};
    for (const i of ids) pt[i] = { x: Math.round((P[i].x - x0) * sc + 30), y: Math.round((P[i].y - y0) * sc + 30) };
    const seq = (arr) => arr.map((i) => [pt[i].x, pt[i].y]);
    const r1 = dist(pt[469], pt[471]) / 2 || 6, r2 = dist(pt[474], pt[476]) / 2 || 6;
    return {
      w: W, h: H,
      oval: seq(FM.oval), eyeR: seq(FM.eyeR), eyeL: seq(FM.eyeL),
      browR: seq(FM.browRup.concat(FM.browRlo.slice().reverse())), browL: seq(FM.browLup.concat(FM.browLlo.slice().reverse())),
      lipOut: seq(FM.lipOut), lipIn: seq(FM.lipIn), noseBridge: seq(FM.noseBridge), noseBase: seq(FM.noseBase),
      irisR: [pt[468].x, pt[468].y, Math.round(r1 * 10) / 10], irisL: [pt[473].x, pt[473].y, Math.round(r2 * 10) / 10],
      cheekR: [pt[50].x, pt[50].y], cheekL: [pt[280].x, pt[280].y]
    };
  }

  // ============================================================
  // 8. 顔の分類：基準（女性の顔の計測値の平均と標準偏差）からの離れ具合で決める
  //    FACE_REF は検証用の顔写真で計測した値（design/tmp/face-grid.html）
  // ============================================================
  //   値：検証用の女性の顔13枚（生成した写真）で計測した平均と、標準偏差の1.2倍（実際の顔はもっと多様なため少し広めに）
  const FACE_REF = {
    lw: [1.2454, 0.057], jw: [0.7669, 0.0251], cw: [0.3041, 0.011], fw: [0.8613, 0.0152], lowerMid: [0.8662, 0.0571], eyeAspect: [0.3667, 0.0413],
    eyeTilt: [7.1104, 2.0004], eyeGap: [1.3317, 0.0768], eyeSize: [0.1924, 0.0068], browArch: [0.1863, 0.0121], browTail: [0.1818, 0.0422],
    browThick: [0.5843, 0.0786], browAngle: [138.7287, 2.0989], browEye: [1.7827, 0.3289], browGap: [1.1629, 0.0544], noseLen: [0.317, 0.0095],
    noseWide: [1.1278, 0.0547], mouthW: [0.7888, 0.037], lips: [0.3416, 0.0252], mouthCorner: [0.0419, 0.0264], philtrum: [0.26, 0.0214],
    chinLen: [0.4802, 0.0222]
  };
  function classifyFace(m, ref) {
    const R = ref || FACE_REF;
    const Z = (k) => { const r = R[k]; return r ? (m[k] - r[0]) / (r[1] || 1) : 0; };
    // 輪郭：面長 → 逆三角形（あごが細い）→ ベース型（あごが広い）→ 丸顔（縦が短い）→ それ以外は卵型
    let outline = 'oval';
    if (Z('lw') >= 0.9) outline = 'long';
    else if (Z('jw') <= -0.8 && Z('cw') <= -0.5) outline = 'heart';
    else if (Z('jw') >= 0.8 && Z('lw') < 0.5) outline = 'square';
    else if (Z('lw') <= -0.8) outline = 'round';
    else if (Z('cw') <= -0.9 && Z('fw') >= 0.3) outline = 'heart';
    const thirds = Z('lowerMid') >= 0.6 ? 'lower' : Z('lowerMid') <= -0.6 ? 'middle' : 'balanced';
    let brow = 'arch';
    if (Z('browArch') <= -0.7) brow = 'straight';
    else if (Z('browTail') >= 0.9) brow = 'down';
    else if (Z('browAngle') <= -0.8 && Z('browArch') >= 0) brow = 'angled';
    const browThick = Z('browThick') >= 0.8 ? 'thick' : Z('browThick') <= -0.8 ? 'thin' : null;
    const browEye = Z('browEye') >= 0.7 ? 'eyeWide' : Z('browEye') <= -0.7 ? 'eyeNarrow' : null;
    const browGap = Z('browGap') >= 0.7 ? 'gapWide' : Z('browGap') <= -0.7 ? 'gapNarrow' : null;
    const eye = Z('eyeAspect') >= 0.5 ? 'round' : Z('eyeAspect') <= -0.5 ? 'almond' : 'standard';
    const eyeTilt = Z('eyeTilt') >= 0.7 ? 'up' : Z('eyeTilt') <= -0.7 ? 'down' : 'level';
    const eyeGap = Z('eyeGap') >= 0.7 ? 'gapWide' : Z('eyeGap') <= -0.7 ? 'gapClose' : null;
    const noseLen = Z('noseLen') >= 0.6 ? 'long' : Z('noseLen') <= -0.6 ? 'short' : 'standard';
    const noseWide = Z('noseWide') >= 0.7 ? 'wide' : Z('noseWide') <= -0.7 ? 'narrow' : null;
    const mouth = Z('mouthW') >= 0.6 ? 'big' : Z('mouthW') <= -0.6 ? 'small' : 'standard';
    const lips = Z('lips') >= 0.7 ? 'full' : Z('lips') <= -0.7 ? 'thin' : null;
    const corner = (Z('mouthCorner') >= 0.5 && m.mouthCorner >= 0.03) ? 'up' : m.mouthCorner <= 0.0 ? 'down' : 'flat';
    const chin = (Z('chinLen') >= 0.7 || Z('cw') >= 0.8) ? 'full' : Z('cw') <= -0.7 ? 'pointed' : 'standard';
    const philtrumLong = Z('philtrum') >= 0.9;
    // 顔立ちのタイプ（花・鳥・風・月）：やわらかさ（曲線）× 大人っぽさ
    const curve = (Z('browArch') + Z('eyeAspect') + Z('lips') + Z('cw') - Z('jw')) / 5;
    const adult = (Z('lw') + Z('lowerMid') + Z('noseLen') - Z('eyeSize')) / 4;
    const type = adult >= 0 ? (curve >= 0 ? 'hana' : 'tsuki') : (curve >= 0 ? 'tori' : 'kaze');
    return { outline, thirds, brow, browThick, browEye, browGap, eye, eyeTilt, eyeGap, noseLen, noseWide, mouth, lips, corner, chin, philtrumLong, type, curve, adult };
  }

  global.ShikiVisionCore = {
    CAN, THR, HAND_T, palmFrame, warpPalm, palmPolygon, fillPolygon, erode, blur, boxBlur, ridgeMap, trace, strongRun,
    detectLines, measureHand, classifyHand, classifyLines, palmStats, lineState, readPalm, simplify,
    FM, faceFrame, facePose, faceMeasures, faceDrawing, FACE_REF, classifyFace
  };
})(typeof window !== 'undefined' ? window : globalThis);
