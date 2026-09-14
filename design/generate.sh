#!/bin/bash
# 多角的占い診断 — Codex CLI 画像一括生成（レジューム対応）
#
# 使い方:
#   bash design/generate.sh            # 未生成のものを優先度順に生成
#   bash design/generate.sh 3          # 先頭3件だけ生成（枠を節約したいとき）
#   DRYRUN=1 bash design/generate.sh   # 実行計画のみ表示
#
# 仕様:
#   - 既に assets/img/<名前>.png があるものはスキップ（レジューム）
#   - 1枚ずつ逐次実行（並列は品質が落ちるため）
#   - 利用枠上限に当たったら、そこで停止して残りを表示
set -u
cd "$(dirname "$0")/.." || exit 1

CODEX="$(command -v codex || true)"
[ -z "$CODEX" ] && CODEX="$HOME/.npm-global/bin/codex"
if [ ! -x "$CODEX" ]; then
  echo "❌ codex CLI が見つかりません。npm install -g @openai/codex" >&2; exit 1
fi

# 優先度順（上から生成される）
ORDER=(
  hero-key-visual
  report-cover
  gate-background
  menu-motif-01 menu-motif-02 menu-motif-03 menu-motif-04
  menu-motif-05 menu-motif-06 menu-motif-07
  compat-visual
)

LIMIT="${1:-999}"
mkdir -p assets/img
done_n=0; skip_n=0; fail_n=0; remain=()

for name in "${ORDER[@]}"; do
  prompt="design/prompts/${name}.txt"
  [ -f "$prompt" ] || { echo "⚠️  プロンプトなし: $name"; continue; }
  if [ -f "assets/img/${name}.png" ] || [ -f "assets/img/${name}.jpg" ] || [ -f "design/raw/${name}.png" ]; then
    echo "⏭  生成済みskip: $name"; skip_n=$((skip_n+1)); continue
  fi
  if [ "$done_n" -ge "$LIMIT" ]; then remain+=("$name"); continue; fi

  echo "🎨 生成中: $name"
  if [ "${DRYRUN:-0}" = "1" ]; then echo "   (DRYRUN)"; done_n=$((done_n+1)); continue; fi

  out="$("$CODEX" exec --skip-git-repo-check --sandbox workspace-write "$(cat "$prompt")" 2>&1)"
  if echo "$out" | grep -q "usage limit"; then
    echo "🛑 ChatGPTの利用枠上限に達しました。時間をおいて再実行してください。"
    echo "$out" | grep -o "try again at.*" | head -1
    remain+=("$name"); break
  fi
  if [ -f "assets/img/${name}.png" ]; then
    echo "✅ 完了: assets/img/${name}.png"; done_n=$((done_n+1))
  else
    echo "❌ 生成されませんでした: $name"; fail_n=$((fail_n+1)); remain+=("$name")
  fi
done

echo
echo "──────────────────────"
echo "生成 $done_n 件 / skip $skip_n 件 / 失敗 $fail_n 件"
if [ "${#remain[@]}" -gt 0 ]; then
  echo "未生成: ${remain[*]}"
  echo "→ 枠が回復したら再度 bash design/generate.sh を実行すれば続きから生成します"
fi
