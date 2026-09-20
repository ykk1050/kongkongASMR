/* =============================================================
 *  소리 콩콩 — 게임 코어
 *  · 타일이 한 칸씩 떨어져 떠 있고, 캐릭터는 한 칸씩 점프해 이동한다
 *  · 소리와 시각 효과가 항상 짝을 이룬다
 *  · HUD / 화면 컨트롤 / 보드가 서로 겹치지 않도록 안전 영역을 계산해 배치한다
 * ============================================================= */
window.SK = window.SK || {};

SK.Game = (function () {

  /* 타일 사이 간격(격자 단위). **1 이면 이웃 타일끼리 딱 붙는다.**
   *
   *  예전에는 1.85 — 모든 타일이 떨어져 있어 한 칸 움직일 때마다 점프해야 했고,
   *  그래서 발소리가 뚝뚝 끊겼다. 이제 붙여 놓고, 끊고 싶은 자리는 **칸을 비워**
   *  만든다. 붙은 칸들은 걸어서 잇고(연속된 발소리), 비운 칸은 두 칸 건너뛰기로
   *  넘는다(디딤돌 구간). 간격이 타일마다 다른 게 아니라 **지형이 다른 것**이다. */
  var SPACING = 1.0;

  /* 건너뛰기 폭 — js/player.js 의 JUMP_SPAN 과 같아야 한다.
     연결성·길 판정이 "걸어서 한 칸, 뛰어서 두 칸"을 모두 셈에 넣어야 하기 때문이다. */
  var JUMP_SPAN = 2;

  var GRID = 5;
  var START = { i: 2, j: 2 };

  /* 한 문제에 쓰는 재질은 **두 가지**다 — 글자 타일은 문제의 재질(`q.material`),
   * 나머지 바닥은 전부 한 종류.
   *
   * 예전에는 칸마다 해시를 돌려 18종을 흩뿌렸다. 한 발짝 옮길 때마다 소리가 바뀌니
   * 소리를 들으러 온 사람에게는 ASMR이 아니라 **효과음 모음집**이 된다. 한 재질에
   * 몸을 담그려면 그 소리가 연달아 나야 한다.
   *
   * 대신 문제가 바뀔 때마다 바닥을 갈아 끼운다. 한 판을 도는 동안 18종을 다 만나되,
   * 만나는 동안에는 끊기지 않는다. 가방에서 뽑아 쓰고 비면 다시 섞는 방식이라
   * 같은 재질이 몰리거나 한 재질만 계속 빠지는 일이 없다. */
  var floorMat = 'wood';
  var floorBag = [];

  /* 판을 새로 깔 때마다 바뀌는 씨앗 — 이어하기에 저장해 두고 그대로 복원한다 */
  var boardSeed = (Math.random() * 0x7fffffff) | 0;

  /** 다음 바닥 재질 — 글자 재질(avoid)과 직전 바닥은 피한다(그래야 '두 가지'가 된다) */
  function drawFloorMat(avoid) {
    for (var guard = 0; guard < 64; guard++) {
      if (!floorBag.length) floorBag = SK.Quiz.shuffle(Object.keys(SK.Tiles.MATERIALS));
      var m = floorBag.pop();
      if (m !== avoid && m !== floorMat) return m;
    }
    return floorMat;
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

  /* 한 판의 기록.
 *
 *  랭킹은 점수 하나로만 줄을 세우지 않는다 — 많이 도전한 사람, 많이 맞힌 사람,
 *  정확하게 푼 사람이 각각 보이도록 여러 조건으로 집계한다. 단원별로도 나누므로
 *  '어느 단원 문제를 몇 개 시도해서 몇 개 맞혔는지'를 따로 센다.
 *
 *  ⚠ '시도한 문제'는 **글자를 한 번이라도 밟은 문제**다. 받아 본 문제(quizzes)와
 *    다르다 — 게임 오버 직전에 뜬 문제처럼 손도 대지 못한 것은 시도가 아니다.
 *    (문제를 건너뛰는 기능은 플레이어에게 주지 않는다. 모르는 문제를 넘길 수
 *     있으면 시도 수를 부풀리고 어려운 문제를 피해 정답률을 올릴 수 있다.)
 *
 *  ⚠ 이 값들은 전부 이 클로저 안에만 있다. window 나 SK.Game 어디에도
 *    붙이지 않으므로 개발자 도구 콘솔에서 점수 변수를 직접 고칠 수 없다.
 *    (남은 구멍 — 게임 파일 자체를 고친 경우 — 은 서버 쪽 타당성 검사가 맡는다) */
  var RUN_VER = '2';
  var run = null;
  var runAuth = null;          // 서버가 발급한 1회용 실행 토큰
  var quizTouched = false;     // 지금 문제의 글자를 한 번이라도 밟았는가

  function resetRun() {
    run = {
      startedAt: Date.now(),
      timeMs: 0,               // 실제로 논 시간 — 탭이 숨으면 같이 멈춘다
      attempts: 0,             // 시도한 문제 수 (글자를 한 번이라도 밟은 문제)
      solved: 0,               // 끝까지 맞힌 문제 수
      hits: 0,                 // 순서에 맞게 밟은 글자 수
      misses: 0,               // 틀리게 밟은 횟수
      falls: 0,                // 빈 칸·부서진 자리로 떨어진 횟수
      maxCombo: 0,
      quizzes: 0,              // 받아 본 문제 수 (시도하지 않고 넘긴 것도 포함)
      byTopic: Object.create(null),   // 단원 → { a: 시도, s: 맞힘 }
      tainted: false           // 개발자용 훅을 쓴 판 — 랭킹에 올리지 않는다
    };
    quizTouched = false;
  }
  resetRun();

  /* 단원 이름은 기록을 한 칸에 담을 때 구분자로 쓰는 문자를 포함할 수 없다.
     (형식: 단원:시도/맞힘 을 | 로 이어 붙인다 — docs/RANKING.md 참고) */
  function topicKey(name) {
    return String(name == null || name === '' ? '기타' : name).replace(/[|:/]/g, '-');
  }

  function topicStat(name) {
    var k = topicKey(name);
    if (!run.byTopic[k]) run.byTopic[k] = { a: 0, s: 0 };
    return run.byTopic[k];
  }

  /** 단원별 집계를 한 줄 문자열로 — 시트의 '단원별' 칸에 그대로 들어간다 */
  function topicsString() {
    var parts = [];
    for (var k in run.byTopic) {
      var t = run.byTopic[k];
      if (t.a > 0) parts.push(k + ':' + t.a + '/' + t.s);
    }
    return parts.join('|');
  }

  /* 서버가 토큰을 받아 주는 기한보다 넉넉히 앞서 새로 받는다 */
  var TOKEN_REFRESH_MS = 10 * 3600 * 1000;

  function tokenTooOld(token) {
    var parts = String(token || '').split('.');
    if (parts.length !== 3) return true;
    var at = parseInt(parts[1], 36);
    return !(at > 0) || (Date.now() - at) > TOKEN_REFRESH_MS;
  }

  /** 판이 시작될 때 서버에서 1회용 토큰을 받아 둔다 (없어도 게임은 그대로 진행) */
  function beginRun() {
    runAuth = null;
    if (!SK.Ranking || !SK.Ranking.startRun) return;
    SK.Ranking.startRun().then(function (r) { runAuth = r; });
  }

  /** 랭킹에 올릴 한 판의 요약 */
  function getRunRecord() {
    var tries = run.hits + run.misses;
    return {
      score: score,
      timeMs: Math.round(run.timeMs),
      attempts: run.attempts,
      solved: run.solved,
      hits: run.hits,
      misses: run.misses,
      falls: run.falls,
      maxCombo: run.maxCombo,
      quizzes: run.quizzes,
      grid: GRID,
      topics: topicsString(),
      /** 정답률 — 시도한 문제 중 끝까지 맞힌 비율 */
      rate: run.attempts ? run.solved / run.attempts : 0,
      /** 밟기 정확도 — 글자 한 장 단위. 랭킹에는 쓰지 않고 기록에만 남긴다 */
      accuracy: tries ? run.hits / tries : 0,
      /* 벽시계로 잰 시간. 서버는 '논 시간이 실제로 흐른 시간보다 길 수는 없다'는
         것만 본다 — 잠시 자리를 비워 벽시계가 훨씬 길어지는 것은 정상이다. */
      wallMs: Math.max(0, Date.now() - run.startedAt),
      tainted: !!run.tainted,
      ver: RUN_VER
    };
  }

  /** 개발자용 훅을 쓴 판은 토큰을 내주지 않는다 → 이 기기 기록으로만 남는다 */
  function getRunAuth() { return run.tainted ? null : runAuth; }

  /* 목숨.
   *
   *  잃는 경우는 셋이고, 셋 다 "발밑이 무너지거나 길을 잘못 들었다"는 같은 종류의
   *  실패다 — 답을 틀렸을 때, 빈 칸에 빠졌을 때, 밟은 타일이 부서져 떨어졌을 때.
   *  (뒤의 둘은 이미 fallIntoHole 로 모이므로 거기 한 군데만 걸면 된다.) */
  var MAX_LIVES = 5;

  /* 하트 — 목숨을 하나 되찾는 기회.
   *
   *  늘 나오면 목숨이 의미를 잃고, 안 나오면 한 번 삐끗한 판은 그대로 끝난다.
   *  그래서 **몇 문제에 한 번 확률로** 굴린다. 목숨이 가득하면 굴리지 않는다 —
   *  더 채울 수 없는 걸 띄워 놓으면 "먹어도 아무 일 없는 것"이 되기 때문이다. */
  var HEART_EVERY = 3;        // 이 문제 수마다 한 번 기회를 굴린다
  var HEART_CHANCE = 0.55;    // 굴렸을 때 실제로 나올 확률
  var heartAt = null;         // {i,j} — 지금 하트가 놓인 칸 (없으면 null)
  var lives = MAX_LIVES;
  var phase = 'idle';                      // idle | play | wrong | solved | over
  var phaseTimer = 0;
  var ui = {};

  var input = { dx: 0, dy: 0, jumpAt: -1e9, jumpHeld: false,
                dirHeld: false, dirTapAt: -1e9, fromStick: false,
                keys: Object.create(null) };

  /* 걷기는 **방향을 실제로 잡고 있을 때만** 나간다.
   *
   *  ⚠ 한 번 눌렀는데 두 칸을 갔다. 조준(input.dx/dy)은 손을 뗀 뒤에도
   *  TAP_HOLD_MS(0.42초) 동안 남는데 — 방향을 떼고 점프하는 흐름을 위해 일부러
   *  남긴다 — 걷기가 그 남은 조준까지 보고 있었다. 걸음 한 번이 0.29초라, 첫
   *  걸음이 끝나는 순간 아직 살아 있는 조준으로 두 번째 걸음이 그냥 나갔다.
   *
   *  그래서 조준과 걷기를 갈랐다. 남은 조준은 **점프 방향**만 맡고, 걷기는
   *  지금 눌려 있는 방향만 본다.
   *
   *  다만 '지금 눌려 있는가'만 보면 걸음 중에 톡 누른 입력이 통째로 사라진다
   *  (걸음 0.29초 동안 누르고 뗀 것은 걸음이 끝날 때 이미 떼어져 있다). 점프
   *  입력을 버퍼에 담아 두는 것과 같은 이유로, 방향도 누른 시각을 짧게 기억해
   *  둔다. */
  var WALK_BUFFER_MS = 150;

  /* 조이스틱으로 걸을 때 한 걸음을 얼마나 늘릴지.
   *
   *  방향키는 톡 누르면 한 칸이라 원하는 자리에서 멈추기 쉽다. 조이스틱은 미는
   *  동작이라 '한 칸만'을 손으로 끊기 어렵고, 밀고 있는 내내 걸어서 목표 칸을
   *  지나치기 쉽다. 재 보니 오히려 방향키보다 빨랐다 — 한 칸에 조이스틱 267ms,
   *  방향키 300ms. 그래서 조이스틱 걸음만 늘려 잡는다. 걸음 시간을 늘리는 것이지
   *  걸음 사이에 빈 시간을 두는 것이 아니다 — 쉬게 하면 뚝뚝 끊겨 보이고
   *  발소리도 그만큼 끊긴다. 늘리면 걷는 동작과 발소리 간격이 함께 늘어난다.
   *  나중에 방향키 자체도 300 → 350ms 로 늦추면서, 조이스틱이 400ms 그대로
   *  남도록 배율을 1.35 에서 1.15 로 함께 내렸다. */
  var STICK_WALK_SCALE = 1.15;

  /** 방향을 잡았는지 갱신한다. 새로 잡는 순간을 기억해 걸음 버퍼로 쓴다. */
  function setDirHeld(on) {
    if (on && !input.dirHeld) input.dirTapAt = performance.now();
    input.dirHeld = on;
  }

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
   *  (화면의 '점프' 버튼에도 똑같이 걸린다.) */
  var JUMP_STALE_MS = 900;          // 탭이 멈춰 있었을 때를 대비한 안전장치

  /* 제자리 내려찍기로 확정하기 전에 방향을 기다려 주는 시간.
   *
   *  ⚠ 조준과 점프를 **거의 동시에** 누르면, 방향 키가 몇 ms 늦게 도착하는 것만으로
   *  그 프레임이 '방향 없음'이 되어 제자리 내려찍기로 끝나 버린다. 사람은 두 키를
   *  정확히 같은 순간에 누르지 못하므로 이건 사실상 항상 일어난다 —
   *  "조준하고 바로 눌렀는데 안 움직인다"의 정체다.
   *
   *  그래서 **조준이 없을 때만** 점프 판정을 이만큼 미룬다. 그 사이에 방향이 오면
   *  그 칸으로 뛰고, 끝내 안 오면 그때 내려찍는다. 조준이 이미 있으면 한 프레임도
   *  기다리지 않으므로 평소 반응은 그대로다. */
  var STOMP_GRACE_MS = 130;

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
    bindSaveHooks();
  }

  /* 화면에 보이는 배율. 예전에는 "판 전체가 들어오도록" 매번 계산했는데, 이제
     판이 화면보다 넓으므로 그 계산이 의미가 없다. 대신 타일이 손가락만 하게
     보이는 고정 배율을 쓰고 카메라가 캐릭터를 따라간다. */
  function pickZoom() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w < 620 || h < 560) return 0.84;
    if (w < 1100) return 0.95;
    return 1.05;
  }

  /** 격자 크기 — 길이 화면 두세 개 분량으로 뻗을 만큼 넉넉히 */
  function pickGrid() {
    var w = window.innerWidth;
    GRID = w < 620 ? 15 : (w < 1100 ? 17 : 19);
    START = { i: (GRID - 1) >> 1, j: (GRID - 1) >> 1 };
  }

  /* 보드에 빈 칸(구멍)을 낸다.
   *
   *  전부 타일로 채우면 어디로 뛰든 안전해서 조준할 이유가 없다. 구멍이 있어야
   *  "어디로 뛸지"가 선택이 된다. 다만 두 가지를 반드시 지켜야 한다.
   *    · 시작 칸은 절대 구멍이 아니다
   *    · 남은 타일이 **하나로 이어져 있어야** 한다 — 섬이 생기면 문제 글자를
   *      영영 못 밟는 판이 만들어진다. 그래서 구멍을 하나 뚫을 때마다
   *      연결성을 검사하고, 끊기면 되돌린다.
   *    · 구멍끼리 붙여 뚫지 않는다 — 두세 칸이 이어져 비면 건너뛸 수 없는 벽이
   *      생겨, 연결은 되어 있어도 빙 돌아가야 하는 판이 된다.
   */
  var HOLE_RATIO = 0.16;

  /* 밟아서 부서지는 자리까지 더해도 이만큼은 성한 발판으로 남긴다 —
     글자를 놓을 자리가 모자라면 문제를 풀 수가 없다. */
  var MIN_SOLID = 10;

  /**
   * 판을 처음부터 새로 만든다.
   * @param {{i:number,j:number}} [keep] 구멍으로 뚫지 말아야 할 칸.
   *        문제가 바뀔 때는 캐릭터가 서 있는 칸이 여기 들어간다 — 발밑이
   *        갑자기 사라지면 밟지도 않았는데 떨어진다.
   */
  function buildWorld(keep) {
    boardSeed = (Math.random() * 0x7fffffff) | 0;
    // 지난 판의 씨앗으로 구워 둔 타일 그림은 다시 쓸 일이 없다
    if (SK.Tiles.clearArtCache) SK.Tiles.clearArtCache();
    tiles = []; tileAt = {};
    var cells = carveWalkway(keep);
    for (var n = 0; n < cells.length; n++) {
      var c = cells[n];
      var t0 = SK.Tiles.make(c.i, c.j, floorMat);
      tiles.push(t0);
      tileAt[c.i + ',' + c.j] = t0;
    }
    carveHoles(keep);
  }

  /* =========================================================
   *  산책길 만들기
   *
   *  판 전체를 타일로 채우면 화면보다 넓은 격자가 통째로 발판이 되어, 어디로
   *  가야 할지가 사라진다. 그래서 **길을 깐다** — 시작 칸에서 격자 축을 따라
   *  무작위로 걸어간 자취를 길로 삼고, 그 둘레를 살찌워 리본처럼 만든다.
   *
   *  축 방향으로만 걷는 이유: 아이소메트릭에서 격자 축으로 이웃한 두 칸은 변을
   *  통째로 맞대지만, 대각선 이웃은 꼭짓점 하나로만 닿는다. 축으로 이어야
   *  **끊긴 데 없는 길**로 보인다.
   *
   *  리본을 굵게 뽑는 것도 이유가 있다. 폭이 1이면 글자 타일 하나가 길을 두
   *  동강 내서, "글자 없는 디딤 타일로 이어진 길" 규칙을 만족하는 배치를 찾기가
   *  거의 불가능해진다.
   * ======================================================= */

  /** 격자 축 네 방향 — 변을 맞대고 이어지는 이웃 */
  var AXIS = [{ di: 1, dj: 0 }, { di: -1, dj: 0 }, { di: 0, dj: 1 }, { di: 0, dj: -1 }];

  function carveWalkway(keep) {
    var want = Math.round(GRID * 5.5);       // 목표 칸 수 — 화면 두세 개 분량의 길
    var set = Object.create(null), out = [];

    function add(i, j) {
      if (i < 0 || j < 0 || i >= GRID || j >= GRID) return false;
      var key = i + ',' + j;
      if (set[key]) return false;
      set[key] = true; out.push({ i: i, j: j });
      return true;
    }

    /* 길은 **캐릭터가 선 자리에서** 뻗어 나간다.
       예전에는 START 에서 걷기 시작하면서 keep 을 따로 얹었는데, 문제를 풀고
       START 에서 멀어진 채 다음 판이 깔리면 keep 이 길과 떨어진 **섬**이 됐다.
       그 판은 어디로도 갈 수 없어 답을 밟을 수가 없다. */
    var ci = keep ? keep.i : START.i, cj = keep ? keep.j : START.j;
    if (ci < 1 || cj < 1 || ci >= GRID - 1 || cj >= GRID - 1) { ci = START.i; cj = START.j; }
    add(ci, cj);
    var dir = AXIS[Math.floor(Math.random() * 4)];
    var guard = 0;
    while (out.length < want && guard++ < want * 40) {
      // 같은 방향으로 서너 칸씩 이어 걷다가 방향을 바꾼다 — 길이 곧게 뻗어 보인다
      if (Math.random() < 0.32) dir = AXIS[Math.floor(Math.random() * 4)];
      var ni = ci + dir.di, nj = cj + dir.dj;
      if (ni < 1 || nj < 1 || ni >= GRID - 1 || nj >= GRID - 1) {
        dir = AXIS[Math.floor(Math.random() * 4)];
        continue;
      }
      ci = ni; cj = nj;
      add(ci, cj);
      /* 둘레를 살찌워 리본으로 — 폭이 1이면 글자 하나에 길이 끊긴다.
         다만 너무 두껍게 하면 길이 아니라 벌판이 되어 "어디로 가는 길"이
         사라진다. 대체로 폭 2, 가끔 광장 정도가 걷기 좋았다. */
      if (Math.random() < 0.55) {
        var a = AXIS[Math.floor(Math.random() * 4)];
        add(ci + a.di, cj + a.dj);
      }
      if (Math.random() < 0.14) {
        var b = AXIS[Math.floor(Math.random() * 4)];
        add(ci + b.di * 2, cj + b.dj * 2);   // 가끔 넓은 광장
      }
    }

    /* 마지막 안전장치 — 시작 칸에서 못 닿는 칸은 버린다.
       광장을 두 칸 건너 얹다가 섬이 생길 수 있다. 섬이 하나라도 남으면
       "답을 못 밟는 판"이 되므로, 만들 때 아예 없앤다. */
    return keepReachable(out, out[0]);
  }

  /** 시작 칸에서 걷기·건너뛰기로 닿는 칸만 남긴다 */
  function keepReachable(cells, from) {
    var own = Object.create(null);
    for (var k = 0; k < cells.length; k++) own[cells[k].i + ',' + cells[k].j] = true;

    var seen = Object.create(null), queue = [from];
    seen[from.i + ',' + from.j] = true;
    while (queue.length) {
      var cur = queue.pop();
      eachReach(cur.i, cur.j, function (ni, nj) {
        var key = ni + ',' + nj;
        if (own[key] && !seen[key]) { seen[key] = true; queue.push({ i: ni, j: nj }); }
      });
    }
    var out = [];
    for (var n = 0; n < cells.length; n++) {
      if (seen[cells[n].i + ',' + cells[n].j]) out.push(cells[n]);
    }
    return out;
  }

  /* 문제가 바뀔 때마다 판을 새로 깐다.
   *
   *  예전에는 한 게임 내내 같은 타일을 썼다. 그래서 앞 문제에서 부서뜨린 자리가
   *  그대로 남아, 문제를 풀수록 발판이 줄고 판이 닳아 갔다 — 뒤에 나온 문제일수록
   *  불리했고, 심하면 글자를 놓을 자리조차 모자랐다.
   *  이제 문제마다 재질·구멍 배치를 새로 만들어 모두 같은 조건에서 시작한다.
   *
   *  ⚠ 캐릭터가 선 칸은 남겨 두고, 발밑 높이를 새 재질에 맞춰 다시 맞춘다.
   *    (재질마다 두께가 달라서 이걸 빠뜨리면 캐릭터가 공중에 뜨거나 파묻힌다)
   */
  function refreshBoard() {
    var here = player ? { i: player.ci, j: player.cj } : { i: START.i, j: START.j };
    if (!inBounds(here.i, here.j)) here = { i: START.i, j: START.j };

    quizTiles = [];
    buildWorld(here);

    if (player) {
      if (!SK.Tiles.isSolid(getTile(player.ci, player.cj))) {
        var back = nearestSolid(player.ci, player.cj);
        player.ci = back.i; player.cj = back.j;
        player.x = back.i; player.y = back.j; player.z = 0;
        player.hopping = false;
      }
      player.fromI = player.ci; player.fromJ = player.cj;
      player.surface = player.surfaceTarget = worldApi.surfaceOf(player.ci, player.cj);

      /* 새로 깔린 타일이 살짝 눌렸다 올라오게 해서 '판이 바뀌었다'가 눈에 보이게 한다.
         타일의 스프링 물리를 그대로 쓰므로 따로 연출을 만들 필요가 없다. */
      for (var k = 0; k < tiles.length; k++) tiles[k].press = 0.16 + Math.random() * 0.14;
      SK.Particles.ring(player.ci, player.cj, {
        size: 150, life: 0.5, width: 2, color: 'rgba(255,255,255,'
      });
    }

    /* 판이 바뀌면 경계도 바뀐다. 이걸 빠뜨리면 clampCam 이 **지난 판의 경계**로
       카메라를 묶어서, 캐릭터가 화면 밖에 있는데도 카메라가 따라가지 못한다.
       판이 화면보다 작던 시절에는 카메라가 거의 고정이라 티가 나지 않았다. */
    boardWorld = computeBoardWorld();
    snapCamToPlayer();
  }

  /** 카메라를 캐릭터 위로 곧바로 옮긴다 — 판이 통째로 바뀌었을 때는 따라갈 게 아니라 옮겨야 한다 */
  function snapCamToPlayer() {
    if (!player) return;
    var ps = world(player.x, player.y, 0);
    cam.x = ps.x; cam.y = ps.y;
    clampCam();
  }

  /** 남은 타일이 전부 이어져 있는가 (8방향 이웃 기준) */
  function allConnected() {
    var total = 0, startKey = null;
    for (var k in tileAt) { total++; if (startKey === null) startKey = k; }
    if (!total) return false;
    var seen = Object.create(null), queue = [startKey];
    seen[startKey] = true;
    while (queue.length) {
      var parts = queue.pop().split(',');
      eachReach(+parts[0], +parts[1], function (ni, nj) {
        var key = ni + ',' + nj;
        if (tileAt[key] && !seen[key]) { seen[key] = true; queue.push(key); }
      });
    }
    var reached = 0;
    for (var s2 in seen) reached++;
    return reached === total;
  }

  function carveHoles(keep) {
    var cand = [];
    for (var i = 0; i < GRID; i++) {
      for (var j = 0; j < GRID; j++) {
        if (i === START.i && j === START.j) continue;     // 시작 칸은 남긴다
        if (keep && i === keep.i && j === keep.j) continue;   // 서 있는 칸도 남긴다
        if (!tileAt[i + ',' + j]) continue;               // 애초에 길이 아닌 칸
        cand.push({ i: i, j: j });
      }
    }
    cand = SK.Quiz.shuffle(cand);

    var want = Math.round(tiles.length * HOLE_RATIO);
    for (var n = 0; n < cand.length && want > 0; n++) {
      var c = cand[n], key = c.i + ',' + c.j;
      var t = tileAt[key];
      if (!t || touchesHole(c.i, c.j)) continue;
      delete tileAt[key];
      if (allConnected()) {
        tiles.splice(tiles.indexOf(t), 1);                // 진짜로 없앤다
        want--;
      } else {
        tileAt[key] = t;                                  // 섬이 생기면 되돌린다
      }
    }
  }

  /* =========================================================
   *  이웃 — 걸어서 한 칸, 뛰어서 두 칸
   *
   *  연결성과 길 판정은 "갈 수 있는가"를 묻는 것이므로, 걷기(한 칸)와
   *  건너뛰기(두 칸)를 **둘 다** 셈에 넣어야 한다. 한 칸만 보면 디딤돌 구간이
   *  섬으로 잡혀 판이 통째로 퇴짜를 맞고, 두 칸만 보면 붙어 있는 길이 안 보인다.
   * ======================================================= */
  function eachReach(i, j, fn) {
    var DIRS = SK.Player.DIRS;
    for (var d = 0; d < DIRS.length; d++) {
      if (fn(i + DIRS[d].di, j + DIRS[d].dj) === false) return;
      if (fn(i + DIRS[d].di * JUMP_SPAN, j + DIRS[d].dj * JUMP_SPAN) === false) return;
    }
  }

  /** 이 칸이 이미 뚫린 구멍과 맞닿아 있는가 (8방향) */
  function touchesHole(i, j) {
    var DIRS = SK.Player.DIRS;
    for (var d = 0; d < DIRS.length; d++) {
      var ni = i + DIRS[d].di, nj = j + DIRS[d].dj;
      if (!inBounds(ni, nj)) continue;                  // 보드 밖은 구멍이 아니다
      if (!tileAt[ni + ',' + nj]) return true;
    }
    return false;
  }

  function getTile(i, j) { return tileAt[i + ',' + j] || null; }
  function inBounds(i, j) { return i >= 0 && j >= 0 && i < GRID && j < GRID; }

  /* =========================================================
   *  퀴즈
   * ======================================================= */
  var resumed = false;

  function startWith(quizzes) {
    session = SK.Quiz.createSession(quizzes);
    fsm = SK.Quiz.createMachine();

    /* 하던 판이 남아 있으면 먼저 되살린다. 시작 화면 뒤로 그 판이 그대로
       보이므로, 플레이어는 '이어하기'와 '새로 시작' 중에 고르기만 하면 된다. */
    resumed = false;
    var snap = SK.Save ? SK.Save.read() : null;
    if (snap) {
      try { resumed = applySave(snap); }
      catch (e) { resumed = false; if (window.console) console.warn('[save] 되살리지 못함', e); }
    }
    if (!resumed) {
      if (SK.Save) SK.Save.clear();
      resetRun();
      beginRun();
      nextQuiz();
    }
    if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(loop); }
  }

  /** 되살린 판으로 시작했는가 — 시작 화면이 버튼을 고르는 데 쓴다 */
  function canResume() { return resumed; }

  function nextQuiz() {
    var q = session.next();
    if (!q) { ui.prompt.textContent = '해당 과목의 문제가 없습니다.'; return; }
    run.quizzes++;
    quizTouched = false;
    fsm.setQuiz(q);
    /* 바닥 재질은 판을 깔기 **전에** 정한다. 나중에 갈아 끼우면 재질마다 두께가
       달라서 캐릭터가 공중에 뜨거나 파묻힌다(refreshBoard 가 발밑 높이를 이미 맞춰 둔 뒤다). */
    floorMat = drawFloorMat(q.material);
    refreshBoard();          // 앞 문제에서 부서진 자리를 물려받지 않는다
    layoutQuiz(q);
    maybeSpawnHeart();
    phase = 'play';
    SK.Audio.newQuiz();
    renderHUD(true);
    saveNow(true);
  }

  /** 문제 타일을 바닥에 뿌린다 (판은 refreshBoard 가 이미 바닥 재질로 깔아 두었다) */
  function layoutQuiz(q) {
    for (var k = 0; k < quizTiles.length; k++) {
      var old = quizTiles[k];
      old.label = null; old.role = 'plain'; old.payload = null;
      old.state = 'idle'; old.order = -1; old.correct = false;
      SK.Tiles.retexture(old, floorMat);
    }
    quizTiles = [];

    /* 글자 타일은 밟는 순간 판정되는 칸이라 **지나가는 길이 될 수 없다**.
       글자로 판을 거의 덮으면 다음 글자로 건너갈 때 반드시 오답을 밟게 되고,
       진행이 계속 처음으로 돌아가 문제를 영영 풀 수 없다. 판이 작을수록(휴대폰
       4x4) 바로 이 상황이 된다. 그래서 절반쯤은 디딤 타일로 남겨 길을 둔다. */
    var free = pickCells();
    var budget = Math.max(q.sequence.length, Math.floor(free.length * 0.55));
    var items = SK.Quiz.plan(q, budget);
    var correct = items.filter(function (it) { return it.correct; })
      .sort(function (a, b) { return a.order - b.order; });

    /* 먼저 놓은 글자가 뒤에 놓을 글자의 길을 막아 버리는 배치가 나온다.
       한 번 막히면 그대로 굳으므로, 칸을 다시 섞어 몇 번이고 새로 시도한다. */
    var ok = false;
    for (var attempt = 0; attempt < 14 && !ok; attempt++) {
      clearAllLabels();
      var cells = SK.Quiz.shuffle(pickCells());
      ok = true;
      for (var n = 0; n < correct.length && ok; n++) {
        if (!placeItem(correct[n], cells, q)) ok = false;
      }
      if (ok && !roadOk()) ok = false;
    }

    // 끝내 자리를 못 찾으면(많이 닳은 판) 길 조건을 접고라도 정답은 올려 둔다
    if (!ok) {
      clearAllLabels();
      var any = pickCells();
      for (var f = 0; f < correct.length; f++) placeItem(correct[f], any, q, true);
      openLetterPath();
    }

    // 오답은 길을 막지 않는 자리에만 — 자리가 없으면 그냥 놓지 않는다
    var spots = SK.Quiz.shuffle(pickCells());
    for (var d = 0; d < items.length; d++) {
      if (!items[d].correct) placeItem(items[d], spots, q);
    }

    keepHeartValid();
  }

  function clearAllLabels() {
    for (var k = quizTiles.length - 1; k >= 0; k--) stripLabel(quizTiles[k]);
  }

  /* =========================================================
   *  하트 — 목숨 하나를 되찾는 칸
   * ======================================================= */

  /**
   * 하트를 놓을 수 있는 칸인가.
   *
   *  · 글자가 얹힌 칸은 뺀다. 오답 위에 놓으면 하트를 먹으러 가다 목숨을 잃는
   *    덫이 되고, 정답 위에 놓으면 문제 진행과 보상이 한 번에 일어나 뭘 얻었는지
   *    알 수 없다. 글자가 없는 디딤 타일이면 둘 다 아니다.
   *  · 구멍과 부서진 자리는 애초에 딛을 수가 없다.
   *  · 지금 서 있는 칸도 뺀다 — 놓자마자 먹히면 기회가 아니라 그냥 지급이다.
   */
  function heartOk(t) {
    return !!t && !t.label && SK.Tiles.isSolid(t) &&
           !(player && t.i === player.ci && t.j === player.cj);
  }

  /** 지금 판에서 하트를 놓을 수 있는 칸들 */
  function heartCells() {
    var out = [];
    for (var k = 0; k < tiles.length; k++) if (heartOk(tiles[k])) out.push(tiles[k]);
    return out;
  }

  /** 새 문제를 깔 때 한 번 — 이번 판에 하트를 띄울지 정한다 */
  function maybeSpawnHeart() {
    heartAt = null;
    if (lives >= MAX_LIVES) return;                     // 더 채울 데가 없다
    if (run.quizzes % HEART_EVERY !== 0) return;
    if (Math.random() >= HEART_CHANCE) return;
    placeHeart();
  }

  /** 놓을 수 있는 칸 중 하나를 무작위로 */
  function placeHeart() {
    var cells = heartCells();
    if (!cells.length) { heartAt = null; return; }
    var t = cells[Math.floor(Math.random() * cells.length)];
    heartAt = { i: t.i, j: t.j };
  }

  /* 판을 다시 깔면(화면 크기 변경·이어하기) 하트가 놓였던 칸에 글자가 올라올 수
     있다. 그러면 자리를 옮긴다 — 글자 위에 남겨 두면 덫이 된다. */
  function keepHeartValid() {
    if (!heartAt) return;
    if (heartOk(getTile(heartAt.i, heartAt.j))) return;
    placeHeart();
  }

  /** 하트를 밟았다 — 목숨 하나를 되찾는다 */
  function takeHeart(i, j) {
    heartAt = null;
    var full = lives >= MAX_LIVES;
    if (!full) lives += 1;
    renderLives();
    if (ui.hearts) {
      ui.hearts.classList.remove('gain');
      void ui.hearts.offsetWidth;          // 애니메이션 재시작
      ui.hearts.classList.add('gain');
    }
    SK.Audio.heart({ pan: panOf(i, j) });
    SK.Particles.text(i, j, full ? '가득!' : '♥ +1', {
      size: 28, color: '#ff8fb0', life: 1.1, gz: 0.9, vz: 0.05
    });
    SK.Particles.ring(i, j, { size: 120, life: 0.6, width: 3, color: 'rgba(255,143,176,' });
    setFlash(0.16, 344);
    saveNow(true);
  }

  /* =========================================================
   *  "정답을 밟으러 갈 길"이 반드시 있어야 한다
   *
   *  글자 타일은 밟는 순간 판정이 난다. 그래서 다음 글자로 가는 도중에 다른
   *  글자를 밟으면 오답이 되어 진행이 처음으로 돌아간다. 판이 작아지면(휴대폰
   *  4x4) 글자가 판을 거의 덮어 버려서, **오답을 밟지 않고는 다음 글자로 갈 수
   *  없는 판**이 만들어졌다 — 아무리 해도 답을 넣을 수 없었다.
   *
   *  그래서 규칙을 하나 세운다.
   *    **글자가 없는 디딤 타일로 이어진 '길'이 하나 있고, 캐릭터와 모든 글자가
   *      그 길에 맞닿아 있어야 한다.**
   *  그러면 어느 글자에서든 길로 내려섰다가 다른 글자로 올라갈 수 있다. 도중에
   *  틀려 진행이 리셋돼도, 서 있는 자리가 어디든 길을 따라 첫 글자로 갈 수 있다.
   *  타일이 없는 칸(구멍)과 부서진 자리는 길이 될 수 없다.
   * ======================================================= */

  /** 글자가 없는 성한 타일들이 이루는 가장 큰 덩어리 — 이것이 '길'이다.
      except 를 주면 그 타일은 없는 셈 친다(부서뜨려도 되는지 미리 볼 때). */
  function roadCells(except) {
    var seen = Object.create(null), best = null, DIRS = SK.Player.DIRS;
    for (var k = 0; k < tiles.length; k++) {
      var t0 = tiles[k];
      if (t0 === except || t0.label || !SK.Tiles.isSolid(t0)) continue;
      var key0 = t0.i + ',' + t0.j;
      if (seen[key0]) continue;

      var comp = Object.create(null), queue = [t0], n = 0;
      seen[key0] = true; comp[key0] = true;
      while (queue.length) {
        var cur = queue.pop(); n++;
        eachReach(cur.i, cur.j, function (ni, nj) {
          var key = ni + ',' + nj;
          if (seen[key]) return;
          var t = getTile(ni, nj);
          if (!t || t === except || t.label || !SK.Tiles.isSolid(t)) return;
          seen[key] = true; comp[key] = true; queue.push(t);
        });
      }
      if (!best || n > best.size) best = { cells: comp, size: n };
    }
    return best;
  }

  /** 이 칸이 길 위에 있거나 길과 맞닿아 있는가 (8방향) */
  function touchesRoad(i, j, road) {
    if (road.cells[i + ',' + j]) return true;
    var hit = false;
    eachReach(i, j, function (ni, nj) {
      if (road.cells[ni + ',' + nj]) { hit = true; return false; }
    });
    return hit;
  }

  /** 캐릭터와 모든 글자가 같은 길에 붙어 있는가 */
  function roadOk() { return roadOkWithout(null); }

  /**
   * except 타일이 사라져도 길이 남아 있는가.
   * 밟아서 부서질 때 이걸 먼저 본다 — 길을 끊어 버리는 타일은 부서지지 않고
   * 금만 간 채로 버틴다. 부서진 뒤에 수습하는 것보다 확실하다.
   */
  function roadOkWithout(except) {
    var road = roadCells(except);
    if (!road) return false;
    if (!touchesRoad(player.ci, player.cj, road)) return false;
    for (var k = 0; k < quizTiles.length; k++) {
      var t = quizTiles[k];
      if (t === except) continue;              // 글자는 부서지면 옮겨 간다
      if (!touchesRoad(t.i, t.j, road)) return false;
    }
    return true;
  }

  function stripLabel(t) {
    var at = quizTiles.indexOf(t);
    if (at >= 0) quizTiles.splice(at, 1);
    t.label = null; t.payload = null; t.role = 'plain';
    t.order = -1; t.correct = false; t.state = 'idle';
    SK.Tiles.retexture(t, floorMat);
  }

  function putLabel(t, it, mat) {
    t.label = it.label; t.payload = it.token; t.role = 'seq';
    t.order = it.order; t.correct = it.correct; t.state = 'idle';
    SK.Tiles.retexture(t, mat);
    quizTiles.push(t);
  }

  /**
   * 글자 한 칸 놓기 — 놓아 본 뒤 길이 살아 있으면 확정, 막히면 무른다.
   * force 면 길 조건을 접고라도 놓는다(정답 글자가 판에서 빠지는 것보다 낫다).
   */
  function placeItem(it, cells, q, force) {
    var fallback = null;
    for (var n = 0; n < cells.length; n++) {
      var t = getTile(cells[n].i, cells[n].j);
      if (!t || t.label || !SK.Tiles.isSolid(t)) continue;
      if (!fallback) fallback = t;
      putLabel(t, it, q.material);
      if (roadOk()) return true;
      stripLabel(t);
    }
    if (force && fallback) { putLabel(fallback, it, q.material); return true; }
    return false;
  }

  /** 길을 막고 있는 오답을 지운다 — 오답은 없어도 문제가 성립한다 */
  function clearBlockingDecoys() {
    for (var k = quizTiles.length - 1; k >= 0; k--) {
      if (roadOk()) return true;
      if (!quizTiles[k].correct) stripLabel(quizTiles[k]);
    }
    return roadOk();
  }

  /** 길에 붙지 못한 글자를 길가 타일로 옮긴다 */
  function moveLettersToRoad() {
    for (var k = 0; k < quizTiles.length; k++) {
      var road = roadCells();
      if (!road) return false;
      var t = quizTiles[k];
      if (touchesRoad(t.i, t.j, road)) continue;

      for (var n = 0; n < tiles.length; n++) {
        var o = tiles[n];
        if (o === t || o.label || !SK.Tiles.isSolid(o)) continue;
        if (o.i === player.ci && o.j === player.cj) continue;
        if (!touchesRoad(o.i, o.j, road)) continue;
        o.label = t.label; o.payload = t.payload;
        SK.Tiles.retexture(o, t.mat);
        o.role = 'seq'; o.order = t.order; o.correct = t.correct; o.state = t.state;
        quizTiles[k] = o;
        t.label = null; t.payload = null; t.role = 'plain';
        t.order = -1; t.correct = false; t.state = 'idle';
        SK.Tiles.retexture(t, floorMat);
        break;
      }
    }
    return roadOk();
  }

  /** 길이 막혔으면 뚫는다 — 오답을 지우고, 그래도 안 되면 글자를 옮긴다 */
  function openLetterPath() {
    if (roadOk()) return true;
    if (clearBlockingDecoys()) return true;
    return moveLettersToRoad();
  }


  /** 캐릭터가 서 있는 칸을 뺀 모든 칸을 섞어서 돌려준다 */
  function pickCells() {
    var cand = [];
    for (var i = 0; i < GRID; i++) {
      for (var j = 0; j < GRID; j++) {
        if (player && i === player.ci && j === player.cj) continue;
        if (!SK.Tiles.isSolid(getTile(i, j))) continue;   // 구멍·부서진 자리에는 못 놓는다
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
   *   2) TAP_HOLD_MS — 방금 톡 누른 방향 키가 그 축을 잠깐 맡아 준다.
   *      `↑` 톡 → `←` 톡 처럼 **번갈아 눌러도** 대각선 조준이 된다.
   *   3) Player 의 AIM_HOLD — 방향을 떼고 점프해도 조준이 잠깐 남아 있다.
   *  셋 다 **조준**만 돕는다. 움직이려면 반드시 점프 키를 눌러야 한다.
   */
  /* 방향 입력은 **지금 눌려 있는 키만으로** 정한다.
   *
   *  ⚠ 두 번 틀렸던 자리다.
   *   1) 최근에 눌린 키들을 '묶음' 하나에 모아 전부 더했다. 뗀 키가 묶음에 남아
   *      ←와 →가 같이 들어가면 **서로 상쇄되어 조준이 0**이 됐다. →와 ↓만 누르고
   *      있는데 조준선이 사라지고, 그 상태로 점프하면 제자리 내려찍기가 됐다.
   *   2) 그래서 축마다 '최근에 톡 누른 키 하나'를 기억하게 고쳤다. 상쇄는 사라졌지만
   *      이번엔 **뗀 키가 그 축을 계속 맡았다.** ↑+→ 로 비스듬히 걷다가 → 만 떼도
   *      → 의 기억이 가로축에 남아 계속 ↗ 로 갔다. 위로 가려고 손가락을 하나 뗐는데
   *      방향이 그대로인 것이다. 재현해 보니 ↑ 만 남겨도, → 만 남겨도 둘 다 ↗ 였다.
   *
   *  두 번 다 원인이 같다 — **떼어 놓고도 남아 있는 키**다. 그래서 규칙을 하나로
   *  줄였다: 방향 키가 하나라도 눌려 있으면 **눌린 것만** 더한다. 뗀 키는 그
   *  즉시 빠진다. (←와 →를 실제로 같이 누르고 있으면 0이 맞다 — 의도된 상쇄다.)
   *
   *  기억은 **다 뗐을 때만** 쓴다. 방향을 잡았다 떼고 점프하는 흐름을 위해서다
   *  (대각선+점프는 세 키 동시인데, 값싼 키보드는 그 조합을 삼킨다). 마지막으로
   *  눌려 있던 방향 하나를 TAP_HOLD_MS 동안 들고 있다가 지운다.
   *
   *  '↑ 톡 → 톡을 ↗ 로 합치던' 규칙(CHAIN_MS)은 걷어냈다. 걷기가 생긴 뒤로는
   *  방향을 톡 누르면 그 자리에서 한 칸 걸어가 버리므로, 합칠 '조준'이 애초에
   *  남지 않는다. 방향키 패드도 같은 이유로 이미 합치기를 뺐다. */
  var TAP_HOLD_MS = 420;     // 다 뗀 뒤 마지막 조준이 남아 있는 시간

  var lastDir = { x: 0, y: 0 };   // 마지막으로 '눌려 있던' 방향
  var lastDirAt = -1e9;           // 그때의 시각
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
      lastDir.x = lastDir.y = 0;
      lastDirAt = -1e9;
      input.dirHeld = false; input.dirTapAt = -1e9;
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

  /** 남은 조준 기억을 비운다 — 뛰고 나면 새로 잡아야 한다.
      누르고 있는 키는 어차피 다음 프레임에 다시 읽히므로 잃을 게 없다. */
  function clearKeyCombine() {
    lastDir.x = lastDir.y = 0;
    lastDirAt = -1e9;
  }

  function clamp1(v) { return v < -1 ? -1 : (v > 1 ? 1 : v); }

  /** 눌려 있는 방향 키만 더해 조준을 정한다. 다 뗐을 때만 마지막 조준이 잠깐 남는다. */
  function syncKeyDir() {
    if (padActive) return;                 // 조이스틱을 잡고 있으면 그쪽이 우선
    var tnow = performance.now(), x = 0, y = 0, held = false;
    for (var c in KEYDIR) {
      if (!input.keys[c]) continue;
      x += KEYDIR[c][0]; y += KEYDIR[c][1];
      held = true;
    }
    setDirHeld(held);
    if (held) {
      input.fromStick = false;       // 키보드·방향키가 잡았다
      /* 뗀 키는 그 즉시 빠진다 — ↑+→ 로 걷다 → 만 떼면 곧바로 ↑ 가 된다.
         예전에는 뗀 → 의 기억이 가로축에 남아 계속 ↗ 로 갔다. */
      input.dx = lastDir.x = clamp1(x);
      input.dy = lastDir.y = clamp1(y);
      lastDirAt = tnow;
      return;
    }
    // 다 뗀 뒤 — 방향을 잡았다 떼고 점프할 수 있게 마지막 조준을 잠깐 들고 있는다
    var alive = tnow - lastDirAt < TAP_HOLD_MS;
    input.dx = alive ? lastDir.x : 0;
    input.dy = alive ? lastDir.y : 0;
  }

  /* =========================================================
   *  입력 — 화면 컨트롤 (Pointer Events)
   *  터치·마우스·스타일러스를 같은 코드로 처리한다.
   *
   *  손에 맞는 컨트롤은 사람마다 다르다. 그래서 둘 다 두고 메뉴에서 고른다.
   *    · 방향키  — 칸마다 따로 누르는 버튼. 둘을 **함께 누르면** 대각선이다
   *    · 조이스틱 — 손가락이 처음 닿은 자리가 원점인 플로팅 스틱
   *  둘 다 방향키 코드(ArrowUp/Down/Left/Right)나 input.dx/dy 로 흘러들어가
   *  키보드와 같은 경로를 탄다.
   * ======================================================= */
  var padActive = false;          // 조이스틱을 잡고 있는 동안 키 입력보다 우선한다
  var padAimEl = null;

  /* 여덟 방향을 한 칸씩. 화면 기준 방향이고, 값은 KEYDIR 에 이미 있는 키 코드라
     키보드와 똑같은 경로를 탄다(↖ KeyQ · ↗ KeyE · ↙ KeyZ · ↘ KeyC). */
  var DPAD_KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft',
                   'KeyQ', 'KeyE', 'KeyZ', 'KeyC'];

  /* ---------- 방향키 ----------
   *
   *  두 번 갈아엎고 지금 모양이 됐다.
   *   1) 패드 한가운데에서의 **각도**로 방향을 정했다 — 화살표 쪽을 넓게 잡아도
   *      손끝이 조금만 빗나가면 옆 방향이 잡혀, 결국 스틱과 같은 문제가 됐다.
   *   2) 네 칸을 두고 **둘을 겹쳐 눌러** 대각선을 만들었다 — 판정은 정확했지만
   *      한 손가락으로는 두 칸을 함께 누를 수가 없었다.
   *   3) **여덟 방향을 한 칸씩** 두었다. 한 번에 하나만 누르면 된다.
   *   4) 그런데 3x3 정사각형이라 칸이 45°씩 놓였다 — 판은 2:1 마름모라 이웃 칸이
   *      실제로는 0 · ±26.6 · ±90 · ±153.4° 에 있다. 네 대각선 칸이 18.4°씩
   *      어긋나, ↗ 버튼이 화면에서는 거의 옆으로 가는 꼴이었다. 그래서 칸을
   *      **판과 같은 마름모**로 옮기고 화살표도 그 각도로 눕혔다(style.css).
   *      자리가 곧 방향이라는 말이 그제야 사실이 됐다.
   *
   *  칸마다 제 포인터를 받으므로 어느 손가락이 어느 칸에 있는지만 세면 된다.
   */
  function bindDpad(pad) {
    var held = Object.create(null);          // pointerId → 방향 코드
    var keyEls = {};
    var els = pad.querySelectorAll('.dkey');

    /** 지금 눌려 있는 칸들을 방향 키로 옮긴다 (키보드와 같은 경로) */
    function sync(pressedNow) {
      var on = Object.create(null);
      for (var id in held) on[held[id]] = true;

      for (var k = 0; k < DPAD_KEYS.length; k++) {
        var code = DPAD_KEYS[k];
        input.keys[code] = !!on[code];
        if (keyEls[code]) keyEls[code].classList.toggle('on', !!on[code]);
      }

      /* 패드의 한 칸은 **그 자체로 완결된 방향**이다. 누른 칸만 더하면 되므로
         따로 기억을 손볼 게 없다 — syncKeyDir 이 눌린 칸만 읽는다.
         (예전에는 패드에도 '이어 누른 두 방향을 합치는' 규칙을 적용해서, ↑ 를
         눌렀다 곧바로 → 를 누르면 ↑ 의 세로 성분이 남아 ↗ 가 됐다. 키보드에서도
         같은 뿌리의 문제가 있어 두 곳 모두 눌린 것만 보도록 정리했다.) */
      if (pressedNow && diagEl) pushDiag('down', pressedNow);
      syncKeyDir();
    }

    function bindKey(el) {
      var code = el.getAttribute('data-dir');
      keyEls[code] = el;

      el.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        /* 포인터를 이 버튼에 묶어 둔다 — 손가락이 살짝 미끄러져도 계속 눌린
           것으로 치고, pointerup 이 반드시 이 버튼으로 돌아온다. */
        try { el.setPointerCapture(e.pointerId); } catch (_) { }
        held[e.pointerId] = code;
        sync(code);
      });
      function release(e) {
        if (held[e.pointerId] === undefined) return;
        delete held[e.pointerId];
        sync(null);
      }
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      // 캡처가 걸리지 않는 환경(구형 브라우저)을 위한 보험
      el.addEventListener('pointerleave', function (e) {
        if (e.pointerType === 'mouse' && e.buttons === 0) release(e);
      });
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    for (var n = 0; n < els.length; n++) bindKey(els[n]);

    /** 컨트롤을 바꾸거나 끌 때 — 누른 채로 남은 칸이 없게 한다 */
    return function reset() {
      held = Object.create(null);
      sync(null);
    };
  }

  /* ---------- 조이스틱 ----------
   *
   *  · 원점은 패드 한가운데가 아니라 **손가락이 처음 닿은 자리**다(플로팅 스틱).
   *    고정 원점이면 패드 가장자리를 짚는 순간 그 방향이 곧바로 입력돼서,
   *    "잡자마자 엉뚱한 데를 조준한다"가 된다.
   *  · 데드존은 픽셀이 아니라 반경 비율로 잡는다 — 화면 크기가 달라도 감이 같다.
   *
   *  ⚠ 두 가지를 고쳤다. 둘 다 재현해서 확인한 것이다.
   *
   *   1) **원점이 손가락을 따라다녔다.** 반경 밖으로 밀면 원점을 끌고 가서 스틱이
   *      계속 살아 있게 했는데, 그러면 원점이 어디인지 손이 알 수 없다. 끝까지
   *      밀었다가 처음 짚은 자리로 되돌려도 **멈추지 않았다**(되돌린 뒤에도
   *      조준이 → 로 남아 있었다). 멈추질 못하니 원하는 칸을 지나쳐 계속 걸었다.
   *      이제 원점은 처음 짚은 자리에 **못 박아** 두고, 세기만 반경에서 멈춘다.
   *      짚은 자리로 돌아오면 반드시 선다.
   *
   *   2) **평활이 손가락이 움직일 때만 돌았다.** pointermove 안에서 한 칸씩
   *      다가가는 구조라, 휙 옮기고 손을 멈추면 그 자리에서 **굳었다.** ↑ 에서
   *      → 로 휙 옮기면 중간에 굳어 방향이 아예 안 잡히거나(없음) ↗ 가 됐다.
   *      이제 손가락은 목표만 적어 두고, 평활은 매 프레임 dt 로 돈다. 손을
   *      멈춰도 목표까지 끝까지 간다.
   */
  var DEAD = 0.26;          // 반경 대비 데드존
  /* 지수 평활의 '60fps 한 프레임당' 비율. 실제로는 dt 로 환산해 쓴다 —
     프레임이 느린 기기에서 스틱이 굼떠지지 않게. */
  var SMOOTH = 0.45;

  function bindStick(pad) {
    var nub = document.getElementById('touchNub');
    padAimEl = document.getElementById('touchAim');

    var padId = null, cx = 0, cy = 0, radius = 46;
    var sx = 0, sy = 0;                  // 평활된 방향 벡터(화면에 나가는 값)
    var rawX = 0, rawY = 0;              // 손가락이 가리키는 목표 — 평활의 도착점

    /** 손가락 위치를 목표 벡터로 옮겨 적는다. 값을 굴리는 건 tick 이 한다. */
    function updateFrom(e) {
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var len = Math.hypot(dx, dy);

      /* 원점은 **고정**이다. 반경을 넘으면 세기만 반경에서 멈춘다 — 손가락은
         패드 밖으로 나가도 되지만, 짚은 자리로 돌아오면 반드시 선다. */
      var show = len > radius ? radius / len : 1;
      nub.style.transform = 'translate(' + (dx * show) + 'px,' + (dy * show) + 'px)';

      var mag = Math.min(1, len / radius);
      if (mag < DEAD) { rawX = rawY = 0; return; }
      // 데드존 바깥을 0~1로 다시 펼친다(데드존 경계에서 값이 튀지 않게)
      var k = (mag - DEAD) / (1 - DEAD) / len;
      rawX = dx * k; rawY = dy * k;
    }

    /* 평활은 **매 프레임** 돈다. pointermove 안에서만 돌리면, 휙 옮기고 손을
       멈춘 순간 중간값에서 굳어 엉뚱한 방향이 잡힌다. */
    function tick(dt) {
      if (!padActive) return;
      var a = 1 - Math.pow(1 - SMOOTH, Math.max(0, dt) * 60);
      sx += (rawX - sx) * a;
      sy += (rawY - sy) * a;
      // 목표가 0이면 완전히 0까지 내려놓는다 — 꼬리가 남아 계속 걷지 않게
      if (!rawX && !rawY && Math.hypot(sx, sy) < 0.02) sx = sy = 0;
      input.dx = sx; input.dy = sy;
      setDirHeld(!!(sx || sy));
      if (sx || sy) input.fromStick = true;
      if (sx || sy) showPadAim(radius);
      else if (padAimEl) padAimEl.style.opacity = '0';
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
      sx = sy = 0; rawX = rawY = 0;
      input.dx = 0; input.dy = 0;
      setDirHeld(false);
      nub.style.transform = 'translate(' + (cx - mx) + 'px,' + (cy - my) + 'px)';
      pad.classList.add('active');
    });
    pad.addEventListener('pointermove', function (e) {
      if (e.pointerId !== padId) return;
      e.preventDefault();
      updateFrom(e);
    });
    function endPad(e) {
      if (padId !== null && e && e.pointerId !== padId) return;
      padId = null; padActive = false;
      sx = sy = 0; rawX = rawY = 0;
      input.dx = 0; input.dy = 0;
      setDirHeld(false);
      nub.style.transform = '';
      if (padAimEl) padAimEl.style.opacity = '0';
      pad.classList.remove('active');
      syncKeyDir();
    }
    pad.addEventListener('pointerup', endPad);
    pad.addEventListener('pointercancel', endPad);

    stickTick = tick;
    return function reset() { endPad(null); };
  }

  var resetDpad = null, resetStick = null;
  var stickTick = null;           // 조이스틱 평활 — loop 에서 매 프레임 돌린다

  /** 컨트롤을 바꾸거나 끌 때 — 누른 채로 남은 입력이 다음 화면까지 따라가지 않게 */
  function clearTouchInput() {
    if (resetDpad) resetDpad();
    if (resetStick) resetStick();
  }

  function bindVirtualControls() {
    var dpad = document.getElementById('touchDpad');
    var stick = document.getElementById('touchPad');
    var jmp = document.getElementById('touchJump');
    if (!jmp) return;
    if (dpad) resetDpad = bindDpad(dpad);
    if (stick) resetStick = bindStick(stick);

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

    // 지금 켜져 있는 컨트롤을 잰다 — 방향키와 조이스틱은 크기가 서로 다르다
    var padEl = document.getElementById('touchDpad');
    if (!padEl || padEl.offsetParent === null) padEl = document.getElementById('touchPad');
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
      /* 새 격자에 맞춰 캐릭터를 먼저 안으로 당긴 다음, 그 칸은 구멍으로
         뚫지 않는다 — 화면을 돌렸다는 이유로 발밑이 사라지면 안 된다. */
      player.ci = Math.min(player.ci, GRID - 1);
      player.cj = Math.min(player.cj, GRID - 1);
      buildWorld({ i: player.ci, j: player.cj });
      player.x = player.ci; player.y = player.cj;
      player.hopping = false;
      player.fromI = player.ci; player.fromJ = player.cj;
      player.surface = player.surfaceTarget = worldApi.surfaceOf(player.ci, player.cj);
      if (fsm && fsm.quiz) { quizTiles = []; layoutQuiz(fsm.quiz); }
    }

    viewRect = safeRect();
    boardWorld = computeBoardWorld();

    /* 판이 화면보다 넓으므로 "다 보이게 줄이기"는 하지 않는다. 다만 판이 안전
       영역보다 작아지는 경우(아주 큰 화면)에는 넘치지 않게만 눌러 준다. */
    var boardW = (boardWorld.maxX - boardWorld.minX) + 16;
    var boardH = (boardWorld.maxY - boardWorld.minY) + 16;
    scale = Math.min(pickZoom(), Math.max(viewRect.w / boardW, viewRect.h / boardH, 0.26));
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

    /* 카메라가 갈 수 있는 범위 — 화면 가장자리가 판 밖으로 나가지 않는 구간이다.
       왼쪽 끝은 minX + 반쪽, 오른쪽 끝은 maxX - 반쪽. 판이 화면보다 좁으면 그
       구간이 뒤집히고(lo > hi), 그때만 가운데 고정이다.

       ⚠ 예전에는 이 둘이 **서로 바뀌어** 있었다. 판이 늘 화면보다 작던 시절에는
       항상 '가운데 고정' 가지로 빠져서 티가 나지 않았는데, 판을 화면보다 넓게
       만들자 넓어질수록 더 확실히 가운데에 묶여 카메라가 아예 따라오지 않았다. */
    var xLo = boardWorld.minX + halfW, xHi = boardWorld.maxX - halfW;
    var yLo = boardWorld.minY + halfH, yHi = boardWorld.maxY - halfH;

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
    /* dt 는 절대 음수가 되면 안 된다. lastT 는 performance.now() 로 찍는데 rAF 가
       넘겨 주는 ts 는 **그 프레임이 시작된 시각**이라 조금 더 이르다 — 판을 새로
       시작한 직후처럼 둘을 연달아 찍는 순간에 (ts - lastT) 가 음수로 나온다.
       그러면 파티클의 age 가 음수가 되고, 링의 반지름이 음수가 되어 arc() 가
       예외를 던진다. 실제로 게임 오버 → 다시 시작에서 한 프레임씩 그림이 끊겼다. */
    var dt = Math.max(0, Math.min(0.05, (ts - lastT) / 1000));
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
    /* 보드 안이면 구멍이라도 뛸 수 있다 — 떨어지는 것도 플레이어의 선택이다.
       (보드 밖은 여전히 막는다. 화면 밖으로 사라지면 복구할 자리가 없다) */
    canEnter: function (i, j) { return inBounds(i, j); },
    /* 걷기는 **성한 타일 위로만** 나아간다. 빈 칸으로 걸어 나가 떨어지게 두면,
       계속 이어지는 동작이라 한 번 삐끗할 때마다 추락해 산책이 외줄타기가 된다.
       떨어지는 건 건너뛰기를 잘못했을 때의 일로 남긴다. */
    canWalk: function (i, j) {
      return inBounds(i, j) && SK.Tiles.isSolid(getTile(i, j));
    },
    surfaceOf: function (i, j) {
      return SK.Tiles.surfaceOffset(getTile(i, j));
    }
  };

  function update(dt) {
    // 게임 오버 중에는 파티클만 흐르게 두고 진행은 멈춘다
    if (phase === 'over') {
      SK.Particles.update(dt);
      if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 3.2);
      if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
      return;
    }
    /* 플레이 시간. 탭을 숨기거나 창을 옮기면 requestAnimationFrame 이 멈추므로
       시계도 저절로 같이 멈춘다 — 켜 두고 자리를 비운 시간은 세지 않는다. */
    run.timeMs += dt * 1000;

    if (phaseTimer > 0) {
      phaseTimer -= dt;
      if (phaseTimer <= 0) {
        if (phase === 'wrong') { fsm.resume(); phase = 'play'; clearWrongMarks(); }
        else if (phase === 'solved') nextQuiz();
      }
    }

    // 점프 입력은 '눌림 유지' 방식 — 조준을 먼저 잡고 눌러도, 누른 채 조준을 바꿔도 뛴다
    // 톡 입력(TAP_HOLD_MS)은 키 이벤트가 없어도 만료돼야 하므로 매 프레임 다시 센다
    if (stickTick) stickTick(dt);   // 조이스틱 평활은 손가락이 멈춰도 계속 간다
    syncKeyDir();

    // 이번 프레임에 플레이어가 '뛸 수 있는 상태'였는가 — 요청 소비 판단의 기준
    var couldAct = !player.hopping && player.cooldown <= 0 && player.stunTimer <= 0;

    // 조준이 아직 없는 점프 요청은 STOMP_GRACE_MS 동안 붙들고 방향을 기다린다
    var hasAim = !!(input.dx || input.dy || player.aimDir);
    var waitingForAim = !hasAim && (performance.now() - input.jumpAt < STOMP_GRACE_MS);

    var wantJump = (input.jumpHeld || jumpPending()) && !waitingForAim;
    /* 걷기는 지금 잡고 있는 방향, 또는 방금(WALK_BUFFER_MS 안에) 누른 방향으로만.
       남아 있는 조준만으로는 걷지 않는다 — 한 번 눌러 두 칸 가던 원인이다. */
    var wantWalk = input.dirHeld ||
                   (performance.now() - input.dirTapAt < WALK_BUFFER_MS);
    var wasHopping = player.hopping;
    SK.Player.update(player, { dx: input.dx, dy: input.dy, jump: wantJump, walk: wantWalk,
                               walkScale: input.fromStick ? STICK_WALK_SCALE : 1 },
                     dt, worldApi, {
      onTakeoff: function (power) { SK.Audio.whoosh(power, panOf(player.x, player.y)); },
      onLand: function (intensity, power, i, j) { land(intensity, power, i, j); }
    });
    if (!wasHopping && player.hopping) {
      // 방향 조준 버퍼를 비운다 — 안 그러면 직전 방향이 다음 조준에 섞여 든다
      clearKeyCombine();
      // 이 걸음으로 눌림 하나를 썼다. 남겨 두면 그것으로 또 한 칸 간다.
      input.dirTapAt = -1e9;
    }
    /* 점프 요청을 소비한다 — 뛸 기회가 있었거나, **실제로 뛰었으면**.
     *
     *  ⚠ 'couldAct' 만으로 판단하면 한 프레임 어긋난다. couldAct 는 update 전에
     *  재는데, 쿨다운을 깎는 것은 update 안이다. 그래서 **쿨다운이 바로 이 프레임에
     *  끝나면서 도약이 나가는 순간**에는 couldAct 가 아직 false 라, 뛰어 놓고도
     *  요청이 남았다. 남은 요청은 JUMP_STALE_MS(0.9초) 동안 살아서 착지할 때마다
     *  다시 발사됐다 — 한 번 누른 Space 로 두 번, 세 번 뛰었다.
     *
     *  재현 기록: 108ms 에 Space, 142ms 1차 도약, 509ms 2차, 892ms 3차(제자리
     *  내려찍기), 1009ms 에야 만료로 꺼짐. 쿨다운이 끝나는 프레임에 요청이
     *  걸려야 하므로 늘 나지는 않고 절반쯤 났다.
     *
     *  그래서 예측(couldAct) 대신 **결과**도 함께 본다 — 이 프레임에 도약이
     *  시작됐으면 그 요청은 쓴 것이다. 요청이 살아 있는 동안 wantJump 는 참이므로,
     *  이때의 도약은 걸음이 아니라 반드시 점프다. */
    var tookOff = !wasHopping && player.hopping;
    if ((couldAct || tookOff) && !waitingForAim) consumeJump();

    // 점프 궤적 (소리 ↔ 시각 연결)
    if (player.hopping && Math.random() < 0.55) {
      SK.Particles.trail(player.x, player.y, player.z * 0.9, player.power);
    }

    for (var i = 0; i < tiles.length; i++) SK.Tiles.update(tiles[i], dt);
    updateAim(dt);
    if (player.justLanded) saveNow();

    /* 카메라 — 캐릭터를 따라간다.
       판이 화면보다 넓어졌으므로 더 이상 보드 중심에 매달아 둘 수 없다. 다만
       한 칸 걸을 때마다 화면이 홱 따라오면 멀미가 나므로 부드럽게 쫓고,
       clampCam 이 판 바깥의 빈 공간을 비추지 않게 막는다. */
    var ps = world(player.x, player.y, 0);
    var k = Math.min(1, dt * 4.2);
    cam.x += (ps.x - cam.x) * k;
    cam.y += (ps.y - cam.y) * k;
    clampCam();   // 판 바깥의 허공이 보이지 않게
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 3.2);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.6);

    SK.Particles.update(dt);
  }

  /** 지금 점프하면 어디에 착지하는지 타일에 표시한다 */
  /* 구멍을 조준했을 때의 경고 표시.
     타일이 없으니 t.aim 에 실을 수 없어 따로 들고 다닌다. 표시가 아예 없으면
     플레이어는 "방향이 안 잡혔다"고 오해한다 — 그건 조준이 사라지는 버그와
     구별되지 않는다. 그래서 구멍도 반드시 무언가를 보여 준다. */
  var holeAim = { i: 0, j: 0, a: 0 };

  function updateAim(dt) {
    var target = null, holeTarget = null;
    /* 표시하는 것은 **건너뛰기가 닿을 자리**(두 칸)다. 걷기는 방향을 누르는 즉시
       가 버리므로 미리 보여 줄 것이 없고, 정작 미리 알아야 하는 건 "점프를 누르면
       어디에 떨어지나"이기 때문이다. */
    if (!player.hopping && player.stunTimer <= 0 && player.aimDir) {
      var ni = player.ci + player.aimDir.di * JUMP_SPAN;
      var nj = player.cj + player.aimDir.dj * JUMP_SPAN;
      if (worldApi.canEnter(ni, nj)) {
        target = getTile(ni, nj);
        if (!SK.Tiles.isSolid(target)) { target = null; holeTarget = { i: ni, j: nj }; }
      }
    }
    if (holeTarget) { holeAim.i = holeTarget.i; holeAim.j = holeTarget.j; }
    holeAim.a += ((holeTarget ? 1 : 0) - holeAim.a) * Math.min(1, dt * 14);
    if (holeAim.a < 0.01) holeAim.a = 0;
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      var want = (t === target) ? 1 : 0;
      t.aim += (want - t.aim) * Math.min(1, dt * 14);
      if (t.aim < 0.01) t.aim = 0;
    }
  }

  /* =========================================================
   *  착지 — 소리와 시각 효과를 항상 함께 낸다
   * ======================================================= */
  function land(intensity, power, i, j) {
    var t = getTile(i, j);
    // 부서진 자리는 구멍과 같다 — 되살아나지 않으므로 딛고 설 수 없다
    if (!SK.Tiles.isSolid(t)) { fallIntoHole(i, j); return; }
    var mat = t.mat;
    var pan = panOf(i, j), depth = depthOf(i, j);

    var res = SK.Tiles.stomp(t, intensity, power, canBreak(t));

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

    if (heartAt && heartAt.i === i && heartAt.j === j) takeHeart(i, j);

    visit(t);

    if (res.sound === 'shatter') {
      // 부서진 타일은 되살아나지 않는다. 글자는 성한 칸으로 옮겨 준다.
      // 이미 밟은 글자도 옮겨야 한다 — 틀리면 진행이 처음으로 돌아가 다시 밟아야 하므로.
      if (t.role === 'seq') relocateLabel(t);
      // 부서진 자리가 길을 끊었을 수 있다 — 글자로 가는 길을 다시 뚫는다
      openLetterPath();
      // 발밑이 무너졌으니 그대로 빠진다 — 구멍에 뛰어든 것과 같은 감점
      fallIntoHole(i, j);
    }
  }

  /**
   * 이 타일이 사라져도 판이 하나로 이어져 있는가.
   * 구멍은 처음 뚫을 때 연결성을 보장하지만(carveHoles), 밟아서 부서지는 자리는
   * 그 보장을 무너뜨린다. 되살아나지도 않으므로, 끊길 자리는 아예 안 부서지게 한다.
   */
  function canBreak(t) {
    return solidConnected(t) && solidCount() - 1 >= MIN_SOLID && roadOkWithout(t);
  }

  function solidCount() {
    var n = 0;
    for (var k = 0; k < tiles.length; k++) if (SK.Tiles.isSolid(tiles[k])) n++;
    return n;
  }

  /** 성한 타일만으로 8방향 연결이 유지되는가 (except 는 없는 셈 친다) */
  function solidConnected(except) {
    var alive = Object.create(null), total = 0, start = null;
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      if (t === except || !SK.Tiles.isSolid(t)) continue;
      alive[t.i + ',' + t.j] = true; total++;
      if (start === null) start = t.i + ',' + t.j;
    }
    if (!total) return false;

    var seen = Object.create(null), queue = [start], reached = 0;
    seen[start] = true;
    while (queue.length) {
      var parts = queue.pop().split(',');
      reached++;
      eachReach(+parts[0], +parts[1], function (ni, nj) {
        var key = ni + ',' + nj;
        if (alive[key] && !seen[key]) { seen[key] = true; queue.push(key); }
      });
    }
    return reached === total;
  }

  /** 글자가 얹힌 타일이 부서졌을 때 — 타일을 되살리는 대신 글자만 이사시킨다 */
  function relocateLabel(t) {
    var slot = quizTiles.indexOf(t);
    if (slot < 0) return;

    var cand = [];
    for (var k = 0; k < tiles.length; k++) {
      var o = tiles[k];
      if (o === t || o.label || o.damage > 0 || !SK.Tiles.isSolid(o)) continue;
      if (o.i === player.ci && o.j === player.cj) continue;
      cand.push(o);
    }
    if (!cand.length) return;

    var to = SK.Quiz.shuffle(cand)[0];
    to.label = t.label; to.payload = t.payload; to.mat = t.mat;
    to.role = 'seq'; to.order = t.order; to.correct = t.correct; to.state = t.state;
    quizTiles[slot] = to;

    t.label = null; t.payload = null; t.role = 'plain'; t.order = -1; t.correct = false;
    t.state = 'idle';

    openLetterPath();     // 옮긴 자리가 길을 막지 않는지 확인한다

    // 어디로 옮겨 갔는지 보이지 않으면 글자를 잃어버린 것처럼 느껴진다
    SK.Particles.stars(to.i, to.j, 12);
    SK.Particles.ring(to.i, to.j, { size: 110, life: 0.5, width: 3, color: 'rgba(255,255,255,' });
  }

  /** 구멍 조준 표시 — 붉은 점선과 아래로 떨어지는 화살표 */
  function drawHoleAim(ctx, h) {
    var p = world(h.i, h.j, 0);
    var hw = SK.Iso.TW / 2, hh = SK.Iso.TH / 2;
    var blink = 0.6 + 0.4 * Math.sin(now * 7);

    ctx.save();
    ctx.globalAlpha = h.a;
    ctx.translate(p.x, p.y);

    // 어두운 밑선 — 배경이 무엇이든 읽히게
    ctx.strokeStyle = 'rgba(10,4,10,.8)';
    ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, hh); ctx.lineTo(-hw, 0);
    ctx.closePath(); ctx.stroke();

    ctx.strokeStyle = 'rgba(255,120,140,' + (0.6 + blink * 0.4) + ')';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = now * 30;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255,120,140,' + (0.10 + blink * 0.10) + ')';
    ctx.fill();

    // 아래로 떨어지는 화살표 — "여기는 빈 칸" 이라고 말해 준다
    ctx.strokeStyle = 'rgba(255,190,200,' + (0.5 + blink * 0.5) + ')';
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(0, 7);
    ctx.moveTo(-6, 1); ctx.lineTo(0, 8); ctx.lineTo(6, 1);
    ctx.stroke();
    ctx.restore();
  }

  /* =========================================================
   *  구멍에 빠짐 — 점수를 잃고 직전 발판으로 돌아온다
   * ======================================================= */
  var FALL_PENALTY = 15;

  function fallIntoHole(i, j) {
    // 마지막 글자를 밟은 순간 발판이 무너질 수도 있다 — 그때는 완성 연출을 지키게 둔다
    if (phase === 'play') { phase = 'wrong'; phaseTimer = 1.0; }
    streak = 0; combo = 0;
    run.falls++;
    score = Math.max(0, score - FALL_PENALTY);

    var pan = panOf(i, j);
    SK.Audio.fall({ pan: pan });
    SK.Particles.text(i, j, '앗!', { size: 28, color: '#ff9aa8', life: 0.9, gz: 0.2, vz: 0.02 });
    SK.Particles.text(i, j, '-' + FALL_PENALTY, { size: 20, color: '#ff9aa8', life: 1.0, gz: 0.7, vz: 0.03 });
    SK.Particles.ring(i, j, { size: 110, life: 0.6, width: 3, color: 'rgba(255,154,168,' });
    cam.shake = 0.7;
    setFlash(0.22, 352);

    // 직전에 서 있던 발판으로 돌려보낸다. 그 자리도 사라졌다면 가장 가까운 타일로.
    var back = SK.Tiles.isSolid(getTile(player.fromI, player.fromJ))
      ? { i: player.fromI, j: player.fromJ }
      : nearestSolid(i, j);
    player.ci = back.i; player.cj = back.j;
    player.x = back.i; player.y = back.j; player.z = 0;
    player.fromI = back.i; player.fromJ = back.j;
    player.hopping = false;
    player.surface = player.surfaceTarget = worldApi.surfaceOf(back.i, back.j);
    SK.Player.stun(player, 0.55);

    SK.Particles.ring(back.i, back.j, { size: 80, life: 0.45, width: 2.5, color: 'rgba(255,255,255,' });
    renderHUD(false, true);
    loseLife(i, j);
  }

  /** 주어진 칸에서 가장 가까운 성한 타일 — 부서진 자리로 돌려보내면 다시 떨어진다 */
  function nearestSolid(i, j) {
    var best = null, bestD = Infinity;
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      if (!SK.Tiles.isSolid(t)) continue;
      var d = (t.i - i) * (t.i - i) + (t.j - j) * (t.j - j);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best ? { i: best.i, j: best.j } : { i: START.i, j: START.j };
  }

  /* =========================================================
   *  목숨 · 게임 오버
   * ======================================================= */

  /**
   * 목숨을 하나 잃는다.
   * @param {number} i,j 실패가 일어난 칸 — 그 자리에 하트가 깨지는 연출을 띄운다
   */
  function loseLife(i, j) {
    if (phase === 'over') return;
    lives = Math.max(0, lives - 1);

    SK.Particles.text(i, j, '💔', { size: 30, color: '#ff9aa8', life: 1.1, gz: 0.9, vz: 0.05 });
    if (ui.hearts) {
      ui.hearts.classList.remove('hit');
      void ui.hearts.offsetWidth;          // 애니메이션 재시작
      ui.hearts.classList.add('hit');
    }
    if (lives <= 0) gameOver();
    else { renderLives(); saveNow(true); }
  }

  function renderLives() {
    if (!ui.hearts) return;
    var html = '';
    for (var k = 0; k < MAX_LIVES; k++) {
      html += '<span class="heart' + (k < lives ? '' : ' gone') + '">' +
              (k < lives ? '❤️' : '🖤') + '</span>';
    }
    ui.hearts.innerHTML = html;
  }

  function gameOver() {
    phase = 'over';
    phaseTimer = 0;
    lives = 0;
    renderLives();
    SK.Audio.over({ pan: 0 });
    SK.Particles.text(player.ci, player.cj, 'GAME OVER', {
      size: 34, color: '#ff9aa8', life: 2.2, gz: 1.2, vz: 0.02
    });
    cam.shake = 1.0;
    setFlash(0.5, 352);
    SK.Player.stun(player, 99);            // 게임 오버 동안에는 움직이지 않는다

    /* 끝난 판은 이어할 수 없다 — 저장을 지우지 않으면 다음에 들어왔을 때
       목숨 0짜리 판이 되살아난다. */
    if (SK.Save) SK.Save.clear();

    /* 끝난 직후에 가장 궁금한 건 점수가 아니라 "그래서 답이 뭐였는데?" 다.
       그래서 마지막 문제의 풀이를 먼저 띄우고, 확인을 눌러야 성적·랭킹으로 넘어간다.
       (문제를 풀다 죽었으므로 fsm.quiz 가 곧 방금 틀린 그 문제다) */
    showReveal(fsm && fsm.quiz);

    var rec = getRunRecord();
    if (ui.overScore) ui.overScore.textContent = score;
    if (ui.overTime) ui.overTime.textContent = SK.Ranking.fmtTime(rec.timeMs);
    if (ui.overSolved) ui.overSolved.textContent = rec.solved + ' / ' + rec.attempts;
    if (ui.overRate) ui.overRate.textContent = Math.round(rec.rate * 100) + '%';
    if (ui.overAccuracy) ui.overAccuracy.textContent = Math.round(rec.accuracy * 100) + '%';
    if (ui.overCombo) ui.overCombo.textContent = '×' + rec.maxCombo;
    if (ui.overPanel) ui.overPanel.hidden = false;

    // 랭킹 등록 화면은 main.js 가 맡는다 — 게임 코어는 값만 넘긴다
    if (typeof ui.onGameOver === 'function') ui.onGameOver(rec, getRunAuth());
  }

  /**
   * 정답을 읽기 좋은 형태로 — `q.answer` 는 타일에 올린 글자를 이어 붙인 것이라
   * 띄어쓰기가 없다("신석기시대"). 풀이글은 보통 제대로 띄어 쓴 정답으로 시작하므로
   * ("신석기 시대! 농사와 …") 그 머리말이 정답과 같으면 그쪽을 보여 주고,
   * 뒤의 설명만 따로 떼어 낸다. 규칙에 맞지 않는 문제는 있는 그대로 쓴다.
   * @returns {{answer:string, why:string}}
   */
  function splitReveal(q) {
    var answer = (q && q.answer) || '';
    var why = (q && q.reveal) || '';
    if (!why) return { answer: answer, why: '' };
    var cut = why.search(/[!.?]/);
    if (cut < 0) return { answer: answer, why: why };
    var head = why.slice(0, cut);
    if (head.replace(/\s/g, '') !== answer.replace(/\s/g, '')) return { answer: answer, why: why };
    return { answer: head, why: why.slice(cut + 1).replace(/^\s+/, '') };
  }

  /**
   * 게임 오버 1단계 — 마지막 문제의 정답과 풀이.
   * 풀이(`reveal`)가 없는 문제도 있으므로 정답만으로도 화면이 성립해야 한다.
   */
  function showReveal(q) {
    var r = splitReveal(q);
    if (ui.revealPrompt) ui.revealPrompt.textContent = q ? q.prompt : '';
    if (ui.revealAnswer) ui.revealAnswer.textContent = r.answer;
    if (ui.revealWhy) ui.revealWhy.textContent = r.why;
    if (ui.overReveal) ui.overReveal.hidden = false;
    if (ui.overResult) ui.overResult.hidden = true;
  }

  /** 확인을 눌렀을 때 — 성적과 랭킹 등록으로 넘어간다 */
  function revealDone() {
    if (ui.overReveal) ui.overReveal.hidden = true;
    if (ui.overResult) ui.overResult.hidden = false;
  }

  /** 처음부터 다시 — 점수·목숨·보드·문제를 전부 새로 만든다 */
  function restart() {
    if (ui.overPanel) ui.overPanel.hidden = true;
    heartAt = null;
    // 다음 게임 오버는 다시 풀이부터 — 여기서 되돌려 놓지 않으면 성적이 먼저 뜬다
    if (ui.overReveal) ui.overReveal.hidden = false;
    if (ui.overResult) ui.overResult.hidden = true;
    score = 0; combo = 0; streak = 0;
    lives = MAX_LIVES;
    resetRun();
    beginRun();
    if (SK.Save) SK.Save.clear();
    renderLives();

    SK.Particles.clear();
    pickGrid();
    buildWorld();
    player = SK.Player.create(START.i, START.j);
    player.surface = player.surfaceTarget = worldApi.surfaceOf(START.i, START.j);
    quizTiles = [];
    cam.shake = 0; flash = 0;

    phase = 'play'; phaseTimer = 0;
    resumed = false;
    if (fsm) fsm.reset && fsm.reset();
    if (session) session.setFilter(session.filter);   // 문제 차례를 새로 섞는다
    nextQuiz();
    resize();
  }

  /* =========================================================
   *  이어하기 — 판을 통째로 담고 되살린다
   *
   *  담는 것은 "판의 사진" 한 장이다. 점수·목숨·시간, 타일 하나하나의 재질과
   *  닳은 정도, 글자 배치, 지금 문제와 어디까지 밟았는지, 앞으로 나올 문제
   *  차례, 캐릭터가 선 자리.
   *
   *  ⚠ 타일 목록에 없는 칸이 곧 구멍이다. 구멍을 따로 적지 않는다.
   *  ⚠ 진행 중 연출(phase 'wrong'·'solved', 도약 중, 화면 흔들림)은 담지 않는다.
   *    되살아난 판은 언제나 조용한 'play' 상태에서 다시 시작한다 — 애매한
   *    중간 상태를 복원하려다 반쯤 끝난 연출에 갇히는 쪽이 훨씬 나쁘다.
   * ======================================================= */
  var SAVE_THROTTLE_MS = 900;
  var lastSaveAt = -1e9;

  function captureSave() {
    if (!fsm || !fsm.quiz || !session || !player) return null;
    if (phase === 'over' || lives <= 0) return null;

    var ts = [];
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      ts.push({
        i: t.i, j: t.j, m: t.mat,
        d: t.damage | 0, b: +(t.broken || 0).toFixed(3),
        s: t.state, r: t.role, l: t.label, p: t.payload,
        o: t.order, c: t.correct ? 1 : 0,
        mk: +(t.mark || 0).toFixed(2), mx: +(t.markX || 0).toFixed(2),
        my: +(t.markY || 0).toFixed(2), tl: +(t.tilt || 0).toFixed(3),
        sd: +(t.seed || 0).toFixed(4)
      });
    }

    var queue = [];
    for (var n = 0; n < session.queue.length; n++) queue.push(session.queue[n].id);

    return {
      grid: GRID, start: { i: START.i, j: START.j },
      score: score, combo: combo, streak: streak, lives: lives,
      timeMs: Math.round(run.timeMs),
      run: {
        startedAt: run.startedAt, attempts: run.attempts, solved: run.solved,
        hits: run.hits, misses: run.misses, falls: run.falls,
        maxCombo: run.maxCombo, quizzes: run.quizzes,
        topics: topicsString(), tainted: run.tainted ? 1 : 0
      },
      touched: quizTouched ? 1 : 0,
      auth: runAuth,
      seed: boardSeed,
      heart: heartAt ? [heartAt.i, heartAt.j] : null,
      quizId: fsm.quiz.id,
      progress: fsm.progress.slice(),
      attempts: fsm.attempts, mistakes: fsm.mistakes,
      filter: session.filter,
      queue: queue,
      player: { i: player.ci, j: player.cj },
      tiles: ts
    };
  }

  /**
   * 저장을 기록한다.
   * @param {boolean} force 조절 간격을 무시하고 지금 바로 (문제가 바뀌거나 목숨을
   *                        잃은 순간처럼 놓치면 안 되는 지점)
   */
  function saveNow(force) {
    if (!SK.Save || !SK.Save.available()) return false;
    var t = performance.now();
    if (!force && t - lastSaveAt < SAVE_THROTTLE_MS) return false;
    var snap = captureSave();
    if (!snap) return false;
    lastSaveAt = t;
    return SK.Save.write(snap);
  }

  /**
   * 저장된 판을 되살린다.
   * @returns {boolean} 되살렸는가. 문제집이 바뀌었거나 판이 앞뒤가 맞지 않으면
   *                    false — 그때는 호출한 쪽이 새 판을 시작한다.
   */
  function applySave(snap) {
    if (!snap || !session || !fsm) return false;

    // 저장된 문제가 지금 문제집에 있는가 (문제를 갈아 끼웠을 수 있다)
    var pool = session.all, byId = Object.create(null), i, k, n;
    for (i = 0; i < pool.length; i++) byId[pool[i].id] = pool[i];
    var q = byId[snap.quizId];
    if (!q) return false;

    // 밟아 온 순서가 그 문제의 정답과 실제로 맞는가
    var prog = Array.isArray(snap.progress) ? snap.progress : [];
    if (prog.length >= q.sequence.length) return false;
    for (i = 0; i < prog.length; i++) if (q.sequence[i] !== prog[i]) return false;

    if (!(snap.grid >= 3 && snap.grid <= 24)) return false;

    /* 저장된 격자 크기를 그대로 쓴다. 휴대폰에서 하던 판을 PC 에서 열어도
       같은 판이어야 한다 — 화면에 맞추는 일은 resize() 의 배율이 맡는다. */
    GRID = snap.grid;
    START = { i: snap.start.i, j: snap.start.j };
    if (snap.seed != null) boardSeed = snap.seed | 0;
    heartAt = (Array.isArray(snap.heart) && snap.heart.length === 2)
      ? { i: snap.heart[0] | 0, j: snap.heart[1] | 0 } : null;

    tiles = []; tileAt = {}; quizTiles = [];
    for (n = 0; n < snap.tiles.length; n++) {
      var d = snap.tiles[n];
      if (!inBounds(d.i, d.j)) continue;
      if (tileAt[d.i + ',' + d.j]) continue;              // 같은 칸이 두 번 오면 무시
      var t = SK.Tiles.make(d.i, d.j, d.m);
      t.damage = d.d | 0;
      t.broken = Math.max(0, Math.min(1, +d.b || 0));
      t.state = (d.s === 'done' || d.s === 'wrong') ? d.s : 'idle';
      t.role = d.r === 'seq' ? 'seq' : 'plain';
      t.label = d.l == null ? null : String(d.l);
      t.payload = d.p == null ? null : String(d.p);
      t.order = d.o == null ? -1 : (d.o | 0);
      t.correct = !!d.c;
      t.mark = +d.mk || 0; t.markX = +d.mx || 0; t.markY = +d.my || 0;
      t.tilt = +d.tl || 0;
      if (d.sd != null) t.seed = +d.sd;
      if (t.damage > 0) SK.Tiles.rebuildCracks(t);
      tiles.push(t);
      tileAt[t.i + ',' + t.j] = t;
      if (t.role === 'seq' && t.label) quizTiles.push(t);
    }
    if (!tiles.length) return false;

    /* 되살린 판의 바닥 재질을 되찾는다 — 글자 없는 칸 중 가장 많은 재질이 바닥이다.
       이걸 빠뜨리면 이어하기 직후 글자를 뗀 자리만 엉뚱한 재질이 되어, 한 문제에
       재질이 셋 나온다. */
    var tally = Object.create(null), top = 0;
    for (n = 0; n < tiles.length; n++) {
      if (tiles[n].label) continue;
      var c = (tally[tiles[n].mat] = (tally[tiles[n].mat] || 0) + 1);
      if (c > top) { top = c; floorMat = tiles[n].mat; }
    }

    // 문제 차례 — 저장된 순서 그대로 이어 간다
    session.setFilter(typeof snap.filter === 'string' ? snap.filter : 'all');
    var queue = [];
    if (Array.isArray(snap.queue)) {
      for (n = 0; n < snap.queue.length; n++) {
        if (byId[snap.queue[n]]) queue.push(byId[snap.queue[n]]);
      }
    }
    session.queue = queue;
    session.current = q;

    fsm.setQuiz(q);
    fsm.progress = prog.slice();
    fsm.attempts = snap.attempts | 0;
    fsm.mistakes = snap.mistakes | 0;

    score = Math.max(0, snap.score | 0);
    combo = Math.max(0, Math.min(9, snap.combo | 0));
    streak = Math.max(0, snap.streak | 0);
    lives = Math.max(1, Math.min(MAX_LIVES, snap.lives | 0));

    resetRun();
    var r = snap.run || {};
    run.startedAt = r.startedAt || Date.now();
    run.timeMs = Math.max(0, +snap.timeMs || 0);
    run.attempts = r.attempts | 0; run.solved = r.solved | 0;
    run.hits = r.hits | 0; run.misses = r.misses | 0;
    run.falls = r.falls | 0; run.maxCombo = r.maxCombo | 0; run.quizzes = r.quizzes | 0;
    run.tainted = !!r.tainted;
    parseTopics(r.topics);
    quizTouched = !!snap.touched;

    /* 실행 토큰은 판에 붙어 있다 — 이어한 판도 같은 한 판이므로 그대로 쓴다.
       다만 며칠 뒤에 이어 받으면 서버가 낡은 토큰을 받아 주지 않으므로
       그럴 때는 새로 받아 둔다. (토큰 가운데 토막이 발급 시각, 36진수) */
    runAuth = snap.auth || null;
    if (!runAuth || tokenTooOld(runAuth.token)) beginRun();

    // 캐릭터 — 서 있던 자리가 사라졌으면 가장 가까운 성한 발판으로
    var pi = snap.player ? snap.player.i : START.i;
    var pj = snap.player ? snap.player.j : START.j;
    if (!SK.Tiles.isSolid(getTile(pi, pj))) {
      var back = nearestSolid(pi, pj);
      pi = back.i; pj = back.j;
    }
    player = SK.Player.create(pi, pj);
    player.surface = player.surfaceTarget = worldApi.surfaceOf(pi, pj);

    /* 되살린 판에 다음에 밟을 글자가 실제로 놓여 있어야 한다. 저장이 어긋났거나
       그 칸이 부서진 채로 저장됐다면 문제를 영영 풀 수 없으므로 다시 깐다. */
    var need = fsm.expected(), found = false;
    for (k = 0; k < quizTiles.length; k++) {
      if (quizTiles[k].payload === need && SK.Tiles.isSolid(quizTiles[k])) { found = true; break; }
    }
    if (!found) layoutQuiz(q);

    SK.Particles.clear();
    cam.shake = 0; flash = 0;
    phase = 'play'; phaseTimer = 0;
    renderHUD(true);
    resize();
    boardWorld = computeBoardWorld();
    snapCamToPlayer();
    return true;
  }

  /** topicsString() 이 만든 한 줄을 다시 집계표로 */
  function parseTopics(text) {
    run.byTopic = Object.create(null);
    String(text || '').split('|').forEach(function (part) {
      if (!part) return;
      var c = part.lastIndexOf(':');
      if (c < 1) return;
      var nums = part.slice(c + 1).split('/');
      var a = parseInt(nums[0], 10), sv = parseInt(nums[1], 10);
      if (!(a >= 0) || !(sv >= 0)) return;
      run.byTopic[part.slice(0, c)] = { a: a, s: sv };
    });
  }

  /* 화면을 옮기거나 탭을 닫는 순간을 붙잡는다. pagehide 는 모바일 사파리에서
     unload 가 오지 않는 경우까지 덮는다. */
  function bindSaveHooks() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveNow(true);
    });
    window.addEventListener('pagehide', function () { saveNow(true); });
    window.addEventListener('beforeunload', function () { saveNow(true); });
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

    /* 이 문제를 '시도했다'고 세는 순간 — 글자를 처음 밟았을 때 딱 한 번.
       맞게 밟았든 틀리게 밟았든 시도는 시도다. */
    if (!quizTouched) {
      quizTouched = true;
      run.attempts++;
      topicStat(fsm.quiz && fsm.quiz.topic).a++;
    }

    var r = fsm.submit(t.payload);
    var pan = panOf(t.i, t.j);

    if (r.type === 'progress' || r.type === 'solved') {
      t.state = 'done';
      t.flash = 1;
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
      run.hits++;
      if (combo > run.maxCombo) run.maxCombo = combo;
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
    run.solved++;
    topicStat(fsm.quiz && fsm.quiz.topic).s++;
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
    run.misses++;
    SK.Audio.wrong({ pan: pan });
    SK.Particles.text(t.i, t.j, 'THUD…', { size: 24, color: '#ff9aa8', life: 0.9, vz: 0.01 });
    SK.Particles.ring(t.i, t.j, { size: 90, life: 0.5, color: 'rgba(255,154,168,' });
    cam.shake = 0.8;
    SK.Player.stun(player, 0.6);
    for (var k = 0; k < quizTiles.length; k++) {
      if (quizTiles[k] !== t) quizTiles[k].state = 'idle';
    }
    renderHUD(false, true);
    loseLife(t.i, t.j);
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
    renderClock();
    renderLives();
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
  /* HUD 시계. 매 프레임 DOM 을 건드리지 않도록 초가 바뀔 때만 다시 쓴다. */
  var clockShown = -1;
  function renderClock() {
    if (!ui.timeVal) return;
    var sec = Math.floor(run.timeMs / 1000);
    if (sec === clockShown) return;
    clockShown = sec;
    ui.timeVal.textContent = SK.Ranking.fmtTime(run.timeMs);
  }

  /**
   * 하트를 타일 위에 띄워 그린다.
   *
   *  · 위아래로 천천히 떠다니고 맥박처럼 커졌다 작아진다 — 판의 다른 것들은
   *    밟기 전까지 가만히 있으므로, 움직이는 것 하나만으로 눈이 먼저 간다.
   *  · 바닥에 그림자를 깔아 **어느 칸 위인지**를 분명히 한다. 공중에 떠 있는
   *    그림만 있으면 아이소메트릭에서는 한 칸 뒤의 타일처럼 보인다.
   */
  function drawHeart(ctx, x, y) {
    var SIZE = 1.5;                       // 타일 무늬에 묻히지 않을 만큼 크게
    var bob = Math.sin(now * 2.2) * 5;
    var pulse = SIZE * (1 + Math.sin(now * 3.4) * 0.07);
    var cy = y + bob;

    ctx.save();

    // 발밑 그림자 — 어느 칸 위인지 알려 준다
    ctx.save();
    ctx.translate(x, y + 40);
    ctx.scale(1, SK.Iso.TH / SK.Iso.TW);
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.beginPath(); ctx.arc(0, 0, 16 - bob * 0.4, 0, 6.2832); ctx.fill();
    ctx.restore();

    ctx.translate(x, cy);
    ctx.scale(pulse, pulse);

    // 빛무리
    var g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,143,176,.55)');
    g.addColorStop(0.55, 'rgba(255,143,176,.18)');
    g.addColorStop(1, 'rgba(255,143,176,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, 6.2832); ctx.fill();

    // 하트 — 위쪽 두 봉우리를 원호로, 아래를 뾰족하게
    var r = 7.2;
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.bezierCurveTo(-14, 1, -r * 1.9, -12, 0, -4.5);
    ctx.bezierCurveTo(r * 1.9, -12, 14, 1, 0, 13);
    ctx.closePath();

    var body = ctx.createLinearGradient(0, -12, 0, 13);
    body.addColorStop(0, '#ff9fbe');
    body.addColorStop(1, '#e04c7a');
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = 'rgba(70,16,36,.5)'; ctx.lineWidth = 1.6; ctx.stroke();

    // 왼쪽 위 하이라이트 — 입체로 보이게
    ctx.beginPath();
    ctx.ellipse(-4.2, -4.6, 2.6, 1.7, -0.5, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();

    ctx.restore();
  }

  function render() {
    renderClock();
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
        if (heartAt && e.o.i === heartAt.i && e.o.j === heartAt.j) {
          drawHeart(ctx, s.x, s.y - SK.Tiles.surfaceOffset(e.o) - 40);
        }
      } else {
        var ps = world(player.x, player.y, 0);
        SK.Player.draw(ctx, player, now, ps.x, ps.y, player.z * SK.Iso.TZ * 2);
      }
    }

    if (holeAim.a > 0.01) drawHoleAim(ctx, holeAim);

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

  /* 개발자용 훅을 어디서 열어 줄지.
   *
   *  debug.stepOn 같은 훅은 임의의 칸에 착지시켜 점수를 만들어 낼 수 있다.
   *  배포된 주소에서 이 훅이 그대로 열려 있으면 랭킹은 아무 의미가 없다.
   *  그래서 개발 중인 기기(localhost)와 주소에 ?debug=1 을 붙인 경우에만 연다.
   *  그런 판은 taint() 로 표시되어 랭킹에 올라가지 않는다 — 막는 것이 아니라
   *  "이 판은 비공식"이라고 적어 두는 쪽이다. */
  var DEV = /[?&]debug=1(&|$)/.test(location.search) ||
            /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  function taint() { if (run) run.tainted = true; }

  var api = {
    boot: boot,
    startWith: startWith,
    setDiag: setDiag, isDiag: isDiag,
    revealDone: revealDone,
    clearTouchInput: clearTouchInput,
    restart: restart,
    relayout: resize,
    canResume: canResume,
    /** 문제집에 실제로 들어 있는 단원 이름 — 랭킹 탭을 여기서 만든다 */
    getTopics: function () {
      var seen = Object.create(null), out = [];
      var all = (session && session.all) || [];
      for (var i = 0; i < all.length; i++) {
        var k = topicKey(all[i].topic);
        if (!seen[k]) { seen[k] = true; out.push(k); }
      }
      return out;
    },
    getLives: function () { return lives; },
    getScore: function () { return score; },
    getTimeMs: function () { return Math.round(run.timeMs); },
    getRunRecord: getRunRecord,
    getRunAuth: getRunAuth,
    isTainted: function () { return !!run.tainted; },
    /** 저장을 지우고 처음부터 — 시작 화면의 '새로 시작' */
    fresh: function () { if (SK.Save) SK.Save.clear(); restart(); },

    /** 디버그 / 자동 테스트용 훅 (localhost 또는 ?debug=1 에서만 열린다) */
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
      tick: function (dt) { taint(); now += dt; update(dt); render(); },
      /** 특정 타일에 착지시켜 판정을 발생시킨다 */
      stepOn: function (i, j, power) {
        taint();
        player.ci = i; player.cj = j;
        player.x = i; player.y = j; player.z = 0;
        player.hopping = false;
        land(power > 1 ? 1 : 0.5, power || 1, i, j);
        return fsm.progress.slice();
      },
      press: function (dx, dy, jump) { taint(); input.dx = dx; input.dy = dy; if (jump) requestJump(); },
      release: function () { taint(); input.dx = 0; input.dy = 0; },
      safeRect: safeRect,
      /** 지금 조준 표시가 켜진 타일 수 (0 또는 1) */
      /** 임의의 칸 재질 읽기/바꾸기 — 특정 재질의 연출을 확인할 때 쓴다 */
      matOf: function (i, j) { var t = getTile(i, j); return t && t.mat; },
      /** 한 칸의 마모 상태 — 부서진 타일이 되살아나지 않는지 확인할 때 쓴다 */
      tileState: function (i, j) {
        var t = getTile(i, j);
        if (!t) return null;
        return { mat: t.mat, damage: t.damage, broken: t.broken, label: t.label, solid: SK.Tiles.isSolid(t) };
      },
      solidCount: solidCount,
      /** 지금 하트가 놓인 칸 (없으면 null) */
      heart: function () { return heartAt ? { i: heartAt.i, j: heartAt.j } : null; },
      /** 하트를 강제로 띄운다 — 확률을 기다리지 않고 연출·획득을 확인할 때 */
      spawnHeart: function () { placeHeart(); return SK.Game.debug.heart(); },
      /** 지금 판에 깔린 재질 — 한 문제에 두 가지만 나와야 한다 */
      matMix: function () {
        var count = Object.create(null), out = [];
        for (var k = 0; k < tiles.length; k++) {
          count[tiles[k].mat] = (count[tiles[k].mat] || 0) + 1;
        }
        for (var m in count) out.push({ mat: m, tiles: count[m] });
        out.sort(function (a, b) { return b.tiles - a.tiles; });
        return { floor: floorMat, kinds: out.length, mats: out };
      },
      /** 지금 판에서 정답을 순서대로 밟으러 갈 길이 있는가 */
      pathOk: roadOk,
      letterCount: function () { return quizTiles.length; },
      solidConnected: function () { return solidConnected(null); },
      setMat: function (i, j, mat) {
        taint();
        var t = getTile(i, j);
        if (t) t.mat = mat;
        return t && t.mat;
      },
      input: function () {
        var held = [], buf = [], tnow = performance.now();
        for (var c in KEYDIR) if (input.keys[c]) held.push(c);
        // 다 뗀 뒤 남아 있는 조준(점프를 기다리는 동안 살아 있는 것)
        if (!held.length && tnow - lastDirAt < TAP_HOLD_MS && (lastDir.x || lastDir.y)) {
          buf.push(lastDir.x + ',' + lastDir.y);
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
      },
      /** 저장/복원을 눈으로 확인할 때 — 판은 건드리지 않으므로 표시하지 않는다 */
      save: function () { return saveNow(true); },
      snapshot: captureSave,
      /* 문제를 건너뛰는 기능은 플레이어에게 주지 않는다. 모르는 문제를 그냥
         넘길 수 있으면 시도 수를 부풀리고 어려운 문제를 피해 정답률을 올릴 수
         있기 때문이다. 테스트에서 여러 문제를 훑어볼 때만 쓴다. */
      skip: function () {
        taint();
        if (!session) return false;
        phase = 'play'; phaseTimer = 0;
        nextQuiz();
        return true;
      }
    }
  };

  if (!DEV) delete api.debug;

  /* 메서드를 통째로 바꿔치기하지 못하게 굳힌다. 점수·목숨·시간은 애초에
     이 클로저 밖으로 나가지 않으므로 콘솔에서 값을 고칠 수 없다. */
  if (Object.freeze) { Object.freeze(api.debug); Object.freeze(api); }

  return api;
})();
