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
  var TIMEOUT_MS = 12000;

  /* =========================================================
   *  집계 조건
   * ======================================================= */
  var CATEGORIES = [
    { key: 'score',    ko: '점수',      fmt: 'num',  unit: '점' },
    { key: 'timeMs',   ko: '버틴 시간', fmt: 'time', unit: '' },
    { key: 'solved',   ko: '맞힌 문제', fmt: 'num',  unit: '문제' },
    { key: 'accuracy', ko: '정확도',    fmt: 'pct',  unit: '' }
  ];

  function category(key) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].key === key) return CATEGORIES[i];
    return CATEGORIES[0];
  }

  /** 초 단위까지의 시간 표기 — 1시간을 넘기면 h:mm:ss */
  function fmtTime(ms) {
    var s = Math.max(0, Math.round((+ms || 0) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return h ? (h + ':' + p(m) + ':' + p(ss)) : (m + ':' + p(ss));
  }

  function fmtValue(cat, v) {
    var c = category(cat);
    if (c.fmt === 'time') return fmtTime(v);
    if (c.fmt === 'pct') return (Math.round((+v || 0) * 1000) / 10) + '%';
    return String(Math.round(+v || 0)) + (c.unit ? ' ' + c.unit : '');
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
    { re: /[<>"'\\/\x00-\x1f]/,            msg: '쓸 수 없는 문자가 들어 있어요.' },
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

  var SIG_FIELDS = ['nick', 'score', 'timeMs', 'solved', 'hits', 'misses', 'falls', 'maxCombo'];

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
      var timer = null;
      var done = function (fn, arg) {
        if (timer) { clearTimeout(timer); timer = null; }
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
        fn(arg);
      };

      window[cb] = function (data) { done(resolve, data); };
      script.onerror = function () { done(reject, new Error('network')); };
      timer = setTimeout(function () { done(reject, new Error('timeout')); }, TIMEOUT_MS);

      script.src = url;
      script.async = true;
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function isConfigured() { return !!(ENABLED && ENDPOINT); }

  /* =========================================================
   *  이 기기에만 남는 기록 — 서버가 없을 때의 대체재
   * ======================================================= */
  var LOCAL_KEY = 'sk.rank.local.v1';
  var LOCAL_MAX = 100;

  function localLoad() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function localSave(list) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, LOCAL_MAX))); }
    catch (e) { /* 저장 공간이 없어도 게임은 계속된다 */ }
  }

  function localAdd(rec) {
    var list = localLoad();
    list.push({
      nick: rec.nick, score: rec.score, timeMs: rec.timeMs, solved: rec.solved,
      hits: rec.hits, misses: rec.misses, accuracy: accuracyOf(rec), at: Date.now()
    });
    list.sort(function (a, b) { return b.score - a.score; });
    localSave(list);
    return list;
  }

  function accuracyOf(rec) {
    var tries = (+rec.hits || 0) + (+rec.misses || 0);
    return tries ? (+rec.hits || 0) / tries : 0;
  }

  /** 서버가 하는 집계를 이 기기 기록으로 흉내 낸다 — 닉네임별 최고 기록 */
  function localBoard(opt) {
    var cat = category(opt && opt.category).key;
    var desc = !opt || opt.order !== 'asc';
    var best = Object.create(null);
    localLoad().forEach(function (r) {
      var cur = best[r.nick];
      var v = +r[cat] || 0;
      if (!cur || (+cur[cat] || 0) < v) best[r.nick] = r;
    });
    var rows = [];
    for (var n in best) rows.push(best[n]);
    rows.sort(function (a, b) {
      var d = (+b[cat] || 0) - (+a[cat] || 0);
      return desc ? d : -d;
    });
    return rows.map(function (r, i) {
      return {
        rank: i + 1, nick: r.nick, value: +r[cat] || 0,
        score: r.score, timeMs: r.timeMs, solved: r.solved,
        accuracy: r.accuracy, at: r.at
      };
    });
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
   * @param {object} rec  nick·score·timeMs·solved·hits·misses·falls·maxCombo·quizzes·grid
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
      solved: Math.round(rec.solved),
      hits: Math.round(rec.hits),
      misses: Math.round(rec.misses),
      falls: Math.round(rec.falls),
      maxCombo: Math.round(rec.maxCombo),
      quizzes: Math.round(rec.quizzes || 0),
      grid: Math.round(rec.grid || 0),
      wallMs: Math.round(rec.wallMs || 0),
      ver: rec.ver || '1'
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
    var cat = category(opt.category).key;
    var order = opt.order === 'asc' ? 'asc' : 'desc';
    var limit = Math.min(100, Math.max(1, opt.limit || 100));
    if (!isConfigured()) {
      var rows = localBoard({ category: cat, order: order });
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
        var l = localBoard({ category: cat, order: order });
        return {
          rows: l.slice(0, limit), source: 'local', total: l.length,
          message: '랭킹 서버에 연결하지 못해 이 기기 기록을 보여 줘요.'
        };
      });
  }

  /**
   * 닉네임 검색 — 100위 바깥도 찾을 수 있다.
   */
  function search(nick, opt) {
    opt = opt || {};
    var cat = category(opt.category).key;
    var order = opt.order === 'asc' ? 'asc' : 'desc';
    var q = String(nick || '').trim();
    if (!q) return Promise.resolve({ rows: [], source: 'none', message: '찾을 닉네임을 입력해 주세요.' });

    if (!isConfigured()) {
      var rows = localBoard({ category: cat, order: order }).filter(function (r) {
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
    CATEGORIES: CATEGORIES,
    MAX_NICK: MAX_NICK,
    category: category,
    isConfigured: isConfigured,
    validateNick: validateNick,
    startRun: startRun,
    submit: submit,
    board: board,
    search: search,
    fmtTime: fmtTime,
    fmtValue: fmtValue,
    /* 서버와 짝을 이루는 함수 — 테스트에서 맞춰 보려고 내보낸다 */
    _sign: sign,
    _canonical: canonical
  };
})();
