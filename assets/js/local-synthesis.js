/* ============================================================
   local-synthesis.js — 占術統合エンジン（端末内合成）
   ・生成AIは使用しない。calc（確定した占術結果）+ content DB を
     決定論的に組み合わせて総合鑑定HTMLを返す
   ・占術結果 × 悩みカテゴリ × エレメント で 2800〜3500字程度
   ・完全ゼロ課金・外部通信なし・同じ入力なら常に同じ出力
   ============================================================ */
(function (global) {
  'use strict';

  // ----------------------------------------------------------------
  // 安全に値を取り出すヘルパ
  // ----------------------------------------------------------------
  function safe(v, fallback){ return (v === undefined || v === null) ? (fallback || '') : v; }
  function esc(s){
    if (s === undefined || s === null) return '';
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  // ----------------------------------------------------------------
  // エレメント判定（西洋占星術の星座 → 火/土/風/水）
  // ----------------------------------------------------------------
  function elementOf(sunSignIdx, ZODIAC){
    const z = ZODIAC && ZODIAC[sunSignIdx];
    return (z && z.element) || '土';
  }

  // ----------------------------------------------------------------
  // ライフステージのインデックス算出（生年からの大まかな段階）
  // ----------------------------------------------------------------
  function stageIndex(yearOfBirth, LIFE_STAGE){
    if (!LIFE_STAGE || !LIFE_STAGE.length) return 0;
    const age = new Date().getFullYear() - yearOfBirth;
    if (age < 25) return 0;
    if (age < 35) return 1;
    if (age < 45) return 2;
    if (age < 55) return 3;
    if (age < 65) return 4;
    return Math.min(5, LIFE_STAGE.length - 1);
  }

  // ----------------------------------------------------------------
  // 名前の呼び方を整える
  // ----------------------------------------------------------------
  function nameOf(profile){
    const sei = (profile && profile.sei) || '';
    const mei = (profile && profile.mei) || '';
    return (sei + ' ' + mei).trim() || 'あなた';
  }

  // ----------------------------------------------------------------
  // 本体：合成診断HTMLを返す（Promise風だが同期処理）
  // ----------------------------------------------------------------
  // g = 統合分析の結果（buildIntegration の戻り値）。渡されると、
  //     エレメント4分岐だけに頼らず「何占術が一致したか」を織り込んだ文章になる。
  function generate(profile, calc, g){
    const D = global.CONTENT_DATA || {};
    const TAGS = D.TAG_DEFS || {};
    const tagLabel = (t) => (TAGS[t] && TAGS[t].label) || '';
    const Z = D.ZODIAC || [];
    const NUM = D.NUMEROLOGY || {};
    const SIX = D.SIX_STAR || [];
    const SANMEI = D.SANMEI || [];
    const JUSHO = D.JUSHO || [];
    const TSUUHEN = D.TSUUHEN || [];
    const ESSENCE = D.ESSENCE || {};
    const WORRY = D.WORRY || {};
    const LIFE_STAGE = D.LIFE_STAGE || [];
    const HEART_WEATHER = D.HEART_WEATHER || {};
    const LIFECYCLE = D.LIFECYCLE || {};
    const OPENLUCK = D.OPENLUCK_ACTION || {};
    const ROADMAP = D.ROADMAP || {};

    if (!profile || !calc) return '';

    // --- 基礎データを取り出す ---
    const elem = elementOf(calc.sunSign, Z);
    const z = Z[calc.sunSign] || {};
    const lp = NUM[calc.lifePath] || {};
    const six = SIX[calc.sixStar && calc.sixStar.star] || {};
    const polarity = calc.sixStar && calc.sixStar.polarity;
    const polarityLabel = polarity === 'plus' ? '＋（陽性）' : '−（陰性）';
    const sanmei = SANMEI[calc.sanmeiIdx] || {};
    const jusho = JUSHO[calc.jushoIdx] || {};
    const tsuuhen = TSUUHEN[calc.tsuuhenIdx] || {};
    const essence = ESSENCE[elem] || {};
    const stageIdx = stageIndex(profile.y, LIFE_STAGE);
    const stage = LIFE_STAGE[stageIdx] || {};
    const heart = HEART_WEATHER[elem] || {};
    const lifecycle = LIFECYCLE[elem] || {};
    const openluck = OPENLUCK[elem] || {};
    const roadmap = ROADMAP[elem] || {};

    // 悩みカテゴリ
    const worryKey = (profile.worryCat || 'love');
    const worry = WORRY[worryKey] || WORRY.love || {};
    const worryInnate = (worry.innate && worry.innate[elem]) || '';
    const worryAcquired = (worry.acquired && worry.acquired[elem]) || '';
    const worryActions = worry.actions || '';

    // ★悩みカテゴリ → 6軸キー の対応
    // worry: love / work / money / people / health / future / mind / self → JUSHO/TSUUHEN の6軸
    const worryToAxis = {
      love:'love', work:'work', money:'money', people:'people',
      health:'health', future:'luck', mind:'health', self:'work'
    };
    const axisKey = worryToAxis[worryKey] || 'luck';
    const axisLabel = {
      love:'恋愛', work:'仕事', money:'お金', people:'人間関係',
      health:'健康', luck:'開運'
    }[axisKey];
    const jushoAxis = jusho[axisKey] || '';
    const tsuuhenAxis = tsuuhen[axisKey] || '';

    // ★5天体から悩み軸に最も関連する天体を選ぶ
    const planetMap = {
      love: 'moon', work: 'mars', money: 'jupiter',
      people: 'mercury', health: 'saturn', luck: 'jupiter'
    };
    const planetKey = planetMap[axisKey] || 'jupiter';
    const PLANETS = D.PLANETS || {};
    const planet = PLANETS[planetKey] || {};
    const planetSignIdx = ({
      moon: calc.moonSign, mercury: calc.mercurySign, mars: calc.marsSign,
      jupiter: calc.jupiterSign, saturn: calc.saturnSign
    })[planetKey];
    const planetEntry = (planet.signs && planet.signs[planetSignIdx]) || null;
    const planetIsObj = planetEntry && typeof planetEntry === 'object';
    const planetSign = (Z[planetSignIdx] && Z[planetSignIdx].name) || '';

    // 動物60キャラ
    const ch = calc.animal && calc.animal.char;
    const gp = calc.animal && calc.animal.group;

    const fullName = nameOf(profile);
    const worryText = (profile.worryText || '').trim();
    const today = new Date();
    const todayStr = today.getFullYear() + '年' + (today.getMonth()+1) + '月' + today.getDate() + '日';

    // --- HTML組み立て ---
    const lines = [];

    // ===== ヘッダ =====
    lines.push(`<div class="block" style="text-align:center;margin-bottom:.8rem;">
      <div style="font-size:11px;letter-spacing:.4em;color:#a08060;margin-bottom:.4rem;">─ 全占術を結び直した総合鑑定 ─</div>
      <div style="font-size:13px;color:#8a6850;">${esc(todayStr)}　${esc(fullName)} 様へ</div>
    </div>`);

    // ===== (a) この方の核 =====
    lines.push(`<h3>① あなたの核 ─ 生まれ持った輪郭</h3>`);
    lines.push(`<p>${esc(fullName)}さま。あなたは西洋占星術では<strong>${esc(z.name)}</strong>（${esc(elem)}のエレメント）、数秘術では<strong>ライフパス${calc.lifePath}「${esc(lp.title||'')}」</strong>、そして算命学では<strong>${esc(sanmei.name||'')}</strong>として生まれていらっしゃいます。</p>`);
    // ★ タグ統合：どの傾向が何占術で一致しているかを本文に織り込む
    if (g && g.top && g.top.length){
      const t1 = g.top[0];
      // ラベルを個別にエスケープしてから連結する（連結後に esc すると
      // 区切りの <strong> まで文字列として出てしまうため）
      const others = g.top.slice(1).map(t => esc(tagLabel(t.tag))).filter(Boolean);
      lines.push(`<p>これら${g.usedSources.length}種類の占術を並べて突き合わせると、ばらばらに見える結果の奥に一本の線が通っているのが分かります。あなたの場合、それは<strong>「${esc(TAGS[t1.tag] ? TAGS[t1.tag].phrase : '')}」</strong>という質です。${esc(t1.sourceNames.slice(0,3).join('・'))}${t1.n>3?'ほか':''}——<strong>${t1.n}つの占術</strong>が、別々の言葉で同じことを告げています。${others.length?`そこに<strong>${others.join('</strong>と<strong>')}</strong>が重なるのが、${esc(fullName)}さまという組み合わせです。`:''}</p>`);
    }
    if (essence.essence) {
      lines.push(`<p>${esc(essence.essence)}</p>`);
    }
    lines.push(`<p>四柱推命の通変星で見ると、あなたは<strong>${esc(tsuuhen.name||'')}</strong>の星をお持ちです。${esc(tsuuhen.msg||'')}</p>`);
    lines.push(`<p>そして算命学の十二大従星では<strong>${esc(jusho.name||'')}</strong>（人生エネルギー：${esc(jusho.energy||'')}）。${esc(jusho.msg||'')}</p>`);
    if (ch && gp){
      lines.push(`<p>個性心理學ではNo.${calc.animal.number}「${esc(ch.name||'')}」、${esc(gp.name||'')}グループに属していらっしゃいます。<em>${esc(ch.essence||'')}</em></p>`);
    }
    if (essence.hiddenTalent){
      lines.push(`<p><strong>あなたの中に眠っている才能</strong>は「${esc(essence.hiddenTalent)}」。多くの方は気づかないまま人生を終えてしまいますが、あなたはこの才能を呼び覚ますために生まれてきた方です。</p>`);
    }

    // ===== (b) 今の苦しさの正体 =====
    lines.push(`<h3>② 今の苦しさの正体 ─ なぜ最近、しんどいのか</h3>`);
    if (stage.whatIsHappening){
      lines.push(`<p>あなたは今、人生のステージで言うと「<strong>${esc(stage.name||'')}</strong>」の只中にいらっしゃいます。${esc(stage.whatIsHappening)}</p>`);
    }
    if (heart.now){
      lines.push(`<p>${esc(elem)}のエレメントを持つあなたの心模様は、今こんな天気図を描いています。${esc(heart.now)}</p>`);
    }
    if (essence.breakPoint){
      lines.push(`<p>そして、あなたが<strong>無理をすると最も先に壊れてしまうのは「${esc(essence.breakPoint)}」</strong>の部分。もし最近そこに違和感があるなら、それは怠けではありません。あなたの本質的な設計図が「ここで休んで」と語りかけているサインです。</p>`);
    }
    if (essence.ageThought){
      lines.push(`<p>逆に、今あなたが知らず知らず<strong>老けやすい思考</strong>に陥っているとすれば、それは「${esc(essence.ageThought)}」のクセ。これを少しずつ手放すことが、これからの数年を大きく分けます。</p>`);
    }
    // ★ タグ統合：強みが裏返った形＋余裕がないときの出方
    if (g && g.top && g.top.length){
      const t1 = TAGS[g.top[0].tag];
      const st = g.scenes && g.scenes.find(s => s.key === 'stress');
      const stDef = st ? TAGS[st.tag] : t1;
      if (t1){
        lines.push(`<p>もう一つ、大事なことをお伝えします。いま${esc(fullName)}さまを消耗させているものの正体は、欠点ではなく<strong>強みが行きすぎた形</strong>である可能性が高いのです。${esc(t1.caution)}</p>`);
      }
      if (stDef){
        lines.push(`<p>そして余裕がなくなったとき、あなたには<strong>${esc(stDef.stress)}</strong>という形で出やすい傾向があります。もし心当たりがあれば、それは性格の問題ではなく、単に容量を超えているサインです。${esc(stDef.care)}</p>`);
      }
    }

    // ===== (c) 占術が示す転換点 =====
    lines.push(`<h3>③ 占術が示す転換点 ─ これから何が動くか</h3>`);
    if (calc.yearLuck && calc.yearLuck.message){
      lines.push(`<p>九星気学の今年の運気は、あなたにとって<strong>${esc(calc.yearLuck.title || '')}</strong>の年。${esc(calc.yearLuck.message)}</p>`);
    } else {
      lines.push(`<p>あなたは今、人生の大きな潮目に立っていらっしゃいます。これまで積み上げてきたものが、見える形になり始める時期です。</p>`);
    }
    if (lifecycle.current){
      lines.push(`<p>${esc(elem)}の人としてのライフサイクルでは、今は「${esc(lifecycle.current)}」の段階。${esc(lifecycle.advice || '')}</p>`);
    }
    if (six.innate){
      lines.push(`<p>六星占術では<strong>${esc(six.name||'')}${esc(polarityLabel)}</strong>のあなた。${esc(polarity === 'plus' ? (six.plus||'') : (six.minus||''))}この性質が、これからの転機の現れ方を決めていきます。</p>`);
    }
    if (essence.lifeTheme){
      lines.push(`<p>そもそも、あなたの人生のテーマは<strong>「${esc(essence.lifeTheme)}」</strong>。今起きていることはすべて、このテーマに沿って配置された配役だと思って眺めてみてください。</p>`);
    }

    // ===== (d) お悩みへの直接回答 =====
    lines.push(`<h3>④ あなたのお悩みへの、直接の回答</h3>`);
    lines.push(`<p>あなたが選ばれたお悩みは <strong>「${esc(worry.label||'')}」</strong>。${esc(worry.lead||'')}</p>`);
    if (worryText){
      lines.push(`<p><em>あなたが書いてくださったお悩み：</em><br>「${esc(worryText)}」</p>`);
      lines.push(`<p>このお悩みを、あなたの占術結果の言葉で読み替えるとこうなります。</p>`);
    }
    if (worryInnate){
      lines.push(`<p><strong>先天的な視点（生まれ持った傾向）：</strong>${esc(worryInnate)}</p>`);
    }
    if (worryAcquired){
      lines.push(`<p><strong>これから整える視点（後天的な訓練）：</strong>${esc(worryAcquired)}</p>`);
    }
    if (lp.advice){
      lines.push(`<p>ライフパス${calc.lifePath}のあなたへ、数秘術からのヒント：${esc(lp.advice)}</p>`);
    }
    // ★ タグ統合：相談テーマの領域に翻訳した具体解説
    if (g && g.domains){
      const map = { work:'work', love:'love', relation:'relation', family:'relation',
                    money:'money', beauty:'love', health:'work', future:'work' };
      const dom = map[worryKey];
      const items = dom && g.domains[dom];
      if (items && items.length){
        const L = (D.DOMAIN_LABELS && D.DOMAIN_LABELS[dom]) || {};
        lines.push(`<p><strong>複数の占術が共通して示すあなたの傾向を、「${esc(L.label||'')}」という場面の言葉に置き換えると、こうなります。</strong></p>`);
        items.slice(0, 2).forEach(it => {
          lines.push(`<p style="background:#f7f3ec;padding:.7rem 1rem;border-left:3px solid #b09060;border-radius:0 8px 8px 0;margin:.5rem 0;"><span style="color:#8a6840;font-size:11px;font-weight:700;">［${esc(tagLabel(it.tag))}・${it.n}占術が一致］</span><br>${esc(it.text)}</p>`);
        });
      }
    }

    // ★悩みカテゴリ × 12従星 × 通変星 の6軸直球解答
    if (jushoAxis || tsuuhenAxis){
      lines.push(`<p><strong>あなたの命式（12従星「${esc(jusho.name||'')}」＋通変星「${esc(tsuuhen.name||'')}」）が示す、${esc(axisLabel||'')}に関する具体指針</strong>：</p>`);
      if (jushoAxis){
        lines.push(`<p style="background:#fdf6e8;padding:.7rem 1rem;border-left:3px solid #c8a060;border-radius:0 8px 8px 0;margin:.5rem 0;"><span style="color:#9a7040;font-size:11px;font-weight:700;">［12従星より］</span><br>${esc(jushoAxis)}</p>`);
      }
      if (tsuuhenAxis){
        lines.push(`<p style="background:#fff0e8;padding:.7rem 1rem;border-left:3px solid #a8804a;border-radius:0 8px 8px 0;margin:.5rem 0;"><span style="color:#9a7040;font-size:11px;font-weight:700;">［通変星より］</span><br>${esc(tsuuhenAxis)}</p>`);
      }
    }

    // ===== (e2) 天体配置から見える、今期の強みと弱み =====
    if (planetIsObj){
      lines.push(`<h3>⑤ 天体配置から見える、あなたの強みと弱み</h3>`);
      lines.push(`<p>あなたの${esc(planet.name||'')}は<strong>${esc(planetSign)}</strong>に在ります。${esc(axisLabel||'')}という今のテーマにおいて、${esc(planet.name||'')}は最も重要な天体です。</p>`);
      lines.push(`<p style="background:#f0e8fa;padding:.7rem 1rem;border-left:3px solid #8a6ab0;border-radius:0 8px 8px 0;margin:.5rem 0;"><span style="color:#5a4080;font-size:11px;font-weight:700;">◎ あなたの強み</span><br>${esc(planetEntry.strength)}</p>`);
      lines.push(`<p style="background:#fcefef;padding:.7rem 1rem;border-left:3px solid #b07070;border-radius:0 8px 8px 0;margin:.5rem 0;"><span style="color:#804040;font-size:11px;font-weight:700;">△ 注意したい弱み</span><br>${esc(planetEntry.weakness)}</p>`);
      lines.push(`<p style="background:#eef6f0;padding:.7rem 1rem;border-left:3px solid #6a9070;border-radius:0 8px 8px 0;margin:.5rem 0;"><span style="color:#406040;font-size:11px;font-weight:700;">▶ 今日からできる具体アクション</span><br>${esc(planetEntry.action)}</p>`);
    }

    // ===== (e) 今週やってみてほしい3つのこと =====
    lines.push(`<h3>⑥ 今週やってみてほしい3つのこと</h3>`);
    const actionList = [];
    // 悩みカテゴリ由来のアクション（複数あるので最初の1つを抽出）
    if (worryActions){
      const first = worryActions.split(/[／/]/)[0];
      if (first) actionList.push(first.trim());
    }
    // 開運アクション由来（あれば）
    if (openluck.daily){
      actionList.push(openluck.daily);
    } else if (openluck.weekly){
      actionList.push(openluck.weekly);
    } else if (openluck.action){
      actionList.push(openluck.action);
    }
    // ロードマップ由来 youngerSecret
    if (roadmap.youngerSecret){
      actionList.push(roadmap.youngerSecret);
    }
    // ★ タグ統合：余裕がないときの回復法を1つ入れる
    if (g && g.scenes){
      const st = g.scenes.find(s => s.key === 'stress');
      if (st && TAGS[st.tag] && TAGS[st.tag].care) actionList.push(TAGS[st.tag].care);
    }
    // フォールバック
    while (actionList.length < 3){
      actionList.push('鏡に向かって自分の目を見つめ、「あなたは大丈夫」と声に出して伝える。');
    }
    lines.push(`<ul>`);
    actionList.slice(0,3).forEach(a => lines.push(`<li>${esc(a)}</li>`));
    lines.push(`</ul>`);
    // ★ タグ統合：その人の決め方に合わせた進め方
    if (g && g.decision){
      lines.push(`<p style="margin-top:.6rem;">なお${esc(fullName)}さまは、複数の占術から見て<strong>「${esc(g.decision.style.name)}」</strong>の決め方をなさる方です。${esc(g.decision.style.how)}ですから上の3つも、全部やろうとせず<strong>ピンときた1つだけ</strong>を選んでください。それがあなたのやり方に合った始め方です。</p>`);
    }

    // ===== 締め =====
    const closing = essence.youthThought
      ? `あなたが日々「${esc(essence.youthThought)}」と自分に語りかけられたとき、運命は静かに、しかし確実に動き始めます。`
      : `あなたが自分の本質を信じられたとき、運命は静かに動き始めます。`;
    lines.push(`<p style="margin-top:1.2rem;">${esc(fullName)}さま。占いは「未来を当てる」ものではなく、「今のあなたを映す鏡」です。${closing}ここに書かれたことは決めつけではなく、あなたが自分を考えるための材料としてお使いください。</p>`);

    return lines.join('\n');
  }

  // ----------------------------------------------------------------
  // 公開API
  // ----------------------------------------------------------------
  global.LocalSynthesis = {
    generate: generate
  };
})(typeof window !== 'undefined' ? window : globalThis);
