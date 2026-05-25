/* ============================================================
   ephemeris.js — 天体位置計算（精密版）
   Paul Schlyter / Meeus 簡略式に基づく地心黄経計算。
   ・全てクライアントサイドの純計算。外部通信なし。
   ・1900〜2100年で約 ±0.5° 以内の精度（星座判定は確実）
   ============================================================ */

(function (global) {
  'use strict';

  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;

  function norm360(x) {
    x = x % 360;
    if (x < 0) x += 360;
    return x;
  }

  // ユリウス日（UT 0時基準、Gregorian 暦）
  function julianDay(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716))
         + Math.floor(30.6001 * (m + 1))
         + d + B - 1524.5;
  }

  // ケプラー方程式 E - e*sinE = M を解く（M はラジアン入力）
  function solveKepler(Mdeg, e) {
    const M = Mdeg * D2R;
    let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (let i = 0; i < 8; i++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-10) break;
    }
    return E;
  }

  // Schlyter 平均要素：d=0 は 1999-12-31 0h UT（JD = 2451543.5）
  // 要素: N=昇交点経度, i=軌道傾斜, w=近日点引数, a=軌道長半径, e=離心率, M=平均近点角
  function planetElements(name, d) {
    switch (name) {
      case 'sun':
        return {
          N: 0,
          i: 0,
          w: 282.9404 + 4.70935e-5 * d,
          a: 1.0,
          e: 0.016709 - 1.151e-9 * d,
          M: 356.0470 + 0.9856002585 * d
        };
      case 'moon':
        return {
          N: 125.1228 - 0.0529538083 * d,
          i: 5.1454,
          w: 318.0634 + 0.1643573223 * d,
          a: 60.2666,
          e: 0.054900,
          M: 115.3654 + 13.0649929509 * d
        };
      case 'mercury':
        return {
          N: 48.3313 + 3.24587e-5 * d,
          i: 7.0047 + 5.00e-8 * d,
          w: 29.1241 + 1.01444e-5 * d,
          a: 0.387098,
          e: 0.205635 + 5.59e-10 * d,
          M: 168.6562 + 4.0923344368 * d
        };
      case 'venus':
        return {
          N: 76.6799 + 2.46590e-5 * d,
          i: 3.3946 + 2.75e-8 * d,
          w: 54.8910 + 1.38374e-5 * d,
          a: 0.723330,
          e: 0.006773 - 1.302e-9 * d,
          M: 48.0052 + 1.6021302244 * d
        };
      case 'mars':
        return {
          N: 49.5574 + 2.11081e-5 * d,
          i: 1.8497 - 1.78e-8 * d,
          w: 286.5016 + 2.92961e-5 * d,
          a: 1.523688,
          e: 0.093405 + 2.516e-9 * d,
          M: 18.6021 + 0.5240207766 * d
        };
      case 'jupiter':
        return {
          N: 100.4542 + 2.76854e-5 * d,
          i: 1.3030 - 1.557e-7 * d,
          w: 273.8777 + 1.64505e-5 * d,
          a: 5.20256,
          e: 0.048498 + 4.469e-9 * d,
          M: 19.8950 + 0.0830853001 * d
        };
      case 'saturn':
        return {
          N: 113.6634 + 2.38980e-5 * d,
          i: 2.4886 - 1.081e-7 * d,
          w: 339.3939 + 2.97661e-5 * d,
          a: 9.55475,
          e: 0.055546 - 9.499e-9 * d,
          M: 316.9670 + 0.0334442282 * d
        };
    }
    return null;
  }

  // 太陽中心の黄道直交座標 (xh, yh, zh)
  function helioRect(name, d) {
    const el = planetElements(name, d);
    if (!el) return null;
    const Mn = norm360(el.M);
    const E  = solveKepler(Mn, el.e);
    const xv = el.a * (Math.cos(E) - el.e);
    const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const v  = Math.atan2(yv, xv);
    const r  = Math.sqrt(xv * xv + yv * yv);
    const N = el.N * D2R, w = el.w * D2R, i = el.i * D2R;
    const xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
    const yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
    const zh = r *  Math.sin(v + w) * Math.sin(i);
    return { x: xh, y: yh, z: zh, r: r };
  }

  // 太陽の地心黄経（既存 calcSunSign を補完）
  function sunLongitude(d) {
    const el = planetElements('sun', d);
    const Mn = norm360(el.M);
    const E  = solveKepler(Mn, el.e);
    const xv = Math.cos(E) - el.e;
    const yv = Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const v  = Math.atan2(yv, xv) * R2D;
    return norm360(v + el.w);
  }

  // 太陽中心の地球位置 = -（太陽の地心位置）
  function earthHelioRect(d) {
    const el = planetElements('sun', d);
    const Mn = norm360(el.M);
    const E  = solveKepler(Mn, el.e);
    const xv = Math.cos(E) - el.e;
    const yv = Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const v  = Math.atan2(yv, xv) * R2D;
    const r  = Math.sqrt(xv * xv + yv * yv);
    const sunLon = (v + el.w) * D2R;
    // 地球の太陽中心位置 = -太陽の地心位置
    return { x: -r * Math.cos(sunLon), y: -r * Math.sin(sunLon), r: r };
  }

  // 月の地心黄経（主要摂動項込み）
  function moonLongitude(d) {
    const eM = planetElements('moon', d);
    const eS = planetElements('sun', d);
    const Mn = norm360(eM.M);
    const E  = solveKepler(Mn, eM.e);
    const xv = eM.a * (Math.cos(E) - eM.e);
    const yv = eM.a * Math.sqrt(1 - eM.e * eM.e) * Math.sin(E);
    const v  = Math.atan2(yv, xv);
    const r  = Math.sqrt(xv * xv + yv * yv);
    const N = eM.N * D2R, w = eM.w * D2R, i = eM.i * D2R;
    const xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
    const yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
    let lon = Math.atan2(yh, xh) * R2D;

    // 主要摂動（最大級の10項のみ）
    const Ls = norm360(eS.M + eS.w);            // 太陽の平均黄経
    const Lm = norm360(eM.M + eM.w + eM.N);     // 月の平均黄経
    const Ms = norm360(eS.M);
    const Mm = norm360(eM.M);
    const D  = norm360(Lm - Ls);
    lon += -1.274 * Math.sin((Mm - 2 * D) * D2R);
    lon +=  0.658 * Math.sin((2 * D) * D2R);
    lon += -0.186 * Math.sin(Ms * D2R);
    lon += -0.059 * Math.sin((2 * Mm - 2 * D) * D2R);
    lon += -0.057 * Math.sin((Mm - 2 * D + Ms) * D2R);
    lon +=  0.053 * Math.sin((Mm + 2 * D) * D2R);
    lon +=  0.046 * Math.sin((2 * D - Ms) * D2R);
    lon +=  0.041 * Math.sin((Mm - Ms) * D2R);
    lon += -0.035 * Math.sin(D * D2R);
    lon += -0.031 * Math.sin((Mm + Ms) * D2R);
    return norm360(lon);
  }

  // 惑星の地心黄経
  function planetLongitude(name, d) {
    const p  = helioRect(name, d);
    const eh = earthHelioRect(d);
    if (!p || !eh) return null;
    const xg = p.x - eh.x;
    const yg = p.y - eh.y;
    return norm360(Math.atan2(yg, xg) * R2D);
  }

  // 黄経 → 星座インデックス（0=牡羊...11=魚）
  function sign(longitude) {
    return Math.floor(norm360(longitude) / 30);
  }

  // 一括計算（出生時刻 hour を 0-24 で受ける。未指定なら正午）
  function allSigns(y, m, dom, hour) {
    const h = (hour != null && hour !== '' && !isNaN(parseFloat(hour))) ? parseFloat(hour) : 12;
    // 日本時間 → UT 換算: JST は UT+9
    const utHour = h - 9;
    const d = julianDay(y, m, dom) + utHour / 24 - 2451543.5;
    return {
      sun:     sign(sunLongitude(d)),
      moon:    sign(moonLongitude(d)),
      mercury: sign(planetLongitude('mercury', d)),
      venus:   sign(planetLongitude('venus', d)),
      mars:    sign(planetLongitude('mars', d)),
      jupiter: sign(planetLongitude('jupiter', d)),
      saturn:  sign(planetLongitude('saturn', d)),
      longitudes: {
        sun:     sunLongitude(d),
        moon:    moonLongitude(d),
        mercury: planetLongitude('mercury', d),
        venus:   planetLongitude('venus', d),
        mars:    planetLongitude('mars', d),
        jupiter: planetLongitude('jupiter', d),
        saturn:  planetLongitude('saturn', d)
      },
      _meta: { jd: d + 2451543.5 }
    };
  }

  global.Ephemeris = {
    julianDay: julianDay,
    sunLongitude: sunLongitude,
    moonLongitude: moonLongitude,
    planetLongitude: planetLongitude,
    sign: sign,
    allSigns: allSigns
  };
})(window);
