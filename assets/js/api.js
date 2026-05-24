/* ============================================================
   api.js — Claude API クライアント（Cloudflare Worker 経由）
   - Worker URL: https://withered-math-09bamiryoku-api.tanaka58091.workers.dev/
   - sessionStorage キャッシュで同一プロフィールの再呼び出しを防止
   - 失敗時は null を返し、UI側で非AI版にフォールバック
   ============================================================ */
(function () {
  'use strict';

  const ENDPOINT = 'https://withered-math-09bamiryoku-api.tanaka58091.workers.dev/';
  const DEFAULT_MODEL = 'claude-opus-4-5';
  const CACHE_PREFIX = 'miryoku_ai_v1_';

  // ---------- ユーティリティ ----------
  function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function cacheKey(prefix, profile, calc) {
    const sig = JSON.stringify({
      y: profile.y, m: profile.m, d: profile.d,
      hour: profile.hour, sex: profile.sex,
      sei: profile.sei, mei: profile.mei,
      worryCat: profile.worryCat, worryText: profile.worryText,
      sun: calc.sunSign, lp: calc.lifePath, stem: calc.dayStem,
      anim: calc.animal && calc.animal.animal,
      six: calc.sixStar && calc.sixStar.star,
      nine: calc.nineStar, ven: calc.venusSign, asc: calc.ascendant
    });
    return CACHE_PREFIX + prefix + '_' + hashString(sig);
  }

  function readCache(key) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function writeCache(key, val) {
    try { sessionStorage.setItem(key, val); } catch (_) { /* quota or disabled */ }
  }

  // ---------- Claude 呼び出し ----------
  async function callClaude(messages, opts) {
    opts = opts || {};
    const body = {
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.max_tokens || 3500,
      messages: messages
    };
    if (opts.system) body.system = opts.system;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 90000);

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('Claude API ' + res.status + ': ' + t.slice(0, 200));
    }
    const json = await res.json();
    if (!json || !json.content || !json.content[0]) {
      throw new Error('Invalid Claude response');
    }
    return json.content.map(c => c.text || '').join('').trim();
  }

  // ---------- コンテキスト整形 ----------
  function buildContextSummary(profile, calc) {
    const D = window.CONTENT_DATA || {};
    const ZODIAC = D.ZODIAC || [];
    const STEMS = D.STEMS || [];
    const ANIMALS = D.ANIMALS || [];
    const NUM = D.NUMEROLOGY || {};
    const SIX = D.SIX_STAR || {};
    const WORRY = D.WORRY || {};

    const z = ZODIAC[calc.sunSign] || {};
    const venus = ZODIAC[calc.venusSign] || {};
    const asc = ZODIAC[calc.ascendant] || {};
    const stem = STEMS[calc.dayStem] || {};
    const animal = ANIMALS[(calc.animal && calc.animal.animal) || 0] || {};
    const num = NUM[calc.lifePath] || {};
    const six = SIX[calc.sixStar && calc.sixStar.star] || {};
    const worry = WORRY[profile.worryCat] || {};

    const sexLabel = profile.sex === 'male' ? '男性' : profile.sex === 'female' ? '女性' : 'その他/未回答';
    const hourLabel = (profile.hour !== null && profile.hour !== undefined && profile.hour !== '')
      ? profile.hour + '時頃' : '不明';

    return [
      '【相談者プロフィール】',
      '・お名前: ' + (profile.sei || '') + ' ' + (profile.mei || '') + ' 様',
      '・生年月日: ' + profile.y + '年' + profile.m + '月' + profile.d + '日',
      '・出生時刻: ' + hourLabel,
      '・性別: ' + sexLabel,
      '',
      '【占術結果（複数占術の統合）】',
      '・西洋占星術 太陽星座: ' + (z.name || '') + ' (' + (z.element || '') + ')',
      '・西洋占星術 上昇宮（簡易計算）: ' + (asc.name || ''),
      '・金星星座: ' + (venus.name || '')+ ' — 愛と美の在り方',
      '・四柱推命 日干: ' + (stem.name || '') + ' — ' + (stem.summary || stem.keyword || ''),
      '・動物占い: No.' + (calc.animal && calc.animal.number) + ' / ' + (animal.name || ''),
      '・九星気学: 本命星 ' + (calc.nineStar || '') + '星',
      '・六星占術: ' + (six.name || ''),
      '・数秘術 ライフパス: ' + calc.lifePath + ' (' + (num.title || '') + ')',
      '',
      '【相談者が選んだお悩みテーマ】',
      '・カテゴリ: ' + (worry.label || '（未選択）'),
      '・自由記述: ' + (profile.worryText ? profile.worryText : '（記述なし）')
    ].join('\n');
  }

  // ---------- AI 総合シンセシス生成 ----------
  async function generateLifeSynthesis(profile, calc) {
    const key = cacheKey('synth', profile, calc);
    const cached = readCache(key);
    if (cached) return cached;

    const ctx = buildContextSummary(profile, calc);

    const system = [
      'あなたは経験40年のベテラン占い師「美瑛（みえ）」です。',
      '東洋占術（四柱推命・九星気学・動物占い・六星占術）と西洋占術（占星術・数秘術）の両方に深く通じています。',
      '相談者は人生に悩みを抱え、勇気を出してこの診断を受けにきた女性です。優しく、しかし芯の通った言葉で、一人ひとり違う深い洞察を伝えてください。',
      '',
      '【絶対ルール】',
      '1. 出力は必ず純粋なHTMLのみ。使えるタグは <h3>, <h4>, <p>, <strong>, <em>, <ul>, <li>, <br>, <div class="block"> のみ。',
      '2. 全体で日本語2800〜3800字程度。抽象論を避け、占術結果から導かれる「その人だけの話」を書く。',
      '3. 「あなた」と二人称で語りかける。励ましだけでなく、痛みも認めた上で次の一歩を示す。',
      '4. 相談者のお悩み（自由記述）には必ず正面から触れ、占術の言葉で読み替えて答える。',
      '5. 最後に必ず <h3>今週やってみてほしい3つのこと</h3> と <ul><li>…</li></ul> を含める。',
      '6. 構成は: (a) この方の核 (b) 今の苦しさの正体 (c) 占術が示す転換点 (d) お悩みへの直接回答 (e) 今週の3アクション。',
      '7. ありきたりな「自分を大切に」だけで終わらせない。具体的な行動・時期・関係性に踏み込む。',
      '8. 占術用語を使うときは必ずカッコ内で意味を短く補足する。',
      '9. HTMLタグの前後に ```html などのコードブロック記号は付けない。'
    ].join('\n');

    const user = [
      ctx,
      '',
      'この方の人生全体を、上記の複数占術と悩みを総合して、AI×40年の知見ならではの深い洞察として一篇の文章に紡いでください。',
      '読み終えたとき、本人が「私のことが書かれている」「明日からこう動けばいい」と腑に落ちるレベルを目指してください。'
    ].join('\n');

    try {
      const text = await callClaude(
        [{ role: 'user', content: user }],
        { system: system, max_tokens: 4000, timeoutMs: 120000 }
      );
      writeCache(key, text);
      return text;
    } catch (err) {
      console.error('[ClaudeAPI generateLifeSynthesis]', err);
      return null;
    }
  }

  // ---------- カテゴリ別 AI 深掘り（任意呼び出し） ----------
  async function generateCategoryDeepDive(catId, catTitle, profile, calc) {
    const key = cacheKey('cat_' + catId, profile, calc);
    const cached = readCache(key);
    if (cached) return cached;

    const ctx = buildContextSummary(profile, calc);

    const system = [
      'あなたは経験40年のベテラン占い師です。複数占術を統合し、相談者一人ひとりに固有の洞察を返します。',
      '【出力ルール】',
      '・純粋なHTML（<h4>, <p>, <strong>, <ul>, <li>, <br>, <div class="block">）のみ。',
      '・日本語1200〜1800字程度。',
      '・「あなた」と語りかける。占術結果から導かれる固有の話を書く。',
      '・コードブロック記号は付けない。'
    ].join('\n');

    const user = [
      ctx,
      '',
      '【今回のセクション】 ' + catTitle + ' (' + catId + ')',
      '',
      'この方の上記プロフィールに基づき、このセクションのテーマに関して、AIならではの深い追加考察を書いてください。',
      '既に生成済みの基本セクションに「追記」として読まれる前提です。重複ではなく、占術結果の交差点から見える固有の洞察を。'
    ].join('\n');

    try {
      const text = await callClaude(
        [{ role: 'user', content: user }],
        { system: system, max_tokens: 2200, timeoutMs: 90000 }
      );
      writeCache(key, text);
      return text;
    } catch (err) {
      console.error('[ClaudeAPI generateCategoryDeepDive]', err);
      return null;
    }
  }

  // ---------- 公開 ----------
  window.ClaudeAPI = {
    ENDPOINT: ENDPOINT,
    callClaude: callClaude,
    buildContextSummary: buildContextSummary,
    generateLifeSynthesis: generateLifeSynthesis,
    generateCategoryDeepDive: generateCategoryDeepDive
  };
})();
