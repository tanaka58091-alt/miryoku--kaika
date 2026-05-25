/* ============================================================
   photo-analysis.js — 写真のブラウザ内簡易解析
   - お顔・手のひら写真の dataURL を受け取り、画像統計を抽出
   - 抽出した特徴 + 生年月日 をハッシュ化して PALM/FACE DB の
     最も適したエントリを「占術として」マッピング
   - 外部APIには一切送信しない（完全ローカル処理 = 課金ゼロ）
   ============================================================ */
(function (global) {
  'use strict';

  // ----------------------------------------------------------------
  // 画像の特徴抽出
  //   - dataURL → canvas で 64×64 にリサイズ
  //   - 平均輝度 / 平均彩度 / コントラスト / 縦長度 / RGB平均 を取得
  // ----------------------------------------------------------------
  function extractFeatures(dataUrl) {
    return new Promise((resolve, reject) => {
      if (!dataUrl) return resolve(null);
      const img = new Image();
      img.onload = () => {
        try {
          const W = 64, H = 64;
          const canvas = document.createElement('canvas');
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, W, H);
          const data = ctx.getImageData(0, 0, W, H).data;

          let r = 0, g = 0, b = 0, lum = 0, lumSq = 0;
          let symLeftR = 0, symRightR = 0;
          let centerLum = 0, edgeLum = 0;
          let centerCount = 0, edgeCount = 0;
          const n = W * H;

          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              const pr = data[i], pg = data[i+1], pb = data[i+2];
              r += pr; g += pg; b += pb;
              const l = 0.299 * pr + 0.587 * pg + 0.114 * pb;
              lum += l; lumSq += l * l;
              if (x < W / 2) symLeftR += pr; else symRightR += pr;
              const dx = x - W/2, dy = y - H/2;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < W/4) { centerLum += l; centerCount++; }
              else if (dist > W/3) { edgeLum += l; edgeCount++; }
            }
          }
          const avgR = r / n, avgG = g / n, avgB = b / n;
          const avgLum = lum / n;
          const variance = (lumSq / n) - (avgLum * avgLum);
          const stdDev = Math.sqrt(Math.max(0, variance));
          const symmetry = 1 - Math.abs(symLeftR - symRightR) / (symLeftR + symRightR + 1);
          // 彩度（HSVのS相当）
          const maxC = Math.max(avgR, avgG, avgB);
          const minC = Math.min(avgR, avgG, avgB);
          const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
          // 中央/外周の明度比（明るい中央 = 顔の中心が明るい 等）
          const centerBrightness = centerCount > 0 ? centerLum / centerCount : avgLum;
          const edgeBrightness = edgeCount > 0 ? edgeLum / edgeCount : avgLum;

          // 画像のアスペクト比（元画像）
          const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);

          resolve({
            avgR, avgG, avgB,
            avgLum,
            stdDev,             // コントラスト
            symmetry,           // 左右対称性 0〜1
            saturation,         // 彩度 0〜1
            centerBrightness,
            edgeBrightness,
            centerEdgeRatio: centerBrightness / (edgeBrightness + 1),
            aspect
          });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = dataUrl;
    });
  }

  // ----------------------------------------------------------------
  // ハッシュ生成（生年月日 + 画像特徴 → 安定したインデックス）
  //   同じ写真 + 同じ生年月日 = 必ず同じ結果
  //   写真や生年月日が違えば違う結果
  // ----------------------------------------------------------------
  function hashFeatures(features, y, m, d, salt) {
    if (!features) {
      // 写真なし → 生年月日のみのフォールバック
      return Math.abs((y * 372 + m * 31 + d + (salt || 0)) | 0);
    }
    const f = features;
    // 各特徴を整数化して合計
    const ints = [
      Math.round(f.avgR), Math.round(f.avgG), Math.round(f.avgB),
      Math.round(f.avgLum * 7),
      Math.round(f.stdDev * 5),
      Math.round(f.symmetry * 100),
      Math.round(f.saturation * 100),
      Math.round(f.centerEdgeRatio * 50),
      Math.round(f.aspect * 100),
      y, m * 31, d, (salt || 0)
    ];
    // FNV-1a風シンプルハッシュ
    let h = 2166136261;
    for (let i = 0; i < ints.length; i++) {
      h ^= ints[i];
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  // ----------------------------------------------------------------
  // 手相タイプを推定
  // ----------------------------------------------------------------
  function analyzePalm(dataUrl, y, m, d) {
    return extractFeatures(dataUrl).then(feat => {
      const PALM = (global.CONTENT_DATA && global.CONTENT_DATA.PALM) || [];
      if (!PALM.length) return null;
      const h = hashFeatures(feat, y, m, d, 17);
      const idx = h % PALM.length;
      return {
        index: idx,
        type: PALM[idx],
        features: feat,
        hasPhoto: !!feat,
        readings: buildPalmReadings(feat) // 観察ポイント
      };
    }).catch(() => null);
  }

  // ----------------------------------------------------------------
  // 人相タイプを推定
  // ----------------------------------------------------------------
  function analyzeFace(dataUrl, y, m, d) {
    return extractFeatures(dataUrl).then(feat => {
      const FACE = (global.CONTENT_DATA && global.CONTENT_DATA.FACE) || [];
      if (!FACE.length) return null;
      const h = hashFeatures(feat, y, m, d, 41);
      const idx = h % FACE.length;
      return {
        index: idx,
        type: FACE[idx],
        features: feat,
        hasPhoto: !!feat,
        readings: buildFaceReadings(feat)
      };
    }).catch(() => null);
  }

  // ----------------------------------------------------------------
  // 手相の観察コメント（画像統計から推定）
  // ----------------------------------------------------------------
  function buildPalmReadings(f) {
    if (!f) return [];
    const out = [];
    // 明度
    if (f.avgLum > 165) {
      out.push('手のひらの色が明るく血色が良い → エネルギーが充実している時期');
    } else if (f.avgLum < 110) {
      out.push('手のひらの色がやや沈んでいる → 休息と栄養補給をおすすめ');
    } else {
      out.push('手のひらの色は標準的 → バランスの取れたエネルギー状態');
    }
    // コントラスト（線の濃さ）
    if (f.stdDev > 55) {
      out.push('掌線がはっきり濃く出ている → 人生のテーマが明確で実行力が強い');
    } else if (f.stdDev < 30) {
      out.push('掌線が淡く繊細 → 直感型・感受性豊かなタイプ');
    } else {
      out.push('掌線の濃淡は中庸 → 柔軟に道を選べるバランス型');
    }
    // 彩度（血色）
    if (f.saturation > 0.25) {
      out.push('血色が良く生命力に満ちている → 健康運・実行運が好調');
    } else {
      out.push('落ち着いた色味 → 内省と整理整頓が運気を高める時期');
    }
    return out;
  }

  // ----------------------------------------------------------------
  // 人相の観察コメント
  // ----------------------------------------------------------------
  function buildFaceReadings(f) {
    if (!f) return [];
    const out = [];
    if (f.symmetry > 0.92) {
      out.push('顔の左右対称性が高い → 古来「整った顔」は徳と調和の象徴とされる吉相');
    } else if (f.symmetry < 0.80) {
      out.push('顔に味わいのある非対称性 → 個性と表現力で人を惹きつけるアーティスト相');
    } else {
      out.push('左右のバランスは健康的 → 内面の安定が顔に表れている');
    }
    if (f.centerEdgeRatio > 1.10) {
      out.push('顔の中心部が明るい → 内側からの輝きを持つ「内光の相」');
    } else if (f.centerEdgeRatio < 0.95) {
      out.push('顔の輪郭部が引き締まっている → 意志の強さと持続力を示す相');
    }
    if (f.saturation > 0.20) {
      out.push('血色が良くツヤがある → 運気が活性化している時期');
    } else {
      out.push('落ち着いた肌色 → 静かに力を蓄えている時期');
    }
    return out;
  }

  // ----------------------------------------------------------------
  // 公開API
  // ----------------------------------------------------------------
  global.PhotoAnalysis = {
    extractFeatures: extractFeatures,
    analyzePalm: analyzePalm,
    analyzeFace: analyzeFace
  };
})(typeof window !== 'undefined' ? window : globalThis);
