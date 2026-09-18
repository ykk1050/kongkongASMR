/* =============================================================
 *  소리 콩콩 — 랭킹 클라이언트
 *
 *  저장소는 구글 스프레드시트, 창구는 시트에 붙인 Apps Script 웹 앱이다.
 *  (설치 방법 docs/RANKING.md · 서버 코드 apps-script/Code.gs)
 *
 *  ── 왜 JSONP 인가 ───────────────────────────────────────────
 *  Apps Script 웹 앱은 /exec 요청을 script.googleusercontent.com 으로
 *  302 로 넘긴다. 그래서 fetch 로 부르면 브라우저·배포 설정에 따라
 *  CORS 사전 요청(preflight)에서 막히는 경우가 생긴다. GitHub Pages 처럼
 *  정적 호스팅에 올려 두고 교실에서 여러 기기로 접속하는 상황에서는
 *  "어떤 기기에서는 되고 어떤 기기에서는 안 되는" 게 가장 나쁘다.
 *  <script> 태그로 부르는 JSONP 는 CORS 를 아예 타지 않아 어디서나 똑같이
 *  동작한다. 주고받는 값이 닉네임과 숫자 몇 개뿐이라 길이도 문제가 없다.
 *
 *  ⚠ 그래서 기록 등록도 GET 이다. 닉네임이 주소에 실리므로, 실명·연락처를
 *    닉네임에 넣지 못하게 막는 것이 더더욱 중요하다 → validateNick()
 * ============================================================= */
window.SK = window.SK || {};

SK.Ranking = (function () {

  var CFG = window.SK_RANKING || {};
  var ENDPOINT = String(CFG.endpoint || '').trim();
  var ENABLED = CFG.enabled !== false;

  /* Apps Script 는 처음 깨울 때 10초 넘게 걸리기도 한다. 넉넉히 기다린다. */
  var TIMEOUT_MS = 20000;

  /* onerror 가 울린 뒤에도 이만큼은 더 기다려 본다 — 아래 call() 의 설명 참고 */
  var ERROR_GRACE_MS = 6000;

  /* 실패로 판정한 뒤에도 콜백 자리를 이만큼 비워 두지 않는다 (ReferenceError 방지) */
  var KEEP_SLOT_MS = 30000;

  /* =========================================================
   *  집계 조건
   *
   *  ── 무엇을 어떻게 모으나 ──────────────────────────────────
   *  점수만 **한 판 최고**로 세고, 나머지는 **여러 판을 누적**한다.
   *  점수는 한 판 안에서 콤보를 얼마나 이어 갔는지를 보는 값이지만,
   *  시도·맞힘·정답률은 "얼마나 많이, 얼마나 정확하게 공부했는가"라서
   *  판을 나눠 세면 오히려 뜻이 흐려지기 때문이다. 짧게 한 판 잘 본 것보다
   *  꾸준히 많이 푼 쪽이 위로 가는 게 교실에서 맞다.
   *
   *  ── 버틴 시간은 왜 없나 ──────────────────────────────────
   *  제한 시간이 없는 게임이라 켜 두기만 해도 늘어난다. 줄을 세울 수 있는
   *  값이 아니라서 랭킹 조건에서 뺐다. 다만 기록(시트)에는 그대로 남고,
   *  '시간에 비해 점수가 너무 높지 않은가' 같은 검사에는 계속 쓰인다.
   * ======================================================= */

  /** 정답률·단원별 랭킹에 들어가려면 이만큼은 시도해야 한다 */
  var GATE = 30;

  var METRICS = [
    { key: 'score',    ko: '점수',      fmt: 'num', unit: '점',   topical: false },
    { key: 'solved',   ko: '맞힌 문제', fmt: 'num', unit: '문제', topical: true },
    { key: 'attempts', ko: '시도 문제', fmt: 'num', unit: '문제', topical: false },
    { key: 'rate',     ko: '정답률',    fmt: 'pct', unit: '',     topical: true,  gated: true },
    /* 밟기 정확도 — 글자 한 장 단위. 밟은 타일 중 순서에 맞았던 비율이다.
       정답률이 '내용을 아는가'라면 이쪽은 '발을 정확히 디뎠는가'에 가깝다.
       단원마다 따로 세지 않으므로 전체에서만 고를 수 있다. */
    { key: 'accuracy', ko: '밟기 정확도', fmt: 'pct', unit: '',   topical: false, gated: true }
  ];

  function metric(key) {
    for (var i = 0; i < METRICS.length; i++) if (METRICS[i].key === key) return METRICS[i];
    return METRICS[0];
  }

  /** 단원을 골랐을 때 고를 수 있는 지표 — 점수·시도는 전체에서만 의미가 있다 */
  function metricsFor(topic) {
    return topic ? METRICS.filter(function (m) { return m.topical; }) : METRICS.slice();
  }

  /** 'rate' 또는 'rate@선사·고조선' */
  function catKey(metricKey, topic) {
    return topic ? (metricKey + '@' + topic) : metricKey;
  }

  function parseCat(cat) {
    var s = String(cat || 'score');
    var at = s.indexOf('@');
    var m = at < 0 ? s : s.slice(0, at);
    var t = at < 0 ? '' : s.slice(at + 1);
    var mm = metric(m);
    if (t && !mm.topical) t = '';
    return { metric: mm, topic: t, key: catKey(mm.key, t) };
  }

  /** 이 조건에 들어가려면 시도 문제 수가 얼마여야 하나 (0 이면 제한 없음) */
  function gateOf(cat) {
    var c = parseCat(cat);
    return (c.metric.gated || c.topic) ? GATE : 0;
  }

  /** 초 단위까지의 시간 표기 — 1시간을 넘기면 h:mm:ss */
  function fmtTime(ms) {
    var s = Math.max(0, Math.round((+ms || 0) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return h ? (h + ':' + p(m) + ':' + p(ss)) : (m + ':' + p(ss));
  }

  function fmtPct(v) { return (Math.round((+v || 0) * 1000) / 10) + '%'; }

  function fmtValue(cat, v) {
    var m = parseCat(cat).metric;
    if (m.fmt === 'pct') return fmtPct(v);
    return String(Math.round(+v || 0)) + (m.unit ? ' ' + m.unit : '');
  }

  /* =========================================================
   *  닉네임 검사 — 개인정보가 랭킹에 올라가지 않게
   *
   *  사람 이름은 기계가 가려낼 수 없다("홍길동"과 "달려라곰"은 구별이 안 된다).
   *  그래서 두 겹으로 막는다.
   *    · 기계가 확실히 알아볼 수 있는 것은 여기서 거른다
   *      — 이메일, 전화번호, 주민등록번호 꼴, 학년·반·번호
   *    · 나머지는 등록 화면의 안내문과 확인 체크로 본인이 확인하게 한다
   * ======================================================= */
  var MAX_NICK = 12;

  var NICK_RULES = [
    { re: /[<>"'\\/\x00-\x1f]/,                msg: '쓸 수 없는 문자가 들어 있어요.' },
    { re: /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,     msg: '이메일 주소는 닉네임에 쓸 수 없어요.' },
    { re: /01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}/, msg: '전화번호는 닉네임에 쓸 수 없어요.' },
    { re: /\d{6}[-\s]?[1-4]\d{6}/,             msg: '주민등록번호는 절대 쓰면 안 돼요.' },
    { re: /\d{1,2}\s*학\s*년/,                 msg: '학년·반·번호는 닉네임에 쓸 수 없어요.' },
    { re: /\d{1,2}\s*반\s*\d{1,2}\s*번/,       msg: '학년·반·번호는 닉네임에 쓸 수 없어요.' },
    { re: /\d{8,}/,                            msg: '긴 숫자는 닉네임에 쓸 수 없어요.' }
  ];

  /* 아주 작은 금칙어 목록 — 교실에서 쓰는 만큼 최소한만 둔다. 필요하면 늘리면 된다. */
  var BANNED = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '개새', 'fuck', 'shit', 'bitch'];

  /**
   * @returns {{ok:boolean, value:string, reason:string}}
   */
  function validateNick(raw) {
    var s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!s) return { ok: false, value: '', reason: '닉네임을 입력해 주세요.' };
    if (s.length > MAX_NICK) {
      return { ok: false, value: s, reason: '닉네임은 ' + MAX_NICK + '글자까지예요.' };
    }
    for (var i = 0; i < NICK_RULES.length; i++) {
      if (NICK_RULES[i].re.test(s)) return { ok: false, value: s, reason: NICK_RULES[i].msg };
    }
    var low = s.toLowerCase().replace(/\s/g, '');
    for (var b = 0; b < BANNED.length; b++) {
      if (low.indexOf(BANNED[b]) >= 0) {
        return { ok: false, value: s, reason: '다른 사람이 볼 이름이에요. 고운 말로 지어 주세요.' };
      }
    }
    return { ok: true, value: s, reason: '' };
  }

  /* =========================================================
   *  서명 — 보낸 값이 도중에 바뀌지 않았는지 확인하는 표식
   *
   *  ⚠ 이것은 암호가 아니다. 서버가 준 토큰을 섞어 해시를 내므로,
   *    주소창이나 개발자 도구의 네트워크 탭에서 숫자만 고쳐 다시 보내는
   *    시도는 서명이 어긋나 걸린다. 하지만 게임 코드를 통째로 고친 사람은
   *    서명도 다시 만들 수 있다 — 그 몫은 서버 쪽 타당성 검사가 맡는다.
   *    (apps-script/Code.gs 의 plausible())
   *
   *  서버(Apps Script)도 같은 자바스크립트라 아래 함수를 그대로 쓴다.
   *  한쪽만 고치면 모든 등록이 실패하므로 반드시 같이 고칠 것.
   * ======================================================= */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  var SIG_FIELDS = ['nick', 'score', 'timeMs', 'attempts', 'solved',
                    'hits', 'misses', 'falls', 'maxCombo', 'topics'];

  function canonical(rec) {
    var parts = [];
    for (var i = 0; i < SIG_FIELDS.length; i++) {
      var v = rec[SIG_FIELDS[i]];
      parts.push(typeof v === 'number' ? String(Math.round(v)) : String(v == null ? '' : v));
    }
    return parts.join('|');
  }

  function sign(rec, token) {
    var base = String(token || '') + '~' + canonical(rec);
    return fnv1a(base) + fnv1a(base + '~' + base.length);
  }

  /* =========================================================
   *  JSONP 호출
   * ======================================================= */
  var seq = 0;

  function call(params) {
    if (!isConfigured()) return Promise.reject(new Error('endpoint-missing'));
    return new Promise(function (resolve, reject) {
      var cb = 'skRank' + (++seq) + '_' + (Date.now() % 1e6);
      var url = ENDPOINT + (ENDPOINT.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cb;
      for (var k in params) {
        if (params[k] == null) continue;
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }

      var script = document.createElement('script');
      var settled = false;
      var timer = null, graceTimer = null;

      /* ⚠ onerror 를 곧바로 실패로 보지 않는다.
       *
       *  Apps Script 는 /exec 요청을 script.googleusercontent.com 으로 넘기는데,
       *  그 과정에서 onerror 가 **먼저** 울리고 잠시 뒤 진짜 응답이 도착하는
       *  경우가 있다. 예전 코드는 onerror 에서 바로 실패 처리하고 콜백 함수를
       *  지워, 뒤늦게 도착한 스크립트가 없는 함수를 부르며 터졌다
       *  (ReferenceError: skRankN_... is not defined). 응답은 멀쩡히 왔는데
       *  우리가 먼저 문을 닫은 셈이다.
       *
       *  그래서 onerror 는 '곧 실패할 것 같다'는 힌트로만 쓰고, 조금 더 기다린다.
       *  진짜로 안 오면 그때 실패로 넘긴다. */
      function finish(err, data) {
        if (settled) return;
        settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }

        /* 콜백 자리는 바로 비우지 않는다 — 늦게 도착한 스크립트가 없어진 함수를
           부르면 콘솔에 오류가 남는다. 아무 일도 하지 않는 함수로 바꿔 두었다가
           한참 뒤에 치운다. */
        window[cb] = function () {};
        setTimeout(function () {
          try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        }, KEEP_SLOT_MS);

        if (script.parentNode) script.parentNode.removeChild(script);
        if (err) reject(err); else resolve(data);
      }

      window[cb] = function (data) { finish(null, data); };

      script.onerror = function () {
        if (settled || graceTimer) return;
        graceTimer = setTimeout(function () { finish(new Error('network')); }, ERROR_GRACE_MS);
      };

      timer = setTimeout(function () { finish(new Error('timeout')); }, TIMEOUT_MS);

      script.src = url;
      script.async = true;
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function isConfigured() { return !!(ENABLED && ENDPOINT); }

  /* =========================================================
   *  이 기기에만 남는 기록 — 서버가 없을 때의 대체재
   *
   *  서버가 하는 집계를 그대로 흉내 낸다. 규칙이 갈리면 "서버가 있을 때와
   *  없을 때 순위가 다른" 혼란이 생기므로 두 곳을 같이 고쳐야 한다.
   * ======================================================= */
  var LOCAL_KEY = 'sk.rank.local.v2';
  var LOCAL_MAX = 300;

  function localLoad() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function localAdd(rec) {
    var list = localLoad();
    list.push({
      nick: rec.nick, score: rec.score, timeMs: rec.timeMs,
      attempts: rec.attempts, solved: rec.solved,
      hits: rec.hits, misses: rec.misses,
      topics: rec.topics || '', at: Date.now()
    });
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-LOCAL_MAX))); }
    catch (e) { /* 저장 공간이 없어도 게임은 계속된다 */ }
  }

  /** '단원:시도/맞힘|…' 를 집계표로 */
  function parseTopics(text) {
    var out = {};
    String(text || '').split('|').forEach(function (part) {
      if (!part) return;
      var c = part.lastIndexOf(':');
      if (c < 1) return;
      var nums = part.slice(c + 1).split('/');
      var a = parseInt(nums[0], 10), s = parseInt(nums[1], 10);
      if (!(a >= 0) || !(s >= 0)) return;
      out[part.slice(0, c)] = { a: a, s: s };
    });
    return out;
  }

  /** 여러 판을 닉네임 하나로 — 점수만 최고, 나머지는 누적 */
  function foldRuns(runs) {
    var agg = { nick: runs[0].nick, score: 0, attempts: 0, solved: 0,
                hits: 0, steps: 0, topics: {}, runs: runs.length, at: 0 };
    runs.forEach(function (r) {
      agg.score = Math.max(agg.score, +r.score || 0);
      agg.attempts += +r.attempts || 0;
      agg.solved += +r.solved || 0;
      agg.hits += +r.hits || 0;
      agg.steps += (+r.hits || 0) + (+r.misses || 0);
      agg.at = Math.max(agg.at, +r.at || 0);
      var t = parseTopics(r.topics);
      for (var k in t) {
        if (!agg.topics[k]) agg.topics[k] = { a: 0, s: 0 };
        agg.topics[k].a += t[k].a;
        agg.topics[k].s += t[k].s;
      }
    });
    agg.rate = agg.attempts ? agg.solved / agg.attempts : 0;
    agg.accuracy = agg.steps ? agg.hits / agg.steps : 0;
    return agg;
  }

  /** 집계된 한 사람에게서 이 조건의 값과 자격을 뽑는다 */
  function valueOf(agg, cat) {
    var c = parseCat(cat);
    var scope = c.topic ? (agg.topics[c.topic] || { a: 0, s: 0 })
                        : { a: agg.attempts, s: agg.solved };
    var eligible = gateOf(cat) ? scope.a >= GATE : true;
    var value;
    if (c.metric.key === 'score') value = agg.score;
    else if (c.metric.key === 'attempts') value = scope.a;
    else if (c.metric.key === 'solved') value = scope.s;
    else if (c.metric.key === 'accuracy') value = agg.accuracy;
    else value = scope.a ? scope.s / scope.a : 0;
    return { value: value, eligible: eligible, tA: scope.a, tS: scope.s };
  }

  function localBoard(cat, order) {
    var byNick = {};
    localLoad().forEach(function (r) {
      (byNick[r.nick] = byNick[r.nick] || []).push(r);
    });
    var rows = [];
    for (var n in byNick) {
      var agg = foldRuns(byNick[n]);
      var v = valueOf(agg, cat);
      if (!v.eligible) continue;
      rows.push({
        nick: agg.nick, value: v.value, score: agg.score,
        attempts: agg.attempts, solved: agg.solved, rate: agg.rate,
        hits: agg.hits, steps: agg.steps, accuracy: agg.accuracy,
        tA: v.tA, tS: v.tS, runs: agg.runs, at: agg.at
      });
    }
    rows.sort(function (a, b) {
      if (b.value !== a.value) return b.value - a.value;
      return a.at - b.at;
    });
    if (order === 'asc') rows.reverse();
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* =========================================================
   *  공개 API
   * ======================================================= */

  /** 판이 시작될 때 서버에서 1회용 실행 토큰을 받아 둔다 */
  function startRun() {
    if (!isConfigured()) return Promise.resolve(null);
    return call({ action: 'start', t: Date.now() })
      .then(function (res) { return (res && res.ok) ? res : null; })
      .catch(function () { return null; });
  }

  /**
   * 기록 등록.
   * @param {object} rec  nick·score·timeMs·attempts·solved·hits·misses·falls·maxCombo·topics
   * @param {object} run  startRun() 이 준 {runId, token} — 없으면 이 기기 기록으로만 남는다
   * @returns {Promise<{ok:boolean, stored:string, rank:number|null, reason:string}>}
   */
  function submit(rec, run) {
    localAdd(rec);
    if (!isConfigured() || !run || !run.token) {
      return Promise.resolve({
        ok: true, stored: 'local', rank: null,
        reason: isConfigured() ? '랭킹 서버에 연결하지 못해 이 기기에만 저장했어요.'
                               : '랭킹 서버가 아직 설정되지 않아 이 기기에만 저장했어요.'
      });
    }
    var q = {
      action: 'submit',
      runId: run.runId,
      token: run.token,
      sig: sign(rec, run.token),
      nick: rec.nick,
      score: Math.round(rec.score),
      timeMs: Math.round(rec.timeMs),
      attempts: Math.round(rec.attempts),
      solved: Math.round(rec.solved),
      hits: Math.round(rec.hits),
      misses: Math.round(rec.misses),
      falls: Math.round(rec.falls),
      maxCombo: Math.round(rec.maxCombo),
      topics: rec.topics || '',
      quizzes: Math.round(rec.quizzes || 0),
      grid: Math.round(rec.grid || 0),
      wallMs: Math.round(rec.wallMs || 0),
      ver: rec.ver || '2'
    };
    return call(q).then(function (res) {
      if (res && res.ok) {
        return { ok: true, stored: 'sheet', rank: res.rank == null ? null : res.rank, reason: '' };
      }
      return {
        ok: false, stored: 'local', rank: null,
        reason: (res && res.message) || '랭킹에 올리지 못했어요. 이 기기에는 저장해 두었어요.'
      };
    }).catch(function () {
      return {
        ok: false, stored: 'local', rank: null,
        reason: '랭킹 서버에 연결하지 못했어요. 이 기기에는 저장해 두었어요.'
      };
    });
  }

  /**
   * 순위표.
   * @param {{category:string, order:string, limit:number}} opt
   * @returns {Promise<{rows:Array, source:string, total:number, message:string}>}
   */
  function board(opt) {
    opt = opt || {};
    var cat = parseCat(opt.category).key;
    var order = opt.order === 'asc' ? 'asc' : 'desc';
    var limit = Math.min(100, Math.max(1, opt.limit || 100));

    if (!isConfigured()) {
      var rows = localBoard(cat, order);
      return Promise.resolve({
        rows: rows.slice(0, limit), source: 'local', total: rows.length,
        message: '랭킹 서버가 설정되지 않아 이 기기 기록만 보여 줘요.'
      });
    }
    return call({ action: 'top', cat: cat, order: order, limit: limit, t: Date.now() })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.message) || 'server');
        return { rows: res.rows || [], source: 'sheet', total: res.total || 0, message: '' };
      })
      .catch(function () {
        var l = localBoard(cat, order);
        return {
          rows: l.slice(0, limit), source: 'local', total: l.length,
          message: '랭킹 서버에 연결하지 못해 이 기기 기록을 보여 줘요.'
        };
      });
  }

  /** 닉네임 검색 — 100위 바깥도 찾을 수 있다 */
  function search(nick, opt) {
    opt = opt || {};
    var cat = parseCat(opt.category).key;
    var order = opt.order === 'asc' ? 'asc' : 'desc';
    var q = String(nick || '').trim();
    if (!q) return Promise.resolve({ rows: [], source: 'none', message: '찾을 닉네임을 입력해 주세요.' });

    if (!isConfigured()) {
      var rows = localBoard(cat, order).filter(function (r) {
        return r.nick.toLowerCase().indexOf(q.toLowerCase()) >= 0;
      });
      return Promise.resolve({
        rows: rows, source: 'local',
        message: rows.length ? '' : '이 기기 기록에는 없어요.'
      });
    }
    return call({ action: 'find', cat: cat, order: order, nick: q, t: Date.now() })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.message) || 'server');
        return {
          rows: res.rows || [], source: 'sheet',
          message: (res.rows && res.rows.length) ? '' : '그 닉네임의 기록을 찾지 못했어요.'
        };
      })
      .catch(function () {
        return { rows: [], source: 'error', message: '랭킹 서버에 연결하지 못했어요.' };
      });
  }

  return {
    METRICS: METRICS,
    GATE: GATE,
    MAX_NICK: MAX_NICK,
    metric: metric,
    metricsFor: metricsFor,
    catKey: catKey,
    parseCat: parseCat,
    gateOf: gateOf,
    isConfigured: isConfigured,
    validateNick: validateNick,
    startRun: startRun,
    submit: submit,
    board: board,
    search: search,
    fmtTime: fmtTime,
    fmtPct: fmtPct,
    fmtValue: fmtValue,
    /* 서버와 짝을 이루는 함수 — 테스트에서 맞춰 보려고 내보낸다 */
    _sign: sign,
    _canonical: canonical,
    _foldRuns: foldRuns,
    _valueOf: valueOf
  };
})();
