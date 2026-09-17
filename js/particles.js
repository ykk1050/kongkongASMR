/* =============================================================
 *  소리 콩콩 — 파티클 / 소리 시각화 시스템
 *  모든 소리는 대응하는 시각 효과를 가진다(재질별 색·모양이 일치).
 *  파티클은 격자 좌표(gx,gy,gz)에 살고, 렌더 시 아이소 투영된다.
 * ============================================================= */
window.SK = window.SK || {};

SK.Particles = (function () {
  var list = [];
  var MAX = 460;
  var project = null; // main/game에서 주입: (gx,gy,gz) -> {x,y}

  /** 격자→화면 투영 함수 주입 (타일 간격이 반영된 좌표계) */
  function setProjector(fn) { project = fn; }

  function push(p) {
    if (list.length >= MAX) list.shift();
    p.age = 0;
    list.push(p);
    return p;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- 재질별 시각 팔레트 (audio.js의 재질 키와 1:1) ---------- */
  var PALETTE = {
    keycap: { hue: 232, light: 86, ring: 'rgba(223,228,255,', word: '톡', fx: 'press' },
    cotton: { hue: 336, light: 88, ring: 'rgba(255,201,222,', word: '포옥', fx: 'puff' },
    jelly: { hue: 156, light: 76, ring: 'rgba(142,240,192,', word: '통', fx: 'jiggle' },
    leaf: { hue: 32, light: 66, ring: 'rgba(255,178,103,', word: '바스락', fx: 'leafFly' },
    bubble: { hue: 196, light: 82, ring: 'rgba(168,232,255,', word: '뽁', fx: 'pop' },
    wood: { hue: 30, light: 76, ring: 'rgba(232,201,160,', word: '탁', fx: 'thud' },
    slime: { hue: 266, light: 80, ring: 'rgba(217,196,255,', word: '찌걱', fx: 'goo' },
    orbeez: { hue: 336, light: 82, ring: 'rgba(255,208,230,', word: '톡톡', fx: 'balls' },
    sand: { hue: 42, light: 78, ring: 'rgba(255,238,194,', word: '사각', fx: 'grain' },
    glass: { hue: 196, light: 88, ring: 'rgba(232,250,255,', word: '챠랑', fx: 'sparkleRing' },
    snow: { hue: 205, light: 96, ring: 'rgba(255,255,255,', word: '뽀득', fx: 'flake' },
    sponge: { hue: 44, light: 78, ring: 'rgba(255,240,189,', word: '뽀드득', fx: 'squeeze' },
    water: { hue: 196, light: 84, ring: 'rgba(191,239,255,', word: '찰방', fx: 'splash' },
    gravel: { hue: 220, light: 74, ring: 'rgba(216,220,228,', word: '자그락', fx: 'pebbles' },
    cookie: { hue: 30, light: 70, ring: 'rgba(255,211,154,', word: '바삭', fx: 'crumbs' },
    foam: { hue: 60, light: 94, ring: 'rgba(255,255,244,', word: '끼익', fx: 'creak' },
    paper: { hue: 44, light: 88, ring: 'rgba(255,244,210,', word: '구깃', fx: 'crinkle' },
    ice: { hue: 194, light: 90, ring: 'rgba(234,252,255,', word: '쩌억', fx: 'fracture' }
  };
  function pal(mat) { return PALETTE[mat] || PALETTE.wood; }

  /* =========================================================
   *  생성기 — 각 함수는 특정 사운드와 짝을 이룬다
   * ======================================================= */

  /**
   * 착지음과 동시에 터지는 "소리 파문".
   * 강도가 클수록 링이 크고 밝으며 먼지도 많아진다.
   */
  function stepBurst(gx, gy, mat, intensity, power) {
    var P = pal(mat);
    var s = 0.55 + intensity * 0.9;

    // 공통 — 소리에 맞춰 퍼지는 파문
    ring(gx, gy, {
      size: (74 + intensity * 90) * (power > 1 ? 1.5 : 1),
      life: 0.42 + intensity * 0.2, width: 3 + intensity * 3,
      color: P.ring
    });
    if (power > 1) {
      ring(gx, gy, { size: 190, life: 0.62, width: 2, color: 'rgba(255,255,255,' });
      ring(gx, gy, { size: 300, life: 0.8, width: 1.5, color: P.ring });
    }

    // 재질 고유의 임팩트 — 밟는 느낌이 눈으로도 보여야 한다
    IMPACT[P.fx](gx, gy, P, intensity, power, s);
  }

  /* ---------- 재질별 임팩트 연출 ---------- */
  var IMPACT = {

    /* 단단한 것: 먼지가 낮게 튄다 */
    press: function (gx, gy, P, i, power, s) {
      var n = 4 + Math.round(i * 6);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832;
        push({
          type: 'dot', gx: gx, gy: gy, gz: 0.03,
          vx: Math.cos(a) * 0.014 * s, vy: Math.sin(a) * 0.014 * s, vz: rnd(0.2, 0.9) * 0.012,
          gravity: -0.05, life: rnd(0.3, 0.6), size: rnd(1.8, 4),
          color: 'hsla(' + P.hue + ',70%,' + P.light + '%,', alpha: 0.5
        });
      }
    },

    /* 푹신한 것: 부드러운 구름이 부풀어 오른다 */
    puff: function (gx, gy, P, i, power, s) {
      var n = 3 + Math.round(i * 4);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832;
        push({
          type: 'puff', gx: gx, gy: gy, gz: 0.04,
          vx: Math.cos(a) * 0.009 * s, vy: Math.sin(a) * 0.009 * s, vz: rnd(0.3, 0.7) * 0.012,
          gravity: -0.02, life: rnd(0.5, 0.9), size: rnd(9, 18),
          color: 'hsla(' + P.hue + ',80%,' + P.light + '%,', alpha: 0.45
        });
      }
    },

    /* 탄력 있는 것: 잔상 링이 연달아 퍼진다 */
    jiggle: function (gx, gy, P, i, power, s) {
      for (var k = 0; k < 3; k++) {
        ring(gx, gy, {
          size: 60 + k * 34, life: 0.3 + k * 0.12, width: 3 - k * 0.6,
          gz: 0.04 + k * 0.05, color: P.ring
        });
      }
      IMPACT.press(gx, gy, P, i * 0.6, power, s);
    },

    /* 끈적한 것: 실처럼 늘어졌다 끊어지는 가닥 */
    goo: function (gx, gy, P, i, power, s) {
      for (var k = 0; k < 5; k++) {
        var a = Math.random() * 6.2832;
        push({
          type: 'strand', gx: gx, gy: gy, gz: 0.06,
          vx: Math.cos(a) * 0.006, vy: Math.sin(a) * 0.006, vz: rnd(0.4, 0.9) * 0.016,
          gravity: -0.07, life: rnd(0.4, 0.75), size: rnd(10, 20),
          rot: a, spin: rnd(-2, 2),
          color: 'hsla(' + P.hue + ',85%,' + P.light + '%,'
        });
      }
      IMPACT.puff(gx, gy, P, i * 0.5, power, s);
    },

    /* 부스러지는 것: 각진 파편이 튄다 */
    chunk: function (gx, gy, P, i, power, s) {
      var n = 5 + Math.round(i * 5);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.012, 0.04) * s;
        push({
          type: 'chunk', gx: gx, gy: gy, gz: 0.06,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.03, 0.08),
          gravity: -0.16, life: rnd(0.5, 1.0), size: rnd(4, 9),
          rot: Math.random() * 6.28, spin: rnd(-12, 12),
          sides: 3 + (k % 3),
          color: 'hsla(' + P.hue + ',75%,' + (P.light - 10) + '%,'
        });
      }
    },

    /* 터지는 것: 사방으로 뻗는 섬광선 */
    pop: function (gx, gy, P, i, power, s) {
      for (var k = 0; k < 8; k++) {
        var a = Math.random() * 6.2832;
        push({
          type: 'streak', gx: gx, gy: gy, gz: 0.08,
          vx: Math.cos(a) * 0.03 * s, vy: Math.sin(a) * 0.03 * s * 0.6, vz: rnd(0.02, 0.06),
          gravity: -0.12, life: rnd(0.22, 0.4), size: rnd(8, 16), rot: a,
          color: 'hsla(' + P.hue + ',90%,' + P.light + '%,'
        });
      }
      IMPACT.press(gx, gy, P, i, power, s);
    },

    /* 구슬: 작은 공들이 통통 튀며 굴러 나간다 */
    balls: function (gx, gy, P, i, power, s) {
      var hues = [340, 20, 290, 200, 130];
      var n = 5 + Math.round(i * 4);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.018, 0.05) * s;
        push({
          type: 'bubble', gx: gx, gy: gy, gz: 0.08,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.04, 0.09),
          gravity: -0.19, life: rnd(0.6, 1.1), size: rnd(4, 8),
          color: 'hsla(' + hues[k % hues.length] + ',88%,78%,'
        });
      }
    },

    /* 모래: 알갱이가 튀고, 그 위로 **고운 가루가 피어오른다**.
     *
     *  알갱이(무거움)와 가루(가벼움)는 물리가 반대다. 알갱이는 포물선을 그리며
     *  금방 떨어지고, 가루는 거의 뜬 채로 옆으로 번지며 천천히 사라진다.
     *  둘을 같은 속도로 뿌리면 "점이 흩어진다"로만 보이고 모래처럼 보이지 않는다.
     */
    grain: function (gx, gy, P, i, power, s) {
      // 1) 튀어 오르는 알갱이
      var n = 20 + Math.round(i * 22) + (power > 1 ? 14 : 0);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.008, 0.036) * s;
        push({
          type: 'dot', gx: gx, gy: gy, gz: 0.02,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.012, 0.05),
          gravity: -0.2, life: rnd(0.35, 0.75), size: rnd(1, 2.6),
          color: 'hsla(' + P.hue + ',' + (60 + (k % 3) * 12) + '%,' + (P.light - (k % 2) * 14) + '%,',
          alpha: 0.9
        });
      }
      // 2) 피어오르는 가루 — 발밑에서 바깥으로 낮게 번진다
      var m = 7 + Math.round(i * 7) + (power > 1 ? 5 : 0);
      for (var q = 0; q < m; q++) {
        var da = Math.random() * 6.2832, dsp = rnd(0.006, 0.019) * s;
        push({
          type: 'puff', gx: gx, gy: gy, gz: rnd(0.01, 0.06),
          vx: Math.cos(da) * dsp, vy: Math.sin(da) * dsp * 0.6, vz: rnd(0.004, 0.016),
          gravity: -0.012, life: rnd(0.75, 1.35), size: rnd(11, 26),
          color: 'hsla(' + P.hue + ',52%,' + (P.light + 4) + '%,', alpha: 0.4
        });
      }
      // 3) 바닥을 스치는 납작한 먼지 고리
      ring(gx, gy, { size: 92 + i * 60, life: 0.5, width: 8, gz: 0.012,
                     color: 'hsla(' + P.hue + ',48%,' + (P.light + 6) + '%,' });
    },

    /* 낙엽: 잎사귀가 흩날린다.
     *
     *  파편(chunk)으로 뿌리면 "부스러기"지 낙엽이 아니다. 잎은 넓고 가벼워서
     *  공기에 얹혀 **좌우로 팔랑이며** 천천히 내려앉는다 — 그 팔랑임(sway)이
     *  잎으로 보이게 만드는 거의 전부다.
     */
    leafFly: function (gx, gy, P, i, power, s) {
      var hues = [28, 38, 16, 46, 8];
      var n = 9 + Math.round(i * 8) + (power > 1 ? 6 : 0);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.05, 0.135) * s;
        push({
          type: 'leaf', gx: gx, gy: gy, gz: rnd(0.05, 0.16),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.05, 0.11),
          gravity: -0.06,                        // 파편보다 훨씬 천천히 떨어진다
          life: rnd(1.0, 1.8), size: rnd(9, 16),
          rot: Math.random() * 6.28, spin: rnd(-5, 5),
          sway: rnd(9, 20), swayPhase: Math.random() * 6.28,
          color: 'hsla(' + hues[k % hues.length] + ',' + rnd(70, 92) + '%,' + rnd(48, 68) + '%,'
        });
      }
      // 마른 잎이 부서지며 나오는 잔부스러기
      IMPACT.chunk(gx, gy, P, i * 0.45, 1, s * 0.7);
    },

    /* 유리: 십자 섬광 + 반짝이 */
    sparkleRing: function (gx, gy, P, i, power, s) {
      push({
        type: 'gleam', gx: gx, gy: gy, gz: 0.3,
        life: 0.4, size: 34 + i * 26, rot: 0.6,
        color: 'rgba(255,255,255,'
      });
      stars(gx, gy, 8 + Math.round(i * 8), 195);
    },

    /* 눈: 결정이 흩날린다 */
    flake: function (gx, gy, P, i, power, s) {
      var n = 8 + Math.round(i * 8);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.006, 0.022) * s;
        push({
          type: 'star', gx: gx, gy: gy, gz: 0.1,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.02, 0.05),
          gravity: -0.045, life: rnd(0.7, 1.3), size: rnd(3, 6),
          rot: Math.random() * 6.28, spin: rnd(-4, 4),
          color: 'hsla(200,60%,98%,'
        });
      }
      IMPACT.puff(gx, gy, P, i * 0.5, power, s);
    },

    /* 물: 방울이 높이 튀었다가 무겁게 떨어진다 */
    splash: function (gx, gy, P, i, power, s) {
      var n = 7 + Math.round(i * 7);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.008, 0.03) * s;
        push({
          type: 'bubble', gx: gx, gy: gy, gz: 0.05,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.05, 0.11),
          gravity: -0.3, life: rnd(0.4, 0.8), size: rnd(2.5, 6),
          color: 'hsla(' + P.hue + ',90%,' + P.light + '%,'
        });
      }
      // 수면에 남는 동심원
      for (var c = 0; c < 2; c++) {
        ring(gx, gy, { size: 54 + c * 46, life: 0.34 + c * 0.16, width: 2.4 - c * 0.8, gz: 0.01, color: P.ring });
      }
    },

    /* 나무 '탁' — 속이 빈 판을 친 소리. 먼지가 **바닥을 따라 낮게** 밀려 나가고
       판이 함께 울린 흔적으로 낮은 링이 한 번 크게 퍼진다. 위로 튀면 흙이 된다 */
    thud: function (gx, gy, P, i, power, s) {
      var n = 7 + Math.round(i * 7);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.02, 0.05) * s;
        push({
          type: 'dot', gx: gx, gy: gy, gz: 0.012,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.002, 0.012),
          gravity: -0.03, life: rnd(0.3, 0.55), size: rnd(1.6, 3.4),
          color: 'hsla(' + P.hue + ',55%,' + (P.light - 6) + '%,', alpha: 0.42
        });
      }
      // 판이 울린 자국 — 낮고 넓게 한 번
      ring(gx, gy, { size: 120 + i * 60, life: 0.26, width: 5, gz: 0.005, color: P.ring });
      // 이음새에서 튄 나뭇결 부스러기 두어 개
      for (var c = 0; c < 2; c++) {
        var ca = Math.random() * 6.2832;
        push({
          type: 'shard', gx: gx, gy: gy, gz: 0.04,
          vx: Math.cos(ca) * 0.02, vy: Math.sin(ca) * 0.012, vz: rnd(0.02, 0.04),
          gravity: -0.14, life: rnd(0.4, 0.7), size: rnd(2.5, 4.5),
          rot: ca, color: 'hsla(28,60%,58%,'
        });
      }
    },

    /* 스펀지 '뽀드득' — 구멍에서 공기가 밀려 나온다.
       구름(puff)만 쓰면 솜과 구분이 안 되므로, 구멍에서 뿜어 나오는 **가는 공기 줄기**를 얹는다 */
    squeeze: function (gx, gy, P, i, power, s) {
      for (var k = 0; k < 6; k++) {
        var a = (k / 6) * 6.2832 + rnd(-0.3, 0.3);
        push({
          type: 'streak', gx: gx, gy: gy, gz: 0.03,
          vx: Math.cos(a) * 0.022 * s, vy: Math.sin(a) * 0.013 * s, vz: rnd(0.004, 0.016),
          gravity: -0.02, life: rnd(0.24, 0.42), size: rnd(7, 13), rot: a,
          color: 'hsla(' + P.hue + ',60%,96%,'
        });
      }
      IMPACT.puff(gx, gy, P, i * 0.7, power, s);
    },

    /* 스티로폼 '끼익' — 마른 마찰. 흰 알갱이가 부스러지고,
       삐걱대는 소리를 지그재그 선 두 줄로 보여 준다 */
    creak: function (gx, gy, P, i, power, s) {
      var n = 12 + Math.round(i * 12);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.006, 0.026) * s;
        push({
          type: 'dot', gx: gx, gy: gy, gz: 0.03,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.01, 0.04),
          gravity: -0.16, life: rnd(0.3, 0.6), size: rnd(1.6, 3.4),
          color: 'hsla(56,35%,99%,', alpha: 0.95
        });
      }
      for (var z = 0; z < 2; z++) {
        var za = rnd(0, 6.2832);
        push({
          type: 'streak', gx: gx, gy: gy, gz: 0.1 + z * 0.06,
          vx: Math.cos(za) * 0.004, vy: Math.sin(za) * 0.004, vz: 0.03,
          gravity: -0.02, life: 0.3, size: 14, rot: za, spin: 26,
          color: 'hsla(50,30%,100%,'
        });
      }
    },

    /* 얼음 '쩌억' — 쩍 갈라진다. 균열선이 **중심에서 곧게 뻗고**,
       뒤이어 냉기가 퍼지며 잔 조각이 반짝인다 */
    fracture: function (gx, gy, P, i, power, s) {
      var arms = 4 + Math.round(i * 3);
      for (var k = 0; k < arms; k++) {
        var a = (k / arms) * 6.2832 + rnd(-0.25, 0.25);
        push({
          type: 'streak', gx: gx, gy: gy, gz: 0.015,
          vx: Math.cos(a) * 0.01, vy: Math.sin(a) * 0.006, vz: 0,
          gravity: 0, life: rnd(0.3, 0.5), size: rnd(16, 30), rot: a,
          color: 'hsla(195,90%,98%,'
        });
      }
      // 튀어 오르는 얼음 조각
      for (var c = 0; c < 6; c++) {
        var ca = Math.random() * 6.2832, sp = rnd(0.014, 0.04) * s;
        push({
          type: 'shard', gx: gx, gy: gy, gz: 0.07,
          vx: Math.cos(ca) * sp, vy: Math.sin(ca) * sp * 0.6, vz: rnd(0.03, 0.075),
          gravity: -0.2, life: rnd(0.4, 0.8), size: rnd(3, 6.5),
          rot: ca, spin: rnd(-9, 9),
          color: 'hsla(195,70%,92%,'
        });
      }
      // 갈라진 자리에서 번지는 냉기
      push({
        type: 'puff', gx: gx, gy: gy, gz: 0.02,
        vx: 0, vy: 0, vz: 0.004, gravity: -0.01,
        life: 0.6, size: 18, color: 'hsla(198,80%,96%,', alpha: 0.4
      });
      stars(gx, gy, 4 + Math.round(i * 4), 195);
    },

    /* 자갈 '자그락' — 돌이 서로 부딪혀 **튀고 굴러간다**.
       구슬(balls)보다 무겁고 낮게, 회색 세 톤으로 */
    pebbles: function (gx, gy, P, i, power, s) {
      var tones = [86, 70, 58, 92];
      var n = 6 + Math.round(i * 6);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.016, 0.045) * s;
        push({
          type: 'chunk', gx: gx, gy: gy, gz: 0.04,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.02, 0.055),
          gravity: -0.26, life: rnd(0.45, 0.85), size: rnd(2.6, 5.2),
          rot: Math.random() * 6.28, spin: rnd(-16, 16),
          sides: 4 + (k % 2),
          color: 'hsla(220,8%,' + tones[k % tones.length] + '%,'
        });
      }
      // 돌 밑에서 일어나는 마른 먼지
      IMPACT.press(gx, gy, P, i * 0.5, power, s);
    },

    /* 종이 '구깃' — 얇은 조각이 **팔랑이며** 떠다닌다. 무겁게 떨어지면 판지가 된다 */
    crinkle: function (gx, gy, P, i, power, s) {
      var n = 5 + Math.round(i * 5);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.008, 0.026) * s;
        push({
          type: 'scrap', gx: gx, gy: gy, gz: 0.08,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.02, 0.05),
          gravity: -0.05, life: rnd(0.7, 1.2), size: rnd(4, 8),
          rot: Math.random() * 6.28, spin: rnd(-5, 5),
          sway: rnd(4, 9), swayPhase: Math.random() * 6.28,
          color: 'hsla(44,60%,' + rnd(92, 99) + '%,'
        });
      }
      IMPACT.press(gx, gy, P, i * 0.4, power, s);
    },

    /* 쿠키 '바삭' — 부스러기가 사방으로 튀고 초코칩 몇 알이 굴러 나간다 */
    crumbs: function (gx, gy, P, i, power, s) {
      var n = 12 + Math.round(i * 14);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.012, 0.042) * s;
        push({
          type: 'chunk', gx: gx, gy: gy, gz: 0.05,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.025, 0.07),
          gravity: -0.22, life: rnd(0.4, 0.8), size: rnd(1.8, 4.2),
          rot: Math.random() * 6.28, spin: rnd(-14, 14),
          sides: 3 + (k % 3),
          color: 'hsla(' + rnd(26, 36) + ',' + rnd(55, 75) + '%,' + rnd(58, 78) + '%,'
        });
      }
      // 초코칩 — 굵고 어둡게, 느리게 굴러간다
      for (var c = 0; c < 2 + Math.round(i * 2); c++) {
        var ca = Math.random() * 6.2832;
        push({
          type: 'bubble', gx: gx, gy: gy, gz: 0.06,
          vx: Math.cos(ca) * rnd(0.014, 0.03), vy: Math.sin(ca) * rnd(0.008, 0.018), vz: rnd(0.02, 0.045),
          gravity: -0.24, life: rnd(0.5, 0.9), size: rnd(2.6, 4.4),
          color: 'hsla(24,55%,26%,'
        });
      }
      // 마른 가루가 낮게 피어오른다
      push({
        type: 'puff', gx: gx, gy: gy, gz: 0.03,
        vx: 0, vy: 0, vz: 0.006, gravity: -0.02,
        life: 0.5, size: 13, color: 'hsla(32,60%,80%,', alpha: 0.35
      });
    }
  };

  /**
   * 타일이 완전히 부서질 때 — 윗면이 네 조각으로 갈라져 날아간다.
   */
  function tileBreak(gx, gy, mat) {
    var P = pal(mat);
    for (var k = 0; k < 4; k++) {
      var a = (k / 4) * 6.2832 + 0.78;
      push({
        type: 'slab', gx: gx, gy: gy, gz: 0.05,
        vx: Math.cos(a) * 0.022, vy: Math.sin(a) * 0.022 * 0.6, vz: rnd(0.03, 0.06),
        gravity: -0.2, life: rnd(0.6, 0.95), size: 1,
        rot: a, spin: rnd(-6, 6),
        color: 'hsla(' + P.hue + ',70%,' + P.light + '%,'
      });
    }
  }

  /* =========================================================
   *  에어캡 — 알이 하나씩 터진다
   *
   *  다른 소모성 타일은 '금이 가고 부서진다'가 맞지만, 뽁뽁이는 **시트가 깨지는 게
   *  아니라 알이 터진다**. 균열선·파편·타일 조각을 쓰면 비닐이 유리처럼 보인다.
   *  그래서 에어캡만 따로: 터지는 알의 자리에서 공기가 확 빠지고, 비닐 조각이
   *  작게 튀고, 그 자리에 주름만 남는다.
   * ======================================================= */

  /** 타일 윗면에서 k번째 돔이 놓인 화면 오프셋(px) */
  function bubbleCellOffset(k) {
    var cells = (window.SK && SK.Tiles && SK.Tiles.BUBBLE_CELLS) || [[0, 0]];
    var c = cells[k % cells.length];
    var hw = SK.Iso.TW / 2, hh = SK.Iso.TH / 2;
    return { ox: (c[0] - c[1]) * hw * 0.3, oy: (c[0] + c[1]) * hh * 0.3 };
  }

  /**
   * from..to-1 번 돔을 터뜨린다.
   * @param {number} strength 0~1 — 클수록 세게, 조각도 많이
   */
  function bubblePop(gx, gy, from, to, strength) {
    var st = strength == null ? 1 : strength;
    for (var k = from; k < to; k++) {
      var o = bubbleCellOffset(k);
      var delay = (k - from) * 0.045;            // 알들이 연달아 뽁-뽁-뽁

      // 1) 공기가 빠지며 퍼지는 납작한 고리 — '터짐'의 핵심
      push({
        type: 'ring', gx: gx, gy: gy, gz: 0.05, ox: o.ox, oy: o.oy,
        delay: delay, life: 0.34, size: 40 + st * 16, width: 3.2,
        color: 'rgba(214,244,255,'
      });
      // 2) 순간 번쩍이는 흰 점 — 알이 꺼지는 찰나
      push({
        type: 'dot', gx: gx, gy: gy, gz: 0.05, ox: o.ox, oy: o.oy,
        delay: delay, life: 0.13, size: 7 + st * 3,
        color: 'rgba(255,255,255,', alpha: 0.95
      });
      // 3) 찢긴 비닐 조각 — 알 하나 크기 안에서만 작게 튄다
      for (var q = 0; q < 5; q++) {
        var a = Math.random() * 6.2832, sp = rnd(0.006, 0.018) * (0.6 + st * 0.6);
        push({
          type: 'shard', gx: gx, gy: gy, gz: 0.06, ox: o.ox, oy: o.oy,
          delay: delay,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.02, 0.055),
          gravity: -0.17, life: rnd(0.3, 0.6), size: rnd(2.5, 5),
          rot: a, spin: rnd(-14, 14),
          color: 'rgba(196,232,250,'
        });
      }
      // 4) 빠져나가는 공기
      push({
        type: 'puff', gx: gx, gy: gy, gz: 0.07, ox: o.ox, oy: o.oy,
        delay: delay, vz: 0.018, gravity: -0.01,
        life: 0.42, size: 9, color: 'rgba(226,246,255,', alpha: 0.5
      });
    }
  }

  /* 마른 재질은 각진 파편으로, 말랑한 재질은 둥근 알갱이로 부서진다 */
  var SHARDY = { leaf: 1, paper: 1, ice: 1, gravel: 1, glass: 1 };
  var BREAK_WORD = {
    leaf: 'CRUNCH!', paper: '구깃-!', ice: '쩌저적!', cookie: '바사삭!',
    sand: '스르륵!', snow: '푹-!', orbeez: '톡톡톡!'
  };

  /** 소모성 타일에 금이 갈 때 (부서지기 전 단계) */
  function crackBits(gx, gy, mat, ratio, popFrom, popTo) {
    var P = pal(mat);

    // 에어캡은 금이 가는 게 아니라 이번에 밟힌 알들만 터진다
    if (mat === 'bubble') {
      bubblePop(gx, gy, popFrom || 0, popTo || 0, 0.5 + ratio * 0.5);
      return;
    }

    var n = 4 + Math.round(ratio * 5);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, sp = rnd(0.008, 0.028);
      push({
        type: SHARDY[mat] ? 'shard' : 'bubble',
        gx: gx, gy: gy, gz: 0.08,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.02, 0.05),
        gravity: -0.15, life: rnd(0.4, 0.8), size: rnd(3, 7),
        spin: rnd(-10, 10), rot: Math.random() * 6.28,
        color: 'hsla(' + P.hue + ',75%,' + (P.light - 12) + '%,'
      });
    }
    ring(gx, gy, { size: 60, life: 0.3, width: 2, color: P.ring });
  }

  /** 소모성 타일이 완전히 부서질 때 */
  function shatter(gx, gy, mat, intensity) {
    var P = pal(mat);

    // 에어캡은 깨지지 않는다 — 남은 알이 전부 연달아 터진다
    if (mat === 'bubble') {
      var cells = (window.SK && SK.Tiles && SK.Tiles.BUBBLE_CELLS) || [];
      bubblePop(gx, gy, 0, cells.length, 1);
      ring(gx, gy, { size: 150, life: 0.5, width: 3.4, color: P.ring });
      text(gx, gy, 'POP-POP!', {
        size: 22, color: 'hsl(' + P.hue + ',85%,' + P.light + '%)', life: 0.85, gz: 0.45
      });
      return;
    }

    ring(gx, gy, { size: 150, life: 0.55, width: 4, color: P.ring });
    ring(gx, gy, { size: 250, life: 0.75, width: 2, color: 'rgba(255,255,255,' });
    tileBreak(gx, gy, mat);
    var n = SHARDY[mat] ? 14 : 12;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, sp = rnd(0.014, 0.05);
      push({
        type: SHARDY[mat] ? 'shard' : 'bubble',
        gx: gx, gy: gy, gz: 0.1,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.035, 0.1),
        gravity: -0.17, life: rnd(0.7, 1.3), size: rnd(5, 12),
        spin: rnd(-13, 13), rot: Math.random() * 6.28,
        color: 'hsla(' + P.hue + ',78%,' + P.light + '%,'
      });
    }

    // 재질마다 마지막 순간이 다르다 — 파괴음의 꼬리와 짝이 되는 연출
    if (SHATTER_FX[mat]) SHATTER_FX[mat](gx, gy, P);

    text(gx, gy, BREAK_WORD[mat] || 'CRUNCH!', {
      size: 22, color: 'hsl(' + P.hue + ',85%,' + P.light + '%)', life: 0.85, gz: 0.45
    });
  }

  /* 완전히 부서지는 마지막 순간의 재질별 꼬리.
     공통 파편 위에 얹는 것이라, 여기서는 그 재질에서만 나는 것만 그린다. */
  var SHATTER_FX = {
    /* 눈 — 다져진 덩어리가 무너지며 가루가 피어오른다 */
    snow: function (gx, gy, P) {
      for (var k = 0; k < 4; k++) {
        var a = Math.random() * 6.2832;
        push({
          type: 'puff', gx: gx, gy: gy, gz: 0.04,
          vx: Math.cos(a) * 0.008, vy: Math.sin(a) * 0.005, vz: rnd(0.004, 0.014),
          gravity: -0.01, life: rnd(0.7, 1.1), size: rnd(14, 24),
          color: 'hsla(205,60%,99%,', alpha: 0.5
        });
      }
      IMPACT.flake(gx, gy, P, 1, 1, 1.2);
    },

    /* 모래 — 무너진 자리에서 가루가 아래로 주르륵 쏟아진다 */
    sand: function (gx, gy, P) {
      for (var k = 0; k < 26; k++) {
        var a = Math.random() * 6.2832;
        push({
          type: 'dot', gx: gx, gy: gy, gz: rnd(0.02, 0.12),
          vx: Math.cos(a) * rnd(0.002, 0.012), vy: Math.sin(a) * rnd(0.002, 0.008),
          vz: rnd(-0.02, -0.005),                       // 아래로 쏟아진다
          gravity: -0.05, life: rnd(0.5, 0.9), size: rnd(1, 2.4),
          color: 'hsla(' + rnd(38, 46) + ',62%,' + rnd(72, 86) + '%,', alpha: 0.9
        });
      }
    },

    /* 종이 — 찢긴 조각이 한참 팔랑이다 가라앉는다 */
    paper: function (gx, gy, P) {
      for (var k = 0; k < 9; k++) {
        var a = Math.random() * 6.2832;
        push({
          type: 'scrap', gx: gx, gy: gy, gz: rnd(0.08, 0.2),
          vx: Math.cos(a) * rnd(0.006, 0.022), vy: Math.sin(a) * rnd(0.004, 0.014),
          vz: rnd(0.01, 0.045),
          gravity: -0.035, life: rnd(1.1, 1.8), size: rnd(5, 10),
          rot: Math.random() * 6.28, spin: rnd(-4, 4),
          sway: rnd(6, 12), swayPhase: Math.random() * 6.28,
          color: 'hsla(44,55%,' + rnd(92, 99) + '%,'
        });
      }
    },

    /* 얼음 — 갈라지는 섬광 + 냉기, 그리고 반짝이는 조각 */
    ice: function (gx, gy, P) {
      push({
        type: 'gleam', gx: gx, gy: gy, gz: 0.25,
        life: 0.42, size: 46, rot: 0.5, color: 'rgba(255,255,255,'
      });
      IMPACT.fracture(gx, gy, P, 1, 1, 1.3);
      stars(gx, gy, 10, 195);
    },

    /* 쿠키 — 크게 두 조각으로 갈라지고 부스러기가 쏟아진다 */
    cookie: function (gx, gy, P) {
      IMPACT.crumbs(gx, gy, P, 1, 1, 1.4);
      for (var k = 0; k < 2; k++) {
        var a = k ? 0.6 : 3.7;
        push({
          type: 'chunk', gx: gx, gy: gy, gz: 0.08,
          vx: Math.cos(a) * 0.03, vy: Math.sin(a) * 0.018, vz: rnd(0.04, 0.07),
          gravity: -0.2, life: rnd(0.8, 1.2), size: rnd(9, 13),
          rot: a, spin: rnd(-6, 6), sides: 5,
          color: 'hsla(30,62%,64%,'
        });
      }
    },

    /* 구슬볼 — 남은 구슬이 사방으로 튀어 굴러간다 */
    orbeez: function (gx, gy, P) {
      IMPACT.balls(gx, gy, P, 1, 1, 1.5);
    },

    /* 낙엽 — 마지막 잎들이 높이 떠올랐다 내려앉는다 */
    leaf: function (gx, gy, P) {
      IMPACT.leafFly(gx, gy, P, 1, 1, 1.4);
    }
  };

  /** 점프 중 공기를 가르는 궤적 */
  function trail(gx, gy, gz, power) {
    push({
      type: 'dot', gx: gx, gy: gy, gz: gz,
      vx: 0, vy: 0, vz: -0.004,
      life: 0.3, size: power > 1 ? 4.5 : 3,
      color: 'rgba(255,255,255,', alpha: 0.35
    });
  }

  /** 정답 한 글자: 별빛 */
  function stars(gx, gy, count, hue) {
    count = count || 12;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * 6.2832, sp = rnd(0.008, 0.035);
      push({
        type: 'star', gx: gx, gy: gy, gz: 0.25,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.02, 0.06),
        gravity: -0.055, life: rnd(0.55, 1.1), size: rnd(4, 10),
        spin: rnd(-8, 8), rot: Math.random() * 6.28,
        color: 'hsla(' + (hue == null ? rnd(42, 62) : hue) + ',100%,72%,'
      });
    }
  }

  /** 소리 시각화 — 퍼져나가는 링 */
  function ring(gx, gy, o) {
    o = o || {};
    push({
      type: 'ring', gx: gx, gy: gy, gz: o.gz == null ? 0.06 : o.gz,
      life: o.life || 0.55, size: o.size || 120,
      width: o.width || 4,
      color: o.color || 'rgba(255,214,107,'
    });
  }

  /** 소리 시각화 — 텍스트 팝 */
  function text(gx, gy, str, o) {
    o = o || {};
    push({
      type: 'text', gx: gx, gy: gy, gz: o.gz == null ? 0.5 : o.gz,
      vz: o.vz == null ? 0.045 : o.vz, gravity: o.gravity == null ? -0.02 : o.gravity,
      life: o.life || 1.1, str: str,
      size: o.size || 30, color: o.color || '#ffd66b',
      stroke: o.stroke || 'rgba(20,12,40,.85)',
      tilt: o.tilt == null ? rnd(-0.12, 0.12) : o.tilt
    });
  }

  /**
   * 정답 임팩트 — 정답 칸 위에 찍히는 도장.
   * 정답 효과음을 없앤 자리를 대신하므로, 소리 없이도 알아볼 만큼 크게 그린다.
   * @param {number} [delay] 초 단위 지연 — 여러 칸을 차례로 터뜨릴 때
   */
  function solveMark(gx, gy, delay) {
    push({ type: 'stamp', gx: gx, gy: gy, gz: 0.02, life: 0.78, size: 1, delay: delay || 0 });
    push({ type: 'ring', gx: gx, gy: gy, gz: 0.06, life: 0.5, size: 125, width: 5,
           color: 'rgba(255,255,255,', delay: delay || 0 });
    push({ type: 'ring', gx: gx, gy: gy, gz: 0.06, life: 0.78, size: 215, width: 3,
           color: 'rgba(142,240,192,', delay: delay || 0 });
  }

  /** 문제 완성 대폭발 */
  function celebrate(gx, gy) {
    ring(gx, gy, { size: 190, life: 0.7, width: 6, color: 'rgba(255,255,255,' });
    ring(gx, gy, { size: 300, life: 0.95, width: 3, color: 'rgba(142,240,192,' });
    ring(gx, gy, { size: 400, life: 1.2, width: 2, color: 'rgba(255,214,107,' });
    stars(gx, gy, 46);
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * 6.2832, sp = rnd(0.02, 0.07);
      push({
        type: 'bubble', gx: gx, gy: gy, gz: 0.2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.04, 0.11),
        gravity: -0.14, life: rnd(0.7, 1.3), size: rnd(5, 14),
        spin: rnd(-10, 10), rot: 0,
        color: 'hsla(' + rnd(160, 200) + ',85%,78%,'
      });
    }
  }

  /* ---------- 업데이트 ---------- */
  function update(dt) {
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      if (p.age >= p.life) { list.splice(i, 1); continue; }
      var k = dt * 3.6;
      if (p.vx) p.gx += p.vx * k;
      if (p.vy) p.gy += p.vy * k;
      if (p.vz != null) {
        p.gz += p.vz * k;
        if (p.gravity) p.vz += p.gravity * k;
        if (p.gz < 0) { p.gz = 0; p.vz = -p.vz * 0.35; }
      }
      if (p.spin) p.rot += p.spin * dt;
    }
  }

  /* ---------- 렌더 ---------- */
  function draw(ctx, Iso) {
    var proj = project || function (gx, gy, gz) { return Iso.toScreen(gx, gy, gz); };
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.delay > 0) continue;
      var t = p.age / p.life;
      var a = 1 - t;
      var s = proj(p.gx, p.gy, p.gz);
      // 타일 안의 특정 지점(에어캡의 알 자리 등)에 붙이는 픽셀 오프셋
      if (p.ox) s = { x: s.x + p.ox, y: s.y + (p.oy || 0) };
      else if (p.oy) s = { x: s.x, y: s.y + p.oy };

      ctx.save();
      switch (p.type) {
        case 'dot':
          ctx.fillStyle = p.color + (a * (p.alpha || 1)) + ')';
          ctx.beginPath(); ctx.arc(s.x, s.y, p.size * (1 - t * 0.5), 0, 6.2832); ctx.fill();
          break;

        case 'star':
          ctx.translate(s.x, s.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color + a + ')';
          drawStar(ctx, p.size * (0.6 + a * 0.6));
          break;

        case 'shard':
          ctx.translate(s.x, s.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color + a + ')';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.42, 0.4, 0, 6.2832);
          ctx.fill();
          break;

        /* 낙엽 — 잎맥까지 그린 잎사귀 하나. 팔랑임에 맞춰 옆으로 납작해진다
           (뒤집히며 떨어지는 착시). 이 납작해짐이 없으면 그냥 도는 조각이다. */
        case 'leaf':
          var flip = Math.cos(p.age * 7 + (p.swayPhase || 0));
          // 팔랑임은 위치 적분이 아니라 그릴 때의 픽셀 오프셋으로 준다 —
          // 진폭을 눈에 보이는 단위(px)로 직접 정할 수 있다
          ctx.translate(s.x + Math.sin(p.age * 6.5 + (p.swayPhase || 0)) * (p.sway || 0), s.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.35 + Math.abs(flip) * 0.65);
          ctx.fillStyle = p.color + a + ')';
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.quadraticCurveTo(0, -p.size * 0.62, p.size, 0);
          ctx.quadraticCurveTo(0, p.size * 0.62, -p.size, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(70,40,12,' + (a * 0.5) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-p.size * 0.9, 0); ctx.lineTo(p.size * 0.9, 0);
          ctx.stroke();
          break;

        /* 종이 조각 — 낙엽과 달리 각진 판이고, 뒤집힐 때 거의 선이 된다 */
        case 'scrap':
          var sflip = Math.cos(p.age * 8 + (p.swayPhase || 0));
          ctx.translate(s.x + Math.sin(p.age * 5.5 + (p.swayPhase || 0)) * (p.sway || 0), s.y);
          ctx.rotate(p.rot + (p.spin || 0) * p.age * 0.1);
          ctx.scale(1, 0.12 + Math.abs(sflip) * 0.88);
          ctx.fillStyle = p.color + a + ')';
          ctx.fillRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
          ctx.strokeStyle = 'rgba(150,132,90,' + (a * 0.6) + ')';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
          break;

        case 'bubble':
          ctx.translate(s.x, s.y);
          ctx.fillStyle = p.color + (a * 0.8) + ')';
          ctx.beginPath(); ctx.arc(0, 0, p.size * (0.5 + a * 0.7), 0, 6.2832); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.7) + ')';
          ctx.lineWidth = 1.2; ctx.stroke();
          break;

        case 'ring':
          var r = p.size * easeOut(t);
          ctx.translate(s.x, s.y);
          ctx.scale(1, Iso.TH / Iso.TW);
          ctx.strokeStyle = p.color + (a * 0.85) + ')';
          ctx.lineWidth = p.width * (1 - t * 0.6) * (Iso.TW / Iso.TH);
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.stroke();
          break;

        case 'stamp':
          drawStamp(ctx, Iso, s.x, s.y, t, a);
          break;

        case 'puff':
          var pr = p.size * (0.6 + t * 1.5);
          var pg = ctx.createRadialGradient(s.x, s.y, 0.5, s.x, s.y, pr);
          pg.addColorStop(0, p.color + (a * (p.alpha || 0.5)) + ')');
          pg.addColorStop(1, p.color + '0)');
          ctx.fillStyle = pg;
          ctx.beginPath(); ctx.arc(s.x, s.y, pr, 0, 6.2832); ctx.fill();
          break;

        case 'chunk':
          ctx.translate(s.x, s.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color + a + ')';
          ctx.beginPath();
          for (var ci = 0; ci < p.sides; ci++) {
            var ca = (ci / p.sides) * 6.2832;
            var cr = p.size * (0.7 + ((ci * 7) % 4) * 0.12);
            var cpx = Math.cos(ca) * cr, cpy = Math.sin(ca) * cr * 0.6;
            if (ci === 0) ctx.moveTo(cpx, cpy); else ctx.lineTo(cpx, cpy);
          }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,' + (a * 0.3) + ')';
          ctx.lineWidth = 1; ctx.stroke();
          break;

        case 'streak':
          ctx.translate(s.x, s.y); ctx.rotate(p.rot);
          var sg = ctx.createLinearGradient(0, 0, p.size * (1 - t), 0);
          sg.addColorStop(0, p.color + a + ')');
          sg.addColorStop(1, p.color + '0)');
          ctx.strokeStyle = sg;
          ctx.lineWidth = 2.4 * (1 - t); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.size * (1 - t), 0); ctx.stroke();
          break;

        case 'strand':
          ctx.translate(s.x, s.y); ctx.rotate(p.rot + (p.spin || 0) * p.age);
          ctx.strokeStyle = p.color + (a * 0.8) + ')';
          ctx.lineWidth = 2.6 * (1 - t * 0.7); ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(p.size * 0.4, p.size * 0.35 * (1 - t), p.size * (1 - t * 0.4), 0);
          ctx.stroke();
          break;

        case 'gleam':
          ctx.translate(s.x, s.y); ctx.rotate(p.rot);
          var gl = p.size * (0.4 + easeOut(t) * 1.1);
          ctx.strokeStyle = p.color + (a * 0.95) + ')';
          ctx.lineWidth = 2.5 * (1 - t); ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-gl, 0); ctx.lineTo(gl, 0);
          ctx.moveTo(0, -gl * 0.55); ctx.lineTo(0, gl * 0.55);
          ctx.stroke();
          break;

        case 'slab':
          ctx.translate(s.x, s.y);
          ctx.rotate(p.rot * 0.25 + (p.spin || 0) * p.age * 0.1);
          ctx.scale(1 - t * 0.35, (1 - t * 0.35) * 0.6);
          ctx.fillStyle = p.color + (a * 0.9) + ')';
          ctx.beginPath();
          ctx.moveTo(0, -26); ctx.lineTo(30, 0); ctx.lineTo(0, 8); ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.5) + ')';
          ctx.lineWidth = 1.4; ctx.stroke();
          break;

        case 'text':
          var pop = t < 0.18 ? 0.6 + (t / 0.18) * 0.55 : 1.15 - (t - 0.18) * 0.18;
          ctx.translate(s.x, s.y);
          ctx.rotate(p.tilt);
          ctx.scale(pop, pop);
          ctx.font = '900 ' + p.size + 'px "Pretendard","Noto Sans KR","Malgun Gothic",system-ui,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 6; ctx.lineJoin = 'round';
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.stroke; ctx.strokeText(p.str, 0, 0);
          ctx.fillStyle = p.color; ctx.fillText(p.str, 0, 0);
          break;
      }
      ctx.restore();
    }
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }

  /** 정답 도장 — 밝게 번지는 마름모 + 솟아오르는 체크 */
  function drawStamp(ctx, Iso, x, y, t, a) {
    var w = Iso.TW / 2, h = Iso.TH / 2;
    var ease = easeOut(t);

    function dia(k) {
      ctx.beginPath();
      ctx.moveTo(x, y - h * k); ctx.lineTo(x + w * k, y);
      ctx.lineTo(x, y + h * k); ctx.lineTo(x - w * k, y);
      ctx.closePath();
    }

    // 1) 칸 전체가 하얗게 달아올랐다 식는다
    ctx.fillStyle = 'rgba(255,255,255,' + (0.62 * a * a) + ')';
    dia(0.95); ctx.fill();
    ctx.fillStyle = 'rgba(142,240,192,' + (0.35 * a) + ')';
    dia(0.95); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * a) + ')';
    ctx.lineWidth = 3.5; dia(0.95); ctx.stroke();

    // 2) 사방으로 튀는 빛줄기
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * a) + ')';
    ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (var k = 0; k < 6; k++) {
      var ang = k * 1.0472 + 0.5236;
      var dx = Math.cos(ang), dy = Math.sin(ang) * (h / w);
      var r0 = w * (0.5 + ease * 0.7), r1 = r0 + w * 0.2 * a;
      ctx.beginPath();
      ctx.moveTo(x + dx * r0, y + dy * r0);
      ctx.lineTo(x + dx * r1, y + dy * r1);
      ctx.stroke();
    }

    // 3) 위로 솟구치며 커지는 체크
    var cy = y - ease * Iso.TH * 1.15;
    var sc = 0.6 + ease * 0.75;
    ctx.strokeStyle = 'rgba(255,255,255,' + a + ')';
    ctx.lineWidth = w * 0.17 * sc;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.34 * sc, cy);
    ctx.lineTo(x - w * 0.10 * sc, cy + h * 0.48 * sc);
    ctx.lineTo(x + w * 0.36 * sc, cy - h * 0.62 * sc);
    ctx.stroke();
  }

  function drawStar(ctx, r) {
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var ang = (i / 8) * 6.2832;
      var rad = (i % 2 === 0) ? r : r * 0.38;
      var x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  }

  function clear() { list.length = 0; }
  function count() { return list.length; }

  return {
    PALETTE: PALETTE, pal: pal,
    setProjector: setProjector,
    stepBurst: stepBurst, crackBits: crackBits, shatter: shatter, trail: trail,
    tileBreak: tileBreak, bubblePop: bubblePop,
    stars: stars, ring: ring, text: text, celebrate: celebrate,
    solveMark: solveMark,
    update: update, draw: draw, clear: clear, count: count
  };
})();
