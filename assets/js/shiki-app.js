/* ============================================================
   shiki-app.js — 四季の40タイプ 診断アプリ（v2.0）
   ・計算：ephemeris.js（天体位置）＋ calc.js（日干・流年流月・数秘）
   ・データ：shiki-data.js
   ・端末内のみで処理。外部送信なし。同じ入力なら同じ結果
   ============================================================ */
(function () {
  'use strict';

  const F = window.FortuneCalc, E = window.Ephemeris, D = window.ShikiData;

  // ---------- 合言葉ゲート（講師から伝える合言葉。変更はこの1行） ----------
  const GATE_PASSWORD = 'miryoku2026';
  const GATE_KEY = 'miryoku_gate_ok_v1';
  const SAVE_KEY = 'miryoku_shiki_v1';
  const SIZE_KEY = 'miryoku_textsize_v1';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mod = (a, n) => ((a % n) + n) % n;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };

  function setupGate() {
    const overlay = $('#gate-overlay');
    if (!overlay) return;
    if (store.get(GATE_KEY) === '1') { overlay.hidden = true; return; }
    overlay.hidden = false;
    document.body.classList.add('gate-locked');
    const form = $('#gate-form'), input = $('#gate-input'), err = $('#gate-error'), toggle = $('#gate-toggle');
    // 全角英数・大文字・空白を吸収して比較（スマホのかな入力のままでも通るように）
    const normalize = (s) => { let t = String(s || ''); try { t = t.normalize('NFKC'); } catch (_) {} return t.replace(/\s+/g, '').toLowerCase(); };
    toggle.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? '表示' : '隠す';
      input.focus();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (normalize(input.value) === normalize(GATE_PASSWORD)) {
        store.set(GATE_KEY, '1');
        overlay.hidden = true;
        document.body.classList.remove('gate-locked');
        err.hidden = true;
      } else {
        err.hidden = false;
        input.focus();
        try { input.select(); } catch (_) {}
      }
    });
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 80);
  }

  // ============================================================
  // 読み解き（計算）
  // ============================================================
  function isRealDate(y, m, d) {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  // 太陽黄経から季節を決める（立春315° 立夏45° 立秋135° 立冬225°）
  function seasonAt(y, m, d, h) {
    const lon = E.allSigns(y, m, d, h).longitudes.sun;
    return Math.floor(mod(lon - 315, 360) / 90);
  }

  // 生まれた時刻が分からない日に、値が1日のうちで切り替わるかを調べる。
  // 切り替わるなら、その時刻（おおよそ）と前後の値を返す
  function crossing(fn) {
    let lo = 0, hi = 23.98;
    const a = fn(lo), b = fn(hi);
    if (a === b) return null;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fn(mid) === a) lo = mid; else hi = mid; }
    return { before: a, after: b, hour: (lo + hi) / 2 };
  }
  const hourLabel = (h) => `${Math.floor(h)}時${Math.round((h % 1) * 60) >= 30 ? '半' : ''}ごろ`;

  function readPerson(p) {
    const hasHour = p.hour !== null && p.hour !== undefined && p.hour !== '';
    const hour = hasHour ? Number(p.hour) : null;
    const h = hasHour ? hour + 0.5 : 12;          // 「14時台」は14時半として計算。不明なら正午
    const stemIdx = F.calcDayStem(p.y, p.m, p.d, hour);   // 23時台は翌日の日干（夜子時）
    const seasonIdx = seasonAt(p.y, p.m, p.d, h);
    const signs = E.allSigns(p.y, p.m, p.d, h);
    const unc = {};
    if (!hasHour) {
      unc.season = crossing((x) => seasonAt(p.y, p.m, p.d, x));
      unc.sun = crossing((x) => E.allSigns(p.y, p.m, p.d, x).sun);
      unc.moon = crossing((x) => E.allSigns(p.y, p.m, p.d, x).moon);
      unc.venus = crossing((x) => E.allSigns(p.y, p.m, p.d, x).venus);
    }
    const stem = D.STEMS[stemIdx], season = D.SEASONS[seasonIdx];
    const typeKey = stem.key + '-' + season.key;
    return {
      p, hasHour, stemIdx, seasonIdx, stem, season, typeKey, type: D.TYPES[typeKey],
      sun: signs.sun, moon: signs.moon, venus: signs.venus,
      lp: F.calcLifePath(p.y, p.m, p.d), unc
    };
  }

  function typeName(stem, season) { return `${season.name}の${stem.name}`; }
  function typeReading(stem, season) { return `${season.reading}の${stem.nameReading}`; }

  // 今年・今月の流れ（流年・流月の通変星）
  function periodOf(stemIdx) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    const yStem = F.calcYearStem(y, m, d);
    const yBranch = F.calcYearBranch(y, m, d);
    const mBranch = F.calcMonthBranch(m, d, y);
    const mStem = F.calcMonthStem(yStem, mBranch);
    const STEM = '甲乙丙丁戊己庚辛壬癸', BR = '子丑寅卯辰巳午未申酉戌亥';
    return {
      y, m,
      year: D.PERIOD[F.calcTsuuhen(stemIdx, yStem)], yearKanshi: STEM[yStem] + BR[yBranch],
      month: D.PERIOD[F.calcTsuuhen(stemIdx, mStem)], monthKanshi: STEM[mStem] + BR[mBranch]
    };
  }

  // 五行の相性
  function compatOf(a, b) {
    const ga = Math.floor(a / 2), gb = Math.floor(b / 2);
    if (D.KANGO.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return { kind: 'kango', image: '' };
    if (ga === gb) return { kind: 'same', image: `同じ「${D.GOGYO[ga]}」の性質を持つふたり` };
    if (D.GEN[ga] === gb) return { kind: 'give', image: D.GEN_IMAGE[ga] };
    if (D.GEN[gb] === ga) return { kind: 'receive', image: D.GEN_IMAGE[gb] };
    if (D.KE[ga] === gb) return { kind: 'shape', image: D.KE_IMAGE[ga] };
    return { kind: 'shaped', image: D.KE_IMAGE[gb] };
  }

  // ============================================================
  // 描画
  // ============================================================
  const artUrl = (key) => `assets/img/types/${key}.jpg`;
  const thumbUrl = (key) => `assets/img/types/thumb/${key}.jpg`;
  const SEASON_BG = 'linear-gradient(160deg, var(--s1), var(--s2))';
  const bg = (url) => `background-image:url('${url}'), ${SEASON_BG}`;

  function typeCard(r, opts) {
    const o = opts || {};
    const name = r.p && r.p.name ? `${esc(r.p.name)}さんは` : 'あなたは';
    return `
      <div class="type-card" data-season="${r.season.key}">
        <div class="type-art" style="${bg(artUrl(r.typeKey))}" role="img" aria-label="${esc(typeName(r.stem, r.season))}のイラスト"></div>
        <div class="type-plate">
          ${o.hideFor ? '' : `<p class="type-for">${name}</p>`}
          <h1 class="type-name"><span class="tn-season">${esc(r.season.name)}</span><span class="tn-no">の</span><span class="tn-elem">${esc(r.stem.name)}</span></h1>
          <p class="type-reading">${esc(typeReading(r.stem, r.season))}</p>
          <p class="type-catch">${esc(r.type.catch)}</p>
          <ul class="type-keys">${r.type.keywords.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
          <p class="type-basis"><span>四柱推命の日干「${esc(r.stem.stem)}（${esc(r.stem.reading)}）」</span><span>× 生まれた季節「${esc(r.season.name)}」</span></p>
        </div>
      </div>`;
  }

  function uncertainSeasonNote(r) {
    const u = r.unc && r.unc.season;
    if (!u) return '';
    const before = typeName(r.stem, D.SEASONS[u.before]), after = typeName(r.stem, D.SEASONS[u.after]);
    return `
      <div class="notice">
        <p><strong>生まれた日が、季節の変わり目にあたります。</strong>この日は${esc(hourLabel(u.hour))}に季節が切り替わるため、それより前のお生まれなら「${esc(before)}」、後なら「${esc(after)}」になります。いまは正午として「${esc(typeName(r.stem, r.season))}」を表示しています。</p>
        <a class="link-btn" href="#input">生まれた時刻を入れて確かめる</a>
      </div>`;
  }

  function signNote(u, label) {
    if (!u) return '';
    return `<p class="sign-note">※ 生まれた時刻が分からないため正午で計算しています。${esc(hourLabel(u.hour))}より前のお生まれなら、${esc(label)}は${esc(D.SIGN_NAMES[u.before])}です。</p>`;
  }

  function renderResult(r) {
    const s = r.stem, t = r.type, lp = D.LIFE_PATH[r.lp] || D.LIFE_PATH[9];
    const per = periodOf(r.stemIdx);
    const v = D.VENUS[r.venus];
    const html = `
      <article class="result" data-season="${r.season.key}">
        ${typeCard(r)}
        <div class="share-row">
          <button type="button" class="btn-outline btn-share" id="btn-share">タイプを友だちにシェアする</button>
          <p class="save-hint">カードは、スクリーンショットで保存できます。<br>シェアで送るのは、タイプ名と一言だけです。</p>
        </div>
        ${uncertainSeasonNote(r)}

        <section class="facets" aria-label="あなたを6つの角度から">
          <p class="facets-title">あなたを、6つの角度から</p>
          <div class="facet-grid">
            <a class="facet" href="#s-essence"><span class="f-label">生まれ持った本質</span><b>${esc(typeName(s, r.season))}</b><small>四柱推命</small></a>
            <a class="facet" href="#s-face"><span class="f-label">表の顔</span><b>${esc(D.SIGN_NAMES[r.sun])}</b><small>太陽星座</small></a>
            <a class="facet" href="#s-face"><span class="f-label">心の内側</span><b>${esc(D.SIGN_NAMES[r.moon])}</b><small>月星座</small></a>
            <a class="facet" href="#s-beauty"><span class="f-label">愛と美の感性</span><b>${esc(D.SIGN_NAMES[r.venus])}</b><small>金星星座</small></a>
            <a class="facet" href="#s-theme"><span class="f-label">人生のテーマ</span><b>${r.lp}　${esc(lp.title)}</b><small>数秘術</small></a>
            <a class="facet" href="#s-now"><span class="f-label">今年の流れ</span><b>${esc(per.year.theme)}</b><small>四柱推命</small></a>
          </div>
        </section>

        <section class="chapter" id="s-essence">
          <p class="ch-label">01　生まれ持った本質</p>
          <h2>先天的な、あなたの性格</h2>
          <p class="lead">${esc(s.essence)}</p>
          <h3 class="h3">あなたの強み</h3>
          <ul class="checks">${s.strengths.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="season-gift">
            <p class="sg-label">${esc(r.season.name)}が、あなたに与えたもの</p>
            <p>${esc(t.note)}</p>
          </div>
          <div class="shadow">
            <h3 class="h3">無理をすると、こうなりやすい</h3>
            <p class="shadow-sign">${esc(s.shadow.sign)}。</p>
            <p>${esc(s.shadow.why)}${esc(s.shadow.care)}</p>
          </div>
        </section>

        <section class="chapter" id="s-face">
          <p class="ch-label">02　表の顔と、心の内側</p>
          <h2>人から見えるあなたと、本当のあなた</h2>
          <div class="twin">
            <div class="twin-item">
              <p class="twin-label">表の顔<span>太陽星座　${esc(D.SIGN_NAMES[r.sun])}</span></p>
              <p>${esc(D.SUN[r.sun])}</p>
              ${signNote(r.unc.sun, '太陽星座')}
            </div>
            <div class="twin-item">
              <p class="twin-label">心の内側<span>月星座　${esc(D.SIGN_NAMES[r.moon])}</span></p>
              <p>${esc(D.MOON[r.moon])}</p>
              ${signNote(r.unc.moon, '月星座')}
            </div>
          </div>
          ${r.sun !== r.moon ? `<p class="twin-note">表の顔と心の内側が違う星座にあるのは、あなたの中にふたつの顔があるということ。人から見えるあなたと、本当のあなたの両方を大切にしてください。</p>` : `<p class="twin-note">表の顔と心の内側が同じ星座にあります。見せている自分と本当の自分にずれが少なく、裏表のない人です。</p>`}
        </section>

        <section class="chapter" id="s-beauty">
          <p class="ch-label">03　あなたの美しさ</p>
          <h2>本質が映える、美しさのかたち</h2>
          <dl class="beauty">
            <div><dt>似合う質感</dt><dd>${esc(s.beauty.texture)}</dd></div>
            <div><dt>本質を映す色</dt><dd>${esc(s.beauty.color)}</dd></div>
            <div><dt>香り</dt><dd>${esc(s.beauty.scent)}</dd></div>
            <div><dt>所作</dt><dd>${esc(s.beauty.gesture)}</dd></div>
            <div><dt>魅力が出る瞬間</dt><dd>${esc(s.beauty.shine)}</dd></div>
          </dl>
          <div class="venus">
            <p class="twin-label">愛と美の感性<span>金星星座　${esc(D.SIGN_NAMES[r.venus])}</span></p>
            <p>${esc(v.beauty)}</p>
            ${signNote(r.unc.venus, '金星星座')}
          </div>
          <p class="fine">※ 色は、パーソナルカラーとは別の「あなたの本質を映す雰囲気の方向」です。</p>
        </section>

        <section class="chapter" id="s-love">
          <p class="ch-label">04　愛し方と、活きる場所</p>
          <h2>人との関わりの中のあなた</h2>
          <h3 class="h3">愛し方</h3>
          <p>${esc(s.love)}${esc(v.love)}</p>
          <h3 class="h3">力が活きる場所</h3>
          <p>${esc(s.work)}</p>
        </section>

        <section class="chapter" id="s-theme">
          <p class="ch-label">05　人生のテーマ</p>
          <h2>数秘 ${r.lp}「${esc(lp.title)}」</h2>
          <p>${esc(lp.theme)}</p>
        </section>

        <section class="chapter" id="s-care">
          <p class="ch-label">06　疲れたときは</p>
          <h2>消耗のサインと、戻し方</h2>
          <dl class="care">
            <div><dt>こんなときは疲れのサイン</dt><dd>${esc(s.tired)}</dd></div>
            <div><dt>あなたに合う戻し方</dt><dd>${esc(s.recover)}</dd></div>
          </dl>
          <p class="fine">※ 体調の不調が続くときは、医療機関にご相談ください。</p>
        </section>

        <section class="chapter" id="s-now">
          <p class="ch-label">07　今の流れ</p>
          <h2>今年と今月のあなた</h2>
          ${[['今年', per.year, `${per.y}年（${per.yearKanshi}）`], ['今月', per.month, `${per.m}月（${per.monthKanshi}）`]].map(([lab, P, kan]) => `
            <div class="period">
              <p class="period-head"><span>${lab}</span><small>${esc(kan)}</small></p>
              <p class="period-theme">「${esc(P.theme)}」</p>
              <p>${esc(P.good)}${esc(P.careful)}</p>
              <p class="period-tip">${esc(P.tip)}</p>
            </div>`).join('')}
          <p class="fine">今年・今月の干と、あなたの日干の関係（通変星）から読んでいます。月が変わると、この章の内容も変わります。</p>
        </section>

        ${window.ShikiPhoto ? window.ShikiPhoto.totalTeaser() : ''}
        <div class="more-cards">
          <p class="facets-title">もっと占う</p>
          <a class="more-card" href="#palm" style="background-image:url('assets/img/types/_hero-palm.jpg')"><span><b>手相を写真で占う</b><small>手の形と4本の線から、生き方を読む</small></span></a>
          <a class="more-card" href="#face" style="background-image:url('assets/img/types/_hero-face.jpg')"><span><b>人相を写真で占う</b><small>顔立ちのタイプと、印象を整えるヒント</small></span></a>
        </div>
        <div class="next">
          <a class="btn" href="#compat">大切な人との相性を見る</a>
          <a class="btn-outline" href="#types">タイプ図鑑で家族や友人を調べる</a>
          <button type="button" class="btn-outline" id="btn-print">PDFで保存する</button>
        </div>
        <p class="disclaimer">占いは、生まれ持った傾向を知るためのひとつの見方です。未来を決めつけるものではありません。心に響いたところだけ、受け取ってください。</p>
      </article>`;
    $('#result-root').innerHTML = html;
  }

  // タイプ一覧（10日干 × 4季節）
  function renderTypes() {
    const mine = state.reading && state.reading.typeKey;
    const found = state.lookup && state.lookup.typeKey;
    const rows = D.STEMS.map((s) => `
      <div class="tg-row">
        <p class="tg-stem"><b>${esc(s.name)}</b><small>${esc(s.stem)}</small></p>
        ${D.SEASONS.map((q) => {
          const key = `${s.key}-${q.key}`;
          const badges = (key === mine ? '<span class="tg-badge tg-me">あなた</span>' : '') +
            (key === found ? `<span class="tg-badge tg-found">${esc(state.lookup.p.name || 'お相手')}</span>` : '');
          return `<a class="tg-cell${key === mine ? ' is-me' : ''}${key === found ? ' is-found' : ''}" href="#type/${key}" data-season="${q.key}" id="cell-${key}">
            <span class="tg-img" style="${bg(thumbUrl(key))}">${badges}</span>
            <span class="tg-name">${esc(q.name)}の${esc(s.name)}</span></a>`;
        }).join('')}
      </div>`).join('');
    const lookup = state.lookup ? (() => {
      const L = state.lookup, nm = L.p.name ? `${L.p.name}さん` : 'お相手';
      return `<div class="lookup-result" data-season="${L.season.key}">
        ${miniCard(L, nm)}
        <div class="lookup-actions">
          <a class="btn-outline" href="#type/${L.typeKey}">「${esc(typeName(L.stem, L.season))}」を読む</a>
          ${state.reading ? '<button type="button" class="btn" id="btn-lookup-compat">あなたとの相性を見る</button>' : ''}
        </div>
      </div>`;
    })() : '';
    $('#lookup-result').innerHTML = lookup;
    $('#types-root').innerHTML = `
      <div class="tg-head"><span></span>${D.SEASONS.map((q) => `<span data-season="${q.key}">${esc(q.name)}</span>`).join('')}</div>
      ${rows}`;
  }

  function renderTypeDetail(key) {
    const [sk, qk] = key.split('-');
    const stemIdx = D.STEMS.findIndex((s) => s.key === sk), seasonIdx = D.SEASONS.findIndex((q) => q.key === qk);
    if (stemIdx < 0 || seasonIdx < 0) return false;
    const r = { stemIdx, seasonIdx, stem: D.STEMS[stemIdx], season: D.SEASONS[seasonIdx], typeKey: key, type: D.TYPES[key], p: null };
    const s = r.stem;
    $('#type-root').innerHTML = `
      <article class="result" data-season="${r.season.key}">
        ${typeCard(r, { hideFor: true })}
        <section class="chapter">
          <p class="ch-label">生まれ持った本質</p>
          <h2>${esc(typeName(s, r.season))}の人</h2>
          <p class="lead">${esc(s.essence)}</p>
          <ul class="checks">${s.strengths.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="season-gift"><p class="sg-label">${esc(r.season.name)}が与えたもの</p><p>${esc(r.type.note)}</p></div>
          <div class="shadow"><h3 class="h3">無理をすると、こうなりやすい</h3><p class="shadow-sign">${esc(s.shadow.sign)}。</p><p>${esc(s.shadow.why)}${esc(s.shadow.care)}</p></div>
        </section>
        <section class="chapter">
          <p class="ch-label">美しさと、関わり方</p>
          <dl class="beauty">
            <div><dt>似合う質感</dt><dd>${esc(s.beauty.texture)}</dd></div>
            <div><dt>本質を映す色</dt><dd>${esc(s.beauty.color)}</dd></div>
            <div><dt>魅力が出る瞬間</dt><dd>${esc(s.beauty.shine)}</dd></div>
          </dl>
          <h3 class="h3">愛し方</h3><p>${esc(s.love)}</p>
        </section>
        <div class="next"><a class="btn-outline" href="#types">40のタイプ一覧へ戻る</a></div>
      </article>`;
    return true;
  }

  function renderCompat() {
    const me = state.reading;
    if (!me) { $('#compat-me').innerHTML = ''; return; }
    $('#compat-me').innerHTML = miniCard(me, 'あなた');
    if (state.pendingCompat) {
      const pt = state.pendingCompat; state.pendingCompat = null;
      $('#pt-year').value = pt.p.y; $('#pt-month').value = pt.p.m; fillDays($('#pt-day'), pt.p.y, pt.p.m); $('#pt-day').value = pt.p.d;
      $('#pt-hour').value = pt.p.hour == null ? '' : pt.p.hour; $('#pt-name').value = pt.p.name || '';
      setTimeout(() => showCompatResult(pt), 60);
    }
  }

  function miniCard(r, label) {
    return `
      <div class="mini" data-season="${r.season.key}">
        <span class="mini-img" style="${bg(thumbUrl(r.typeKey))}"></span>
        <span class="mini-body"><small>${esc(label)}</small><b>${esc(typeName(r.stem, r.season))}</b><span>${esc(r.type.catch)}</span></span>
      </div>`;
  }

  function showCompatResult(partner) {
    const me = state.reading;
    const c = compatOf(me.stemIdx, partner.stemIdx);
    const T = D.COMPAT_TEXT[c.kind];
    const pname = partner.p.name ? `${partner.p.name}さん` : 'お相手';
    $('#compat-result').innerHTML = `
      <div class="compat-pair">
        ${miniCard(me, 'あなた')}
        <span class="compat-x" aria-hidden="true">×</span>
        ${miniCard(partner, pname)}
      </div>
      <div class="compat-body">
        <p class="ch-label">ふたりの関係</p>
        <h2>${esc(T.title)}</h2>
        ${c.image ? `<p class="compat-image">${esc(c.image)}。</p>` : ''}
        <p>${esc(T.body)}</p>
        <p class="period-tip">${esc(T.tip)}</p>
        <p class="fine">あなたの日干「${esc(me.stem.stem)}（${esc(D.GOGYO[Math.floor(me.stemIdx / 2)])}）」と、${esc(pname)}の日干「${esc(partner.stem.stem)}（${esc(D.GOGYO[Math.floor(partner.stemIdx / 2)])}）」の五行の関係から読んでいます。相性に良い悪いはありません。関係の「かたち」を知るための材料です。</p>
        <a class="link-btn" href="#type/${partner.typeKey}">${esc(pname)}のタイプ「${esc(typeName(partner.stem, partner.season))}」を詳しく見る</a>
      </div>`;
    $('#compat-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // タイプ名と一言だけを共有する（生年月日・名前は含めない）
  function shareType() {
    const r = state.reading; if (!r) return;
    const text = `私は「${typeName(r.stem, r.season)}」でした。${r.type.catch}。\nあなたは、どの季節の、どんな自然？`;
    const url = location.origin + location.pathname;   // 付属の ?… や #… は外す
    const btn = $('#btn-share');
    if (navigator.share) {
      navigator.share({ title: '多角的占い診断', text, url }).catch(() => {});
      return;
    }
    const done = () => { btn.textContent = 'コピーしました'; setTimeout(() => { btn.textContent = 'タイプを友だちにシェアする'; }, 3000); };
    const full = `${text}\n${url}`;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(full).then(done).catch(() => window.prompt('この文章をコピーしてください', full));
    else window.prompt('この文章をコピーしてください', full);
  }

  // ============================================================
  // 入力フォーム
  // ============================================================
  function fillDays(sel, y, m) {
    const cur = sel.value;
    const max = (y && m) ? new Date(y, m, 0).getDate() : (m ? [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] : 31);
    sel.innerHTML = '<option value="">日</option>' + Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}日</option>`).join('');
    if (cur && Number(cur) <= max) sel.value = cur;
  }
  function setupDateInputs(prefix) {
    const yEl = $(`#${prefix}-year`), mEl = $(`#${prefix}-month`), dEl = $(`#${prefix}-day`);
    mEl.innerHTML = '<option value="">月</option>' + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}月</option>`).join('');
    fillDays(dEl, null, null);
    const refresh = () => fillDays(dEl, parseInt(yEl.value, 10) || null, parseInt(mEl.value, 10) || null);
    mEl.addEventListener('change', refresh);
    yEl.addEventListener('input', refresh);
    const hEl = $(`#${prefix}-hour`);
    if (hEl) hEl.innerHTML = '<option value="">わからない</option>' + Array.from({ length: 24 }, (_, i) => `<option value="${i}">${i}時台</option>`).join('');
  }
  function readDate(prefix) {
    const y = parseInt(String($(`#${prefix}-year`).value).normalize('NFKC'), 10);
    const m = parseInt($(`#${prefix}-month`).value, 10), d = parseInt($(`#${prefix}-day`).value, 10);
    const hEl = $(`#${prefix}-hour`);
    const hour = hEl && hEl.value !== '' ? parseInt(hEl.value, 10) : null;
    const thisYear = new Date().getFullYear();
    if (!y || y < 1900 || y > thisYear) return { error: `生まれた年を、西暦4桁（1900〜${thisYear}）でご入力ください。` };
    if (!m || !d) return { error: '生まれた月と日をお選びください。' };
    if (!isRealDate(y, m, d)) return { error: `${m}月${d}日は存在しない日付です。ご確認ください。` };
    return { y, m, d, hour };
  }

  // ============================================================
  // 画面遷移（#hash で管理。戻るボタンが自然に効く）
  // ============================================================
  const state = { profile: null, reading: null, justSubmitted: false };
  const SCREENS = ['top', 'input', 'reveal', 'result', 'compat', 'types', 'type', 'faq', 'palm', 'face', 'total'];

  function show(name) {
    SCREENS.forEach((n) => { const el = $(`#screen-${n}`); if (el) el.classList.toggle('active', n === name); });
    $$('.site-nav [data-nav]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-nav') === name));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });   // 画面の切り替えは瞬時に（なめらかスクロールは章内リンク用）
  }

  function route() {
    const h = (location.hash || '').replace(/^#/, '');
    if (h.startsWith('type/')) { if (renderTypeDetail(h.slice(5))) return show('type'); }
    const hm = h.match(/^(palm|face)(?:\/(.*))?$/);
    if (hm) { show(hm[1]); if (window.ShikiHands) window.ShikiHands.render(hm[1], hm[2] || ''); return; }
    if (h === 'total') { show('total'); if (window.ShikiPhoto) window.ShikiPhoto.renderTotal($('#total-root')); return; }   // 総合鑑定
    if (h.startsWith('s-')) return;           // 章内リンク（結果画面の中で移動）
    const name = h || (state.reading ? 'result' : 'top');
    if (['result', 'compat'].includes(name) && !state.reading) { location.replace('#input'); return; }
    if (name === 'result') renderResult(state.reading);
    if (name === 'compat') renderCompat();
    if (name === 'types') renderTypes();
    if (name === 'input' && state.profile) prefill(state.profile);
    show(SCREENS.includes(name) ? name : 'top');
  }

  function prefill(p) {
    $('#in-name').value = p.name || '';
    $('#in-year').value = p.y;
    $('#in-month').value = p.m;
    fillDays($('#in-day'), p.y, p.m);
    $('#in-day').value = p.d;
    $('#in-hour').value = p.hour == null ? '' : p.hour;
  }

  function reveal(r) {
    const el = $('#screen-reveal');
    el.setAttribute('data-season', r.season.key);
    $('#reveal-text').textContent = 'あなたの季節を読んでいます';
    show('reveal');
    setTimeout(() => { $('#reveal-text').textContent = `${r.season.name}の気配がします…`; }, 900);
    setTimeout(() => { location.hash = '#result'; }, 1900);
  }

  // ============================================================
  // 起動
  // ============================================================
  function init() {
    setupGate();
    setupDateInputs('in');
    setupDateInputs('pt');
    setupDateInputs('lk');

    // 文字サイズ（標準・大・特大）
    const sizes = ['', 'size-l', 'size-xl'], labels = ['標準', '大', '特大'];
    let si = Math.max(0, sizes.indexOf(store.get(SIZE_KEY) || ''));
    const applySize = () => { document.documentElement.classList.remove('size-l', 'size-xl'); if (sizes[si]) document.documentElement.classList.add(sizes[si]); $('#size-mark').textContent = labels[si]; };
    applySize();
    $('#btn-size').addEventListener('click', () => { si = (si + 1) % sizes.length; store.set(SIZE_KEY, sizes[si]); applySize(); });

    // 保存済みの結果
    try {
      const saved = JSON.parse(store.get(SAVE_KEY) || 'null');
      if (saved && saved.y && isRealDate(saved.y, saved.m, saved.d)) { state.profile = saved; state.reading = readPerson(saved); }
    } catch (_) {}

    $('#form-profile').addEventListener('submit', (e) => {
      e.preventDefault();
      const dt = readDate('in');
      const err = $('#in-error');
      if (dt.error) { err.textContent = dt.error; err.hidden = false; return; }
      err.hidden = true;
      const p = { name: $('#in-name').value.trim().slice(0, 20), y: dt.y, m: dt.m, d: dt.d, hour: dt.hour };
      state.profile = p; state.reading = readPerson(p);
      store.set(SAVE_KEY, JSON.stringify(p));
      reveal(state.reading);
    });

    $('#form-lookup').addEventListener('submit', (e) => {
      e.preventDefault();
      const dt = readDate('lk');
      const err = $('#lk-error');
      if (dt.error) { err.textContent = dt.error; err.hidden = false; return; }
      err.hidden = true;
      state.lookup = readPerson({ name: $('#lk-name').value.trim().slice(0, 20), y: dt.y, m: dt.m, d: dt.d, hour: dt.hour });
      renderTypes();
      const cell = document.getElementById('lookup-result');
      if (cell) cell.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#form-partner').addEventListener('submit', (e) => {
      e.preventDefault();
      const dt = readDate('pt');
      const err = $('#pt-error');
      if (dt.error) { err.textContent = dt.error; err.hidden = false; return; }
      err.hidden = true;
      const partner = readPerson({ name: $('#pt-name').value.trim().slice(0, 20), y: dt.y, m: dt.m, d: dt.d, hour: dt.hour });
      showCompatResult(partner);
    });

    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#s-"]');
      if (a) { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (e.target.closest('#btn-print')) { window.print(); return; }
      if (e.target.closest('#btn-share')) { shareType(); return; }
      if (e.target.closest('#btn-lookup-compat')) {
        state.pendingCompat = state.lookup; location.hash = '#compat'; return;
      }
      if (e.target.closest('#btn-reset')) {
        if (!window.confirm('保存されている診断結果を消して、最初から入力し直しますか？')) return;
        store.del(SAVE_KEY); state.profile = null; state.reading = null;
        $('#form-profile').reset(); location.hash = '#input';
      }
    });

    window.addEventListener('hashchange', route);
    document.documentElement.classList.remove('js-loading');
    route();
  }

  // テスト用に計算関数だけ公開する（画面には影響しない）
  window.ShikiApp = { readPerson, compatOf, periodOf, seasonAt, isRealDate, typeName, getReading: () => state.reading };

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
