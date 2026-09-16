/* =============================================================
 *  소리 콩콩 — 아이소메트릭 투영 유틸
 *  격자 좌표(gx, gy, gz) <-> 화면 좌표(sx, sy) 변환
 * ============================================================= */
window.SK = window.SK || {};

SK.Iso = (function () {
  var TW = 116;   // 타일 다이아몬드 가로 폭
  var TH = 58;    // 타일 다이아몬드 세로 폭
  var TZ = 26;    // 타일 두께(높이) 픽셀

  /** 격자 -> 화면 (gz는 위로 뜨는 높이, 격자 단위 1.0 = TZ*2 픽셀) */
  function toScreen(gx, gy, gz) {
    return {
      x: (gx - gy) * (TW / 2),
      y: (gx + gy) * (TH / 2) - (gz || 0) * TZ * 2
    };
  }

  /** 화면 -> 격자 (지면 z=0 평면 기준) */
  function toGrid(sx, sy) {
    return {
      x: sx / TW + sy / TH,
      y: sy / TH - sx / TW
    };
  }

  /**
   * 화면 방향 벡터를 격자 방향 벡터로 변환.
   * 화면 위쪽(-y)을 누르면 화면상 위로 걸어가도록 만들어 준다.
   */
  function screenDirToGrid(sx, sy) {
    var gx = sx / TW + sy / TH;
    var gy = sy / TH - sx / TW;
    var len = Math.hypot(gx, gy);
    if (len < 1e-6) return { x: 0, y: 0 };
    return { x: gx / len, y: gy / len };
  }

  /** 페인터 알고리즘용 깊이값 */
  function depth(gx, gy) { return gx + gy; }

  /**
   * 타일 윗면(다이아몬드) 위에 "바닥에 그려진 것처럼" 텍스트/그림을 렌더한다.
   * 단위 정사각형 (-0.5..0.5)^2 을 아이소 다이아몬드로 매핑하는 행렬을 설정.
   * 사용 후 반드시 ctx.restore().
   */
  function pushSurface(ctx, cx, cy, scale) {
    var s = scale == null ? 1 : scale;
    ctx.save();
    ctx.transform(
      (TW / 2) * s, (TH / 2) * s,   // u축 -> 화면
      -(TW / 2) * s, (TH / 2) * s,  // v축 -> 화면
      cx, cy
    );
  }

  /** 다이아몬드 윗면 경로 */
  function diamondPath(ctx, cx, cy, inset) {
    var w = TW / 2 - (inset || 0), h = TH / 2 - (inset || 0) * (TH / TW);
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + w, cy);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx - w, cy);
    ctx.closePath();
  }

  return {
    TW: TW, TH: TH, TZ: TZ,
    toScreen: toScreen,
    toGrid: toGrid,
    screenDirToGrid: screenDirToGrid,
    depth: depth,
    pushSurface: pushSurface,
    diamondPath: diamondPath
  };
})();
