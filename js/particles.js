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
    leaf: { hue: 32, light: 66, ring: 'rgba(255,178,103,', word: '바스락', fx: 'chunk' },
    bubble: { hue: 196, light: 82, ring: 'rgba(168,232,255,', word: '뽁', fx: 'pop' },
    wood: { hue: 30, light: 76, ring: 'rgba(232,201,160,', word: '탁', fx: 'press' },
    slime: { hue: 266, light: 80, ring: 'rgba(217,196,255,', word: '찌걱', fx: 'goo' },
    orbeez: { hue: 336, light: 82, ring: 'rgba(255,208,230,', word: '톡톡', fx: 'balls' },
    sand: { hue: 42, light: 78, ring: 'rgba(255,238,194,', word: '사각', fx: 'grain' },
    glass: { hue: 196, light: 88, ring: 'rgba(232,250,255,', word: '챠랑', fx: 'sparkleRing' },
    snow: { hue: 205, light: 96, ring: 'rgba(255,255,255,', word: '뽀득', fx: 'flake' },
    sponge: { hue: 44, light: 78, ring: 'rgba(255,240,189,', word: '뽀드득', fx: 'puff' },
    water: { hue: 196, light: 84, ring: 'rgba(191,239,255,', word: '찰방', fx: 'splash' },
    gravel: { hue: 220, light: 74, ring: 'rgba(216,220,228,', word: '자그락', fx: 'chunk' },
    moss: { hue: 92, light: 68, ring: 'rgba(196,238,132,', word: '폭신', fx: 'puff' },
    foam: { hue: 60, light: 94, ring: 'rgba(255,255,244,', word: '끼익', fx: 'grain' },
    paper: { hue: 44, light: 88, ring: 'rgba(255,244,210,', word: '구깃', fx: 'chunk' },
    ice: { hue: 194, light: 90, ring: 'rgba(234,252,255,', word: '쩌억', fx: 'sparkleRing' }
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

    /* 모래: 아주 작은 알갱이가 낮게 흩어진다 */
    grain: function (gx, gy, P, i, power, s) {
      var n = 16 + Math.round(i * 16);
      for (var k = 0; k < n; k++) {
        var a = Math.random() * 6.2832, sp = rnd(0.008, 0.032) * s;
        push({
          type: 'dot', gx: gx, gy: gy, gz: 0.02,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(0.01, 0.045),
          gravity: -0.2, life: rnd(0.35, 0.7), size: rnd(1, 2.4),
          color: 'hsla(' + P.hue + ',' + (60 + (k % 3) * 12) + '%,' + P.light + '%,', alpha: 0.85
        });
      }
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

  /* 마른 재질은 각진 파편으로, 말랑한 재질은 둥근 알갱이로 부서진다 */
  var SHARDY = { leaf: 1, paper: 1, ice: 1, gravel: 1, glass: 1 };
  var BREAK_WORD = {
    leaf: 'CRUNCH!', bubble: 'POP-POP!', paper: '구깃-!',
    ice: '쩌저적!', sand: '스르륵!', snow: '푹-!', orbeez: '톡톡톡!'
  };

  /** 소모성 타일에 금이 갈 때 (부서지기 전 단계) */
  function crackBits(gx, gy, mat, ratio) {
    var P = pal(mat);
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
    text(gx, gy, BREAK_WORD[mat] || 'CRUNCH!', {
      size: 22, color: 'hsl(' + P.hue + ',85%,' + P.light + '%)', life: 0.85, gz: 0.45
    });
  }

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
    tileBreak: tileBreak,
    stars: stars, ring: ring, text: text, celebrate: celebrate,
    solveMark: solveMark,
    update: update, draw: draw, clear: clear, count: count
  };
})();
