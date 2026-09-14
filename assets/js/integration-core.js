/* ============================================================
   integration-core.js — 統合分析の中核（v=41）
   ・ブラウザ（window）でも Node（globalThis）でも動く純粋関数
   ・app.js の buildIntegration から呼ばれ、テストからも直接呼べる

   設計の要点
   1) 偶然一致の基準値を差し引く
      写像表（TAG_MAP）に多く現れるタグは、誰にでも「一致」して見える。
      各タグについて「何占術から出ると期待されるか」E[n] を表の構造から
      機械的に算出し、実際の一致数 n との差（z値）で判定する。
   2) 一致の階層
      際立った一致: n>=5 かつ z>=2.0
      一致        : n>=4 かつ z>=1.2
      それ未満は「共通傾向」とは呼ばない（上位傾向として表示するのみ）
   3) 二面性
      対立ペアの双方が n>=3・z>=0.5 で、補正スコアが拮抗（比 0.6〜1.67）
      のときだけ「二面性」と呼ぶ
   ============================================================ */
(function (global) {
  'use strict';

  const POSITIONAL = [1.0, 0.75, 0.55];     // 写像表での並び順＝主要度
  const TIERS = { high: { n: 5, z: 2.0 }, medium: { n: 4, z: 1.2 } };
  const DUAL  = { n: 3, z: 0.5, ratioLo: 0.6, ratioHi: 1.67 };

  function sourceValueOf(key, c){
    if (!c) return null;
    if (key === 'animal')  return c.animal  && typeof c.animal.animal === 'number' ? c.animal.animal : null;
    if (key === 'sixStar') return c.sixStar && typeof c.sixStar.star  === 'number' ? c.sixStar.star  : null;
    const v = c[key];
    if (typeof v !== 'number') return null;
    // 姓名の数秘は名前未入力だと 0 → ソース無しとして扱う
    if ((key === 'personalityNum' || key === 'soulNum') && v === 0) return null;
    return v;
  }

  function tagsOf(D, key, value){
    const map = D.TAG_MAP && D.TAG_MAP[key];
    if (!map || value == null) return [];
    const t = map[value];
    return Array.isArray(t) ? t : [];
  }

  // 各タグの期待一致数 E[n_t] = Σ_src P(src がタグ t を出す)
  function baselines(D, activeKeys){
    const en = {};
    activeKeys.forEach(key => {
      const map = D.TAG_MAP && D.TAG_MAP[key];
      if (!map) return;
      const values = Array.isArray(map) ? map : Object.values(map);
      if (!values.length) return;
      const hit = {};
      values.forEach(tags => { (tags || []).forEach(t => { hit[t] = (hit[t] || 0) + 1; }); });
      Object.keys(hit).forEach(t => { en[t] = (en[t] || 0) + hit[t] / values.length; });
    });
    return en;
  }

  function aggregate(D, c, opts){
    opts = opts || {};
    const SRC  = D.TAG_SOURCES || [];
    const DEFS = D.TAG_DEFS || {};
    if (!SRC.length || !Object.keys(DEFS).length) return null;

    // 1) 有効ソースと信号
    const active = [];
    const byTag = {};
    SRC.forEach(src => {
      const val = sourceValueOf(src.key, c);
      if (val == null) return;
      const tags = tagsOf(D, src.key, val);
      if (!tags.length) return;
      active.push(src);
      tags.forEach((tag, i) => {
        if (!DEFS[tag]) return;
        const w = src.weight * (POSITIONAL[i] != null ? POSITIONAL[i] : 0.4);
        if (!byTag[tag]) byTag[tag] = { tag: tag, score: 0, sources: [] };
        byTag[tag].score += w;
        byTag[tag].sources.push({ label: src.label, role: src.role, key: src.key });
      });
    });
    if (!active.length) return null;

    // 2) 偶然一致の基準値
    const en = baselines(D, active.map(s => s.key));

    const agg = Object.keys(byTag).map(t => {
      const e = byTag[t];
      const names = [...new Set(e.sources.map(s => s.label))];
      const n = names.length;
      const expected = Math.max(en[t] || 0, 0.3);
      const z = (n - expected) / Math.sqrt(expected);
      const lift = Math.min(3, Math.max(0.5, n / expected));
      const adj = e.score * Math.sqrt(lift);          // 偶然より出やすい度合いで補正
      let tier = null;
      if (n >= TIERS.high.n && z >= TIERS.high.z) tier = 'high';
      else if (n >= TIERS.medium.n && z >= TIERS.medium.z) tier = 'medium';
      return { tag: t, score: e.score, adj: adj, sources: e.sources, sourceNames: names,
               n: n, expected: expected, z: z, lift: lift, tier: tier };
    });

    // 3) 順位：補正スコア × 相談テーマの重み
    const themeW = opts.themeW || {};
    agg.forEach(a => { a.ranked = a.adj * (themeW[a.tag] || 1); });
    agg.sort((a, b) => b.ranked - a.ranked);

    const common = agg.filter(a => a.tier);
    const single = agg.filter(a => a.n === 1);

    // 4) 二面性
    const find = (t) => agg.find(a => a.tag === t);
    const duality = [];
    (D.TAG_OPPOSITES || []).forEach(pair => {
      const x = find(pair[0]), y = find(pair[1]);
      if (!x || !y) return;
      if (x.n < DUAL.n || y.n < DUAL.n || x.z < DUAL.z || y.z < DUAL.z) return;
      const ratio = x.adj / Math.max(y.adj, 1e-6);
      if (ratio < DUAL.ratioLo || ratio > DUAL.ratioHi) return;
      const strong = x.adj >= y.adj ? x : y, weak = x.adj >= y.adj ? y : x;
      const text = (D.DUALITY_TEXT || {})[strong.tag + '|' + weak.tag];
      if (text) duality.push({ strong: strong, weak: weak, text: text });
    });
    duality.sort((a, b) => (b.strong.adj + b.weak.adj) - (a.strong.adj + a.weak.adj));

    return {
      agg: agg, common: common, single: single, duality: duality,
      usedSources: active.map(s => s.label), activeKeys: active.map(s => s.key),
      top: agg.slice(0, 3)
    };
  }

  global.IntegrationCore = { sourceValueOf, tagsOf, baselines, aggregate, TIERS, DUAL, POSITIONAL };
})(typeof window !== 'undefined' ? window : globalThis);
