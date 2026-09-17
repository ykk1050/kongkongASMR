/* =============================================================
 *  소리 콩콩 — 부트스트랩
 * ============================================================= */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  var refs = {
    hud: $('hud'),
    prompt: $('prompt'),
    slots: $('slots'),
    hint: $('hint'),
    subjectBadge: $('subjectBadge'),
    topicBadge: $('topicBadge'),
    scoreVal: $('scoreVal'),
    comboVal: $('comboVal'),
    loadNote: $('loadNote')
  };

  SK.Game.boot($('game'), refs);

  /* ---------- 메뉴 열고 닫기 ---------- */
  var menu = $('menuPanel'), btnMenu = $('btnMenu');
  function setMenu(open) {
    menu.hidden = !open;
    btnMenu.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btnMenu.addEventListener('click', function (e) {
    e.stopPropagation();
    SK.Audio.ui();
    setMenu(menu.hidden);
  });
  document.addEventListener('pointerdown', function (e) {
    if (menu.hidden) return;
    if (menu.contains(e.target) || btnMenu.contains(e.target)) return;
    setMenu(false);
  });

  /* ---------- 과목 필터 ---------- */
  var subjectBtns = Array.prototype.slice.call(document.querySelectorAll('[data-subject]'));
  function setActive(f) {
    subjectBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.subject === f); });
  }
  subjectBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      SK.Audio.ui();
      setActive(b.dataset.subject);
      SK.Game.setSubject(b.dataset.subject);
      setMenu(false);
    });
  });
  setActive('all');

  /* ---------- 다음 문제 / 소리 / 조이스틱 ---------- */
  $('btnSkip').addEventListener('click', function () {
    SK.Audio.ui(); SK.Game.skip(); setMenu(false);
  });

  var btnMute = $('btnMute');
  btnMute.addEventListener('click', function () {
    var m = SK.Audio.setMuted(!SK.Audio.isMuted());
    btnMute.textContent = m ? '🔇 소리 켜기' : '🔊 소리 끄기';
  });

  // 조이스틱 표시 여부 — 터치 기기는 기본 켜짐, 마우스 전용 기기는 기본 꺼짐
  var touchCapable = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  var padsOn = touchCapable;
  var btnPads = $('btnPads');
  function applyPads() {
    document.body.classList.toggle('no-pads', !padsOn);
    btnPads.textContent = padsOn ? '🎮 조이스틱 끄기' : '🎮 조이스틱 켜기';
    SK.Game.relayout();      // 컨트롤이 사라지면 보드를 더 크게 그린다
  }
  btnPads.addEventListener('click', function () { SK.Audio.ui(); padsOn = !padsOn; applyPads(); });


  /* 입력 진단 — 키가 브라우저에 실제로 도착하는지 보여 준다 */
  var btnDiag = $('btnDiag');
  btnDiag.addEventListener('click', function () {
    SK.Audio.ui();
    var on = SK.Game.setDiag(!SK.Game.isDiag());
    btnDiag.textContent = on ? '🧪 입력 진단 — 켜짐' : '🧪 입력 진단';
    btnDiag.classList.toggle('active', on);
  });
  applyPads();

  // 포인터를 처음 쓰는 방식에 맞춰 자동 전환(패드에 키보드를 붙였을 때 등)
  window.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' && !padsOn) { padsOn = true; applyPads(); }
  }, { once: false });

  /* ---------- 소리 도감 ---------- */
  // 타일 그림과 소리를 나란히 보여 주고, 눌러서 미리 들을 수 있게 한다.
  (function buildLegend() {
    var list = $('legendList');
    if (!list) return;
    // 탄성 재질 먼저, 부서지는 재질을 뒤에 — 목록은 MATERIALS 에서 자동으로 만든다
    var keys = Object.keys(SK.Tiles.MATERIALS);
    var order = keys.filter(function (k) { return !SK.Tiles.MATERIALS[k].durability; })
      .concat(keys.filter(function (k) { return SK.Tiles.MATERIALS[k].durability; }));
    order.forEach(function (key) {
      var m = SK.Tiles.MATERIALS[key];
      if (!m) return;
      var btn = document.createElement('button');
      btn.className = 'legend-item';
      btn.type = 'button';

      var cv = document.createElement('canvas');
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = 34 * dpr; cv.height = 26 * dpr;
      var c = cv.getContext('2d');
      c.scale(dpr, dpr);
      SK.Tiles.drawIcon(c, key, 34, 26);

      var name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = m.label;

      var sound = document.createElement('span');
      sound.className = 'legend-sound';
      sound.textContent = m.sound;

      var hits = document.createElement('span');
      hits.className = 'legend-hits';
      hits.textContent = m.durability ? (m.durability + '번째에 사라짐') : '눌렸다 복원';

      btn.appendChild(cv);
      btn.appendChild(name);
      btn.appendChild(sound);
      btn.appendChild(hits);
      btn.addEventListener('click', function () { SK.Audio.preview(key); });
      list.appendChild(btn);
    });
  })();

  /* ---------- 시작 (사용자 제스처로 AudioContext 잠금 해제) ---------- */
  var overlay = $('startOverlay');
  $('btnStart').addEventListener('click', function () {
    SK.Audio.init();
    SK.Audio.ui();
    overlay.classList.add('hidden');
    SK.Game.relayout();
    loadAudioManifest();
  });

  /** 오디오 에셋 매니페스트 (docs/AUDIO_MAPPING.md 참고) */
  function loadAudioManifest() {
    if (typeof fetch !== 'function') return;
    fetch('assets/audio/manifest.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        var map = m && m.samples;
        if (!map || !Object.keys(map).length) return null;
        var base = m.basePath || 'assets/audio/';
        var resolved = {};
        Object.keys(map).forEach(function (k) {
          var e = map[k], gain = null;
          if (e && e.files) { gain = e.gain; e = e.files; }
          var files = [].concat(e).map(function (u) {
            return /^(https?:|\/|assets\/)/.test(u) ? u : base + u;
          });
          resolved[k] = gain == null ? files : { files: files, gain: gain };
        });
        return SK.Audio.registerSampleMap(resolved);
      })
      .then(function (loaded) {
        if (loaded && loaded.length && window.console) {
          console.info('[audio] 샘플 에셋 적용:', loaded.join(', '));
        }
      })
      .catch(function () { /* 매니페스트 없음 — 절차적 합성 사용 */ });
  }

  /* ---------- 퀴즈 데이터 로드 ---------- */
  SK.Quiz.load('data/quizzes.json').then(function (res) {
    SK.Game.startWith(res.quizzes, res.source);
  }).catch(function (e) {
    refs.prompt.textContent = '문제 데이터를 불러오지 못했습니다.';
    refs.hint.textContent = String((e && e.message) || e);
    if (window.console) console.error(e);
  });
})();
