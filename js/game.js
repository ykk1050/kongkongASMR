/* =============================================================
 *  소리 콩콩 — 게임 코어
 *  · 타일이 한 칸씩 떨어져 떠 있고, 캐릭터는 한 칸씩 점프해 이동한다
 *  · 소리와 시각 효과가 항상 짝을 이룬다
 *  · HUD / 조이스틱 / 보드가 서로 겹치지 않도록 안전 영역을 계산해 배치한다
 * ============================================================= */
window.SK = window.SK || {};

SK.Game = (function () {

  /* 타일 사이 간격(격자 단위). 1이면 딱 붙고, 2면 한 칸이 완전히 빈다. */
  var SPACING = 1.85;

  var GRID = 5;
  var START = { i: 2, j: 2 };

  // 배경 바닥 재질 — 밟을 때마다 소리가 달라지도록 섞는다
  var AMBIENT_MATS = [
    'wood', 'wood', 'keycap', 'cotton', 'leaf', 'bubble',
    'sand', 'snow', 'glass', 'sponge', 'slime', 'orbeez',
    'wood', 'sand', 'bubble', 'snow'
  ];

  function ambientMat(i, j) {
    var h = (i * 73856093) ^ (j * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return AMBIENT_MATS[h % AMBIENT_MATS.length];
  }

  var cv, ctx, W = 0, H = 0, dpr = 1, scale = 1;
  var flash = 0, flashColor = '255,255,255';
  var tiles = [], tileAt = {};
  var player, cam = { x: 0, y: 0, shake: 0 };
  var view = { cx: 0, cy: 0 };            // 보드를 그릴 화면 중심(안전 영역 기준)
  var viewRect = null, boardWorld = null;  // 안전 영역 / 보드 월드 경계
  var session, fsm;
  var quizTiles = [];
  var running = false, lastT = 0, now = 0;
  var score = 0, combo = 0, streak = 0;
  var phase = 'idle';                      // idle | play | wrong | solved
  var phaseTimer = 0;
  var ui = {};

  var input = { dx: 0, dy: 0, jumpAt: -1e9, jumpHeld: false,
                keys: Object.create(null) };

  /* 점프 입력 버퍼.
   *
   *  ⚠ 예전에는 도약 중에 누른 점프가 **통째로 버려졌다**. 도약은 0.30초(큰 점프
   *  0.44초)이고 착지 후 쿨다운이 0.05초라, 연달아 움직이는 동안에는 상당 시간이
   *  '못 뛰는 구간'이다. 그 구간에 누른 Space 는 그냥 사라졌다 — 플레이어에게는
   *  "가끔 스페이스가 안 먹는다"로 보인다. 실제로 그랬다.
   *
   *  버퍼를 밀리초로 재는 것은 틀린 접근이었다. '못 뛰는 구간'의 길이가 도약 종류와
   *  쿨다운에 따라 달라서, 고정 시간으로는 구간 초반의 입력을 늘 놓친다.
   *
   *  그래서 시간이 아니라 **기회**로 센다 — 요청은 플레이어가 실제로 뛸 수 있게 되는
   *  프레임까지 살아 있고, 그 프레임에 소비된다(뛰었든, 갈 수 없는 방향이라 튕겼든).
   *  못 뛰는 동안에는 아무리 오래여도 유지되므로 입력이 사라지지 않는다.
   *  (조이스틱 '쿵' 버튼에도 똑같이 걸린다.) */
  var JUMP_STALE_MS = 900;          // 탭이 멈춰 있었을 때를 대비한 안전장치

  function requestJump() { input.jumpAt = performance.now(); }
  function consumeJump() { input.jumpAt = -1e9; }
  function jumpPending() { return performance.now() - input.jumpAt < JUMP_STALE_MS; }

  /* =========================================================
   *  좌표 변환 — 타일 간격을 반영한 격자 → 화면
   * ======================================================= */
  function world(gi, gj, gz) {
    return SK.Iso.toScreen(gi * SPACING, gj * SPACING, gz || 0);
  }

  /* =========================================================
   *  초기화
   * ======================================================= */
  function boot(canvas, refs) {
    cv = canvas; ctx = cv.getContext('2d');
    ui = refs;
    SK.Tiles.setIso(SK.Iso);
    SK.Particles.setProjector(function (gi, gj, gz) { return world(gi, gj, gz); });

    pickGrid();
    buildWorld();
    player = SK.Player.create(START.i, START.j);

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 160); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    bindKeys();
    bindVirtualControls();
  }

  /** 화면 크기에 맞춰 격자 크기를 고른다 (타일이 잘리지 않도록) */
  function pickGrid() {
    var w = window.innerWidth, h = window.innerHeight;
    var small = Math.min(w, h);
    GRID = (small < 480 || w < 620) ? 4 : (w < 1100 ? 5 : 6);
    START = { i: (GRID - 1) >> 1, j: (GRID - 1) >> 1 };
  }

  function buildWorld() {
    tiles = []; tileAt = {};
    for (var i = 0; i < GRID; i++) {
      for (var j = 0; j < GRID; j++) {
        var t = SK.Tiles.make(i, j, ambientMat(i, j));
        tiles.push(t);
        tileAt[i + ',' + j] = t;
      }
    }
  }

  function getTile(i, j) { return tileAt[i + ',' + j] || null; }
  function inBounds(i, j) { return i >= 0 && j >= 0 && i < GRID && j < GRID; }

  /* =========================================================
   *  퀴즈
   * ======================================================= */
  function startWith(quizzes, sourceLabel) {
    session = SK.Quiz.createSession(quizzes);
    fsm = SK.Quiz.createMachine();
    if (ui.loadNote) ui.loadNote.textContent = '문제 ' + quizzes.length + '개 · ' + sourceLabel;
    nextQuiz();
    if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(loop); }
  }

  function nextQuiz() {
    var q = session.next();
    if (!q) { ui.prompt.textContent = '해당 과목의 문제가 없습니다.'; return; }
    fsm.setQuiz(q);
    layoutQuiz(q);
    phase = 'play';
    SK.Audio.newQuiz();
    renderHUD(true);
  }

  /** 문제 타일을 바닥에 뿌린다 */
  function layoutQuiz(q) {
    for (var k = 0; k < quizTiles.length; k++) {
      var old = quizTiles[k];
      old.label = null; old.role = 'plain'; old.payload = null;
      old.state = 'idle'; old.hi = 0; old.order = -1; old.correct = false;
      old.mat = ambientMat(old.i, old.j);
      SK.Tiles.reset(old);
    }
    quizTiles = [];

    var cells = pickCells();
    var items = SK.Quiz.plan(q, cells.length);

    for (var n = 0; n < items.length && n < cells.length; n++) {
      var c = cells[n], it = items[n];
      var t = getTile(c.i, c.j);
      if (!t) continue;
      t.label = it.label;
      t.payload = it.token;
      t.role = 'seq';
      t.order = it.order;
      t.correct = it.correct;
      t.state = 'idle';
      t.hi = 0;
      t.mat = q.material;
      SK.Tiles.reset(t);
      quizTiles.push(t);
    }
  }

  /** 캐릭터가 서 있는 칸을 뺀 모든 칸을 섞어서 돌려준다 */
  function pickCells() {
    var cand = [];
    for (var i = 0; i < GRID; i++) {
      for (var j = 0; j < GRID; j++) {
        if (player && i === player.ci && j === player.cj) continue;
        cand.push({ i: i, j: j });
      }
    }
    return SK.Quiz.shuffle(cand);
  }

  /* =========================================================
   *  입력 — 키보드
   * ======================================================= */
  /* 키 하나가 곧 화면 방향 벡터다.
   *
   *  ⚠ **대각선을 동시입력에 기대지 않는다**
   *  대각선 + 점프는 `↑`+`←`+`Space` 로 세 키 동시입력이다. 값싼 키보드는 3키
   *  롤오버를 전부 받아 주지 못하고, 막히는 조합은 키 매트릭스 배선마다 다르다.
   *  특히 방향키 네 개는 서로 붙어 배선돼 있어 자주 걸린다 — "WASD로는 되는데
   *  방향키로는 대각선이 안 된다"가 실제 증상이다. 도착하지 않은 키 이벤트는
   *  JS에서 되살릴 수 없으므로, 애초에 동시에 누르지 않아도 되게 만든다.
   *
   *  대비책이 셋이다.
   *   1) Q·E·Z·C(넘패드 7·9·1·3) — **키 하나가 대각선 하나**
   *   2) COMBINE_MS — 방금 눌렀던 방향 키는 떼었어도 잠깐 함께 눌린 것으로 친다.
   *      `↑` 톡 → `←` 톡 처럼 **번갈아 눌러도** 대각선이 된다.
   *   3) Player 의 AIM_HOLD — 방향을 떼고 점프해도 조준이 남아 있다.
   *  셋을 합치면 한 번에 눌리는 키가 하나여도 대각선으로 뛸 수 있다.
   */
  /* 톡톡 이어 누른 방향들을 **한 묶음**으로 본다.
   *
   *  처음에는 "지금으로부터 260ms 안에 눌린 키"로 판정했는데, 사람이 ↓ 톡 → 톡 처럼
   *  천천히 누르면 마지막 키를 누를 때쯤 첫 키가 이미 만료돼 대각선이 안 잡혔다.
   *  기준이 틀렸던 것이다 — 중요한 건 '지금까지의 시간'이 아니라 **키와 키 사이의
   *  간격**이다. 앞 키를 누른 뒤 COMBINE_MS 안에 다음 키가 오면 같은 묶음으로 잇고,
   *  그보다 늦으면 새 묶음을 시작한다. 톡톡 리듬이 이어지는 한 계속 쌓인다.
   *
   *  묶음은 마지막 입력 뒤 COMBO_HOLD_MS 동안 살아 있고(그동안 점프하면 그 방향으로
   *  뛴다), 그 뒤엔 Player 의 AIM_HOLD 가 조금 더 끌고 가다 조준이 풀린다. */
  var COMBINE_MS = 400;      // 같은 묶음으로 이어지는 키 사이 최대 간격
  var COMBO_HOLD_MS = 350;   // 마지막 입력 뒤 묶음이 유지되는 시간

  /* ⚠ 이름 주의 — 이 파일에는 점수 배수용 `combo` 가 이미 있다(위쪽 var 선언).
     같은 이름을 쓰면 정답을 맞힌 순간 `combo = 숫자` 가 이 객체를 덮어써서
     방향 입력이 통째로 죽는다. 실제로 그렇게 망가뜨린 적이 있다. */
  var dirCombo = { codes: Object.create(null), lastAt: -1e9 };
  var KEYDIR = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],

    KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1],

    Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
    Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1]
  };
  /* 점프 키를 키보드 곳곳에 깔아 둔다.
     Space 가 삼켜지는 키보드라도 매트릭스 행이 다른 키 하나는 살아남는다. */
  var JUMPKEY = {
    Space: 1, Enter: 1, NumpadEnter: 1, Numpad0: 1, Numpad5: 1, NumpadAdd: 1,
    ShiftRight: 1, ControlRight: 1, Period: 1, Slash: 1,
    KeyJ: 1, KeyK: 1, KeyF: 1
  };


  function bindKeys() {
    window.addEventListener('keydown', function (e) {
      if (JUMPKEY[e.code]) {
        e.preventDefault();
        if (!input.keys[e.code]) { requestJump(); if (diagEl) pushDiag('down', e.code); }
        input.keys[e.code] = true;
        input.jumpHeld = true;
        return;
      }
      if (!KEYDIR[e.code]) return;
      e.preventDefault();
      if (!input.keys[e.code]) {                 // OS 자동 반복은 세지 않는다
        var tnow = performance.now();
        // 앞 키와의 간격이 벌어졌으면 새 묶음을 시작한다
        if (tnow - dirCombo.lastAt > COMBINE_MS) dirCombo.codes = Object.create(null);
        dirCombo.codes[e.code] = true;
        dirCombo.lastAt = tnow;
      }
      input.keys[e.code] = true;
      if (keyLog) logKey('down', e.code);
      if (diagEl) pushDiag('down', e.code);
      syncKeyDir();
    });
    window.addEventListener('keyup', function (e) {
      if (JUMPKEY[e.code]) {
        e.preventDefault();
        input.keys[e.code] = false;
        if (diagEl) pushDiag('up', e.code);
        // 점프 키를 여러 개 두었으므로, 하나를 떼도 다른 하나가 눌려 있으면 유지한다
        input.jumpHeld = anyHeld(JUMPKEY);
        return;
      }
      if (!KEYDIR[e.code]) return;
      e.preventDefault();
      input.keys[e.code] = false;
      if (keyLog) logKey('up  ', e.code);
      if (diagEl) pushDiag('up', e.code);
      syncKeyDir();
    });
    window.addEventListener('blur', function () {
      input.keys = Object.create(null);
      dirCombo.codes = Object.create(null);
      dirCombo.lastAt = -1e9;
      input.jumpHeld = false;
      syncKeyDir();
    });
  }

  function anyHeld(set) {
    for (var c in set) if (input.keys[c]) return true;
    return false;
  }

  /* 키가 실제로 브라우저에 도착하는지 확인하는 진단용 로그.
     콘솔에서 SK.Game.debug.keyLog(true) 로 켠다. */
  var keyLog = false;
  function logKey(kind, code) {
    if (!window.console) return;
    var held = [];
    for (var c in KEYDIR) if (input.keys[c]) held.push(c);
    console.log('[key] ' + kind + ' ' + code + '   held=[' + held.join(' ') + ']');
  }

  /* ---------- 입력 진단 패널 ----------
   *
   *  "키를 눌렀는데 안 먹는다"는 원인이 둘 중 하나다 — 게임이 잘못 처리했거나,
   *  **키 이벤트가 브라우저에 아예 도착하지 않았거나**. 둘은 증상이 똑같아서
   *  화면만 봐서는 구별할 수 없다. 이 패널은 도착한 키를 그대로 보여 주므로
   *  한눈에 갈린다 — Space 를 눌렀는데 목록에 안 뜨면 키보드가 삼킨 것이다. */
  var diagEl = null, diagLog = [];

  function setDiag(on) {
    if (!on) { if (diagEl) { diagEl.remove(); diagEl = null; } return false; }
    if (!diagEl) {
      diagEl = document.createElement('div');
      diagEl.id = 'inputDiag';
      document.body.appendChild(diagEl);
    }
    return true;
  }
  function isDiag() { return !!diagEl; }

  function shortKey(code) { return code.replace('Arrow', '').replace('Key', ''); }

  function pushDiag(kind, code) {
    diagLog.push((kind === 'down' ? '▼' : '△') + shortKey(code));
    if (diagLog.length > 8) diagLog.shift();
  }

  function renderDiag() {
    if (!diagEl) return;
    var held = [], c, j;
    for (c in KEYDIR) if (input.keys[c]) held.push(shortKey(c));
    for (j in JUMPKEY) if (input.keys[j]) held.push(shortKey(j));
    var d = player && player.aimDir;
    diagEl.innerHTML =
      '<b>입력 진단</b>' +
      '<div>받은 키 ' + (diagLog.join(' ') || '—') + '</div>' +
      '<div>지금 눌림 <b>' + (held.join(' + ') || '—') + '</b></div>' +
      '<div>방향 ' + input.dx + ',' + input.dy +
        '  조준 <b>' + (d ? (d.di + ',' + d.dj) : '없음') + '</b></div>' +
      '<div>점프 ' + (input.jumpHeld ? '누름' : (jumpPending() ? '대기' : '—')) +
        '</div>';
  }

  /** 방향 묶음을 비운다 — 뛰고 나면 새로 잡아야 한다.
      단, **지금 눌려 있는 키는 남긴다** — 누른 채로 연속 점프하는 중이기 때문이다. */
  function clearKeyCombine() {
    var keep = Object.create(null), any = false;
    for (var code in KEYDIR) if (input.keys[code]) { keep[code] = true; any = true; }
    dirCombo.codes = keep;
    dirCombo.lastAt = any ? performance.now() : -1e9;
  }

  /** 눌려 있는 키 + 살아 있는 묶음의 벡터를 모두 더한다(축마다 -1..1) */
  function syncKeyDir() {
    if (padActive) return;                 // 조이스틱 입력이 우선
    var x = 0, y = 0, tnow = performance.now();
    // 누르고 있는 동안에는 묶음의 수명을 계속 갱신한다. 그래야 keyup 이 유실돼도
    // (동시입력이 많을 때 키보드가 흘리는 일이 있다) 조준이 곧바로 무너지지 않고,
    // 대각선을 잡은 채 점프 키를 누르는 그 짧은 순간이 지켜진다.
    var holding = false;
    for (var h in KEYDIR) if (input.keys[h]) { dirCombo.codes[h] = true; holding = true; }
    if (holding) dirCombo.lastAt = tnow;

    var alive = tnow - dirCombo.lastAt < COMBO_HOLD_MS;
    for (var code in KEYDIR) {
      if (!input.keys[code] && !(alive && dirCombo.codes[code])) continue;
      x += KEYDIR[code][0];
      y += KEYDIR[code][1];
    }
    input.dx = Math.max(-1, Math.min(1, x));
    input.dy = Math.max(-1, Math.min(1, y));
  }

  /* =========================================================
   *  입력 — 가상 조이스틱 / 점프 버튼 (Pointer Events)
   *  터치·마우스·스타일러스를 같은 코드로 처리한다.
   * ======================================================= */
  var padActive = false;
  var padAimEl = null;

  /* 조이스틱 조작감을 좌우하는 값들.
   *
   *  · 원점은 패드 한가운데가 아니라 **손가락이 처음 닿은 자리**다(플로팅 스틱).
   *    고정 원점이면 패드 가장자리를 짚는 순간 그 방향이 곧바로 입력돼서,
   *    "잡자마자 엉뚱한 데를 조준한다"가 된다.
   *  · 손가락이 반경 밖으로 나가면 원점이 따라가며(리센터) 스틱이 계속 살아 있다.
   *  · 데드존은 픽셀이 아니라 반경 비율로 잡는다 — 화면 크기가 달라도 감이 같다.
   */
  var DEAD = 0.26;          // 반경 대비 데드존
  var SMOOTH = 0.45;        // 방향 벡터 지수 평활 — 손 떨림을 걸러 낸다

  function bindVirtualControls() {
    var pad = document.getElementById('touchPad');
    var nub = document.getElementById('touchNub');
    var jmp = document.getElementById('touchJump');
    if (!pad || !jmp) return;
    padAimEl = document.getElementById('touchAim');

    var padId = null, cx = 0, cy = 0, radius = 46;
    var sx = 0, sy = 0;                              // 평활된 방향 벡터

    function updateFrom(e) {
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var len = Math.hypot(dx, dy);

      // 반경을 넘어가면 원점을 끌고 간다 — 손가락이 패드 밖으로 나가도 계속 조작된다
      if (len > radius) {
        var over = (len - radius) / len;
        cx += dx * over; cy += dy * over;
        dx -= dx * over; dy -= dy * over;
        len = radius;
      }

      nub.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';

      var mag = len / radius;
      if (mag < DEAD) {
        sx = sy = 0;
        input.dx = 0; input.dy = 0;
        if (padAimEl) padAimEl.style.opacity = '0';
        return;
      }
      // 데드존 바깥을 0~1로 다시 펼친다(데드존 경계에서 값이 튀지 않게)
      var k = (mag - DEAD) / (1 - DEAD) / len;
      var tx = dx * k, ty = dy * k;
      sx += (tx - sx) * SMOOTH;
      sy += (ty - sy) * SMOOTH;
      input.dx = sx; input.dy = sy;
      showPadAim(radius);
    }

    /** 스틱이 어느 칸으로 확정됐는지 패드 위에 점으로 보여 준다 */
    function showPadAim(r) {
      if (!padAimEl) return;
      var dir = SK.Player.quantize(input.dx, input.dy, player && player.aimDir);
      if (!dir) { padAimEl.style.opacity = '0'; return; }
      var ax = (dir.di - dir.dj) * (SK.Iso.TW / 2);
      var ay = (dir.di + dir.dj) * (SK.Iso.TH / 2);
      var n = Math.hypot(ax, ay) || 1;
      padAimEl.style.opacity = '1';
      padAimEl.style.transform =
        'translate(' + (ax / n * r * 0.92) + 'px,' + (ay / n * r * 0.92) + 'px)';
    }

    pad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      padId = e.pointerId;
      padActive = true;
      try { pad.setPointerCapture(e.pointerId); } catch (_) { }
      var r = pad.getBoundingClientRect();
      radius = r.width * 0.42;
      // 짚은 자리를 원점으로. 단, 패드 밖(확장 히트영역)을 짚었다면 가운데로 당겨 둔다.
      var mx = r.left + r.width / 2, my = r.top + r.height / 2;
      var ox = e.clientX - mx, oy = e.clientY - my;
      var od = Math.hypot(ox, oy);
      var pull = od > radius ? radius / od : 1;
      cx = mx + ox * pull; cy = my + oy * pull;
      sx = sy = 0;
      input.dx = 0; input.dy = 0;
      nub.style.transform = 'translate(' + (cx - mx) + 'px,' + (cy - my) + 'px)';
      pad.classList.add('active');
    });
    pad.addEventListener('pointermove', function (e) {
      if (e.pointerId !== padId) return;
      e.preventDefault();
      updateFrom(e);
    });
    function endPad(e) {
      if (padId !== null && e.pointerId !== padId) return;
      padId = null; padActive = false;
      sx = sy = 0;
      input.dx = 0; input.dy = 0;
      nub.style.transform = '';
      if (padAimEl) padAimEl.style.opacity = '0';
      pad.classList.remove('active');
      syncKeyDir();
    }
    pad.addEventListener('pointerup', endPad);
    pad.addEventListener('pointercancel', endPad);

    jmp.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      requestJump();
      input.jumpHeld = true;
      try { jmp.setPointerCapture(e.pointerId); } catch (_) { }
      jmp.classList.add('active');
    });
    function endJump() { input.jumpHeld = false; jmp.classList.remove('active'); }
    jmp.addEventListener('pointerup', endJump);
    jmp.addEventListener('pointercancel', endJump);
    jmp.addEventListener('pointerleave', endJump);
  }

  /* =========================================================
   *  레이아웃 — HUD / 컨트롤과 겹치지 않는 안전 영역에 보드를 배치
   * ======================================================= */
  function safeRect() {
    var gap = 10;
    var top = gap, bottom = H - gap, left = gap, right = W - gap;

    var hud = ui.hud && ui.hud.getBoundingClientRect();
    if (hud && hud.height) top = hud.bottom + 6;

    var padEl = document.getElementById('touchPad');
    var jmpEl = document.getElementById('touchJump');
    var visible = padEl && padEl.offsetParent !== null;

    if (visible) {
      var pr = padEl.getBoundingClientRect();
      var jr = jmpEl.getBoundingClientRect();
      var ctrlTop = Math.min(pr.top, jr.top);
      var vertical = ctrlTop - 6 - top;

      // 세로 공간이 넉넉하면 컨트롤 위쪽 띠를 쓰고,
      // 부족하면(가로로 납작한 태블릿) 컨트롤 사이의 가운데 공간을 쓴다.
      if (vertical >= 250) {
        bottom = ctrlTop - 6;
      } else {
        left = Math.max(left, pr.right + 12);
        right = Math.min(right, jr.left - 12);
      }
    }

    var foot = ui.loadNote && ui.loadNote.getBoundingClientRect();
    if (foot && foot.height && bottom > foot.top - 4) {
      bottom = Math.max(top + 140, foot.top - 4);
    }

    return {
      x: left, y: top,
      w: Math.max(140, right - left),
      h: Math.max(140, bottom - top)
    };
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);

    // 격자 크기가 바뀔 만큼 화면이 변하면 월드를 다시 만든다
    var before = GRID;
    pickGrid();
    if (GRID !== before && player) {
      buildWorld();
      player.ci = Math.min(player.ci, GRID - 1);
      player.cj = Math.min(player.cj, GRID - 1);
      player.x = player.ci; player.y = player.cj;
      player.hopping = false;
      if (fsm && fsm.quiz) { quizTiles = []; layoutQuiz(fsm.quiz); }
    }

    viewRect = safeRect();
    boardWorld = computeBoardWorld();

    var boardW = (boardWorld.maxX - boardWorld.minX) + 16;
    var boardH = (boardWorld.maxY - boardWorld.minY) + 16;

    scale = Math.min(viewRect.w / boardW, viewRect.h / boardH);
    scale = Math.max(0.26, Math.min(1.15, scale));

    view.cx = viewRect.x + viewRect.w / 2;
    view.cy = viewRect.y + viewRect.h / 2;
    clampCam();
  }

  /** 캐릭터가 뛰어올랐을 때 머리가 잘리지 않도록 보드 위쪽에 두는 여유(px) */
  var JUMP_CLEARANCE = 84;

  /** 타일 전체가 차지하는 월드 좌표 범위 */
  function computeBoardWorld() {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      var s = world(t.i, t.j, 0);
      var th = SK.Tiles.thicknessOf(t);
      if (s.x - SK.Iso.TW / 2 < minX) minX = s.x - SK.Iso.TW / 2;
      if (s.x + SK.Iso.TW / 2 > maxX) maxX = s.x + SK.Iso.TW / 2;
      if (s.y - th - SK.Iso.TH / 2 < minY) minY = s.y - th - SK.Iso.TH / 2;
      if (s.y + SK.Iso.TH / 2 > maxY) maxY = s.y + SK.Iso.TH / 2;
    }
    minY -= JUMP_CLEARANCE;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  /**
   * 카메라를 보드 경계 안에 묶는다.
   * 보드가 안전 영역보다 작으면 아예 중앙에 고정해, 캐릭터를 따라가다
   * 보드가 화면 밖으로 밀려나는 일이 없게 한다.
   */
  function clampCam() {
    if (!boardWorld || !viewRect) return;
    var halfW = (viewRect.w / 2) / scale;
    var halfH = (viewRect.h / 2) / scale;

    var xLo = boardWorld.maxX - halfW, xHi = boardWorld.minX + halfW;
    var yLo = boardWorld.maxY - halfH, yHi = boardWorld.minY + halfH;

    cam.x = (xLo > xHi) ? (boardWorld.minX + boardWorld.maxX) / 2
      : Math.max(xLo, Math.min(xHi, cam.x));
    cam.y = (yLo > yHi) ? (boardWorld.minY + boardWorld.maxY) / 2
      : Math.max(yLo, Math.min(yHi, cam.y));
  }

  /** 화면 좌우 위치를 오디오 패닝 값으로 (-1 ~ +1) */
  function panOf(gi, gj) {
    var s = world(gi, gj, 0);
    var px = (s.x - cam.x) * scale;
    return Math.max(-1, Math.min(1, px / Math.max(1, W / 2)));
  }
  function depthOf(gi, gj) {
    var s = world(gi, gj, 0);
    return Math.max(0, Math.min(1, Math.abs(s.y - cam.y) * scale / 340));
  }

  /* =========================================================
   *  루프
   * ======================================================= */
  var loopErrors = 0;

  function loop(ts) {
    var dt = Math.min(0.05, (ts - lastT) / 1000);
    lastT = ts; now = ts / 1000;
    /* 한 프레임에서 예외가 나면 requestAnimationFrame 재예약까지 건너뛰어
       **게임이 통째로 멈춘다**. 실제로 입력 코드의 변수 이름 충돌 하나로 그렇게
       얼어붙은 적이 있다 — 화면은 멀쩡해 보이는데 키가 안 먹는 상태가 된다.
       예외를 여기서 막고 루프는 계속 돌린다. 처음 몇 번은 콘솔에 남긴다. */
    try {
      update(dt);
      render();
      renderDiag();
    } catch (err) {
      if (loopErrors++ < 3 && window.console) console.error('[loop]', err);
    }
    requestAnimationFrame(loop);
  }

  var worldApi = {
    canEnter: function (i, j) {
      if (!inBounds(i, j)) return false;
      return SK.Tiles.isSolid(getTile(i, j));
    },
    surfaceOf: function (i, j) {
      return SK.Tiles.surfaceOffset(getTile(i, j));
    }
  };

  function update(dt) {
    if (phaseTimer > 0) {
      phaseTimer -= dt;
      if (phaseTimer <= 0) {
        if (phase === 'wrong') { fsm.resume(); phase = 'play'; clearWrongMarks(); }
        else if (phase === 'solved') nextQuiz();
      }
    }

    // 점프 입력은 '눌림 유지' 방식 — 조준을 먼저 잡고 눌러도, 누른 채 조준을 바꿔도 뛴다
    // 조준 버퍼(COMBINE_MS)는 키 이벤트가 없어도 만료돼야 하므로 매 프레임 다시 센다
    syncKeyDir();

    // 이번 프레임에 플레이어가 '뛸 수 있는 상태'였는가 — 요청 소비 판단의 기준
    var couldAct = !player.hopping && player.cooldown <= 0 && player.stunTimer <= 0;
    var wantJump = input.jumpHeld || jumpPending();
    var wasHopping = player.hopping;
    SK.Player.update(player, { dx: input.dx, dy: input.dy, jump: wantJump }, dt, worldApi, {
      onTakeoff: function (power) { SK.Audio.whoosh(power, panOf(player.x, player.y)); },
      onLand: function (intensity, power, i, j) { land(intensity, power, i, j); }
    });
    if (!wasHopping && player.hopping) {
      // 방향 조준 버퍼를 비운다 — 안 그러면 직전 방향이 다음 조준에 섞여 든다
      clearKeyCombine();
    }
    // 뛸 기회가 있었던 프레임에서만 점프 요청을 소비한다.
    // 못 뛰는 구간이었다면 그대로 남겨 두었다가 기회가 오는 순간 발동시킨다.
    if (couldAct) consumeJump();

    // 점프 궤적 (소리 ↔ 시각 연결)
    if (player.hopping && Math.random() < 0.55) {
      SK.Particles.trail(player.x, player.y, player.z * 0.9, player.power);
    }

    for (var i = 0; i < tiles.length; i++) SK.Tiles.update(tiles[i], dt, now);
    updateAim(dt);
    updateHints(dt);

    // 카메라 — 보드 중심에서 캐릭터 쪽으로 조금만 따라간다
    var bc = world((GRID - 1) / 2, (GRID - 1) / 2, 0);
    var ps = world(player.x, player.y, 0);
    cam.x += (bc.x * 0.72 + ps.x * 0.28 - cam.x) * Math.min(1, dt * 5);
    cam.y += (bc.y * 0.72 + ps.y * 0.28 - cam.y) * Math.min(1, dt * 5);
    clampCam();   // 보드가 절대 화면 밖으로 밀려나지 않게
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 3.2);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.6);

    SK.Particles.update(dt);
  }

  /** 지금 점프하면 어디에 착지하는지 타일에 표시한다 */
  function updateAim(dt) {
    var target = null;
    if (!player.hopping && player.stunTimer <= 0 && player.aimDir) {
      var ni = player.ci + player.aimDir.di;
      var nj = player.cj + player.aimDir.dj;
      if (worldApi.canEnter(ni, nj)) target = getTile(ni, nj);
    }
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      var want = (t === target) ? 1 : 0;
      t.aim += (want - t.aim) * Math.min(1, dt * 14);
      if (t.aim < 0.01) t.aim = 0;
    }
  }

  function updateHints(dt) {
    var show = fsm && fsm.quiz && fsm.mistakes >= 2 && phase === 'play';
    var exp = show ? fsm.expected() : null;
    for (var k = 0; k < quizTiles.length; k++) {
      var t = quizTiles[k];
      var want = (exp != null && t.payload === exp) ? 1 : 0;
      t.hi += (want - t.hi) * Math.min(1, dt * 6);
      if (t.hi < 0.01) t.hi = 0;
    }
  }

  /* =========================================================
   *  착지 — 소리와 시각 효과를 항상 함께 낸다
   * ======================================================= */
  function land(intensity, power, i, j) {
    var t = getTile(i, j);
    if (!t) return;
    var mat = t.mat;
    var pan = panOf(i, j), depth = depthOf(i, j);

    var res = SK.Tiles.stomp(t, intensity, now, power);

    switch (res.sound) {
      case 'shatter':
        // 시각: Tiles.stomp 안에서 Particles.shatter 가 이미 터졌다
        SK.Audio.shatter(mat, { pan: pan, depth: depth });
        // 에어캡은 '부서지는' 게 아니라 알이 터지는 것이라 충격 연출을 줄인다
        cam.shake = Math.max(cam.shake, mat === 'bubble' ? 0.22 : 0.55);
        setFlash(mat === 'bubble' ? 0.14 : 0.32, SK.Particles.pal(mat).hue);
        break;
      case 'crack':
        SK.Audio.crack(mat, res.stage, res.total, { pan: pan, depth: depth });
        break;
      case 'hollow':
        SK.Audio.hollow({ pan: pan });
        break;
      default:
        SK.Audio.step(mat, { intensity: intensity, pan: pan, depth: depth, stomp: power > 1 });
    }

    // 모든 착지음에 짝을 이루는 파문 + 먼지
    if (res.sound !== 'hollow') {
      SK.Particles.stepBurst(i, j, mat, Math.min(1, intensity * res.gain), power);
    }
    if (power > 1) {
      cam.shake = Math.max(cam.shake, 0.45);
      SK.Particles.text(i, j, '쿵!', { size: 24, color: '#ffffff', life: 0.6, gz: 0.4, vz: 0.03 });
    }

    visit(t);
  }

  /* =========================================================
   *  퀴즈 판정
   * ======================================================= */
  function visit(t) {
    if (phase !== 'play' || !fsm || fsm.state !== 'PLAY') return;
    if (!t || t.role === 'plain' || t.payload == null) return;

    var exp = fsm.expected();
    // 이미 완료된 타일을 다시 지나가는 것은 실수가 아니다
    if (t.state === 'done' && t.payload !== exp) return;

    var r = fsm.submit(t.payload);
    var pan = panOf(t.i, t.j);

    if (r.type === 'progress' || r.type === 'solved') {
      t.state = 'done';
      t.flash = 1;
      // 정답 타일은 별빛과 함께 원래대로 복구된다 —
      // 소모성 재질이라도 정답 진행이 막히는 일이 없도록.
      SK.Tiles.reset(t);
      SK.Particles.solveMark(t.i, t.j);
      SK.Particles.stars(t.i, t.j, 26);
      SK.Particles.ring(t.i, t.j, { size: 105, life: 0.45, width: 4, color: 'rgba(142,240,192,' });
      SK.Particles.ring(t.i, t.j, { size: 168, life: 0.62, width: 2, color: 'rgba(255,255,255,' });
      SK.Particles.text(t.i, t.j, POP_WORDS[r.index % POP_WORDS.length], {
        size: 22, color: '#8ef0c0', life: 0.8
      });
      streak++;
      combo = Math.min(9, 1 + Math.floor(streak / 4));
      score += 10 * combo;
      if (r.type === 'solved') onSolved(t, pan);
      renderHUD();
    } else if (r.type === 'wrong') {
      onWrong(t, pan);
    }
  }

  var POP_WORDS = ['TOK!', 'POP!', 'TAP!', 'CLICK!', 'PLOP!', 'TING!'];

  function onSolved(t, pan) {
    phase = 'solved';
    phaseTimer = 2.1;
    score += 50 * combo;
    SK.Particles.celebrate(t.i, t.j);
    setFlash(0.55, 148);
    SK.Particles.text(t.i, t.j, 'CRACKLE-POP!', { size: 32, color: '#ffd66b', gz: 0.9, life: 1.4 });
    SK.Particles.text(player.x, player.y, 'PERFECT!', { size: 38, color: '#ffffff', gz: 1.5, life: 1.5, tilt: -0.06 });
    cam.shake = 0.9;
    for (var k = 0; k < quizTiles.length; k++) {
      if (quizTiles[k].correct) {
        quizTiles[k].state = 'done';
        quizTiles[k].flash = 1;
        // 왼쪽부터 차례로 터지게 해서 '완성됐다'는 흐름이 보이게 한다
        SK.Particles.solveMark(quizTiles[k].i, quizTiles[k].j, k * 0.11);
        SK.Particles.stars(quizTiles[k].i, quizTiles[k].j, 14);
      }
    }
    renderHUD();
  }

  function onWrong(t, pan) {
    phase = 'wrong';
    phaseTimer = 0.8;
    t.state = 'wrong';
    streak = 0; combo = 0;
    score = Math.max(0, score - 5);
    SK.Audio.wrong({ pan: pan });
    SK.Particles.text(t.i, t.j, 'THUD…', { size: 24, color: '#ff9aa8', life: 0.9, vz: 0.01 });
    SK.Particles.ring(t.i, t.j, { size: 90, life: 0.5, color: 'rgba(255,154,168,' });
    cam.shake = 0.8;
    SK.Player.stun(player, 0.6);
    for (var k = 0; k < quizTiles.length; k++) {
      if (quizTiles[k] !== t) quizTiles[k].state = 'idle';
    }
    renderHUD(false, true);
  }

  /** 화면 전체가 순간 번쩍인다 (파괴·정답 완성) */
  function setFlash(amount, hue) {
    flash = Math.max(flash, amount);
    if (hue != null) {
      var c = hslToRgb(hue, 0.85, 0.8);
      flashColor = c[0] + ',' + c[1] + ',' + c[2];
    } else {
      flashColor = '255,255,255';
    }
  }

  function hslToRgb(h, s2, l) {
    h = (h % 360) / 360;
    var q = l < 0.5 ? l * (1 + s2) : l + s2 - l * s2;
    var pp = 2 * l - q;
    var f = function (t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return pp + (q - pp) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6;
      return pp;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }

  function clearWrongMarks() {
    for (var k = 0; k < quizTiles.length; k++) {
      if (quizTiles[k].state === 'wrong') quizTiles[k].state = 'idle';
    }
    renderHUD();
  }

  /* =========================================================
   *  HUD
   * ======================================================= */
  var SUBJECT_KO = { social: '사회', math: '수학' };

  function renderHUD(isNew, shakeSlots) {
    var q = fsm && fsm.quiz;
    if (!q) return;

    ui.subjectBadge.textContent = SUBJECT_KO[q.subject] || q.subject;
    ui.subjectBadge.style.background = q.subject === 'math' ? '#8ef0c0' : '#ffd66b';
    ui.topicBadge.textContent = q.topic || '기본';
    ui.scoreVal.textContent = score;
    ui.comboVal.textContent = combo > 1 ? '×' + combo : '';

    if (isNew) ui.prompt.textContent = q.prompt;

    if (phase === 'solved') {
      ui.hint.textContent = q.reveal || ('정답! ' + q.answer);
      ui.hint.className = 'hint good';
    } else if (fsm.mistakes >= 2 && q.hint) {
      ui.hint.textContent = '힌트 · ' + q.hint;
      ui.hint.className = 'hint';
    } else {
      ui.hint.textContent = '한 글자씩 순서대로 밟으세요';
      ui.hint.className = 'hint';
    }

    var total = fsm.total(), prog = fsm.progress, html = '';
    for (var i = 0; i < total; i++) {
      var cls = 'slot', ch = '';
      if (i < prog.length) { cls += ' filled'; ch = esc(prog[i]); }
      else if (i === prog.length) cls += ' next';
      if (shakeSlots) cls += ' wrong';
      html += '<div class="' + cls + '">' + ch + '</div>';
    }
    ui.slots.innerHTML = html;

    scheduleRelayout();   // HUD 높이가 바뀌면 보드 안전 영역도 다시 계산
  }

  var relayoutPending = false;
  function scheduleRelayout() {
    if (relayoutPending) return;
    relayoutPending = true;
    requestAnimationFrame(function () { relayoutPending = false; resize(); });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* =========================================================
   *  렌더
   * ======================================================= */
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var bg = ctx.createRadialGradient(view.cx, view.cy, 40, view.cx, view.cy, Math.max(W, H) * 0.8);
    bg.addColorStop(0, 'rgba(70,78,140,.5)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    var shx = cam.shake ? (Math.random() - 0.5) * 14 * cam.shake : 0;
    var shy = cam.shake ? (Math.random() - 0.5) * 14 * cam.shake : 0;

    ctx.save();
    ctx.translate(view.cx + shx, view.cy + shy);
    ctx.scale(scale, scale);
    ctx.translate(-cam.x, -cam.y);

    // 페인터 알고리즘 — 깊이(i+j) 순
    var list = [];
    for (var k = 0; k < tiles.length; k++) {
      list.push({ d: tiles[k].i + tiles[k].j, kind: 't', o: tiles[k] });
    }
    list.push({ d: player.x + player.y + 0.02, kind: 'p', o: player });
    list.sort(function (a, b) { return a.d - b.d; });

    for (var n = 0; n < list.length; n++) {
      var e = list[n];
      if (e.kind === 't') {
        var s = world(e.o.i, e.o.j, 0);
        SK.Tiles.draw(ctx, e.o, now, s.x, s.y);
      } else {
        var ps = world(player.x, player.y, 0);
        SK.Player.draw(ctx, player, now, ps.x, ps.y, player.z * SK.Iso.TZ * 2);
      }
    }

    SK.Particles.draw(ctx, SK.Iso);
    ctx.restore();

    // 화면 플래시 — 파괴·정답 완성의 순간을 강조
    if (flash > 0.01) {
      ctx.fillStyle = 'rgba(' + flashColor + ',' + (flash * 0.5) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* =========================================================
   *  외부 제어
   * ======================================================= */
  function setSubject(f) {
    if (!session) return;
    session.setFilter(f);
    if (!session.pool().length) { ui.prompt.textContent = '해당 과목의 문제가 없습니다.'; return; }
    phase = 'play'; phaseTimer = 0;
    nextQuiz();
  }

  function skip() {
    if (!session) return;
    phase = 'play'; phaseTimer = 0;
    nextQuiz();
  }

  return {
    boot: boot,
    startWith: startWith,
    setSubject: setSubject,
    setDiag: setDiag, isDiag: isDiag,
    skip: skip,
    relayout: resize,
    getScore: function () { return score; },

    /** 디버그 / 자동 테스트용 훅 */
    debug: {
      state: function () {
        return {
          phase: phase,
          fsmState: fsm && fsm.state,
          quizId: fsm && fsm.quiz && fsm.quiz.id,
          expected: fsm && fsm.expected(),
          progress: fsm ? fsm.progress.slice() : [],
          grid: GRID, spacing: SPACING, scale: scale,
          player: { ci: player.ci, cj: player.cj, z: player.z, surface: player.surface },
          tiles: quizTiles.map(function (t) {
            return {
              i: t.i, j: t.j, label: t.label, correct: t.correct, order: t.order,
              state: t.state, mat: t.mat, damage: t.damage, broken: t.broken
            };
          })
        };
      },
      tick: function (dt) { now += dt; update(dt); render(); },
      /** 특정 타일에 착지시켜 판정을 발생시킨다 */
      stepOn: function (i, j, power) {
        player.ci = i; player.cj = j;
        player.x = i; player.y = j; player.z = 0;
        player.hopping = false;
        land(power > 1 ? 1 : 0.5, power || 1, i, j);
        return fsm.progress.slice();
      },
      press: function (dx, dy, jump) { input.dx = dx; input.dy = dy; if (jump) requestJump(); },
      release: function () { input.dx = 0; input.dy = 0; },
      safeRect: safeRect,
      /** 지금 조준 표시가 켜진 타일 수 (0 또는 1) */
      /** 임의의 칸 재질 읽기/바꾸기 — 특정 재질의 연출을 확인할 때 쓴다 */
      matOf: function (i, j) { var t = getTile(i, j); return t && t.mat; },
      setMat: function (i, j, mat) {
        var t = getTile(i, j);
        if (t) { t.mat = mat; SK.Tiles.reset(t); }
        return t && t.mat;
      },
      input: function () {
        var held = [], buf = [], tnow = performance.now();
        var alive = tnow - dirCombo.lastAt < COMBO_HOLD_MS;
        for (var c in KEYDIR) {
          if (input.keys[c]) held.push(c);
          if (alive && dirCombo.codes[c]) buf.push(c);
        }
        var d = player && player.aimDir;
        return {
          dx: input.dx, dy: input.dy, jumpPending: jumpPending(),
          jumpAgo: Math.round(performance.now() - input.jumpAt), jumpHeld: input.jumpHeld,
          held: held, buffered: buf,
          aimDir: d ? (d.di + ',' + d.dj) : null,
          aimHold: player ? Math.round((player.aimHold || 0) * 1000) : 0,
          hopping: player ? player.hopping : null,
          cooldown: player ? +(player.cooldown || 0).toFixed(3) : null
        };
      },
      keyLog: function (on) { keyLog = on !== false; return keyLog ? '켬 — 키를 눌러 보세요' : '끔'; },
      aimCount: function () {
        var n = 0;
        for (var k = 0; k < tiles.length; k++) if (tiles[k].aim > 0.5) n++;
        return n;
      },
      /** 실제로 그려지는 보드의 화면 경계 — 레이아웃 겹침 자동 점검용 */
      boardBounds: function () {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var k = 0; k < tiles.length; k++) {
          var t = tiles[k];
          var s = world(t.i, t.j, 0);
          var th = SK.Tiles.thicknessOf(t);
          minX = Math.min(minX, s.x - SK.Iso.TW / 2);
          maxX = Math.max(maxX, s.x + SK.Iso.TW / 2);
          minY = Math.min(minY, s.y - th - SK.Iso.TH / 2);
          maxY = Math.max(maxY, s.y + SK.Iso.TH / 2);
        }
        var toScreen = function (wx, wy) {
          return { x: view.cx + (wx - cam.x) * scale, y: view.cy + (wy - cam.y) * scale };
        };
        var a = toScreen(minX, minY), b = toScreen(maxX, maxY);
        return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, right: b.x, bottom: b.y };
      }
    }
  };
})();
