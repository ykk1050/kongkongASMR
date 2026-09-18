/* =============================================================
 *  소리 콩콩 — 이어하기 저장소
 *
 *  화면을 옮기거나 탭을 닫았다가 다시 들어와도 하던 판을 그대로 잇는다.
 *  저장하는 것은 "판의 사진" 한 장이다 — 점수·목숨·시간, 타일 하나하나의
 *  재질과 닳은 정도, 글자 배치, 지금 문제와 어디까지 밟았는지, 앞으로 나올
 *  문제 차례, 캐릭터가 선 자리.
 *
 *  ── 담당 범위 ───────────────────────────────────────────────
 *  여기서는 담고·꺼내고·버리는 일만 한다. 무엇을 담을지와 어떻게 되살릴지는
 *  game.js 가 안다(captureSave / applySave). 게임 상태를 이 파일이 직접
 *  만지지 않으므로, 개발자 도구로 이 모듈을 들여다봐도 진행 중인 점수를
 *  건드릴 수는 없다.
 * ============================================================= */
window.SK = window.SK || {};

SK.Save = (function () {

  var KEY = 'sk.run.v1';

  /* 너무 오래된 저장은 잇지 않는다 — 한 주 전에 하던 판을 갑자기 이어
     받으면 "새로 시작한 줄 알았는데 목숨이 하나뿐"인 상황이 된다. */
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function available() {
    try {
      var k = '__sk_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  var OK = available();

  /**
   * 판을 저장한다.
   * @param {object} snap game.js 가 만든 스냅샷
   * @returns {boolean} 저장에 성공했는가
   */
  function write(snap) {
    if (!OK || !snap) return false;
    try {
      snap.v = 1;
      snap.savedAt = Date.now();
      localStorage.setItem(KEY, JSON.stringify(snap));
      return true;
    } catch (e) {
      /* 저장 공간이 꽉 찼을 수 있다. 이어하기는 없어도 게임은 굴러가야 하므로
         조용히 포기하고, 다음 저장 때 다시 시도한다. */
      return false;
    }
  }

  /**
   * 저장된 판을 꺼낸다. 없거나·낡았거나·깨졌으면 null.
   * @returns {object|null}
   */
  function read() {
    if (!OK) return null;
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;

    var snap;
    try { snap = JSON.parse(raw); } catch (e) { clear(); return null; }

    if (!snap || snap.v !== 1) { clear(); return null; }
    if (!Array.isArray(snap.tiles) || !snap.tiles.length) { clear(); return null; }
    if (!snap.quizId || typeof snap.quizId !== 'string') { clear(); return null; }
    if (!(snap.lives > 0)) { clear(); return null; }          // 이미 끝난 판은 잇지 않는다
    if (Date.now() - (snap.savedAt || 0) > MAX_AGE_MS) { clear(); return null; }

    return snap;
  }

  /** 이어할 판이 있는가 — 시작 화면에서 버튼을 고르는 데 쓴다 */
  function has() { return !!read(); }

  /** 요약 한 줄 — "점수 320 · 목숨 3 · 4:12" */
  function summary() {
    var s = read();
    if (!s) return '';
    var t = SK.Ranking ? SK.Ranking.fmtTime(s.timeMs || 0) : '';
    return '점수 ' + (s.score || 0) + ' · 목숨 ' + (s.lives || 0) + (t ? ' · ' + t : '');
  }

  function clear() {
    if (!OK) return;
    try { localStorage.removeItem(KEY); } catch (e) { /* 지우지 못해도 read() 가 걸러낸다 */ }
  }

  return {
    available: function () { return OK; },
    write: write,
    read: read,
    has: has,
    summary: summary,
    clear: clear
  };
})();
