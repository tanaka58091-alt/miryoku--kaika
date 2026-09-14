#!/bin/bash
# 生成PNG → 表示用JPEG（長辺1600px以内・品質80）。元PNGは design/raw/ に退避（削除しない）
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p design/raw
n=0
for png in assets/img/*.png; do
  [ -f "$png" ] || continue
  name="$(basename "${png%.png}")"
  jpg="assets/img/${name}.jpg"
  sips -s format jpeg -s formatOptions 80 -Z 1600 "$png" --out "$jpg" >/dev/null 2>&1 || { echo "❌ 変換失敗: $name"; continue; }
  mv "$png" "design/raw/${name}.png"
  echo "✅ $jpg ($(du -h "$jpg" | cut -f1))"
  n=$((n+1))
done
echo "変換 $n 件"
