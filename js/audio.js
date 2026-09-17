/* =============================================================
 *  소리 콩콩 — ASMR 오디오 엔진 v2
 *
 *  설계 원칙 (v1 대비 달라진 점)
 *   1) 모달 합성(modal synthesis) — 두드린 물체는 "감쇠하는 공명 모드의 합"이다.
 *      단일 오실레이터 대신 재질별 비조화 배음비를 가진 3~5개 모드를 쌓는다.
 *   2) 트랜지언트 / 바디 / 테일 3단 구조 — 어택의 딱 소리, 몸통 공명, 잔향 꼬리를 분리.
 *   3) 휴머나이즈 — 매번 피치·타이밍·게인을 조금씩 흔들어 기계적 반복을 없앤다.
 *   4) 그래뉼러 텍스처 — 낙엽·비닐은 수십 개의 미세 알갱이를 좌우로 흩뿌린다.
 *   5) 근접 마이크 감각 — 잔향은 짧고 어둡게, 저역을 살짝 올리고 리미터로 정리.
 *
 *  - PannerNode(HRTF) 기반 바이노럴 정위
 *  - registerSampleMap()으로 실제 녹음 에셋 교체 가능 (docs/AUDIO_MAPPING.md)
 * ============================================================= */
window.SK = window.SK || {};

SK.Audio = (function () {
  var ctx = null;
  var preMaster = null, master = null, dryBus = null, wetBus = null, convolver = null;
  var warmth = null, limiter = null, saturator = null, satIn = null;
  var noiseBuf = null, samples = Object.create(null), lastVariant = Object.create(null);
  var sampleGain = Object.create(null);
  var analyser = null, levelBuf = null, smoothLevel = 0;
  var muted = false, ready = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* 체인 드라이브. 재질별 음량을 가운데로 모으면서(docs 6장) 전체가 조금 내려가므로
     그만큼을 여기서 되올린다. **소프트 클리퍼 앞**에 걸어야 출력이 1.0을 넘지 않는다.
     master 게인은 음소거 페이드 전용으로 1.0에 둔다. */
  var DRIVE = 1.05;

  /* =========================================================
   *  초기화 — 마스터 체인
   *
   *   voices ─▶ panner ─┬─▶ dryBus ─────────────┐
   *                     └─▶ send ─▶ wetBus ─▶ convolver ─┤
   *                                                      ▼
   *              preMaster ─▶ lowShelf(따뜻함) ─▶ limiter ─▶ softClip ─▶ master ─▶ 출력
   * ======================================================= */
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.55;
    levelBuf = new Uint8Array(analyser.fftSize);
    master.connect(analyser);

    /* 안전망 — 소프트 클리퍼.
     *
     *  아래 DynamicsCompressor 는 어택이 3ms라 **진짜 트랜지언트는 그냥 통과시킨다**.
     *  발소리는 크레스트가 20dB을 넘나들어서, 컴프레서만 믿으면 세게 내려찍을 때
     *  출력이 1.0을 넘어 하드 클리핑(지직) 이 났다 — 실측으로 1.10까지 나왔다.
     *
     *  0.65 아래는 손대지 않고 그 위만 tanh 로 접는다. ±2.0 입력까지 1.0 안에
     *  가두므로 어떤 조합으로 소리가 겹쳐도 클리핑이 없고, 눌리는 구간에서는
     *  아날로그 새추레이션처럼 살짝 두툼해진다. */
    saturator = ctx.createWaveShaper();
    saturator.curve = makeSoftClip(0.65, 2.0);
    saturator.oversample = '4x';
    saturator.connect(master);

    // 파형쉐이퍼는 ±1 바깥을 끝값으로 잘라 버리므로, ±2.0 을 곡선 안에 넣어 준다
    satIn = ctx.createGain();
    satIn.gain.value = 0.5;
    satIn.connect(saturator);

    // 여러 소리가 겹쳐도 지저분해지지 않도록 부드럽게 눌러 준다
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;
    limiter.connect(satIn);

    // 근접 마이크 느낌의 저역 보강
    warmth = ctx.createBiquadFilter();
    warmth.type = 'lowshelf';
    warmth.frequency.value = 180;
    warmth.gain.value = 3.5;
    warmth.connect(limiter);

    preMaster = ctx.createGain();
    preMaster.gain.value = DRIVE;
    preMaster.connect(warmth);

    dryBus = ctx.createGain(); dryBus.gain.value = 1.0; dryBus.connect(preMaster);

    // ASMR은 "가까이서" 들려야 하므로 잔향은 짧고 어둡게
    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(0.85, 3.4, 4200);
    wetBus = ctx.createGain(); wetBus.gain.value = 0.16;
    wetBus.connect(convolver); convolver.connect(preMaster);

    noiseBuf = makeNoise(2.0);

    var L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0;
      L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(0, 0, 0); L.setOrientation(0, 0, -1, 0, 1, 0);
    }
    ready = true;
    return ctx;
  }

  /**
   * 소프트 클리핑 곡선. knee 아래는 y=x(손대지 않음), 그 위는 tanh 로 접어
   * 어떤 입력이 와도 |y| < 1 을 지킨다.
   * @param {number} knee  여기까지는 그대로 통과 (0~1)
   * @param {number} range 곡선이 감당할 실제 입력 범위 — 앞단에서 1/range 를 곱해 넣는다
   */
  function makeSoftClip(knee, range) {
    var n = 2048, c = new Float32Array(n), span = 1 - knee;
    for (var i = 0; i < n; i++) {
      var x = (i * 2 / (n - 1) - 1) * range;        // 실제 입력값
      var s = x < 0 ? -1 : 1, a = Math.abs(x);
      c[i] = a <= knee ? x : s * (knee + span * Math.tanh((a - knee) / span));
    }
    return c;
  }

  function makeNoise(sec) {
    var n = Math.floor(ctx.sampleRate * sec);
    var b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** 초기 반사 + 어두운 꼬리를 가진 작은 방 임펄스 응답 */
  function makeImpulse(sec, decay, cutoffHint) {
    var n = Math.floor(ctx.sampleRate * sec);
    var b = ctx.createBuffer(2, n, ctx.sampleRate);
    var lp = 0.0;
    var k = Math.min(0.9, (cutoffHint || 4000) / (ctx.sampleRate / 2));
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c);
      lp = 0;
      for (var i = 0; i < n; i++) {
        var t = i / n;
        var v = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        lp += (v - lp) * k;                       // 1극 로우패스로 꼬리를 어둡게
        d[i] = lp * (i < 300 ? i / 300 : 1);
      }
      // 초기 반사 몇 개를 심어 "작은 방" 감각을 만든다
      var taps = [0.011, 0.019, 0.031, 0.047];
      for (var e = 0; e < taps.length; e++) {
        var idx = Math.floor(taps[e] * ctx.sampleRate) + (c ? 37 : 0);
        if (idx < n) d[idx] += (0.5 - e * 0.1) * (c ? -1 : 1);
      }
    }
    return b;
  }

  /* =========================================================
   *  공간화
   * ======================================================= */
  function makePanner(pan, depth) {
    var node;
    if (ctx.createPanner) {
      node = ctx.createPanner();
      node.panningModel = 'HRTF';
      node.distanceModel = 'inverse';
      node.refDistance = 1.2;
      node.maxDistance = 20;
      node.rolloffFactor = 0.9;
      var x = (pan || 0) * 3.2;
      var z = -1.4 - (depth || 0) * 3.0;
      if (node.positionX) { node.positionX.value = x; node.positionY.value = 0; node.positionZ.value = z; }
      else node.setPosition(x, 0, z);
    } else {
      node = ctx.createStereoPanner();
      node.pan.value = Math.max(-1, Math.min(1, pan || 0));
    }
    return node;
  }

  function spatial(pan, depth, wetAmount) {
    var out = ctx.createGain();
    var node = makePanner(pan, depth);
    out.connect(node);
    node.connect(dryBus);
    var send = ctx.createGain();
    send.gain.value = (wetAmount == null ? 0.3 : wetAmount);
    node.connect(send); send.connect(wetBus);
    return out;
  }

  /**
   * 좌·중·우로 살짝 벌린 세 갈래 목적지.
   * 그래뉼러 텍스처(낙엽, 비닐)를 흩뿌려 머리 주변을 감싸는 느낌을 만든다.
   */
  function spatialTrio(pan, depth, wetAmount, spread) {
    var s = spread == null ? 0.28 : spread;
    return [
      spatial(Math.max(-1, pan - s), depth, wetAmount),
      spatial(pan, depth, wetAmount),
      spatial(Math.min(1, pan + s), depth, wetAmount)
    ];
  }

  /* =========================================================
   *  보이스 프리미티브
   * ======================================================= */

  /** 노이즈 한 조각 — 트랜지언트·마찰·바람 */
  function noiseVoice(o) {
    var t0 = o.t || ctx.currentTime;
    var dur = o.dur || 0.08;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    // 버퍼 위치를 매번 바꿔 같은 파형이 반복되지 않게 한다
    var offset = Math.random() * (noiseBuf.duration - dur - 0.05);
    src.playbackRate.value = o.rate || 1;

    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(Math.max(40, o.freq || 1500), t0);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqEnd), t0 + dur);
    f.Q.value = (o.q == null ? 1 : o.q);

    var g = ctx.createGain();
    var a = (o.attack == null ? 0.0015 : o.attack);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.2), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f); f.connect(g); g.connect(o.dest);
    src.start(t0, Math.max(0, offset));
    src.stop(t0 + dur + 0.05);
  }

  /** 단순 톤 — 스윕·서브베이스 */
  function toneVoice(o) {
    var t0 = o.t || ctx.currentTime;
    var dur = o.dur || 0.12;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + dur);

    var g = ctx.createGain();
    var a = (o.attack == null ? 0.003 : o.attack);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.2), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var last = g;
    if (o.lp) {
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = o.lp;
      g.connect(lp); last = lp;
    }
    osc.connect(g); last.connect(o.dest);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  /**
   * 모달 합성 — 두드린 물체의 공명.
   * 각 모드는 고유 주파수비 f, 감쇠시간 d, 세기 g 를 가진다.
   * 주의: 모드에 LFO 비브라토를 걸면 곧바로 전자음처럼 들린다.
   * 말랑한 재질의 '출렁임'은 비브라토가 아니라 toneVoice 의 피치 글라이드로 만든다.
   * @param {object} o {dest, t, base, modes:[{f,d,g}], gain, rate, jitter}
   */
  function modalVoice(o) {
    var t0 = o.t || ctx.currentTime;
    var rate = o.rate || 1;
    var jit = o.jitter == null ? 0.012 : o.jitter;
    var modes = o.modes;

    for (var i = 0; i < modes.length; i++) {
      var m = modes[i];
      var f = o.base * m.f * rate * (1 + rnd(-jit, jit));
      if (f < 18 || f > 18000) continue;

      var osc = ctx.createOscillator();
      osc.type = m.type || 'sine';
      osc.frequency.setValueAtTime(f, t0);

      var g = ctx.createGain();
      var peak = Math.max(0.0002, (o.gain || 0.2) * m.g);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + (m.a || 0.0012));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + m.d);

      osc.connect(g); g.connect(o.dest);
      osc.start(t0); osc.stop(t0 + m.d + 0.05);
    }
  }

  /**
   * 그래뉼러 텍스처 — 수십 개의 미세한 알갱이를 시간·주파수·좌우로 흩뿌린다.
   * 낙엽 바스락, 비닐 구김 같은 "결"이 있는 소리에 쓴다.
   * @param {object} o {dests:[], t, count, span, freq:[lo,hi], q, gain, grain:[lo,hi], decay}
   */
  function granular(o) {
    var t0 = o.t || ctx.currentTime;
    for (var i = 0; i < o.count; i++) {
      var p = i / o.count;
      // 앞쪽에 알갱이가 몰리고 뒤로 갈수록 성기게 — 실제 부스러지는 소리의 분포
      var at = t0 + Math.pow(Math.random(), 0.65) * o.span;
      var density = Math.pow(1 - p, o.decay == null ? 1.1 : o.decay);
      noiseVoice({
        dest: o.dests[i % o.dests.length],
        t: at,
        filter: 'bandpass',
        freq: rnd(o.freq[0], o.freq[1]),
        q: o.q == null ? 3.5 : rnd(o.q * 0.6, o.q * 1.6),
        gain: o.gain * rnd(0.35, 1.15) * (0.4 + density * 0.6),
        dur: rnd(o.grain[0], o.grain[1]),
        attack: 0.0008
      });
    }
  }

  /**
   * 삐걱/뽀득 — 고무·스펀지·눈을 누를 때 나는 공명 처프.
   * 좁은 대역이 위로 쓸려 올라가며 여러 번 끊기는 것이 특징이다.
   * @param {object} o {dest, t, base, rise, gain, count, span, q}
   */
  function squeak(o) {
    var t0 = o.t || ctx.currentTime;
    var n = o.count || 5;
    for (var i = 0; i < n; i++) {
      var p = i / Math.max(1, n - 1);
      var f = o.base * (1 + p * (o.rise == null ? 1.1 : o.rise)) * rnd(0.94, 1.06);
      noiseVoice({
        dest: o.dest,
        t: t0 + p * (o.span || 0.13) + rnd(0, 0.008),
        filter: 'bandpass', freq: f, freqEnd: f * rnd(1.05, 1.3),
        q: o.q == null ? 16 : o.q,
        gain: o.gain * (0.55 + Math.sin(p * Math.PI) * 0.65),
        dur: rnd(0.02, 0.045), attack: 0.004
      });
    }
  }

  /* =========================================================
   *  재질별 레시피
   *  d: 목적지(단일), D: 좌·중·우 목적지 배열
   *  i: 강도 0~1, r: 피치 배율, t: 시작 시각
   * ======================================================= */
  // 주의: 각 레시피의 g(기본 게인)는 재질 간 '체감 음량'이 같아지도록 맞춰 놓았다.
  // 저역이 풍부한 재질(솜·젤리·나무)은 작게, 고역 그래뉼러(낙엽·에어캡)는 크게 잡는다.
  var MATERIAL = {

    /* 기계식 키캡 — 딸깍 + 8ms 뒤 바닥 침. 전체 60ms 이하의 짧은 소리 */
    keycap: function (d, D, i, r, t) {
      var g = 0.145 + 0.190 * i;
      // 1) 스템이 걸리는 순간 (1~4ms, 이게 '딸깍'의 정체)
      noiseVoice({ dest: d, t: t, filter: 'highpass', freq: 3800, gain: g * 0.55, dur: 0.004, attack: 0.0004 });
      noiseVoice({ dest: d, t: t + 0.001, filter: 'bandpass', freq: 2600 * r, q: 1.4, gain: g * 0.45, dur: 0.009 });

      // 2) 키캡이 바닥을 치는 'thock' — 강하게 감쇠해 음정이 들리지 않는다
      var bt = t + 0.008;
      noiseVoice({ dest: d, t: bt, filter: 'bandpass', freq: 1150 * r, q: 1.5, gain: g * 0.9, dur: 0.02, attack: 0.0006 });
      modalVoice({
        dest: d, t: bt, base: 205 * r, gain: g * 0.75, jitter: 0.02,
        modes: [
          { f: 1.00, d: 0.038, g: 1.00 },
          { f: 1.93, d: 0.022, g: 0.40 },
          { f: 3.41, d: 0.013, g: 0.16 }
        ]
      });
      // 3) 책상으로 전해지는 저역 (30ms만)
      toneVoice({ dest: d, t: bt, freq: 112 * r, freqEnd: 80 * r, type: 'sine', gain: g * 0.5, dur: 0.035, lp: 240 });
    },

    /* 솜·쿠션 — 공기가 눌려 나가는 소리. 어택이 없고 아주 부드럽다 */
    cotton: function (d, D, i, r, t) {
      /* 솜은 **작게 들리는 게 아니라 안 들린다**.
       *
       *  K-가중으로 재면 다른 재질과 1dB 안쪽인데도 노트북·휴대폰 스피커에서는
       *  거의 사라진다. 에너지가 전부 700Hz 아래에 몰려 있었기 때문이다 —
       *  작은 스피커는 그 대역을 통째로 못 낸다. 그래서 게인만 올려도 소용이 없다.
       *  어느 기기에서나 살아남는 중·고역(천 결의 사각거림)을 크게 키우고,
       *  저역 쿵과 사각거림 사이를 메우는 중역 몸통을 하나 더 얹었다.
       */
      var g = 0.158 + 0.195 * i;
      // 1) 눌리는 공기
      noiseVoice({
        dest: d, t: t, filter: 'lowpass', freq: 620 * r, freqEnd: 240 * r,
        q: 0.5, gain: g, dur: 0.20, attack: 0.022
      });
      // 2) 아주 낮고 둔한 몸통
      modalVoice({
        dest: d, t: t, base: 76 * r, gain: g * 0.9, jitter: 0.03,
        modes: [
          { f: 1.00, d: 0.24, g: 1.00, a: 0.014 },
          { f: 1.73, d: 0.14, g: 0.30, a: 0.012 }
        ]
      });
      // 3) 중역 몸통 — 작은 스피커에서 '포옥'을 실제로 들리게 하는 부분
      noiseVoice({
        dest: d, t: t, filter: 'bandpass', freq: 520 * r, freqEnd: 260 * r,
        q: 1.1, gain: g * 0.5, dur: 0.16, attack: 0.012
      });
      // 4) 천 결이 스치는 결 — 대역을 넓히고 알갱이를 늘려 또렷하게
      granular({
        dests: D, t: t + 0.008, count: 16, span: 0.16,
        freq: [1800, 7800], q: 1.6, gain: g * 0.42, grain: [0.006, 0.020], decay: 1.4
      });
    },

    /* 젤리 — 눌리며 피치가 떨어지는 bloop. 비브라토(LFO)는 전자음이 되므로 쓰지 않는다 */
    jelly: function (d, D, i, r, t) {
      var g = 0.048 + 0.062 * i;
      // 1) 말랑한 표면에 닿는 소리 — 아주 부드럽게
      noiseVoice({
        dest: d, t: t, filter: 'lowpass', freq: 1600 * r, freqEnd: 420 * r,
        q: 0.8, gain: g * 0.4, dur: 0.055, attack: 0.004
      });
      // 2) 눌리며 내려가는 본체 — 피치 글라이드가 '젤리다움'의 핵심
      toneVoice({ dest: d, t: t, freq: 300 * r, freqEnd: 98 * r, type: 'sine', gain: g, dur: 0.16, attack: 0.004, lp: 760 });
      toneVoice({ dest: d, t: t, freq: 148 * r, freqEnd: 64 * r, type: 'sine', gain: g * 0.55, dur: 0.2, lp: 320 });
      // 3) 탄성으로 살짝 되돌아온다
      toneVoice({ dest: d, t: t + 0.11, freq: 116 * r, freqEnd: 168 * r, type: 'sine', gain: g * 0.28, dur: 0.14, lp: 480 });
    },

    /* 마른 낙엽 — 순수 그래뉼러. 수십 개의 알갱이가 좌우로 흩어진다 */
    leaf: function (d, D, i, r, t) {
      var g = 0.19 + 0.25 * i;
      granular({
        dests: D, t: t, count: 26, span: 0.22,
        freq: [2400 * r, 9500 * r], q: 4.5, gain: g, grain: [0.005, 0.022], decay: 1.25
      });
      // 잎이 눌리며 나는 낮은 으스러짐
      noiseVoice({ dest: d, t: t, filter: 'lowpass', freq: 900 * r, q: 0.7, gain: g * 0.5, dur: 0.09, attack: 0.004 });
      modalVoice({
        dest: d, t: t, base: 190 * r, gain: g * 0.35, jitter: 0.05,
        modes: [{ f: 1.00, d: 0.07, g: 1.0 }, { f: 2.4, d: 0.04, g: 0.4 }]
      });
    },

    /* 에어캡 — 공명 필터가 순간적으로 울리는 진짜 '뽁' + 비닐 구김 */
    bubble: function (d, D, i, r, t) {
      var g = 0.22 + 0.26 * i;
      // 1) 팝: 좁은 대역이 순간적으로 링잉하며 위로 쓸려 올라간다
      noiseVoice({
        dest: d, t: t, filter: 'bandpass',
        freq: 620 * r, freqEnd: 3100 * r, q: 14, gain: g, dur: 0.022, attack: 0.0005
      });
      toneVoice({ dest: d, t: t, freq: 520 * r, freqEnd: 3400 * r, type: 'sine', gain: g * 0.6, dur: 0.016, attack: 0.0006 });
      // 2) 터진 뒤의 짧은 몸통
      modalVoice({
        dest: d, t: t + 0.004, base: 340 * r, gain: g * 0.4,
        modes: [{ f: 1.00, d: 0.05, g: 1.0 }, { f: 2.16, d: 0.03, g: 0.3 }]
      });
      // 3) 비닐이 구겨지는 결
      granular({
        dests: D, t: t + 0.012, count: 11, span: 0.1,
        freq: [4200, 11000], q: 3.0, gain: g * 0.16, grain: [0.003, 0.012], decay: 1.5
      });
    },

    /* 나무 — 마루판을 밟는 둔탁한 소리. 길게 울리면 목탁이 되므로 90ms 안에 끝낸다 */
    wood: function (d, D, i, r, t) {
      var g = 0.060 + 0.078 * i;
      noiseVoice({ dest: d, t: t, filter: 'bandpass', freq: 1700 * r, q: 1.0, gain: g * 0.7, dur: 0.012, attack: 0.0006 });
      modalVoice({
        dest: d, t: t, base: 132 * r, gain: g, jitter: 0.03,
        modes: [
          { f: 1.00, d: 0.082, g: 1.00 },
          { f: 2.14, d: 0.046, g: 0.34 },
          { f: 3.87, d: 0.024, g: 0.12 }
        ]
      });
      // 판이 함께 울리는 바람 소리
      noiseVoice({ dest: d, t: t + 0.004, filter: 'lowpass', freq: 640 * r, q: 0.6, gain: g * 0.45, dur: 0.055, attack: 0.003 });
    },

    /* 슬라임 — 공명 로우패스가 열렸다 닫히며 나는 젖은 스퀄치.
       모달 비브라토는 전자음이 되므로 쓰지 않는다 */
    slime: function (d, D, i, r, t) {
      var g = 0.068 + 0.090 * i;
      // 1) 눌리며 수분이 밀려나간다 — 공명점이 위로 열린다
      noiseVoice({
        dest: d, t: t, filter: 'lowpass', freq: 320 * r, freqEnd: 2400 * r,
        q: 6, gain: g, dur: 0.085, attack: 0.014
      });
      // 2) 떼면서 다시 닫힌다 — 이 왕복이 '찌걱'을 만든다
      noiseVoice({
        dest: d, t: t + 0.075, filter: 'lowpass', freq: 2200 * r, freqEnd: 380 * r,
        q: 5, gain: g * 0.8, dur: 0.13, attack: 0.022
      });
      // 3) 끈적하게 가라앉는 저역
      toneVoice({ dest: d, t: t, freq: 145 * r, freqEnd: 68 * r, type: 'sine', gain: g * 0.5, dur: 0.17, lp: 300 });
      // 4) 젖은 기포가 드문드문 터진다
      granular({
        dests: D, t: t + 0.03, count: 7, span: 0.15,
        freq: [800, 2800], q: 7, gain: g * 0.25, grain: [0.005, 0.018], decay: 1.3
      });
    },

    /* 워터비즈(구슬볼) — 말랑한 구슬 여러 알이 굴러가며 톡톡 터진다 */
    orbeez: function (d, D, i, r, t) {
      var g = 0.218 + 0.286 * i;
      // 1) 구슬 알들이 서로 부딪히는 소리
      var n = 5 + Math.round(i * 4);
      for (var k = 0; k < n; k++) {
        var at = t + Math.pow(Math.random(), 0.7) * 0.18;
        modalVoice({
          dest: D[k % 3], t: at, base: rnd(420, 980) * r, gain: g * rnd(0.4, 1),
          jitter: 0.03,
          modes: [{ f: 1.00, d: rnd(0.05, 0.11), g: 1.0 }, { f: 2.3, d: 0.03, g: 0.25 }]
        });
      }
      // 2) 한두 알이 터지는 젖은 팝
      for (var p = 0; p < 2; p++) {
        noiseVoice({
          dest: D[p % 3], t: t + rnd(0, 0.1), filter: 'bandpass',
          freq: rnd(700, 1200) * r, freqEnd: rnd(2200, 3200) * r, q: 11,
          gain: g * 0.55, dur: 0.02, attack: 0.0006
        });
      }
      // 3) 물기 있는 바닥
      noiseVoice({ dest: d, t: t, filter: 'lowpass', freq: 700 * r, gain: g * 0.35, dur: 0.1, attack: 0.008 });
    },

    /* 모래 — 사각사각. 알갱이를 따로따로 찍으면 지직거리므로,
       넓은 대역의 연속 노이즈를 바닥에 깔고 굵은 알갱이만 몇 개 얹는다 */
    sand: function (d, D, i, r, t) {
      var g = 0.30 + 0.39 * i;
      // 1) 연속적인 'shhh' — 위쪽이 서서히 닫히며 사그라든다
      noiseVoice({
        dest: d, t: t, filter: 'bandpass', freq: 3400 * r, freqEnd: 1500 * r,
        q: 0.5, gain: g, dur: 0.17, attack: 0.009
      });
      noiseVoice({
        dest: d, t: t + 0.01, filter: 'highpass', freq: 2600 * r,
        gain: g * 0.45, dur: 0.13, attack: 0.014
      });
      // 2) 발밑에서 다져지는 저역
      noiseVoice({
        dest: d, t: t, filter: 'lowpass', freq: 460 * r, q: 0.6,
        gain: g * 0.5, dur: 0.11, attack: 0.01
      });
      // 3) 드문드문 섞이는 굵은 알갱이
      granular({
        dests: D, t: t, count: 9, span: 0.13,
        freq: [2200 * r, 6800 * r], q: 2.4, gain: g * 0.3, grain: [0.004, 0.013], decay: 1.2
      });
    },

    /* 유리구슬 — 길게 남는 맑은 링. 배음이 높고 감쇠가 느리다 */
    glass: function (d, D, i, r, t) {
      var g = 0.111 + 0.142 * i;
      noiseVoice({ dest: d, t: t, filter: 'highpass', freq: 7000, gain: g * 0.9, dur: 0.005, attack: 0.0005 });
      modalVoice({
        dest: d, t: t, base: 880 * r, gain: g, jitter: 0.006,
        modes: [
          { f: 1.00, d: 0.95, g: 1.00 },
          { f: 2.45, d: 0.62, g: 0.36 },
          { f: 4.11, d: 0.34, g: 0.18 },
          { f: 6.83, d: 0.18, g: 0.08 }
        ]
      });
      // 옆 구슬들이 따라 울린다
      for (var k = 0; k < 2; k++) {
        modalVoice({
          dest: D[k * 2], t: t + rnd(0.01, 0.06), base: 880 * r * rnd(1.18, 1.62),
          gain: g * 0.4, jitter: 0.006,
          modes: [{ f: 1.00, d: rnd(0.4, 0.8), g: 1.0 }, { f: 2.45, d: 0.3, g: 0.3 }]
        });
      }
    },

    /* 눈 — 뽀득. 좁은 Q로 처프를 만들면 휘파람이 되므로,
       넓은 대역이 빠르게 끊기며 밀려 올라가게 만든다 */
    snow: function (d, D, i, r, t) {
      var g = 0.42 + 0.55 * i;
      // 1) 발밑에서 눈이 다져진다
      noiseVoice({
        dest: d, t: t, filter: 'lowpass', freq: 760 * r, freqEnd: 300 * r,
        q: 0.7, gain: g * 0.9, dur: 0.15, attack: 0.012
      });
      // 2) 뽀-득 — Q 4.5의 넓은 크리크가 9번 끊기며 올라간다
      squeak({ dest: d, t: t + 0.015, base: 700 * r, rise: 0.8, gain: g * 0.75, count: 9, span: 0.17, q: 4.5 });
      // 3) 눈 알갱이
      granular({
        dests: D, t: t, count: 16, span: 0.15,
        freq: [1100 * r, 4000 * r], q: 1.8, gain: g * 0.4, grain: [0.006, 0.022], decay: 1.3
      });
    },

    /* 물웅덩이 — 수면을 때리는 찰방 + 튀어오르는 물방울.
       물방울은 '위로 쓸려 올라가는' 짧은 톤이다. 내려가면 물이 아니라 방울 떨어지는 소리가 된다 */
    water: function (d, D, i, r, t) {
      var g = 0.253 + 0.321 * i;
      noiseVoice({
        dest: d, t: t, filter: 'bandpass', freq: 2600 * r, freqEnd: 700 * r,
        q: 0.8, gain: g, dur: 0.1, attack: 0.002
      });
      // 물이 밀려나며 생기는 낮은 울림
      toneVoice({ dest: d, t: t, freq: 240 * r, freqEnd: 120 * r, type: 'sine', gain: g * 0.45, dur: 0.12, lp: 420 });
      // 튀어오른 방울들
      for (var k = 0; k < 4; k++) {
        toneVoice({
          dest: D[k % 3], t: t + 0.03 + Math.random() * 0.16,
          freq: rnd(700, 1500) * r, freqEnd: rnd(1900, 3200) * r, type: 'sine',
          gain: g * 0.22, dur: 0.022, attack: 0.001, lp: 5200
        });
      }
      granular({
        dests: D, t: t + 0.01, count: 10, span: 0.12,
        freq: [1800, 6000], q: 3, gain: g * 0.16, grain: [0.004, 0.014], decay: 1.3
      });
    },

    /* 자갈 — 돌 여러 알이 서로 부딪힌다. 모드 감쇠가 짧아야 '돌'이지, 길면 실로폰이 된다 */
    gravel: function (d, D, i, r, t) {
      var g = 0.237 + 0.331 * i;
      var n = 7 + Math.round(i * 5);
      for (var k = 0; k < n; k++) {
        modalVoice({
          dest: D[k % 3], t: t + Math.pow(Math.random(), 0.7) * 0.15,
          base: rnd(320, 760) * r, gain: g * rnd(0.4, 1), jitter: 0.045,
          modes: [{ f: 1.00, d: rnd(0.018, 0.045), g: 1.0 }, { f: 2.74, d: 0.014, g: 0.35 }]
        });
      }
      noiseVoice({ dest: d, t: t, filter: 'bandpass', freq: 1500 * r, q: 0.9, gain: g * 0.7, dur: 0.07, attack: 0.003 });
      granular({
        dests: D, t: t, count: 12, span: 0.14,
        freq: [1200 * r, 5200 * r], q: 2.6, gain: g * 0.28, grain: [0.004, 0.014], decay: 1.2
      });
    },

    /* 쿠키 — 바삭. 마른 과자가 '딱' 하고 쪼개진 뒤 부스러기가 흩어진다.
       쪼개짐(짧고 날카로운 트랜지언트)이 없으면 그냥 모래가 된다 */
    cookie: function (d, D, i, r, t) {
      var g = 0.354 + 0.46 * i;

      // 1) 쪼개지는 순간 — 2ms 짜리 날카로운 딱
      noiseVoice({ dest: d, t: t, filter: 'highpass', freq: 3600, gain: g * 0.9, dur: 0.004, attack: 0.0004 });
      noiseVoice({ dest: d, t: t + 0.001, filter: 'bandpass', freq: 2100 * r, q: 2.2, gain: g * 0.7, dur: 0.012 });

      // 2) 과자 몸통 — 짧게 끊겨야 '마른' 것으로 들린다
      modalVoice({
        dest: d, t: t, base: 430 * r, gain: g * 0.6, jitter: 0.04,
        modes: [{ f: 1.00, d: 0.035, g: 1.0 }, { f: 2.38, d: 0.02, g: 0.4 }, { f: 4.1, d: 0.012, g: 0.15 }]
      });

      // 3) 이어서 부스러지는 결 — 낙엽보다 알갱이가 굵고 성기다
      granular({
        dests: D, t: t + 0.008, count: 16, span: 0.16,
        freq: [1800 * r, 7200 * r], q: 3.4, gain: g * 0.5, grain: [0.004, 0.016], decay: 1.4
      });

      // 4) 발밑으로 전해지는 낮은 둔탁함
      toneVoice({ dest: d, t: t, freq: 148 * r, freqEnd: 92 * r, type: 'sine', gain: g * 0.3, dur: 0.06, lp: 320 });
    },

    /* 양철판 — 탱. 두드린 함석은 **비조화 모드**가 길게 남는다.
       배음을 정수비로 쌓으면 종이 되고, 감쇠를 짧게 하면 깡통이 아니라 나무가 된다 */
    metal: function (d, D, i, r, t) {
      var g = 0.058 + 0.076 * i;

      // 1) 때리는 순간의 쇳소리 — 아주 짧고 밝게
      noiseVoice({ dest: d, t: t, filter: 'highpass', freq: 5200, gain: g * 0.7, dur: 0.005, attack: 0.0004 });
      noiseVoice({ dest: d, t: t + 0.001, filter: 'bandpass', freq: 3200 * r, q: 2.0, gain: g * 0.5, dur: 0.02 });

      // 2) 판이 우는 소리 — 비조화비 + 긴 감쇠가 '금속'의 정체
      modalVoice({
        dest: d, t: t, base: 262 * r, gain: g, jitter: 0.015,
        modes: [
          { f: 1.00, d: 0.58, g: 1.00 },
          { f: 1.72, d: 0.44, g: 0.62 },
          { f: 2.41, d: 0.33, g: 0.40 },
          { f: 3.86, d: 0.21, g: 0.22 },
          { f: 5.31, d: 0.13, g: 0.10 }
        ]
      });

      // 3) 얇은 판이 출렁이며 내는 낮은 울렁임
      toneVoice({ dest: d, t: t, freq: 128 * r, freqEnd: 96 * r, type: 'sine', gain: g * 0.35, dur: 0.18, lp: 300 });

      // 4) 사방으로 번지는 잔향감 — 좌우로 살짝 흩어 준다
      granular({
        dests: D, t: t + 0.02, count: 6, span: 0.2,
        freq: [2600 * r, 7000 * r], q: 6, gain: g * 0.12, grain: [0.006, 0.02], decay: 1.1
      });
    },

    /* 종이 — 낙엽과 같은 그래뉼러지만 알갱이가 잘다.
       12kHz 까지 올렸더니 거의 들리지 않았다. 낙엽보다 조금만 높게 잡는다 */
    paper: function (d, D, i, r, t) {
      var g = 0.597 + 0.781 * i;
      granular({
        dests: D, t: t, count: 24, span: 0.19,
        freq: [2800 * r, 9500 * r], q: 3.2, gain: g, grain: [0.003, 0.014], decay: 1.35
      });
      noiseVoice({ dest: d, t: t, filter: 'bandpass', freq: 1600 * r, q: 0.8, gain: g * 0.4, dur: 0.08, attack: 0.005 });
      noiseVoice({ dest: d, t: t, filter: 'lowpass', freq: 700 * r, q: 0.6, gain: g * 0.45, dur: 0.07, attack: 0.006 });
      modalVoice({ dest: d, t: t, base: 150 * r, gain: g * 0.3, jitter: 0.05, modes: [{ f: 1.0, d: 0.05, g: 1.0 }] });
    },

    /* 얼음 — 쩍 갈라지고, 균열이 판 아래로 번진다 */
    ice: function (d, D, i, r, t) {
      var g = 0.197 + 0.269 * i;
      noiseVoice({ dest: d, t: t, filter: 'highpass', freq: 5200, gain: g * 0.8, dur: 0.006, attack: 0.0004 });
      modalVoice({
        dest: d, t: t, base: 620 * r, gain: g, jitter: 0.02,
        modes: [
          { f: 1.00, d: 0.22, g: 1.00 },
          { f: 2.71, d: 0.12, g: 0.34 },
          { f: 4.33, d: 0.06, g: 0.14 }
        ]
      });
      // 번지는 균열 — 아래로 훑는 좁은 대역
      noiseVoice({
        dest: d, t: t + 0.01, filter: 'bandpass', freq: 2400 * r, freqEnd: 600 * r,
        q: 5, gain: g * 0.5, dur: 0.12, attack: 0.003
      });
      granular({
        dests: D, t: t + 0.01, count: 9, span: 0.12,
        freq: [2600, 9000], q: 4, gain: g * 0.2, grain: [0.003, 0.012], decay: 1.2
      });
    },

    /* 스펀지 — 공기를 머금었다 내뱉는 뽀드득 */
    sponge: function (d, D, i, r, t) {
      var g = 0.119 + 0.157 * i;
      squeak({ dest: d, t: t + 0.01, base: 900 * r, rise: 1.4, gain: g, count: 5, span: 0.12, q: 20 });
      noiseVoice({
        dest: d, t: t, filter: 'lowpass', freq: 900 * r, freqEnd: 320 * r,
        q: 0.7, gain: g * 0.8, dur: 0.15, attack: 0.018
      });
      modalVoice({
        dest: d, t: t, base: 92 * r, gain: g * 0.7, jitter: 0.03,
        modes: [{ f: 1.00, d: 0.2, g: 1.0, a: 0.012 }, { f: 1.9, d: 0.11, g: 0.25 }]
      });
    }
  };

  /* =========================================================
   *  공개 API — 발소리 / 착지음
   * ======================================================= */

  /**
   * @param {string} mat 재질 키
   * @param {object} o   {intensity:0~1, pan:-1~1, depth:0~1, stomp:boolean}
   */
  function step(mat, o) {
    if (!ready || muted) return;
    o = o || {};
    var i = Math.max(0, Math.min(1, (o.intensity == null ? 0.5 : o.intensity)));
    var stomp = !!o.stomp;
    if (stomp) i = Math.min(1, i * 1.3 + 0.25);

    // 휴머나이즈 — 매번 피치가 아주 조금 달라진다
    var rate = (0.9 + i * 0.3) * (stomp ? 0.84 : 1) * rnd(0.97, 1.03);
    var pan = o.pan || 0, depth = o.depth || 0;
    var d = spatial(pan, depth, stomp ? 0.42 : 0.26);
    var D = spatialTrio(pan, depth, stomp ? 0.42 : 0.26, 0.3);
    var t = ctx.currentTime + 0.001;

    var key = 'step_' + mat + (stomp ? '_stomp' : '');
    if (!samples[key] && stomp) key = 'step_' + mat;
    if (samples[key]) {
      playSample(key, d, t, rate, (0.55 + 0.45 * i) * (stomp ? 1.25 : 1));
      if (stomp) toneVoice({ dest: d, t: t, freq: 72, freqEnd: 40, type: 'sine', gain: 0.2, dur: 0.26, lp: 260 });
      return;
    }

    (MATERIAL[mat] || MATERIAL.wood)(d, D, i, rate, t);

    if (stomp) {
      // 강하게 내려찍을 때의 저역 임팩트
      toneVoice({ dest: d, t: t, freq: 72, freqEnd: 40, type: 'sine', gain: 0.2, dur: 0.26, lp: 260 });
      noiseVoice({ dest: d, t: t, filter: 'lowpass', freq: 380, gain: 0.1, dur: 0.15, attack: 0.004 });
    }
  }

  /** 도약할 때의 짧은 휘익 소리 */
  function whoosh(power, pan) {
    if (!ready || muted) return;
    var d = spatial(pan || 0, 0.25, 0.18);
    var t = ctx.currentTime + 0.001;
    var big = power > 1;
    if (samples['hop_whoosh']) { playSample('hop_whoosh', d, t, big ? 0.82 : 1, big ? 1 : 0.7); return; }
    noiseVoice({
      dest: d, t: t, filter: 'bandpass',
      freq: big ? 640 : 1000, freqEnd: big ? 2100 : 2900, q: 1.1,
      gain: big ? 0.07 : 0.042, dur: big ? 0.24 : 0.16, attack: 0.055
    });
    // 옷깃이 스치는 미세한 결
    noiseVoice({ dest: d, t: t + 0.02, filter: 'highpass', freq: 7000, gain: 0.018, dur: 0.1, attack: 0.03 });
  }

  /* =========================================================
   *  파괴 단계음
   * ======================================================= */

  /**
   * 소모성 타일에 금이 갈 때. 단계가 올라갈수록 밝고 날카로워진다.
   * @param {string} mat 재질  @param {number} stage 1..total  @param {number} total
   */
  function crack(mat, stage, total, o) {
    if (!ready || muted) return;
    o = o || {};
    var pan = o.pan || 0, depth = o.depth || 0;
    var d = spatial(pan, depth, 0.3);
    var D = spatialTrio(pan, depth, 0.3, 0.34);
    var t = ctx.currentTime + 0.001;
    var prog = total ? stage / total : 1;
    var rate = (0.94 + prog * 0.45) * rnd(0.97, 1.03);

    var key = 'crack_' + mat;
    if (samples[key]) { playSample(key, d, t, rate, 0.6 + prog * 0.4); return; }

    // 재질의 밟는 소리가 먼저 들려야 소리 도감과 같은 재질로 인식된다.
    // 균열음은 그 위에 얹는 덧소리일 뿐이다.
    var layered = false;
    if (samples['step_' + mat]) {
      playSample('step_' + mat, d, t, rate, 0.85 + prog * 0.25);
      layered = true;
    } else {
      (MATERIAL[mat] || MATERIAL.wood)(d, D, 0.45 + prog * 0.3, rate, t);
    }
    var cg = layered ? 0.45 : 1;

    if (mat === 'bubble') {
      // 알이 하나씩 터진다 — 단계가 올라갈수록 더 높고 짧게
      noiseVoice({
        dest: d, t: t, filter: 'bandpass',
        freq: 600 * rate, freqEnd: 3000 * rate, q: 15, gain: 0.15 * cg, dur: 0.02, attack: 0.0005
      });
      toneVoice({ dest: d, t: t, freq: 480 * rate, freqEnd: 3200 * rate, type: 'sine', gain: 0.08 * cg, dur: 0.014, attack: 0.0006 });
      granular({ dests: D, t: t + 0.01, count: 7, span: 0.08, freq: [4500, 11500], q: 3, gain: 0.05 * cg, grain: [0.003, 0.01] });
    } else {
      // 마른 것이 갈라진다 — 균열이 번지는 그래뉼러
      granular({
        dests: D, t: t, count: 14 + Math.round(prog * 10), span: 0.16,
        freq: [2200 * rate, 9000 * rate], q: 5, gain: (0.19 + prog * 0.11) * cg,
        grain: [0.004, 0.018], decay: 1.0
      });
      modalVoice({
        dest: d, t: t, base: 170 * rate, gain: 0.1 * cg, jitter: 0.06,
        modes: [{ f: 1.0, d: 0.06, g: 1.0 }, { f: 2.7, d: 0.035, g: 0.4 }]
      });
    }
  }

  /** 완전히 부서질 때 */
  function shatter(mat, o) {
    if (!ready || muted) return;
    o = o || {};
    var pan = o.pan || 0, depth = o.depth || 0;
    var d = spatial(pan, depth, 0.45);
    var D = spatialTrio(pan, depth, 0.45, 0.42);
    var t = ctx.currentTime + 0.001;

    var key = 'shatter_' + mat;
    if (samples[key]) { playSample(key, d, t, 1, 1); return; }

    var sg = 1;
    if (samples['step_' + mat]) {
      playSample('step_' + mat, d, t, 0.92, 0.9);
      sg = 0.5;
    } else {
      (MATERIAL[mat] || MATERIAL.wood)(d, D, 1, 1.05, t);
    }

    if (mat === 'bubble') {
      // 남은 알들이 연쇄로 터진다
      for (var k = 0; k < 6; k++) {
        var pt = t + 0.01 + Math.random() * 0.22;
        noiseVoice({
          dest: D[k % 3], t: pt, filter: 'bandpass',
          freq: rnd(550, 900), freqEnd: rnd(2600, 3600), q: 13, gain: 0.1 * sg, dur: 0.02, attack: 0.0005
        });
      }
    }
    granular({
      dests: D, t: t + 0.005, count: 30, span: 0.34,
      freq: [2000, 11000], q: 4, gain: 0.055 * sg, grain: [0.004, 0.024], decay: 1.4
    });
    toneVoice({ dest: d, t: t, freq: 108, freqEnd: 62, type: 'sine', gain: 0.09 * sg, dur: 0.2, lp: 300 });
  }

  /** 이미 부서진 자리를 밟았을 때의 공허한 울림 */
  function hollow(o) {
    if (!ready || muted) return;
    o = o || {};
    var d = spatial(o.pan || 0, 0.3, 0.5);
    var t = ctx.currentTime + 0.001;
    noiseVoice({ dest: d, t: t, filter: 'lowpass', freq: 320, gain: 0.05, dur: 0.13, attack: 0.01 });
    modalVoice({
      dest: d, t: t, base: 84, gain: 0.05,
      modes: [{ f: 1.0, d: 0.22, g: 1.0, a: 0.008 }, { f: 1.9, d: 0.12, g: 0.25 }]
    });
  }

  /* =========================================================
   *  퀴즈 피드백
   * ======================================================= */

  /** 오답 — 둔탁하지만 불쾌하지 않게 */
  function wrong(o) {
    if (!ready || muted) return;
    o = o || {};
    var d = spatial(o.pan || 0, 0.2, 0.12);
    var t = ctx.currentTime + 0.001;
    if (samples['quiz_wrong']) { playSample('quiz_wrong', d, t, 1, 1); return; }

    noiseVoice({ dest: d, t: t, filter: 'lowpass', freq: 420, gain: 0.085, dur: 0.16, attack: 0.006 });
    modalVoice({
      dest: d, t: t, base: 98, gain: 0.13, jitter: 0.02,
      modes: [
        { f: 1.00, d: 0.3, g: 1.00, a: 0.004 },
        { f: 1.41, d: 0.18, g: 0.32 },
        { f: 2.13, d: 0.09, g: 0.12 }
      ]
    });
    toneVoice({ dest: d, t: t + 0.03, freq: 92, freqEnd: 58, type: 'sine', gain: 0.07, dur: 0.28, lp: 220 });
  }

  /** 새 문제 등장 */
  function newQuiz() {
    if (!ready || muted) return;
    var d = spatial(0, 0.3, 0.5), t = ctx.currentTime + 0.001;
    modalVoice({
      dest: d, t: t, base: 880, gain: 0.09,
      modes: [{ f: 1.0, d: 0.5, g: 1.0 }, { f: 2.76, d: 0.25, g: 0.2 }]
    });
    modalVoice({
      dest: d, t: t + 0.1, base: 1318.51, gain: 0.08,
      modes: [{ f: 1.0, d: 0.6, g: 1.0 }, { f: 2.76, d: 0.3, g: 0.2 }]
    });
  }

  /** UI 클릭 */
  function ui() {
    if (!ready || muted) return;
    var d = spatial(0, 0.4, 0.1), t = ctx.currentTime + 0.001;
    noiseVoice({ dest: d, t: t, filter: 'bandpass', freq: 2800, q: 2.5, gain: 0.06, dur: 0.02, attack: 0.0008 });
    modalVoice({ dest: d, t: t, base: 620, gain: 0.05, modes: [{ f: 1.0, d: 0.06, g: 1.0 }] });
  }

  /* =========================================================
   *  샘플 에셋 오버라이드
   * ======================================================= */
  /** 같은 변형이 연달아 나오지 않게 고른다 — 반복되면 곧바로 '녹음 재생'처럼 들린다 */
  function pickVariant(key) {
    var list = samples[key];
    if (list.length === 1) return list[0];
    var i = Math.floor(Math.random() * list.length);
    if (i === lastVariant[key]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    lastVariant[key] = i;
    return list[i];
  }

  function playSample(key, dest, t, rate, gain) {
    var src = ctx.createBufferSource();
    src.buffer = pickVariant(key);
    src.playbackRate.value = rate || 1;
    var g = ctx.createGain();
    g.gain.value = (gain == null ? 1 : gain) * (sampleGain[key] || 1);
    src.connect(g); g.connect(dest);
    src.start(t);
  }

  /**
   * 실제 녹음 에셋으로 절차적 사운드를 대체한다.
   * 값에 배열을 주면 그 키의 '변형'이 되어 재생할 때마다 번갈아 쓰인다.
   * { files: [...], gain: 1.4 } 형태로 주면 그 키에만 게인을 더 건다 —
   * 녹음마다 체감 음량이 달라서 재질끼리 맞추려면 이 보정이 필요하다.
   * @param {Object} map { "step_keycap": ["a.wav", "b.wav"], "step_wood": { files: "w.wav", gain: 0.5 } }
   * @returns {Promise<string[]>} 로드에 성공한 키 목록
   */
  function registerSampleMap(map) {
    if (!ctx) init();
    var keys = Object.keys(map || {});
    return Promise.all(keys.map(function (k) {
      var v = map[k];
      if (v && v.files) { sampleGain[k] = v.gain == null ? 1 : v.gain; v = v.files; }
      var urls = [].concat(v);
      return Promise.all(urls.map(function (u) {
        return fetch(u)
          .then(function (r) { if (!r.ok) throw new Error('404'); return r.arrayBuffer(); })
          .then(function (ab) { return ctx.decodeAudioData(ab); })
          .catch(function () { return null; });
      })).then(function (bufs) {
        bufs = bufs.filter(Boolean);
        if (!bufs.length) return null;
        samples[k] = bufs;
        return k + (bufs.length > 1 ? '×' + bufs.length : '');
      });
    })).then(function (r) { return r.filter(Boolean); });
  }

  /** 현재 출력 레벨(0~1) — 캐릭터 오라·타일 발광 등 시각 효과를 소리에 묶는다 */
  function getLevel() {
    if (!analyser || muted) { smoothLevel *= 0.85; return smoothLevel; }
    analyser.getByteTimeDomainData(levelBuf);
    var sum = 0;
    for (var i = 0; i < levelBuf.length; i += 2) {
      var v = (levelBuf[i] - 128) / 128;
      sum += v * v;
    }
    var rms = Math.sqrt(sum / (levelBuf.length / 2));
    var lv = Math.min(1, rms * 4.5);
    smoothLevel = lv > smoothLevel ? lv : smoothLevel * 0.88 + lv * 0.12;
    return smoothLevel;
  }

  /* =========================================================
   *  체감 음량 측정 (개발용)
   *
   *  getLevel() 은 화면 연출용 **피크** 미터다. 피크는 트랜지언트를 과대평가해서,
   *  '탁' 하고 끝나는 나무 소리를 실제보다 크다고 읽는다. 이 미터로 음량 밸런스를
   *  맞추면 실제로는 10dB 이상 어긋난 채로 "맞췄다"고 착각하게 된다 — 실제로 그랬다.
   *
   *  그래서 밸런스 조율에는 방송 표준 BS.1770 의 **K-가중** 라우드니스를 쓴다.
   *  고역 셸빙(+4dB @1.68kHz) → 하이패스(38Hz) 를 거친 뒤 평균 전력을 재는 것으로,
   *  오프라인 도구(`tools/prep-steps.py`)가 wav 파일에 쓰는 잣대와 같다.
   * ======================================================= */
  var kAnalyser = null, kBuf = null;

  function kMeter() {
    if (kAnalyser) return kAnalyser;
    var hs = ctx.createBiquadFilter();
    hs.type = 'highshelf'; hs.frequency.value = 1681.97; hs.gain.value = 4;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 38.14; hp.Q.value = 0.5;
    kAnalyser = ctx.createAnalyser();
    kAnalyser.fftSize = 2048;
    kAnalyser.smoothingTimeConstant = 0;
    master.connect(hs); hs.connect(hp); hp.connect(kAnalyser);
    kBuf = new Float32Array(kAnalyser.fftSize);
    return kAnalyser;
  }

  /**
   * 재질 하나를 여러 번 울려 K-가중 라우드니스를 잰다.
   * 절대값 자체는 의미가 없고 **재질끼리 비교**하는 데 쓴다.
   * @returns {Promise<number>}
   */
  function loudness(mat, o) {
    o = o || {};
    // win = 적분 창(온셋 기준). 250ms 는 짧은 타격음의 청각 적분 시간이고,
    // tools/prep-steps.py 가 wav 를 재는 창과 같아야 두 수치를 비교할 수 있다.
    var reps = o.reps || 5, win = o.win || 250, span = o.span || 620, gap = o.gap || 300;
    var step_ms = 8;
    if (!ready) init();
    var an = kMeter();
    var runs = [];

    function once() {
      return new Promise(function (done) {
        var pow = [];
        preview(mat);
        var t0 = performance.now();
        (function poll() {
          an.getFloatTimeDomainData(kBuf);
          var s = 0;
          for (var i = 0; i < kBuf.length; i++) s += kBuf[i] * kBuf[i];
          pow.push(s / kBuf.length);
          if (performance.now() - t0 < span) { setTimeout(poll, step_ms); return; }

          // 트리거 시점이 아니라 **소리가 실제로 시작한 지점**부터 잰다.
          // 앞의 무음까지 창에 넣으면 짧은 소리(키캡)만 부당하게 작게 읽힌다.
          var mx = 0, k;
          for (k = 0; k < pow.length; k++) if (pow[k] > mx) mx = pow[k];
          var start = 0;
          for (k = 0; k < pow.length; k++) { if (pow[k] > mx * 0.02) { start = k; break; } }
          var n = Math.max(1, Math.round(win / step_ms)), sum = 0, cnt = 0;
          for (k = start; k < Math.min(pow.length, start + n); k++) { sum += pow[k]; cnt++; }
          runs.push(Math.sqrt(sum / Math.max(1, cnt)));
          setTimeout(done, gap);
        })();
      });
    }

    var chain = Promise.resolve();
    for (var k = 0; k < reps; k++) chain = chain.then(once);
    return chain.then(function () {
      runs.sort(function (a, b) { return a - b; });
      return runs[Math.floor(runs.length / 2)];      // 중앙값 — 휴머나이즈 흔들림에 강하다
    });
  }

  /** 마스터 출력의 순간 피크(0~1). 헤드룸이 얼마나 남았는지 볼 때 쓴다. */
  var peakBuf = null;
  function peak() {
    if (!analyser) return 0;
    if (!peakBuf) peakBuf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(peakBuf);
    var p = 0;
    for (var i = 0; i < peakBuf.length; i++) {
      var v = peakBuf[i] < 0 ? -peakBuf[i] : peakBuf[i];
      if (v > p) p = v;
    }
    return p;
  }

  /** 12종을 모두 재서 큰 것부터 표로 돌려준다. 콘솔에서 바로 쓰라고 만든 것. */
  function loudnessTable(o) {
    var mats = Object.keys(MATERIAL), out = [];
    var chain = Promise.resolve();
    mats.forEach(function (m) {
      chain = chain.then(function () {
        return loudness(m, o).then(function (v) { out.push({ mat: m, loudness: v }); });
      });
    });
    return chain.then(function () {
      out.sort(function (a, b) { return b.loudness - a.loudness; });
      var top = out[0].loudness, bot = out[out.length - 1].loudness;
      out.forEach(function (r) {
        r.LU = Math.round(20 * Math.log10(r.loudness / top) * 10) / 10;  // 가장 큰 것 대비
        r.suggest = Math.round(top / r.loudness * 1000) / 1000;          // 맞추려면 곱할 값
      });
      out.spreadDb = Math.round(20 * Math.log10(top / bot) * 10) / 10;
      return out;
    });
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
    return muted;
  }
  function isMuted() { return muted; }

  /** 재질 미리듣기 — 메뉴의 '소리 도감'에서 사용 */
  function preview(mat) {
    if (!ready) init();
    step(mat, { intensity: 0.75, pan: 0, depth: 0 });
  }

  return {
    init: init,
    step: step,
    preview: preview,
    whoosh: whoosh,
    crack: crack,
    shatter: shatter,
    hollow: hollow,
    getLevel: getLevel,
    loudness: loudness,
    loudnessTable: loudnessTable,
    peak: peak,
    wrong: wrong,
    newQuiz: newQuiz,
    ui: ui,
    registerSampleMap: registerSampleMap,
    setMuted: setMuted,
    isMuted: isMuted,
    materials: Object.keys(MATERIAL)
  };
})();
