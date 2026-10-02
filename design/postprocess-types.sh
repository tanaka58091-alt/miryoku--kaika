#!/bin/bash
# types の PNG → 表示用 JPEG（本体）＋一覧用サムネイル。元 PNG は design/raw/types/ へ退避（削除しない）
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p design/raw/types assets/img/types/thumb
n=0
for png in assets/img/types/*.png; do
  [ -f "$png" ] || continue
  # 書き込み中のファイルに触れないよう、更新から20秒以上経ったものだけ処理する
  age=$(( $(date +%s) - $(stat -f %m "$png") )); [ "$age" -lt 20 ] && continue
  name="$(basename "${png%.png}")"
  if [ "${name#_hero}" != "$name" ]; then   # _hero-* は横長のまま（サムネイルなし）
    w=$(sips -g pixelWidth "$png" | awk '/pixelWidth/{print $2}'); if [ "$w" -gt 1600 ]; then sips -s format jpeg -s formatOptions 80 -Z 1600 "$png" --out "assets/img/types/${name}.jpg" >/dev/null 2>&1; else sips -s format jpeg -s formatOptions 80 "$png" --out "assets/img/types/${name}.jpg" >/dev/null 2>&1; fi
  else
    sips -s format jpeg -s formatOptions 82 -z 1000 800 "$png" --out "assets/img/types/${name}.jpg" >/dev/null 2>&1
    sips -s format jpeg -s formatOptions 78 -z 300 240 "$png" --out "assets/img/types/thumb/${name}.jpg" >/dev/null 2>&1
  fi
  mv "$png" "design/raw/types/${name}.png"
  n=$((n+1))
done
echo "変換 $n 件 / 本体 $(ls assets/img/types/*.jpg 2>/dev/null | wc -l | tr -d ' ') 枚 / サムネ $(ls assets/img/types/thumb/*.jpg 2>/dev/null | wc -l | tr -d ' ') 枚"
