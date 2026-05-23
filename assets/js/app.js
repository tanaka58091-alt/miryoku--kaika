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
    const seimei   = F.calcSeimei(sei, mei);
    const seimeiCat= seimei.sokaku ? F.seimeiCategory(seimei.sokaku) : null;
    const palmType = F.calcPalmType(y, m, d);
    const faceType = F.calcFaceType(y, m, d);
    const yearLuck = F.currentYearLuck(y, m, d);
    const nineCur  = F.currentNineStarYear();
    // 算命学：日干から主星にマッピング（簡易）
    const sanmeiIdx = dayStem; // 0〜9

    return {
      sunSign, lifePath, birthNum,
      dayStem, dayBranch, yearBranch,
      animal, sixStar, nineStar,
      venusSign, ascendant,
      seimei, seimeiCat,
      palmType, faceType,
      yearLuck, nineCur,
      sanmeiIdx
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

      ${essenceCard}

      ${buildSynthesisCard(c)}

      ${fortuneCard('西洋占星術 / 太陽星座', `${z.symbol} ${z.name}（${z.period}）`,
        `<div class="rich">${z.innate}</div>`)}

      ${fortuneCard('四柱推命 / 日干', stem.name,
        `<p><span class="label">五行</span> ${stem.element}</p>
         <div class="rich">${stem.innate}</div>`)}

      ${fortuneCard('算命学 / 主星', sanmei.name,
        `<div class="rich">${sanmei.msg}</div>`,
        '※ 日干より導き出した略式の主星診断です。')}

      ${fortuneCard('数秘術 / ライフパスナンバー', `${c.lifePath}　${lp.title}`,
        `<div class="rich">${lp.innate}</div>`)}

      ${fortuneCard('六星占術', six.name,
        `<p><span class="label">運命数</span> ${c.sixStar.number}</p>
         <div class="rich">${six.innate}</div>`)}

      ${fortuneCard('動物占い', `${animal.emoji} ${animal.name}（No.${c.animal.number}）`,
        `<div class="rich">${animal.innate}</div>`)}
    `;
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

      ${buildLifecycleCard(c)}
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

        <div class="report-section report-summary">
          <h2>総括 ／ ここから始まる、本当のあなた</h2>
          <div class="section-sub">7つの診断を、1つに結んで</div>
          ${summaryHtml}
        </div>
      </div>
    `;

    $('#report-content').innerHTML = report;
  }

  // ---------- PDF出力 ----------
  // 巨大な1枚キャンバスは作らず、レポートをセクション単位（report-cover / report-section）に分けて
  // 1セクション=1枚のキャンバスとしてキャプチャ→jsPDFに貼り付ける。
  // これにより、モバイルSafariのキャンバスサイズ上限（4096〜16384px）を回避し、
  // どの端末でも安定して PDF が生成できる。
  const PDF_CAPTURE_WIDTH = 800;
  const PDF_CAPTURE_SCALE = 1.5;

  async function waitFonts(){
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch(_){}
  }

  // セクション単位でクローンを作って html2canvas に渡す
  async function captureSectionToCanvas(sectionEl){
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'transform:translate(-10000px,0)',
      'width:' + PDF_CAPTURE_WIDTH + 'px',
      'background:#ffffff',
      'z-index:-1',
      'pointer-events:none'
    ].join(';');
    const clone = sectionEl.cloneNode(true);
    clone.style.width = PDF_CAPTURE_WIDTH + 'px';
    clone.style.margin = '0';
    wrap.appendChild(clone);
    document.body.appendChild(wrap);

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      const canvas = await html2canvas(clone, {
        scale: PDF_CAPTURE_SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: PDF_CAPTURE_WIDTH,
        windowWidth: PDF_CAPTURE_WIDTH,
        scrollX: 0,
        scrollY: 0,
        logging: false
      });
      return canvas;
    } finally {
      try { document.body.removeChild(wrap); } catch(_){}
    }
  }

  $('#btn-download-pdf').addEventListener('click', async () => {
    const reportBody = document.getElementById('report-body');
    if (!reportBody) {
      alert('レポートが生成されていません。');
      return;
    }
    if (!window.html2canvas || !window.jspdf) {
      alert('PDFライブラリの読み込みに失敗しました。インターネット接続をご確認ください。');
      return;
    }

    showLoading(true);

    try {
      await waitFonts();

      // 表紙＋各セクションを順番に取得
      const blocks = Array.from(
        reportBody.querySelectorAll('.report-cover, .report-section')
      );
      if (blocks.length === 0) throw new Error('セクションが見つかりません');

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();   // 210mm
      const pageH = pdf.internal.pageSize.getHeight();  // 297mm
      const marginMm = 8;                                // ページ余白
      const usableW = pageW - marginMm * 2;
      const usableH = pageH - marginMm * 2;

      let pageIndex = 0;
      let yCursor = marginMm;                            // 現ページ内のy位置（mm）

      for (let i = 0; i < blocks.length; i++) {
        const canvas = await captureSectionToCanvas(blocks[i]);
        if (!canvas || !canvas.width || !canvas.height) continue;

        const imgW_mm = usableW;
        const imgH_mm = (canvas.height / canvas.width) * imgW_mm;

        // ページ内に収まらないときの処理
        if (imgH_mm <= usableH) {
          // セクションが1ページ未満：余白がなければ改ページ
          if (yCursor + imgH_mm > marginMm + usableH) {
            pdf.addPage();
            pageIndex++;
            yCursor = marginMm;
          }
          if (pageIndex === 0 && yCursor === marginMm && i === 0) {
            // 1ページ目の初回はaddPage不要
          }
          const imgData = canvas.toDataURL('image/jpeg', 0.9);
          pdf.addImage(imgData, 'JPEG', marginMm, yCursor, imgW_mm, imgH_mm, undefined, 'FAST');
          yCursor += imgH_mm + 4; // ブロック間の余白
        } else {
          // セクション自体が1ページ超：そのセクション専用にページを起こして縦分割する
          if (yCursor > marginMm) {
            pdf.addPage();
            pageIndex++;
            yCursor = marginMm;
          }
          const pxPerMm = canvas.width / usableW;
          const pageHeightPx = Math.floor(usableH * pxPerMm);
          let renderedH = 0;
          let first = true;
          while (renderedH < canvas.height) {
            const sliceH = Math.min(pageHeightPx, canvas.height - renderedH);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = sliceH;
            const sctx = sliceCanvas.getContext('2d');
            sctx.fillStyle = '#ffffff';
            sctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            sctx.drawImage(canvas, 0, renderedH, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
            const imgData = sliceCanvas.toDataURL('image/jpeg', 0.9);
            const sliceH_mm = (sliceH / canvas.width) * imgW_mm;
            if (!first) {
              pdf.addPage();
              pageIndex++;
            }
            pdf.addImage(imgData, 'JPEG', marginMm, marginMm, imgW_mm, sliceH_mm, undefined, 'FAST');
            renderedH += sliceH;
            first = false;
          }
          yCursor = marginMm + ((canvas.height % pageHeightPx) || pageHeightPx) / pxPerMm + 4;
          if (yCursor > marginMm + usableH - 20) {
            // 残り余白が少ない場合は次セクションを新ページから
            pdf.addPage();
            pageIndex++;
            yCursor = marginMm;
          }
        }
      }

      const p = STATE.profile;
      const nm = (p && (p.sei || p.mei)) ? `${p.sei}${p.mei}` : 'あなた';
      const dt = new Date();
      const fileName = `魅力開花診断_${nm}_${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}.pdf`;

      pdf.save(fileName);
    } catch (err) {
      console.error('[PDF]', err);
      alert('PDF生成に失敗しました。ページを更新してから、もう一度お試しください。\n（' + (err && err.message ? err.message : '不明なエラー') + '）');
    } finally {
      showLoading(false);
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
