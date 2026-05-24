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
  // v=10 数秘術 5数追加: 魂数（名の画数を一桁化）
  function calcSoulNum(seimei){
    if (!seimei || seimei.chikaku == null) return 0;
    return reduceNumber(seimei.chikaku, true);
  }
  // 数秘術 5数追加: 人格数（人格の画数を一桁化）
  function calcPersonalityNum(seimei){
    if (!seimei || seimei.jinkaku == null) return 0;
    return reduceNumber(seimei.jinkaku, true);
  }
  // 数秘術 5数追加: 成熟数（運命数+魂数を一桁化）
  function calcMaturityNum(lifePath, soulNum){
    return reduceNumber((lifePath || 0) + (soulNum || 0), true);
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
  // 動物占い60キャラ早見表（noa方式）。
  // 60干支番号(1〜60) と 60キャラの番号 が1対1で対応。
  // 12動物（0〜11）と 5タイプ（カラー）：番号1〜60を 12×5 で巡回。
  // 動物のインデックス(0-11):
  //  0:狼 1:こじか 2:猿 3:チータ 4:黒ひょう 5:ライオン
  //  6:虎 7:たぬき 8:コアラ 9:ゾウ 10:ひつじ 11:ペガサス
  // 標準的に公開されている noa 60キャラ表に沿ったマッピング:
  //  キャラ番号 1〜60 → 動物 を1つずつシフトしながら配置する。
  function calcAnimal(y, m, d) {
    // 個性心理學®公式の運命数計算（Animal60モジュール）を優先
    if (global.Animal60 && typeof global.Animal60.profile === 'function') {
      const p = global.Animal60.profile(y, m, d);
      if (p) {
        // 12動物グループのインデックスを GROUPS 配列の位置で返す
        const animalIdx = global.Animal60.GROUPS.findIndex(g => g.id === p.groupId);
        return {
          number: p.number,
          animal: animalIdx >= 0 ? animalIdx : 0,
          char: p.char,
          group: p.group,
          title: p.title,
          groupName: p.groupName,
          groupEmoji: p.groupEmoji,
          full: p
        };
      }
    }
    // フォールバック（旧ロジック）
    const n = calcDay60(y, m, d);
    const number = n + 1;
    const animalIndex = ((n + 0) % 12 + 12) % 12;
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

  // ---------- 7-b. 算命学 12従星（略式） ----------
  // 日干 × 年支 から、十二大従星のインデックスを決定
  // 各日干の「天将星」位置（最も力が強い支）からの距離で順序を割り出す
  // 天将星位置: 甲=寅(2), 乙=卯(3), 丙=巳(5), 丁=午(6), 戊=巳(5), 己=午(6),
  //              庚=申(8), 辛=酉(9), 壬=亥(11), 癸=子(0)
  // 順序: 天将, 天禄, 天南, 天恍, 天貴, 天印, 天報, 天馳, 天庫, 天極, 天胡, 天堂
  function calc12Jusho(dayStem, yearBranch) {
    const peaks = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];
    const peak = peaks[dayStem] || 0;
    return mod(peak - yearBranch + 12, 12);
  }

  // ---------- 7-b-2. 月支取得（節入り簡略） ----------
  // 戻り値: 0=子, 1=丑, 2=寅, ..., 11=亥
  // 節入り日（各月の概算）: 1月=6日(小寒), 2月=4日(立春), 3月=6日(啓蟄), ...
  function calcMonthBranch(m, d){
    const setsuiri = [6, 4, 6, 5, 6, 6, 7, 8, 8, 9, 8, 7];
    const inBranch  = m % 12;              // 節入り後の月支
    const preBranch = (m - 1 + 12) % 12;   // 節入り前は前月の月支
    return d >= setsuiri[m - 1] ? inBranch : preBranch;
  }

  // ---------- 7-b-3. 算命学 宿命星（月支配置・日支配置） ----------
  // 各支の蔵干（最も強い天干）を使い、日干 vs 蔵干 の通変関係で主星を導く。
  // 通変星インデックス = 主星インデックス（1:1対応）：
  //   0:貫索(比肩) 1:石門(劫財) 2:鳳閣(食神) 3:調舒(傷官) 4:禄存(偏財)
  //   5:司禄(正財) 6:車騎(偏官) 7:牽牛(正官) 8:龍高(偏印) 9:玉堂(印綬)
  function calcShukumeisei(dayStem, monthBranch, dayBranch){
    // 各支の主蔵干: 子=癸(9),丑=己(5),寅=甲(0),卯=乙(1),辰=戊(4),巳=丙(2),
    //              午=丁(3),未=己(5),申=庚(6),酉=辛(7),戌=戊(4),亥=壬(8)
    const PRIMARY_ZOUKAN = [9, 5, 0, 1, 4, 2, 3, 5, 6, 7, 4, 8];
    const gessei = calcTsuuhen(dayStem, PRIMARY_ZOUKAN[monthBranch]);
    const nissei = calcTsuuhen(dayStem, PRIMARY_ZOUKAN[dayBranch]);
    return { gessei, nissei };
  }

  // ---------- 7-b-4. 四柱推命 命式全体（v=10：年月日時の4柱） ----------
  // 五虎遁による月干算出
  function calcMonthStem(yearStem, monthBranch){
    // 年干グループ: 甲己=0, 乙庚=1, 丙辛=2, 丁壬=3, 戊癸=4
    const group = yearStem % 5;
    // 寅月の月干 = group*2 + 2、卯月 = +1 ...
    // 一般化: monthStem = (group*2 + monthBranch) mod 10
    return mod(group * 2 + monthBranch, 10);
  }
  // 時支算出（hour 0-23 を 12支に）
  function calcHourBranch(hour){
    if (hour == null || hour === '') return null;
    const h = parseInt(hour, 10);
    if (isNaN(h)) return null;
    // 子時: 23-1, 丑: 1-3, ..., 亥: 21-23
    if (h === 23) return 0;
    return Math.floor((h + 1) / 2) % 12;
  }
  // 五鼠遁による時干算出
  function calcHourStem(dayStem, hourBranch){
    if (hourBranch == null) return null;
    // 日干グループ: 甲己=0, 乙庚=1, 丙辛=2, 丁壬=3, 戊癸=4
    // 子時の時干: 甲己日=甲(0), 乙庚日=丙(2), 丙辛日=戊(4), 丁壬日=庚(6), 戊癸日=壬(8)
    // hourStem(子時) = group*2
    // 一般化: hourStem = (group*2 + hourBranch) mod 10
    const group = dayStem % 5;
    return mod(group * 2 + hourBranch, 10);
  }
  // 各支の主蔵干（最も強い天干）
  function calcZouKan(branch){
    const PRIMARY = [9, 5, 0, 1, 4, 2, 3, 5, 6, 7, 4, 8];
    return PRIMARY[branch];
  }
  // 四柱命式：年柱・月柱・日柱・時柱、各柱の通変＋蔵干通変
  function calcMeishiki(y, mo, d, hour){
    const yearStem    = calcYearStem(y, mo, d);
    const yearBranch  = calcYearBranch(y, mo, d);
    const monthBranch = calcMonthBranch(mo, d);
    const monthStem   = calcMonthStem(yearStem, monthBranch);
    const dayStem     = calcDayStem(y, mo, d);
    const dayBranch   = calcDayBranch(y, mo, d);
    const hourBranch  = calcHourBranch(hour);
    const hourStem    = calcHourStem(dayStem, hourBranch);
    return {
      year:  { stem: yearStem,  branch: yearBranch,
               tsuuhen: calcTsuuhen(dayStem, yearStem),
               zouTsuuhen: calcTsuuhen(dayStem, calcZouKan(yearBranch)) },
      month: { stem: monthStem, branch: monthBranch,
               tsuuhen: calcTsuuhen(dayStem, monthStem),
               zouTsuuhen: calcTsuuhen(dayStem, calcZouKan(monthBranch)) },
      day:   { stem: dayStem,   branch: dayBranch,
               tsuuhen: null,
               zouTsuuhen: calcTsuuhen(dayStem, calcZouKan(dayBranch)) },
      hour:  hourBranch != null ? {
               stem: hourStem,  branch: hourBranch,
               tsuuhen: calcTsuuhen(dayStem, hourStem),
               zouTsuuhen: calcTsuuhen(dayStem, calcZouKan(hourBranch))
             } : null
    };
  }

  // ---------- 7-c. 四柱推命 通変星（略式） ----------
  // 日干 vs 年干 で通変星を決定
  // 五行と陰陽の関係から10種の通変星を導く
  // 順序: 比肩, 劫財, 食神, 傷官, 偏財, 正財, 偏官, 正官, 偏印, 印綬
  function calcTsuuhen(dayStem, otherStem) {
    // 五行: 0,1=木 / 2,3=火 / 4,5=土 / 6,7=金 / 8,9=水
    const elem = (s) => Math.floor(s / 2);
    const isYang = (s) => s % 2 === 0; // 偶数=陽干
    const de = elem(dayStem), oe = elem(otherStem);
    const sameYin = isYang(dayStem) === isYang(otherStem);
    // 五行関係：日干→相手の関係
    // 0:同じ(比肩・劫財), 1:生む(食神・傷官), 2:剋す(偏財・正財),
    // 3:剋される(偏官・正官), 4:生まれる(偏印・印綬)
    let rel;
    if (de === oe) rel = 0;
    else if ((de + 1) % 5 === oe) rel = 1; // 生む
    else if ((de + 2) % 5 === oe) rel = 2; // 剋す
    else if ((de + 3) % 5 === oe) rel = 3; // 剋される
    else rel = 4; // 生まれる
    // 同陰陽=偏 (偶数番)、異陰陽=正 (奇数番)
    const baseMap = [0, 2, 4, 6, 8]; // 比肩/食神/偏財/偏官/偏印
    return baseMap[rel] + (sameYin ? 0 : 1);
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

  // ---------- 9-b. 月星座（略式） ----------
  // 本来は出生時刻が必要だが、ない場合の近似として
  // 月は約2.5日で1サイン動く → 通算日数から推定
  function calcMoonSign(y, m, d) {
    const days = daysBetween(2000, 1, 1, y, m, d); // 基準日からの日数
    // 2000/1/1 の月星座 ≒ 山羊（9）として、2.46日 = 1サイン
    const sign = Math.floor(days / 2.46);
    return mod(9 + sign, 12);
  }

  // ---------- 9-c. 水星星座（略式） ----------
  // 水星は太陽から±28°以内 → 太陽星座 ± 1サインに必ず収まる
  function calcMercurySign(y, m, d) {
    const sun = calcSunSign(m, d);
    const offset = (digitSum(y) + digitSum(m) + d) % 3 - 1; // -1〜+1
    return mod(sun + offset, 12);
  }

  // ---------- 9-d. 火星星座（略式） ----------
  // 火星は約687日で12星座を一周 → 1サイン約57.25日
  function calcMarsSign(y, m, d) {
    const days = daysBetween(2000, 1, 1, y, m, d);
    // 2000/1/1 の火星 ≒ 水瓶（10）
    const sign = Math.floor(days / 57.25);
    return mod(10 + sign, 12);
  }

  // ---------- 9-e. 木星星座（略式） ----------
  // 木星は約12年で12星座を一周 → 1サイン約365.25日
  function calcJupiterSign(y, m, d) {
    const days = daysBetween(2000, 1, 1, y, m, d);
    // 2000/1/1 の木星 ≒ 牡羊（0）
    const sign = Math.floor(days / 365.25);
    return mod(0 + sign, 12);
  }

  // ---------- 9-f. 土星星座（略式） ----------
  // 土星は約29.5年で12星座を一周 → 1サイン約897日
  function calcSaturnSign(y, m, d) {
    const days = daysBetween(2000, 1, 1, y, m, d);
    // 2000/1/1 の土星 ≒ 牡牛（1）
    const sign = Math.floor(days / 897);
    return mod(1 + sign, 12);
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
  // 7ポジション・スプレッド（決定的：同じ生年月日では同じスプレッドが出る）
  // 各ポジションごとに固有のソルトで擬似乱数を生成し、重複を避けて22枚から7枚を選ぶ
  function drawTarotSpread(y, m, d) {
    const positions = (global.CONTENT_DATA && global.CONTENT_DATA.TAROT_POSITIONS) || [];
    const tarot = (global.CONTENT_DATA && global.CONTENT_DATA.TAROT_MAJOR) || [];
    const total = tarot.length;
    if (!positions.length || !total) return [];
    const used = new Set();
    const results = [];
    const salts = [101, 211, 317, 421, 523, 631, 743]; // ポジションごと固有
    for (let i = 0; i < positions.length; i++) {
      const salt = salts[i] || (i + 1) * 97;
      // FNV-1a的なシード生成
      let seed = (y * 73856093) ^ (m * 19349663) ^ (d * 83492791) ^ (salt * 2971215073);
      seed = seed >>> 0;
      let idx = seed % total;
      // 重複を避ける
      let tries = 0;
      while (used.has(idx) && tries < total) {
        idx = (idx + 1) % total;
        tries++;
      }
      used.add(idx);
      const reversed = ((seed >>> 8) & 1) === 1;
      results.push({
        position: positions[i],
        cardIndex: idx,
        card: tarot[idx],
        reversed: reversed
      });
    }
    return results;
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

  // 生年月日から決定的に1卦を選ぶ（同じ人なら常に同じ卦）
  function calcIching(y, m, d) {
    let seed = (y * 73856093) ^ (m * 19349663) ^ (d * 83492791) ^ 0xA1B2C3;
    seed = seed >>> 0;
    return seed % 64;
  }

  // ---------- 13. ルーン ----------
  function drawRune() {
    return Math.floor(Math.random() * 24); // エルダー・フサルク24
  }

  // 生年月日から決定的に1ルーンを選ぶ
  function calcRune(y, m, d) {
    let seed = (y * 2654435761) ^ (m * 40503) ^ (d * 22695477) ^ 0xD4E5F6;
    seed = seed >>> 0;
    return seed % 24;
  }

  // 生年月日から決定的に夢シンボルを選ぶ
  function calcDream(y, m, d) {
    let seed = (y * 374761393) ^ (m * 668265263) ^ (d * 1274126177) ^ 0x9E3779B9;
    seed = seed >>> 0;
    const total = (global.CONTENT_DATA && global.CONTENT_DATA.DREAM)
      ? global.CONTENT_DATA.DREAM.length : 100;
    return seed % total;
  }

  // 生年月日から決定的に小アルカナ1枚を選ぶ（v=10）
  function calcMinorTarot(y, m, d) {
    let seed = (y * 2246822519) ^ (m * 3266489917) ^ (d * 668265263) ^ 0xC3D2E1F0;
    seed = seed >>> 0;
    const total = (global.CONTENT_DATA && global.CONTENT_DATA.TAROT_MINOR)
      ? global.CONTENT_DATA.TAROT_MINOR.length : 56;
    return seed % total;
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

  // ===== v=11: 本格鑑定マスター 最高峰拡張 =====

  // ---------- 21. 西洋占星術 アスペクト ----------
  // 惑星間の角度関係を検出（オーブ±8°）。signIdx は 0-11 の星座位置。
  function calcAspects(planetSigns) {
    // planetSigns: {sun, moon, mercury, venus, mars, jupiter, saturn} それぞれ 0-11
    const names = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
    const labels = { sun: '太陽', moon: '月', mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星' };
    const aspects = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const s1 = planetSigns[names[i]];
        const s2 = planetSigns[names[j]];
        if (typeof s1 !== 'number' || typeof s2 !== 'number') continue;
        const raw = Math.abs(s1 - s2);
        const diff = Math.min(raw, 12 - raw);
        // 星座差で簡易判定（1星座=30°）
        let type = null;
        if (diff === 0) type = 'conjunction';
        else if (diff === 2) type = 'sextile';
        else if (diff === 3) type = 'square';
        else if (diff === 4) type = 'trine';
        else if (diff === 6) type = 'opposition';
        if (type) {
          aspects.push({
            p1: names[i], p2: names[j],
            label1: labels[names[i]], label2: labels[names[j]],
            type: type
          });
        }
      }
    }
    return aspects;
  }

  // ---------- 22. 西洋占星術 トランジット詳細 ----------
  // 今日の太陽・月が出生図の何ハウスを通過しているか
  function calcTransitHouse(natalAsc) {
    const today = new Date();
    const tSun = calcSunSign(today.getMonth() + 1, today.getDate());
    const tMoon = calcMoonSign(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const houseOf = function (sign) { return mod(sign - natalAsc, 12) + 1; };
    return {
      sunSign: tSun, sunHouse: houseOf(tSun),
      moonSign: tMoon, moonHouse: houseOf(tMoon)
    };
  }

  // ---------- 23. 四柱推命 大運（10年運） ----------
  // 簡易版：月柱から起算、男陽女陰=順行 / 男陰女陽=逆行
  function calcDaiUn(y, mo, d, sex, monthStem, monthBranch) {
    // sex: 0=男, 1=女。未指定の場合は男扱い
    const isMale = sex !== 1;
    const yangStem = (monthStem % 2 === 0); // 0,2,4,6,8 が陽干
    const forward = (isMale && yangStem) || (!isMale && !yangStem);
    const cycles = [];
    // 開始年齢は簡易に「5歳」固定
    for (let i = 0; i < 8; i++) {
      const step = forward ? (i + 1) : -(i + 1);
      const stemIdx = mod(monthStem + step, 10);
      const branchIdx = mod(monthBranch + step, 12);
      cycles.push({
        ageStart: 5 + i * 10,
        ageEnd: 5 + (i + 1) * 10 - 1,
        stem: stemIdx,
        branch: branchIdx
      });
    }
    return { forward: forward, cycles: cycles };
  }

  // ---------- 24. 四柱推命 用神・忌神（五行バランス） ----------
  // 天干5行 + 地支蔵干5行 を集計し最弱=用神、最強=忌神
  function calcYoujin(meishiki) {
    // 天干 0,1=木 2,3=火 4,5=土 6,7=金 8,9=水
    const stemToGogyo = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
    // 地支 0=水(子) 1=土(丑) 2=木(寅) 3=木(卯) 4=土(辰) 5=火(巳) 6=火(午) 7=土(未) 8=金(申) 9=金(酉) 10=土(戌) 11=水(亥)
    const branchToGogyo = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
    const counts = [0, 0, 0, 0, 0]; // 木火土金水
    const pillars = ['year', 'month', 'day', 'hour'];
    for (let i = 0; i < pillars.length; i++) {
      const p = meishiki[pillars[i]];
      if (!p) continue;
      if (typeof p.stem === 'number') counts[stemToGogyo[p.stem]]++;
      if (typeof p.branch === 'number') counts[branchToGogyo[p.branch]]++;
    }
    let minIdx = 0, maxIdx = 0;
    for (let i = 1; i < 5; i++) {
      if (counts[i] < counts[minIdx]) minIdx = i;
      if (counts[i] > counts[maxIdx]) maxIdx = i;
    }
    return { counts: counts, youjin: minIdx, kijin: maxIdx };
  }

  // ---------- 25. タロット ケルト十字（10枚展開） ----------
  // 大アルカナ22 + 小アルカナ56 = 78枚から決定論的に10枚抽出（重複なし）
  function drawCelticCross(y, m, d) {
    const seed = (y * 16777619) ^ (m * 524287) ^ (d * 8191);
    const deck = [];
    for (let i = 0; i < 78; i++) deck.push(i);
    // Fisher-Yates 風シャッフル（決定論的）
    let state = seed >>> 0;
    for (let i = deck.length - 1; i > 0; i--) {
      state = (state * 1103515245 + 12345) >>> 0;
      const j = state % (i + 1);
      const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }
    // 0-21 が大アルカナ、22-77 が小アルカナ
    return deck.slice(0, 10).map(function (idx) {
      if (idx < 22) {
        return { isMajor: true, cardIdx: idx };
      } else {
        const minorIdx = idx - 22;
        return { isMajor: false, cardIdx: minorIdx };
      }
    });
  }

  // ---------- 26. 算命学 干合・支合・冲・刑 ----------
  // 命式 4 柱内の天干・地支の特殊関係を検出
  function calcKanshiRelations(meishiki) {
    const kango = [[0, 5], [1, 6], [2, 7], [3, 8], [4, 9]]; // 甲己/乙庚/丙辛/丁壬/戊癸
    const shigo = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]]; // 子丑/寅亥/卯戌/辰酉/巳申/午未
    const chu = [[0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]]; // 子午/丑未/寅申/卯酉/辰戌/巳亥
    const pillars = ['year', 'month', 'day', 'hour'];
    const pLabels = { year: '年柱', month: '月柱', day: '日柱', hour: '時柱' };
    const found = { kango: [], shigo: [], chu: [], kei: [] };
    function checkPair(s1, s2, list) {
      for (let k = 0; k < list.length; k++) {
        if ((s1 === list[k][0] && s2 === list[k][1]) || (s1 === list[k][1] && s2 === list[k][0])) return true;
      }
      return false;
    }
    for (let i = 0; i < pillars.length; i++) {
      for (let j = i + 1; j < pillars.length; j++) {
        const pi = meishiki[pillars[i]], pj = meishiki[pillars[j]];
        if (!pi || !pj) continue;
        if (typeof pi.stem === 'number' && typeof pj.stem === 'number' && checkPair(pi.stem, pj.stem, kango)) {
          found.kango.push({ a: pLabels[pillars[i]], b: pLabels[pillars[j]] });
        }
        if (typeof pi.branch === 'number' && typeof pj.branch === 'number') {
          if (checkPair(pi.branch, pj.branch, shigo)) found.shigo.push({ a: pLabels[pillars[i]], b: pLabels[pillars[j]] });
          if (checkPair(pi.branch, pj.branch, chu)) found.chu.push({ a: pLabels[pillars[i]], b: pLabels[pillars[j]] });
          // 刑：簡易（寅巳・巳申・申寅、丑戌未、子卯）
          const keiSets = [[2, 5], [5, 8], [8, 2], [1, 10], [10, 7], [7, 1], [0, 3]];
          if (checkPair(pi.branch, pj.branch, keiSets)) found.kei.push({ a: pLabels[pillars[i]], b: pLabels[pillars[j]] });
        }
      }
    }
    return found;
  }

  // ---------- 27. 九星気学 月命星・日命星 ----------
  function calcMonthlyStar(y, m, d) {
    // 月命星は本命星と生月で決まる（簡易計算）
    const base = calcNineStar(y, 1, 1); // 本命星基準
    return mod(base + m - 1, 9);
  }
  function calcDailyStar(y, m, d) {
    // 日命星は本命星と通日数で
    const days = Math.floor((new Date(y, m - 1, d).getTime()) / (24 * 60 * 60 * 1000));
    return mod(days, 9);
  }

  // ---------- 28. 易経 変爻・之卦 ----------
  // 既存の calcIching に変爻を追加（決定論的）
  function calcHengaIching(y, m, d) {
    const main = calcIching(y, m, d);
    const movingLine = mod(y * 7 + m * 13 + d * 17, 6); // 0-5
    // 変爻によって卦が変わる：簡易に main + (1<<movingLine) を 64 でmod
    const henka = mod(main + (movingLine + 1) * 7, 64);
    return { main: main, movingLine: movingLine, henka: henka };
  }

  // ---------- 公開 ----------
  global.FortuneCalc = {
    calcLifePath, calcBirthNumber,
    calcSoulNum, calcPersonalityNum, calcMaturityNum,
    calcSunSign,
    calcDay60, calcDayStem, calcDayBranch,
    calcAnimal,
    calcNineStar,
    calcSixStar,
    calcYearStem, calcYearBranch,
    calc12Jusho, calcTsuuhen, calcMonthBranch, calcShukumeisei,
    calcMonthStem, calcHourBranch, calcHourStem, calcZouKan, calcMeishiki,
    calcVenusSign, calcAscendant,
    calcMoonSign, calcMercurySign, calcMarsSign, calcJupiterSign, calcSaturnSign,
    drawTarot, fateTarot, drawTarotSpread, drawOracle, drawIching, drawRune, drawKuji,
    calcIching, calcRune, calcDream, calcMinorTarot,
    strokesOf, calcSeimei, seimeiCategory,
    calcPalmType, calcFaceType, pickDream,
    currentTransitTheme, currentYearLuck, currentNineStarYear,
    calcAspects, calcTransitHouse, calcDaiUn, calcYoujin,
    drawCelticCross, calcKanshiRelations,
    calcMonthlyStar, calcDailyStar, calcHengaIching,
    pickByDate, pickRandom, mod, reduceNumber, digitSum
  };
})(window);
