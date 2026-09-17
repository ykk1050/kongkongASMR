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
      label: '낙엽', sound: '바스락', klass: 'consumable', durability: 4,
      top: '#c9a273', topDark: '#a37c4d', side: '#8a6740', side2: '#6d5133',
      ink: '#33200a', glow: '#ffb267', thick: 0.62, squish: 0.35, art: 'leaf'
    },
    bubble: {
      label: '에어캡', sound: '뽁', klass: 'consumable', durability: 4,
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
      label: '구슬볼', sound: '톡톡', klass: 'consumable', durability: 4,
      top: '#ffe0ef', topDark: '#f2a8cb', side: '#d98cb0', side2: '#b56f92',
      ink: '#4a1030', glow: '#ffd0e6', thick: 0.85, squish: 0.9, art: 'orbeez'
    },
    sand: {
      label: '모래', sound: '사각', klass: 'consumable', durability: 4,
      top: '#f5ead0', topDark: '#d9c9a4', side: '#b9a77f', side2: '#978764',
      ink: '#3d2f12', glow: '#ffeec2', thick: 0.55, squish: 0.6, art: 'sand'
    },
    glass: {
      label: '유리구슬', sound: '챠랑', klass: 'elastic', durability: 0,
      top: '#d8f2ff', topDark: '#9cd4ee', side: '#7bb8d6', side2: '#5c95b3',
      ink: '#0d3446', glow: '#e8faff', thick: 1.0, squish: 0.35, art: 'glass'
    },
    snow: {
      label: '눈', sound: '뽀득', klass: 'consumable', durability: 4,
      top: '#ffffff', topDark: '#d7e6f5', side: '#b9cde0', side2: '#9bb0c6',
      ink: '#274055', glow: '#ffffff', thick: 0.7, squish: 0.75, art: 'snow'
    },
    sponge: {
      label: '스펀지', sound: '뽀드득', klass: 'elastic', durability: 0,
      top: '#ffc95e', topDark: '#e09a2c', side: '#c07f1f', side2: '#9a6516',
      ink: '#4a3306', glow: '#fff0bd', thick: 0.95, squish: 1.15, art: 'sponge'
    },

    /* ---- 확장 재질 2 ---- */
    water: {
      label: '물웅덩이', sound: '찰방', klass: 'elastic', durability: 0,
      top: '#bdefff', topDark: '#69c6ea', side: '#4aa4cd', side2: '#3a85aa',
      ink: '#06344a', glow: '#dff7ff', thick: 0.45, squish: 1.35, art: 'water'
    },
    gravel: {
      label: '자갈', sound: '자그락', klass: 'elastic', durability: 0,
      top: '#ccd0d8', topDark: '#9ba1ad', side: '#848a97', side2: '#686e7a',
      ink: '#23262e', glow: '#e4e7ee', thick: 0.8, squish: 0.28, art: 'gravel'
    },
    moss: {
      label: '이끼', sound: '폭신', klass: 'elastic', durability: 0,
      top: '#a8d96a', topDark: '#6da53c', side: '#59882f', side2: '#456b23',
      ink: '#1d3208', glow: '#d2f59a', thick: 0.85, squish: 1.0, art: 'moss'
    },
    foam: {
      label: '스티로폼', sound: '끼익', klass: 'elastic', durability: 0,
      top: '#fbfbf2', topDark: '#dcdcc9', side: '#c3c3b0', side2: '#a1a18f',
      ink: '#3c3c2a', glow: '#ffffff', thick: 1.0, squish: 0.55, art: 'foam'
    },
    paper: {
      label: '종이', sound: '구깃', klass: 'consumable', durability: 4,
      top: '#fdf6e6', topDark: '#e4d6b6', side: '#c8b894', side2: '#a4956f',
      ink: '#4a3a16', glow: '#fff4d2', thick: 0.5, squish: 0.45, art: 'paper'
    },
    ice: {
      label: '얼음', sound: '쩌억', klass: 'consumable', durability: 4,
      top: '#e4f8ff', topDark: '#9fd8ef', side: '#79b9d6', side2: '#5b96b4',
      ink: '#0a3a50', glow: '#eafcff', thick: 0.9, squish: 0.18, art: 'ice'
    }
  };

  /* 에어캡 알의 배치 — 타일 그림과 파티클이 **같은 자리**를 써야 한다.
     따로 두면 터지는 연출이 알에서 몇 픽셀 빗나가 붕 뜬다. */
  var BUBBLE_CELLS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  var BUBBLE_PER_STEP = 2;          // 한 번 밟을 때 터지는 알 수

  function material(key) { return MATERIALS[key] || MATERIALS.wood; }
  function isConsumable(key) { return material(key).klass === 'consumable'; }

  /* ---------- 타일 팩토리 ---------- */
  function make(i, j, mat) {
    return {
      i: i, j: j,
      mat: mat || 'wood',
      label: null,        // 표면에 그릴 한 글자
      role: 'plain',      // 'plain' | 'seq'
      payload: null,
      order: -1,
      correct: false,
      state: 'idle',      // 'idle' | 'done' | 'wrong'
      press: 0,
      pressVel: 0,
      damage: 0,          // 소모성 균열 단계
      broken: 0,          // 0..1 완전히 부서진 정도 (되돌아오지 않는다)
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
  function stomp(t, intensity, power, canBreak) {
    var m = material(t.mat);
    t.flash = 1;
    t.wobble = 1;

    // 밟은 자국을 남긴다 — 어디를 디뎠는지 눈에 보이게
    t.mark = 1;
    t.markX = (Math.random() - 0.5) * 0.3;
    t.markY = (Math.random() - 0.5) * 0.3;

    if (m.klass === 'consumable') {
      if (t.broken >= 1) return { sound: 'hollow', stage: 0, total: m.durability, gain: 0.3 };

      var wasPopped = t.damage * BUBBLE_PER_STEP;      // 에어캡: 지금까지 터진 알 수
      // 세게 내려찍어도 한 번은 한 단계 — durability 번째로 밟을 때 부서진다
      t.damage = Math.min(m.durability, t.damage + 1);
      t.press = Math.min(1, t.press + 0.35);
      t.pressVel = -4 * (0.5 + intensity);
      buildCracks(t);

      // 에어캡은 시트가 기울지 않는다 — 알만 꺼질 뿐
      t.tilt = t.mat === 'bubble'
        ? 0
        : (t.damage / m.durability) * 0.06 * (Math.random() < 0.5 ? -1 : 1);

      // 이 타일이 사라지면 판이 끊기는 자리라면, 금만 간 채로 버틴다.
      // 부서진 타일은 되살아나지 않으므로 여기서 막지 않으면 영영 못 건너간다.
      if (t.damage >= m.durability && !canBreak) t.damage = m.durability - 1;

      if (t.damage >= m.durability) {
        t.broken = 1;
        SK.Particles.shatter(t.i, t.j, t.mat, intensity);
        return { sound: 'shatter', stage: m.durability, total: m.durability, gain: 1 };
      }
      SK.Particles.crackBits(t.i, t.j, t.mat, t.damage / m.durability,
        wasPopped, Math.min(BUBBLE_CELLS.length, t.damage * BUBBLE_PER_STEP));
      return { sound: 'crack', stage: t.damage, total: m.durability, gain: 0.8 };
    }

    t.press = Math.min(1, t.press + 0.55 + intensity * 0.45);
    t.pressVel = -6 * (0.5 + intensity) * m.squish * (power > 1 ? 1.35 : 1);
    return { sound: 'step', stage: 0, total: 0, gain: 1 };
  }

  /** 균열 선을 미리 만들어 매 프레임 흔들리지 않게 고정 */
  function buildCracks(t) {
    // 에어캡에는 금이 가지 않는다 — 알이 터질 뿐이다
    if (t.mat === 'bubble') { t.cracks = null; return; }
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

  function update(t, dt) {
    if (t.press !== 0 || t.pressVel !== 0) {
      var k = 165, damp = 15;
      t.pressVel += (-k * t.press - damp * t.pressVel) * dt;
      t.press += t.pressVel * dt;
      if (Math.abs(t.press) < 0.002 && Math.abs(t.pressVel) < 0.02) { t.press = 0; t.pressVel = 0; }
    }
    if (t.wobble > 0) t.wobble = Math.max(0, t.wobble - dt * 2.2);
    if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 3.4);
    if (t.mark > 0) t.mark = Math.max(0, t.mark - dt * 0.75);
  }

  /* ---------- 높이 질의 ---------- */
  function thicknessOf(t) { return Iso.TZ * material(t.mat).thick; }

  function surfaceOffset(t) {
    if (!t) return 0;
    var m = material(t.mat);
    var thick = Iso.TZ * m.thick;
    var sink = t.press * Iso.TZ * 0.75 * m.squish + t.broken * thick * 0.9;
    return Math.max(0, thick - sink);
  }

  function isSolid(t) { return !!t && t.broken < 0.85; }

  /* =========================================================
   *  렌더
   * ======================================================= */
  function draw(ctx, t, now, sx, sy) {
    var m = material(t.mat);
    var thick = Iso.TZ * m.thick;
    var sink = t.press * Iso.TZ * 0.75 * m.squish + t.broken * thick * 0.9;
    var topY = sy - thick + sink;
    var hw = Iso.TW / 2, hh = Iso.TH / 2;
    // 에어캡은 '없어지는' 게 아니라 알만 꺼진 채 시트가 남으므로 덜 흐려진다
    var alpha = 1 - t.broken * (t.mat === 'bubble' ? 0.18 : 0.72);

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
      var leaves = Math.max(1, 4 - t.damage);
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

      var cells = BUBBLE_CELLS;
      var popped = t.damage * BUBBLE_PER_STEP;
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
      var gone = t.damage * 3;
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
      diamond(ctx, cx, cy, 0.99, 0.99); ctx.clip();

      // 1) 얼룩 — 고운 모래는 결코 한 가지 색이 아니다. 그라디언트 위에 큰 색 덩어리를
      //    몇 개 얹어야 '칠한 면'이 아니라 '쌓인 가루'로 읽힌다.
      for (var b = 0; b < 6; b++) {
        var ba = t.seed * 1.7 + b * 2.399;
        var br = 0.18 + rnd1(t.seed, b) * 0.42;
        var bx = cx + Math.cos(ba) * hw * 0.42, by = cy + Math.sin(ba) * hh * 0.42;
        var bg = ctx.createRadialGradient(bx, by, 1, bx, by, hw * br);
        var warm = b % 2 === 0;
        bg.addColorStop(0, warm ? 'rgba(255,246,216,.30)' : 'rgba(176,152,106,.24)');
        bg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(bx, by, hw * br, hh * br, 0, 0, 6.2832); ctx.fill();
      }

      // 2) 바람에 쓸린 잔물결 — 타일 바닥면(다이아몬드) 위에 눕혀서 그린다.
      //    화면 좌표에 그대로 그으면 바닥이 아니라 공중에 뜬 무늬로 보인다.
      //    마루 결과 달라 보이려면 능선이 조금씩 휘고 끊겨야 한다.
      //    (Iso.pushSurface 와 같은 행렬이지만 hw/hh 를 직접 써서 소리 도감 아이콘처럼
      //     타일 크기가 다른 곳에서도 그대로 맞는다)
      ctx.save();
      ctx.transform(hw, hh, -hw, hh, cx, cy);
      ctx.lineCap = 'round';
      for (var r = 0; r < 7; r++) {
        var v = -0.42 + r * 0.14 + (rnd1(t.seed, r + 20) - 0.5) * 0.04;
        var amp = 0.03 + rnd1(t.seed, r + 40) * 0.05;
        var ph = t.seed + r * 1.3;
        // 능선은 끊어져야 한다. 한 줄로 쭉 이으면 그 순간 마루 널판(나뭇결)이 된다.
        var gapAt = 0.2 + rnd1(t.seed, r + 80) * 0.5;
        ctx.beginPath();
        var pen = false;
        for (var s = 0; s <= 16; s++) {
          var u = -0.5 + s / 16;
          var yy = v + Math.sin(u * 7 + ph) * amp + Math.sin(u * 19 + ph * 2) * amp * 0.3;
          var on = Math.abs((s / 16) - gapAt) > 0.09;
          if (!on) { pen = false; continue; }
          if (!pen) { ctx.moveTo(u, yy); pen = true; } else ctx.lineTo(u, yy);
        }
        // 능선은 위쪽이 빛을 받고 아래쪽에 그늘이 진다 — 두 줄이 붙어 있어야 입체가 된다
        ctx.strokeStyle = 'rgba(255,250,230,.42)'; ctx.lineWidth = 0.016;
        ctx.stroke();
        ctx.translate(0, 0.018);
        ctx.strokeStyle = 'rgba(128,99,52,.34)'; ctx.lineWidth = 0.014;
        ctx.stroke();
        ctx.translate(0, -0.018);
      }
      ctx.restore();                                  // pushSurface 해제 (클립은 유지)

      // 3) 알갱이 — 밝은 것/중간/어두운 것 세 톤을 섞어야 가루로 보인다
      var TONE = ['rgba(255,252,236,.95)', 'rgba(214,190,146,.7)', 'rgba(124,96,50,.45)'];
      for (var p = 0; p < 110; p++) {
        var a = t.seed * 2.3 + p * 2.399;
        var rad = Math.sqrt((p % 23) / 23) * 0.84;
        var gx = cx + Math.cos(a) * hw * rad;
        var gy = cy + Math.sin(a) * hh * rad;
        ctx.fillStyle = TONE[p % 3];
        ctx.beginPath();
        ctx.arc(gx, gy, 0.8 + rnd1(t.seed, p) * 1.1, 0, 6.2832);
        ctx.fill();
      }
      // 굵은 알갱이 몇 알은 그림자를 달아 준다 — 표면 위에 '놓여 있게' 만드는 장치
      for (var q = 0; q < 7; q++) {
        var qa = t.seed * 0.9 + q * 2.1;
        var qr = 0.2 + rnd1(t.seed, q + 60) * 0.55;
        var qx = cx + Math.cos(qa) * hw * qr, qy = cy + Math.sin(qa) * hh * qr;
        var rr2 = 1.7 + rnd1(t.seed, q + 70) * 1.1;
        ctx.fillStyle = 'rgba(108,84,44,.4)';
        ctx.beginPath(); ctx.ellipse(qx + 1, qy + 0.9, rr2, rr2 * 0.6, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(250,240,212,.95)';
        ctx.beginPath(); ctx.arc(qx, qy, rr2 * 0.8, 0, 6.2832); ctx.fill();
      }

      // 4) 가장자리로 갈수록 어두워진다 — 모래가 테두리에서 흘러내리는 느낌
      var eg = ctx.createRadialGradient(cx, cy, hw * 0.3, cx, cy, hw);
      eg.addColorStop(0, 'rgba(0,0,0,0)');
      eg.addColorStop(1, 'rgba(92,70,34,.3)');
      ctx.fillStyle = eg;
      diamond(ctx, cx, cy, 0.99, 0.99); ctx.fill();

      // 5) 밟힌 자국 — 눌린 웅덩이와 밀려 나온 둔덕
      if (t.damage > 0) {
        var dd = Math.min(1, t.damage / 2);
        var pg = ctx.createRadialGradient(cx, cy - hh * 0.05, 1, cx, cy, hw * 0.46);
        pg.addColorStop(0, 'rgba(96,74,36,' + (0.34 + dd * 0.2) + ')');
        pg.addColorStop(0.75, 'rgba(128,102,58,' + (0.16 + dd * 0.12) + ')');
        pg.addColorStop(1, 'rgba(255,250,232,0)');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.ellipse(cx, cy, hw * 0.46, hh * 0.46, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(255,250,228,' + (0.3 + dd * 0.2) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(cx, cy + hh * 0.05, hw * 0.5, hh * 0.46, 0, 0.2, 2.94); ctx.stroke();
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
    snow: function (ctx, t, m, cx, cy, hw, hh, now) {
      ctx.save();
      diamond(ctx, cx, cy, 0.99, 0.99); ctx.clip();

      // 1) 눈은 빛을 속으로 들여보냈다 다시 내보낸다(표면하 산란). 위쪽은 거의 순백,
      //    아래쪽 그늘은 회색이 아니라 **푸른색**이어야 눈으로 읽힌다.
      var bg = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
      bg.addColorStop(0, 'rgba(255,255,255,.95)');
      bg.addColorStop(0.55, 'rgba(240,248,255,.5)');
      bg.addColorStop(1, 'rgba(150,186,222,.55)');
      ctx.fillStyle = bg;
      diamond(ctx, cx, cy, 0.99, 0.99); ctx.fill();

      // 2) 소복한 둔덕 — 푸른 그늘을 아래로 길게 깔아야 덩어리로 보인다
      var mounds = [[-0.30, 0.10, 0.46], [0.27, -0.15, 0.40], [0.03, 0.27, 0.34],
                    [-0.05, -0.30, 0.26]];
      for (var p = 0; p < mounds.length; p++) {
        var mx = cx + mounds[p][0] * hw, my = cy + mounds[p][1] * hh, mr = mounds[p][2];
        var sg = ctx.createRadialGradient(mx, my + hh * 0.12, 1, mx, my + hh * 0.12, hw * mr * 1.1);
        sg.addColorStop(0, 'rgba(132,170,210,.5)');
        sg.addColorStop(1, 'rgba(132,170,210,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(mx + hw * 0.02, my + hh * 0.12, hw * mr * 1.1, hh * mr * 1.1, 0, 0, 6.2832);
        ctx.fill();
        // 눈 둔덕은 테두리가 또렷하면 '흰 공'이 된다. 가장자리를 투명으로 빼서
        // 주변 눈에 녹아들게 해야 소복이 쌓인 덩어리로 읽힌다.
        var mg = ctx.createRadialGradient(mx - hw * mr * 0.34, my - hh * mr * 0.7, 1,
                                          mx, my, hw * mr);
        mg.addColorStop(0, 'rgba(255,255,255,1)');
        mg.addColorStop(0.55, 'rgba(250,253,255,.92)');
        mg.addColorStop(0.82, 'rgba(226,239,251,.55)');
        mg.addColorStop(1, 'rgba(214,231,247,0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.ellipse(mx, my, hw * mr * 1.12, hh * mr * 1.12, 0, 0, 6.2832);
        ctx.fill();
        // 꼭대기의 림 라이트 — 윗면에만 아주 옅게. 윤곽선이 되면 안 된다.
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(mx, my - hh * mr * 0.12, hw * mr * 0.62, hh * mr * 0.55, 0, 3.6, 5.8);
        ctx.stroke();
      }

      // 3) 고운 결정 가루 — 별 몇 개보다 '작은 점 수십 개'가 눈처럼 보인다
      for (var g = 0; g < 70; g++) {
        var ga = t.seed * 2.1 + g * 2.399;
        var gr = Math.sqrt((g % 19) / 19) * 0.86;
        var gx = cx + Math.cos(ga) * hw * gr, gy = cy + Math.sin(ga) * hh * gr;
        ctx.fillStyle = (g % 4 === 0) ? 'rgba(170,202,235,.55)' : 'rgba(255,255,255,.9)';
        ctx.beginPath(); ctx.arc(gx, gy, 0.7 + rnd1(t.seed, g) * 0.9, 0, 6.2832); ctx.fill();
      }

      // 4) 반짝임 — 결정 하나하나가 각도에 따라 번쩍인다. 서로 다른 위상으로 천천히
      //    깜빡이게 하면 정지 화면에서도 눈밭이 살아 있다.
      for (var k = 0; k < 9; k++) {
        var a2 = t.seed * 1.7 + k * 0.897;
        var rr = 0.16 + (k % 5) * 0.15;
        var sx2 = cx + Math.cos(a2) * hw * rr, sy2 = cy + Math.sin(a2) * hh * rr;
        var tw = 0.35 + 0.65 * Math.max(0, Math.sin((now || 0) * 1.6 + t.seed + k * 2.2));
        var len = (3.0 + (k % 3) * 1.4) * (0.6 + tw * 0.6);
        ctx.globalAlpha = 0.25 + tw * 0.75;
        ctx.strokeStyle = (k % 3 === 0) ? 'rgba(198,226,255,.95)' : 'rgba(255,255,255,.98)';
        ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx2 - len, sy2); ctx.lineTo(sx2 + len, sy2);
        ctx.moveTo(sx2, sy2 - len * 0.6); ctx.lineTo(sx2, sy2 + len * 0.6);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(sx2, sy2, 1.1, 0, 6.2832);
        ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 5) 다져진 자국 — 눌린 바닥은 푸르게 가라앉고, 밀려난 눈이 흰 테두리로 솟는다
      if (t.damage > 0) {
        var dd = Math.min(1, t.damage / 2);
        var pg = ctx.createRadialGradient(cx, cy - hh * 0.04, 1, cx, cy, hw * 0.44);
        pg.addColorStop(0, 'rgba(118,158,200,' + (0.42 + dd * 0.22) + ')');
        pg.addColorStop(0.72, 'rgba(160,194,228,' + (0.2 + dd * 0.14) + ')');
        pg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.ellipse(cx, cy, hw * 0.44, hh * 0.44, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 + dd * 0.35) + ')';
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.ellipse(cx, cy, hw * 0.47, hh * 0.47, 0, 0, 6.2832); ctx.stroke();
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
    },

    /* 물웅덩이: 고인 물 + 끊임없이 번지는 잔물결 */
    water: function (ctx, t, m, cx, cy, hw, hh, now) {
      ctx.save();
      // 가운데가 깊다 — 가장자리로 갈수록 얕고 밝아진다
      var g = ctx.createRadialGradient(cx, cy, 2, cx, cy, hw * 0.9);
      g.addColorStop(0, 'rgba(22,94,132,.55)');
      g.addColorStop(1, 'rgba(158,228,250,.25)');
      ctx.fillStyle = g;
      diamond(ctx, cx, cy, 0.9, 0.9); ctx.fill();

      // 가만히 있어도 물결이 번진다 — 정지 화면에서도 '물'로 읽히는 단서
      for (var k = 0; k < 3; k++) {
        var ph = ((now * 0.32 + t.seed * 0.15 + k * 0.34) % 1);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 1.6;
        diamond(ctx, cx, cy, 0.22 + ph * 0.64, 0.22 + ph * 0.64); ctx.stroke();
      }

      // 수면에 비친 빛
      ctx.fillStyle = 'rgba(255,255,255,.62)';
      ctx.beginPath();
      ctx.ellipse(cx - hw * 0.28, cy - hh * 0.26, hw * 0.2, hh * 0.09, -0.35, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    },

    /* 자갈: 모서리가 살아 있는 돌 — 둥글면 구슬이 된다 */
    gravel: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      var tone = ['#eceef3', '#c2c7d0', '#9aa0ac', '#d6dae1'];
      for (var k = 0; k < 15; k++) {
        var a = t.seed * 1.3 + k * 2.399;
        var rad = Math.sqrt((k % 11) / 11) * 0.76;
        var px = cx + Math.cos(a) * hw * rad, py = cy + Math.sin(a) * hh * rad;
        var r = 3.6 + (k % 4) * 1.5;

        ctx.fillStyle = 'rgba(38,42,52,.35)';
        ctx.beginPath(); ctx.ellipse(px + 1.4, py + r * 0.42, r, r * 0.46, 0, 0, 6.2832); ctx.fill();

        ctx.fillStyle = tone[k % tone.length];
        ctx.beginPath();
        for (var v = 0; v < 5; v++) {
          var va = a + v * 1.2566, vr = r * (0.72 + ((k + v) % 3) * 0.17);
          var vx = px + Math.cos(va) * vr, vy = py + Math.sin(va) * vr * 0.62;
          if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(58,64,76,.45)'; ctx.lineWidth = 0.9; ctx.stroke();
      }
      ctx.restore();
    },

    /* 이끼: 도톰한 덩어리 + 곤두선 잔털 */
    moss: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      for (var p = 0; p < 4; p++) {
        var a = t.seed + p * 1.57;
        var mx = cx + Math.cos(a) * hw * 0.3, my = cy + Math.sin(a) * hh * 0.3;
        ctx.fillStyle = (p % 2) ? 'rgba(98,162,50,.9)' : 'rgba(126,190,68,.9)';
        ctx.beginPath(); ctx.ellipse(mx, my, hw * 0.36, hh * 0.36, 0, 0, 6.2832); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(196,238,132,.85)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (var k = 0; k < 26; k++) {
        var aa = t.seed * 2.1 + k * 2.399;
        var rr = Math.sqrt((k % 9) / 9) * 0.74;
        var gx = cx + Math.cos(aa) * hw * rr, gy = cy + Math.sin(aa) * hh * rr;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + Math.cos(aa * 3) * 2, gy - 4 - (k % 3));
        ctx.stroke();
      }
      // 이끼는 늘 젖어 있다 — 물방울 두 알
      ctx.fillStyle = 'rgba(235,255,210,.75)';
      ctx.beginPath(); ctx.ellipse(cx - hw * 0.2, cy + hh * 0.18, 2.6, 1.8, 0, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + hw * 0.26, cy - hh * 0.1, 2, 1.4, 0, 0, 6.2832); ctx.fill();
      ctx.restore();
    },

    /* 스티로폼: 눌러 붙은 하얀 알갱이 */
    foam: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      for (var k = 0; k < 30; k++) {
        var a = t.seed * 1.1 + k * 2.399;
        var rad = Math.sqrt((k % 12) / 12) * 0.78;
        var px = cx + Math.cos(a) * hw * rad, py = cy + Math.sin(a) * hh * rad;
        var r = 3.6 + (k % 3) * 1.2;
        ctx.fillStyle = 'rgba(255,255,255,.96)';
        ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(150,150,128,.42)'; ctx.lineWidth = 0.9; ctx.stroke();
      }
      ctx.restore();
    },

    /* 종이: 어긋나게 겹친 낱장 + 밟을수록 늘어나는 구김 */
    paper: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      ctx.fillStyle = 'rgba(252,246,230,.95)';
      ctx.save(); ctx.translate(-3.5, -2.5); diamond(ctx, cx, cy, 0.84, 0.84); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,250,.98)';
      diamond(ctx, cx, cy, 0.8, 0.8); ctx.fill();
      ctx.strokeStyle = 'rgba(150,132,90,.5)'; ctx.lineWidth = 1;
      diamond(ctx, cx, cy, 0.8, 0.8); ctx.stroke();

      var folds = 3 + t.damage * 2;
      ctx.strokeStyle = 'rgba(146,124,76,.42)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      for (var k = 0; k < folds; k++) {
        var a = t.seed + k * 1.27;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * hw * 0.6, cy + Math.sin(a) * hh * 0.6);
        ctx.lineTo(cx + Math.cos(a + 2.1) * hw * 0.46, cy + Math.sin(a + 2.1) * hh * 0.46);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* 얼음: 속이 비치는 판 + 갇힌 기포 + 결빙선 */
    ice: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      var g = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
      g.addColorStop(0, 'rgba(255,255,255,.72)');
      g.addColorStop(0.5, 'rgba(190,232,248,.45)');
      g.addColorStop(1, 'rgba(126,192,222,.6)');
      ctx.fillStyle = g;
      diamond(ctx, cx, cy, 0.9, 0.9); ctx.fill();

      // 얼음판을 가로지르는 결빙선
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      for (var k = 0; k < 3; k++) {
        var a = t.seed * 0.7 + k * 1.05;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * hw * 0.74, cy + Math.sin(a) * hh * 0.74);
        ctx.lineTo(cx - Math.cos(a + 0.4) * hw * 0.68, cy - Math.sin(a + 0.4) * hh * 0.68);
        ctx.stroke();
      }
      // 안에 갇힌 기포
      for (var b = 0; b < 6; b++) {
        var ba = t.seed * 1.9 + b * 1.31;
        var br = 0.18 + (b % 3) * 0.2;
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(ba) * hw * br, cy + Math.sin(ba) * hh * br,
          1.8 + (b % 2), 1.3 + (b % 2) * 0.6, 0, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  /**
   * 부서진 자리 — 어두운 구멍과 삐죽삐죽한 테두리.
   * 이 구멍은 그대로 남는다. 다시 채워지지 않는다.
   */
  function drawHole(ctx, t, m, sx, sy, hw, hh, alpha) {
    var fade = Math.min(1, (t.broken - 0.55) / 0.45);

    /* 에어캡은 **깨지지 않는다**. 알이 전부 터졌을 뿐이라 시트는 그대로 남는다.
       여기서 어두운 구멍과 삐죽한 파편을 그리면 비닐이 유리처럼 보인다. */
    if (t.mat === 'bubble') { drawPoppedSheet(ctx, t, m, sx, sy, hw, hh, fade); return; }

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

  /** 알이 전부 터진 에어캡 — 납작하게 주저앉은 비닐 시트와 주름만 남는다 */
  function drawPoppedSheet(ctx, t, m, sx, sy, hw, hh, fade) {
    ctx.save();
    ctx.globalAlpha = 1;

    // 바람 빠진 시트 — 가운데가 살짝 꺼지고 가장자리가 들린다
    var g = ctx.createRadialGradient(sx, sy, 2, sx, sy, hw);
    g.addColorStop(0, 'rgba(150,196,224,.95)');
    g.addColorStop(0.7, 'rgba(196,228,246,.95)');
    g.addColorStop(1, 'rgba(226,244,255,.95)');
    ctx.fillStyle = g;
    diamond(ctx, sx, sy, 0.92, 0.92); ctx.fill();
    ctx.strokeStyle = 'rgba(96,152,186,.75)'; ctx.lineWidth = 1.6;
    diamond(ctx, sx, sy, 0.92, 0.92); ctx.stroke();

    // 터진 알 자국 — 알이 있던 자리마다 쭈글쭈글한 주름
    ctx.strokeStyle = 'rgba(48,104,138,.8)';
    ctx.lineWidth = 1.5;
    for (var k = 0; k < BUBBLE_CELLS.length; k++) {
      var c = BUBBLE_CELLS[k];
      var bx = sx + (c[0] - c[1]) * hw * 0.3;
      var by = sy + (c[0] + c[1]) * hh * 0.3;
      ctx.beginPath(); ctx.ellipse(bx, by, 9, 4.4, 0, 0, 6.2832); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 6, by - 1.2); ctx.lineTo(bx + 2, by + 1.8);
      ctx.lineTo(bx + 6, by - 1.6);
      ctx.stroke();
    }

    // 비닐다운 미끈한 반사 한 줄
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - hw * 0.5, sy - hh * 0.12);
    ctx.quadraticCurveTo(sx, sy - hh * 0.4, sx + hw * 0.45, sy - hh * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- 점프 목표 표시 ----------
   *
   *  예전에는 흰 점선이었다. 그런데 이 게임에는 **눈·모래·솜·키캡처럼 윗면이 흰
   *  타일**이 있어서, 하필 그 위에서 조준 표시가 사라졌다. 힌트(노랑)·정답(초록)·
   *  오답(분홍)이 이미 쓰이고 있으므로 조준은 남은 청록(--aim)을 쓴다.
   *
   *  가시성을 세 겹으로 확보한다.
   *    1) 어두운 밑선 — 밝은 타일 위에서도 테두리가 끊기지 않는다
   *    2) 흐르는 청록 점선 + 글로우 — 어두운 타일 위에서 빛난다
   *    3) 깜빡임 + 밖으로 퍼지는 링 — 정지 화면에서도 눈에 먼저 들어온다
   */
  var AIM_RGB = '93,240,255';

  function drawAim(ctx, t, cx, cy, now) {
    var blink = 0.62 + 0.38 * Math.sin(now * 6.4);       // 약 1초에 한 번
    var a = t.aim;
    ctx.save();

    // 1) 어두운 밑선 — 흰 타일 위 대비 확보
    ctx.globalAlpha = a * 0.75;
    ctx.strokeStyle = 'rgba(6,20,32,.85)';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    diamond(ctx, cx, cy, 0.99, 0.99); ctx.stroke();

    // 2) 흐르는 점선 + 글로우
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(' + AIM_RGB + ',' + (0.55 + blink * 0.45) + ')';
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(' + AIM_RGB + ',.9)';
    ctx.shadowBlur = 10 + blink * 10;
    ctx.setLineDash([11, 8]);
    ctx.lineDashOffset = -now * 34;
    diamond(ctx, cx, cy, 0.99, 0.99); ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // 3) 밖으로 퍼지는 링 — 1.1초 주기로 한 번씩 번진다
    var w = (now % 1.1) / 1.1;
    ctx.globalAlpha = a * (1 - w) * 0.55;
    ctx.strokeStyle = 'rgba(' + AIM_RGB + ',1)';
    ctx.lineWidth = 2.5;
    diamond(ctx, cx, cy, 0.99 + w * 0.42, 0.99 + w * 0.42); ctx.stroke();

    // 안쪽 틴트 — 어느 칸이 잡혔는지 면으로도 보이게
    ctx.globalAlpha = a * (0.12 + blink * 0.14);
    ctx.fillStyle = 'rgba(' + AIM_RGB + ',1)';
    diamond(ctx, cx, cy, 0.99, 0.99); ctx.fill();

    // 네 꼭짓점 표식 — 점선이 마침 끊긴 자리에서도 모서리는 남는다
    ctx.globalAlpha = a * (0.6 + blink * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    var hw = Iso.TW / 2, hh = Iso.TH / 2;
    var pts = [[0, -hh], [hw, 0], [0, hh], [-hw, 0]];
    for (var k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(cx + pts[k][0] * 0.99, cy + pts[k][1] * 0.99, 3.2, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 타일마다 고정된 0~1 난수. Math.random()을 쓰면 매 프레임 무늬가 요동친다. */
  function rnd1(seed, k) {
    var v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
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
    BUBBLE_CELLS: BUBBLE_CELLS,
    setIso: setIso
  };
})();
