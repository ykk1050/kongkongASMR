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
    hearts: $('hearts'),
    timeVal: $('timeVal'),
    overPanel: $('overPanel'),
    overScore: $('overScore'),
    overTime: $('overTime'),
    overSolved: $('overSolved'),
    overRate: $('overRate'),
    overAccuracy: $('overAccuracy'),
    overCombo: $('overCombo'),
    loadNote: $('loadNote'),
    // 게임 오버가 나면 게임 코어가 이 함수로 한 판의 기록을 넘겨준다
    onGameOver: function (rec, auth) { showRankForm(rec, auth); }
  };

  SK.Game.boot($('game'), refs);

  /* ---------- 게임 오버 → 다시 시작 ---------- */
  $('btnRestart').addEventListener('click', function () {
    SK.Audio.ui();
    rankForm.hidden = true;
    SK.Game.restart();
  });

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

  /* ---------- 시작 (사용자 제스처로 AudioContext 잠금 해제) ----------
   *
   *  하던 판이 남아 있으면 게임은 이미 그 판을 되살린 채로 이 화면 뒤에 떠 있다.
   *  그래서 여기서는 "그대로 이어갈지, 버리고 새로 시작할지"만 고르면 된다. */
  var overlay = $('startOverlay');
  var btnStart = $('btnStart'), btnFresh = $('btnFresh');

  function enterGame() {
    SK.Audio.init();
    SK.Audio.ui();
    overlay.classList.add('hidden');
    SK.Game.relayout();
    loadAudioManifest();
  }

  btnStart.addEventListener('click', enterGame);
  btnFresh.addEventListener('click', function () {
    SK.Game.fresh();          // 저장을 지우고 처음부터
    enterGame();
  });

  /** 퀴즈가 다 실려 판이 정해진 뒤에 부른다 */
  function refreshResumeUi() {
    var can = SK.Game.canResume && SK.Game.canResume();
    var line = $('resumeLine'), info = $('resumeInfo');
    if (line) line.hidden = !can;
    if (can && info) info.textContent = SK.Save.summary();
    btnStart.textContent = can ? '이어서 산책하기' : '산책 시작하기';
    btnFresh.hidden = !can;
  }

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


  /* =========================================================
   *  랭킹 — 등록 화면
   *
   *  닉네임은 누구나 보는 목록에 그대로 올라간다. 그래서 두 겹으로 막는다.
   *    · 기계가 알아볼 수 있는 것(이메일·전화·주민번호·학년반번호)은 검사에서 걸러내고
   *    · 나머지는 안내문과 확인 체크로 본인이 한 번 더 확인하게 한다
   *  둘 다 통과해야 등록 버튼이 켜진다.
   * ======================================================= */
  var NICK_KEY = 'sk.nick.v1';
  var pendingRec = null, pendingAuth = null, submitting = false;

  var rankForm = $('rankForm'), nickInput = $('nickInput'), nickAgree = $('nickAgree');
  var btnRankSubmit = $('btnRankSubmit'), rankMsg = $('rankMsg');

  /* 화면이 열릴 때 걸어 두는 안내 — 입력 검사가 지우지 않고 되돌려 놓는다 */
  var standingMsg = '', standingKind = '';

  function setMsg(text, kind) {
    rankMsg.textContent = text || '';
    rankMsg.className = 'rank-msg' + (kind ? ' ' + kind : '');
  }

  function setStanding(text, kind) {
    standingMsg = text || ''; standingKind = kind || '';
    setMsg(standingMsg, standingKind);
  }

  function syncSubmitBtn() {
    var v = SK.Ranking.validateNick(nickInput.value);
    btnRankSubmit.disabled = submitting || !v.ok || !nickAgree.checked;
    if (!nickInput.value.trim()) { setMsg(standingMsg, standingKind); return; }
    if (!v.ok) setMsg(v.reason, 'bad');
    else if (!nickAgree.checked) setMsg('아래 확인란에 체크해 주세요.', '');
    else setMsg(standingMsg, standingKind);
  }

  nickInput.addEventListener('input', syncSubmitBtn);
  nickAgree.addEventListener('change', syncSubmitBtn);

  function showRankForm(rec, auth) {
    pendingRec = rec; pendingAuth = auth; submitting = false;
    rankForm.hidden = false;
    nickAgree.checked = false;
    try { nickInput.value = localStorage.getItem(NICK_KEY) || ''; } catch (e) { nickInput.value = ''; }
    btnRankSubmit.textContent = '랭킹 등록';
    if (rec.tainted) {
      setStanding('개발자 도구로 판을 조작한 기록이라 랭킹에는 올리지 않고 이 기기에만 저장돼요.', 'bad');
    } else if (!SK.Ranking.isConfigured()) {
      setStanding('랭킹 서버가 아직 설정되지 않았어요. 기록은 이 기기에 저장됩니다.', '');
    } else {
      setStanding('');
    }
    syncSubmitBtn();
  }

  rankForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting || !pendingRec) return;
    var v = SK.Ranking.validateNick(nickInput.value);
    if (!v.ok) { setMsg(v.reason, 'bad'); return; }
    if (!nickAgree.checked) { setMsg('아래 확인란에 체크해 주세요.', 'bad'); return; }

    submitting = true;
    btnRankSubmit.disabled = true;
    btnRankSubmit.textContent = '등록하는 중…';
    setMsg('기록을 보내는 중이에요…', '');
    try { localStorage.setItem(NICK_KEY, v.value); } catch (e2) { /* 기억하지 못해도 그만 */ }

    var rec = {};
    for (var k in pendingRec) rec[k] = pendingRec[k];
    rec.nick = v.value;

    SK.Ranking.submit(rec, pendingAuth).then(function (res) {
      submitting = false;
      btnRankSubmit.textContent = '등록 완료';
      if (res.ok && res.stored === 'sheet') {
        setMsg(res.rank ? ('랭킹에 올랐어요 — 점수 ' + res.rank + '위!') : '랭킹에 올렸어요!', 'good');
      } else {
        setMsg(res.reason || '이 기기에 저장했어요.', res.ok ? '' : 'bad');
      }
      openRank(v.value);
    });
  });

  $('btnRankSkip').addEventListener('click', function () {
    SK.Audio.ui();
    rankForm.hidden = true;
  });

  /* =========================================================
   *  랭킹 — 순위표
   * ======================================================= */
  /* 랭킹 화면은 두 단으로 고른다 — 위에서 **단원**, 아래에서 **지표**.
     조건이 열 가지를 넘어가므로 한 줄에 다 늘어놓으면 고를 수가 없다.
     점수·시도 문제는 단원별로 나누지 않으므로, 단원을 고르면 지표 줄이
     맞힌 문제·정답률 둘로 줄어든다. */
  var rankPanel = $('rankPanel'), rankList = $('rankList'), rankNote = $('rankNote');
  var rankTabs = $('rankTabs'), rankTopics = $('rankTopics');
  var btnRankOrder = $('btnRankOrder'), rankQuery = $('rankQuery');
  var rankTopic = '', rankMetric = 'score', rankOrder = 'desc', rankMe = '', rankSeq = 0;

  function currentCat() { return SK.Ranking.catKey(rankMetric, rankTopic); }

  function tabButton(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', function () { SK.Audio.ui(); onClick(); });
    return b;
  }

  /** 문제집에 실제로 들어 있는 단원으로 위쪽 줄을 만든다 */
  function buildTopicTabs() {
    rankTopics.innerHTML = '';
    var list = [''].concat((SK.Game.getTopics && SK.Game.getTopics()) || []);
    list.forEach(function (t) {
      var b = tabButton(t || '전체 단원', function () {
        rankTopic = t;
        // 단원을 고르면 점수·시도 지표는 사라진다 — 없어진 지표에 머물지 않게
        var ok = SK.Ranking.metricsFor(rankTopic).some(function (m) { return m.key === rankMetric; });
        if (!ok) rankMetric = 'solved';
        rankQuery.value = '';
        buildMetricTabs();
        syncTabs();
        loadBoard();
      });
      b.dataset.topic = t;
      rankTopics.appendChild(b);
    });
  }

  function buildMetricTabs() {
    rankTabs.innerHTML = '';
    SK.Ranking.metricsFor(rankTopic).forEach(function (m) {
      var b = tabButton(m.ko, function () {
        rankMetric = m.key;
        rankQuery.value = '';
        syncTabs();
        loadBoard();
      });
      b.dataset.metric = m.key;
      rankTabs.appendChild(b);
    });
  }

  function syncTabs() {
    Array.prototype.forEach.call(rankTopics.children, function (b) {
      var on = b.dataset.topic === rankTopic;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(rankTabs.children, function (b) {
      var on = b.dataset.metric === rankMetric;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    btnRankOrder.textContent = rankOrder === 'desc' ? '▼ 높은 순' : '▲ 낮은 순';
  }

  btnRankOrder.addEventListener('click', function () {
    SK.Audio.ui();
    rankOrder = rankOrder === 'desc' ? 'asc' : 'desc';
    syncTabs();
    if (rankQuery.value.trim()) doSearch(); else loadBoard();
  });

  $('rankSearchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    doSearch();
  });

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function rowHtml(r) {
    var cls = 'rank-row';
    if (r.rank <= 3 && rankOrder === 'desc') cls += ' top' + r.rank;
    if (rankMe && r.nick === rankMe) cls += ' me';

    var sub;
    if (rankTopic) {
      sub = '이 단원 ' + (r.tS || 0) + '/' + (r.tA || 0) +
            ' · 정답률 ' + SK.Ranking.fmtPct((r.tA ? r.tS / r.tA : 0));
    } else if (rankMetric === 'accuracy') {
      sub = '밟기 ' + (r.hits || 0) + '/' + (r.steps || 0) +
            ' · 맞힘 ' + (r.solved || 0) + '/' + (r.attempts || 0) +
            ' · 정답률 ' + SK.Ranking.fmtPct(r.rate || 0);
    } else {
      sub = '최고 ' + (r.score || 0) + '점' +
            ' · 맞힘 ' + (r.solved || 0) + '/' + (r.attempts || 0) +
            ' · 정답률 ' + SK.Ranking.fmtPct(r.rate || 0);
    }
    if (r.runs > 1) sub += ' · ' + r.runs + '판';

    return '<div class="' + cls + '">' +
             '<div class="rank-no">' + r.rank + '</div>' +
             '<div class="rank-nick">' + esc(r.nick) + '<span class="rank-sub">' + sub + '</span></div>' +
             '<div class="rank-val">' + SK.Ranking.fmtValue(currentCat(), r.value) + '</div>' +
           '</div>';
  }

  /** 기록이 없을 때 — 조건 때문인지 정말 없는 건지 구분해서 알려 준다 */
  function emptyText() {
    var gate = SK.Ranking.gateOf(currentCat());
    if (gate) {
      return (rankTopic ? ('‘' + esc(rankTopic) + '’ 단원을 ') : '') +
             gate + '문제 이상 시도한 사람만 이 순위에 올라가요.<br>아직 아무도 없어요.';
    }
    return '아직 기록이 없어요.<br>한 판 하고 첫 기록을 남겨 보세요!';
  }

  function paint(rows, note) {
    rankNote.textContent = note || '';
    if (!rows || !rows.length) {
      rankList.innerHTML = '<div class="rank-empty">' + emptyText() + '</div>';
      return;
    }
    rankList.innerHTML = rows.map(rowHtml).join('');
  }

  /** 이 조건의 참가 자격을 한 줄로 */
  function gateNote() {
    var gate = SK.Ranking.gateOf(currentCat());
    if (!gate) return '';
    return rankTopic
      ? ('‘' + rankTopic + '’ 단원을 ' + gate + '문제 이상 시도한 사람만 집계해요.')
      : (gate + '문제 이상 시도한 사람만 집계해요.');
  }

  function loadBoard() {
    var my = ++rankSeq;
    rankList.innerHTML = '<div class="rank-empty">불러오는 중…</div>';
    rankNote.textContent = '';
    SK.Ranking.board({ category: currentCat(), order: rankOrder, limit: 100 }).then(function (res) {
      if (my !== rankSeq) return;                     // 더 최근 요청이 있으면 버린다
      var bits = [];
      if (res.message) bits.push(res.message);
      var g = gateNote();
      if (g) bits.push(g);
      if (res.total > res.rows.length) {
        bits.push('전체 ' + res.total + '명 중 ' + res.rows.length + '명까지 보여 줘요. 그 아래 순위는 닉네임으로 검색하세요.');
      }
      paint(res.rows, bits.join(' '));
    });
  }

  function doSearch() {
    var q = rankQuery.value.trim();
    if (!q) { loadBoard(); return; }
    var my = ++rankSeq;
    rankList.innerHTML = '<div class="rank-empty">찾는 중…</div>';
    SK.Ranking.search(q, { category: currentCat(), order: rankOrder }).then(function (res) {
      if (my !== rankSeq) return;
      var note = res.message || ('"' + q + '" 검색 결과 ' + res.rows.length + '명');
      var g = gateNote();
      paint(res.rows, g ? (note + ' ' + g) : note);
    });
  }

  function openRank(highlight) {
    rankMe = highlight || '';
    rankPanel.hidden = false;
    if (!rankTopics.children.length) { buildTopicTabs(); buildMetricTabs(); }
    syncTabs();
    if (rankQuery.value.trim()) doSearch(); else loadBoard();
  }

  function closeRank() { rankPanel.hidden = true; }

  $('btnRank').addEventListener('click', function () { SK.Audio.ui(); setMenu(false); openRank(); });
  $('btnRankOpen').addEventListener('click', function () { SK.Audio.ui(); openRank(rankMe); });
  $('btnRankClose').addEventListener('click', function () { SK.Audio.ui(); closeRank(); });
  rankPanel.addEventListener('click', function (e) { if (e.target === rankPanel) closeRank(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !rankPanel.hidden) closeRank();
  });

  /* ---------- 퀴즈 데이터 로드 ---------- */
  SK.Quiz.load('data/quizzes.json').then(function (res) {
    SK.Game.startWith(res.quizzes, res.source);
    refreshResumeUi();
    buildTopicTabs();
    buildMetricTabs();
    syncTabs();
  }).catch(function (e) {
    refs.prompt.textContent = '문제 데이터를 불러오지 못했습니다.';
    refs.hint.textContent = String((e && e.message) || e);
    if (window.console) console.error(e);
  });
})();
