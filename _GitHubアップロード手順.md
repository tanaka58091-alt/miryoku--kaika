# GitHubアップロード手順（v=18：データベース大幅拡張＋実行体制整備）

## 今回の修正内容（4段階の格上げ）

### Phase A：人生ロードマップ（cat7） 4 → 40 パターン
- これまで `ROADMAP` はエレメント4分類（火/土/風/水）のみ → 同じエレメントの人は全員同じ内容だった
- `content.js` の `ROADMAP` を **エレメント × 10天干 = 40パターン** に再構造化
  - 例：`ROADMAP['土']['己']`、`ROADMAP['火']['丙']` のように2階層
  - 各エントリは `lifeTheme / letGo / growMore / youngerSecret / trueShine / after3Months / after1Year` の7フィールド
- `app.js` の `renderCat7` を新構造対応 + 旧構造フォールバックに改修
  - `c.dayStem` から STEMS[i].name の旧字（甲（きのえ）等）を strip して `ROADMAP[elem][stemKey]` を引く
  - 旧 `ROADMAP[elem]` 構造のままでも動くようにフォールバック実装

### Phase B：心の歪み診断（cat3） 9 → 27 タイプ
- これまで `HIZUMI` はライフパス %9 の9バケットだけ → 同じLPの人は全員同じ歪み判定だった
- `content.js` の `HIZUMI` を **27タイプ** に拡張（9バケット × 太陽エレメント × 日干奇偶 で分割）
- `app.js` の `hizumiIndexOf(c)` を改修：
  - `baseIdx = (lp-1)%9` （マスター数 11/22/33 は 2/4/6 に正規化）
  - `elemKey = {火:0, 土:1, 風:2, 水:0}` × `stemOdd = dayStem%2` で `sub` 算出
  - `sub === 0 → baseIdx（旧9タイプ）`、`sub === 1/2 → 9〜26（新18タイプ）`
- 新27タイプの代表：過剰共感／役割同一化／セルフネグレクト／未来不安先回り／怒り抑圧／過剰責任／自己批判内在化／承認依存／境界線崩壊 など
- `pickPriorityActions(c)` の `byHizumi` も27タイプ全てに優先3領域マッピングを追加
- `buildRoadmapPersonalCore` の `themeByHizumi` も27タイプ対応
- フォールバック：`D.HIZUMI.length < 27` のときは旧9タイプ動作に戻る

### Phase C：四柱推命 大運（cat1） 8 → 80 セル
- これまで `DAIUN_CYCLE_THEME` はサイクル番号（0〜7）の8セルだけ → 全日干の人が同じ10年運の文言を見ていた
- `content.js` の `DAIUN_CYCLE_THEME` を **10天干 × 8サイクル = 80セル** に再構造化
  - 例：`DAIUN_CYCLE_THEME['己'][3]` = 「収穫の畝が並ぶ成果期。育ててきた人や事業が、目に見える実りとして並び始める。」
- `app.js` の `daiunCard(c)` を新構造対応 + 旧構造フォールバック
  - `themes[dayStemName][i]` を最優先、無ければ `themes[i]` にフォールバック

### Phase D：実行体制の整備
- リポジトリ直下に `.gitignore` を新設（`.DS_Store` `node_modules/` `*.log` `.vscode/` `.idea/`）
- `git init` 実施 → 初回コミット作成
- `app.js` に **URLパラメータ ?preset=NAME による開発用テストプリセット** を実装
  - 5プリセット：`satoh`（佐藤花子1971/5/4） `tanaka`（田中美咲1980/3/15） `yamada`（山田優子1965/11/22） `suzuki`（鈴木綾子1972/8/8） `kato`（加藤真理子1958/7/30）
  - 例：`https://tanaka58091-alt.github.io/miryoku--kaika/?preset=satoh`
  - 入力フォームへ自動入力 → 「この情報で診断する」を押すだけで全カテゴリ即確認可能
  - 検証作業の時間が 10分 → 30秒 程度に短縮

---

## アップロード対象（3 ファイル）

| ローカル | GitHub 上の場所 | 行数 | 内容 |
|---|---|---|---|
| `assets/js/content.js` | `assets/js/` | **約5,165行**（旧4,201行） | HIZUMI 27 / ROADMAP 40 / DAIUN 80 |
| `assets/js/app.js` | `assets/js/` | 約3,027行 | hizumiIndexOf / renderCat7 / daiunCard / テストプリセット |
| `index.html` | リポジトリ直下 | — | scripts を `?v=18` に更新 |

---

## 手順（3ファイルとも同じ流れ）

> ⚠️ **Chrome翻訳がHTMLタグを壊す問題があるため、必ず `pbcopy` で生ファイルをコピーすること。**
> ⚠️ **`content.js` は約5,165行と巨大なので、コピー後 GitHub Web UI で全選択削除 → ペーストするとき少し待ち時間が出ます。**

### A. `assets/js/content.js`
1. ターミナルで：
   ```bash
   cat ~/Desktop/AIフォルダまとめ/新占いサイト/assets/js/content.js | pbcopy
   ```
2. GitHub Web UI で `assets/js/content.js` を開く → 鉛筆アイコン → 中身を全選択 → 削除 → ペースト
3. `Commit changes` → コミットメッセージ：`data: expand HIZUMI 9→27 / ROADMAP 4→40 / DAIUN 8→80`

### B. `assets/js/app.js`
1. `cat ~/Desktop/AIフォルダまとめ/新占いサイト/assets/js/app.js | pbcopy`
2. GitHub Web UI で `assets/js/app.js` を開く → 編集 → 全置換
3. コミットメッセージ：`app: hizumiIndexOf 27分岐 + renderCat7/daiunCard 新構造対応 + test preset`

### C. `index.html`
1. `cat ~/Desktop/AIフォルダまとめ/新占いサイト/index.html | pbcopy`
2. GitHub Web UI で `index.html` を開く → 編集 → 全置換
3. コミットメッセージ：`html: scripts ?v=18`

---

## 反映確認

GitHub Actions が完了したら（通常1〜2分）以下を確認：

1. `https://tanaka58091-alt.github.io/miryoku--kaika/` を **シークレットウィンドウで開く**
2. 開発者ツール → Network タブで `app.js?v=18` `content.js?v=18` などのバージョンが揃っているか
3. **テストプリセットで効率検証**：
   - `https://tanaka58091-alt.github.io/miryoku--kaika/?preset=satoh` を開く
   - 「この情報で診断する」を押す
   - 各カテゴリへ進み、以下を確認
4. **cat1（先天性）→ 大運カード**：8サイクル全てに固有の文言（佐藤花子は己日干 → 「土を耕す／畑となる／田んぼとして実りを支える…」）が表示されるか
5. **cat3（心の歪み診断）**：27タイプから個別判定されているか（佐藤花子 → 「未来不安先回りタイプ」と命式根拠 hook が出るか）
6. **cat7（人生ロードマップ）**：
   - ULTIMATE CORE の「命式キー」「人生のテーマ」「3ヶ月後」「1年後」が命式に応じて動的生成されるか
   - 下段の ROADMAP は「土の人として生きるロードマップ」ではなく **エレメント × 日干** で 40パターンから引かれるか（己×土なら「肥沃な土壌として、人と物を育て続ける」等）
7. **異なる preset で再検証**：`?preset=tanaka` `?preset=yamada` 等で同じLPの人でも歪みタイプが分かれるか確認

---

## 既知の限界

- **日命星**：甲子日アンカーの暦が未実装のため、年内通日からの近似で陽遁/陰遁を判定
- **アセンダント**：県庁所在地ベースなので同一県内の市町村差は無視
- **姓名判断**：辞書外の漢字は10画フォールバック（2,180字を超える例外的な人名漢字）
- **HIZUMI 27 → 81**：理論的にはライフパス9 × エレメント3 × 日干奇偶2 = 54、または各軸で更に細分も可能。今回は27で打ち止め（過剰個別化はかえって読み手が消化できない）
- **DAIUN 80**：地支による分岐は未実装（現状は天干 × サイクル番号のみ）

---

## v=17 → v=18 の対比

| 項目 | v=17 | v=18 |
|---|---|---|
| `HIZUMI` タイプ数 | 9 | **27** |
| `ROADMAP` パターン数 | 4（エレメントのみ） | **40（エレメント × 天干）** |
| `DAIUN_CYCLE_THEME` セル数 | 8 | **80（天干 × サイクル）** |
| 開発用テストプリセット | なし | **5プリセット（URLパラメータ）** |
| git 管理 | 未初期化 | **`git init` + `.gitignore` 済み** |
| `content.js` 行数 | 約4,201 | 約5,165 |
