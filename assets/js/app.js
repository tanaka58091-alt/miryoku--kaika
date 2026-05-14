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

  // ---------- カテゴリ1: 先天性 ----------
  function renderCat1(c) {
    const z = D.ZODIAC[c.sunSign];
    const stem = D.STEMS[c.dayStem];
    const branch = D.BRANCHES[c.dayBranch];
    const sanmei = D.SANMEI[c.sanmeiIdx];
    const lp = D.NUMEROLOGY[c.lifePath];
    const six = D.SIX_STAR[c.sixStar.star];
    const polarityLabel = c.sixStar.polarity === 'plus' ? '陽（プラス）' : '陰（マイナス）';
    const animal = D.ANIMALS[c.animal.animal];
    const seimei = c.seimeiCat !== null ? D.SEIMEI[c.seimeiCat] : null;

    return `
      <div class="cat-header">
        <span class="menu-tag">01　先天性</span>
        <h2>生まれ持った魅力</h2>
        <p>あなたの本質を、東西7つの占術から多角的にひも解きます。</p>
      </div>

      ${buildSpotOnCard(c)}

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

      ${fortuneCard('六星占術', `${six.name}（${polarityLabel}）`,
        `<p><span class="label">運命数</span> ${c.sixStar.number}</p>
         <div class="rich">${six.innate}</div>`)}

      ${fortuneCard('動物占い', `${animal.emoji} ${animal.name}（No.${c.animal.number}）`,
        `<div class="rich">${animal.innate}</div>`)}

      ${seimei
        ? fortuneCard('姓名判断', `${seimei.name}（総格 ${c.seimei.sokaku}画）`,
            `<div class="rich">${seimei.msg}</div>`,
            '※ お名前を入力された場合のみ。画数は略式計算（漢字10画/かな3画）です。')
        : fortuneCard('姓名判断', '— 未入力 —',
            `<p>姓名判断はお名前を入力されると診断できます。「入力」画面から再度ご入力ください。</p>`)
      }
    `;
  }

  // ---------- カテゴリ2: 今 ----------
  function renderCat2(c) {
    const tarot = F.drawTarot();
    const tcard = D.TAROT_MAJOR[tarot.index];
    const oracleIdx = F.drawOracle(1)[0];
    const ocard = D.ORACLE[oracleIdx];
    const dreamIdx = F.pickDream();
    const dream = D.DREAM[dreamIdx];

    return `
      <div class="cat-header">
        <span class="menu-tag">02　今</span>
        <h2>今のあなたの状態</h2>
        <p>カードを引き直したいときは、ページ下の「もう一度この診断を見る」から再度引き直せます。</p>
      </div>

      ${buildHeartWeatherCard(c)}

      ${fortuneCard('タロット（大アルカナ1枚引き）',
        `${tcard.name}（${tarot.reversed ? '逆位置' : '正位置'}）`,
        `<div class="rich">${tarot.reversed ? tcard.rev : tcard.up}</div>`)}

      ${fortuneCard('オラクルカード', ocard.title,
        `<p>${ocard.msg}</p>`)}

      ${fortuneCard('夢占い / 今あなたが見やすい夢', dream.key,
        `<div class="rich">${dream.msg}</div>`,
        '※ ランダムにキーワードを引き当てる略式診断です。')}
    `;
  }

  // ---------- カテゴリ3: 未来 ----------
  function renderCat3(c) {
    const six = D.SIX_STAR[c.sixStar.star];
    const z = D.ZODIAC[c.sunSign];
    const stem = D.STEMS[c.dayStem];
    const ns = D.NINE_STAR[c.nineStar];
    const iIdx = F.drawIching();
    const ich = D.ICHING[iIdx];
    const rIdx = F.drawRune();
    const rn = D.RUNES[rIdx];
    const yearStem = D.STEMS[c.yearLuck.yearStem];

    return `
      <div class="cat-header">
        <span class="menu-tag">03　未来</span>
        <h2>これからの運命の流れ</h2>
        <p>本年・近い未来の流れを6つの占術で多角的に展望します。</p>
      </div>

      ${buildTimelineCard(c)}

      ${fortuneCard('六星占術 / 未来の流れ', six.name,
        `<div class="rich">${six.future}</div>`)}

      ${fortuneCard('西洋占星術 / これからのテーマ', `${z.symbol} ${z.name}`,
        `<div class="rich">${z.future}</div>`)}

      ${fortuneCard('四柱推命 / 本年の年運',
        `本年の天干：${yearStem.name}`,
        `<p>本年は「${yearStem.element}」の質を帯びた年。${stem.name}のあなたにとって、${stem.element}の本質を活かしつつ、${yearStem.element.replace('の陽','').replace('の陰','')}の流れを受け入れる年です。</p>
         <p>${stem.innate}</p>`,
        '※ 本年の干支との関係性をベースにした略式の年運診断です。')}

      ${fortuneCard('九星気学 / 本命星と本年の傾向', `${ns.name}（${ns.element}）`,
        `<div class="rich">${ns.future}</div>`)}

      ${fortuneCard('易占い（六十四卦）', ich.name,
        `<p>${ich.meaning}</p>`)}

      ${fortuneCard('ルーン占い', rn.name,
        `<p>${rn.meaning}</p>`)}

      <p class="annot">※ タロット・易・ルーンはこの画面を開いた瞬間に1枚ずつ引いています。再診断すると別のカードが出ます。</p>
    `;
  }

  // ---------- カテゴリ4: 美 ----------
  function renderCat4(c) {
    const face = D.FACE[c.faceType];
    const palm = D.PALM[c.palmType];
    const venus = D.ZODIAC[c.venusSign];
    const asc = D.ZODIAC[c.ascendant];
    const lp = D.NUMEROLOGY[c.lifePath];
    const seimei = c.seimeiCat !== null ? D.SEIMEI[c.seimeiCat] : null;

    return `
      <div class="cat-header">
        <span class="menu-tag">04　美</span>
        <h2>あなたの美しさと印象</h2>
        <p>持って生まれた美の質、磨くべき魅力ポイントを多角的に診断します。</p>
      </div>

      ${buildLifecycleCard(c)}

      ${fortuneCard('人相', face.name,
        `${STATE.profile && STATE.profile.facePhoto
          ? `<div class="user-photo-frame"><img class="user-photo" src="${STATE.profile.facePhoto}" alt="お顔の写真" /><div class="user-photo-caption">あなたのお写真</div></div>`
          : ''}
         <div class="rich">${face.msg}</div>`,
        STATE.profile && STATE.profile.facePhoto
          ? '※ 生年月日と表情の質感から導き出した略式診断です。'
          : '※ 生年月日から導き出した傾向診断です。お顔の写真をご登録いただくとカードに表示されます。')}

      ${fortuneCard('手相', palm.name,
        `${STATE.profile && STATE.profile.palmPhoto
          ? `<div class="user-photo-frame"><img class="user-photo" src="${STATE.profile.palmPhoto}" alt="手のひらの写真" /><div class="user-photo-caption">あなたの手のひら</div></div>`
          : ''}
         <div class="rich">${palm.msg}</div>`,
        STATE.profile && STATE.profile.palmPhoto
          ? '※ 生年月日と手のひらの傾向から導き出した略式診断です。'
          : '※ 生年月日から導き出した傾向診断です。手のひらの写真をご登録いただくとカードに表示されます。')}

      ${fortuneCard('西洋占星術 / 金星星座', `${venus.symbol} ${venus.name}`,
        `<p>あなたの愛され方・魅せ方の核は「${venus.name}」の質感です。</p>
         <div class="rich">${venus.beauty}</div>`,
        '※ 略式計算（太陽星座を基準とした近似）です。正確な金星星座には出生時刻と場所の精密データが必要です。')}

      ${fortuneCard('西洋占星術 / アセンダント（人に与える第一印象）', `${asc.symbol} ${asc.name}`,
        `<div class="rich">${asc.beauty}</div>`,
        '※ 略式計算。正確なアセンダントには出生時刻と緯度経度が必要です。')}

      ${fortuneCard('数秘術 / 美の魅力ポイント', `${c.lifePath}　${lp.title}`,
        `<div class="rich">${lp.beauty}</div>`)}

      ${seimei
        ? fortuneCard('姓名判断 / 名前が放つ印象', seimei.name,
            `<div class="rich">${seimei.msg}</div>`)
        : fortuneCard('姓名判断', '— 未入力 —',
            `<p>お名前を入力されると診断できます。</p>`)
      }
    `;
  }

  // ---------- カテゴリ5: 開運行動 ----------
  function renderCat5(c) {
    const ns = D.NINE_STAR[c.nineStar];
    const six = D.SIX_STAR[c.sixStar.star];
    const iIdx = F.drawIching();
    const ich = D.ICHING[iIdx];
    const oracleIdx = F.drawOracle(1)[0];
    const ocard = D.ORACLE[oracleIdx];
    const tarot = F.drawTarot();
    const tcard = D.TAROT_MAJOR[tarot.index];
    const kuji = F.drawKuji();
    const kujiData = D.KUJI[kuji];
    const z = D.ZODIAC[c.sunSign];

    return `
      <div class="cat-header">
        <span class="menu-tag">05　開運</span>
        <h2>今のあなたの開運行動</h2>
        <p>具体的に「今日からできること」をお伝えします。</p>
      </div>

      ${buildLuckyMatrixCard(c)}

      ${fortuneCard('九星気学 / ラッキー行動', ns.name,
        `<div class="rich">${ns.luck}</div>`)}

      ${fortuneCard('六星占術 / 運気の活かし方', six.name,
        `<div class="rich">${six.future}</div>
         <p class="hr-soft"><span class="label">星座由来のラッキー行動</span></p>
         <div class="rich">${z.luck}</div>`)}

      ${fortuneCard('易占い / 今のあなたへの指針', ich.name,
        `<p>${ich.meaning}</p>`)}

      ${fortuneCard('オラクルカード / 受け取るメッセージ', ocard.title,
        `<p>${ocard.msg}</p>`)}

      ${fortuneCard('タロット / 今日のアドバイス',
        `${tcard.name}（${tarot.reversed ? '逆位置' : '正位置'}）`,
        `<div class="rich">${tarot.reversed ? tcard.rev : tcard.up}</div>`)}

      ${fortuneCard('おみくじ', kujiData.name,
        `<div class="rich">${kujiData.msg}</div>`)}
    `;
  }

  // ---------- カテゴリ6: 悩みから読み解く ----------
  function renderCat6(c){
    const p = STATE.profile || {};
    const worryCat = p.worryCat || null;
    const worryText = p.worryText || '';
    const z = D.ZODIAC[c.sunSign];
    const stem = D.STEMS[c.dayStem];
    const elem = z.element; // 火/土/風/水

    if (!worryCat || !D.WORRY[worryCat]) {
      return `
        <div class="cat-header">
          <span class="menu-tag">06　悩 み</span>
          <h2>お悩みから読み解く</h2>
          <p>あなたの「今いちばん気になっていること」を起点に、先天と後天の両面から運勢を診ます。</p>
        </div>
        ${fortuneCard('お悩みのテーマ', '— 未選択 —',
          `<p>「入力」画面の<strong>「今いちばん気になっていること」</strong>セクションから、テーマをひとつお選びください。選んでいただくと、その視点での詳細な診断を生成します。</p>
           <p>自由記述欄も合わせて入力いただくと、より深い読み解きが可能になります。</p>`,
          '※ お悩みの記入は任意です。任意でも他の05カテゴリは引き続きご利用いただけます。')}
      `;
    }

    const w = D.WORRY[worryCat];
    const innateMsg = w.innate[elem] || w.innate['火'];
    const acquiredMsg = w.acquired[elem] || w.acquired['火'];
    const spotLines = (D.SPOTON && D.SPOTON.worry && D.SPOTON.worry[worryCat]) || [];
    const spotZ = D.SPOTON && D.SPOTON.zodiac && D.SPOTON.zodiac[c.sunSign];
    // 星座の影の側面1つを「悩みと連動する弱点」として混ぜる
    const bonusInsight = spotZ && spotZ.shadow && spotZ.shadow[0] ? spotZ.shadow[0] : '';
    const spotHtml = spotLines.length ? `
      <div class="fortune-card spot-card spot-card-worry">
        <div class="spot-card-deco">✦ ZUBARI ✦</div>
        <div class="fortune-head">
          <div class="fortune-name">ズバリ言い当て ／ 「${escapeHtml(w.label)}」で本当に起きていること</div>
          <div class="fortune-result">${z.symbol} ${z.name}</div>
        </div>
        <div class="fortune-body">
          <p class="spot-lead">悩みの本当の正体に、心当たりはありませんか。</p>
          <ul class="spot-list spot-bright">${spotLines.map(t => `<li>${t}</li>`).join('')}</ul>
          ${bonusInsight ? `<h4>${escapeHtml(z.name)}のあなただからこそ、ここに気づいて</h4>
          <div class="rich"><p>${bonusInsight}</p></div>` : ''}
        </div>
        <div class="fortune-note">※ 全部当てはまる必要はありません。胸が動いた一行を、今日の指針に。</div>
      </div>` : '';

    const worryEcho = worryText
      ? `<div class="worry-echo">
           <div class="worry-echo-label">あなたが書いてくださったお悩み</div>
           <p>「${escapeHtml(worryText)}」</p>
         </div>`
      : '';

    return `
      <div class="cat-header">
        <span class="menu-tag">06　悩 み</span>
        <h2>お悩みから読み解く</h2>
        <p>「${escapeHtml(w.label)}」を軸に、生まれ持った力（先天）と、これから整えるべき行動（後天）の両面から、あなただけの運勢メッセージをお届けします。</p>
      </div>

      ${fortuneCard('お悩みのテーマ', w.label,
        `<p>${w.lead}</p>
         ${worryEcho}`)}

      ${spotHtml}

      ${fortuneCard('先天的視点 ／ 生まれ持った力',
        `${z.symbol} ${z.name}　＝ ${elem}の質`,
        `<h4>あなたが本来持っている運勢</h4>
         <div class="rich"><p>${innateMsg}</p></div>
         <h4>その質を支える日柱の本質</h4>
         <div class="rich"><p>${stem.name}（${stem.element}）。${stem.innate.split('。')[0]}。これがあなたの内側に流れる、揺るがない核です。</p></div>`,
        '※ 太陽星座の元素と日干から導き出した略式の先天診断です。')}

      ${fortuneCard('後天的視点 ／ これから整えるべきこと',
        `${elem}の質を磨く`,
        `<h4>このテーマで、あなたが今意識すべきこと</h4>
         <div class="rich"><p>${acquiredMsg}</p></div>`,
        '※ 同じ元素のあなたでも、後天的に整えることで運命の方向は大きく変わります。')}

      ${fortuneCard('今日からできる具体的アクション', '4つのヒント',
        `<ul>
           ${w.actions.split(/[／\/]/).map(a => `<li>${escapeHtml(a.trim())}</li>`).filter(li => li.length > 12).join('')}
         </ul>`,
        '※ 1日1つでも構いません。続けるほどに運気が動き出します。')}
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
    const order = ['cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6'];
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

    // 未診断カテゴリがあれば自動的に計算（同じ生年月日なら結果は安定、カードのみランダム）
    ['cat1','cat2','cat3','cat4','cat5','cat6'].forEach(cat => {
      if (!STATE.results[cat]) {
        const html =
          cat === 'cat1' ? renderCat1(calc) :
          cat === 'cat2' ? renderCat2(calc) :
          cat === 'cat3' ? renderCat3(calc) :
          cat === 'cat4' ? renderCat4(calc) :
          cat === 'cat5' ? renderCat5(calc) :
          renderCat6(calc);
        STATE.results[cat] = { calc, html };
      }
    });

    const nameDisp = (p.sei || p.mei) ? `${p.sei} ${p.mei} 様` : 'あなた';
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;

    // 総合サマリー
    const z = D.ZODIAC[calc.sunSign];
    const lp = D.NUMEROLOGY[calc.lifePath];
    const animal = D.ANIMALS[calc.animal.animal];

    const summaryHtml = `
      <div class="block">
        <h3>あなたの本質</h3>
        <p>あなたは「${z.name}」と「数秘${calc.lifePath}（${lp.title}）」、そして「${animal.name}」の質を併せ持つ人。
        ${z.innate.split('。')[0]}。${lp.innate.split('。')[0]}。これが、誰にもまねできないあなたの核です。</p>
      </div>
      <div class="block">
        <h3>これから磨くべき美しさ</h3>
        <p>${z.beauty}</p>
      </div>
      <div class="block">
        <h3>これからの運命の方向性</h3>
        <p>${z.future}</p>
      </div>
      <div class="block">
        <h3>今日からできる開運行動</h3>
        <p>${z.luck}</p>
      </div>
    `;

    const report = `
      <div class="report" id="report-body">
        <div class="report-cover">
          <div class="label">FORTUNE REPORT</div>
          <h1>魅力開花診断<br>総合レポート</h1>
          <div class="sub">— for adult women who bloom —</div>
          <div class="for">For</div>
          <div class="name">${escapeHtml(nameDisp)}</div>
          <div class="date">${dateStr}</div>
        </div>

        <div class="report-section">
          <h2>01　生まれ持った魅力</h2>
          <div class="section-sub">先天性 ／ あなたの本質を多角的に</div>
          ${STATE.results.cat1.html.replace(/<div class="cat-header">[\s\S]*?<\/div>/, '')}
        </div>

        <div class="report-section">
          <h2>02　今のあなたの状態</h2>
          <div class="section-sub">今 ／ 心と運気の現在地</div>
          ${STATE.results.cat2.html.replace(/<div class="cat-header">[\s\S]*?<\/div>/, '')}
        </div>

        <div class="report-section">
          <h2>03　これからの運命の流れ</h2>
          <div class="section-sub">未来 ／ 6占術による多角展望</div>
          ${STATE.results.cat3.html.replace(/<div class="cat-header">[\s\S]*?<\/div>/, '')}
        </div>

        <div class="report-section">
          <h2>04　あなたの美しさと印象</h2>
          <div class="section-sub">美 ／ 持って生まれた魅力と磨き方</div>
          ${STATE.results.cat4.html.replace(/<div class="cat-header">[\s\S]*?<\/div>/, '')}
        </div>

        <div class="report-section">
          <h2>05　今のあなたの開運行動</h2>
          <div class="section-sub">開運 ／ 今日からできる具体的アクション</div>
          ${STATE.results.cat5.html.replace(/<div class="cat-header">[\s\S]*?<\/div>/, '')}
        </div>

        <div class="report-section">
          <h2>06　お悩みから読み解く</h2>
          <div class="section-sub">悩み ／ 先天と後天の両面から</div>
          ${STATE.results.cat6.html.replace(/<div class="cat-header">[\s\S]*?<\/div>/, '')}
        </div>

        <div class="report-section report-summary">
          <h2>総括</h2>
          <div class="section-sub">本質・今・未来をひとつに</div>
          ${summaryHtml}
        </div>
      </div>
    `;

    $('#report-content').innerHTML = report;
  }

  // ---------- PDF出力 ----------
  $('#btn-download-pdf').addEventListener('click', async () => {
    const target = document.getElementById('report-body');
    if (!target) {
      alert('レポートが生成されていません。');
      return;
    }
    if (!window.html2canvas || !window.jspdf) {
      alert('PDFライブラリの読み込みに失敗しました。インターネット接続をご確認ください。');
      return;
    }

    showLoading(true);

    try {
      // 高解像度でキャプチャ
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 1080
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();   // 210
      const pageH = pdf.internal.pageSize.getHeight();  // 297

      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let heightLeft = imgH;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
      heightLeft -= pageH;

      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
        heightLeft -= pageH;
      }

      const p = STATE.profile;
      const nm = (p && (p.sei || p.mei)) ? `${p.sei}${p.mei}` : 'あなた';
      const dt = new Date();
      const fileName = `魅力開花診断_${nm}_${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}.pdf`;

      pdf.save(fileName);
    } catch (err) {
      console.error(err);
      alert('PDF生成に失敗しました。ブラウザを更新してお試しください。');
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
