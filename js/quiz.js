/* =============================================================
 *  소리 콩콩 — 퀴즈 데이터 파이프라인 + 순서 검증 FSM
 *  · 외부 JSON(data/quizzes.json) 로드, 실패 시 내장 폴백 사용
 *  · 모든 문제는 sequence — 한 타일에 한 글자씩, 순서대로 밟아 정답을 완성한다
 *  · 옛 choice(객관식) 데이터는 로드 시 한 글자 밟기 sequence 로 자동 변환된다
 * ============================================================= */
window.SK = window.SK || {};

SK.Quiz = (function () {

  /* =========================================================
   *  1) 로더 & 검증
   * ======================================================= */

  var DEFAULT_URL = 'data/quizzes.json';

  /**
   * 퀴즈 데이터를 불러온다.
   * file:// 환경에서 fetch가 막히면 data/quizzes.fallback.js 의
   * window.SK_QUIZ_FALLBACK 을 사용한다.
   * @returns {Promise<{quizzes:Array, source:string}>}
   */
  function load(url) {
    url = url || DEFAULT_URL;
    var useFallback = function (reason) {
      var raw = window.SK_QUIZ_FALLBACK;
      if (!raw) throw new Error('퀴즈 데이터를 찾을 수 없습니다: ' + reason);
      return { quizzes: normalizeAll(raw.quizzes), source: 'fallback(' + reason + ')' };
    };
    if (typeof fetch !== 'function') return Promise.resolve(useFallback('no-fetch'));
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (raw) {
        return { quizzes: normalizeAll(raw.quizzes), source: url };
      })
      .catch(function (e) {
        return useFallback(e && e.message ? e.message : 'fetch-blocked');
      });
  }

  var VALID_SUBJECTS = ['social', 'math'];
  var VALID_MATERIALS = [
    'keycap', 'cotton', 'jelly', 'leaf', 'bubble', 'wood',
    'slime', 'orbeez', 'sand', 'glass', 'snow', 'sponge',
    'water', 'gravel', 'cookie', 'foam', 'paper', 'ice'
  ];

  function normalizeAll(arr) {
    if (!Array.isArray(arr)) throw new Error('quizzes 배열이 없습니다');
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var q = normalize(arr[i], i);
      if (q) out.push(q);
    }
    if (!out.length) throw new Error('유효한 문제가 없습니다');
    return out;
  }

  /** 문자열을 타일 한 장에 들어갈 낱개 토큰(한 글자)으로 쪼갠다. 공백은 버린다. */
  function splitTokens(str) {
    var out = [];
    var chars = Array.from ? Array.from(String(str)) : String(str).split('');
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      if (c && c.trim()) out.push(c);
    }
    return out;
  }

  function warn(id, msg) {
    if (window.console) console.warn('[quiz:' + id + '] ' + msg);
  }

  function normalize(raw, idx) {
    if (!raw || typeof raw !== 'object') return null;
    var id = raw.id || ('q' + idx);

    var q = {
      id: id,
      subject: VALID_SUBJECTS.indexOf(raw.subject) >= 0 ? raw.subject : 'social',
      topic: raw.topic || '',
      type: (raw.type === 'sequence' || raw.type === 'choice') ? raw.type : null,
      prompt: String(raw.prompt || '').trim(),
      hint: raw.hint ? String(raw.hint) : '',
      material: VALID_MATERIALS.indexOf(raw.material) >= 0 ? raw.material : null,
      choices: null, answer: null, sequence: null, decoys: null,
      reveal: raw.reveal ? String(raw.reveal) : ''
    };

    if (!q.prompt) { warn(id, 'prompt 없음 — 건너뜀'); return null; }

    // 타입 자동 추론
    if (!q.type) q.type = Array.isArray(raw.sequence) ? 'sequence' : 'choice';

    // ── 호환 처리 ──────────────────────────────────────────────
    // 예전 스키마의 choice(객관식)는 "한 타일에 낱말 전체"가 들어가므로
    // 정답을 한 글자씩 밟는 sequence로 자동 변환한다.
    // 오답 보기의 글자들은 오답 타일(decoy)로 재활용한다.
    if (q.type === 'choice') {
      if (!Array.isArray(raw.choices) || raw.choices.length < 2) { warn(id, 'choices 부족 — 건너뜀'); return null; }
      var choices = raw.choices.map(String);
      var answer = String(raw.answer == null ? choices[0] : raw.answer);
      if (choices.indexOf(answer) < 0) { warn(id, 'answer가 choices에 없음 — 건너뜀'); return null; }
      q.type = 'sequence';
      q.answer = answer;
      q.sequence = splitTokens(answer);
      var pool = [];
      choices.forEach(function (c) {
        if (c === answer) return;
        splitTokens(c).forEach(function (ch) {
          if (q.sequence.indexOf(ch) < 0 && pool.indexOf(ch) < 0) pool.push(ch);
        });
      });
      q.decoys = pool.slice(0, 6);
      if (!q.material) q.material = q.subject === 'math' ? 'bubble' : 'keycap';
      return q;
    }

    var seq = raw.sequence;
    if (typeof seq === 'string') seq = splitTokens(seq);
    if (!Array.isArray(seq) || !seq.length) { warn(id, 'sequence 없음 — 건너뜀'); return null; }
    q.sequence = [];
    for (var si = 0; si < seq.length; si++) {
      var tok = String(seq[si]);
      // 한 타일에는 한 글자만 — 여러 글자가 들어오면 쪼갠다
      if (tok.length > 1) {
        warn(id, '토큰 "' + tok + '" 은(는) 여러 글자라 한 글자씩 분해했습니다');
        splitTokens(tok).forEach(function (c) { q.sequence.push(c); });
      } else if (tok.length === 1) {
        q.sequence.push(tok);
      }
    }
    if (!q.sequence.length) { warn(id, 'sequence 없음 — 건너뜀'); return null; }
    q.answer = q.sequence.join('');
    q.decoys = [];
    (Array.isArray(raw.decoys) ? raw.decoys : []).forEach(function (d) {
      splitTokens(String(d)).forEach(function (c) {
        if (q.sequence.indexOf(c) < 0 && q.decoys.indexOf(c) < 0) q.decoys.push(c);
      });
    });
    if (!q.material) q.material = q.subject === 'math' ? 'jelly' : 'cotton';
    return q;
  }

  /* =========================================================
   *  2) 순서 검증 FSM
   *
   *   IDLE ──setQuiz──▶ PLAY ──correct step──▶ PLAY
   *                      │                      │
   *                      │ wrong token          │ 마지막 토큰
   *                      ▼                      ▼
   *                    WRONG ──reset──▶ PLAY   SOLVED
   * ======================================================= */

  function createMachine() {
    return {
      state: 'IDLE',
      quiz: null,
      progress: [],     // 지금까지 올바르게 밟은 토큰
      attempts: 0,
      mistakes: 0,

      setQuiz: function (q) {
        this.quiz = q;
        this.progress = [];
        this.attempts = 0;
        this.mistakes = 0;
        this.state = 'PLAY';
      },

      /** 다음에 밟아야 할 토큰 (한 글자) */
      expected: function () {
        if (!this.quiz) return null;
        return this.quiz.sequence[this.progress.length];
      },

      total: function () {
        return this.quiz ? this.quiz.sequence.length : 0;
      },

      /**
       * 타일을 밟았을 때 호출.
       * @param {string} token 타일이 들고 있는 값
       * @returns {{type:string, index:number, expected:string}}
       *   type: 'progress' | 'solved' | 'wrong' | 'ignore'
       */
      submit: function (token) {
        if (this.state !== 'PLAY' || !this.quiz) {
          return { type: 'ignore', index: this.progress.length, expected: this.expected() };
        }
        var exp = this.expected();
        this.attempts++;

        if (token !== exp) {
          this.mistakes++;
          this.state = 'WRONG';
          var lost = this.progress.length;
          this.progress = [];             // 순서 판정 리셋
          return { type: 'wrong', index: lost, expected: exp };
        }

        this.progress.push(token);
        if (this.progress.length >= this.total()) {
          this.state = 'SOLVED';
          return { type: 'solved', index: this.progress.length - 1, expected: exp };
        }
        return { type: 'progress', index: this.progress.length - 1, expected: exp };
      },

      /** WRONG 연출이 끝난 뒤 다시 입력 가능 상태로 */
      resume: function () {
        if (this.state === 'WRONG') this.state = 'PLAY';
      }
    };
  }

  /* =========================================================
   *  3) 레이아웃 플래너 — 문제를 타일 배치 명세로 변환
   * ======================================================= */

  /**
   * @returns {Array<{token:string, label:string, correct:boolean, order:number}>}
   *   order: 순서 밟기에서의 정답 순번(0-based), 오답 타일은 -1
   */
  function plan(q, maxTiles) {
    var items = [];
    var seen = Object.create(null);

    // 정답 타일 — 같은 글자가 반복되면 타일 하나를 재사용한다
    for (var k = 0; k < q.sequence.length; k++) {
      var tk = q.sequence[k];
      if (seen[tk] != null) continue;
      seen[tk] = k;
      items.push({ token: tk, label: tk, correct: true, order: k });
    }

    // 오답 타일 — 격자 여유만큼만 넣는다(정답 타일은 절대 잘리지 않는다)
    var room = (maxTiles == null ? 99 : maxTiles) - items.length;
    for (var d = 0; d < q.decoys.length && room > 0; d++) {
      var dk = q.decoys[d];
      if (seen[dk] != null) continue;
      seen[dk] = -1;
      items.push({ token: dk, label: dk, correct: false, order: -1 });
      room--;
    }
    return shuffle(items);
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* =========================================================
   *  4) 세션 — 과목 필터 + 순환 출제
   * ======================================================= */

  function createSession(quizzes) {
    return {
      all: quizzes,
      filter: 'all',
      queue: [],
      current: null,
      solvedIds: Object.create(null),

      setFilter: function (f) {
        this.filter = f;
        this.queue = [];
      },

      pool: function () {
        var f = this.filter;
        if (f === 'all') return this.all;
        return this.all.filter(function (q) { return q.subject === f; });
      },

      /** 다음 문제. 한 바퀴 다 돌면 다시 섞어서 순환 */
      next: function () {
        if (!this.queue.length) {
          this.queue = shuffle(this.pool().slice());
          // 직전 문제가 바로 다시 나오는 것 방지
          if (this.queue.length > 1 && this.current && this.queue[0].id === this.current.id) {
            this.queue.push(this.queue.shift());
          }
        }
        this.current = this.queue.shift() || null;
        return this.current;
      }
    };
  }

  return {
    load: load,
    normalize: normalize,
    normalizeAll: normalizeAll,
    createMachine: createMachine,
    createSession: createSession,
    plan: plan,
    splitTokens: splitTokens,
    shuffle: shuffle,
    VALID_SUBJECTS: VALID_SUBJECTS,
    VALID_MATERIALS: VALID_MATERIALS
  };
})();
