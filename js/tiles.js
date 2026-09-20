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
      label: '키캡', sound: '톡', klass: 'elastic', durability: 0, ring: 0.14,
      top: '#eef0fa', topDark: '#c3c9e2', side: '#9aa2c2', side2: '#7d85a6',
      ink: '#2a2f52', glow: '#dfe4ff', thick: 1.05, squish: 0.5, art: 'keycap'
    },
    cotton: {
      label: '솜', sound: '포옥', klass: 'elastic', durability: 0, ring: 0.5,
      top: '#ffdcec', topDark: '#eaa8c8', side: '#d492b1', side2: '#b87796',
      ink: '#5b2340', glow: '#ffc9de', thick: 0.95, squish: 1.05, art: 'cotton'
    },
    jelly: {
      label: '젤리', sound: '통', klass: 'elastic', durability: 0, ring: 0.45,
      top: '#a9f7d3', topDark: '#4fcf99', side: '#37b783', side2: '#25946a',
      ink: '#093221', glow: '#8ef0c0', thick: 1.15, squish: 1.3, art: 'jelly'
    },
    leaf: {
      label: '낙엽', sound: '바스락', klass: 'consumable', durability: 4, ring: 0.3,
      top: '#c9a273', topDark: '#a37c4d', side: '#8a6740', side2: '#6d5133',
      ink: '#33200a', glow: '#ffb267', thick: 0.62, squish: 0.35, art: 'leaf'
    },
    bubble: {
      label: '에어캡', sound: '뽁', klass: 'consumable', durability: 4, ring: 0.22,
      top: '#dff4ff', topDark: '#a9ddf5', side: '#7fbfe0', side2: '#5b9ec2',
      ink: '#123a52', glow: '#a8e8ff', thick: 0.8, squish: 0.5, art: 'bubble'
    },
    wood: {
      label: '나무', sound: '탁', klass: 'elastic', durability: 0, ring: 0.2,
      top: '#dcb488', topDark: '#bb9061', side: '#9d7549', side2: '#7d5c39',
      ink: '#3b2510', glow: '#e8c9a0', thick: 0.88, squish: 0.22, art: 'wood'
    },

    /* ---- 확장 재질 ---- */
    slime: {
      label: '슬라임', sound: '찌걱', klass: 'elastic', durability: 0, ring: 0.5,
      top: '#c9b0ff', topDark: '#8f6fe0', side: '#7a5bc7', side2: '#5f45a3',
      ink: '#2a1656', glow: '#d9c4ff', thick: 0.9, squish: 1.45, art: 'slime'
    },
    orbeez: {
      label: '구슬볼', sound: '톡톡', klass: 'consumable', durability: 4, ring: 0.32,
      top: '#ffe0ef', topDark: '#f2a8cb', side: '#d98cb0', side2: '#b56f92',
      ink: '#4a1030', glow: '#ffd0e6', thick: 0.85, squish: 0.9, art: 'orbeez'
    },
    sand: {
      label: '모래', sound: '사각', klass: 'consumable', durability: 4, ring: 0.35,
      top: '#f5ead0', topDark: '#d9c9a4', side: '#b9a77f', side2: '#978764',
      ink: '#3d2f12', glow: '#ffeec2', thick: 0.55, squish: 0.6, art: 'sand'
    },
    glass: {
      label: '유리구슬', sound: '챠랑', klass: 'elastic', durability: 0, ring: 1.1,
      top: '#d8f2ff', topDark: '#9cd4ee', side: '#7bb8d6', side2: '#5c95b3',
      ink: '#0d3446', glow: '#e8faff', thick: 1.0, squish: 0.35, art: 'glass'
    },
    snow: {
      label: '눈', sound: '뽀득', klass: 'consumable', durability: 4, ring: 0.4,
      top: '#ffffff', topDark: '#d7e6f5', side: '#b9cde0', side2: '#9bb0c6',
      ink: '#274055', glow: '#ffffff', thick: 0.7, squish: 0.75, art: 'snow'
    },
    sponge: {
      label: '스펀지', sound: '뽀드득', klass: 'elastic', durability: 0, ring: 0.42,
      top: '#ffc95e', topDark: '#e09a2c', side: '#c07f1f', side2: '#9a6516',
      ink: '#4a3306', glow: '#fff0bd', thick: 0.95, squish: 1.15, art: 'sponge'
    },

    /* ---- 확장 재질 2 ---- */
    water: {
      label: '물웅덩이', sound: '찰방', klass: 'elastic', durability: 0, ring: 0.5,
      top: '#bdefff', topDark: '#69c6ea', side: '#4aa4cd', side2: '#3a85aa',
      ink: '#06344a', glow: '#dff7ff', thick: 0.45, squish: 1.35, art: 'water'
    },
    gravel: {
      label: '자갈', sound: '자그락', klass: 'elastic', durability: 0, ring: 0.3,
      top: '#ccd0d8', topDark: '#9ba1ad', side: '#848a97', side2: '#686e7a',
      ink: '#23262e', glow: '#e4e7ee', thick: 0.8, squish: 0.28, art: 'gravel'
    },
    cookie: {
      label: '쿠키', sound: '바삭', klass: 'consumable', durability: 4, ring: 0.26,
      top: '#e0a76a', topDark: '#b87940', side: '#9a6231', side2: '#7c4e26',
      ink: '#3b2008', glow: '#ffd39a', thick: 0.72, squish: 0.3, art: 'cookie'
    },
    metal: {
      label: '양철판', sound: '탱', klass: 'elastic', durability: 0, ring: 0.72,
      top: '#cfd8e0', topDark: '#94a3af', side: '#7c8b98', side2: '#5f6c78',
      ink: '#1d2830', glow: '#eaf4ff', thick: 0.62, squish: 0.12, art: 'metal'
    },
    paper: {
      label: '종이', sound: '구깃', klass: 'consumable', durability: 4, ring: 0.3,
      top: '#fdf6e6', topDark: '#e4d6b6', side: '#c8b894', side2: '#a4956f',
      ink: '#4a3a16', glow: '#fff4d2', thick: 0.5, squish: 0.45, art: 'paper'
    },
    ice: {
      label: '얼음', sound: '쩌억', klass: 'consumable', durability: 4, ring: 0.75,
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

    /* 걸음(power < 1)은 타일을 닳게 하지 않는다.
       연속으로 걷는 구간에서 한 걸음마다 내구도가 닳으면 산책길이 네 걸음 만에
       사라져 버린다. 금이 가고 부서지는 것은 **뛰어서 내려앉을 때**의 일이다. */
    if (m.klass === 'consumable' && power >= 1) {
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

  /**
   * 타일의 재질을 갈아 끼운다.
   *
   * 닳은 정도(`damage`)는 그 **칸의 이력**이라 그대로 둔다. 새 재질이라고 0으로
   * 되돌리면 닳던 발판이 문제마다 새것이 되어, "부서진 타일은 되살아나지 않는다"는
   * 규칙이 사실상 무력해진다. 남은 횟수는 내구도 점으로 늘 보이므로 숨겨지지도 않는다.
   * 다만 금은 재질마다 그리는 법이 달라(에어캡은 금이 안 간다) 다시 만들어 준다.
   *
   * 부서진 자리는 **재질까지 그대로** 둔다. 구멍 테두리에 남은 파편과 먼지 색이
   * 거기서 무엇이 깨졌는지 말해 주는데, 바닥이 바뀔 때마다 같이 칠해 버리면
   * 그 흔적이 지워진다.
   */
  function retexture(t, mat) {
    if (!t || t.mat === mat || t.broken > 0) return t;
    t.mat = mat;
    buildCracks(t);
    return t;
  }

  function update(t, dt) {
    if (t.press !== 0 || t.pressVel !== 0) {
      var k = 165, damp = 15;
      t.pressVel += (-k * t.press - damp * t.pressVel) * dt;
      t.press += t.pressVel * dt;
      if (Math.abs(t.press) < 0.002 && Math.abs(t.pressVel) < 0.02) { t.press = 0; t.pressVel = 0; }
    }
    if (t.wobble > 0) t.wobble = Math.max(0, t.wobble - dt * 2.2);
    // 발광은 그 재질의 소리 꼬리만큼 남는다 — 금속·유리는 길게, 키캡·나무는 탁 끊긴다
    if (t.flash > 0) t.flash = Math.max(0, t.flash - dt / (material(t.mat).ring || 0.3));
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
    drawArt(ctx, t, m, sx, topY, hw, hh, now);

    /* 소리와 동기화된 발광 + 표면을 가로지르는 접촉 파문.
       소리는 '한 점에서 퍼져 나가는 것'인데 지금까지는 타일 전체가 한꺼번에
       밝아지기만 했다. 밟은 자리에서 물결이 번져 나가면 귀로 듣는 것과
       눈으로 보는 것이 같은 사건이 된다. 재질의 ring(소리 꼬리)에 맞춰 퍼진다. */
    if (t.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha * t.flash * 0.4;
      ctx.fillStyle = m.glow;
      diamond(ctx, sx, topY, 1 + wob, 1 + wob);
      ctx.fill();
      ctx.restore();

      /* 밝은 타일(눈·양철판·종이) 위에서는 밝은 선만으로는 묻힌다.
         어두운 밑선을 먼저 깔아야 어느 재질 위에서든 파문이 보인다. */
      var spread = 1 - t.flash;                    // 0 → 1 로 번진다
      ctx.save();
      diamond(ctx, sx, topY, 1, 1); ctx.clip();
      var rx = sx + t.markX * hw, ry = topY + t.markY * hh;
      for (var w = 0; w < 2; w++) {
        var rr = (spread - w * 0.24) * 1.3;
        if (rr <= 0.02) continue;
        ctx.globalAlpha = alpha * t.flash * (w ? 0.5 : 0.9);
        ctx.strokeStyle = 'rgba(18,24,40,.55)';
        ctx.lineWidth = 4.2 * t.flash + 1.6;
        ctx.beginPath();
        ctx.ellipse(rx, ry + 1, hw * rr, hh * rr, 0, 0, 6.2832);
        ctx.stroke();
        ctx.strokeStyle = m.glow;
        ctx.lineWidth = 2.4 * t.flash + 0.9;
        ctx.beginPath();
        ctx.ellipse(rx, ry, hw * rr, hh * rr, 0, 0, 6.2832);
        ctx.stroke();
      }
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
  /* =========================================================
   *  타일 그림 캐시
   *
   *  자갈 한 칸에는 조약돌 26개가 들어 있고, 돌마다 방사형 그라데이션을 **매
   *  프레임 새로** 만들고 있었다. 판이 화면보다 넓어지면서 한 화면에 깔리는
   *  타일이 20칸에서 80칸으로 늘자 한 프레임이 26ms — 60fps 예산(16.7ms)을
   *  훌쩍 넘겨 눈에 보이게 버벅였다(그라데이션만 빼도 12ms로 줄었다).
   *
   *  그림이 움직이지 않는 재질은 **한 번 그려 두고 가져다 쓴다.** 움직이는 넷
   *  (jelly·slime·snow·water)만 매 프레임 그린다.
   *
   *  구울 때는 **지금 화면 배율 그대로** 굽는다. 안 그러면 blit 할 때 늘어나
   *  흐려진다. 배율은 캔버스 변환 행렬에서 읽어 오므로 따로 넘겨받을 필요가 없다.
   * ======================================================= */
  var ART_LIVE = { jelly: 1, slime: 1, water: 1 };
  /* 여백(그림이 다이아몬드 밖으로 나오는 양)은 **재서 정한다.**
     눈대중으로 16px 을 줬더니 자갈·모래·스펀지·종이·솜에서 그림이 잘렸다
     (알파가 255에서 0으로 뚝 끊겼다). 재질마다 삐져나오는 양이 달라서, 한 값으로
     맞추면 어딘가는 반드시 잘리거나 어딘가는 캔버스가 쓸데없이 커진다.
     그래서 재질마다 한 번, 넉넉한 캔버스에 그려 알파 경계를 재 둔다. */
  var ART_PAD_MAX = 90;
  var artPad = Object.create(null);

  function padOf(m, t, hw, hh) {
    var k = m.art;
    if (artPad[k] != null) return artPad[k];
    artPad[k] = ART_PAD_MAX;                 // 재는 동안 잘리지 않게 최대값
    if (typeof document === 'undefined') return artPad[k];

    var P = ART_PAD_MAX, W = (hw + P) * 2, H = (hh + P) * 2;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var probe = make(0, 0, t.mat);
    var over = 0, seeds = [0.2, 1.234, 2.7, 4.1, 5.9];
    for (var si = 0; si < seeds.length; si++) {
      for (var dmg = 0; dmg <= (m.durability || 0); dmg++) {
        c.clearRect(0, 0, W, H);
        probe.seed = seeds[si]; probe.damage = dmg;
        ART[k](c, probe, m, W / 2, H / 2, hw, hh, 0);
        var d = c.getImageData(0, 0, W, H).data;
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            if (d[(y * W + x) * 4 + 3] < 8) continue;
            var ox = Math.max((W / 2 - hw) - x, x - (W / 2 + hw));
            var oy = Math.max((H / 2 - hh) - y, y - (H / 2 + hh));
            if (ox > over) over = ox;
            if (oy > over) over = oy;
          }
        }
      }
    }
    artPad[k] = Math.min(ART_PAD_MAX, Math.ceil(over) + 3);   // 3px 안전 여유
    return artPad[k];
  }
  /* 한 판이 80칸 남짓이므로 넉넉히 200. 판을 새로 깔 때 비우므로 실제로는
     여기까지 차지 않는다 — 이건 혹시 모를 폭주를 막는 빗장이다. */
  var ART_MAX = 200;
  var artCache = Object.create(null), artCount = 0;

  var artCacheOn = true;     // 개발용 — 캐시를 끄고 같은 판을 비교할 때 쓴다

  function drawArt(ctx, t, m, sx, topY, hw, hh, now) {
    var fn = ART[m.art], over = ART_OVER[m.art];
    if (!artCacheOn || ART_LIVE[m.art] || typeof document === 'undefined' || !ctx.getTransform) {
      fn(ctx, t, m, sx, topY, hw, hh, now);
      if (over) over(ctx, t, m, sx, topY, hw, hh, now);
      return;
    }
    var tr = ctx.getTransform();
    var sc = Math.abs(tr.a) || 1;
    if (!(sc > 0.05 && sc < 8)) {
      fn(ctx, t, m, sx, topY, hw, hh, now);
      if (over) over(ctx, t, m, sx, topY, hw, hh, now);
      return;
    }
    /* 배율은 **뭉치지 않고 그대로** 쓴다. 0.05 단위로 뭉쳤더니 구운 그림과 화면
       배율이 미세하게 어긋나 blit 할 때 재표본되면서 가장자리가 흐려졌다(픽셀
       5%가 달라졌다). 배율은 창 크기가 바뀔 때만 변하므로 그대로 써도 캐시가
       잘게 쪼개지지 않는다. */
    sc = Math.round(sc * 1000) / 1000;

    var key = m.art + '|' + (t.seed || 0).toFixed(3) + '|' + (t.damage | 0) + '|' + sc;
    var img = artCache[key];
    if (!img) {
      if (artCount >= ART_MAX) { artCache = Object.create(null); artCount = 0; }
      var pad = padOf(m, t, hw, hh);
      var w = (hw + pad) * 2, h = (hh + pad) * 2;
      var cv = document.createElement('canvas');
      cv.width = Math.ceil(w * sc); cv.height = Math.ceil(h * sc);
      var c2 = cv.getContext('2d');
      c2.scale(sc, sc);
      fn(c2, t, m, w / 2, h / 2, hw, hh, now);
      img = { cv: cv, w: w, h: h };
      artCache[key] = img; artCount++;
    }
    ctx.drawImage(img.cv, sx - img.w / 2, topY - img.h / 2, img.w, img.h);
    if (over) over(ctx, t, m, sx, topY, hw, hh, now);
  }

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
      // 안쪽이 비쳐 보이는 코어 — 가장자리로 갈수록 짙어져야 '덩어리'가 된다
      ctx.save();
      var core = ctx.createRadialGradient(cx - hw * 0.18, cy - hh * 0.2, 2, cx, cy + hh * 0.1, hw * 0.8);
      core.addColorStop(0, 'rgba(210,255,236,.75)');
      core.addColorStop(0.55, 'rgba(66,196,146,.45)');
      core.addColorStop(1, 'rgba(18,116,84,.6)');
      ctx.fillStyle = core;
      diamond(ctx, cx, cy + hh * 0.04, 0.84, 0.84); ctx.fill();
      ctx.restore();

      // 표면이 부풀어 흔들린다 — 젤리는 평평하지 않다
      ctx.save();
      var wob = Math.sin(now * 2.2 + t.seed) * 0.02;
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath();
      ctx.ellipse(cx, cy - hh * 0.08, hw * (0.54 + wob), hh * (0.5 + wob), 0, 0, 6.2832);
      ctx.fill();
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

    /* 물웅덩이: 고인 물 + 번지는 잔물결 + 수면에 비친 빛.
       물은 '파란 면'이 아니라 **바닥이 비쳐 보이는 얕은 층**이다.
       가장자리에 젖은 테두리를 두르지 않으면 파란 종이로 보인다. */
    water: function (ctx, t, m, cx, cy, hw, hh, now) {
      ctx.save();

      // 젖은 가장자리 — 물이 고인 자리는 테두리가 진하다
      ctx.fillStyle = 'rgba(52,132,170,.5)';
      diamond(ctx, cx, cy, 0.99, 0.99); ctx.fill();

      // 고인 물 — 가운데가 깊고, 바닥 그림자가 비친다
      var g = ctx.createRadialGradient(cx - hw * 0.15, cy - hh * 0.2, 2, cx, cy, hw * 0.95);
      g.addColorStop(0, 'rgba(126,214,244,.5)');
      g.addColorStop(0.55, 'rgba(38,124,166,.62)');
      g.addColorStop(1, 'rgba(16,78,112,.72)');
      ctx.fillStyle = g;
      diamond(ctx, cx, cy, 0.9, 0.9); ctx.fill();

      // 바닥에 비친 하늘 — 위쪽 절반만 밝다
      ctx.fillStyle = 'rgba(200,244,255,.22)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh * 0.86);
      ctx.lineTo(cx + hw * 0.86, cy);
      ctx.lineTo(cx, cy - hh * 0.1);
      ctx.closePath(); ctx.fill();

      // 끊임없이 번지는 잔물결 — 정지 화면에서도 '물'로 읽히는 단서.
      // 마름모로 그리면 물이 아니라 도형이 된다. 물결은 원이고, 아이소에서 원은 타원이다
      for (var k = 0; k < 3; k++) {
        var ph = ((now * 0.32 + t.seed * 0.15 + k * 0.34) % 1);
        var rr = 0.14 + ph * 0.72;
        ctx.strokeStyle = 'rgba(232,252,255,' + (0.55 * (1 - ph) * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 1.9 * (1 - ph * 0.5);
        ctx.beginPath();
        ctx.ellipse(cx, cy - hh * 0.04, hw * rr, hh * rr, 0, 0, 6.2832);
        ctx.stroke();
        // 물결의 그늘 — 밝은 선 바로 아래 어두운 선이 붙어야 융기로 읽힌다
        ctx.strokeStyle = 'rgba(10,60,92,' + (0.3 * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(cx, cy - hh * 0.04 + 1.6, hw * rr, hh * rr, 0, 0, 6.2832);
        ctx.stroke();
      }

      // 수면 반사 — 흔들리는 두 줄
      ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.lineCap = 'round';
      for (var s = 0; s < 2; s++) {
        var sy = cy - hh * (0.3 - s * 0.26);
        var wob = Math.sin(now * 1.6 + t.seed + s) * 3;
        ctx.lineWidth = 2.2 - s * 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - hw * (0.34 - s * 0.1) + wob, sy);
        ctx.quadraticCurveTo(cx + wob * 0.5, sy - 2.5, cx + hw * (0.26 - s * 0.08) + wob, sy + 1);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* 자갈: 물에 닳아 **둥글고 맨들맨들한** 조약돌이 수북이 쌓여 있다.
       각진 돌은 부서진 콘크리트로 보인다. 조약돌은 세 가지로 읽힌다 —
       타원 실루엣 · 위쪽에 몰린 하이라이트 · 돌끼리 겹친 그림자. */
    gravel: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();

      // 돌 사이로 비치는 젖은 바닥
      ctx.fillStyle = 'rgba(74,78,84,.85)';
      diamond(ctx, cx, cy, 0.97, 0.97); ctx.fill();

      var tone = [
        ['#f4f6f9', '#c3c9d2', '#9aa2ad'],   // 흰 조약돌
        ['#e3d9cc', '#bfb2a2', '#948779'],   // 베이지
        ['#c7ccd3', '#9ba3ad', '#757d87'],   // 회색
        ['#b8b0a6', '#928a80', '#6d675f']    // 짙은 갈회색
      ];

      /* 아래쪽(뒤)에 깔린 돌부터 그려 위로 쌓아 올린다.
         같은 크기로 늘어놓으면 '알 박힌 판'이 되므로 크기를 크게 흔든다. */
      var stones = [];
      for (var k = 0; k < 26; k++) {
        var a = t.seed * 1.7 + k * 2.399;
        var rad = Math.sqrt((k % 16) / 16) * 0.88;      // 가장자리까지 깔리게
        stones.push({
          x: cx + Math.cos(a) * hw * rad,
          y: cy + Math.sin(a) * hh * rad,
          r: 4.4 + ((k * 7) % 5) * 1.5,
          rot: a * 0.7,
          tone: tone[k % tone.length]
        });
      }
      stones.sort(function (p1, p2) { return p1.y - p2.y; });

      for (var n = 0; n < stones.length; n++) {
        var st = stones[n];
        var rx = st.r, ry = st.r * 0.72;

        // 돌 밑 그림자 — 겹쳐 쌓인 느낌은 이 그림자에서 나온다
        ctx.fillStyle = 'rgba(28,30,34,.45)';
        ctx.beginPath();
        ctx.ellipse(st.x + 1.4, st.y + ry * 0.45, rx * 1.02, ry * 0.75, st.rot, 0, 6.2832);
        ctx.fill();

        // 몸통 — 위가 밝고 아래로 갈수록 어두운 둥근 돌
        var g = ctx.createRadialGradient(
          st.x - rx * 0.34, st.y - ry * 0.55, rx * 0.12,
          st.x, st.y, rx * 1.08);
        g.addColorStop(0, st.tone[0]);
        g.addColorStop(0.55, st.tone[1]);
        g.addColorStop(1, st.tone[2]);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(st.x, st.y, rx, ry, st.rot, 0, 6.2832);
        ctx.fill();

        // 맨들맨들한 표면 — 위쪽에 맺히는 좁은 하이라이트 한 점
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.beginPath();
        ctx.ellipse(st.x - rx * 0.3, st.y - ry * 0.45, rx * 0.26, ry * 0.2, st.rot - 0.4, 0, 6.2832);
        ctx.fill();

        // 아래쪽에서 되비치는 빛 — 돌이 '젖어' 보인다
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.beginPath();
        ctx.ellipse(st.x + rx * 0.12, st.y + ry * 0.42, rx * 0.5, ry * 0.2, st.rot, 0, 6.2832);
        ctx.fill();

        // 가장자리를 아주 옅게만 — 선이 굵으면 다시 각져 보인다
        ctx.strokeStyle = 'rgba(60,64,70,.28)'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(st.x, st.y, rx, ry, st.rot, 0, 6.2832);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* 쿠키: 도톰하게 구운 반죽 + 박힌 초코칩.
       밟을수록 가장자리가 부서져 나가고 칩이 줄어든다 — '바삭'이 눈에 보이게 */
    cookie: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();
      var wear = m.durability ? t.damage / m.durability : 0;

      // 구운 반죽 — 가장자리가 울퉁불퉁해야 '틀에 찍은 것'이 아니라 '구운 것'이 된다
      ctx.beginPath();
      for (var k = 0; k <= 26; k++) {
        var a = (k / 26) * 6.2832;
        var rr = 0.8 + Math.sin(a * 5 + t.seed) * 0.04 + Math.sin(a * 11 + t.seed * 2) * 0.02;
        // 밟은 만큼 한쪽이 크게 떨어져 나간다
        var chew = Math.cos(a - t.seed * 1.7);
        if (wear > 0 && chew > 1 - wear * 1.1) rr *= 0.58;
        var px = cx + Math.cos(a) * hw * rr, py = cy + Math.sin(a) * hh * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      var g = ctx.createRadialGradient(cx - hw * 0.2, cy - hh * 0.3, 2, cx, cy, hw * 0.85);
      g.addColorStop(0, '#e8b076');
      g.addColorStop(0.62, '#cd8f4f');
      g.addColorStop(1, '#a86a33');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(112,64,22,.55)'; ctx.lineWidth = 1.4; ctx.stroke();

      // 더 진하게 구워진 테두리 띠
      ctx.strokeStyle = 'rgba(150,88,34,.35)'; ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, hw * 0.66, hh * 0.66, 0, 0, 6.2832);
      ctx.stroke();

      // 초코칩 — 밟을수록 하나씩 떨어져 나간다
      var chips = [[-0.3, -0.12, 5.6], [0.24, -0.3, 4.8], [0.34, 0.16, 5.2],
                   [-0.08, 0.3, 4.4], [0.02, -0.02, 6], [-0.38, 0.22, 4]];
      var left = Math.max(2, Math.round(chips.length * (1 - wear)));
      for (var c = 0; c < left; c++) {
        var ch = chips[c];
        var bx = cx + ch[0] * hw, by = cy + ch[1] * hh, br = ch[2];
        ctx.fillStyle = 'rgba(60,32,14,.35)';
        ctx.beginPath(); ctx.ellipse(bx + 1.2, by + br * 0.4, br, br * 0.5, 0, 0, 6.2832); ctx.fill();
        var cg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.4, 0.5, bx, by, br);
        cg.addColorStop(0, '#6b4226');
        cg.addColorStop(1, '#3a2010');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(bx, by, br, br * 0.72, 0.3, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,224,190,.55)';
        ctx.beginPath(); ctx.ellipse(bx - br * 0.28, by - br * 0.3, br * 0.24, br * 0.16, -0.4, 0, 6.2832); ctx.fill();
      }

      // 표면의 기포 자국과 부스러기 — 마른 과자의 결
      for (var s = 0; s < 14; s++) {
        var sa = t.seed * 2.7 + s * 2.399, sr = Math.sqrt((s % 7) / 7) * 0.62;
        ctx.fillStyle = s % 3 ? 'rgba(122,72,30,.3)' : 'rgba(255,226,182,.5)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(sa) * hw * sr, cy + Math.sin(sa) * hh * sr, 1.3, 0, 6.2832);
        ctx.fill();
      }

      // 떨어져 나간 자리에 남는 부스러기
      if (wear > 0) {
        for (var b = 0; b < Math.round(wear * 7); b++) {
          var ba = t.seed * 1.7 + b * 1.1;
          ctx.fillStyle = 'rgba(178,116,56,.85)';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ba) * hw * 0.84, cy + Math.sin(ba) * hh * 0.84, 1.6 + (b % 2), 0, 6.2832);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    /* 양철판: 골이 진 함석 + 못머리.
       금속은 '회색'이 아니라 **반사**다. 밝은 띠와 어두운 띠를 붙여 놓아야 쇠로 보인다 */
    metal: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();

      // 판 전체에 흐르는 반사 — 위쪽은 하늘, 아래쪽은 바닥을 비춘다
      var g = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
      g.addColorStop(0, 'rgba(238,247,255,.85)');
      g.addColorStop(0.45, 'rgba(150,166,180,.5)');
      g.addColorStop(0.62, 'rgba(206,222,236,.7)');
      g.addColorStop(1, 'rgba(112,128,142,.6)');
      ctx.fillStyle = g;
      diamond(ctx, cx, cy, 0.96, 0.96); ctx.fill();

      // 골 — 밝은 선과 어두운 선을 나란히 그어야 주름이 선다.
      // 판 밖으로 나가면 철사처럼 보이므로 윗면 안쪽으로 잘라 낸다
      ctx.save();
      diamond(ctx, cx, cy, 0.96, 0.96); ctx.clip();
      ctx.lineCap = 'butt';
      for (var k = -3; k <= 3; k++) {
        var off = k * 0.22;
        var x0 = cx + off * hw - hw, y0 = cy + off * hh + hh;
        var x1 = cx + off * hw + hw, y1 = cy + off * hh - hh;
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(x0, y0 - 1.4); ctx.lineTo(x1, y1 - 1.4); ctx.stroke();
        ctx.strokeStyle = 'rgba(70,84,96,.45)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x0, y0 + 1); ctx.lineTo(x1, y1 + 1); ctx.stroke();
      }
      ctx.restore();

      // 네 귀퉁이의 못머리 — 판이 '고정돼 있다'는 신호
      var nails = [[-0.52, 0], [0.52, 0], [0, -0.52], [0, 0.52]];
      for (var n = 0; n < nails.length; n++) {
        var nx = cx + nails[n][0] * hw, ny = cy + nails[n][1] * hh;
        ctx.fillStyle = 'rgba(58,70,80,.55)';
        ctx.beginPath(); ctx.ellipse(nx + 0.8, ny + 1.2, 3.2, 2.2, 0, 0, 6.2832); ctx.fill();
        var ng = ctx.createRadialGradient(nx - 1, ny - 1.2, 0.3, nx, ny, 3.2);
        ng.addColorStop(0, '#f4f9ff');
        ng.addColorStop(1, '#8b9aa6');
        ctx.fillStyle = ng;
        ctx.beginPath(); ctx.ellipse(nx, ny, 3, 2, 0, 0, 6.2832); ctx.fill();
      }

      // 긁힌 자국 몇 줄 — 쓰던 판이라는 표시
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.9;
      for (var s2 = 0; s2 < 4; s2++) {
        var a2 = t.seed * 1.7 + s2 * 1.9, rr = 0.2 + (s2 % 3) * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a2) * hw * rr, cy + Math.sin(a2) * hh * rr);
        ctx.lineTo(cx + Math.cos(a2 + 0.6) * hw * (rr + 0.18), cy + Math.sin(a2 + 0.6) * hh * (rr + 0.18));
        ctx.stroke();
      }
      ctx.restore();
    },

    /* 종이: 어긋나게 겹친 낱장 + 밟을수록 깊어지는 구김.
       구김은 '접힌 선 + 그 선을 따라 밝아지는 면'이다. 선만 그으면 낙서가 된다 */
    paper: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();

      // 밑장 — 어긋난 자리마다 그늘이 있어야 '여러 장'으로 보인다
      for (var L = 2; L >= 1; L--) {
        ctx.save();
        ctx.translate(-L * 4.5, -L * 2.5);
        ctx.fillStyle = 'rgba(120,104,72,.35)';
        diamond(ctx, cx + 1.5, cy + 1.5, 0.86 - L * 0.01, 0.86 - L * 0.01); ctx.fill();
        ctx.fillStyle = L === 2 ? 'rgba(226,214,186,1)' : 'rgba(240,231,206,1)';
        diamond(ctx, cx, cy, 0.86 - L * 0.01, 0.86 - L * 0.01); ctx.fill();
        ctx.restore();
      }

      // 맨 윗장
      var g = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, '#fffdf4');
      g.addColorStop(1, '#f2e9d2');
      ctx.fillStyle = g;
      diamond(ctx, cx, cy, 0.8, 0.8); ctx.fill();
      ctx.strokeStyle = 'rgba(150,132,90,.55)'; ctx.lineWidth = 1;
      diamond(ctx, cx, cy, 0.8, 0.8); ctx.stroke();

      // 구김 — 접힌 선은 꺾인 V 다. 한쪽 면은 빛을 받고 다른 면은 그늘진다
      var folds = 1 + Math.min(2, t.damage);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var k = 0; k < folds; k++) {
        var a = t.seed + k * 1.9;
        var x0 = cx + Math.cos(a) * hw * 0.46, y0 = cy + Math.sin(a) * hh * 0.46;
        var xm = cx + Math.cos(a + 1.3) * hw * 0.16, ym = cy + Math.sin(a + 1.3) * hh * 0.16;
        var x1 = cx + Math.cos(a + 2.6) * hw * 0.42, y1 = cy + Math.sin(a + 2.6) * hh * 0.42;

        // 접힌 선을 따라 한쪽 면이 들려 밝아진다
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(xm, ym); ctx.lineTo(x1, y1);
        ctx.lineTo(x1, y1 - 3.5); ctx.lineTo(xm, ym - 4.5); ctx.lineTo(x0, y0 - 3.5);
        ctx.closePath(); ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x0, y0 - 1); ctx.lineTo(xm, ym - 1); ctx.lineTo(x1, y1 - 1); ctx.stroke();
        ctx.strokeStyle = 'rgba(150,126,78,.5)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(x0, y0 + 0.8); ctx.lineTo(xm, ym + 0.8); ctx.lineTo(x1, y1 + 0.8); ctx.stroke();
      }

      // 들린 모서리 — 종이는 절대 완전히 눕지 않는다
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath();
      ctx.moveTo(cx + hw * 0.62, cy + hh * 0.06);
      ctx.quadraticCurveTo(cx + hw * 0.5, cy - hh * 0.2, cx + hw * 0.3, cy - hh * 0.3);
      ctx.quadraticCurveTo(cx + hw * 0.56, cy - hh * 0.12, cx + hw * 0.62, cy + hh * 0.06);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(160,140,96,.5)'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.restore();
    },

    /* 얼음: 속이 비치는 판 + 갇힌 기포 + 결빙선.
       얼음은 '파란 유리'가 아니라 **하얗게 서린 면과 투명한 면이 섞인 것**이다 */
    ice: function (ctx, t, m, cx, cy, hw, hh) {
      ctx.save();

      var g = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
      g.addColorStop(0, 'rgba(255,255,255,.82)');
      g.addColorStop(0.45, 'rgba(186,230,248,.5)');
      g.addColorStop(1, 'rgba(110,182,214,.62)');
      ctx.fillStyle = g;
      diamond(ctx, cx, cy, 0.92, 0.92); ctx.fill();

      // 서리 낀 구역 — 반투명 면이 섞여야 유리와 구분된다
      for (var f = 0; f < 3; f++) {
        var fa = t.seed * 1.3 + f * 2.1;
        var fx = cx + Math.cos(fa) * hw * 0.3, fy = cy + Math.sin(fa) * hh * 0.3;
        var fg = ctx.createRadialGradient(fx, fy, 1, fx, fy, hw * 0.4);
        fg.addColorStop(0, 'rgba(255,255,255,.55)');
        fg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.ellipse(fx, fy, hw * 0.4, hh * 0.4, 0, 0, 6.2832); ctx.fill();
      }

      // 균열 — 가운데에서 꺾이며 뻗는다. 직선 여러 줄은 긁힌 자국으로 보인다.
      // 밝은 심 + 그 옆의 짙은 그늘이 한 쌍이어야 '갈라진 틈'이 된다
      var lines = 2 + t.damage;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var k = 0; k < lines; k++) {
        // 가장자리에서 출발해 안쪽으로 꺾여 들어간다 — 한 점에서 만나면 새 발자국이 된다
        var a = t.seed * 1.9 + k * 2.3;
        var pts = [[cx + Math.cos(a) * hw * 0.82, cy + Math.sin(a) * hh * 0.82]];
        var ang = a + Math.PI + (((k * 5) % 3) - 1) * 0.35;
        var rr = 0.82;
        for (var seg = 1; seg <= 3; seg++) {
          rr -= 0.22;
          ang += (((k + seg * 3) % 3) - 1) * 0.55;
          pts.push([cx + Math.cos(a) * hw * rr + Math.cos(ang) * hw * 0.12,
                    cy + Math.sin(a) * hh * rr + Math.sin(ang) * hh * 0.12]);
        }
        for (var pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? 'rgba(255,255,255,.95)' : 'rgba(44,112,150,.55)';
          ctx.lineWidth = pass ? 1.8 : 3.4;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1] + (pass ? 0 : 1.4));
          for (var q = 1; q < pts.length; q++) ctx.lineTo(pts[q][0], pts[q][1] + (pass ? 0 : 1.4));
          ctx.stroke();
        }
      }

      // 안에 갇힌 기포 — 위쪽이 밝은 작은 구
      for (var b = 0; b < 6; b++) {
        var ba = t.seed * 1.9 + b * 1.31;
        var br = 0.18 + (b % 3) * 0.2;
        var bx = cx + Math.cos(ba) * hw * br, by = cy + Math.sin(ba) * hh * br;
        var rr = 1.8 + (b % 2);
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.ellipse(bx, by, rr, rr * 0.72, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(92,150,180,.5)'; ctx.lineWidth = 0.7; ctx.stroke();
      }

      // 표면 반사 — 얼음은 늘 젖어 있다
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - hw * 0.42, cy - hh * 0.16);
      ctx.quadraticCurveTo(cx - hw * 0.1, cy - hh * 0.36, cx + hw * 0.26, cy - hh * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  };

  /* 캐시 위에 덧그리는 '살아 있는 층'.
     ART 는 씨앗·damage 가 같으면 결과가 같아야 캐시가 성립한다. 그런데 눈의
     반짝임은 now 를 읽어 매 프레임 달라진다 — 그 한 덩어리 때문에 눈 전체가
     캐시에서 빠져, 둔덕의 방사형 그라디언트 8개를 타일마다 매 프레임 다시
     그려야 했다(한 판에 72ms, 솜 바닥의 세 배). 그래서 변하지 않는 부분만
     굽고, 반짝임은 구운 그림 위에 실시간으로 얹는다. */
  var ART_OVER = {
    snow: function (ctx, t, m, cx, cy, hw, hh, now) {
      ctx.save();
      diamond(ctx, cx, cy, 0.99, 0.99); ctx.clip();
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
      ctx.restore();
    }
  };

  /**
   * 부서진 자리 — 어두운 구멍과 삐죽삐죽한 테두리.
   * 이 구멍은 그대로 남는다. 다시 채워지지 않는다.
   */
  function drawHole(ctx, t, m, sx, sy, hw, hh, alpha) {
    var fade = Math.min(1, (t.broken - 0.55) / 0.45);

    /* 예전에는 에어캡만 시트를 남겼다. 지금은 부서진 타일이 되살아나지 않으므로,
       시트가 남아 있으면 '밟을 수 있어 보이는데 못 밟는 자리'가 된다. 전부 구멍으로 통일한다. */

    ctx.save();
    ctx.globalAlpha = fade;

    // 구멍 안쪽
    var g = ctx.createRadialGradient(sx, sy, 2, sx, sy, hw);
    g.addColorStop(0, 'rgba(6,8,20,.92)');
    g.addColorStop(1, 'rgba(10,12,28,.45)');
    ctx.fillStyle = g;
    diamond(ctx, sx, sy, 0.94, 0.94); ctx.fill();

    /* 남은 조각들이 테두리에 삐죽 붙어 있다.
       전부 같은 어두운 색으로 그리면 '무엇이 부서진 자리'인지 알 수 없다.
       윗면 색을 물려받게 해서 눈·모래·쿠키 자리가 서로 구분되게 한다. */
    for (var k = 0; k < 9; k++) {
      var a = t.seed + k * 0.72;
      var r0 = 0.7 + ((k * 5) % 3) * 0.11;
      var x0 = sx + Math.cos(a) * hw * r0;
      var y0 = sy + Math.sin(a) * hh * r0;
      ctx.fillStyle = (k % 3 === 0) ? m.top : (k % 3 === 1 ? m.topDark : m.side2);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a + 0.5) * 7, y0 + Math.sin(a + 0.5) * 4);
      ctx.lineTo(x0 + Math.cos(a) * 9, y0 + Math.sin(a) * 5 - 4);
      ctx.closePath(); ctx.fill();
    }

    // 구멍 가장자리에 남은 재질 가루 — 방금 여기서 부서졌다는 흔적
    ctx.globalAlpha = fade * 0.5;
    ctx.fillStyle = m.glow;
    for (var g2 = 0; g2 < 10; g2++) {
      var ga = t.seed * 1.7 + g2 * 0.63, gr = 0.74 + (g2 % 3) * 0.08;
      ctx.beginPath();
      ctx.arc(sx + Math.cos(ga) * hw * gr, sy + Math.sin(ga) * hh * gr, 1.4 + (g2 % 2), 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = fade;
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
    retexture: retexture,
    /** 개발용 — 그림 캐시를 껐다 켠다(캐시가 그림을 바꾸지 않는지 비교할 때) */
    setArtCache: function (on) { artCacheOn = !!on; artCache = Object.create(null); artCount = 0; return artCacheOn; },
    /** 판을 새로 깔 때 부른다 — 지난 판의 씨앗으로 구운 그림은 다시 쓸 일이 없다 */
    clearArtCache: function () { artCache = Object.create(null); artCount = 0; },
    /** 개발용 — 재질별로 그림이 타일 밖으로 나오는 양(px) */
    artPads: function () { var o = {}; for (var k in artPad) o[k] = artPad[k]; return o; },
    stomp: stomp,
    update: update,
    draw: draw,
    drawIcon: drawIcon,
    surfaceOffset: surfaceOffset,
    thicknessOf: thicknessOf,
    isSolid: isSolid,
    rebuildCracks: buildCracks,
    BUBBLE_CELLS: BUBBLE_CELLS,
    setIso: setIso
  };
})();
