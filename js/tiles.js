/* =============================================================
 *  소리 콩콩 — 타일 시스템
 *
 *  디자인 원칙: **보면 무슨 소리가 날지 알 수 있어야 한다.**
 *  재질마다 색뿐 아니라 실루엣·표면 구조·윗면 장식이 전부 다르다.
 *    키캡  : 오목한 상판 + 도톰한 테두리 + 스쿱 반사          → 또렷한 '톡'
 *    솜    : 울퉁불퉁 부푼 상판 + 보송한 솜털              → 부드러운 '포옥'
 *    젤리  : 반투명 + 큰 하이라이트 + 안쪽 기포            → 출렁이는 '통'
 *    낙엽  : 잎사귀 3~4장이 실제로 얹혀 있음               → 바스락
 *    에어캡: 볼록한 돔이 3×3 격자로 박혀 있음              → 뽁
 *    나무  : 널판 이음새 + 나뭇결 + 못 자국                → 따뜻한 '탁'
 *    슬라임: 가장자리에서 흘러내리는 가닥 + 떠오르는 기포     → 끈적한 '찌걱'
 *    구슬볼: 말랑한 구슬이 잔뜩 (밟으면 하나씩 터짐)         → '톡톡'
 *    모래  : 알갱이 결 + 발자국 자국                        → '사각사각'
 *    유리  : 투명 구슬 + 십자 반사                          → 맑은 '챠랑'
 *    눈    : 새하얀 결정 + 다져진 자국                      → '뽀득'
 *    스펀지: 숭숭 뚫린 구멍                                 → '뽀드득'
 *
 *  · 소모성은 여러 번 밟아야 완전히 부서진다(단계별 균열 연출)
 *  · surfaceOffset(): 캐릭터가 발을 딛는 윗면 높이 — 파묻힘 방지
 * ============================================================= */
window.SK = window.SK || {};

SK.Tiles = (function () {
  var Iso = null; // main에서 주입

  /* ---------- 재질 정의 ----------
   * durability: 완전히 부서지기까지 필요한 밟기 횟수 (0 = 안 부서짐)
   * sound:      메뉴의 '소리 도감'에 표시할 의성어
   */
  var MATERIALS = {
    keycap: {
      label: '키캡', sound: '톡', klass: 'elastic', durability: 0,
      top: '#eef0fa', topDark: '#c3c9e2', side: '#9aa2c2', side2: '#7d85a6',
      ink: '#2a2f52', glow: '#dfe4ff', thick: 1.05, squish: 0.5, art: 'keycap'
    },
    cotton: {
      label: '솜', sound: '포옥', klass: 'elastic', durability: 0,
      top: '#ffdcec', topDark: '#eaa8c8', side: '#d492b1', side2: '#b87796',
      ink: '#5b2340', glow: '#ffc9de', thick: 0.95, squish: 1.05, art: 'cotton'
    },
    jelly: {
      label: '젤리', sound: '통', klass: 'elastic', durability: 0,
      top: '#a9f7d3', topDark: '#4fcf99', side: '#37b783', side2: '#25946a',
      ink: '#093221', glow: '#8ef0c0', thick: 1.15, squish: 1.3, art: 'jelly'
    },
    leaf: {
      label: '낙엽', sound: '바스락', klass: 'consumable', durability: 4, regen: 2.2,
      top: '#c9a273', topDark: '#a37c4d', side: '#8a6740', side2: '#6d5133',
      ink: '#33200a', glow: '#ffb267', thick: 0.62, squish: 0.35, art: 'leaf'
    },
    bubble: {
      label: '에어캡', sound: '뽁', klass: 'consumable', durability: 4, regen: 1.8,
      top: '#dff4ff', topDark: '#a9ddf5', side: '#7fbfe0', side2: '#5b9ec2',
      ink: '#123a52', glow: '#a8e8ff', thick: 0.8, squish: 0.5, art: 'bubble'
    },
    wood: {
      label: '나무', sound: '탁', klass: 'elastic', durability: 0,
      top: '#dcb488', topDark: '#bb9061', side: '#9d7549', side2: '#7d5c39',
      ink: '#3b2510', glow: '#e8c9a0', thick: 0.88, squish: 0.22, art: 'wood'
    },

    /* ---- 확장 재질 ---- */
    slime: {
      label: '슬라임', sound: '찌걱', klass: 'elastic', durability: 0,
      top: '#c9b0ff', topDark: '#8f6fe0', side: '#7a5bc7', side2: '#5f45a3',
      ink: '#2a1656', glow: '#d9c4ff', thick: 0.9, squish: 1.45, art: 'slime'
    },
    orbeez: {
      label: '구슬볼', sound: '톡톡', klass: 'consumable', durability: 4, regen: 1.9,
      top: '#ffe0ef', topDark: '#f2a8cb', side: '#d98cb0', side2: '#b56f92',
      ink: '#4a1030', glow: '#ffd0e6', thick: 0.85, squish: 0.9, art: 'orbeez'
    },
    sand: {
      label: '모래', sound: '사각', klass: 'consumable', durability: 4, regen: 2.0,
      top: '#f5ead0', topDark: '#d9c9a4', side: '#b9a77f', side2: '#978764',
      ink: '#3d2f12', glow: '#ffeec2', thick: 0.55, squish: 0.6, art: 'sand'
    },
    glass: {
      label: '유리구슬', sound: '챠랑', klass: 'elastic', durability: 0,
      top: '#d8f2ff', topDark: '#9cd4ee', side: '#7bb8d6', side2: '#5c95b3',
      ink: '#0d3446', glow: '#e8faff', thick: 1.0, squish: 0.35, art: 'glass'
    },
    snow: {
      label: '눈', sound: '뽀득', klass: 'consumable', durability: 4, regen: 2.4,
      top: '#ffffff', topDark: '#d7e6f5', side: '#b9cde0', side2: '#9bb0c6',
      ink: '#274055', glow: '#ffffff', thick: 0.7, squish: 0.75, art: 'snow'
    },
    sponge: {
      label: '스펀지', sound: '뽀드득', klass: 'elastic', durability: 0,
      top: '#ffc95e', topDark: '#e09a2c', side: '#c07f1f', side2: '#9a6516',
      ink: '#4a3306', glow: '#fff0bd', thick: 0.95, squish: 1.15, art: 'sponge'
    }
  };

  function material(key) { return MATERIALS[key] || MATERIALS.wood; }
  function isConsumable(key) { return material(key).klass === 'consumable'; }

  /* ---------- 타일 팩토리 ---------- */
  function make(i, j, mat) {
    return {
      i: i, j: j,
      mat: mat || 'wood',
      gap: false,         // 발판이 없는 빈칸 — 디디면 아래로 떨어진다
      label: null,        // 표면에 그릴 한 글자
      role: 'plain',      // 'plain' | 'seq'
      payload: null,
      order: -1,
      correct: false,
      state: 'idle',      // 'idle' | 'done' | 'wrong'
      press: 0,
      pressVel: 0,
      damage: 0,          // 소모성 균열 단계
      broken: 0,          // 0..1 완전히 부서진 정도
      regenAt: 0,
      wobble: 0,
      aim: 0,             // 점프 목표 지점 표시
      flash: 0,           // 소리와 동기화된 표면 발광
      mark: 0,            // 밟은 자국(발자국·눌린 흔적) 0~1
      markX: 0, markY: 0, // 자국이 남은 위치
      tilt: 0,            // 파손이 누적되며 기우는 정도
      seed: Math.random() * 6.2832,
      cracks: null
    };
  }

  /* ---------- 상호작용 ---------- */

  /**
   * 밟기. 재질에 따라 눌리거나 균열이 간다.
   * @returns {{sound:string, stage:number, total:number, gain:number}}
   *   sound: 'step' | 'crack' | 'shatter' | 'hollow'
   */
  function stomp(t, intensity, now, power) {
    var m = material(t.mat);
    t.flash = 1;
    t.wobble = 1;

    // 밟은 자국을 남긴다 — 어디를 디뎠는지 눈에 보이게
    t.mark = 1;
    t.markX = (Math.random() - 0.5) * 0.3;
    t.markY = (Math.random() - 0.5) * 0.3;

    if (m.klass === 'consumable') {
      if (t.broken >= 1) return { sound: 'hollow', stage: 0, total: m.durability, gain: 0.3 };

      // 세게 내려찍어도 한 번은 한 단계 — durability 번째로 밟을 때 부서진다
      t.damage = Math.min(m.durability, t.damage + 1);
      t.press = Math.min(1, t.press + 0.35);
      t.pressVel = -4 * (0.5 + intensity);
      buildCracks(t);

      t.tilt = (t.damage / m.durability) * 0.06 * (Math.random() < 0.5 ? -1 : 1);

      if (t.damage >= m.durability) {
        t.broken = 1;
        t.regenAt = now + m.regen;
        SK.Particles.shatter(t.i, t.j, t.mat, intensity);
        return { sound: 'shatter', stage: m.durability, total: m.durability, gain: 1 };
      }
      SK.Particles.crackBits(t.i, t.j, t.mat, t.damage / m.durability);
      return { sound: 'crack', stage: t.damage, total: m.durability, gain: 0.8 };
    }

    t.press = Math.min(1, t.press + 0.55 + intensity * 0.45);
    t.pressVel = -6 * (0.5 + intensity) * m.squish * (power > 1 ? 1.35 : 1);
    return { sound: 'step', stage: 0, total: 0, gain: 1 };
  }

  /** 균열 선을 미리 만들어 매 프레임 흔들리지 않게 고정 */
  function buildCracks(t) {
    var n = t.damage * 3, lines = [];
    for (var k = 0; k < n; k++) {
      var a = t.seed + k * 1.9;
      var r0 = 0.12 + (k % 3) * 0.1;
      var r1 = 0.55 + ((k * 7) % 5) * 0.08;
      lines.push([
        Math.cos(a) * r0, Math.sin(a) * r0,
        Math.cos(a + 0.35) * r1, Math.sin(a + 0.35) * r1
      ]);
    }
    t.cracks = lines;
  }

  function update(t, dt, now) {
    if (t.press !== 0 || t.pressVel !== 0) {
      var k = 165, damp = 15;
      t.pressVel += (-k * t.press - damp * t.pressVel) * dt;
      t.press += t.pressVel * dt;
      if (Math.abs(t.press) < 0.002 && Math.abs(t.pressVel) < 0.02) { t.press = 0; t.pressVel = 0; }
    }
    if (t.wobble > 0) t.wobble = Math.max(0, t.wobble - dt * 2.2);
    if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 3.4);
    if (t.mark > 0) t.mark = Math.max(0, t.mark - dt * 0.75);
    if (t.broken > 0 && now >= t.regenAt) {
      t.broken = Math.max(0, t.broken - dt * 1.6);
      if (t.broken === 0) { t.damage = 0; t.cracks = null; t.tilt = 0; }
    }
  }

  /* ---------- 높이 질의 ---------- */
  function thicknessOf(t) { return Iso.TZ * material(t.mat).thick; }

  function surfaceOffset(t) {
    if (!t || t.gap) return 0;
    var m = material(t.mat);
    var thick = Iso.TZ * m.thick;
    var sink = t.press * Iso.TZ * 0.75 * m.squish + t.broken * thick * 0.9;
    return Math.max(0, thick - sink);
  }

  function isSolid(t) { return !!t && !t.gap && t.broken < 0.85; }

  /** 새 문제를 배치할 때 타일을 말끔한 상태로 되돌린다 */
  function reset(t) {
    t.damage = 0; t.broken = 0; t.cracks = null;
    t.mark = 0; t.tilt = 0; t.press = 0; t.pressVel = 0;
  }

  /* =========================================================
   *  렌더
   * ======================================================= */
  function draw(ctx, t, now, sx, sy) {
    if (t.gap) { drawGap(ctx, sx, sy); if (t.aim > 0) drawAim(ctx, t, sx, sy, now); return; }

    var m = material(t.mat);
    var thick = Iso.TZ * m.thick;
    var sink = t.press * Iso.TZ * 0.75 * m.squish + t.broken * thick * 0.9;
    var topY = sy - thick + sink;
    var hw = Iso.TW / 2, hh = Iso.TH / 2;
    var alpha = 1 - t.broken * 0.72;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 떠 있는 느낌의 아래 그림자
    ctx.save();
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy + hh * 0.5, hw * 0.78, hh * 0.72, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    // 완전히 부서진 자리는 타일 대신 '빈 구멍'을 그린다
    if (t.broken > 0.55) {
      drawHole(ctx, t, m, sx, sy, hw, hh, alpha);
      ctx.restore();
      return;
    }

    var sideH = Math.max(1, sy - topY);
    if (t.tilt) { ctx.translate(sx, topY); ctx.rotate(t.tilt); ctx.translate(-sx, -topY); }
    drawSides(ctx, m, sx, topY, hw, hh, sideH);

    // 윗면 바탕
    var wob = t.wobble * Math.sin(now * 26 + t.seed) * 0.035 * m.squish;
    var g = ctx.createLinearGradient(sx - hw, topY - hh, sx + hw, topY + hh);
    g.addColorStop(0, m.top);
    g.addColorStop(1, m.topDark);
    ctx.fillStyle = g;
    diamond(ctx, sx, topY, 1 + wob, 1 + wob);
    ctx.fill();

    // 재질 고유의 표면 구조 — 여기서 "무슨 소리가 날지" 알 수 있다
    ART[m.art](ctx, t, m, sx, topY, hw, hh, now);

    // 소리와 동기화된 발광
    if (t.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha * t.flash * 0.45;
      ctx.fillStyle = m.glow;
      diamond(ctx, sx, topY, 1 + wob, 1 + wob);
      ctx.fill();
      ctx.restore();
    }

    // 균열
    if (t.cracks && t.broken < 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(30,14,4,.6)';
      ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      for (var c = 0; c < t.cracks.length; c++) {
        var L = t.cracks[c];
        ctx.beginPath();
        ctx.moveTo(sx + L[0] * hw, topY + L[1] * hh);
        ctx.lineTo(sx + L[2] * hw, topY + L[3] * hh);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 밟은 자국 — 재질에 따라 발자국·눌린 홈·젖은 얼룩
    if (t.mark > 0.02) drawMark(ctx, t, m, sx, topY, hw, hh);

    // 남은 내구도 점 — 몇 번 더 밟으면 부서지는지 보여 준다
    if (m.durability > 0 && t.broken < 1) {
      var left = m.durability - t.damage;
      ctx.save();
      for (var dpi = 0; dpi < m.durability; dpi++) {
        var dx = sx + (dpi - (m.durability - 1) / 2) * 9;
        var dy = topY + hh * 0.72;
        ctx.beginPath();
        ctx.arc(dx, dy, 2.6, 0, 6.2832);
        ctx.fillStyle = dpi < left ? 'rgba(255,255,255,.85)' : 'rgba(40,20,8,.35)';
        ctx.fill();
      }
      ctx.restore();
    }

    // 퀴즈 타일 표식
    if (t.role !== 'plain' && t.state === 'idle') {
      ctx.strokeStyle = 'rgba(24,16,44,.45)'; ctx.lineWidth = 2.5;
      diamond(ctx, sx, topY, 0.96, 0.96); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.4;
      diamond(ctx, sx, topY, 0.9, 0.9); ctx.stroke();
    }

    // 상태
    if (t.state === 'done') {
      var breathe = 0.18 + 0.08 * Math.sin(now * 2.4 + t.seed);
      ctx.fillStyle = 'rgba(142,240,192,' + breathe.toFixed(3) + ')';
      diamond(ctx, sx, topY, 0.94, 0.94); ctx.fill();
      ctx.strokeStyle = 'rgba(142,240,192,.95)'; ctx.lineWidth = 3;
      diamond(ctx, sx, topY, 0.94, 0.94); ctx.stroke();
    } else if (t.state === 'wrong') {
      ctx.strokeStyle = 'rgba(255,154,168,.95)'; ctx.lineWidth = 3;
      diamond(ctx, sx, topY, 0.94, 0.94); ctx.stroke();
    }

    // 점프 목표 표시
    if (t.aim > 0) drawAim(ctx, t, sx, topY, now);

    // 표면 글자
    if (t.label && t.broken < 0.6) drawSurfaceGlyph(ctx, t, sx, topY, m);

    ctx.restore();
  }

  /** 재질마다 옆면 구조도 다르다 */
  function drawSides(ctx, m, sx, topY, hw, hh, sideH) {
    ctx.fillStyle = m.side;
    ctx.beginPath();
    ctx.moveTo(sx - hw, topY); ctx.lineTo(sx, topY + hh);
    ctx.lineTo(sx, topY + hh + sideH); ctx.lineTo(sx - hw, topY + sideH);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = m.side2;
    ctx.beginPath();
    ctx.moveTo(sx + hw, topY); ctx.lineTo(sx, topY + hh);
    ctx.lineTo(sx, topY + hh + sideH); ctx.lineTo(sx + hw, topY + sideH);
    ctx.closePath(); ctx.fill();

    if (m.art === 'keycap') {
      // 키캡: 위가 좁아지는 사다리꼴처럼 보이도록 밝은 면취선
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx - hw, topY + 2); ctx.lineTo(sx, topY + hh + 2); ctx.lineTo(sx + hw, topY + 2);
      ctx.stroke();
    } else if (m.art === 'wood') {
      // 나무: 옆면에도 널판 두께선
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - hw, topY + sideH * 0.55); ctx.lineTo(sx, topY + hh + sideH * 0.55);
      ctx.lineTo(sx + hw, topY + sideH * 0.55);
      ctx.stroke();
    } else if (m.art === 'jelly') {
      // 젤리: 옆면이 반투명하게 비친다
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(sx - hw * 0.75, topY + hh * 0.3);
      ctx.lineTo(sx - hw * 0.2, topY + hh * 0.85);
      ctx.lineTo(sx - hw * 0.2, topY + hh * 0.85 + sideH * 0.55);
      ctx.lineTo(sx - hw * 0.75, topY + hh * 0.3 + sideH * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  /* =========================================================
   *  재질별 윗면 아트 — 실루엣만 봐도 소리가 예상되게
   * ======================================================= */
  var ART = {

    /* 기계식 키캡: 오목한 상판 + 도톰한 테두리 + 스쿱 반사 */
    keycap: function (ctx, t, m, cx, cy, hw, hh) {
      // 바깥 테두리(돌출)
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5;
      diamond(ctx, cx, cy, 0.9, 0.9); ctx.stroke();
      // 오목한 상판
      var g = ctx.createLinearGradient(cx, cy - hh * 0.7, cx, cy + hh * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,.14)');
      g.addColorStop(0.55, 'rgba(255,255,255,.18)');
      g.addColorStop(1, 'rgba(0,0,0,.08)');
      ctx.fillStyle = g;
      diamond(ctx, cx, cy, 0.76, 0.76); ctx.fill();
      ctx.strokeStyle = 'rgba(60,66,105,.35)'; ctx.lineWidth = 1.2;
      diamond(ctx, cx, cy, 0.76, 0.76); ctx.stroke();
      // 오목한 면에 맺히는 스쿱 반사.
      // (십자 스템 자국은 수학 문제에서 '+' 기호로 오인될 수 있어 쓰지 않는다)
      if (!t.label) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath();
        ctx.ellipse(cx, cy - hh * 0.22, hw * 0.34, hh * 0.13, 0, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = 'rgba(60,66,105,.12)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + hh * 0.26, hw * 0.4, hh * 0.15, 0, 0, 6.2832);
        ctx.fill();
        ctx.restore();
      }
    },

    /* 솜: 울퉁불퉁 부푼 상판 + 보송한 솜털 */
    cotton: function (ctx, t, m, cx, cy, hw, hh, now) {
      ctx.save();
      // 부푼 덩어리 네 개를 겹쳐 물렁한 실루엣을 만든다.
      // 각 덩어리 아래에 그림자를 깔아야 "솜뭉치"로 읽힌다.
      var puffs = [
        [-0.36, -0.06, 0.44], [0.32, -0.18, 0.38],
        [0.06, 0.24, 0.46], [-0.06, -0.3, 0.32]
      ];
      for (var p = 0; p < puffs.length; p++) {
        var px = cx + puffs[p][0] * hw, py = cy + puffs[p][1] * hh, pr = puffs[p][2];
        // 아래 그림자로 덩어리를 분리
        ctx.fillStyle = 'rgba(150,80,115,.45)';
        ctx.beginPath();
        ctx.ellipse(px, py + hh * 0.07, hw * pr, hh * pr * 1.05, 0, 0, 6.2832);
        ctx.fill();
        // 덩어리 본체
        var pg = ctx.createRadialGradient(px - hw * pr * 0.35, py - hh * pr * 0.5, 1, px, py, hw * pr);
        pg.addColorStop(0, 'rgba(255,255,255,1)');
        pg.addColorStop(0.72, 'rgba(255,240,248,.96)');
        pg.addColorStop(1, 'rgba(246,206,226,.9)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(px, py, hw * pr, hh * pr * 1.05, 0, 0, 6.2832);
        ctx.fill();
      }
      // 보송한 솜털
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      for (var f = 0; f < 12; f++) {
        var a = t.seed + f * 0.523;
        var rx = Math.cos(a) * hw * 0.66, ry = Math.sin(a) * hh * 0.66;
        ctx.beginPath();
        ctx.moveTo(cx + rx * 0.84, cy + ry * 0.84);
        ctx.lineTo(cx + rx * 1.1, cy + ry * 1.1);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* 젤리: 반투명 + 큰 하이라이트 + 안쪽 기포 */
    jelly: function (ctx, t, m, cx, cy, hw, hh, now) {
      // 안쪽이 비쳐 보이는 코어
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#1f7f5a';
      diamond(ctx, cx, cy + hh * 0.12, 0.62, 0.62); ctx.fill();
      ctx.restore();
      // 큼직한 광택
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.62)';
      ctx.beginPath();
      ctx.ellipse(cx - hw * 0.26, cy - hh * 0.28, hw * 0.26, hh * 0.3, -0.5, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.ellipse(cx + hw * 0.3, cy + hh * 0.12, hw * 0.12, hh * 0.14, 0.4, 0, 6.2832);
      ctx.fill();
      // 안쪽 기포
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      for (var b = 0; b < 3; b++) {
        var a = t.seed + b * 2.1;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * hw * 0.34, cy + Math.sin(a) * hh * 0.34, 2.4 + b * 0.7, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
      // 흐물거리는 윤곽
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
      diamond(ctx, cx, cy, 0.92, 0.92); ctx.stroke();
    },

    /* 낙엽: 잎사귀가 실제로 얹혀 있다 */
    leaf: function (ctx, t, m, cx, cy, hw, hh) {
      // 부서지기 직전까지 잎이 한 장은 남도록 내구도에 맞춰 줄인다
      var leaves = Math.max(1, Math.ceil(4 * (1 - t.damage / m.durability)));
      var tone = ['#e28a33', '#bd5a20', '#d8a341', '#a4462a'];
      var spots = [[-0.4, -0.02, 0.45], [0.34, -0.26, -0.75],
                   [0.12, 0.32, 0.25], [-0.1, -0.36, 2.2]];
      for (var k = 0; k < leaves; k++) {
        var sp = spots[k];
        ctx.save();
        ctx.translate(cx + sp[0] * hw, cy + sp[1] * hh);
        ctx.scale(1, 0.56);                      // 바닥에 누운 원근
        ctx.rotate(sp[2] + t.seed * 0.18);
        var L = 21;

        // 잎자루 — 이것 하나로 '꽃잎'이 아니라 '잎'이 된다
        ctx.strokeStyle = 'rgba(74,42,14,.8)';
        ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, L * 0.8); ctx.lineTo(0, L * 1.3); ctx.stroke();

        // 잎몸 — 한쪽이 더 부푼 비대칭 실루엣
        ctx.fillStyle = tone[k % tone.length];
        ctx.beginPath();
        ctx.moveTo(0, -L);
        ctx.bezierCurveTo(L * 0.78, -L * 0.4, L * 0.58, L * 0.44, 0, L * 0.84);
        ctx.bezierCurveTo(-L * 0.62, L * 0.4, -L * 0.7, -L * 0.46, 0, -L);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(62,30,8,.55)'; ctx.lineWidth = 1.2; ctx.stroke();

        // 주맥과 측맥 — 성기게. 촘촘하면 바큇살처럼 보인다
        ctx.strokeStyle = 'rgba(62,30,8,.45)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(0, -L * 0.88); ctx.lineTo(0, L * 0.78); ctx.stroke();
        ctx.lineWidth = 0.85;
        for (var v = -L * 0.5; v <= L * 0.45; v += L * 0.42) {
          ctx.beginPath();
          ctx.moveTo(0, v); ctx.lineTo(L * 0.5, v + L * 0.3);
          ctx.moveTo(0, v); ctx.lineTo(-L * 0.5, v + L * 0.3);
          ctx.stroke();
        }
        ctx.restore();
      }
    },

    /* 에어캡: 볼록한 돔이 격자로 박혀 있다 */
    bubble: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      // 비닐 시트의 광택
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      diamond(ctx, cx, cy, 0.88, 0.88); ctx.fill();

      var cells = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
      var popped = Math.round(cells.length * t.damage / m.durability);
      for (var k = 0; k < cells.length; k++) {
        var bx = cx + (cells[k][0] - cells[k][1]) * hw * 0.3;
        var by = cy + (cells[k][0] + cells[k][1]) * hh * 0.3;
        if (k < popped) {
          // 터진 자리 — 쭈글쭈글한 주름만 남는다
          ctx.strokeStyle = 'rgba(40,90,120,.55)'; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.ellipse(bx, by, 9, 4.4, 0, 0, 6.2832); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(bx - 6, by - 1.2); ctx.lineTo(bx + 2, by + 1.8);
          ctx.lineTo(bx + 6, by - 1.6);
          ctx.stroke();
        } else {
          // 부푼 돔 — 넓고 낮게
          var gg = ctx.createRadialGradient(bx - 3.4, by - 3, 0.8, bx, by, 11);
          gg.addColorStop(0, 'rgba(255,255,255,.98)');
          gg.addColorStop(0.5, 'rgba(216,242,255,.9)');
          gg.addColorStop(1, 'rgba(112,176,212,.68)');
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.ellipse(bx, by, 11, 6.6, 0, 0, 6.2832); ctx.fill();
          ctx.strokeStyle = 'rgba(66,128,168,.5)'; ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.95)';
          ctx.beginPath();
          ctx.ellipse(bx - 3.2, by - 2.1, 3, 1.6, -0.4, 0, 6.2832);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    /* 나무: 널판 이음새 + 나뭇결 + 못 자국 */
    wood: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      // 널판 이음새 두 줄 (아이소 방향을 따라)
      ctx.strokeStyle = 'rgba(60,35,12,.35)'; ctx.lineWidth = 1.6;
      for (var p = -1; p <= 1; p += 2) {
        var off = p * 0.33;
        ctx.beginPath();
        ctx.moveTo(cx - hw + Math.abs(off) * hw, cy + off * hh);
        ctx.lineTo(cx + hw - Math.abs(off) * hw, cy + off * hh);
        ctx.stroke();
      }
      // 나뭇결
      ctx.strokeStyle = 'rgba(60,35,12,.16)'; ctx.lineWidth = 1;
      for (var k = 0; k < 4; k++) {
        var y = cy + (k - 1.5) * hh * 0.24;
        ctx.beginPath();
        ctx.moveTo(cx - hw * 0.72, y);
        ctx.quadraticCurveTo(cx, y + (k % 2 ? 3 : -3), cx + hw * 0.72, y);
        ctx.stroke();
      }
      // 못 자국
      ctx.fillStyle = 'rgba(60,35,12,.4)';
      var nails = [[-0.52, 0], [0.52, 0]];
      for (var n = 0; n < nails.length; n++) {
        ctx.beginPath();
        ctx.arc(cx + nails[n][0] * hw, cy + nails[n][1] * hh, 1.9, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    },

    /* 슬라임: 가장자리에서 흘러내리는 가닥 + 떠오르는 기포 */
    slime: function (ctx, t, m, cx, cy, hw, hh, now) {
      ctx.save();
      // 안쪽에서 비쳐 보이는 점액 덩어리
      var g = ctx.createRadialGradient(cx - hw * 0.2, cy - hh * 0.2, 2, cx, cy, hw * 0.9);
      g.addColorStop(0, 'rgba(255,255,255,.5)');
      g.addColorStop(0.5, 'rgba(190,160,255,.35)');
      g.addColorStop(1, 'rgba(90,60,170,.45)');
      ctx.fillStyle = g;
      diamond(ctx, cx, cy, 0.94, 0.94); ctx.fill();

      // 아래쪽 두 변에서 축 늘어져 흘러내리는 가닥.
      // (가운데를 가로지르면 수학 기호처럼 보이므로 가장자리에만 그린다)
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.lineCap = 'round';
      for (var k = 0; k < 4; k++) {
        var side = (k < 2) ? -1 : 1;            // 왼쪽 아래 / 오른쪽 아래 변
        var u = 0.25 + (k % 2) * 0.42;          // 변 위에서의 위치
        var ex = cx + side * hw * (1 - u) * 0.92;
        var ey = cy + hh * u * 0.92;
        var drip = 7 + Math.sin(now * 1.5 + t.seed + k) * 3.5;
        var w = 3.2 - (k % 2) * 1.1;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.quadraticCurveTo(ex + side * 1.5, ey + drip * 0.6, ex + side * 0.5, ey + drip);
        ctx.stroke();
        // 가닥 끝에 맺힌 방울
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.beginPath();
        ctx.arc(ex + side * 0.5, ey + drip, w * 0.75, 0, 6.2832);
        ctx.fill();
      }

      // 안에서 천천히 떠오르는 큰 기포
      for (var b = 0; b < 5; b++) {
        var ba = t.seed * 1.7 + b * 1.27;
        var br = 3.4 + (b % 3) * 2.2;
        var bx = cx + Math.cos(ba) * hw * (0.2 + (b % 3) * 0.16);
        var by = cy + Math.sin(ba) * hh * (0.2 + (b % 3) * 0.16) + Math.sin(now * 0.9 + b) * 1.5;
        ctx.fillStyle = 'rgba(255,255,255,.42)';
        ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(bx - br * 0.3, by - br * 0.35, br * 0.28, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    },

    /* 구슬볼: 말랑한 구슬이 잔뜩 — 밟을수록 하나씩 사라진다 */
    orbeez: function (ctx, t, m, cx, cy, hw, hh) {
      var hues = [340, 20, 290, 200, 130, 355, 45];
      var total = 9;
      var gone = Math.round(total * t.damage / m.durability);
      ctx.save();
      for (var k = 0; k < total; k++) {
        if (k < gone) {
          // 터진 자리: 젖은 얼룩
          var wa = t.seed + k * 0.9;
          ctx.fillStyle = 'rgba(160,80,120,.2)';
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(wa) * hw * 0.42, cy + Math.sin(wa) * hh * 0.42, 6, 3, 0, 0, 6.2832);
          ctx.fill();
          continue;
        }
        var a = t.seed + k * 0.9;
        var rr = (k % 3 === 0) ? 0.18 : 0.44;
        var bx = cx + Math.cos(a) * hw * rr;
        var by = cy + Math.sin(a) * hh * rr;
        var rad = 5.2 + (k % 3);
        var bg = ctx.createRadialGradient(bx - rad * 0.35, by - rad * 0.4, 0.5, bx, by, rad);
        bg.addColorStop(0, 'rgba(255,255,255,.95)');
        bg.addColorStop(0.55, 'hsla(' + hues[k % hues.length] + ',85%,80%,.9)');
        bg.addColorStop(1, 'hsla(' + hues[k % hues.length] + ',70%,58%,.85)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(bx, by, rad, rad * 0.72, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath(); ctx.ellipse(bx - rad * 0.3, by - rad * 0.3, rad * 0.26, rad * 0.18, -0.4, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    },

    /* 모래: 알갱이 결 + 바람에 쓸린 줄무늬 */
    sand: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      // 바람에 쓸린 잔물결. 직선으로 그으면 곧바로 나뭇결이 된다
      ctx.strokeStyle = 'rgba(146,116,66,.26)'; ctx.lineWidth = 1.5;
      for (var k = 0; k < 4; k++) {
        var rr = 0.2 + k * 0.19;
        ctx.beginPath();
        ctx.ellipse(cx - hw * 0.08, cy + hh * 0.06, hw * rr, hh * rr * 0.95,
          0, 0.55 + k * 0.1, 2.95 + k * 0.1);
        ctx.stroke();
      }
      // 알갱이 — 크기를 섞어야 가루로 보인다
      for (var p = 0; p < 84; p++) {
        var a = t.seed * 2.3 + p * 2.399;
        var rad = Math.sqrt((p % 17) / 17) * 0.78;
        var gx = cx + Math.cos(a) * hw * rad;
        var gy = cy + Math.sin(a) * hh * rad;
        var big = (p % 11 === 0);
        ctx.fillStyle = (p % 3 === 0) ? 'rgba(255,250,228,.9)' : 'rgba(132,102,54,.42)';
        ctx.beginPath();
        ctx.arc(gx, gy, big ? 1.9 : 1.05, 0, 6.2832);
        ctx.fill();
      }
      // 눌린 자국(밟을수록 깊어짐)
      if (t.damage > 0) {
        ctx.fillStyle = 'rgba(110,88,45,' + (0.18 + t.damage * 0.12) + ')';
        diamond(ctx, cx, cy, 0.5, 0.5); ctx.fill();
      }
      ctx.restore();
    },

    /* 유리구슬: 투명 구슬 + 십자 반사 */
    glass: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      // 구슬이 놓인 자리
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      diamond(ctx, cx, cy, 0.72, 0.72); ctx.fill();

      var balls = [[-0.36, 0.04, 15], [0.28, -0.22, 12.5], [0.12, 0.3, 13.5]];
      for (var k = 0; k < balls.length; k++) {
        var bx = cx + balls[k][0] * hw, by = cy + balls[k][1] * hh, r = balls[k][2];

        // 바닥에 지는 그림자 — 있어야 '놓여 있는 구'로 보인다
        ctx.fillStyle = 'rgba(30,80,110,.32)';
        ctx.beginPath();
        ctx.ellipse(bx + 2.5, by + r * 0.52, r * 0.95, r * 0.36, 0, 0, 6.2832);
        ctx.fill();

        // 유리 몸통 — 위는 하얗게 뜨고 가장자리로 갈수록 짙어진다
        var g = ctx.createRadialGradient(bx - r * 0.32, by - r * 0.38, r * 0.08, bx, by, r);
        g.addColorStop(0, 'rgba(255,255,255,.97)');
        g.addColorStop(0.42, 'rgba(186,230,250,.8)');
        g.addColorStop(0.86, 'rgba(96,164,200,.72)');
        g.addColorStop(1, 'rgba(52,112,150,.9)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.2832); ctx.fill();

        // 속에 든 꼬임 — 유리구슬임을 단번에 알려 주는 무늬
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.lineWidth = r * 0.26; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx - r * 0.42, by + r * 0.22);
        ctx.quadraticCurveTo(bx, by - r * 0.5, bx + r * 0.44, by + r * 0.18);
        ctx.stroke();

        // 아래쪽에서 되비치는 빛
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        ctx.beginPath();
        ctx.ellipse(bx, by + r * 0.46, r * 0.4, r * 0.18, 0, 0, 6.2832);
        ctx.fill();

        // 점 하이라이트
        ctx.fillStyle = 'rgba(255,255,255,.98)';
        ctx.beginPath();
        ctx.ellipse(bx - r * 0.36, by - r * 0.42, r * 0.2, r * 0.13, -0.5, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    },

    /* 눈: 새하얀 결정 + 다져진 발자국 */
    snow: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      // 소복한 둔덕 — 아래에 푸른 그늘을 깔아야 덩어리로 읽힌다
      var mounds = [[-0.3, 0.08, 0.46], [0.26, -0.16, 0.4], [0.02, 0.26, 0.36]];
      for (var p = 0; p < mounds.length; p++) {
        var mx = cx + mounds[p][0] * hw, my = cy + mounds[p][1] * hh, mr = mounds[p][2];
        ctx.fillStyle = 'rgba(150,182,214,.5)';
        ctx.beginPath();
        ctx.ellipse(mx, my + hh * 0.09, hw * mr, hh * mr * 1.02, 0, 0, 6.2832);
        ctx.fill();
        var mg = ctx.createRadialGradient(mx - hw * mr * 0.3, my - hh * mr * 0.6, 1, mx, my, hw * mr);
        mg.addColorStop(0, 'rgba(255,255,255,1)');
        mg.addColorStop(1, 'rgba(226,238,250,.95)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.ellipse(mx, my, hw * mr, hh * mr, 0, 0, 6.2832);
        ctx.fill();
      }
      // 반짝이는 결정 — 네 갈래 별
      for (var k = 0; k < 7; k++) {
        var a2 = t.seed * 1.7 + k * 0.897;
        var rr = 0.2 + (k % 4) * 0.17;
        var sx2 = cx + Math.cos(a2) * hw * rr, sy2 = cy + Math.sin(a2) * hh * rr;
        var len = 3.4 + (k % 3);
        ctx.strokeStyle = 'rgba(120,168,214,.85)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx2 - len, sy2); ctx.lineTo(sx2 + len, sy2);
        ctx.moveTo(sx2, sy2 - len * 0.62); ctx.lineTo(sx2, sy2 + len * 0.62);
        ctx.stroke();
      }
      // 다져진 자국
      if (t.damage > 0) {
        ctx.fillStyle = 'rgba(140,175,210,' + (0.22 + t.damage * 0.14) + ')';
        diamond(ctx, cx, cy, 0.46, 0.46); ctx.fill();
      }
      ctx.restore();
    },

    /* 스펀지: 숭숭 뚫린 구멍 */
    sponge: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      for (var k = 0; k < 34; k++) {
        var a = t.seed * 1.9 + k * 2.399;
        var rad = Math.sqrt((k % 13) / 13) * 0.8;
        var px = cx + Math.cos(a) * hw * rad;
        var py = cy + Math.sin(a) * hh * rad;
        var r = 2.2 + (k % 4) * 1.7;
        // 구멍 속 — 깊어 보이도록 진하게
        ctx.fillStyle = 'rgba(104,68,10,.5)';
        ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.72, 0, 0, 6.2832); ctx.fill();
        // 구멍 테두리에 걸리는 빛
        ctx.strokeStyle = 'rgba(255,238,178,.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(px, py - r * 0.16, r * 0.92, r * 0.62, 0, 3.3, 6.1); ctx.stroke();
      }
      ctx.restore();
    }
  };

  /**
   * 부서진 자리 — 어두운 구멍과 삐죽삐죽한 테두리.
   * 곧 되살아나므로 복구 진행도에 맞춰 옅어진다.
   */
  function drawHole(ctx, t, m, sx, sy, hw, hh, alpha) {
    var fade = Math.min(1, (t.broken - 0.55) / 0.45);
    ctx.save();
    ctx.globalAlpha = fade;

    // 구멍 안쪽
    var g = ctx.createRadialGradient(sx, sy, 2, sx, sy, hw);
    g.addColorStop(0, 'rgba(6,8,20,.92)');
    g.addColorStop(1, 'rgba(10,12,28,.45)');
    ctx.fillStyle = g;
    diamond(ctx, sx, sy, 0.94, 0.94); ctx.fill();

    // 남은 조각들이 테두리에 삐죽 붙어 있다
    ctx.fillStyle = m.side2;
    for (var k = 0; k < 7; k++) {
      var a = t.seed + k * 0.9;
      var r0 = 0.72 + ((k * 5) % 3) * 0.1;
      var x0 = sx + Math.cos(a) * hw * r0;
      var y0 = sy + Math.sin(a) * hh * r0;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a + 0.5) * 7, y0 + Math.sin(a + 0.5) * 4);
      ctx.lineTo(x0 + Math.cos(a) * 9, y0 + Math.sin(a) * 5 - 4);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2;
    diamond(ctx, sx, sy, 0.94, 0.94); ctx.stroke();
    ctx.restore();
  }

  /** 밟은 자국 — 재질마다 남는 흔적이 다르다 */
  function drawMark(ctx, t, m, cx, cy, hw, hh) {
    var a = t.mark * 0.5;
    var mx = cx + t.markX * hw, my = cy + t.markY * hh;
    ctx.save();
    ctx.globalAlpha = a;

    if (m.art === 'sand' || m.art === 'snow') {
      // 푹 파인 발자국 두 개
      ctx.fillStyle = (m.art === 'snow') ? 'rgba(120,160,200,.85)' : 'rgba(110,86,44,.85)';
      for (var f = -1; f <= 1; f += 2) {
        ctx.beginPath();
        ctx.ellipse(mx + f * 7, my + f * 3.4, 6.5, 3.6, 0.5, 0, 6.2832);
        ctx.fill();
      }
    } else if (m.art === 'slime' || m.art === 'orbeez') {
      // 젖은 얼룩
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      ctx.beginPath();
      ctx.ellipse(mx, my, 13, 7, 0, 0, 6.2832);
      ctx.fill();
    } else {
      // 눌린 그림자
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath();
      ctx.ellipse(mx, my, 12, 6.5, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- 점프 목표 표시 ---------- */
  function drawAim(ctx, t, cx, cy, now) {
    // 흰 점선은 눈·모래·솜 타일 위에서 묻혔다. 청록으로 바꾸고
    // 은은한 맥동 대신 또렷하게 점멸시킨다.
    var on = Math.sin(now * 9) > -0.25 ? 1 : 0.2;
    ctx.save();
    ctx.globalAlpha = t.aim;

    ctx.fillStyle = 'rgba(0,229,255,' + (0.08 + on * 0.2) + ')';
    diamond(ctx, cx, cy, 0.99, 0.99); ctx.fill();

    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -now * 26;
    // 밝은 타일에서도 점선이 보이도록 어두운 밑선을 먼저 깐다
    ctx.strokeStyle = 'rgba(8,14,40,' + (0.3 + on * 0.45) + ')';
    ctx.lineWidth = 7;
    diamond(ctx, cx, cy, 0.99, 0.99); ctx.stroke();
    ctx.strokeStyle = 'rgba(94,246,255,' + on + ')';
    ctx.lineWidth = 3.5;
    diamond(ctx, cx, cy, 0.99, 0.99); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** 발판이 없는 빈칸 — 디디면 떨어지는 자리라는 것이 보여야 한다 */
  function drawGap(ctx, cx, cy) {
    var hw = Iso.TW / 2;
    ctx.save();
    var g = ctx.createRadialGradient(cx, cy, 2, cx, cy, hw);
    g.addColorStop(0, 'rgba(4,6,18,.5)');
    g.addColorStop(1, 'rgba(8,10,26,0)');
    ctx.fillStyle = g;
    diamond(ctx, cx, cy, 1, 1); ctx.fill();
    ctx.strokeStyle = 'rgba(126,136,196,.38)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 9]);
    diamond(ctx, cx, cy, 0.96, 0.96); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function diamond(ctx, cx, cy, kx, ky) {
    var w = (Iso.TW / 2) * (kx == null ? 1 : kx);
    var h = (Iso.TH / 2) * (ky == null ? 1 : ky);
    ctx.beginPath();
    ctx.moveTo(cx, cy - h); ctx.lineTo(cx + w, cy);
    ctx.lineTo(cx, cy + h); ctx.lineTo(cx - w, cy);
    ctx.closePath();
  }

  var FONT_STACK = '"Pretendard","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif';

  /** 한 타일에는 한 글자만. 반-아이소 전단으로 바닥에 쓴 글씨처럼 */
  function drawSurfaceGlyph(ctx, t, cx, cy, m) {
    var txt = String(t.label);
    var size = 34;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(1, 0.30, -0.30, 0.72, 0, 0);

    ctx.font = '900 ' + size + 'px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var w = ctx.measureText(txt).width;
    if (w > 62) {
      size = Math.max(14, Math.floor(size * 62 / w));
      ctx.font = '900 ' + size + 'px ' + FONT_STACK;
    }

    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.fillText(txt, 1.5, 2.5);

    ctx.lineWidth = Math.max(3.5, size * 0.2); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = (t.state === 'done') ? '#0c3b28' : m.ink;
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  /**
   * 메뉴의 '소리 도감'용 미니 아이콘.
   * 게임 속 타일과 같은 그림을 작은 캔버스에 그려 준다.
   */
  function drawIcon(ctx, matKey, w, h) {
    var m = material(matKey);
    var savedIso = Iso;
    Iso = { TW: w * 0.88, TH: h * 0.62, TZ: h * 0.3 };
    var cx = w / 2, cy = h * 0.52;
    var hw = Iso.TW / 2, hh = Iso.TH / 2;

    ctx.clearRect(0, 0, w, h);
    var sideH = h * 0.2;
    drawSides(ctx, m, cx, cy, hw, hh, sideH);
    var g = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
    g.addColorStop(0, m.top); g.addColorStop(1, m.topDark);
    ctx.fillStyle = g;
    diamond(ctx, cx, cy, 1, 1); ctx.fill();
    ART[m.art](ctx, { seed: 1.2, damage: 0, label: null }, m, cx, cy, hw, hh, 0);

    Iso = savedIso;
  }

  function setIso(iso) { Iso = iso; }

  return {
    MATERIALS: MATERIALS,
    material: material,
    isConsumable: isConsumable,
    make: make,
    stomp: stomp,
    update: update,
    draw: draw,
    drawIcon: drawIcon,
    surfaceOffset: surfaceOffset,
    thicknessOf: thicknessOf,
    isSolid: isSolid,
    reset: reset,
    setIso: setIso
  };
})();
