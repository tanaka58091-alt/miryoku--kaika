/* ============================================================
   app.js — UI制御・診断実行・PDF出力
   ============================================================ */

(function () {
  'use strict';

  // ---------- 合言葉ゲート ----------
  // 講師から伝える合言葉。変更したい場合はこの1行だけ書き換える。
  const GATE_PASSWORD = 'miryoku2026';
  const GATE_STORAGE_KEY = 'miryoku_gate_ok_v1';

  function setupGate(){
    const overlay = document.getElementById('gate-overlay');
    if (!overlay) return;
    const form = document.getElementById('gate-form');
    const input = document.getElementById('gate-input');
    const err = document.getElementById('gate-error');

    let passed = false;
    try { passed = localStorage.getItem(GATE_STORAGE_KEY) === '1'; } catch(_){}
    if (passed) { overlay.setAttribute('hidden',''); return; }

    overlay.removeAttribute('hidden');
    document.body.classList.add('gate-locked');
    setTimeout(() => { try { input && input.focus(); } catch(_){} }, 80);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = (input.value || '').trim().toLowerCase();
      if (v === GATE_PASSWORD.toLowerCase()) {
        try { localStorage.setItem(GATE_STORAGE_KEY, '1'); } catch(_){}
        overlay.setAttribute('hidden','');
        document.body.classList.remove('gate-locked');
        err.setAttribute('hidden','');
      } else {
        err.removeAttribute('hidden');
        input.value = '';
        input.focus();
      }
    });
  }

  if (document.readyState !== 'loading') setupGate();
  else document.addEventListener('DOMContentLoaded', setupGate);

  const F = window.FortuneCalc;
  const D = window.CONTENT_DATA;

  // ---------- 状態 ----------
  const STATE = {
    profile: null,        // {sei, mei, y, m, d, hour, sex, facePhoto, palmPhoto, worryCat, worryText}
    results: {},          // {cat1: {...}, cat2: {...}, ...}
    currentCat: null,
    tempPhotos: { face: null, palm: null }  // 入力中のDataURL一時保存
  };

  // ---------- 写真アップロード処理 ----------
  function bindPhotoInput(inputId, previewId, key){
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;
    input.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        STATE.tempPhotos[key] = dataUrl;
        preview.innerHTML = `<img src="${dataUrl}" alt="" class="user-photo-thumb" />`;
      };
      reader.readAsDataURL(f);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindPhotoInput('in-face-photo', 'prev-face', 'face');
    bindPhotoInput('in-palm-photo', 'prev-palm', 'palm');
  });
  // 既にDOM読み込み済みの場合
  if (document.readyState !== 'loading') {
    bindPhotoInput('in-face-photo', 'prev-face', 'face');
    bindPhotoInput('in-palm-photo', 'prev-palm', 'palm');
  }

  // クリアボタン
  document.addEventListener('click', (e) => {
    const clr = e.target.closest('[data-clear-photo]');
    if (clr) {
      const key = clr.getAttribute('data-clear-photo');
      const inputId = key === 'face' ? 'in-face-photo' : 'in-palm-photo';
      const previewId = key === 'face' ? 'prev-face' : 'prev-palm';
      const input = document.getElementById(inputId);
      const preview = document.getElementById(previewId);
      if (input) input.value = '';
      if (preview) preview.innerHTML = '<span class="photo-empty">未選択</span>';
      STATE.tempPhotos[key] = null;
    }
  });

  // ---------- DOM ヘルパ ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ---------- ナビゲーション ----------
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-go]');
    if (target) {
      const dest = target.getAttribute('data-go');
      // 入力前は menu / category / report に進めない
      if (['screen-menu', 'screen-category', 'screen-report'].includes(dest) && !STATE.profile) {
        showScreen('screen-input');
        return;
      }
      if (dest === 'screen-menu') updateMenuStatus();
      showScreen(dest);
    }

    const catStart = e.target.closest('[data-cat-start]');
    if (catStart) {
      const cat = catStart.getAttribute('data-cat-start');
      runCategory(cat);
    }
  });

  // ---------- 入力フォーム ----------
  $('#form-profile').addEventListener('submit', (e) => {
    e.preventDefault();
    const sei = $('#in-sei').value.trim();
    const mei = $('#in-mei').value.trim();
    const y = parseInt($('#in-year').value, 10);
    const m = parseInt($('#in-month').value, 10);
    const d = parseInt($('#in-day').value, 10);
    const hour = $('#in-hour').value === '' ? null : parseInt($('#in-hour').value, 10);
    const sexEl = document.querySelector('input[name="sex"]:checked');
    const sex = sexEl ? sexEl.value : 'female';

    if (!y || !m || !d || y < 1900 || y > 2030 || m < 1 || m > 12 || d < 1 || d > 31) {
      alert('生年月日を正しく入力してください');
      return;
    }

    // 悩み入力の取得
    const worryEl = document.querySelector('input[name="worry-cat"]:checked');
    const worryCat = worryEl ? worryEl.value : null;
    const worryTextEl = document.getElementById('in-worry-text');
    const worryText = worryTextEl ? worryTextEl.value.trim() : '';

    STATE.profile = {
      sei, mei, y, m, d, hour, sex,
      facePhoto: STATE.tempPhotos.face || null,
      palmPhoto: STATE.tempPhotos.palm || null,
      worryCat,
      worryText
    };
    STATE.results = {};
    STATE.photoAnalysis = { palm: null, face: null }; // 解析結果のキャッシュ
    // 写真がある場合、ブラウザ内で簡易解析を非同期実行（外部送信なし）
    if (window.PhotoAnalysis) {
      if (STATE.profile.palmPhoto) {
        window.PhotoAnalysis.analyzePalm(STATE.profile.palmPhoto, y, m, d)
          .then(r => { if (r) STATE.photoAnalysis.palm = r; });
      }
      if (STATE.profile.facePhoto) {
        window.PhotoAnalysis.analyzeFace(STATE.profile.facePhoto, y, m, d)
          .then(r => { if (r) STATE.photoAnalysis.face = r; });
      }
    }
    renderProfileSummary();
    updateMenuStatus();
    showScreen('screen-menu');
  });

  function renderProfileSummary() {
    if (!STATE.profile) return;
    const p = STATE.profile;
    const nameDisp = (p.sei || p.mei) ? `${p.sei} ${p.mei} 様` : 'あなた';
    const worryLabel = (p.worryCat && D.WORRY && D.WORRY[p.worryCat])
      ? `／ お悩み：${escapeHtml(D.WORRY[p.worryCat].label)}` : '';
    $('#profile-summary').innerHTML = `
      <strong>${escapeHtml(nameDisp)}</strong>　／
      ${p.y}年${p.m}月${p.d}日 生まれ
      ${p.hour !== null ? `／ ${p.hour}時頃` : ''}
      ${worryLabel}
    `;
  }

  function updateMenuStatus() {
    $$('.menu-card').forEach(card => {
      const cat = card.getAttribute('data-cat');
      const status = $(`[data-status="${cat}"]`);
      if (STATE.results[cat]) {
        card.classList.add('done');
        status.classList.add('done');
        status.textContent = '診断済み（再診断できます）';
      } else {
        card.classList.remove('done');
        status.classList.remove('done');
        status.textContent = '未診断';
      }
    });
  }

  // ---------- 共通: 各占いの計算結果オブジェクトを生成 ----------
  function computeAll() {
    if (!STATE.profile) return null;
    const { sei, mei, y, m, d, hour } = STATE.profile;

    const sunSign  = F.calcSunSign(m, d);
    const lifePath = F.calcLifePath(y, m, d);
    const birthNum = F.calcBirthNumber(d);
    const dayStem  = F.calcDayStem(y, m, d);
    const dayBranch= F.calcDayBranch(y, m, d);
    const yearBranch = F.calcYearBranch(y, m, d);
    const animal   = F.calcAnimal(y, m, d);
    const sixStar  = F.calcSixStar(y, m, d);
    const nineStar = F.calcNineStar(y, m, d);
    const venusSign= F.calcVenusSign(y, m, d);
    const ascendant= F.calcAscendant(y, m, d, hour);
    const moonSign    = F.calcMoonSign    ? F.calcMoonSign(y, m, d)    : sunSign;
    const mercurySign = F.calcMercurySign ? F.calcMercurySign(y, m, d) : sunSign;
    const marsSign    = F.calcMarsSign    ? F.calcMarsSign(y, m, d)    : sunSign;
    const jupiterSign = F.calcJupiterSign ? F.calcJupiterSign(y, m, d) : sunSign;
    const saturnSign  = F.calcSaturnSign  ? F.calcSaturnSign(y, m, d)  : sunSign;
    const seimei   = F.calcSeimei(sei, mei);
    const seimeiCat= seimei.sokaku ? F.seimeiCategory(seimei.sokaku) : null;
    const palmType = F.calcPalmType(y, m, d);
    const faceType = F.calcFaceType(y, m, d);
    const yearLuck = F.currentYearLuck(y, m, d);
    const nineCur  = F.currentNineStarYear();
    // 算命学：日干から主星にマッピング（簡易）
    const sanmeiIdx = dayStem; // 0〜9
    // 算命学：12従星（日干×年支）
    const jushoIdx = F.calc12Jusho ? F.calc12Jusho(dayStem, yearBranch) : 0;
    // 四柱推命：通変星（日干 vs 年干）
    const yearStem = F.calcYearStem(y, m, d);
    const tsuuhenIdx = F.calcTsuuhen ? F.calcTsuuhen(dayStem, yearStem) : 0;
    // v=9 新規：ルーン／易経／夢占い 決定論的インデックス
    const runeIdx   = F.calcRune   ? F.calcRune(y, m, d)   : 0;
    const ichingIdx = F.calcIching ? F.calcIching(y, m, d) : 0;
    const dreamIdx  = F.calcDream  ? F.calcDream(y, m, d)  : 0;
    // v=10 新規：タロット小アルカナ決定論的インデックス
    const minorTarotIdx = F.calcMinorTarot ? F.calcMinorTarot(y, m, d) : 0;
    // v=10 新規：数秘術 5数
    const soulNum        = F.calcSoulNum        ? F.calcSoulNum(seimei)              : 0;
    const personalityNum = F.calcPersonalityNum ? F.calcPersonalityNum(seimei)       : 0;
    const maturityNum    = F.calcMaturityNum    ? F.calcMaturityNum(lifePath, soulNum) : 0;
    // v=10 新規：算命学 宿命星（月支配置・日支配置）
    const monthBranch  = F.calcMonthBranch  ? F.calcMonthBranch(m, d)                     : 0;
    const shukumeisei  = F.calcShukumeisei  ? F.calcShukumeisei(dayStem, monthBranch, dayBranch) : { gessei:0, nissei:0 };
    // v=10 新規：四柱推命 命式全体（年月日時の4柱）
    const meishiki     = F.calcMeishiki     ? F.calcMeishiki(y, m, d, hour) : null;
    // v=11 新規：アスペクト
    const aspects = F.calcAspects ? F.calcAspects({
      sun: sunSign, moon: moonSign, mercury: mercurySign,
      venus: venusSign, mars: marsSign, jupiter: jupiterSign, saturn: saturnSign
    }) : [];
    // v=11 新規：トランジット詳細
    const transitDetail = F.calcTransitHouse ? F.calcTransitHouse(ascendant) : null;
    // v=11 新規：大運
    const daiun = (F.calcDaiUn && meishiki) ? F.calcDaiUn(y, m, d, 1, meishiki.month.stem, meishiki.month.branch) : null;
    // v=11 新規：用神・忌神
    const youjin = (F.calcYoujin && meishiki) ? F.calcYoujin(meishiki) : null;
    // v=11 新規：ケルト十字
    const celticCross = F.drawCelticCross ? F.drawCelticCross(y, m, d) : [];
    // v=11 新規：算命学 干合・支合・冲・刑
    const kanshiRel = (F.calcKanshiRelations && meishiki) ? F.calcKanshiRelations(meishiki) : null;
    // v=11 新規：月命星・日命星
    const monthlyStar = F.calcMonthlyStar ? F.calcMonthlyStar(y, m, d) : 0;
    const dailyStar = F.calcDailyStar ? F.calcDailyStar(new Date().getFullYear(), new Date().getMonth()+1, new Date().getDate()) : 0;
    // v=11 新規：易経 変爻・之卦
    const ichingHenga = F.calcHengaIching ? F.calcHengaIching(y, m, d) : null;

    return {
      sunSign, lifePath, birthNum,
      dayStem, dayBranch, yearBranch,
      animal, sixStar, nineStar,
      venusSign, ascendant,
      moonSign, mercurySign, marsSign, jupiterSign, saturnSign,
      seimei, seimeiCat,
      palmType, faceType,
      yearLuck, nineCur,
      sanmeiIdx, jushoIdx, tsuuhenIdx, yearStem,
      runeIdx, ichingIdx, dreamIdx, minorTarotIdx,
      soulNum, personalityNum, maturityNum,
      monthBranch, shukumeisei,
      meishiki,
      aspects, transitDetail, daiun, youjin,
      celticCross, kanshiRel,
      monthlyStar, dailyStar, ichingHenga
    };
  }

  // ---------- カテゴリ別 診断ロジック ----------
  function runCategory(cat) {
    const calc = computeAll();
    if (!calc) { showScreen('screen-input'); return; }
    STATE.currentCat = cat;

    let html = '';
    switch (cat) {
      case 'cat1': html = renderCat1(calc); break;
      case 'cat2': html = renderCat2(calc); break;
      case 'cat3': html = renderCat3(calc); break;
      case 'cat4': html = renderCat4(calc); break;
      case 'cat5': html = renderCat5(calc); break;
      case 'cat6': html = renderCat6(calc); break;
      case 'cat7': html = renderCat7(calc); break;
    }

    // 結果を保存（PDF用）
    STATE.results[cat] = { calc, html };

    $('#category-content').innerHTML = html;
    showScreen('screen-category');
  }

  // ---------- ズバリ言い当て診断 ビルダ ----------
  function buildSpotOnCard(c){
    const spotZ = D.SPOTON && D.SPOTON.zodiac && D.SPOTON.zodiac[c.sunSign];
    const spotLp = D.SPOTON && D.SPOTON.lp && D.SPOTON.lp[c.lifePath];
    if (!spotZ) return '';
    const z = D.ZODIAC[c.sunSign];
    const brightLis = spotZ.bright.map(t => `<li>${t}</li>`).join('');
    const shadowLis = spotZ.shadow.map(t => `<li>${t}</li>`).join('');
    const lpLis = (spotLp || []).map(t => `<li>${t}</li>`).join('');
    return `
      <div class="fortune-card spot-card">
        <div class="spot-card-deco">✦ ZUBARI ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">ズバリ言い当て診断</div>
          <div class="fortune-result">${z.symbol} ${z.name} × 数秘${c.lifePath}</div>
        </div>
        <div class="fortune-body">
          <p class="spot-lead">${escapeHtml(spotZ.title)}</p>

          <h4>あなたの「光の側面」</h4>
          <ul class="spot-list spot-bright">${brightLis}</ul>

          <h4>あなたの「影の側面」</h4>
          <ul class="spot-list spot-shadow">${shadowLis}</ul>

          ${lpLis ? `<h4>数秘${c.lifePath}が告げる、もう一つの真実</h4>
          <ul class="spot-list spot-lp">${lpLis}</ul>` : ''}
        </div>
        <div class="fortune-note">※ 「言い当てられた」と感じるか「違うかな」と感じるかは、その日のあなたの状態によります。両方ともあなたです。</div>
      </div>
    `;
  }

  // ---------- 多角的シンセシス（東西占術合致）カード ----------
  function buildSynthesisCard(c){
    const z = D.ZODIAC[c.sunSign];
    const stem = D.STEMS[c.dayStem];
    const lp = D.NUMEROLOGY[c.lifePath];
    const animal = D.ANIMALS[c.animal.animal];
    const six = D.SIX_STAR[c.sixStar.star];
    const elem = z.element; // 火/土/風/水
    // 4つの占術が指している共通テーマを抽出
    const elemMap = {
      '火':{ keyword:'発信・先導・情熱', theme:'内側の火を、外に出していく' },
      '土':{ keyword:'継続・信頼・実り',   theme:'時間をかけて、確かに育てる' },
      '風':{ keyword:'対話・知性・繋がり', theme:'軽やかに、人と知を結んでいく' },
      '水':{ keyword:'感受・癒し・浄化',   theme:'感じ取る力を、生かしていく' }
    };
    const em = elemMap[elem] || elemMap['火'];
    return `
      <div class="fortune-card synthesis-card">
        <div class="synthesis-deco">◆ 東西4占術 合致 ◆</div>
        <div class="fortune-head">
          <div class="fortune-name">多角的シンセシス診断</div>
          <div class="fortune-result">4つの占術が同じ方向を指しています</div>
        </div>
        <div class="fortune-body">
          <p class="synth-lead">西洋・東洋・数秘・動物——別々に生まれた4つの占術が、あなたについて<strong>同じこと</strong>を告げています。</p>
          <ul class="synth-list">
            <li><span class="synth-tag">西洋占星術</span>${escapeHtml(z.name)}（${escapeHtml(elem)}の質）— ${escapeHtml(z.innate.replace(/<[^>]+>/g,'').split('。')[0])}。</li>
            <li><span class="synth-tag">四柱推命</span>日干 ${escapeHtml(stem.name)}（${escapeHtml(stem.element)}）— ${escapeHtml(stem.innate.replace(/<[^>]+>/g,'').split('。')[0])}。</li>
            <li><span class="synth-tag">数秘術</span>ライフパス${c.lifePath}（${escapeHtml(lp.title)}）— ${escapeHtml(lp.innate.replace(/<[^>]+>/g,'').split('。')[0])}。</li>
            <li><span class="synth-tag">動物占い</span>${escapeHtml(animal.name)} ${animal.emoji} — ${escapeHtml(animal.innate.replace(/<[^>]+>/g,'').split('。')[0])}。</li>
          </ul>
          <div class="synth-converge">
            <div class="synth-converge-label">▼ 4占術が共通して告げているテーマ</div>
            <p class="synth-converge-text">「<strong>${escapeHtml(em.theme)}</strong>」<br><span class="synth-keyword">キーワード：${escapeHtml(em.keyword)}</span></p>
            <p>占術はそれぞれ独立した体系ですが、本物のあなたを示すときには<strong>必ず同じ方向</strong>を指します。「偶然そう見える」のではありません。これがあなた本来の、揺るがない核です。</p>
          </div>
          <div class="synth-extra">
            <p>さらに六星占術「${escapeHtml(six.name)}」も、この方向性と矛盾しません。複数の占術が一致するということは、それがあなたの<strong>魂のレベルの設計図</strong>であるという証拠です。</p>
          </div>
        </div>
        <div class="fortune-note">※ 占術ごとに表現は違っても、よく観察すると同じ「あなた」を別の角度から照らしています。</div>
      </div>
    `;
  }

  // ---------- 心の天気予報カード ----------
  function buildHeartWeatherCard(c){
    const z = D.ZODIAC[c.sunSign];
    const elem = z.element;
    const hw = D.HEART_WEATHER && D.HEART_WEATHER[elem];
    if (!hw) return '';
    return `
      <div class="fortune-card heart-weather-card">
        <div class="fortune-head">
          <div class="fortune-name">心の天気予報</div>
          <div class="fortune-result">${escapeHtml(elem)}のあなたの内側</div>
        </div>
        <div class="fortune-body">
          <div class="hw-block hw-now">
            <div class="hw-label">☁ いまの心模様</div>
            <p>${escapeHtml(hw.now)}</p>
          </div>
          <div class="hw-block hw-fore">
            <div class="hw-label">☀ 短期予報（2〜3週間）</div>
            <p>${escapeHtml(hw.forecast)}</p>
          </div>
          <div class="hw-block hw-caution">
            <div class="hw-label">⚠ 注意したい風向き</div>
            <p>${escapeHtml(hw.caution)}</p>
          </div>
        </div>
        <div class="fortune-note">※ 外側の気分ではなく、星の配置から見えるあなたの「内側の天気」です。</div>
      </div>
    `;
  }

  // ---------- 時間軸（1/3/6/12ヶ月）カード ----------
  function buildTimelineCard(c){
    const z = D.ZODIAC[c.sunSign];
    const elem = z.element;
    const tl = D.TIMELINE && D.TIMELINE[elem];
    if (!tl) return '';
    return `
      <div class="fortune-card timeline-card">
        <div class="fortune-head">
          <div class="fortune-name">あなたの運勢タイムライン</div>
          <div class="fortune-result">1ヶ月 / 3ヶ月 / 半年 / 1年</div>
        </div>
        <div class="fortune-body">
          <div class="tl-row"><div class="tl-when">1ヶ月</div><div class="tl-msg">${escapeHtml(tl.m1)}</div></div>
          <div class="tl-row"><div class="tl-when">3ヶ月</div><div class="tl-msg">${escapeHtml(tl.m3)}</div></div>
          <div class="tl-row"><div class="tl-when">半年後</div><div class="tl-msg">${escapeHtml(tl.m6)}</div></div>
          <div class="tl-row tl-row-final"><div class="tl-when">1年後</div><div class="tl-msg">${escapeHtml(tl.m12)}</div></div>
        </div>
        <div class="fortune-note">※ ${escapeHtml(elem)}の質を持つあなたが、これからの1年で辿る運気の流れです。</div>
      </div>
    `;
  }

  // ---------- 年代別 美の磨き方カード ----------
  function buildLifecycleCard(c){
    const z = D.ZODIAC[c.sunSign];
    const elem = z.element;
    const lc = D.LIFECYCLE && D.LIFECYCLE[elem];
    if (!lc) return '';
    // 現在の年齢から該当年代を判定
    const p = STATE.profile;
    const today = new Date();
    let age = 0;
    if (p && p.y) {
      age = today.getFullYear() - p.y;
      const birthM = (p.m || 1) - 1;
      const birthD = p.d || 1;
      if (today.getMonth() < birthM || (today.getMonth() === birthM && today.getDate() < birthD)) age--;
    }
    const eraKey = age < 30 ? '20s' : age < 40 ? '30s' : age < 50 ? '40s' : '50s';
    const eraLabel = age < 30 ? '20代' : age < 40 ? '30代' : age < 50 ? '40代' : '50代以降';
    const eras = [
      ['20s','20代'], ['30s','30代'], ['40s','40代'], ['50s','50代以降']
    ];
    const rows = eras.map(([k, label]) => {
      const cur = (k === eraKey);
      return `<div class="lc-row${cur ? ' lc-row-current' : ''}">
        <div class="lc-when">${label}${cur ? '<span class="lc-now-tag">★ いまここ</span>' : ''}</div>
        <div class="lc-msg">${escapeHtml(lc[k])}</div>
      </div>`;
    }).join('');
    return `
      <div class="fortune-card lifecycle-card">
        <div class="fortune-head">
          <div class="fortune-name">年代別 美の磨き方</div>
          <div class="fortune-result">${escapeHtml(elem)}のあなたの美の歩み方</div>
        </div>
        <div class="fortune-body">
          <p class="lc-lead">あなたは現在<strong>${eraLabel}</strong>。${escapeHtml(elem)}の質を持つ女性にとって、年代ごとの美の磨き方は確実に変化します。</p>
          ${rows}
        </div>
        <div class="fortune-note">※ いまの年代の磨き方を中心に、前後の年代の知恵も取り入れると、より深い美が育ちます。</div>
      </div>
    `;
  }

  // ---------- ラッキーマトリクスカード ----------
  function buildLuckyMatrixCard(c){
    const z = D.ZODIAC[c.sunSign];
    const elem = z.element;
    const lm = D.LUCKY_MATRIX && D.LUCKY_MATRIX[elem];
    if (!lm) return '';
    const items = [
      ['🗓','ラッキーデー', lm.day],
      ['⏰','ラッキータイム', lm.time],
      ['🧭','ラッキー方位', lm.direction],
      ['🎨','ラッキーカラー', lm.color],
      ['🍴','ラッキーフード', lm.food],
      ['📍','ラッキープレイス', lm.place],
      ['💎','ラッキーストーン', lm.stone],
      ['✨','開運アクション', lm.action]
    ];
    const cells = items.map(([icon, label, val]) => `
      <div class="lm-cell">
        <div class="lm-icon">${icon}</div>
        <div class="lm-label">${escapeHtml(label)}</div>
        <div class="lm-val">${escapeHtml(val)}</div>
      </div>`).join('');
    return `
      <div class="fortune-card lucky-matrix-card">
        <div class="fortune-head">
          <div class="fortune-name">あなただけのラッキーマトリクス</div>
          <div class="fortune-result">${escapeHtml(elem)}の質に共鳴する8要素</div>
        </div>
        <div class="fortune-body">
          <p class="lm-lead">${escapeHtml(elem)}の波動を強める、あなた固有のラッキー要素です。1日に1つでも取り入れると、運気が確実に動きます。</p>
          <div class="lm-grid">${cells}</div>
        </div>
        <div class="fortune-note">※ 全てを完璧に揃える必要はありません。気になった1つから日常に取り入れてみてください。</div>
      </div>
    `;
  }

  // ============================================================
  // ★ NEW DESIGN: 7軸構成のヘルパ
  // ============================================================
  function elementOf(c){ return D.ZODIAC[c.sunSign].element; }
  function ageOf(){
    const p = STATE.profile; if (!p || !p.y) return 30;
    const t = new Date();
    let a = t.getFullYear() - p.y;
    const bm = (p.m||1)-1, bd = p.d||1;
    if (t.getMonth() < bm || (t.getMonth() === bm && t.getDate() < bd)) a--;
    return a;
  }
  // 心の歪み index 決定: lifePath (11/22/33 を含む) を 0〜8 に
  function hizumiIndexOf(c){
    const lp = c.lifePath;
    const base = (lp === 11) ? 2 : (lp === 22) ? 4 : (lp === 33) ? 6 : lp;
    return ((base - 1) % 9 + 9) % 9;
  }
  // 人生ステージ index 決定: 年齢 + 九星 + 西暦下1桁の組合せ → 0〜6
  function stageIndexOf(c){
    const t = new Date();
    const a = ageOf();
    const cycle = ((a + (c.nineStar || 1) + (t.getFullYear() % 7)) % 7 + 7) % 7;
    return cycle;
  }
  // 美の才能 index: venusSign を 0〜5 に
  function beautyIndexOf(c){
    return ((c.venusSign % 6) + 6) % 6;
  }

  // ============================================================
  // ★ NEW: パーソナル・シグネチャ（動的に毎カテゴリーの導入を合成）
  //  - 6つの占術値（太陽/日干/動物/九星/金星/ライフパス）を組み合わせ
  //  - 「同じ生年月日では同じ・違う生年月日では必ず違う」固有テキストを生成
  //  - カテゴリーごとに異なる導入文（openersByCat）で表現の重複を回避
  // ============================================================
  function personalSignature(c, catId){
    const PS = D.PERSONAL_SIG; if (!PS) return '';
    const z       = D.ZODIAC[c.sunSign];
    const stem    = D.STEMS[c.dayStem] || {};
    const animal  = D.ANIMALS[c.animal.animal] || {};
    const venus   = D.ZODIAC[c.venusSign];
    const lp      = c.lifePath;

    const openers = (PS.openersByCat && PS.openersByCat[catId]) || PS.openersByCat.cat1 || [''];
    const opener  = openers[(c.sunSign + c.lifePath + c.dayStem) % openers.length];
    const core    = PS.zodiacCore[c.sunSign] || '';
    const stemP   = PS.stemPhrase[c.dayStem] || '';
    const animP   = PS.animalPhrase[c.animal.animal] || '';
    const nineIdx = ((c.nineStar || 1) - 1 + 9) % 9;
    const nineP   = PS.ninePhrase[nineIdx] || '';
    const venusP  = PS.venusPhrase[c.venusSign] || '';
    const lpP     = PS.lpClose[lp] || '';

    const p = STATE.profile || {};
    const nameDisp = (p.sei || p.mei) ? `${escapeHtml(p.sei)}${escapeHtml(p.mei)} 様` : 'あなた';
    const birth = (p.y && p.m && p.d) ? `${p.y}年${p.m}月${p.d}日${p.hour !== null && p.hour !== undefined && p.hour !== '' ? ' '+p.hour+'時頃' : ''}生まれ` : '';

    return `
      <div class="fortune-card personal-sig-card" style="background:linear-gradient(135deg,#fff8f3 0%,#ffeee1 100%);border:1px solid #e6c8a8;">
        <div class="personal-sig-deco" style="text-align:center;font-size:11px;letter-spacing:.3em;color:#b48a5c;margin-bottom:.4rem;">✦ JUST FOR YOU ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">この章は、${nameDisp}だけのために</div>
          <div class="fortune-result">${escapeHtml(z.name)} × ${escapeHtml(stem.name || '')} × ${escapeHtml(animal.name || '')}</div>
        </div>
        <div class="fortune-body">
          <p class="personal-sig-text" style="line-height:1.9;">${escapeHtml(opener)}<br>
            あなたの核は${escapeHtml(core)}。<br>
            そこに日柱の${escapeHtml(stemP)}が重なり、表に出ると${escapeHtml(animP)}という顔になる。<br>
            九星は${escapeHtml(nineP)}を、金星は${escapeHtml(venusP)}を、あなたの内側に置いている。<br>
            その全てが指し示すのは、${escapeHtml(lpP)}——これがあなたの方向性です。
          </p>
          <p class="personal-sig-tail" style="font-size:12px;color:#8a6a4a;margin-top:.6rem;">
            ${escapeHtml(birth)}という、宇宙でただ一通りの組み合わせから生まれた、この章だけの導入です。
          </p>
        </div>
        <div class="fortune-note">※ 同じ星座・同じ干でも、この組み合わせを持つ人は他に居ません。「私のために書かれている」と感じる部分だけ受け取って。</div>
      </div>
    `;
  }

  // ============================================================
  // ★ NEW: 悩み入力 → 処方箋（buildReport 末尾に挿入）
  // ============================================================
  function worryPrescription(c){
    const p = STATE.profile || {};
    if (!p.worryCat && !(p.worryText && p.worryText.length)) return '';
    const w = D.WORRY && D.WORRY[p.worryCat];
    const intro = (D.WORRY_PRESCRIPTION_INTRO && D.WORRY_PRESCRIPTION_INTRO[p.worryCat]) || '';
    const z = D.ZODIAC[c.sunSign];
    const elem = z.element;
    const innateTxt = (w && w.innate && w.innate[elem]) || '';
    const acquiredTxt = (w && w.acquired && w.acquired[elem]) || '';
    const actionsTxt = (w && w.actions) || '';

    const userVoiceHtml = p.worryText ? `
      <div class="block" style="background:#fffaf3;border-left:4px solid #c89c6a;padding:1rem 1.2rem;margin:1rem 0;">
        <h3 style="margin:0 0 .4rem 0;">あなた自身の言葉で書いてくれた悩み</h3>
        <p style="white-space:pre-wrap;line-height:1.8;">${escapeHtml(p.worryText)}</p>
      </div>` : '';

    const labelTxt = (w && w.label) || '（カテゴリー未選択）';

    return `
      <div class="report-section worry-section">
        <h2>08　あなたのお悩みへの処方箋</h2>
        <div class="section-sub">あなたが入力した「悩み」を、占術の言葉で読み解き直す</div>

        <div class="block">
          <h3>選んだテーマ</h3>
          <p><strong>${escapeHtml(labelTxt)}</strong></p>
        </div>

        ${intro ? `<div class="block"><h3>このテーマの読み解き</h3><p>${escapeHtml(intro)}</p></div>` : ''}

        ${innateTxt ? `<div class="block"><h3>あなたが本来持っている力（先天）</h3><p>${escapeHtml(innateTxt)}</p></div>` : ''}

        ${acquiredTxt ? `<div class="block"><h3>これから整えていく方向（後天）</h3><p>${escapeHtml(acquiredTxt)}</p></div>` : ''}

        ${actionsTxt ? `<div class="block"><h3>今日からできる具体アクション</h3><p>${escapeHtml(actionsTxt)}</p></div>` : ''}

        ${userVoiceHtml}

        <div class="block block-final">
          <h3>このお悩みに対する、占術からのひと言</h3>
          <p>悩みの形は人それぞれですが、占術的に見ると「今あなたが感じている苦しさ」は、本来の${escapeHtml(elem)}の質が出しきれずに詰まっているサインです。${escapeHtml(z.name)}・${escapeHtml(elem)}のあなたが本来の流れに戻れば、この悩みは自然と形を変えます。今日の小さな一歩から始めてください。</p>
        </div>
      </div>
    `;
  }

  // ---------- カテゴリ1: 本質の私を知る（先天性） ----------
  function renderCat1(c) {
    const z = D.ZODIAC[c.sunSign];
    const stem = D.STEMS[c.dayStem];
    const sanmei = D.SANMEI[c.sanmeiIdx];
    const lp = D.NUMEROLOGY[c.lifePath];
    const six = D.SIX_STAR[c.sixStar.star];
    const animal = D.ANIMALS[c.animal.animal];
    const elem = elementOf(c);
    const ess = D.ESSENCE[elem];

    const essenceCard = ess ? `
      <div class="fortune-card essence-deep-card">
        <div class="essence-deco">◆ ESSENCE ◆</div>
        <div class="fortune-head">
          <div class="fortune-name">本質の私を知る ／ ${elem}の人</div>
          <div class="fortune-result">キーワード：${escapeHtml(ess.keyword)}</div>
        </div>
        <div class="fortune-body">
          <p class="essence-lead">${escapeHtml(ess.essence)}</p>

          <div class="essence-grid">
            <div class="essence-row"><div class="essence-label">隠れた才能</div><div class="essence-val">${escapeHtml(ess.hiddenTalent)}</div></div>
            <div class="essence-row"><div class="essence-label">エネルギータイプ</div><div class="essence-val">${escapeHtml(ess.energyType)}</div></div>
            <div class="essence-row"><div class="essence-label">感情パターン</div><div class="essence-val">${escapeHtml(ess.emotionPattern)}</div></div>
            <div class="essence-row"><div class="essence-label">愛され方</div><div class="essence-val">${escapeHtml(ess.lovedHow)}</div></div>
            <div class="essence-row essence-row-warn"><div class="essence-label">無理すると壊れる部分</div><div class="essence-val">${escapeHtml(ess.breakPoint)}</div></div>
            <div class="essence-row essence-row-young"><div class="essence-label">若返る思考</div><div class="essence-val">${escapeHtml(ess.youthThought)}</div></div>
            <div class="essence-row essence-row-age"><div class="essence-label">老けやすい思考</div><div class="essence-val">${escapeHtml(ess.ageThought)}</div></div>
          </div>

          <div class="essence-theme">
            <div class="essence-theme-label">▼ あなたの人生のテーマ</div>
            <p>${escapeHtml(ess.lifeTheme)}</p>
          </div>
        </div>
        <div class="fortune-note">※ 「だからこそ今まで苦しかったんだ」と感じた部分があれば、それが本来のあなたの輪郭です。</div>
      </div>` : '';

    return `
      <div class="cat-header">
        <span class="menu-tag">01　先天性</span>
        <h2>本質の私を知る</h2>
        <p>東西の占術を統合し、あなたが生まれ持った"魂の設計図"を多角的にひも解きます。</p>
      </div>

      ${personalSignature(c, 'cat1')}

      ${essenceCard}

      ${buildSynthesisCard(c)}

      ${fortuneCard('西洋占星術 / 太陽星座', `${z.symbol} ${z.name}（${z.period}）`,
        `<div class="rich">${z.innate}</div>`)}

      ${multiPlanetCard(c)}

      ${astroHousesCard(c)}

      ${fortuneCard('四柱推命 / 日干', stem.name,
        `<p><span class="label">五行</span> ${stem.element}</p>
         <div class="rich">${stem.innate}</div>`)}

      ${fortuneCard('算命学 / 主星', sanmei.name,
        `<div class="rich">${sanmei.msg}</div>`,
        '※ 日干より導き出した略式の主星診断です。')}

      ${jushoTsuuhenCard(c)}

      ${fortuneCard('数秘術 / ライフパスナンバー', `${c.lifePath}　${lp.title}`,
        `<div class="rich">${lp.innate}</div>`)}

      ${numerology5Card(c)}

      ${fortuneCard('六星占術', `${six.name}${c.sixStar.polarity === 'plus' ? '＋（陽性）' : '−（陰性）'}`,
        `<p><span class="label">運命数</span> ${c.sixStar.number}</p>
         <div class="rich">${six.innate}</div>
         <div class="rich">${(c.sixStar.polarity === 'plus' ? six.plus : six.minus) || ''}</div>`,
        '※ 細木数子流の六星占術に準拠。運命数1〜60を10刻みで6星（土星人・金星人・火星人・天王星人・木星人・水星人）に分け、奇数=陽性／偶数=陰性で計12タイプに細分。'
      )}

      ${animal60Card(c)}

      ${seimeiCard(c)}

      ${seimeiGokakuCard(c)}

      ${shukumeiseiCard(c)}

      ${meishikiCard(c)}

      ${aspectsCard(c)}

      ${daiunCard(c)}

      ${youjinCard(c)}

      ${kanshiRelCard(c)}
    `;
  }

  // ---------- 個性心理學®60キャラ カード（公式運命数準拠） ----------
  function animal60Card(c){
    const a = c.animal;
    // 新ロジック（Animal60）の結果が入っていればフル表示
    if (a && a.char && a.group){
      const ch = a.char;
      const gp = a.group;
      return `
        <div class="fortune-card animal60-card" style="background:linear-gradient(135deg,#fff5f0 0%,#ffe4d6 100%);border:1px solid #f0c8a8;">
          <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#b48a5c;margin-bottom:.4rem;">✦ 個性心理學®60キャラ ✦</div>
          <div class="fortune-head">
            <div class="fortune-name">動物占い（個性心理學®）</div>
            <div class="fortune-result" style="font-size:1.15em;">${gp.emoji} No.${a.number}　${escapeHtml(ch.name)}</div>
            <div style="font-size:13px;color:#a07a5a;margin-top:.3rem;">12動物グループ：<strong>${escapeHtml(gp.name)}（${escapeHtml(gp.element)}）</strong></div>
          </div>
          <div class="fortune-body">
            <div class="rich">
              <h4>本質</h4><p>${escapeHtml(ch.essence)}</p>
              <h4>恋愛・パートナーシップ</h4><p>${escapeHtml(ch.love)}</p>
              <h4>仕事・天職</h4><p>${escapeHtml(ch.work)}</p>
              <h4>お金との付き合い</h4><p>${escapeHtml(ch.money)}</p>
              <h4>人間関係</h4><p>${escapeHtml(ch.human)}</p>
              <h4>今日からできる開運アクション</h4><p>${escapeHtml(ch.luck)}</p>
            </div>
          </div>
          <div class="fortune-note">※ 個性心理學®（弦本將裕氏体系）の公式運命数計算に準拠。60キャラ × 12動物グループから、あなただけの組み合わせを導き出しています。</div>
        </div>
      `;
    }
    // フォールバック（旧表示）
    const animal = D.ANIMALS[a.animal] || { name:'-', emoji:'', innate:'' };
    return fortuneCard('動物占い', `${animal.emoji} ${animal.name}（No.${a.number}）`,
      `<div class="rich">${animal.innate}</div>`,
      '※ 動物占いは流派により若干の差異があります。');
  }

  // ---------- カテゴリ2: 表面の私を知る（社会性） ----------
  function renderCat2(c) {
    const animal = D.ANIMALS[c.animal.animal];
    const gap = D.OMOTE_GAP && D.OMOTE_GAP[c.animal.animal];
    if (!gap) return '<div class="cat-header"><h2>表面の私を知る</h2></div>';

    return `
      <div class="cat-header">
        <span class="menu-tag">02　社会性</span>
        <h2>表面の私を知る</h2>
        <p>「自分が思っている自分」と「他人から見えている自分」のギャップを可視化します。</p>
      </div>

      ${personalSignature(c, 'cat2')}

      <div class="fortune-card omote-card">
        <div class="omote-deco">◇ GAP ◇</div>
        <div class="fortune-head">
          <div class="fortune-name">第一印象とギャップ診断</div>
          <div class="fortune-result">${animal.emoji} ${animal.name}タイプ</div>
        </div>
        <div class="fortune-body">
          <p class="omote-lead">あなたが他人からどう見えていて、本当はどう違うのか——その"ギャップ"こそ、あなたの隠れた魅力です。</p>

          <div class="omote-block">
            <div class="omote-label">▷ 表面のキャラクター</div>
            <p>${escapeHtml(gap.surfaceChar)}</p>
          </div>
          <div class="omote-block">
            <div class="omote-label">▷ 第一印象</div>
            <p>${escapeHtml(gap.firstImpression)}</p>
          </div>
          <div class="omote-block">
            <div class="omote-label">▷ 話し方の傾向</div>
            <p>${escapeHtml(gap.talkStyle)}</p>
          </div>

          <h4>シーン別の"モード"</h4>
          <div class="omote-mode-grid">
            <div class="omote-mode"><div class="mode-label">人前モード</div><p>${escapeHtml(gap.socialMode)}</p></div>
            <div class="omote-mode"><div class="mode-label">家族モード</div><p>${escapeHtml(gap.familyMode)}</p></div>
            <div class="omote-mode"><div class="mode-label">恋愛モード</div><p>${escapeHtml(gap.loveMode)}</p></div>
          </div>

          <div class="omote-gap-box">
            <div class="omote-gap-label">▼ あなたの内外ギャップ</div>
            <p class="omote-gap-line">${escapeHtml(gap.gap)}</p>
            <p class="omote-gap-reason">${escapeHtml(gap.reason)}</p>
          </div>
        </div>
        <div class="fortune-note">※ ギャップを否定する必要はありません。むしろそれを認めて出していくほど、あなたは魅力的になります。</div>
      </div>

      ${buildHeartWeatherCard(c)}
    `;
  }

  // ---------- カテゴリ3: 心の歪み診断（後天性）★最重要 ----------
  function renderCat3(c) {
    const idx = hizumiIndexOf(c);
    const h = D.HIZUMI[idx];
    if (!h) return '<div class="cat-header"><h2>心の歪み診断</h2></div>';

    const symptomLis = h.bodySymptoms.map(s => `<li>${escapeHtml(s)}</li>`).join('');

    return `
      <div class="cat-header cat-header-hizumi">
        <span class="menu-tag menu-tag-hizumi">03　後天性 ／ 最重要</span>
        <h2>心の歪み診断</h2>
        <p>「だから今まで苦しかったんだ」が分かる、後天的に形成された心のクセと、それが身体にどう出ているかを解き明かします。</p>
      </div>

      ${personalSignature(c, 'cat3')}

      <div class="fortune-card hizumi-card">
        <div class="hizumi-deco">◆ DEEP ◆</div>
        <div class="fortune-head">
          <div class="fortune-name">あなたの心の歪みタイプ</div>
          <div class="fortune-result">${escapeHtml(h.name)}</div>
        </div>
        <div class="fortune-body">
          <p class="hizumi-catch">"${escapeHtml(h.catchphrase)}"</p>

          <h4>この歪みのパターン</h4>
          <div class="rich"><p>${escapeHtml(h.pattern)}</p></div>

          <div class="hizumi-bridge">
            <div class="hizumi-bridge-label">▼ なぜ身体に出るのか</div>
            <p>${escapeHtml(h.whyBody)}</p>
          </div>

          <h4>身体に出ている具体的なサイン</h4>
          <ul class="hizumi-symptoms">${symptomLis}</ul>

          <div class="hizumi-release">
            <div class="hizumi-release-label">✦ 解放のワーク</div>
            <p>${escapeHtml(h.release)}</p>
          </div>

          <div class="hizumi-daily">
            <div class="hizumi-daily-label">★ 今日からできる小さな一歩</div>
            <p>${escapeHtml(h.dailyAction)}</p>
          </div>
        </div>
        <div class="fortune-note">※ 「あぁ、私のことだ」と感じたら、それが回復の入口です。歪みは"悪"ではなく、生きるために必要だった守りの形。気づいた今から、ゆっくり手放していけます。</div>
      </div>

      ${dreamCard(c)}
    `;
  }

  // ---------- カテゴリ4: 人生ステージ診断 ----------
  function renderCat4(c) {
    const idx = stageIndexOf(c);
    const s = D.LIFE_STAGE[idx];
    if (!s) return '<div class="cat-header"><h2>人生ステージ診断</h2></div>';

    const avoidLis = (s.avoid || '').split('。').filter(t => t.trim()).map(t => `<li>${escapeHtml(t.trim())}。</li>`).join('');

    return `
      <div class="cat-header">
        <span class="menu-tag">04　今どこ</span>
        <h2>あなたの人生ステージ</h2>
        <p>未来予言ではなく「今どこにいて、どう生きるべきか」を読み解きます。</p>
      </div>

      ${personalSignature(c, 'cat4')}

      <div class="fortune-card stage-card">
        <div class="stage-deco">◈ STAGE ◈</div>
        <div class="fortune-head">
          <div class="fortune-name">今のあなたの人生ステージ</div>
          <div class="fortune-result">${escapeHtml(s.name)}</div>
        </div>
        <div class="fortune-body">
          <p class="stage-pos">${escapeHtml(s.stagePos)}</p>

          <h4>今、内側で何が起きているか</h4>
          <div class="rich"><p>${escapeHtml(s.whatIsHappening)}</p></div>

          <div class="stage-howto">
            <div class="stage-howto-label">▷ この時期の生き方</div>
            <p>${escapeHtml(s.howToLive)}</p>
          </div>

          <div class="stage-avoid">
            <div class="stage-avoid-label">✗ 今、避けたいこと</div>
            <p>${escapeHtml(s.avoid)}</p>
          </div>

          <div class="stage-hint">
            <div class="stage-hint-label">★ このステージのヒント</div>
            <p>${escapeHtml(s.hint)}</p>
          </div>
        </div>
        <div class="fortune-note">※ 人生のステージは数年単位で動きます。今の自分を否定せず、「このステージで何ができるか」だけに集中して。</div>
      </div>

      ${runeCard(c)}
    `;
  }

  // ---------- カテゴリ5: 美の才能診断 ----------
  function renderCat5(c) {
    const idx = beautyIndexOf(c);
    const b = D.BEAUTY_TYPE[idx];
    if (!b) return '<div class="cat-header"><h2>美の才能診断</h2></div>';

    const venus = D.ZODIAC[c.venusSign];

    return `
      <div class="cat-header">
        <span class="menu-tag">05　美の才能</span>
        <h2>美の才能診断</h2>
        <p>あなたの魅力が最大化する"美の世界観"を6タイプから診断します。</p>
      </div>

      ${personalSignature(c, 'cat5')}

      <div class="fortune-card beauty-type-card">
        <div class="beauty-deco">✿ BEAUTY ✿</div>
        <div class="fortune-head">
          <div class="fortune-name">あなたの美の才能タイプ</div>
          <div class="fortune-result">${escapeHtml(b.name)}</div>
        </div>
        <div class="fortune-body">
          <p class="beauty-lead">${escapeHtml(b.worldview)}</p>

          <div class="beauty-magic">
            <div class="beauty-magic-label">▼ あなたの魔法</div>
            <p>${escapeHtml(b.yourMagic)}</p>
          </div>

          <h4>あなたが最も輝く世界観</h4>
          <div class="beauty-grid">
            <div class="beauty-item"><div class="bi-icon">🎨</div><div class="bi-label">カラー</div><div class="bi-val">${escapeHtml(b.color)}</div></div>
            <div class="beauty-item"><div class="bi-icon">👗</div><div class="bi-label">素材</div><div class="bi-val">${escapeHtml(b.material)}</div></div>
            <div class="beauty-item"><div class="bi-icon">💇</div><div class="bi-label">ヘア</div><div class="bi-val">${escapeHtml(b.hair)}</div></div>
            <div class="beauty-item"><div class="bi-icon">💄</div><div class="bi-label">メイク</div><div class="bi-val">${escapeHtml(b.makeup)}</div></div>
            <div class="beauty-item"><div class="bi-icon">🌸</div><div class="bi-label">香り</div><div class="bi-val">${escapeHtml(b.perfume)}</div></div>
            <div class="beauty-item"><div class="bi-icon">✨</div><div class="bi-label">立ち居振る舞い</div><div class="bi-val">${escapeHtml(b.manner)}</div></div>
          </div>

          <div class="beauty-ng">
            <div class="beauty-ng-label">✗ あなたを老けさせる装い</div>
            <p>${escapeHtml(b.ngStyle)}</p>
          </div>
        </div>
        <div class="fortune-note">※ 金星星座「${escapeHtml(venus.name)}」とあなたの本質を統合した、あなただけの美の方向性です。</div>
      </div>

      ${palmFaceCard(c)}

      ${palmSignsCard(c)}

      ${transitDetailCard(c)}

      ${kyuusei2Card(c)}

      ${buildLifecycleCard(c)}
    `;
  }

  // ---------- 手相・人相カード（写真があれば簡易解析、なければ生年月日由来） ----------
  function palmFaceCard(c){
    const p = STATE.profile || {};
    const PALM = D.PALM || [];
    const FACE = D.FACE || [];
    // 写真解析の結果を優先、なければ生年月日由来でフォールバック
    let palmRes = STATE.photoAnalysis && STATE.photoAnalysis.palm;
    let faceRes = STATE.photoAnalysis && STATE.photoAnalysis.face;
    if (!palmRes && PALM.length){
      const idx = c.palmType != null ? c.palmType % PALM.length : 0;
      palmRes = { index: idx, type: PALM[idx], hasPhoto: false, readings: [] };
    }
    if (!faceRes && FACE.length){
      const idx = c.faceType != null ? c.faceType % FACE.length : 0;
      faceRes = { index: idx, type: FACE[idx], hasPhoto: false, readings: [] };
    }
    if (!palmRes && !faceRes) return '';

    const photoNote = (hasPhoto) => hasPhoto
      ? '<span class="badge-photo" style="display:inline-block;background:#7ab395;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:.4rem;">📷 写真解析あり</span>'
      : '<span style="font-size:11px;color:#9a8a72;margin-left:.4rem;">（写真未添付：生年月日による略式診断）</span>';

    function readingsHtml(readings){
      if (!readings || !readings.length) return '';
      return `<div class="rich"><h4>あなたの写真から読み取れる傾向</h4><ul>${
        readings.map(r => `<li>${escapeHtml(r)}</li>`).join('')
      }</ul></div>`;
    }

    function detailHtml(type, color){
      const d = type && type.detail;
      if (!d) return '';
      const axes = [
        { key:'chara',  label:'🌸 性格', text:d.chara },
        { key:'love',   label:'💗 恋愛', text:d.love },
        { key:'work',   label:'💼 仕事', text:d.work },
        { key:'health', label:'🌿 健康', text:d.health }
      ].filter(a => a.text);
      if (!axes.length) return '';
      return `<div style="margin-top:.6rem;">${axes.map(a => `
        <div style="padding:.5rem .7rem;margin:.3rem 0;background:#fffdfa;border-left:3px solid ${color};border-radius:0 8px 8px 0;">
          <div style="font-size:11px;color:${color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${a.label}</div>
          <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;">${escapeHtml(a.text)}</div>
        </div>
      `).join('')}</div>`;
    }

    function photoThumb(dataUrl){
      if (!dataUrl) return '';
      return `<div style="text-align:center;margin:.6rem 0;"><img src="${dataUrl}" alt="" style="max-width:140px;max-height:140px;border-radius:8px;border:2px solid #f0c8a8;object-fit:cover;" /></div>`;
    }

    const palmBlock = palmRes ? `
      <div class="fortune-card" style="background:linear-gradient(135deg,#fef9f3 0%,#fde8d4 100%);border:1px solid #e8c8a0;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#b48a5c;margin-bottom:.4rem;">✋ 手相診断 ✋</div>
        <div class="fortune-head">
          <div class="fortune-name">手相 ${photoNote(palmRes.hasPhoto)}</div>
          <div class="fortune-result">${escapeHtml(palmRes.type.name)}</div>
        </div>
        <div class="fortune-body">
          ${photoThumb(p.palmPhoto)}
          <div class="rich">${palmRes.type.msg}</div>
          ${detailHtml(palmRes.type, '#b48a5c')}
          ${readingsHtml(palmRes.readings)}
        </div>
        <div class="fortune-note">${palmRes.hasPhoto
          ? '※ 写真は端末内のみで処理され、外部に送信されません。色味・コントラスト・線の濃淡などを画像統計として抽出し、生年月日と組み合わせて15線データベースから最も近いタイプを導き出しています。'
          : '※ 写真未添付のため、生年月日に基づく略式の手相タイプ診断です。お手のひらの写真を添付いただくと、より精度の高い診断になります。'}</div>
      </div>` : '';

    const faceBlock = faceRes ? `
      <div class="fortune-card" style="background:linear-gradient(135deg,#fdf5f8 0%,#f9d8e4 100%);border:1px solid #ecb8c8;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#b06080;margin-bottom:.4rem;">💗 人相診断 💗</div>
        <div class="fortune-head">
          <div class="fortune-name">人相 ${photoNote(faceRes.hasPhoto)}</div>
          <div class="fortune-result">${escapeHtml(faceRes.type.name)}</div>
        </div>
        <div class="fortune-body">
          ${photoThumb(p.facePhoto)}
          <div class="rich">${faceRes.type.msg}</div>
          ${detailHtml(faceRes.type, '#b06080')}
          ${readingsHtml(faceRes.readings)}
        </div>
        <div class="fortune-note">${faceRes.hasPhoto
          ? '※ 写真は端末内のみで処理され、外部に送信されません。輪郭・左右対称性・血色・中心と輪郭の明度比など画像統計を抽出し、生年月日と組み合わせて12パーツデータベースから最適なタイプを導き出しています。'
          : '※ 写真未添付のため、生年月日に基づく略式の人相タイプ診断です。お顔の写真を添付いただくと、より精度の高い診断になります。'}</div>
      </div>` : '';

    return palmBlock + faceBlock;
  }

  // ---------- 手相 特殊紋カード（v=10：細かい記号・島・スター・トライアングル等） ----------
  function palmSignsCard(c){
    const SIGNS = D.PALM_SIGNS || [];
    if (!SIGNS.length) return '';
    const p = STATE.profile || {};
    const y = p.y || 2000, m = p.m || 1, d = p.d || 1;
    // 決定論的に3つの記号を選出（同じ生年月日なら毎回同じ）
    const seed = (y * 16777619) ^ (m * 524287) ^ (d * 8191);
    const picks = [];
    const used = new Set();
    for (let i = 0; i < 3 && picks.length < 3 && picks.length < SIGNS.length; i++){
      const idx = ((seed + i * 7919) >>> 0) % SIGNS.length;
      if (!used.has(idx)){
        used.add(idx);
        picks.push(SIGNS[idx]);
      } else {
        // 重複時は線形探索
        for (let j = 1; j < SIGNS.length; j++){
          const k = (idx + j) % SIGNS.length;
          if (!used.has(k)){ used.add(k); picks.push(SIGNS[k]); break; }
        }
      }
    }
    const axes = [
      { key:'love',   label:'💗 恋愛',       color:'#b06080' },
      { key:'work',   label:'💼 仕事',       color:'#8a6040' },
      { key:'money',  label:'💰 金運',       color:'#8a8040' },
      { key:'advice', label:'✨ アドバイス',   color:'#a06090' }
    ];
    const signsHtml = picks.map(s => {
      const isGood = s.tone === 'good';
      const accent = isGood ? '#7a9a6a' : '#a67878';
      const bg     = isGood ? '#f4faf0' : '#fdf3f3';
      const toneLabel = isGood ? '吉相' : '注意';
      const axisHtml = axes.filter(a => s[a.key]).map(a => `
        <div style="padding:.45rem .65rem;margin:.25rem 0;background:#fffdfa;border-left:3px solid ${a.color};border-radius:0 8px 8px 0;">
          <div style="font-size:11px;color:${a.color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${a.label}</div>
          <div style="font-size:12px;color:#4a3a1a;line-height:1.55;">${escapeHtml(s[a.key])}</div>
        </div>
      `).join('');
      return `
        <div style="background:${bg};border-radius:10px;padding:.8rem 1rem;margin-bottom:.7rem;border-left:4px solid ${accent};">
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap;">
            <span style="font-size:18px;">${s.icon}</span>
            <span style="font-size:13px;font-weight:700;color:${accent};">${escapeHtml(s.name)}</span>
            <span style="font-size:10.5px;color:#fff;background:${accent};padding:.1rem .5rem;border-radius:8px;">${toneLabel}</span>
            <span style="font-size:11px;color:#8a7050;">出現線：${escapeHtml(s.line)}</span>
          </div>
          <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;margin-bottom:.4rem;">${escapeHtml(s.meaning)}</div>
          ${axisHtml}
        </div>
      `;
    }).join('');
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#fef9f3 0%,#f5dfb8 100%);border:1px solid #c8a868;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#8a6830;margin-bottom:.4rem;">✋ 手相 特殊紋（細かい記号）読解 ✋</div>
        <div class="fortune-head">
          <div class="fortune-name">あなたの手に出やすい3つの紋</div>
          <div class="fortune-result">${picks.map(s => escapeHtml(s.name)).join('／')}</div>
        </div>
        <div class="fortune-body">
          ${signsHtml}
        </div>
        <div class="fortune-note">※ 本格手相術では主要7線（生命/感情/頭脳/運命/太陽/結婚/財運）に出る「特殊紋」が運命を細かく示します。スター・トライアングル・スクエア・魚紋などの吉紋、島・クロス・グリル・チェーン・黒点などの凶紋を、生年月日から決定論的に3つ抽出しています。実際にお手のひらを観察して照合してみてください。</div>
      </div>
    `;
  }

  // ---------- タロット 7ポジション・スプレッドカード ----------
  function tarotSpreadCard(c){
    const p = STATE.profile;
    if (!p) return '';
    const spread = window.FortuneCalc && window.FortuneCalc.drawTarotSpread
      ? window.FortuneCalc.drawTarotSpread(p.year, p.month, p.day) : [];
    if (!spread.length) return '';

    const TBP = D.TAROT_BY_POSITION || {};
    const rows = spread.map(s => {
      const r = s.reversed;
      const meaning = r ? s.card.rev : s.card.up;
      const orient = r ? '逆位置' : '正位置';
      const orientColor = r ? '#a67878' : '#7a9a6a';
      // ポジション別の専用解釈
      const posKey = s.position.key;
      const posArr = TBP[posKey] || [];
      const posSpecific = posArr[s.cardIndex] || '';
      const posBlock = posSpecific ? `
            <div style="margin-top:.4rem;padding:.5rem .7rem;background:#f8eef9;border-radius:8px;border-left:3px solid #9a6abd;">
              <div style="font-size:10.5px;font-weight:700;color:#6a4a90;margin-bottom:.2rem;letter-spacing:.05em;">◆ この位置でのカード解釈</div>
              <div style="font-size:12.5px;color:#3a2a4a;line-height:1.65;">${escapeHtml(posSpecific)}</div>
            </div>
          ` : '';
      return `
        <div style="display:flex;gap:.8rem;padding:.9rem .7rem;border-bottom:1px dashed #e7d8c4;align-items:flex-start;">
          <div style="flex:0 0 90px;text-align:center;">
            <div style="font-size:24px;line-height:1;">${s.position.icon}</div>
            <div style="font-size:11px;color:#9a7a5a;margin-top:.3rem;font-weight:600;">${escapeHtml(s.position.label)}</div>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;flex-wrap:wrap;">
              <span style="font-size:15px;font-weight:700;color:#3a2a1a;">${escapeHtml(s.card.name)}</span>
              <span style="font-size:10px;padding:1px 7px;border-radius:8px;background:${orientColor};color:#fff;letter-spacing:.1em;">${orient}</span>
            </div>
            <div style="font-size:12.5px;color:#5a4a3a;line-height:1.55;">${escapeHtml(meaning)}</div>
            ${posBlock}
            <div style="font-size:11px;color:#9a8a72;margin-top:.3rem;font-style:italic;">— ${escapeHtml(s.position.hint)}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#f5ebf8 0%,#e8d4f0 100%);border:1px solid #c8a8e0;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#7a5a9a;margin-bottom:.4rem;">🔮 TAROT SPREAD 🔮</div>
        <div class="fortune-head">
          <div class="fortune-name">タロット 7ポジション・スプレッド</div>
          <div class="fortune-result">人生7軸のメッセージ</div>
        </div>
        <div class="fortune-body">
          <p style="font-size:13px;color:#5a4a6a;margin-bottom:.5rem;">古来「ケルト十字」を現代女性向けに再構成。あなたの生年月日から大アルカナ22枚を引き、7つの人生テーマに配置しました。</p>
          <div style="background:#fdf9ff;border-radius:10px;padding:.3rem .5rem;">
            ${rows}
          </div>
        </div>
        <div class="fortune-note">※ このスプレッドは生年月日から決定的に算出されており、同じ方には常に同じカードが出ます。タロットは「あなたの今を映す鏡」。一枚一枚のメッセージを、今日の自分と照らし合わせてみて。</div>
      </div>
    `;
  }

  // ---------- 算命学12従星 + 四柱推命通変星カード ----------
  function jushoTsuuhenCard(c){
    const JUSHO = D.JUSHO || [];
    const TSUUHEN = D.TSUUHEN || [];
    if (!JUSHO.length || !TSUUHEN.length) return '';
    const j = JUSHO[c.jushoIdx] || JUSHO[0];
    const t = TSUUHEN[c.tsuuhenIdx] || TSUUHEN[0];

    const axes = [
      { key:'work',   label:'💼 仕事', color:'#8a6040' },
      { key:'love',   label:'💗 恋愛', color:'#b06080' },
      { key:'money',  label:'💰 お金', color:'#8a8040' },
      { key:'people', label:'🤝 人間関係', color:'#608890' },
      { key:'health', label:'🌿 健康', color:'#608060' },
      { key:'luck',   label:'✨ 開運', color:'#a06090' }
    ];

    function sixAxisHtml(obj){
      return axes.filter(a => obj[a.key]).map(a => `
        <div style="padding:.5rem .7rem;margin:.3rem 0;background:#fffdf6;border-left:3px solid ${a.color};border-radius:0 8px 8px 0;">
          <div style="font-size:11px;color:${a.color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${a.label}</div>
          <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;">${escapeHtml(obj[a.key])}</div>
        </div>
      `).join('');
    }

    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#f7f3eb 0%,#ece0c8 100%);border:1px solid #d4b890;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#8a6840;margin-bottom:.4rem;">◈ 算命学 ＋ 四柱推命 深掘り ◈</div>
        <div class="fortune-head">
          <div class="fortune-name">算命学 12従星 ／ 四柱推命 通変星</div>
          <div class="fortune-result">エネルギー強度＆本質的役割（6軸詳細）</div>
        </div>
        <div class="fortune-body">
          <div style="background:#fffaf0;border-radius:10px;padding:.9rem 1rem;margin-bottom:.8rem;border-left:3px solid #c8a060;">
            <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem;flex-wrap:wrap;">
              <span style="font-size:12px;color:#9a7840;font-weight:600;">▼ 算命学 / 十二大従星</span>
              <span style="font-size:15px;font-weight:700;color:#5a3a1a;">${escapeHtml(j.name)}</span>
              <span style="font-size:11px;color:#a87850;">人生エネルギー：${escapeHtml(j.energy)}</span>
              <span style="font-size:11px;color:#a87850;">魂年齢：${escapeHtml(j.age)}</span>
            </div>
            <div style="font-size:13px;color:#4a3a1a;line-height:1.6;margin-bottom:.6rem;">${escapeHtml(j.msg)}</div>
            ${sixAxisHtml(j)}
          </div>
          <div style="background:#fff6ea;border-radius:10px;padding:.9rem 1rem;border-left:3px solid #a8804a;">
            <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem;flex-wrap:wrap;">
              <span style="font-size:12px;color:#9a7040;font-weight:600;">▼ 四柱推命 / 通変星</span>
              <span style="font-size:18px;">${t.icon}</span>
              <span style="font-size:15px;font-weight:700;color:#5a3a1a;">${escapeHtml(t.name)}</span>
            </div>
            <div style="font-size:13px;color:#4a3a1a;line-height:1.6;margin-bottom:.6rem;">${escapeHtml(t.msg)}</div>
            ${sixAxisHtml(t)}
          </div>
        </div>
        <div class="fortune-note">※ 12従星は「日干 × 年支」、通変星は「日干 vs 年干」から略式算出。本格鑑定では月支・日支も含めて命式全体で読み解きます。各6軸（仕事/恋愛/お金/人間関係/健康/開運）でオーダーメイド診断します。</div>
      </div>
    `;
  }

  // ---------- 数秘術 5数オーダーメイドカード（v=10） ----------
  function numerology5Card(c){
    const NUM5 = D.NUMEROLOGY_5AXIS || {};
    if (!Object.keys(NUM5).length) return '';
    const rows = [
      { key:'birth',       num: c.birthNum,       label:'誕生数',   icon:'🌱', color:'#608060', desc:'生まれた日からの「日々の生き方」のヒント' },
      { key:'lifepath',    num: c.lifePath,       label:'運命数',   icon:'☀️', color:'#b08040', desc:'生年月日からの「人生全体のテーマ」' },
      { key:'soul',        num: c.soulNum,        label:'魂数',     icon:'💗', color:'#b06080', desc:'名の画数からの「心の奥が求めるもの」' },
      { key:'personality', num: c.personalityNum, label:'人格数',   icon:'✨', color:'#6080a0', desc:'人格の画数からの「周囲からの印象」' },
      { key:'maturity',    num: c.maturityNum,    label:'成熟数',   icon:'🌳', color:'#7060a0', desc:'運命数+魂数からの「人生後半のテーマ」' }
    ];
    const rowHtml = rows.map(r => {
      const entry = NUM5[r.num];
      const text = entry && entry[r.key] ? entry[r.key] : '';
      const numLabel = (r.num === 11 || r.num === 22 || r.num === 33) ? `${r.num}（マスター数）` : `${r.num}`;
      return `
        <div style="padding:.6rem .8rem;margin:.4rem 0;background:#fffdf6;border-left:3px solid ${r.color};border-radius:0 8px 8px 0;">
          <div style="font-size:11px;color:${r.color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${r.icon} ${r.label} ＝ ${numLabel}</div>
          <div style="font-size:11px;color:#8a7050;margin-bottom:.3rem;">${escapeHtml(r.desc)}</div>
          <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;">${escapeHtml(text)}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#fff8e8 0%,#ffe8c8 100%);border:1px solid #d8b888;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#9a6830;margin-bottom:.4rem;">✦ 数秘術 5数 オーダーメイド解読 ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">数秘術 5数の深掘り</div>
          <div class="fortune-result">誕生数 ${c.birthNum} ／ 運命数 ${c.lifePath} ／ 魂数 ${c.soulNum} ／ 人格数 ${c.personalityNum} ／ 成熟数 ${c.maturityNum}</div>
        </div>
        <div class="fortune-body">
          ${rowHtml}
        </div>
        <div class="fortune-note">※ ライフパス（運命数）だけでなく、誕生数（日々）／魂数（内面）／人格数（印象）／成熟数（人生後半）の 5 つを別個に算出。本格数秘術の多層構造で「同じ運命数でも違う人生」を解き明かします。</div>
      </div>
    `;
  }

  // ---------- 姓名判断 五格詳細カード（v=9） ----------
  function seimeiCard(c){
    const SEIMEI = D.SEIMEI || [];
    if (!SEIMEI.length || !c.seimei) return '';
    const idx = (c.seimei.sokaku != null) ? (c.seimei.sokaku % SEIMEI.length) : 0;
    const s = SEIMEI[idx] || SEIMEI[0];
    const det = s.detail || {};
    const axes = [
      { key:'love',   label:'💗 恋愛',   color:'#b06080' },
      { key:'work',   label:'💼 仕事',   color:'#8a6040' },
      { key:'health', label:'🌿 健康',   color:'#608060' },
      { key:'wealth', label:'💰 財運',   color:'#8a8040' },
      { key:'advice', label:'✨ 開運アドバイス', color:'#a06090' }
    ];
    const axisHtml = axes.filter(a => det[a.key]).map(a => `
      <div style="padding:.5rem .7rem;margin:.3rem 0;background:#fffdf6;border-left:3px solid ${a.color};border-radius:0 8px 8px 0;">
        <div style="font-size:11px;color:${a.color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${a.label}</div>
        <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;">${escapeHtml(det[a.key])}</div>
      </div>
    `).join('');
    const sokakuNum = (c.seimei && c.seimei.sokaku != null) ? `総格 ${c.seimei.sokaku}画` : '';
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#faf2f7 0%,#efddec 100%);border:1px solid #d8b8d0;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#8a5080;margin-bottom:.4rem;">◈ 姓名判断 五格詳細 ◈</div>
        <div class="fortune-head">
          <div class="fortune-name">姓名判断 / ${escapeHtml(s.name)}</div>
          <div class="fortune-result">${escapeHtml(sokakuNum)}</div>
        </div>
        <div class="fortune-body">
          <div style="background:#fffafd;border-radius:10px;padding:.8rem 1rem;margin-bottom:.6rem;border-left:3px solid #c890b8;">
            <div class="rich">${s.msg}</div>
          </div>
          ${axisHtml}
        </div>
        <div class="fortune-note">※ 総格を基に5軸（恋愛／仕事／健康／財運／開運アドバイス）で詳細展開。本格鑑定では天格・人格・地格・外格も含め五格全体で読み解きます。</div>
      </div>
    `;
  }

  // ---------- 姓名判断 五格すべての個別解釈カード（v=10） ----------
  function seimeiGokakuCard(c){
    const G = D.SEIMEI_GOKAKU;
    if (!G || !c.seimei) return '';
    const s = c.seimei;
    const rows = [
      { key:'tenkaku',  num: s.tenkaku,  color:'#8a6840', bg:'#fff8ee' },
      { key:'jinkaku',  num: s.jinkaku,  color:'#a05080', bg:'#fff0f6' },
      { key:'chikaku',  num: s.chikaku,  color:'#608060', bg:'#f4faf0' },
      { key:'gaikaku',  num: s.gaikaku,  color:'#5070a8', bg:'#eff4fb' },
      { key:'sokaku',   num: s.sokaku,   color:'#7050a0', bg:'#f3eef9' }
    ];
    const rowHtml = rows.map(r => {
      const g = G[r.key];
      if (!g) return '';
      const idx = (r.num != null) ? (r.num % 9) : 0;
      const entry = (g.entries && g.entries[idx]) || '';
      return `
        <div style="background:${r.bg};border-radius:10px;padding:.7rem .9rem;margin-bottom:.5rem;border-left:3px solid ${r.color};">
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;flex-wrap:wrap;">
            <span style="font-size:14px;">${g.icon}</span>
            <span style="font-size:12px;font-weight:700;color:${r.color};">${g.label}</span>
            <span style="font-size:11px;color:#8a7050;">${r.num} 画</span>
          </div>
          <div style="font-size:11.5px;color:#8a7050;margin-bottom:.3rem;line-height:1.5;">${escapeHtml(g.desc)}</div>
          <div style="font-size:12.5px;color:#3a2a1a;line-height:1.6;">${escapeHtml(entry)}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#fbf6fa 0%,#f0e0ed 100%);border:1px solid #c8a8c0;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#704060;margin-bottom:.4rem;">◈ 姓名判断 五格 すべて個別鑑定 ◈</div>
        <div class="fortune-head">
          <div class="fortune-name">五格 完全展開</div>
          <div class="fortune-result">天格${s.tenkaku} ／ 人格${s.jinkaku} ／ 地格${s.chikaku} ／ 外格${s.gaikaku} ／ 総格${s.sokaku}</div>
        </div>
        <div class="fortune-body">
          ${rowHtml}
        </div>
        <div class="fortune-note">※ 本格姓名判断では、総格だけでなく天格（祖先運）／人格（主運・性格）／地格（前半生）／外格（社会運）／総格（晩年運）の 5 つを個別に読み解きます。中でも人格が最も重要な「あなたの本質」を示します。</div>
      </div>
    `;
  }

  // ---------- 算命学 宿命星カード（v=10：月支配置・日支配置） ----------
  function shukumeiseiCard(c){
    const S = D.SHUKUMEISEI || [];
    if (!S.length || !c.shukumeisei) return '';
    const ges = S[c.shukumeisei.gessei % S.length] || S[0];
    const nis = S[c.shukumeisei.nissei % S.length] || S[0];
    const BRANCH = D.BRANCHES || [];
    const monthBranchName = (BRANCH[c.monthBranch] && BRANCH[c.monthBranch].name) || '';
    const dayBranchName   = (BRANCH[c.dayBranch]   && BRANCH[c.dayBranch].name)   || '';
    const axes = [
      { key:'nature', label:'🌱 性質',       color:'#608060' },
      { key:'love',   label:'💗 恋愛',       color:'#b06080' },
      { key:'work',   label:'💼 仕事',       color:'#8a6040' },
      { key:'family', label:'🏠 家庭',       color:'#5070a8' },
      { key:'advice', label:'✨ 開運アドバイス', color:'#a06090' }
    ];
    const renderStar = (star, placeLabel, placeDesc, branchName, accent) => {
      const axisHtml = axes.filter(a => star[a.key]).map(a => `
        <div style="padding:.5rem .7rem;margin:.3rem 0;background:#fffdf6;border-left:3px solid ${a.color};border-radius:0 8px 8px 0;">
          <div style="font-size:11px;color:${a.color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${a.label}</div>
          <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;">${escapeHtml(star[a.key])}</div>
        </div>
      `).join('');
      return `
        <div style="background:#fdfaf0;border-radius:10px;padding:.8rem 1rem;margin-bottom:.8rem;border-left:4px solid ${accent};">
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap;">
            <span style="font-size:18px;">${star.icon}</span>
            <span style="font-size:13px;font-weight:700;color:${accent};">${escapeHtml(star.name)}</span>
            <span style="font-size:11px;color:#8a7050;background:#fff0d8;padding:.1rem .4rem;border-radius:6px;">${placeLabel}（${branchName}月支/日支）</span>
          </div>
          <div style="font-size:11.5px;color:#8a7050;margin-bottom:.4rem;line-height:1.5;">${placeDesc}</div>
          ${axisHtml}
        </div>
      `;
    };
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#fbf6e8 0%,#f0e0c0 100%);border:1px solid #c8a868;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#7a5830;margin-bottom:.4rem;">⛩ 算命学 宿命星（月支配置・日支配置）⛩</div>
        <div class="fortune-head">
          <div class="fortune-name">十大主星による命式読解</div>
          <div class="fortune-result">月支：${escapeHtml(ges.name)} ／ 日支：${escapeHtml(nis.name)}</div>
        </div>
        <div class="fortune-body">
          ${renderStar(ges, '月支配置', '社会的役割・職業傾向・人生中盤に表に出る顔', monthBranchName, '#a08040')}
          ${renderStar(nis, '日支配置', '家庭・配偶者・私的領域・配偶者運の傾向', dayBranchName, '#806040')}
        </div>
        <div class="fortune-note">※ 本格算命学では命式（年支・月支・日支）に出る主星を読み解きます。月支は社会的顔（外向きの自分）、日支は家庭の顔（内向きの自分）を象徴。日干と各支の蔵干（最も強い天干）の通変関係から導出。</div>
      </div>
    `;
  }

  // ---------- 四柱推命 命式カード（v=10：年柱・月柱・日柱・時柱＋蔵干通変） ----------
  function meishikiCard(c){
    if (!c.meishiki) return '';
    const PILLAR = D.MEISHIKI_PILLARS || {};
    const STEMS = D.STEMS || [];
    const BRANCH = D.BRANCHES || [];
    const TSUUHEN = D.TSUUHEN || [];
    const M = c.meishiki;
    const pillars = [
      { key:'year',  data: M.year  },
      { key:'month', data: M.month },
      { key:'day',   data: M.day   },
      { key:'hour',  data: M.hour  }
    ];
    const stemName   = (i) => (STEMS[i]   && STEMS[i].name)   || '?';
    const branchName = (i) => (BRANCH[i]  && BRANCH[i].name)  || '?';
    const tsuuhenName= (i) => (i == null ? '日主' : ((TSUUHEN[i] && TSUUHEN[i].name) || '?'));
    const pillarHtml = pillars.map(p => {
      const info = PILLAR[p.key] || {};
      if (!p.data){
        return `
          <div style="background:#f7f4ef;border-radius:10px;padding:.7rem .9rem;margin-bottom:.55rem;border-left:4px solid #c8b8a0;">
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;flex-wrap:wrap;">
              <span style="font-size:16px;">${info.icon || ''}</span>
              <span style="font-size:13px;font-weight:700;color:${info.color || '#7a6850'};">${info.label || p.key}</span>
              <span style="font-size:11px;color:#8a7050;">${info.period || ''}</span>
            </div>
            <div style="font-size:12px;color:#8a7050;line-height:1.55;">${escapeHtml(info.desc || '')}</div>
            <div style="font-size:11.5px;color:#9a6868;margin-top:.4rem;background:#fdf4ea;padding:.35rem .55rem;border-radius:6px;display:inline-block;">※ 出生時刻が未入力のため、時柱は算出できません。</div>
          </div>
        `;
      }
      const sName = stemName(p.data.stem);
      const bName = branchName(p.data.branch);
      const tName = tsuuhenName(p.data.tsuuhen);
      const zName = tsuuhenName(p.data.zouTsuuhen);
      return `
        <div style="background:#fdfaf3;border-radius:10px;padding:.75rem .95rem;margin-bottom:.55rem;border-left:4px solid ${info.color || '#a08040'};">
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap;">
            <span style="font-size:16px;">${info.icon || ''}</span>
            <span style="font-size:13px;font-weight:700;color:${info.color || '#7a6850'};">${info.label || p.key}</span>
            <span style="font-size:11px;color:#fff;background:${info.color || '#a08040'};padding:.1rem .5rem;border-radius:8px;">${escapeHtml(info.period || '')}</span>
          </div>
          <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.4rem;">
            <div style="background:#fff;border:1.5px solid ${info.color || '#a08040'};border-radius:8px;padding:.3rem .6rem;text-align:center;min-width:55px;">
              <div style="font-size:9.5px;color:#9a7850;letter-spacing:.1em;">天干</div>
              <div style="font-size:15px;font-weight:700;color:${info.color || '#a08040'};">${escapeHtml(sName)}</div>
            </div>
            <div style="background:#fff;border:1.5px solid ${info.color || '#a08040'};border-radius:8px;padding:.3rem .6rem;text-align:center;min-width:55px;">
              <div style="font-size:9.5px;color:#9a7850;letter-spacing:.1em;">地支</div>
              <div style="font-size:15px;font-weight:700;color:${info.color || '#a08040'};">${escapeHtml(bName)}</div>
            </div>
            <div style="background:#fffef4;border:1px dashed ${info.color || '#a08040'};border-radius:8px;padding:.3rem .55rem;flex:1;min-width:120px;">
              <div style="font-size:10px;color:#8a7050;">通変（天干 vs 日干）</div>
              <div style="font-size:12.5px;color:#4a3a1a;font-weight:600;">${escapeHtml(tName)}</div>
            </div>
            <div style="background:#fdf6ee;border:1px dashed ${info.color || '#a08040'};border-radius:8px;padding:.3rem .55rem;flex:1;min-width:120px;">
              <div style="font-size:10px;color:#8a7050;">蔵干通変（地支の主蔵干 vs 日干）</div>
              <div style="font-size:12.5px;color:#4a3a1a;font-weight:600;">${escapeHtml(zName)}</div>
            </div>
          </div>
          <div style="font-size:11.5px;color:#8a7050;line-height:1.55;">${escapeHtml(info.desc || '')}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#f6f0e6 0%,#e0d0b0 100%);border:1px solid #b89868;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#7a5830;margin-bottom:.4rem;">⛩ 四柱推命 命式 完全展開 ⛩</div>
        <div class="fortune-head">
          <div class="fortune-name">年柱・月柱・日柱・時柱 × 通変＋蔵干通変</div>
          <div class="fortune-result">日干 ${escapeHtml(stemName(M.day.stem))} 基準</div>
        </div>
        <div class="fortune-body">
          ${pillarHtml}
        </div>
        <div class="fortune-note">※ 本格四柱推命では命式の4柱すべて（年柱=祖先・幼少期、月柱=社会的活動・両親、日柱=自分自身・配偶者、時柱=晩年・子供）と、各柱の天干通変＋地支に隠れた蔵干通変を読み解きます。出生時刻が分かるとさらに精緻な鑑定になります。</div>
      </div>
    `;
  }

  // ---------- 夢占いカード（v=9） ----------
  function dreamCard(c){
    const DREAM = D.DREAM || [];
    if (!DREAM.length) return '';
    const idx = (c.dreamIdx != null) ? (c.dreamIdx % DREAM.length) : 0;
    const d = DREAM[idx] || DREAM[0];
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#f0eef9 0%,#dcd6ee 100%);border:1px solid #b8b0d8;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#6a5a90;margin-bottom:.4rem;">☾ 潜在意識の夢シンボル ☾</div>
        <div class="fortune-head">
          <div class="fortune-name">夢占い / 潜在意識のサイン</div>
          <div class="fortune-result">あなたの夢の象徴：${escapeHtml(d.key)}</div>
        </div>
        <div class="fortune-body">
          <div style="background:#faf9ff;border-radius:10px;padding:.9rem 1rem;border-left:3px solid #8a78b8;">
            <div class="rich">${d.msg}</div>
          </div>
        </div>
        <div class="fortune-note">※ 生年月日から導いた、今あなたに最も関連が深い夢の象徴です。100種の象徴の中から、潜在意識が今あなたに見せたいメッセージを抽出。</div>
      </div>
    `;
  }

  // ---------- ルーン占いカード（v=9） ----------
  function runeCard(c){
    const RUNES = D.RUNES || [];
    if (!RUNES.length) return '';
    const idx = (c.runeIdx != null) ? (c.runeIdx % RUNES.length) : 0;
    const r = RUNES[idx] || RUNES[0];
    const axes = [
      { key:'love',   label:'💗 恋愛',   color:'#b06080' },
      { key:'work',   label:'💼 仕事',   color:'#8a6040' },
      { key:'money',  label:'💰 お金',   color:'#8a8040' },
      { key:'advice', label:'✨ アドバイス', color:'#a06090' }
    ];
    const axisHtml = axes.filter(a => r[a.key]).map(a => `
      <div style="padding:.5rem .7rem;margin:.3rem 0;background:#fffdf6;border-left:3px solid ${a.color};border-radius:0 8px 8px 0;">
        <div style="font-size:11px;color:${a.color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${a.label}</div>
        <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;">${escapeHtml(r[a.key])}</div>
      </div>
    `).join('');
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#f3eee5 0%,#e2d5bd 100%);border:1px solid #c8b08a;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#7a5830;margin-bottom:.4rem;">ᚠ ルーン占い (Elder Futhark) ᚠ</div>
        <div class="fortune-head">
          <div class="fortune-name">今のあなたを示すルーン文字</div>
          <div class="fortune-result">${escapeHtml(r.name)}</div>
        </div>
        <div class="fortune-body">
          <div style="background:#fffaf0;border-radius:10px;padding:.8rem 1rem;margin-bottom:.6rem;border-left:3px solid #b89060;">
            <div style="font-size:13px;color:#4a3a1a;line-height:1.6;">${escapeHtml(r.meaning)}</div>
          </div>
          ${axisHtml}
        </div>
        <div class="fortune-note">※ 北欧古代の Elder Futhark 24 文字から、生年月日に基づき今のあなたに最も響く一文字を抽出。4軸（恋愛／仕事／お金／アドバイス）で詳細展開。</div>
      </div>
    `;
  }

  // ---------- 易経カード（v=9） ----------
  function ichingCard(c){
    const ICHING = D.ICHING || [];
    if (!ICHING.length) return '';
    const idx = (c.ichingIdx != null) ? (c.ichingIdx % ICHING.length) : 0;
    const h = ICHING[idx] || ICHING[0];
    const axes = [
      { key:'love',   label:'💗 恋愛',     color:'#b06080' },
      { key:'work',   label:'💼 仕事',     color:'#8a6040' },
      { key:'advice', label:'✨ アドバイス', color:'#a06090' }
    ];
    const axisHtml = axes.filter(a => h[a.key]).map(a => `
      <div style="padding:.5rem .7rem;margin:.3rem 0;background:#fffdf6;border-left:3px solid ${a.color};border-radius:0 8px 8px 0;">
        <div style="font-size:11px;color:${a.color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${a.label}</div>
        <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;">${escapeHtml(h[a.key])}</div>
      </div>
    `).join('');
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#eef3ec 0%,#d2dfcd 100%);border:1px solid #a8c098;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#506840;margin-bottom:.4rem;">☯ 易経 六十四卦 ☯</div>
        <div class="fortune-head">
          <div class="fortune-name">今のあなたを照らす卦</div>
          <div class="fortune-result">${escapeHtml(h.name)}</div>
        </div>
        <div class="fortune-body">
          <div style="background:#f8fcf5;border-radius:10px;padding:.8rem 1rem;margin-bottom:.6rem;border-left:3px solid #708858;">
            <div style="font-size:13px;color:#3a4a2a;line-height:1.6;">${escapeHtml(h.meaning)}</div>
          </div>
          ${axisHtml}
        </div>
        <div class="fortune-note">※ 中国古代の易経六十四卦から、生年月日に基づき今のあなたの状況に最も響く卦を抽出。恋愛・仕事・アドバイスの3軸で人生の方向を示します。</div>
      </div>
    `;
  }

  // ---------- タロット小アルカナカード（v=10） ----------
  function minorTarotCard(c){
    const MINOR = D.TAROT_MINOR || [];
    if (!MINOR.length) return '';
    const idx = (c.minorTarotIdx != null) ? (c.minorTarotIdx % MINOR.length) : 0;
    const m = MINOR[idx] || MINOR[0];
    const suitMap = {
      wands:     { label:'ワンド（火）', color:'#b85040', bg:'#fdf3ec', accent:'#d87060' },
      cups:      { label:'カップ（水）', color:'#4070a8', bg:'#eef4fb', accent:'#6090c0' },
      swords:    { label:'ソード（風）', color:'#7058a0', bg:'#f3eef9', accent:'#9078c0' },
      pentacles: { label:'ペンタクル（土）', color:'#608048', bg:'#f1f6ec', accent:'#80a068' }
    };
    const s = suitMap[m.suit] || suitMap.wands;
    const axes = [
      { key:'love',  label:'💗 恋愛', color:'#b06080' },
      { key:'work',  label:'💼 仕事', color:'#8a6040' },
      { key:'money', label:'💰 お金', color:'#8a8040' }
    ];
    const axisHtml = axes.filter(a => m[a.key]).map(a => `
      <div style="padding:.5rem .7rem;margin:.3rem 0;background:#fffdf6;border-left:3px solid ${a.color};border-radius:0 8px 8px 0;">
        <div style="font-size:11px;color:${a.color};font-weight:700;margin-bottom:.2rem;letter-spacing:.05em;">${a.label}</div>
        <div style="font-size:12.5px;color:#4a3a1a;line-height:1.6;">${escapeHtml(m[a.key])}</div>
      </div>
    `).join('');
    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,${s.bg} 0%,#ffffff 100%);border:1px solid ${s.accent};">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:${s.color};margin-bottom:.4rem;">✦ タロット 小アルカナ 詳細 ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">本日のあなたの小アルカナ</div>
          <div class="fortune-result">${escapeHtml(m.name)}</div>
        </div>
        <div class="fortune-body">
          <div style="background:#ffffff;border-radius:10px;padding:.7rem .9rem;margin-bottom:.6rem;border-left:3px solid ${s.color};">
            <div style="font-size:11px;font-weight:700;color:${s.color};margin-bottom:.3rem;">▼ ${s.label}　／　カード意味</div>
            <div style="font-size:13px;color:#4a3a1a;line-height:1.6;">${escapeHtml(m.meaning)}</div>
          </div>
          ${axisHtml}
        </div>
        <div class="fortune-note">※ 78 枚タロット（大アルカナ22＋小アルカナ56）の小アルカナ部分。4 スート×14 枚＝56 枚から、生年月日に基づき今のあなたに最も響く 1 枚を抽出。恋愛・仕事・お金の 3 軸で日常的な行動指針を示します。</div>
      </div>
    `;
  }

  // ---------- 西洋占星術 12ハウスカード（v=10：等ハウス制） ----------
  function astroHousesCard(c){
    const H = D.HOUSES || [];
    const Z = D.ZODIAC || [];
    const P = D.PLANETS || {};
    if (!H.length) return '';
    const p = STATE.profile || {};
    const hasHour = p.hour != null && p.hour !== '';
    const asc = c.ascendant != null ? c.ascendant : 0;
    // 等ハウス制：ハウスN = mod(planetSign - ASC, 12) + 1
    const houseOf = (signIdx) => (((signIdx - asc) % 12) + 12) % 12 + 1;
    // 各惑星のハウス
    const planets = [
      { key:'sun',     name:'太陽',   icon:'☀️', sign: c.sunSign  },
      { key:'moon',    name:'月',     icon:'🌙', sign: c.moonSign },
      { key:'mercury', name:'水星',   icon:'☿',  sign: c.mercurySign },
      { key:'venus',   name:'金星',   icon:'♀',  sign: c.venusSign },
      { key:'mars',    name:'火星',   icon:'♂',  sign: c.marsSign },
      { key:'jupiter', name:'木星',   icon:'♃',  sign: c.jupiterSign },
      { key:'saturn',  name:'土星',   icon:'♄',  sign: c.saturnSign }
    ];
    // ハウス → 天体リスト
    const planetsByHouse = {};
    planets.forEach(pl => {
      if (pl.sign == null) return;
      const h = houseOf(pl.sign);
      (planetsByHouse[h] = planetsByHouse[h] || []).push(pl);
    });
    // 表示するハウス（天体があるハウス＋ASC/MCを含む主要ハウス）
    const focusHouses = Object.keys(planetsByHouse).map(Number).sort((a,b) => a - b);

    const houseHtml = H.map(house => {
      const ps = planetsByHouse[house.num] || [];
      const isFocus = ps.length > 0;
      const accent = isFocus ? '#7a6ab8' : '#c8c0d8';
      const bg = isFocus ? '#f4eef9' : '#faf8fc';
      const planetTags = ps.map(pl => {
        const z = Z[pl.sign] || {};
        return `<span style="display:inline-block;background:#fff;border:1.5px solid #8a6ab0;color:#5a4080;font-size:11px;padding:.15rem .5rem;border-radius:10px;margin:.1rem .15rem;font-weight:600;">${pl.icon} ${escapeHtml(pl.name)}（${z.symbol || ''}${escapeHtml(z.name || '')}）</span>`;
      }).join('');
      return `
        <div style="background:${bg};border-radius:9px;padding:.55rem .75rem;margin-bottom:.4rem;border-left:3px solid ${accent};">
          <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem;">
            <span style="font-size:11px;font-weight:700;color:#5a4080;background:#e8dcf5;padding:.1rem .45rem;border-radius:6px;">H${house.num}</span>
            <span style="font-size:12.5px;font-weight:600;color:#4a3a6a;">${escapeHtml(house.name)}</span>
          </div>
          <div style="font-size:11px;color:#7a6a9a;margin-bottom:.25rem;font-style:italic;">${escapeHtml(house.theme)}</div>
          <div style="font-size:11.5px;color:#4a3a5a;line-height:1.5;margin-bottom:${planetTags ? '.35rem' : '0'};">${escapeHtml(house.desc)}</div>
          ${planetTags ? `<div>${planetTags}</div>` : ''}
        </div>
      `;
    }).join('');

    // フォーカスハウスのサマリー
    const focusSummary = focusHouses.length ? `
      <div style="background:#fff;border-radius:8px;padding:.5rem .7rem;margin-bottom:.5rem;border-left:3px solid #8a6ab0;">
        <div style="font-size:11px;color:#5a4080;font-weight:700;margin-bottom:.2rem;">◆ あなたの「天体が集まる人生領域」</div>
        <div style="font-size:12.5px;color:#3a2a5a;line-height:1.6;">
          ${focusHouses.map(h => {
            const houseInfo = H[h - 1] || {};
            const psHere = planetsByHouse[h] || [];
            return `<div style="margin:.2rem 0;">・<strong>第${h}ハウス</strong>（${escapeHtml(houseInfo.theme || '')}）：${psHere.map(pl => escapeHtml(pl.name)).join('・')}</div>`;
          }).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#f0eaf8 0%,#e0d4f0 100%);border:1px solid #a890d0;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ 12 HOUSES / 人生の12領域 ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">西洋占星術 12ハウス（等ハウス制）</div>
          <div class="fortune-result">ASC：${escapeHtml((Z[asc] && Z[asc].name) || '?')}</div>
        </div>
        <div class="fortune-body">
          <p style="font-size:12.5px;color:#5a4a6a;margin-bottom:.5rem;">アセンダント（${escapeHtml((Z[asc] && Z[asc].name) || '?')}）を起点に、天空を 30°ずつ 12 等分した「人生のフィールド」。各惑星がどのハウスに入るかで、その天体の力がどの人生領域で発揮されるかが分かります。</p>
          ${focusSummary}
          ${houseHtml}
        </div>
        <div class="fortune-note">※ 等ハウス制（Equal House System）による略式算出。${hasHour ? '出生時刻が入力されているため、ASCに基づくハウス配置を表示しています。' : '出生時刻が未入力のため、ASCは生年月日からの近似値です。正確なハウス配置には出生時刻・場所（緯度経度）が必要です。'}本格鑑定ではプラシダス方式を用います。</div>
      </div>
    `;
  }

  // ========== v=11 本格鑑定マスター 最高峰拡張レンダラー ==========

  // ---------- 西洋占星術 アスペクト ----------
  function aspectsCard(c){
    const A = D.ASPECTS;
    if (!A || !c.aspects || !c.aspects.length) return '';
    const items = c.aspects.map(a => {
      const info = A[a.type] || {};
      const toneColor = info.tone === 'good' ? '#7a9b6e' : '#b87a8a';
      return `
        <div style="background:#fff7f4;border-left:3px solid ${toneColor};padding:.6rem .8rem;border-radius:8px;margin-bottom:.5rem;">
          <div style="font-weight:600;color:#3a2b5a;margin-bottom:.2rem;">
            ${escapeHtml(a.label1)} ✕ ${escapeHtml(a.label2)}　<span style="font-size:11px;color:${toneColor};">${escapeHtml(info.label || '')}　${escapeHtml(info.angle || '')}</span>
          </div>
          <div style="font-size:12.5px;color:#5a4a6a;line-height:1.6;">${escapeHtml(info.meaning || '')}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fortune-card">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ ASPECTS / 天体間角度 ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">あなたの命式に出ているアスペクト</div>
          <div class="fortune-result">${c.aspects.length} 個</div>
        </div>
        <div class="fortune-body">
          <p style="font-size:12.5px;color:#5a4a6a;margin-bottom:.6rem;">惑星と惑星の角度関係。あなたの内側にある才能の組み合わせ・葛藤・調和のパターン。</p>
          ${items}
        </div>
        <div class="fortune-note">※ 5 種のメジャーアスペクト（合・セクスタイル・スクエア・トライン・オポジション）を検出。星座差のみによる略式判定で、本格鑑定ではオーブ（±度数）まで考慮します。</div>
      </div>
    `;
  }

  // ---------- 西洋占星術 トランジット詳細 ----------
  function transitDetailCard(c){
    if (!c.transitDetail) return '';
    const T = c.transitDetail;
    const Z = D.ZODIAC || [];
    const TH = D.TRANSIT_HOUSE_THEME || {};
    return `
      <div class="fortune-card">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ TRANSIT / 今日の天体通過 ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">今日の太陽・月が照らすハウス</div>
          <div class="fortune-result">本日の流れ</div>
        </div>
        <div class="fortune-body">
          <div style="background:#fff7f4;border-radius:10px;padding:.7rem .9rem;margin-bottom:.5rem;">
            <div style="font-weight:600;color:#3a2b5a;">☀️ 今日の太陽：${escapeHtml((Z[T.sunSign] && Z[T.sunSign].name) || '?')} → 第 ${T.sunHouse} ハウス</div>
            <div style="font-size:12.5px;color:#5a4a6a;margin-top:.3rem;line-height:1.6;">${escapeHtml(TH[T.sunHouse] || '')}</div>
          </div>
          <div style="background:#fff7f4;border-radius:10px;padding:.7rem .9rem;">
            <div style="font-weight:600;color:#3a2b5a;">🌙 今日の月：${escapeHtml((Z[T.moonSign] && Z[T.moonSign].name) || '?')} → 第 ${T.moonHouse} ハウス</div>
            <div style="font-size:12.5px;color:#5a4a6a;margin-top:.3rem;line-height:1.6;">${escapeHtml(TH[T.moonHouse] || '')}</div>
          </div>
        </div>
        <div class="fortune-note">※ 今日の太陽・月が、あなたの出生図のどのハウス（人生領域）を通過しているかを示します。「今日はどの領域に光が当たっているか」のリアルタイム指針。</div>
      </div>
    `;
  }

  // ---------- 四柱推命 大運（10年運） ----------
  function daiunCard(c){
    if (!c.daiun || !c.daiun.cycles) return '';
    const STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
    const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    const themes = D.DAIUN_CYCLE_THEME || {};
    const intro = D.DAIUN_INTRO || '';
    // 現在の年齢
    const p = STATE.profile || {};
    const today = new Date();
    const age = today.getFullYear() - p.y - ((today.getMonth()+1 < p.m || (today.getMonth()+1===p.m && today.getDate()<p.d)) ? 1 : 0);
    const rows = c.daiun.cycles.map((cy, i) => {
      const inRange = age >= cy.ageStart && age <= cy.ageEnd;
      const bg = inRange ? '#ffe9ce' : '#fff7f4';
      const border = inRange ? '#d49a4e' : '#e8d7e0';
      return `
        <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:.6rem .8rem;margin-bottom:.4rem;">
          <div style="font-weight:600;color:#3a2b5a;margin-bottom:.2rem;">
            ${cy.ageStart}〜${cy.ageEnd}歳　${escapeHtml(STEMS[cy.stem])}${escapeHtml(BRANCHES[cy.branch])}
            ${inRange ? ' <span style="background:#d49a4e;color:#fff;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:.4rem;">今ココ</span>' : ''}
          </div>
          <div style="font-size:12.5px;color:#5a4a6a;line-height:1.6;">${escapeHtml(themes[i] || '')}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fortune-card">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ DAIUN / 10年運の流れ ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">四柱推命 大運（${c.daiun.forward ? '順行' : '逆行'}）</div>
          <div class="fortune-result">8 サイクル展開</div>
        </div>
        <div class="fortune-body">
          <p style="font-size:12.5px;color:#5a4a6a;margin-bottom:.5rem;">${escapeHtml(intro)}</p>
          ${rows}
        </div>
        <div class="fortune-note">※ 大運は 10 年ごとに巡る大きな運の波。月柱を起点に陰陽・性別で順逆が決まる、四柱推命の中核ロジックです。</div>
      </div>
    `;
  }

  // ---------- 四柱推命 用神・忌神 ----------
  function youjinCard(c){
    if (!c.youjin) return '';
    const Y = D.YOUJIN_KIJIN;
    if (!Y) return '';
    const counts = c.youjin.counts;
    const max = Math.max.apply(null, counts) || 1;
    const bars = ['木','火','土','金','水'].map((nm, i) => {
      const w = Math.round(counts[i] / max * 100);
      const isYou = i === c.youjin.youjin;
      const isKi  = i === c.youjin.kijin;
      const color = isYou ? '#7a9b6e' : (isKi ? '#b87a8a' : '#a89bd1');
      const tag = isYou ? '<span style="background:#7a9b6e;color:#fff;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:.4rem;">用神</span>'
                : isKi ? '<span style="background:#b87a8a;color:#fff;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:.4rem;">忌神</span>' : '';
      return `
        <div style="margin-bottom:.4rem;">
          <div style="font-size:12.5px;color:#3a2b5a;margin-bottom:.2rem;">${nm}　×${counts[i]}${tag}</div>
          <div style="background:#f4ecf2;border-radius:6px;height:10px;overflow:hidden;">
            <div style="background:${color};width:${w}%;height:100%;"></div>
          </div>
        </div>
      `;
    }).join('');
    const youEl = Y.elements[c.youjin.youjin];
    const kiEl  = Y.elements[c.youjin.kijin];
    return `
      <div class="fortune-card">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ YOUJIN・KIJIN / 五行バランス ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">あなたの五行バランス</div>
          <div class="fortune-result">用神＝${escapeHtml(youEl.name)}／忌神＝${escapeHtml(kiEl.name)}</div>
        </div>
        <div class="fortune-body">
          <p style="font-size:12.5px;color:#5a4a6a;margin-bottom:.6rem;">${escapeHtml(Y.intro)}</p>
          ${bars}
          <div style="background:#eaf5e6;border-left:3px solid #7a9b6e;padding:.6rem .8rem;border-radius:8px;margin-top:.6rem;">
            <div style="font-weight:600;color:#3a2b5a;margin-bottom:.2rem;">用神＝${escapeHtml(youEl.name)}（${escapeHtml(youEl.color)}）</div>
            <div style="font-size:12.5px;color:#5a4a6a;line-height:1.6;">${escapeHtml(youEl.advice)}</div>
          </div>
          <div style="background:#fbeef0;border-left:3px solid #b87a8a;padding:.6rem .8rem;border-radius:8px;margin-top:.4rem;">
            <div style="font-weight:600;color:#3a2b5a;margin-bottom:.2rem;">忌神＝${escapeHtml(kiEl.name)}</div>
            <div style="font-size:12.5px;color:#5a4a6a;line-height:1.6;">この五行が過剰のため、バランスを取るために <strong>${escapeHtml(youEl.name)}</strong> の要素を意識して取り入れることが鍵。</div>
          </div>
        </div>
        <div class="fortune-note">※ 命式の天干＋地支から五行（木火土金水）を集計し、最も不足する五行＝用神、過剰な五行＝忌神を判定。日々の開運アクションの羅針盤です。</div>
      </div>
    `;
  }

  // ---------- タロット ケルト十字 10枚展開 ----------
  function celticCrossCard(c){
    if (!c.celticCross || !c.celticCross.length) return '';
    const positions = D.CELTIC_CROSS_POSITIONS || [];
    const TMAJ = D.TAROT_MAJOR || [];
    const TM = D.TAROT_MINOR || [];
    if (!TMAJ.length || !TM.length) return '';
    const items = c.celticCross.map((draw, i) => {
      const pos = positions[i] || {};
      let cardName = '', cardMeaning = '';
      if (draw.isMajor && TMAJ[draw.cardIdx]) {
        const ca = TMAJ[draw.cardIdx];
        cardName = '【大】' + (ca.name || '');
        cardMeaning = ca.up || '';
      } else if (!draw.isMajor && TM[draw.cardIdx]) {
        const mc = TM[draw.cardIdx];
        cardName = '【小】' + (mc.name || '');
        cardMeaning = mc.meaning || '';
      }
      return `
        <div style="background:#fff7f4;border:1px solid #e8d7e0;border-radius:10px;padding:.7rem .9rem;margin-bottom:.5rem;">
          <div style="font-weight:600;color:#3a2b5a;margin-bottom:.2rem;">
            <span style="background:#a89bd1;color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;margin-right:.4rem;">${pos.num}</span>
            ${escapeHtml(pos.label || '')}　<span style="color:#7a6a9a;font-size:12px;">→ ${escapeHtml(cardName)}</span>
          </div>
          <div style="font-size:12px;color:#7a6a8a;margin-bottom:.3rem;">${escapeHtml(pos.desc || '')}</div>
          <div style="font-size:12.5px;color:#5a4a6a;line-height:1.6;">${escapeHtml(cardMeaning)}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fortune-card">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ CELTIC CROSS / 10ポジション ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">タロット ケルト十字スプレッド</div>
          <div class="fortune-result">78 枚から 10 枚</div>
        </div>
        <div class="fortune-body">
          <p style="font-size:12.5px;color:#5a4a6a;margin-bottom:.6rem;">タロットの最も完成された展開法。10 のポジションが現在・過去・未来・潜在意識・周囲・結末を多層的に読み解きます。</p>
          ${items}
        </div>
        <div class="fortune-note">※ 78 枚（大アルカナ22＋小アルカナ56）から、生年月日に基づく決定論的シャッフルで 10 枚を重複なく抽出。同じ生年月日の方には常に同じ 10 枚が現れます。</div>
      </div>
    `;
  }

  // ---------- 算命学 干合・支合・冲・刑 ----------
  function kanshiRelCard(c){
    if (!c.kanshiRel) return '';
    const K = D.KANSHI_RELATIONS;
    if (!K) return '';
    const types = ['kango','shigo','chu','kei'];
    const hasAny = types.some(t => c.kanshiRel[t] && c.kanshiRel[t].length);
    if (!hasAny) {
      return `
        <div class="fortune-card">
          <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ KANSHI / 命式内 特殊関係 ✦</div>
          <div class="fortune-head">
            <div class="fortune-name">命式内の干合・支合・冲・刑</div>
            <div class="fortune-result">なし</div>
          </div>
          <div class="fortune-body">
            <p style="font-size:12.5px;color:#5a4a6a;">あなたの命式 4 柱の中に、干合・支合・冲・刑の関係は検出されませんでした。これは「命式内に強い偏りがなく、バランスの取れた配置」を意味します。</p>
          </div>
        </div>
      `;
    }
    const sections = types.map(t => {
      const list = c.kanshiRel[t];
      if (!list || !list.length) return '';
      const info = K[t] || {};
      const color = info.tone === 'good' ? '#7a9b6e' : '#b87a8a';
      const pairs = list.map(pr => `<span style="background:#fff7f4;border:1px solid ${color};color:${color};padding:2px 8px;border-radius:8px;font-size:11px;margin-right:.3rem;">${escapeHtml(pr.a)} ✕ ${escapeHtml(pr.b)}</span>`).join('');
      return `
        <div style="background:#fff7f4;border-left:3px solid ${color};padding:.6rem .8rem;border-radius:8px;margin-bottom:.5rem;">
          <div style="font-weight:600;color:#3a2b5a;margin-bottom:.3rem;">${escapeHtml(info.label || t)}</div>
          <div style="margin-bottom:.4rem;">${pairs}</div>
          <div style="font-size:12.5px;color:#5a4a6a;line-height:1.6;">${escapeHtml(info.desc || '')}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fortune-card">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ KANSHI / 命式内 特殊関係 ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">命式内の干合・支合・冲・刑</div>
          <div class="fortune-result">特殊関係を検出</div>
        </div>
        <div class="fortune-body">
          <p style="font-size:12.5px;color:#5a4a6a;margin-bottom:.6rem;">命式 4 柱（年柱・月柱・日柱・時柱）の間に発生する特殊関係。あなたの内側で強く結びついているテーマ、また衝突しているテーマを示します。</p>
          ${sections}
        </div>
        <div class="fortune-note">※ 干合（天干同士の強い結合）・支合（地支の引き合い）・冲（地支の対立）・刑（地支の傷つけ合い）を検出。命式読解の精度を一段引き上げる本格ロジックです。</div>
      </div>
    `;
  }

  // ---------- 九星気学 月命星・日命星 ----------
  function kyuusei2Card(c){
    const MT = D.MONTHLY_STAR_THEME || {};
    const DT = D.DAILY_STAR_THEME || {};
    const names = ['一白水星','二黒土星','三碧木星','四緑木星','五黄土星','六白金星','七赤金星','八白土星','九紫火星'];
    const m = c.monthlyStar || 0;
    const d = c.dailyStar || 0;
    return `
      <div class="fortune-card">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ KYUUSEI / 月命星・日命星 ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">九星気学 月命星 ＆ 今日の日命星</div>
          <div class="fortune-result">月＋日の二重リズム</div>
        </div>
        <div class="fortune-body">
          <div style="background:#fff7f4;border-radius:10px;padding:.7rem .9rem;margin-bottom:.5rem;">
            <div style="font-weight:600;color:#3a2b5a;">📅 今月のあなたの月命星：${escapeHtml(names[m])}</div>
            <div style="font-size:12.5px;color:#5a4a6a;margin-top:.3rem;line-height:1.6;">${escapeHtml(MT[m] || '')}</div>
          </div>
          <div style="background:#fff7f4;border-radius:10px;padding:.7rem .9rem;">
            <div style="font-weight:600;color:#3a2b5a;">☀️ 今日の日命星：${escapeHtml(names[d])}</div>
            <div style="font-size:12.5px;color:#5a4a6a;margin-top:.3rem;line-height:1.6;">${escapeHtml(DT[d] || '')}</div>
          </div>
        </div>
        <div class="fortune-note">※ 本命星（生まれ年）に加えて、月命星（その月の気）と日命星（その日の気）の二重リズムを掛け合わせると、九星気学の精度がぐっと上がります。</div>
      </div>
    `;
  }

  // ---------- 易経 変爻・之卦 ----------
  function ichingHengaCard(c){
    if (!c.ichingHenga) return '';
    const names = D.ICHING_NAMES || [];
    const lineTheme = D.ICHING_LINE_THEME || {};
    const H = c.ichingHenga;
    return `
      <div class="fortune-card">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ ICHING HENGA / 変爻・之卦 ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">易経 本卦 → 之卦（しか）</div>
          <div class="fortune-result">動いて変わる卦</div>
        </div>
        <div class="fortune-body">
          <div style="background:#fff7f4;border-radius:10px;padding:.7rem .9rem;margin-bottom:.5rem;">
            <div style="font-weight:600;color:#3a2b5a;">📜 本卦：第${H.main + 1}卦　${escapeHtml(names[H.main] || '')}</div>
            <div style="font-size:12.5px;color:#5a4a6a;margin-top:.3rem;line-height:1.6;">現在のあなたの基本的な状況を表す卦。</div>
          </div>
          <div style="background:#fbeef0;border-radius:10px;padding:.7rem .9rem;margin-bottom:.5rem;">
            <div style="font-weight:600;color:#3a2b5a;">⚡ 変爻：第 ${H.movingLine + 1} 爻が動く</div>
            <div style="font-size:12.5px;color:#5a4a6a;margin-top:.3rem;line-height:1.6;">${escapeHtml(lineTheme[H.movingLine] || '')}</div>
          </div>
          <div style="background:#eaf5e6;border-radius:10px;padding:.7rem .9rem;">
            <div style="font-weight:600;color:#3a2b5a;">🌱 之卦：第${H.henka + 1}卦　${escapeHtml(names[H.henka] || '')}</div>
            <div style="font-size:12.5px;color:#5a4a6a;margin-top:.3rem;line-height:1.6;">本卦の状況が変化していった先に現れる卦。これがあなたの「向かう先」。</div>
          </div>
        </div>
        <div class="fortune-note">※ 本格易経では、動く爻（変爻）によって本卦から之卦へと変化します。「今の状況」だけでなく「これから変化していく方向」までを読む、64×64=4096通りの精密な占法。</div>
      </div>
    `;
  }

  // ---------- 西洋占星術 多天体ホロスコープ ----------
  function multiPlanetCard(c){
    const P = D.PLANETS;
    if (!P) return '';
    const Z = D.ZODIAC || [];

    const rows = [
      { key:'moon',    sign: c.moonSign },
      { key:'mercury', sign: c.mercurySign },
      { key:'mars',    sign: c.marsSign },
      { key:'jupiter', sign: c.jupiterSign },
      { key:'saturn',  sign: c.saturnSign }
    ];

    const items = rows.map(r => {
      const planet = P[r.key];
      if (!planet) return '';
      const signIdx = r.sign != null ? r.sign : 0;
      const z = Z[signIdx] || { name:'', symbol:'' };
      const entry = planet.signs[signIdx];
      // 後方互換: 旧データは文字列、新データは {base, strength, weakness, action}
      const isObj = entry && typeof entry === 'object';
      const baseText = isObj ? entry.base : (entry || '');
      const strength = isObj ? entry.strength : '';
      const weakness = isObj ? entry.weakness : '';
      const action = isObj ? entry.action : '';
      const detailsHtml = isObj ? `
            <div style="margin-top:.4rem;padding:.4rem .6rem;background:#f0e8fa;border-radius:6px;border-left:2px solid #8a6ab0;">
              <div style="font-size:11px;font-weight:700;color:#5a4080;margin-bottom:.15rem;">◎ 強み</div>
              <div style="font-size:12px;color:#3a2a5a;line-height:1.55;">${escapeHtml(strength)}</div>
            </div>
            <div style="margin-top:.3rem;padding:.4rem .6rem;background:#fcefef;border-radius:6px;border-left:2px solid #b07070;">
              <div style="font-size:11px;font-weight:700;color:#804040;margin-bottom:.15rem;">△ 弱み</div>
              <div style="font-size:12px;color:#5a3a3a;line-height:1.55;">${escapeHtml(weakness)}</div>
            </div>
            <div style="margin-top:.3rem;padding:.4rem .6rem;background:#eef6f0;border-radius:6px;border-left:2px solid #6a9070;">
              <div style="font-size:11px;font-weight:700;color:#406040;margin-bottom:.15rem;">▶ 今日からの具体アクション</div>
              <div style="font-size:12px;color:#2a4a2a;line-height:1.55;">${escapeHtml(action)}</div>
            </div>
      ` : '';
      return `
        <div style="display:flex;gap:.8rem;padding:.9rem .7rem;border-bottom:1px dashed #d8c8e0;align-items:flex-start;">
          <div style="flex:0 0 80px;text-align:center;">
            <div style="font-size:26px;line-height:1;">${planet.icon}</div>
            <div style="font-size:11px;color:#7a6a9a;margin-top:.3rem;font-weight:600;">${escapeHtml(planet.name)}</div>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;flex-wrap:wrap;">
              <span style="font-size:14px;font-weight:700;color:#3a2a5a;">${z.symbol || ''} ${escapeHtml(z.name)}</span>
            </div>
            <div style="font-size:11.5px;color:#9a7ab0;margin-bottom:.3rem;font-style:italic;">${escapeHtml(planet.theme)}</div>
            <div style="font-size:13px;color:#4a3a5a;line-height:1.55;">${escapeHtml(baseText)}</div>
            ${detailsHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="fortune-card" style="background:linear-gradient(135deg,#f0eaf8 0%,#dccff0 100%);border:1px solid #b8a0d8;">
        <div style="text-align:center;font-size:11px;letter-spacing:.3em;color:#5a4a8a;margin-bottom:.4rem;">✦ MULTI-PLANET HOROSCOPE ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">西洋占星術 多天体ホロスコープ</div>
          <div class="fortune-result">月・水星・火星・木星・土星</div>
        </div>
        <div class="fortune-body">
          <p style="font-size:13px;color:#5a4a6a;margin-bottom:.5rem;">太陽星座だけでは見えない、あなたの「もうひとつの本当の姿」。5天体それぞれが、あなたの違う側面を語りかけます。</p>
          <div style="background:#faf7ff;border-radius:10px;padding:.3rem .5rem;">
            ${items}
          </div>
        </div>
        <div class="fortune-note">※ 月・火星・木星・土星は出生日から略式計算。水星・金星は太陽から±28°/±48°以内、月は約2.5日で1サイン進む天文事実に基づく近似値を採用しています。本格鑑定には出生時刻と場所が必要です。</div>
      </div>
    `;
  }

  // ---------- カテゴリ6: 若返り開運アクション ----------
  function renderCat6(c) {
    const elem = elementOf(c);
    const a = D.OPENLUCK_ACTION && D.OPENLUCK_ACTION[elem];
    if (!a) return '<div class="cat-header"><h2>若返り開運アクション</h2></div>';

    const areas = [
      ['🛌','睡眠', a.sleep],
      ['🌬','呼吸', a.breath],
      ['🧘','姿勢', a.posture],
      ['💬','言葉', a.words],
      ['🌅','朝習慣', a.morning],
      ['🍴','食事', a.food],
      ['👥','人間関係', a.relation],
      ['📱','SNS・発信', a.sns],
      ['👗','ファッション', a.fashion],
      ['🌸','香り', a.perfume],
      ['🏃','運動', a.exercise],
      ['🧠','思考', a.thought]
    ];
    const rows = areas.map(([icon, label, val]) => `
      <div class="action-row">
        <div class="action-icon">${icon}</div>
        <div class="action-body">
          <div class="action-label">${escapeHtml(label)}</div>
          <div class="action-val">${escapeHtml(val)}</div>
        </div>
      </div>`).join('');

    return `
      <div class="cat-header">
        <span class="menu-tag">06　開運行動</span>
        <h2>若返り開運アクション</h2>
        <p>占いを「見て終わり」にしないための、あなた専用12領域の具体ルーチン。</p>
      </div>

      ${personalSignature(c, 'cat6')}

      <div class="fortune-card action-card">
        <div class="action-deco">★ ACTION ★</div>
        <div class="fortune-head">
          <div class="fortune-name">あなた専用の12領域ルーチン</div>
          <div class="fortune-result">${escapeHtml(elem)}の質に合わせた具体策</div>
        </div>
        <div class="fortune-body">
          <p class="action-lead">${escapeHtml(elem)}の質を持つあなたが、最も若々しく・幸せに過ごせる12領域の具体行動です。1日に1つでも取り入れると、3週間で身体が変わります。</p>
          <div class="action-list">${rows}</div>
          <div class="action-howto">
            <div class="action-howto-label">▼ 取り入れ方</div>
            <p>全部一気にやろうとしないこと。「これならできそう」と感じた1つから始めて、それが習慣化したら次へ。気負わず、ゆっくり育てていく感覚で。</p>
          </div>
        </div>
        <div class="fortune-note">※ 占いの結果に従うのではなく、あなた本来の質と共鳴する選択を積み重ねるためのガイドです。</div>
      </div>

      ${buildLuckyMatrixCard(c)}
    `;
  }

  // ---------- カテゴリ7: 人生ロードマップ（最終レポート） ----------
  function renderCat7(c) {
    const elem = elementOf(c);
    const r = D.ROADMAP && D.ROADMAP[elem];
    if (!r) return '<div class="cat-header"><h2>人生ロードマップ</h2></div>';

    const letGoLis = (r.letGo || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
    const growLis = (r.growMore || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');

    return `
      <div class="cat-header cat-header-roadmap">
        <span class="menu-tag">07　ロードマップ</span>
        <h2>あなたの人生ロードマップ</h2>
        <p>占いを超えた、あなただけの人生変革設計図。これからどう生きれば本当に楽になるかを描きます。</p>
      </div>

      ${personalSignature(c, 'cat7')}

      <div class="fortune-card roadmap-card">
        <div class="roadmap-deco">◆ ROADMAP ◆</div>
        <div class="fortune-head">
          <div class="fortune-name">あなたの人生変革設計図</div>
          <div class="fortune-result">${escapeHtml(elem)}の人として生きるロードマップ</div>
        </div>
        <div class="fortune-body">
          <div class="roadmap-theme">
            <div class="roadmap-theme-label">▼ あなたの人生のテーマ</div>
            <p>${escapeHtml(r.lifeTheme)}</p>
          </div>

          <div class="roadmap-twocol">
            <div class="roadmap-letgo">
              <div class="roadmap-col-label">✗ 今、手放すべきもの</div>
              <ul>${letGoLis}</ul>
            </div>
            <div class="roadmap-grow">
              <div class="roadmap-col-label">✦ これから伸ばすべきもの</div>
              <ul>${growLis}</ul>
            </div>
          </div>

          <div class="roadmap-young">
            <div class="roadmap-young-label">★ 若返るために必要なこと</div>
            <p>${escapeHtml(r.youngerSecret)}</p>
          </div>

          <div class="roadmap-shine">
            <div class="roadmap-shine-label">✿ あなたが本来輝く生き方</div>
            <p>${escapeHtml(r.trueShine)}</p>
          </div>

          <div class="roadmap-future">
            <div class="roadmap-future-row">
              <div class="rf-when">3 ヶ 月 後</div>
              <div class="rf-msg">${escapeHtml(r.after3Months)}</div>
            </div>
            <div class="roadmap-future-row roadmap-future-final">
              <div class="rf-when">1 年 後</div>
              <div class="rf-msg">${escapeHtml(r.after1Year)}</div>
            </div>
          </div>
        </div>
        <div class="fortune-note">※ このロードマップは、あなたが既に持っているものを示しているだけです。新しく何かを得る必要はありません。本来のあなたに戻るだけ。</div>
      </div>

      ${tarotSpreadCard(c)}

      ${minorTarotCard(c)}

      ${celticCrossCard(c)}

      ${ichingCard(c)}

      ${ichingHengaCard(c)}
    `;
  }


  // ---------- カードHTMLビルダ ----------
  function fortuneCard(name, result, body, note) {
    return `
      <div class="fortune-card">
        <div class="fortune-head">
          <div class="fortune-name">${escapeHtml(name)}</div>
          <div class="fortune-result">${escapeHtml(result)}</div>
        </div>
        <div class="fortune-body">${body}</div>
        ${note ? `<div class="fortune-note">${escapeHtml(note)}</div>` : ''}
      </div>
    `;
  }

  function escapeHtml(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  // ---------- 次のカテゴリへ ----------
  $('#btn-next-cat').addEventListener('click', () => {
    const order = ['cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6', 'cat7'];
    const cur = STATE.currentCat;
    const idx = order.indexOf(cur);
    const next = order[idx + 1];
    if (next) {
      runCategory(next);
    } else {
      // 全カテゴリ終了 → レポート画面
      updateMenuStatus();
      buildReport();
      showScreen('screen-report');
    }
  });

  // ---------- 総合レポート ----------
  $('#btn-show-report').addEventListener('click', () => {
    buildReport();
    showScreen('screen-report');
  });

  function buildReport() {
    const calc = computeAll();
    if (!calc) return;
    const p = STATE.profile;

    // 未診断カテゴリがあれば自動的に計算
    ['cat1','cat2','cat3','cat4','cat5','cat6','cat7'].forEach(cat => {
      if (!STATE.results[cat]) {
        const html =
          cat === 'cat1' ? renderCat1(calc) :
          cat === 'cat2' ? renderCat2(calc) :
          cat === 'cat3' ? renderCat3(calc) :
          cat === 'cat4' ? renderCat4(calc) :
          cat === 'cat5' ? renderCat5(calc) :
          cat === 'cat6' ? renderCat6(calc) :
          renderCat7(calc);
        STATE.results[cat] = { calc, html };
      }
    });

    const nameDisp = (p.sei || p.mei) ? `${p.sei} ${p.mei} 様` : 'あなた';
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;

    // 総括サマリー
    const z = D.ZODIAC[calc.sunSign];
    const lp = D.NUMEROLOGY[calc.lifePath];
    const animal = D.ANIMALS[calc.animal.animal];
    const elem = z.element;
    const ess = D.ESSENCE && D.ESSENCE[elem];
    const stripHeader = (s) => (s || '').replace(/<div class="cat-header[^"]*">[\s\S]*?<\/div>\s*<\/div>/, '').replace(/<div class="cat-header[^"]*">[\s\S]*?<\/div>/, '');

    const summaryHtml = `
      <div class="block">
        <h3>あなたの本質は、ひと言で言うと</h3>
        <p>「${escapeHtml(ess ? ess.keyword : z.name)}」を持つ人。${escapeHtml(z.name)}、数秘${calc.lifePath}（${escapeHtml(lp.title)}）、${escapeHtml(animal.name)}——3つの占術が共通して指し示す、あなたの揺るがない核です。</p>
      </div>
      <div class="block">
        <h3>これまで苦しかった理由</h3>
        <p>${escapeHtml(ess ? ess.breakPoint : '')}　これがあなたを消耗させてきた根本です。</p>
      </div>
      <div class="block">
        <h3>これから生きるべき道</h3>
        <p>${escapeHtml(ess ? ess.lifeTheme : z.future)}</p>
      </div>
      <div class="block block-final">
        <h3>このレポートを閉じた後、最初にやってほしいこと</h3>
        <p>一番心に残った1ページを、もう一度だけ読み返してください。そして、その中の「今日からできる小さな一歩」を、明日の自分のために1つだけ選んでください。それが、本当のあなたへ戻る最初の道しるべになります。</p>
      </div>
    `;

    const report = `
      <div class="report" id="report-body">
        <div class="report-cover">
          <div class="label">LIFE MANUAL</div>
          <h1>魅力開花診断<br>人生の取扱説明書</h1>
          <div class="sub">— for the woman who blooms again —</div>
          <div class="for">For</div>
          <div class="name">${escapeHtml(nameDisp)}</div>
          <div class="date">${dateStr}</div>
        </div>

        <div class="report-section">
          <h2>01　本質の私を知る</h2>
          <div class="section-sub">先天性 ／ 東西占術が指し示す、あなたの核</div>
          ${stripHeader(STATE.results.cat1.html)}
        </div>

        <div class="report-section">
          <h2>02　表面の私を知る</h2>
          <div class="section-sub">社会性 ／ 自分像と他人像のギャップ</div>
          ${stripHeader(STATE.results.cat2.html)}
        </div>

        <div class="report-section">
          <h2>03　心の歪み診断</h2>
          <div class="section-sub">後天性 ／ なぜ今まで苦しかったのか／身体への現れ</div>
          ${stripHeader(STATE.results.cat3.html)}
        </div>

        <div class="report-section">
          <h2>04　人生ステージ診断</h2>
          <div class="section-sub">今どこ ／ 今の位置と過ごし方</div>
          ${stripHeader(STATE.results.cat4.html)}
        </div>

        <div class="report-section">
          <h2>05　美の才能診断</h2>
          <div class="section-sub">美 ／ あなたの魅力が最大化する世界観</div>
          ${stripHeader(STATE.results.cat5.html)}
        </div>

        <div class="report-section">
          <h2>06　若返り開運アクション</h2>
          <div class="section-sub">開運 ／ 今日からできる12領域の具体策</div>
          ${stripHeader(STATE.results.cat6.html)}
        </div>

        <div class="report-section">
          <h2>07　あなたの人生ロードマップ</h2>
          <div class="section-sub">設計図 ／ 手放すもの・伸ばすもの・3ヶ月後・1年後</div>
          ${stripHeader(STATE.results.cat7.html)}
        </div>

        ${worryPrescription(calc)}

        <div class="report-section report-ai" id="report-ai-section">
          <h2>09　AI占い師「美瑛」からの直筆診断</h2>
          <div class="section-sub">複数占術 × 40年経験のAI占い師が、あなただけに書き下ろす最終診断</div>
          <div class="block" id="report-ai-placeholder" style="background:linear-gradient(135deg,#fff8f3 0%,#ffeee1 100%);border:1px solid #e6c8a8;padding:1.4rem;text-align:center;">
            <p style="margin:0 0 .6rem 0;font-weight:600;color:#8a5a2c;">✦ AIが、あなたの全占術結果と悩みを統合中… ✦</p>
            <p style="margin:0;font-size:13px;color:#a07a5a;">通常30秒〜1分ほどお待ちください。完了後、この場所に直筆診断が表示されます。</p>
            <div style="margin-top:.8rem;font-size:11px;color:#b08a6a;">※ AIが応答しない場合や通信エラー時は、この章はスキップされます（他の診断には影響しません）</div>
          </div>
        </div>

        <div class="report-section report-summary">
          <h2>総括 ／ ここから始まる、本当のあなた</h2>
          <div class="section-sub">7つの診断を、1つに結んで</div>
          ${summaryHtml}
        </div>
      </div>
    `;

    $('#report-content').innerHTML = report;

    // AI 総合シンセシスを非同期生成（バックグラウンド）
    triggerAISynthesis(calc);
  }

  // ---------- 美瑛 直筆診断（ローカル生成・ゼロ課金版） ----------
  // 以前は Claude API を呼んでいたが、LocalSynthesis に切り替えて
  // すべて端末内で生成。外部通信なし・API課金ゼロ。
  function triggerAISynthesis(calc){
    const placeholder = document.getElementById('report-ai-placeholder');
    if (!placeholder) return;
    try {
      let html = '';
      if (window.LocalSynthesis && window.LocalSynthesis.generate){
        html = window.LocalSynthesis.generate(STATE.profile, calc);
      }
      if (html){
        placeholder.outerHTML = `<div class="block" style="background:linear-gradient(135deg,#fff8f3 0%,#ffeee1 100%);border:1px solid #e6c8a8;padding:1.4rem;">${html}<div style="margin-top:1.2rem;font-size:11px;color:#b08a6a;border-top:1px dashed #e6c8a8;padding-top:.6rem;">— AI占い師「美瑛」による、あなたの占術結果と悩みを統合した直筆診断 —</div></div>`;
      } else {
        placeholder.outerHTML = `<div class="block" style="background:#faf6f0;border:1px solid #ddd;padding:1.2rem;text-align:center;color:#888;font-size:13px;">直筆診断を生成できませんでした。他の診断結果はそのまま有効です。</div>`;
      }
    } catch(err) {
      console.error('[LocalSynthesis]', err);
      const fresh = document.getElementById('report-ai-placeholder');
      if (fresh) fresh.outerHTML = `<div class="block" style="background:#faf6f0;border:1px solid #ddd;padding:1.2rem;text-align:center;color:#888;font-size:13px;">直筆診断の生成中にエラーが発生しました。他の診断結果はそのまま有効です。</div>`;
    }
  }

  // AI出力（HTML文字列）のサニタイズ：許可タグ以外は除去
  function sanitizeAiHtml(raw){
    if (!raw) return '';
    // コードブロックマーカ除去
    let s = String(raw).replace(/```html\s*/gi, '').replace(/```\s*$/g, '').trim();
    // 単純なホワイトリストフィルタ（<script>等を完全除去）
    s = s.replace(/<\/?(?!\/?(?:h3|h4|p|strong|em|ul|li|br|div|span)\b)[a-zA-Z][^>]*>/g, '');
    // <script>...</script> や on*= 属性を念のため除去
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
    s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
    s = s.replace(/javascript:/gi, '');
    return s;
  }

  // ---------- PDF出力（ブラウザ印刷ダイアログ → 「PDFに保存」） ----------
  $('#btn-download-pdf').addEventListener('click', () => {
    // 大量DOMの html2canvas は速度・安定性に限界があるため、
    // ブラウザの印刷機能（→「PDFに保存」）に切り替え。
    // 印刷用CSS（@media print）でナビやボタンを非表示にしてある。
    const reportRoot = document.getElementById('report-content');
    if (!reportRoot || reportRoot.children.length === 0) {
      alert('レポートが生成されていません。');
      return;
    }
    try { window.scrollTo(0, 0); } catch(_){}
    try { window.print(); } catch (err) {
      console.error('[PRINT]', err);
      alert('印刷ダイアログを開けませんでした。ブラウザのメニューから「印刷」を選び、送信先を「PDFに保存」にしてください。');
    }
  });

  function showLoading(on) {
    const el = $('#loading');
    if (on) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }

  // ---------- 初期表示 ----------
  showScreen('screen-top');

})();
