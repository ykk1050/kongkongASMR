/* =============================================================
 *  랭킹 서버 설정
 *
 *  구글 스프레드시트를 랭킹 DB 로 쓴다. 시트에 붙인 Apps Script 를
 *  웹 앱으로 배포하면 나오는 주소(.../exec)를 아래 endpoint 에 적으면 된다.
 *  만드는 방법은 docs/RANKING.md 에 처음부터 끝까지 적어 두었다.
 *
 *  비워 두어도 게임은 그대로 돌아간다 — 그때는 이 기기 안에만 남는
 *  '내 기록'으로 대신하고, 랭킹 화면에 설정이 필요하다고 알려 준다.
 * ============================================================= */
window.SK_RANKING = {
  /** 배포한 Apps Script 웹 앱 주소. 예: 'https://script.google.com/macros/s/AKfy.../exec' */
  endpoint: 'https://script.google.com/macros/s/AKfycbxxqOWTrKRDbV3oKUdRz2o8mLctb8I72XDuc68hZk589w2tXLb1O1MjUT9KOs1KT89Z/exec',

  /** 랭킹 기능 자체를 끄고 싶을 때 false */
  enabled: true
};
