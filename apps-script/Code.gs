/* =============================================================
 *  소리 콩콩 학습 산책 — 랭킹 서버 (Google Apps Script)
 *
 *  구글 스프레드시트를 랭킹 DB 로 쓰고, 이 스크립트를 웹 앱으로 배포해
 *  게임(js/ranking.js)이 부르는 창구로 삼는다.
 *  설치 방법은 docs/RANKING.md 에 처음부터 끝까지 적어 두었다.
 *
 *  ── 창구 ───────────────────────────────────────────────────
 *    ?action=start                        → 1회용 실행 토큰 발급
 *    ?action=submit&token=…&nick=…&score=… → 기록 등록
 *    ?action=top&cat=score&order=desc      → 순위표 (최대 100)
 *    ?action=find&nick=…&cat=…             → 닉네임 검색 (100위 밖도)
 *    ?action=ping                          → 설치 확인
 *  모든 응답은 callback 이 있으면 JSONP 로 감싸 돌려준다.
 *
 *  ── 조작 방지 원칙 ─────────────────────────────────────────
 *  브라우저에서 도는 코드는 언제든 고쳐질 수 있다. 그래서 여기서는
 *  "사람이 실제로 낼 수 있는 값인가"만 본다. 기준은 실제 플레이의 두세 배로
 *  넉넉하게 잡아 두었다 — 잘하는 아이가 억울하게 걸리는 쪽이 훨씬 나쁘다.
 *
 *  그리고 걸린 기록도 지우지 않는다. 시트에는 그대로 남기고 '공개' 칸만
 *  FALSE 로 두어 랭킹에서 뺀다. 선생님이 보고 정상이라고 판단하면 그 칸을
 *  TRUE 로 바꾸기만 하면 바로 랭킹에 올라간다.
 * ============================================================= */

/* ---------- 설정 ---------- */

var SHEET_NAME = '기록';
var HEADERS = ['시각', '닉네임', '점수', '시간(ms)', '시간', '맞힌문제', '정답밟기',
               '오답밟기', '낙하', '최대콤보', '정확도', '문제수', '격자',
               '공개', '비고', '실행ID'];

var COL = { at: 1, nick: 2, score: 3, timeMs: 4, timeTxt: 5, solved: 6, hits: 7,
            misses: 8, falls: 9, maxCombo: 10, accuracy: 11, quizzes: 12, grid: 13,
            open: 14, note: 15, runId: 16 };

/* 타당성 기준 — 전부 실제 플레이의 두세 배로 넉넉하게 */
var LIMITS = {
  /* 토큰의 최대 나이. 이어하기로 며칠에 걸쳐 한 판을 끄는 경우가 있어서,
     게임 쪽에서 토큰이 낡으면 새로 받아 둔다(js/game.js applySave).

     최소 나이 검사는 일부러 두지 않는다. "받자마자 등록"을 막는 검사처럼
     보이지만, 스크립트를 짜는 사람은 시간도 마음대로 보낼 수 있으므로
     실제로 걸리는 것은 이어하기로 돌아온 정상 플레이어뿐이다.
     그 몫은 아래 plausible() 의 시간·점수 정합성 검사가 맡는다. */
  maxTokenAgeMs: 24 * 3600e3,
  minTimeMs: 3000,
  maxTimeMs: 12 * 3600e3,
  maxScore: 2000000,
  maxSolved: 5000,
  msPerSolved: 1000,            // 실제 최소는 2.4초쯤 (완성 연출 2.1초 + 점프)
  pointsPerSec: 600,            // 실제 최고는 초당 60점 수준
  pointsPerQuiz: 3000,          // 실제 최고는 문제당 1,100점쯤
  wallSlackMs: 10000,
  maxNick: 12
};

var CACHE_SEC = 45;

/* =============================================================
 *  입구
 * ============================================================= */

function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    switch (String(p.action || 'ping')) {
      case 'start':  out = apiStart(); break;
      case 'submit': out = apiSubmit(p); break;
      case 'top':    out = apiTop(p); break;
      case 'find':   out = apiFind(p); break;
      default:       out = { ok: true, message: '소리 콩콩 랭킹 서버가 켜져 있습니다.' };
    }
  } catch (err) {
    out = { ok: false, message: '서버 오류: ' + (err && err.message ? err.message : err) };
  }
  return reply(out, p.callback);
}

function reply(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* =============================================================
 *  시트
 * ============================================================= */

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 메뉴에서 한 번 눌러 시트와 비밀키를 만들어 두는 용도 */
function setup() {
  sheet();
  secret();
  SpreadsheetApp.getActiveSpreadsheet().toast('준비가 끝났습니다. 웹 앱으로 배포하세요.', '소리 콩콩 랭킹', 8);
}

/* =============================================================
 *  실행 토큰
 *
 *  판이 시작될 때 하나 발급하고, 기록을 올릴 때 돌려받는다.
 *  토큰 안에 발급 시각이 들어 있고 서버 비밀키로 서명돼 있어서,
 *  주소창에서 만들어 낼 수 없고 한 번 쓰면 다시 못 쓴다.
 * ============================================================= */

function secret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SECRET', s);
  }
  return s;
}

function macOf(text) {
  var raw = Utilities.computeHmacSha256Signature(text, secret());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '').substring(0, 24);
}

function apiStart() {
  var runId = Utilities.getUuid();
  var at = Date.now();
  var body = runId + '.' + at.toString(36);
  return { ok: true, runId: runId, token: body + '.' + macOf(body), serverTime: at };
}

function checkToken(token, runId) {
  if (!token) return '실행 토큰이 없습니다.';
  var parts = String(token).split('.');
  if (parts.length !== 3) return '실행 토큰 형식이 올바르지 않습니다.';
  if (parts[0] !== runId) return '실행 토큰이 이 판의 것이 아닙니다.';
  if (macOf(parts[0] + '.' + parts[1]) !== parts[2]) return '실행 토큰 서명이 맞지 않습니다.';

  var at = parseInt(parts[1], 36);
  if (!(at > 0)) return '실행 토큰의 시각을 읽을 수 없습니다.';
  if (Date.now() - at > LIMITS.maxTokenAgeMs) {
    return '판을 시작한 지 너무 오래됐어요. 한 판 더 하고 등록해 주세요.';
  }
  return '';
}

/* =============================================================
 *  서명 — js/ranking.js 와 반드시 같은 함수
 *
 *  ⚠ 한쪽만 고치면 모든 등록이 실패한다. 고칠 때는 양쪽을 같이.
 * ============================================================= */

var SIG_FIELDS = ['nick', 'score', 'timeMs', 'solved', 'hits', 'misses', 'falls', 'maxCombo'];

function fnv1a(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

function signOf(rec, token) {
  var parts = [];
  for (var i = 0; i < SIG_FIELDS.length; i++) {
    var v = rec[SIG_FIELDS[i]];
    parts.push(typeof v === 'number' ? String(Math.round(v)) : String(v == null ? '' : v));
  }
  var base = String(token) + '~' + parts.join('|');
  return fnv1a(base) + fnv1a(base + '~' + base.length);
}

/* =============================================================
 *  닉네임 — 클라이언트 검사는 우회될 수 있으므로 여기서 다시 본다
 * ============================================================= */

var NICK_RULES = [
  [/[<>"\'\\\/\x00-\x1f]/,            '쓸 수 없는 문자가 들어 있어요.'],
  [/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,      '이메일 주소는 닉네임에 쓸 수 없어요.'],
  [/01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}/,  '전화번호는 닉네임에 쓸 수 없어요.'],
  [/\d{6}[-\s]?[1-4]\d{6}/,              '주민등록번호는 쓸 수 없어요.'],
  [/\d{1,2}\s*학\s*년/,                  '학년·반·번호는 닉네임에 쓸 수 없어요.'],
  [/\d{1,2}\s*반\s*\d{1,2}\s*번/,        '학년·반·번호는 닉네임에 쓸 수 없어요.'],
  [/\d{8,}/,                             '긴 숫자는 닉네임에 쓸 수 없어요.']
];

function cleanNick(raw) {
  var s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!s) return { ok: false, reason: '닉네임이 비어 있습니다.' };
  if (s.length > LIMITS.maxNick) return { ok: false, reason: '닉네임이 너무 깁니다.' };
  for (var i = 0; i < NICK_RULES.length; i++) {
    if (NICK_RULES[i][0].test(s)) return { ok: false, reason: NICK_RULES[i][1] };
  }
  return { ok: true, value: s };
}

/* =============================================================
 *  타당성 — "사람이 실제로 낼 수 있는 값인가"
 *
 *  걸려도 기록은 남긴다. 공개 칸만 FALSE 가 되고, 여기서 돌려준 이유가
 *  비고 칸에 적힌다.
 * ============================================================= */

function plausible(r) {
  if (!(r.score >= 0 && r.score <= LIMITS.maxScore)) return '점수 범위를 벗어났습니다.';
  if (!(r.timeMs >= LIMITS.minTimeMs)) return '플레이 시간이 너무 짧습니다.';
  if (!(r.timeMs <= LIMITS.maxTimeMs)) return '플레이 시간이 너무 깁니다.';
  if (!(r.solved >= 0 && r.solved <= LIMITS.maxSolved)) return '맞힌 문제 수가 범위를 벗어났습니다.';
  if (r.hits < 0 || r.misses < 0 || r.falls < 0) return '값이 음수입니다.';
  if (r.hits < r.solved) return '맞힌 문제 수와 밟은 글자 수가 맞지 않습니다.';

  if (r.timeMs < r.solved * LIMITS.msPerSolved) {
    return '시간에 비해 맞힌 문제가 너무 많습니다.';
  }
  if (r.score > (r.timeMs / 1000) * LIMITS.pointsPerSec + 2000) {
    return '시간에 비해 점수가 너무 높습니다.';
  }
  if (r.score > (r.solved + 1) * LIMITS.pointsPerQuiz) {
    return '맞힌 문제 수에 비해 점수가 너무 높습니다.';
  }
  /* 논 시간이 실제로 흐른 시간보다 길 수는 없다.
     (반대로 벽시계가 훨씬 긴 것은 정상이다 — 잠시 자리를 비운 경우) */
  if (r.wallMs > 0 && r.timeMs > r.wallMs + LIMITS.wallSlackMs) {
    return '플레이 시간이 실제로 흐른 시간보다 깁니다.';
  }
  return '';
}

/* =============================================================
 *  등록
 * ============================================================= */

function num(v, dflt) {
  var n = Number(v);
  return isFinite(n) ? Math.round(n) : (dflt || 0);
}

function apiSubmit(p) {
  var nick = cleanNick(p.nick);
  if (!nick.ok) return { ok: false, message: nick.reason };

  var runId = String(p.runId || '');
  var tokenErr = checkToken(p.token, runId);
  if (tokenErr) return { ok: false, message: tokenErr };

  var rec = {
    nick: nick.value,
    score: num(p.score), timeMs: num(p.timeMs), solved: num(p.solved),
    hits: num(p.hits), misses: num(p.misses), falls: num(p.falls),
    maxCombo: num(p.maxCombo), quizzes: num(p.quizzes), grid: num(p.grid),
    wallMs: num(p.wallMs)
  };

  if (signOf(rec, p.token) !== String(p.sig || '')) {
    return { ok: false, message: '보낸 기록이 도중에 바뀌었습니다.' };
  }

  var why = plausible(rec);
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { ok: false, message: '지금 등록이 몰리고 있어요. 잠시 뒤 다시 해 주세요.' };
  }

  try {
    var sh = sheet();
    if (usedRunId(sh, runId)) {
      return { ok: false, message: '이 판은 이미 등록되었습니다.' };
    }

    var tries = rec.hits + rec.misses;
    sh.appendRow([
      new Date(), rec.nick, rec.score, rec.timeMs, fmtTime(rec.timeMs),
      rec.solved, rec.hits, rec.misses, rec.falls, rec.maxCombo,
      tries ? rec.hits / tries : 0, rec.quizzes, rec.grid,
      why ? false : true, why, runId
    ]);
    CacheService.getScriptCache().removeAll(cacheKeys());
  } finally {
    lock.releaseLock();
  }

  if (why) {
    return {
      ok: false,
      message: '기록은 저장했지만 확인이 필요해 랭킹에는 올리지 않았어요 (' + why + ') 선생님께 말씀해 주세요.'
    };
  }
  return { ok: true, rank: rankOf(rec.nick, 'score', 'desc'), message: '' };
}

/** 이미 등록된 판인가 — 실행ID 열만 훑는다 */
function usedRunId(sh, runId) {
  var last = sh.getLastRow();
  if (last < 2 || !runId) return false;
  var col = sh.getRange(2, COL.runId, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]) === runId) return true;
  return false;
}

/* =============================================================
 *  집계
 * ============================================================= */

var CATS = { score: COL.score, timeMs: COL.timeMs, solved: COL.solved, accuracy: COL.accuracy };

function cacheKeys() {
  var keys = [];
  for (var c in CATS) { keys.push('b_' + c + '_desc'); keys.push('b_' + c + '_asc'); }
  return keys;
}

/**
 * 닉네임별 최고 기록으로 줄을 세운다.
 * 같은 사람이 여러 판을 해도 랭킹에는 가장 좋은 한 판만 오른다.
 */
function ordered(cat, order) {
  var key = 'b_' + cat + '_' + order;
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* 캐시가 깨졌으면 다시 만든다 */ }
  }

  var sh = sheet();
  var last = sh.getLastRow();
  var rows = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    var best = {};
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (v[COL.open - 1] !== true && String(v[COL.open - 1]).toUpperCase() !== 'TRUE') continue;
      var nick = String(v[COL.nick - 1] || '').trim();
      if (!nick) continue;
      var value = Number(v[CATS[cat] - 1]) || 0;
      var cur = best[nick];
      if (!cur || cur.value < value) {
        best[nick] = {
          nick: nick, value: value,
          score: Number(v[COL.score - 1]) || 0,
          timeMs: Number(v[COL.timeMs - 1]) || 0,
          solved: Number(v[COL.solved - 1]) || 0,
          accuracy: Number(v[COL.accuracy - 1]) || 0,
          at: v[COL.at - 1] ? new Date(v[COL.at - 1]).getTime() : 0
        };
      }
    }
    for (var n in best) rows.push(best[n]);
  }

  rows.sort(function (a, b) {
    if (b.value !== a.value) return b.value - a.value;
    return a.at - b.at;                       // 같은 값이면 먼저 세운 사람이 위로
  });
  if (order === 'asc') rows.reverse();
  for (var k = 0; k < rows.length; k++) rows[k].rank = k + 1;

  try { cache.put(key, JSON.stringify(rows), CACHE_SEC); } catch (e) { /* 너무 크면 캐시 없이 */ }
  return rows;
}

function catOf(v) { return CATS[v] ? v : 'score'; }
function orderOf(v) { return v === 'asc' ? 'asc' : 'desc'; }

function apiTop(p) {
  var cat = catOf(p.cat), order = orderOf(p.order);
  var limit = Math.min(100, Math.max(1, num(p.limit, 100)));
  var rows = ordered(cat, order);
  return { ok: true, cat: cat, order: order, total: rows.length, rows: rows.slice(0, limit) };
}

function apiFind(p) {
  var cat = catOf(p.cat), order = orderOf(p.order);
  var q = String(p.nick || '').trim().toLowerCase();
  if (!q) return { ok: true, rows: [], total: 0 };
  var rows = ordered(cat, order).filter(function (r) {
    return r.nick.toLowerCase().indexOf(q) >= 0;
  });
  return { ok: true, cat: cat, order: order, total: rows.length, rows: rows.slice(0, 50) };
}

function rankOf(nick, cat, order) {
  var rows = ordered(catOf(cat), orderOf(order));
  for (var i = 0; i < rows.length; i++) if (rows[i].nick === nick) return rows[i].rank;
  return null;
}

function fmtTime(ms) {
  var s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return h ? (h + ':' + p(m) + ':' + p(ss)) : (m + ':' + p(ss));
}

/* =============================================================
 *  시트 메뉴 — 설치와 점검을 버튼으로
 * ============================================================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('소리 콩콩 랭킹')
    .addItem('시트 준비하기', 'setup')
    .addItem('랭킹 다시 계산', 'clearCache')
    .addItem('자체 점검', 'selfTest')
    .addToUi();
}

function clearCache() {
  CacheService.getScriptCache().removeAll(cacheKeys());
  SpreadsheetApp.getActiveSpreadsheet().toast('랭킹을 다시 계산합니다.', '소리 콩콩 랭킹', 5);
}

/** 토큰 발급 → 서명 → 타당성까지 한 번에 확인한다 */
function selfTest() {
  var started = apiStart();
  var rec = { nick: '점검용', score: 300, timeMs: 60000, solved: 5,  // eslint-disable-line
              hits: 20, misses: 3, falls: 1, maxCombo: 4, quizzes: 6, grid: 5, wallMs: 65000 };
  var sig = signOf(rec, started.token);
  var lines = [
    '토큰 발급: ' + (started.ok ? 'OK' : '실패'),
    '서명: ' + sig,
    '타당성: ' + (plausible(rec) || 'OK'),
    '시트: ' + sheet().getName() + ' (' + Math.max(0, sheet().getLastRow() - 1) + '개 기록)'
  ];
  SpreadsheetApp.getUi().alert('소리 콩콩 랭킹 — 자체 점검', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
