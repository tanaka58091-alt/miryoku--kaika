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
  // 画質チェック
  //   暗すぎ / 明るすぎ / 平坦すぎる画像は、観察の材料として使えない。
  //   無理に読まず再撮影を案内するための判定（v=26）。
  // ----------------------------------------------------------------
  function checkQuality(f) {
    if (!f) return null;
    const issues = [];
    if (f.avgLum < 60) issues.push('全体が暗めです。明るい場所や自然光の下で撮り直すと、より読み取りやすくなります');
    if (f.avgLum > 225) issues.push('光が強すぎて白飛びぎみです。直射日光やフラッシュを避けて撮ると、より読み取りやすくなります');
    if (f.stdDev < 12) issues.push('陰影がほとんど無く、輪郭や線を見分けにくい状態です。ピントを合わせて撮り直すと、より読み取りやすくなります');
    return issues.length ? issues : null;
  }

  // ----------------------------------------------------------------
  // 手相の観察コメント
  //   写真から取得しているのは「明るさ・陰影の強さ・色みの鮮やかさ」のみ。
  //   掌線そのものを検出しているわけではないため、断定ではなく
  //   「ご自身で観察するための手がかり」として提示する。
  // ----------------------------------------------------------------
  function buildPalmReadings(f) {
    if (!f) return [];
    const q = checkQuality(f);
    if (q) return q.map(t => '【撮影のヒント】' + t);
    const out = [];
    if (f.avgLum > 165) {
      out.push('写真全体が明るめに写っています。手のひらに明るさがある時期は、活動量を増やしやすいタイミングと読みます');
    } else if (f.avgLum < 110) {
      out.push('写真全体が落ち着いた明るさです。占術では「蓄える時期」と読みます。実際にお疲れが続く場合は休息を優先してください');
    } else {
      out.push('明るさは標準的です。占術では「バランスの取れた状態」と読みます');
    }
    if (f.stdDev > 55) {
      out.push('陰影がはっきり出ています。手のひらを実際にご覧になって、主要な線がくっきり刻まれているか確かめてみてください。線が明瞭な手は「テーマが定まっている手」と読みます');
    } else if (f.stdDev < 30) {
      out.push('陰影がやわらかく写っています。細く繊細な線が多い手は「感じ取る力で選ぶ手」と読みます。ご自身の手で確かめてみてください');
    } else {
      out.push('陰影は中間的です。線の濃淡が入り混じる手は「状況に応じて選び方を変えられる手」と読みます');
    }
    if (f.saturation > 0.25) {
      out.push('色みが鮮やかに写っています。占術では血色の良さを「動きやすい時期」と結びつけて読みます');
    } else {
      out.push('色みは落ち着いています。占術では「整える時期」と結びつけて読みます');
    }
    return out;
  }

  // ----------------------------------------------------------------
  // 人相の観察コメント
  //   ※ 人格・健康状態・能力の断定には用いない。
  // ----------------------------------------------------------------
  function buildFaceReadings(f) {
    if (!f) return [];
    const q = checkQuality(f);
    if (q) return q.map(t => '【撮影のヒント】' + t);
    const out = [];
    if (f.symmetry > 0.92) {
      out.push('写真の左右のバランスが整っています。人相では均整を「調和を大切にする印象」と読みます');
    } else if (f.symmetry < 0.80) {
      out.push('左右に個性のある写り方です。人相では非対称を「表情の豊かさ・印象の強さ」と読みます（写真の角度でも変わります）');
    } else {
      out.push('左右のバランスは自然な範囲です。人相では「落ち着いた印象を与える」と読みます');
    }
    if (f.centerEdgeRatio > 1.10) {
      out.push('顔の中心が明るく写っています。人相では中心の明るさを「表情が届きやすい印象」と読みます');
    } else if (f.centerEdgeRatio < 0.95) {
      out.push('輪郭側がはっきり写っています。人相では輪郭の明瞭さを「意志が伝わりやすい印象」と読みます');
    }
    if (f.saturation > 0.20) {
      out.push('色みが鮮やかに写っています。人相ではツヤを「人と会う機会に恵まれやすい時期」と読みます');
    } else {
      out.push('色みは落ち着いています。人相では「内側に力を蓄える時期」と読みます');
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
