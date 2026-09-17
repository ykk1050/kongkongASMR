/* =============================================================
 *  소리 콩콩 — 캐릭터 컨트롤러 '콩콩이'
 *  타일이 서로 떨어져 있으므로 이동은 "한 칸 점프"로만 이뤄진다.
 *
 *   · 방향 입력(조이스틱/방향키)은 **조준만** 한다 — 그것만으로는 움직이지 않는다
 *   · 점프 버튼(쿵 / Space)을 눌러야 조준한 이웃 타일로 도약한다
 *   · 방향 없이 점프하면 제자리에서 강하게 내려찍는다(파괴력 2배)
 *   · 연속으로 빨리 뛸수록 착지 강도가 올라가 소리 피치·음량이 커진다
 * ============================================================= */
window.SK = window.SK || {};

SK.Player = (function () {

  var HOP_DUR = 0.30;        // 보통 도약 시간(초)
  var HOP_POWER_DUR = 0.44;  // 강한 도약
  var HOP_H = 0.62;          // 보통 도약 높이(격자 z 단위)
  var HOP_POWER_H = 1.25;
  var COOLDOWN = 0.05;       // 착지 후 다음 도약까지
  var AIM_HOLD = 0.35;       // 방향 키를 뗀 뒤 조준이 남아 있는 시간(초)

  /** 화면 8방향 → 격자 이웃 오프셋 */
  var DIRS = [
    { dx: 0, dy: -1, di: -1, dj: -1 },  // ↑
    { dx: 1, dy: -1, di: 0, dj: -1 },  // ↗
    { dx: 1, dy: 0, di: 1, dj: -1 },  // →
    { dx: 1, dy: 1, di: 1, dj: 0 },  // ↘
    { dx: 0, dy: 1, di: 1, dj: 1 },  // ↓
    { dx: -1, dy: 1, di: 0, dj: 1 },  // ↙
    { dx: -1, dy: 0, di: -1, dj: 1 },  // ←
    { dx: -1, dy: -1, di: -1, dj: 0 }   // ↖
  ];

  /* 각 방향의 **실제 화면 각도**.
   *
   *  아이소메트릭에서 이웃 타일은 화면상 45°씩 놓여 있지 않다. 타일이 2:1 다이아몬드
   *  (TW 116 × TH 58)이므로 이웃 여덟 칸은
   *
   *        -90° · -26.6° · 0° · +26.6° · +90° · +153.4° · 180° · -153.4°
   *
   *  에 있다. 예전 quantize() 는 이걸 균등한 45° 부채꼴로 나눠서, 화면에서 26.6°
   *  위에 보이는 타일을 조준하려면 스틱을 45°로 밀어야 했다 — **최대 18.4° 어긋남**.
   *  게다가 위·아래 방향은 63°짜리 넓은 구역을, 얕은 대각선은 26°짜리 좁은 구역을
   *  받아서 "위는 잘 되는데 대각선이 안 잡힌다"가 됐다.
   *
   *  이제는 실제 화면 벡터와의 내적이 가장 큰 방향을 고른다. 스틱이 가리키는 쪽에
   *  보이는 타일이 그대로 잡힌다.
   */
  var DIR_SCREEN = null;

  function screenDirs() {
    if (DIR_SCREEN) return DIR_SCREEN;
    var I = window.SK && SK.Iso;
    var tw = I ? I.TW : 116, th = I ? I.TH : 58;
    DIR_SCREEN = DIRS.map(function (d) {
      var x = (d.di - d.dj) * (tw / 2);
      var y = (d.di + d.dj) * (th / 2);
      var n = Math.hypot(x, y) || 1;
      return { x: x / n, y: y / n };
    });
    return DIR_SCREEN;
  }

  // 경계에서 방향이 파르르 떨리지 않도록, 이미 잡고 있던 방향에 주는 가산점
  var STICKY = 0.05;

  /**
   * 아날로그 입력(dx,dy)을 8방향 중 하나로 양자화.
   * @param {object} prev 직전 방향 — 있으면 히스테리시스가 걸린다
   */
  function quantize(dx, dy, prev) {
    var len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    var ux = dx / len, uy = dy / len;
    var S = screenDirs(), best = -2, bi = 0;
    for (var k = 0; k < S.length; k++) {
      var dot = ux * S[k].x + uy * S[k].y;
      if (prev === DIRS[k]) dot += STICKY;
      if (dot > best) { best = dot; bi = k; }
    }
    return DIRS[bi];
  }

  function create(ci, cj) {
    return {
      ci: ci, cj: cj,          // 현재(또는 착지 예정) 타일 좌표
      fromI: ci, fromJ: cj,
      x: ci, y: cj, z: 0,      // 렌더용 연속 좌표
      hopping: false,
      hopT: 0, hopDur: HOP_DUR, hopH: HOP_H,
      power: 1,                // 1=보통, 2=강한 점프
      cooldown: 0,
      chain: 0,                // 연속 도약 수 (강도 보너스)
      chainTimer: 0,
      aimDir: null,            // 현재 조준 중인 방향(목표 타일 표시에 사용)
      aimHold: 0,              // 방향 키를 뗀 뒤 조준이 남아 있는 시간
      facing: 1,
      squash: 0,
      stunTimer: 0,
      surface: 0,              // 발밑 타일의 윗면 높이(px) — 파묻힘 방지
      surfaceTarget: 0,
      justLanded: false,
      landIntensity: 0,
      blocked: 0               // 갈 수 없는 방향을 눌렀을 때의 반동
    };
  }

  /**
   * @param {object} p      플레이어
   * @param {object} input  {dx, dy, jump}  dx,dy는 화면 기준 -1..1
   * @param {number} dt
   * @param {object} world  {canEnter(i,j):boolean, surfaceOf(i,j):number}
   * @param {object} ev     {onTakeoff(power), onLand(intensity, power, i, j)}
   */
  function update(p, input, dt, world, ev) {
    p.justLanded = false;

    if (p.stunTimer > 0) {
      p.stunTimer -= dt;
      input = { dx: 0, dy: 0, jump: false };
    }
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p.blocked > 0) p.blocked = Math.max(0, p.blocked - dt * 4);

    // 연속 도약 체인 유지 시간
    if (p.chainTimer > 0) {
      p.chainTimer -= dt;
      if (p.chainTimer <= 0) p.chain = 0;
    }

    /* 조준 방향은 점프 여부와 상관없이 항상 갱신한다(목표 타일 표시용).
     *
     *  방향 키를 떼도 AIM_HOLD 동안은 조준이 살아 있다. **세 키를 동시에 누르지
     *  않아도 되게** 하려는 것이다 — 대각선 + 점프는 `↑`+`←`+`Space` 로 3키 동시
     *  입력인데, 값싼 키보드는 이 조합에서 한 키를 통째로 삼킨다(방향키 묶음에서
     *  특히 자주 일어난다). 조준이 잠깐 남아 있으면 **방향을 잡았다 떼고 점프**해도
     *  되므로 한 번에 두 키면 충분해진다.
     *
     *  제자리 내려찍기(방향 없이 점프)와 헷갈리지 않는다 — 조준 표시가 켜져 있으면
     *  그 칸으로 뛰고, 꺼져 있으면 내려찍기다. 화면에 보이는 그대로다.
     */
    var aim = quantize(input.dx, input.dy, p.aimDir);
    if (aim) {
      p.aimDir = aim;
      p.aimHold = AIM_HOLD;
    } else if (p.aimHold > 0) {
      p.aimHold = Math.max(0, p.aimHold - dt);
      if (p.aimHold === 0) p.aimDir = null;
    } else {
      p.aimDir = null;
    }

    if (p.hopping) {
      advanceHop(p, dt, world, ev);
    } else if (p.cooldown <= 0 && input.jump) {
      tryStartHop(p, input, world, ev);
    }

    // 발밑 타일의 윗면 높이를 부드럽게 따라가 캐릭터가 파묻히지 않게 한다
    p.surfaceTarget = world.surfaceOf(p.ci, p.cj);
    var k = p.hopping ? Math.min(1, dt * 22) : Math.min(1, dt * 16);
    p.surface += (p.surfaceTarget - p.surface) * k;

    // 스쿼시 복원
    p.squash += (0 - p.squash) * Math.min(1, dt * 11);
  }

  function tryStartHop(p, input, world, ev) {
    var dir = p.aimDir;
    // 방향을 잡고 뛰면 이동 도약, 방향 없이 뛰면 제자리 강타
    var power = dir ? 1 : 2;

    var ni = p.ci, nj = p.cj;
    if (dir) {
      ni = p.ci + dir.di;
      nj = p.cj + dir.dj;
      if (!world.canEnter(ni, nj)) {
        // 보드 밖이거나 발판이 사라진 자리 — 살짝 튕긴다
        p.blocked = 1;
        p.facing = dir.dx !== 0 ? (dir.dx > 0 ? 1 : -1) : p.facing;
        p.cooldown = 0.18;
        return;
      }
      p.facing = dir.dx !== 0 ? (dir.dx > 0 ? 1 : -1) : p.facing;
    }
    p.fromI = p.ci; p.fromJ = p.cj;
    p.ci = ni; p.cj = nj;
    p.hopping = true;
    p.hopT = 0;
    p.power = power;
    p.hopDur = power > 1 ? HOP_POWER_DUR : HOP_DUR;
    p.hopH = power > 1 ? HOP_POWER_H : HOP_H;
    p.squash = -0.3 * (power > 1 ? 1.4 : 1);

    if (ev && ev.onTakeoff) ev.onTakeoff(power);
  }

  function advanceHop(p, dt, world, ev) {
    p.hopT += dt / p.hopDur;

    if (p.hopT >= 1) {
      p.hopT = 1;
      p.x = p.ci; p.y = p.cj; p.z = 0;
      p.hopping = false;
      p.cooldown = COOLDOWN;

      p.chain = Math.min(6, p.chain + 1);
      p.chainTimer = 0.8;

      // 착지 강도: 도약 높이 + 연속 도약 체인
      var base = p.power > 1 ? 0.95 : 0.45;
      p.landIntensity = Math.min(1, base + p.chain * 0.07);
      p.squash = 0.5 * (p.power > 1 ? 1.5 : 1);
      p.justLanded = true;
      if (ev && ev.onLand) ev.onLand(p.landIntensity, p.power, p.ci, p.cj);
      return;
    }

    var t = p.hopT;
    p.x = p.fromI + (p.ci - p.fromI) * t;
    p.y = p.fromJ + (p.cj - p.fromJ) * t;
    p.z = Math.sin(Math.PI * t) * p.hopH;
    // 도약 중에는 살짝 늘어난다
    p.squash = -0.22 * Math.sin(Math.PI * t) * (p.power > 1 ? 1.3 : 1);
  }

  function stun(p, sec) { p.stunTimer = sec; p.chain = 0; p.aimHold = 0; p.aimDir = null; }

  /* ---------- 렌더 ---------- */

  /**
   * @param {number} sx,sy 지면선(z=0) 기준 캐릭터 발밑의 화면 좌표
   * @param {number} zpx   점프 높이(픽셀)
   */
  function draw(ctx, p, now, sx, sy, zpx) {
    var Iso = SK.Iso;

    // --- 그림자: 항상 발밑 타일 윗면에 붙는다 ---
    var shadowY = sy - p.surface;
    var shrink = 1 / (1 + (zpx / (Iso.TZ * 2)) * 0.9);
    ctx.save();
    ctx.globalAlpha = 0.34 * shrink;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, shadowY, 26 * shrink, 13 * shrink, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    var sq = p.squash;
    var w = 27 * (1 + sq * 0.5);
    var h = 30 * (1 - sq * 0.55);

    // 캐릭터의 발이 정확히 타일 윗면에 놓이도록 surface 만큼 올린다
    var cx = sx + (p.blocked > 0 ? Math.sin(now * 40) * 3 * p.blocked : 0);
    var cy = sy - p.surface - zpx - h;

    // --- 소리 오라: 출력 레벨에 맞춰 맥동하는 링 (소리 ↔ 시각 연결) ---
    var level = SK.Audio.getLevel ? SK.Audio.getLevel() : 0;
    if (level > 0.02) {
      ctx.save();
      ctx.translate(sx, shadowY);
      ctx.scale(1, Iso.TH / Iso.TW);
      ctx.strokeStyle = 'rgba(255,255,255,' + (level * 0.42) + ')';
      ctx.lineWidth = (2 + level * 5) * (Iso.TW / Iso.TH);
      ctx.beginPath();
      ctx.arc(0, 0, 30 + level * 52, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    if (p.stunTimer > 0) ctx.translate(Math.sin(now * 42) * 3, 0);

    // 발
    ctx.fillStyle = '#e6913f';
    ctx.beginPath(); ctx.ellipse(-w * 0.38, h * 0.92, 8, 4.5, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.38, h * 0.92, 8, 4.5, 0, 0, 6.2832); ctx.fill();

    // 몸통
    var g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, '#fff6d8');
    g.addColorStop(1, '#ffd66b');
    ctx.fillStyle = g;
    roundBody(ctx, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,50,10,.35)'; ctx.lineWidth = 2; ctx.stroke();

    // 귀
    ctx.fillStyle = '#ffd66b';
    ctx.beginPath(); ctx.ellipse(-w * 0.55, -h * 0.75, 6, 12, -0.35, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.55, -h * 0.75, 6, 12, 0.35, 0, 6.2832); ctx.fill();

    // 눈
    var blink = (Math.sin(now * 0.9) > 0.985) ? 0.15 : 1;
    ctx.fillStyle = '#2a2f52';
    ctx.beginPath(); ctx.ellipse(-8 + p.facing * 2, -h * 0.18, 3.4, 4.4 * blink, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8 + p.facing * 2, -h * 0.18, 3.4, 4.4 * blink, 0, 0, 6.2832); ctx.fill();

    // 볼터치
    ctx.fillStyle = 'rgba(255,140,160,.45)';
    ctx.beginPath(); ctx.ellipse(-14, -h * 0.02, 5, 3.2, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14, -h * 0.02, 5, 3.2, 0, 0, 6.2832); ctx.fill();

    // 헤드폰 (ASMR 컨셉) — 소리 레벨에 맞춰 이어컵이 살짝 빛난다
    ctx.strokeStyle = '#4a5080'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(0, -h * 0.55, w * 0.72, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
    ctx.fillStyle = level > 0.05 ? 'rgba(' + Math.round(74 + level * 180) + ',' + Math.round(80 + level * 150) + ',200,1)' : '#4a5080';
    ctx.beginPath(); ctx.ellipse(-w * 0.72, -h * 0.48, 4.6, 6.4, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.72, -h * 0.48, 4.6, 6.4, 0, 0, 6.2832); ctx.fill();

    ctx.restore();
  }

  function roundBody(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(w, -h, w * 1.05, h * 0.55, 0, h);
    ctx.bezierCurveTo(-w * 1.05, h * 0.55, -w, -h, 0, -h);
    ctx.closePath();
  }

  return {
    create: create, update: update, draw: draw, stun: stun,
    quantize: quantize, DIRS: DIRS
  };
})();
