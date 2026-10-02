# MediaPipe Tasks Vision（同梱）

写真から手の21点・顔の478点を読み取るために使う、Google の端末内画像解析ライブラリ。
**写真はすべてブラウザの中（端末の中）で処理され、どこにも送信されない。**

| 項目 | 内容 |
|---|---|
| 名前 | @mediapipe/tasks-vision |
| 版 | 1.0.1（npm） |
| ライセンス | Apache License 2.0（`LICENSE`） |
| 著作権 | The MediaPipe Authors / Google LLC |
| モデル | `assets/models/hand_landmarker.task`・`face_landmarker.task`（MediaPipe 公式・Apache 2.0、float16/latest を取得） |

## 改変箇所（Apache 2.0 §4(b) の表示）
- `vision_bundle.mjs`：利用統計（使用回数や処理時間）を Google（odml.pa.googleapis.com）へ送る仕組みを無効化した。
  具体的には、統計を送るクラスの constructor で送信用タイマーを作らず、最初からエラー状態にして何も記録・送信しないようにした（1か所）。
- ソースマップの参照行を削除（ソースマップは同梱しない）。
- それ以外は npm 配布物のまま。`wasm/` の4ファイルは無改変。

## 更新するとき
1. `npm pack @mediapipe/tasks-vision` で取得し、`vision_bundle.mjs` と `wasm/vision_wasm_internal.*`・`wasm/vision_wasm_nosimd_internal.*` を置き換える
2. 上の改変を当て直す（`odml.pa.googleapis.com` を検索し、統計送信クラスの constructor を無効化）
3. `index.html` の CSP（connect-src 'self'）で、万一の外部通信も止まっていることを確認
