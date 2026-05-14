/* ============================================================
   calc.js — 占い計算ロジック
   ・全てクライアントサイドの純計算。外部通信なし。
   ・テキスト解説は content.js に分離。
   ============================================================ */

(function (global) {
  'use strict';

  // ---------- ユーティリティ ----------
  function digitSum(n) {
    return String(n).split('').reduce((s, c) => s + (parseInt(c, 10) || 0), 0);
  }
  function reduceNumber(n, allowMaster) {
    while (n > 9) {
      if (allowMaster && (n === 11 || n === 22 || n === 33)) return n;
      n = digitSum(n);
    }
    return n;
  }
  function daysBetween(y1, m1, d1, y2, m2, d2) {
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.round((b - a) / 86400000);
  }
  function mod(n, m) { return ((n % m) + m) % m; }
  function pickByDate(arr, y, m, d, salt) {
    // 同じ生年月日では常に同じ結果を返す決定的な擬似ランダム
    const seed = (y * 73856093) ^ (m * 19349663) ^ (d * 83492791) ^ ((salt || 0) * 2971215073);
    const idx = mod(seed, arr.length);
    return { item: arr[idx], index: idx };
  }
  function pickRandom(arr) {
    const i = Math.floor(Math.random() * arr.length);
    return { item: arr[i], index: i };
  }

  // ---------- 1. 数秘術: ライフパス ----------
  function calcLifePath(y, m, d) {
    const sum = digitSum(y) + digitSum(m) + digitSum(d);
    return reduceNumber(sum, true);
  }
  // 数秘術: 誕生数（魂数）= 誕生日のみを単数化
  function calcBirthNumber(d) {
    return reduceNumber(d, true);
  }

  // ---------- 2. 西洋占星術: 太陽星座 ----------
  // 0:牡羊 1:牡牛 2:双子 3:蟹 4:獅子 5:乙女 6:天秤 7:蠍 8:射手 9:山羊 10:水瓶 11:魚
  function calcSunSign(m, d) {
    const bounds = [
      [3, 21], [4, 20], [5, 21], [6, 22], [7, 23], [8, 23],
      [9, 23], [10, 24], [11, 23], [12, 22], [1, 20], [2, 19]
    ];
    for (let i = 0; i < 12; i++) {
      const [bm, bd] = bounds[i];
      const [nbm, nbd] = bounds[(i + 1) % 12];
      if ((m === bm && d >= bd) || (m === nbm && d < nbd)) return i;
    }
    return 9; // 山羊 (12/22-1/19)
  }

  // ---------- 3. 六十干支（日柱）計算 ----------
  // 1984年2月2日を「甲子」(0) とする近似。
  // 戻り値: 0〜59 （0=甲子, 1=乙丑, ... 59=癸亥）
  function calcDay60(y, m, d) {
    // 基準: 2000-01-01 は「戊午」(=54)
    const REF_Y = 2000, REF_M = 1, REF_D = 1, REF_INDEX = 54;
    const diff = daysBetween(REF_Y, REF_M, REF_D, y, m, d);
    return mod(REF_INDEX + diff, 60);
  }
  // 日干（10干: 0=甲〜9=癸）
  function calcDayStem(y, m, d) { return calcDay60(y, m, d) % 10; }
  // 日支（12支: 0=子〜11=亥）
  function calcDayBranch(y, m, d) { return calcDay60(y, m, d) % 12; }

  // ---------- 4. 動物占い ----------
  // 動物占い60キャラの番号は 日干支番号(1〜60) と一致するのが基本。
  // 12動物（5タイプ × 12 = 60）
  // 動物のインデックス(0-11):
  //  0:狼 1:こじか 2:猿 3:チータ 4:黒ひょう 5:ライオン
  //  6:虎 7:たぬき 8:コアラ 9:ゾウ 10:ひつじ 11:ペガサス
  function calcAnimal(y, m, d) {
    const n = calcDay60(y, m, d); // 0〜59
    const number = n + 1;          // 1〜60
    // 動物占いの並び（標準的なマッピング）
    const animalOrder = [
      11, 10,  1,  1,  3,  3,  9,  9,  6,  6,  // 1-10
       2,  2,  5,  5,  0,  0,  4,  4,  7,  7,  // 11-20
       8,  8, 11, 11, 10, 10,  1,  3,  3,  9,  // 21-30
       9,  6,  6,  2,  2,  5,  5,  0,  0,  4,  // 31-40
       4,  7,  7,  8,  8, 11, 11, 10, 10,  1,  // 41-50
       1,  3,  3,  9,  9,  6,  6,  2,  2,  5   // 51-60
    ];
    // ※ 上記は近似マッピング。動物占いは諸説あり本書きとは±数日のズレが出る場合があります。
    const animalIndex = animalOrder[n] !== undefined ? animalOrder[n] : (n % 12);
    return { number: number, animal: animalIndex };
  }

  // ---------- 5. 九星気学 ----------
  // 本命星：年の数を1桁にして 11 - sum, 立春(2/4)以前は前年扱い
  function calcNineStar(y, m, d) {
    let year = y;
    if (m === 1 || (m === 2 && d < 4)) year = y - 1;
    let s = digitSum(year);
    while (s > 9) s = digitSum(s);
    let star = 11 - s;
    if (star <= 0) star += 9;
    if (star > 9) star -= 9;
    return star; // 1〜9
  }

  // ---------- 6. 六星占術 ----------
  // 運命数 = (西暦 + 月補正 + 日) mod 60。月補正は1月=0,2月=31,3月=59...の通日。
  // 0以下なら +60。1〜60。
  // 1〜10:土星, 11〜20:金星, 21〜30:火星, 31〜40:天王星, 41〜50:木星, 51〜60:水星
  // 性（陽/陰）はその後の細分けで決まるが、ここでは簡易に number 奇数=陽 / 偶数=陰 にマップ。
  function calcSixStar(y, m, d) {
    const monthDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let dn = (y % 60) + monthDays[m - 1] + d;
    // うるう年補正
    if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) {
      if (m > 2) dn += 1;
    }
    dn = mod(dn, 60);
    if (dn === 0) dn = 60;
    // 星
    const starIdx = Math.floor((dn - 1) / 10); // 0〜5
    // 性
    const polarity = (dn % 2 === 1) ? 'plus' : 'minus'; // 奇数=陽, 偶数=陰
    return { number: dn, star: starIdx, polarity: polarity };
  }

  // ---------- 7. 干支（生まれ年） ----------
  // 0:子 1:丑 2:寅 3:卯 4:辰 5:巳 6:午 7:未 8:申 9:酉 10:戌 11:亥
  function calcYearBranch(y, m, d) {
    let year = y;
    if (m === 1 || (m === 2 && d < 4)) year = y - 1;
    return mod(year - 4, 12);
  }
  function calcYearStem(y, m, d) {
    let year = y;
    if (m === 1 || (m === 2 && d < 4)) year = y - 1;
    return mod(year - 4, 10);
  }

  // ---------- 8. 金星星座（略式） ----------
  // 金星は太陽から±48°以内 → 太陽星座 ± 2サインに必ず収まる。
  // 略式: 生年月日の合計値から ±2 のオフセットを決定。
  function calcVenusSign(y, m, d) {
    const sun = calcSunSign(m, d);
    const offset = (digitSum(y) + d) % 5 - 2; // -2〜+2
    return mod(sun + offset, 12);
  }

  // ---------- 9. アセンダント（略式） ----------
  // 簡易: 太陽星座 + (誕生時刻 - 6時) / 2 サインずれる
  function calcAscendant(y, m, d, hour) {
    const sun = calcSunSign(m, d);
    if (hour === null || hour === undefined || hour === '') {
      // 時刻不明: 出生日付からの近似
      return mod(sun + (d % 12), 12);
    }
    const h = parseInt(hour, 10);
    const offset = Math.round((h - 6) / 2);
    return mod(sun + offset, 12);
  }

  // ---------- 10. タロット引き ----------
  // 大アルカナ22枚から1枚。content.js の TAROT_MAJOR と対応。
  function drawTarot() {
    const i = Math.floor(Math.random() * 22);
    const reversed = Math.random() < 0.5;
    return { index: i, reversed: reversed };
  }
  // 生年月日決定のタロット（先天・運命カード）
  function fateTarot(y, m, d) {
    const lp = calcLifePath(y, m, d);
    // ライフパスを大アルカナ番号に対応
    const map = { 1:0, 2:1, 3:2, 4:3, 5:4, 6:5, 7:6, 8:7, 9:8, 11:10, 22:20, 33:13 };
    return { index: map[lp] !== undefined ? map[lp] : (lp - 1) };
  }

  // ---------- 11. オラクル ----------
  function drawOracle(count = 1) {
    const total = global.CONTENT_DATA && global.CONTENT_DATA.ORACLE
      ? global.CONTENT_DATA.ORACLE.length : 36;
    const picks = new Set();
    while (picks.size < Math.min(count, total)) picks.add(Math.floor(Math.random() * total));
    return Array.from(picks);
  }

  // ---------- 12. 易占い ----------
  function drawIching() {
    return Math.floor(Math.random() * 64); // 0〜63
  }

  // ---------- 13. ルーン ----------
  function drawRune() {
    return Math.floor(Math.random() * 24); // エルダー・フサルク24
  }

  // ---------- 14. おみくじ ----------
  // 配分: 大吉15% / 吉25% / 中吉20% / 小吉15% / 末吉15% / 凶8% / 大凶2%
  function drawKuji() {
    const r = Math.random();
    if (r < 0.15) return 'daikichi';
    if (r < 0.40) return 'kichi';
    if (r < 0.60) return 'chukichi';
    if (r < 0.75) return 'shokichi';
    if (r < 0.90) return 'suekichi';
    if (r < 0.98) return 'kyo';
    return 'daikyo';
  }

  // ---------- 15. 姓名判断（略式） ----------
  // 漢字画数辞書がないため、文字数ベースで近似画数を出す。
  // 1文字あたりの平均画数を10と仮定し、ひらがな・カタカナは3画とみなす。
  function strokesOf(str) {
    if (!str) return 0;
    let n = 0;
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      if (code >= 0x3040 && code <= 0x30FF) n += 3;        // かな
      else if (code >= 0x4E00 && code <= 0x9FFF) n += 10;  // 漢字（平均）
      else n += 4;
    }
    return n;
  }
  function calcSeimei(sei, mei) {
    const s = strokesOf(sei);
    const m = strokesOf(mei);
    return {
      tenkaku: s,                       // 天格（姓）
      jinkaku: (sei ? sei.slice(-1) : '') && (mei ? mei.slice(0,1) : '') ? Math.floor((s + m) / 2) : (s + m),
      chikaku: m,                       // 地格（名）
      gaikaku: Math.max(0, (s - 1) + (m - 1)),
      sokaku: s + m                     // 総格
    };
  }
  // 姓名判断 結果カテゴリ（総格を元に5分類）
  function seimeiCategory(sokaku) {
    if (sokaku === 0) return null;
    const r = sokaku % 9;
    return r; // 0〜8
  }

  // ---------- 16. 手相（タイプ選択ベース） ----------
  // ユーザーが手相を入力するUIを別途設けず、生年月日から「手相の傾向」を擬似決定。
  function calcPalmType(y, m, d) {
    return mod(y + m * 7 + d * 13, 6); // 6タイプ
  }
  // 人相
  function calcFaceType(y, m, d) {
    return mod(y * 3 + m * 11 + d * 5, 6);
  }

  // ---------- 17. 夢占い（キーワード） ----------
  // 夢占いはキーワード入力に依存するため、ここでは事前定義キーワードからピック。
  function pickDream() {
    const total = global.CONTENT_DATA && global.CONTENT_DATA.DREAM
      ? global.CONTENT_DATA.DREAM.length : 12;
    return Math.floor(Math.random() * total);
  }

  // ---------- 18. 西洋占星術: 現在のトランジット（略式） ----------
  // 太陽の現在位置（今日の日付）と本人の太陽星座から現在のテーマを引く
  function currentTransitTheme(natalSunSign) {
    const today = new Date();
    const tSun = calcSunSign(today.getMonth() + 1, today.getDate());
    return { current: tSun, natal: natalSunSign, diff: mod(tSun - natalSunSign, 12) };
  }

  // ---------- 19. 四柱推命「年運」（簡易・本年の流年） ----------
  // 本年の干支と本人の日干との関係をテーマ化
  function currentYearLuck(y, m, d) {
    const today = new Date();
    const tyStem = calcYearStem(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const tyBranch = calcYearBranch(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const myStem = calcDayStem(y, m, d);
    return { yearStem: tyStem, yearBranch: tyBranch, mineStem: myStem };
  }

  // ---------- 20. 九星気学 今年の本命星位置 ----------
  function currentNineStarYear() {
    const today = new Date();
    return calcNineStar(today.getFullYear(), today.getMonth() + 1, today.getDate());
  }

  // ---------- 公開 ----------
  global.FortuneCalc = {
    calcLifePath, calcBirthNumber,
    calcSunSign,
    calcDay60, calcDayStem, calcDayBranch,
    calcAnimal,
    calcNineStar,
    calcSixStar,
    calcYearStem, calcYearBranch,
    calcVenusSign, calcAscendant,
    drawTarot, fateTarot, drawOracle, drawIching, drawRune, drawKuji,
    strokesOf, calcSeimei, seimeiCategory,
    calcPalmType, calcFaceType, pickDream,
    currentTransitTheme, currentYearLuck, currentNineStarYear,
    pickByDate, pickRandom, mod, reduceNumber, digitSum
  };
})(window);
