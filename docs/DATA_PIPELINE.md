# 외부 문제 데이터(JSON) 연동 구조 설계서

> 대상 파일: `data/quizzes.json` · 로더: `js/quiz.js` · 빌드 도구: `tools/build-fallback.py`

---

## 1. 파이프라인 전체 흐름

```
 [교사/기획자]                [빌드]                     [런타임]
 data/quizzes.json  ──▶  tools/build-fallback.py  ──▶  data/quizzes.fallback.js
        │                    (검증 + 사본 생성)                    │
        │                                                          │
        └──────────── fetch() ──────────▶ SK.Quiz.load() ◀─────────┘
                       (http/https)          │        (file:// 폴백)
                                             ▼
                                    normalize() 정규화·검증
                                             ▼
                              SK.Quiz.createSession()  과목 필터 + 순환 출제
                                             ▼
                              SK.Quiz.plan()  타일 배치 명세 생성
                                             ▼
                              SK.Game.layoutQuiz()  4x4 ~ 6x6 격자에 배치(화면 크기에 따라)
                                             ▼
                              SK.Quiz.createMachine()  순서 검증 FSM
```

**핵심 원칙:** 게임 코드는 문제 내용을 전혀 모릅니다. 새 교과·단원을 추가할 때 수정할 파일은
`data/quizzes.json` **하나뿐**입니다.

---

## 2. 최상위 스키마

```jsonc
{
  "schemaVersion": 2,             // 정수. 스키마가 바뀌면 올립니다.
  "title": "문제집 이름",
  "updated": "2026-09-16",
  "subjects": {                   // 표시용 메타데이터 (런타임 동작에는 영향 없음)
    "social": { "ko": "사회", "topics": ["역사", "지리", "사회 용어"] },
    "math":   { "ko": "수학", "topics": ["연산", "수식", "도형"] }
  },
  "quizzes": [ /* 문제 객체 배열 — 아래 3장 */ ]
}
```

---

## 3. 문제 객체 스키마

### 3.1 공통 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `id` | string | 권장 | 고유 식별자. 생략 시 `q0`, `q1`… 자동 부여. 예: `soc-geo-001` |
| `subject` | `"social"` \| `"math"` | ✔ | 과목. 하단 과목 필터 버튼과 연결됩니다. 알 수 없는 값은 `social`로 대체 |
| `topic` | string | – | 단원/영역 라벨. HUD 배지에 그대로 표시 (예: `"지리"`, `"도형"`) |
| `type` | `"sequence"` | – | 새 문제는 항상 `sequence`. 옛 `"choice"` 는 자동 변환됩니다(3.2 끝 참고) |
| `prompt` | string | ✔ | 상단에 표시할 문제 문장. **비어 있으면 그 문제는 건너뜁니다.** HTML 태그 불가(평문으로 출력) |
| `hint` | string | – | 2회 이상 틀리면 자동으로 노출 |
| `reveal` | string | – | 정답 직후 표시할 해설. 생략 시 `"정답! <답>"` 자동 생성 |
| `material` | 재질 키 | – | 보기 타일의 재질. 생략 시 과목별 기본값(4장 참고) |

### 3.2 유일한 유형 — 순서대로 밟기 (`type: "sequence"`)

> **한 타일에는 반드시 한 글자만** 들어갑니다.
> 낱말 전체가 적힌 타일을 밟는 방식은 지원하지 않습니다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `sequence` | string[] \| string | ✔ | 밟아야 할 순서. 문자열을 주면 한 글자씩 분해됩니다(`"경상북도"` → `["경","상","북","도"]`) |
| `decoys` | string[] | – | 오답 타일. `sequence`와 겹치는 값은 자동으로 제거됩니다 |

`sequence`의 각 원소는 **한글 글자·숫자·수학 기호 무엇이든** 가능하지만 **반드시 한 글자**여야 합니다.
두 글자 이상인 토큰이 들어오면 경고를 남기고 자동으로 한 글자씩 쪼갭니다
(`["경상","북도"]` → `["경","상","북","도"]`).

**권장 한계** — 정답은 2~5글자, 오답(`decoys`)은 4개 내외.
가장 작은 4×4 격자(캐릭터 자리를 뺀 15칸)에 다 들어가야 합니다.
격자가 모자라면 오답 타일부터 잘리고, 정답 타일은 절대 잘리지 않습니다.

```jsonc
// 사회 — 낱말 완성 (타일 8장: 정답 4 + 오답 4)
{ "type": "sequence", "sequence": ["경","상","북","도"], "decoys": ["전","강","남","제"] }

// 수학 — 결과 완성 (5 + 7 = 12)
{ "type": "sequence", "sequence": ["1","2"], "decoys": ["3","4","5","7","9","0"] }

// 수학 — 수식 완성
{ "type": "sequence", "sequence": ["5","+","7"], "decoys": ["-","×","÷","3","9","="] }
```

#### 중복 토큰 처리
`["1","9","1","9"]`처럼 같은 값이 반복되면 **타일은 하나만** 생성되고(`[1]`, `[9]`),
플레이어는 그 타일에서 **점프해 내려갔다가 다시 밟아야** 합니다.
`SK.Quiz.plan()`이 중복을 제거하고, FSM이 값 기준으로 순서를 검증합니다.

#### 예전 `choice`(객관식) 데이터 호환
`type: "choice"` 로 된 옛 데이터를 넣어도 읽힙니다. 다만 한 타일에 낱말 전체를 올리지 않기 위해,
로더가 **정답을 한 글자씩 밟는 sequence 로 자동 변환**합니다.
오답 보기의 글자들은 `decoys` 로 재활용됩니다(최대 6개).
새 문제는 처음부터 `sequence` 로 작성하세요.

---

## 4. 재질(`material`) 매핑

| 키 | 표기 | 소리 | 분류 | 완전 파괴까지 |
|---|---|---|---|---|
| `keycap` | 키캡 | **톡** | 탄성 | — |
| `cotton` | 솜 | **포옥** | 탄성 | — |
| `jelly` | 젤리 | **통** | 탄성 | — |
| `wood` | 나무 | **탁** | 탄성 | — (배경 바닥 전용) |
| `slime` | 슬라임 | **찌걱** | 탄성 | — |
| `glass` | 유리구슬 | **챠랑** | 탄성 | — |
| `sponge` | 스펀지 | **뽀드득** | 탄성 | — |
| `water` | 물웅덩이 | **찰방** | 탄성 | — |
| `gravel` | 자갈 | **자그락** | 탄성 | — |
| `metal` | 양철판 | **탱** | 탄성 | — |
| `leaf` | 낙엽 | **바스락** | 소모성 | 4번째 · **복구 없음** |
| `bubble` | 에어캡 | **뽁** | 소모성 | 4번째 · **복구 없음** |
| `orbeez` | 구슬볼 | **톡톡** | 소모성 | 4번째 · **복구 없음** |
| `sand` | 모래 | **사각** | 소모성 | 4번째 · **복구 없음** |
| `snow` | 눈 | **뽀득** | 소모성 | 4번째 · **복구 없음** |
| `paper` | 종이 | **구깃** | 소모성 | 4번째 · **복구 없음** |
| `ice` | 얼음 | **쩌억** | 소모성 | 4번째 · **복구 없음** |
| `cookie` | 쿠키 | **바삭** | 소모성 | 4번째 · **복구 없음** |

각 재질의 생김새와 임팩트 연출은 README 의 타일 표를 보세요.

> **권장:** 배경 바닥이 나무 위주이므로 보기 타일에 `wood`를 쓰면 구분이 약해집니다
> (검증 도구가 경고합니다). 구분용 흰/검 테두리가 자동으로 그려지지만, 다른 재질이 훨씬 잘 보입니다.
>
> 소모성 재질을 보기 타일에 써도 안전합니다 — 타일이 부서지면 되살리는 대신
> 그 위의 **글자가 성한 칸으로 옮겨 갑니다**(`Game.relocateLabel`).

재질을 추가하려면 세 곳을 같은 키로 맞추면 됩니다.

1. `js/tiles.js` `MATERIALS` — 색·두께·탄성·내구도·`sound`(의성어)·`art`(윗면 그림 이름)
2. `js/tiles.js` `ART` — 그 `art` 이름의 윗면 그리기 함수 (**소리를 예상할 수 있는 그림**으로)
3. `js/audio.js` `MATERIAL` — 모달 모드비와 그래뉼러 레시피

메뉴의 '소리 도감'과 `SK.Audio.preview(key)` 미리듣기는 자동으로 따라옵니다.

---

## 5. 정규화 및 검증 규칙

`SK.Quiz.normalize()`가 로드 시점에 적용합니다. **문제 하나가 잘못돼도 게임은 멈추지 않고**,
그 문제만 건너뛰며 `console.warn`을 남깁니다.

| 상황 | 처리 |
|---|---|
| `prompt` 없음 | 건너뜀 + 경고 |
| `sequence` 토큰이 두 글자 이상 | 경고 후 한 글자씩 분해 |
| `type: "choice"` | 경고 후 한 글자 밟기 sequence 로 변환 |
| `subject`가 목록 밖 | `social`로 대체 |
| `material`이 목록 밖 | 과목별 기본값 사용 |
| `choices` 2개 미만 | 건너뜀 + 경고 |
| `answer`가 `choices`에 없음 | 건너뜀 + 경고 |
| `sequence` 없음/빈 배열 | 건너뜀 + 경고 |
| 유효한 문제가 0개 | 폴백 데이터로 전환, 실패 시 오류 메시지 표시 |

빌드 타임 검증은 더 엄격합니다:

```bash
python tools/build-fallback.py
```

- **에러(종료 코드 1):** id 중복, `prompt` 없음, `sequence` 없음, `answer`가 `choices` 밖,
  `choices` 2개 미만, **타일 15장 초과**(가장 작은 4×4 격자에 안 들어감)
- **경고:** 알 수 없는 `subject`/`material`, `material: "wood"`(배경과 색이 같음),
  여러 글자 토큰, `choice` 형식 사용, 정답 7글자 초과(HUD 슬롯 넘침), 타일 10장 초과

이 검증은 GitHub Actions 배포 워크플로에서도 실행되므로, 잘못된 데이터는 배포되지 않습니다.

---

## 6. 로딩 전략 — http와 file:// 모두 지원

```
SK.Quiz.load('data/quizzes.json')
   ├─ fetch 성공 ──▶ 그 JSON 사용                     (source: "data/quizzes.json")
   └─ fetch 실패 ──▶ window.SK_QUIZ_FALLBACK 사용     (source: "fallback(...)")
```

`file://`로 index.html을 직접 열면 브라우저가 `fetch`를 CORS로 막습니다.
이때를 위해 `data/quizzes.fallback.js`가 `<script>` 태그로 미리 로드되어 있습니다.
화면 하단에 현재 어느 쪽을 쓰는지 표시됩니다 (`문제 32개 · data/quizzes.json`).

> ⚠️ **`data/quizzes.json`을 수정한 뒤에는 반드시 `python tools/build-fallback.py`를 실행**하세요.
> 그러지 않으면 `file://` 실행 시 예전 문제가 나옵니다.

---

## 7. 문제 추가 체크리스트

1. `data/quizzes.json`의 `quizzes` 배열에 객체 추가
2. `id`를 `<과목3>-<영역3>-<번호3>` 규칙으로 부여 (예: `mat-geo-006`)
3. `decoys`를 4개 내외로 넣어 난이도 확보 (정답+오답 타일이 15장을 넘으면 안 됩니다)
4. `hint`와 `reveal` 작성 (학습 효과가 크게 올라갑니다)
5. `python tools/build-fallback.py` 실행 — 에러 0개 확인
6. 브라우저에서 해당 과목 필터로 확인

---

## 8. 런타임 API 요약

| 함수 | 설명 |
|---|---|
| `SK.Quiz.load(url)` | `Promise<{quizzes, source}>` |
| `SK.Quiz.normalize(raw, idx)` | 문제 하나 정규화. 실패 시 `null` |
| `SK.Quiz.createSession(quizzes)` | `.setFilter('all'\|'social'\|'math')`, `.next()`, `.pool()` |
| `SK.Quiz.createMachine()` | `.setQuiz(q)`, `.expected()`, `.total()`, `.submit(token)`, `.resume()` |
| `SK.Quiz.plan(q, maxTiles)` | `[{token, label, correct, order}]` — 셔플된 타일 배치 명세. 칸이 모자라면 오답부터 잘림 |
| `SK.Quiz.splitTokens(str)` | 문자열을 한 글자 토큰 배열로 분해 |
| `SK.Game.debug.state()` | 페이즈·FSM 상태·타일 목록(재질·균열 포함) |
| `SK.Game.debug.stepOn(i, j, power)` | 해당 타일에 착지시켜 판정 발생. `power: 2` 면 큰 점프 |
| `SK.Game.debug.tick(dt)` | 탭이 숨겨져 rAF가 멈춰도 한 프레임 진행(업데이트+렌더) |
| `SK.Game.debug.safeRect()` | HUD·화면 컨트롤을 뺀 보드 배치 영역 |
| `SK.Game.debug.boardBounds()` | 실제로 그려진 보드의 화면 경계(겹침 자동 점검용) |

### 타일 재질과 파괴 단계

| `material` | 분류 | 완전 파괴까지 | 복구 |
|---|---|:---:|:---:|
| `keycap` `cotton` `jelly` `wood` `water` `gravel` `metal` … | 탄성 | 부서지지 않음 | — |
| `leaf` `bubble` `orbeez` `sand` `snow` `paper` `ice` `cookie` | 소모성 | 4번째 | **없음** |

큰 점프(`Space`)도 한 번에 한 단계만 깎습니다.
**부서진 타일은 되살아나지 않습니다.** 대신 그 위의 글자가 성한 칸으로 옮겨 가고,
성한 발판이 절반 아래로 줄면 판 전체가 새로 깔립니다.

### FSM 상태 전이

```
            setQuiz(q)
   IDLE ───────────────▶ PLAY ◀──────────────┐
                          │                  │ resume()  (0.8초 뒤 자동)
        submit(옳은 토큰)  │  submit(틀린 토큰) │
              ┌───────────┴──────────┐        │
              ▼                      ▼        │
         progress++              WRONG ───────┘
              │                  progress = [] (전체 리셋)
      마지막 토큰이면
              ▼
           SOLVED ──(2.1초)──▶ 다음 문제
```
