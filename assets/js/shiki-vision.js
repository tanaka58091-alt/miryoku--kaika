/* ============================================================
   shiki-vision.js — 写真から手と顔の点を読み取る（MediaPipe・端末の中だけ）
   ・MediaPipe（Google・Apache 2.0）をこのサイトの中から読み込む。外部には通信しない
     （利用統計の送信は assets/vendor/mediapipe で無効化。index.html の CSP でも外部通信を止めている）
   ・写真は画面の中で縮小して使うだけ。保存も送信もしない
   ============================================================ */
(function () {
  'use strict';
  const base = () => window.SHIKI_BASE || new URL('.', document.baseURI).href;   // サイトの一番上（検証用ページからは上書きできる）
  const PATHS = {
    bundle: 'assets/vendor/mediapipe/vision_bundle.mjs',
    wasm: 'assets/vendor/mediapipe/wasm',
    hand: 'assets/models/hand_landmarker.task',
    face: 'assets/models/face_landmarker.task'
  };
  // 読み込む量の目安（進みぐあいの表示用。実際の大きさが分かればそちらを使う）
  const SIZE = { simd: 11756954, nosimd: 10960242, hand: 7819105, face: 3758596 };

  let mpP = null, fsP = null;
  const taskP = {};

  function supported() {
    try { return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function' && !!document.createElement('canvas').getContext('2d'); }
    catch (_) { return false; }
  }
  const loadModule = () => (mpP || (mpP = import(base() + PATHS.bundle)));

  // 大きなファイルを、進みぐあいを知らせながら取得する
  async function fetchWithProgress(url, expect, onBytes) {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error('fetch ' + res.status + ' ' + url);
    const total = Number(res.headers.get('content-length')) || expect;
    if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); onBytes(b.length, total); return b; }
    const reader = res.body.getReader(), chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onBytes(got, total);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  // kind: 'hand' | 'face'。onProgress(0〜1)
  function load(kind, onProgress) {
    if (taskP[kind]) return taskP[kind];
    const report = onProgress || (() => {});
    taskP[kind] = (async () => {
      const mp = await loadModule();
      const simd = await mp.FilesetResolver.isSimdSupported().catch(() => false);
      const wasmName = simd ? 'vision_wasm_internal' : 'vision_wasm_nosimd_internal';
      const wasmSize = simd ? SIZE.simd : SIZE.nosimd;
      const needWasm = !fsP;
      const sizes = { wasm: needWasm ? wasmSize : 0, model: SIZE[kind] };
      const got = { wasm: 0, model: 0 };
      const tick = () => report(Math.min(0.99, (got.wasm + got.model) / ((sizes.wasm + sizes.model) || 1)));
      // 読み取りの部品（wasm）は、進みぐあいを表示しながら1回だけ取得し、その中身をそのまま MediaPipe に渡す
      //   （取得し直しによる二重のダウンロードを防ぐ。手相と人相の両方で使い回す）
      if (!fsP) {
        fsP = (async () => {
          const bytes = await fetchWithProgress(base() + PATHS.wasm + '/' + wasmName + '.wasm', wasmSize, (g, t) => { got.wasm = g; sizes.wasm = t; tick(); }).catch(() => null);
          if (bytes) {
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
            return { wasmLoaderPath: base() + PATHS.wasm + '/' + wasmName + '.js', wasmBinaryPath: url };
          }
          return mp.FilesetResolver.forVisionTasks(base() + PATHS.wasm);
        })();
        fsP.catch(() => { fsP = null; });
      }
      const modelP = fetchWithProgress(base() + PATHS[kind], SIZE[kind], (g, t) => { got.model = g; sizes.model = t; tick(); });
      const fileset = await fsP;
      const model = await modelP;
      const baseOptions = { modelAssetBuffer: model, delegate: 'CPU' };
      const t = kind === 'hand'
        ? await mp.HandLandmarker.createFromOptions(fileset, { baseOptions, runningMode: 'IMAGE', numHands: 1, minHandDetectionConfidence: 0.35, minHandPresenceConfidence: 0.35 })
        : await mp.FaceLandmarker.createFromOptions(fileset, { baseOptions, runningMode: 'IMAGE', numFaces: 1, minFaceDetectionConfidence: 0.35, minFacePresenceConfidence: 0.35, outputFacialTransformationMatrixes: true });
      report(1);
      return t;
    })();
    taskP[kind].catch(() => { taskP[kind] = null; });
    return taskP[kind];
  }

  // 写真ファイルを、向きを直して縮小したキャンバスにする
  //   先に <img> で開く（スマホの写真の「縦向き・横向き」の情報を、どのブラウザでも正しく反映するため）。
  //   開けなかったときだけ createImageBitmap を使う
  async function readImage(file, maxSide) {
    const lim = maxSide || 1800;
    let src = null;
    const url = URL.createObjectURL(file);
    try {
      src = await new Promise((res, rej) => {
        const im = new Image();
        const timer = setTimeout(() => rej(new Error('image timeout')), 12000);
        im.onload = () => { clearTimeout(timer); res(im); };    // decode() は画面が裏に回ると止まることがあるので使わない
        im.onerror = () => { clearTimeout(timer); rej(new Error('image')); };
        im.src = url;
      });
    } catch (_) {
      src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    }
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const sc = Math.min(1, lim / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    URL.revokeObjectURL(url);
    return c;
  }

  async function detectHand(canvas) {
    const t = await load('hand');
    const r = t.detect(canvas);
    if (!r || !r.landmarks || !r.landmarks.length) return null;
    const cat = (r.handedness && r.handedness[0] && r.handedness[0][0]) || null;
    return { lm: r.landmarks[0].map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height, z: p.z * canvas.width })), handedness: cat && cat.categoryName, score: cat ? cat.score : 0 };
  }
  async function detectFace(canvas) {
    const t = await load('face');
    const r = t.detect(canvas);
    if (!r || !r.faceLandmarks || !r.faceLandmarks.length) return null;
    const m = r.facialTransformationMatrixes && r.facialTransformationMatrixes[0];
    return { lm: r.faceLandmarks[0].map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height, z: p.z * canvas.width })), matrix: m ? Array.from(m.data) : null };
  }

  window.ShikiVision = { supported, load, readImage, detectHand, detectFace };
})();
