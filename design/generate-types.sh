#!/bin/bash
# 四季の40タイプ＋トップ画像を Codex CLI で生成する（レジューム対応・逐次）
# 使い方: bash design/generate-types.sh      未生成分を生成
#         DRYRUN=1 bash design/generate-types.sh
set -u
cd "$(dirname "$0")/.." || exit 1
CODEX="$(command -v codex || true)"; [ -z "$CODEX" ] && CODEX="$HOME/.npm-global/bin/codex"
[ -x "$CODEX" ] || { echo "❌ codex CLI が見つかりません"; exit 1; }
mkdir -p assets/img/types design/raw/types
# 試験用の「春の灯火」を最初に、次にトップ画像、その後は日干×季節の順
ORDER=(hinoto-spring _hero-seasons _hero-palm _hero-face)
for s in kinoe kinoto hinoe hinoto tsuchinoe tsuchinoto kanoe kanoto mizunoe mizunoto; do
  for q in spring summer autumn winter; do
    [ "$s-$q" = "hinoto-spring" ] && continue
    ORDER+=("$s-$q")
  done
done
done_n=0; skip_n=0; fail_n=0; remain=()
for name in "${ORDER[@]}"; do
  prompt="design/prompts/types/${name}.txt"
  [ -f "$prompt" ] || { echo "⚠️ プロンプトなし: $name"; continue; }
  if [ -f "assets/img/types/${name}.jpg" ] || [ -f "design/raw/types/${name}.png" ] || [ -f "assets/img/types/${name}.png" ]; then
    skip_n=$((skip_n+1)); continue
  fi
  echo "🎨 生成中: $name"
  [ "${DRYRUN:-0}" = "1" ] && { done_n=$((done_n+1)); continue; }
  out="$("$CODEX" exec --skip-git-repo-check --sandbox workspace-write "$(cat "$prompt")" 2>&1)"
  if echo "$out" | grep -qi "usage limit"; then
    echo "🛑 利用枠の上限に達しました"; echo "$out" | grep -o "try again at.*" | head -1
    remain+=("$name"); break
  fi
  if [ -f "assets/img/types/${name}.png" ]; then
    echo "✅ 完了: $name"; done_n=$((done_n+1))
  else
    echo "❌ 生成されませんでした: $name"; fail_n=$((fail_n+1)); remain+=("$name")
  fi
done
echo "生成 $done_n 件 / skip $skip_n 件 / 失敗 $fail_n 件"
[ "${#remain[@]}" -gt 0 ] && echo "未生成: ${remain[*]}"
exit 0
