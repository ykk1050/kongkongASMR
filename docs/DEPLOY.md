# GitHub Pages 배포 가이드

> 빌드 도구·의존성이 없는 순수 정적 사이트라서, 저장소를 그대로 올리면 끝입니다.

---

## 0. 고친 뒤에는 — 버전 도장부터

`js/` · `css/` · 문제 데이터를 고쳤다면 **커밋하기 전에** 한 번 돌립니다.

```bash
python tools/stamp.py
```

`index.html` 이 부르는 주소 끝에 `?v=<해시>` 를 다시 찍습니다.

### 왜 필요한가

GitHub Pages 는 파일마다 따로 캐시합니다. 그래서 브라우저가 **새 index.html 과
옛 main.js** 를 섞어 들고 있는 순간이 생깁니다. 실제로 메뉴 버튼 하나를 지웠을 때
그 조합이 만들어져, 옛 main.js 가 없어진 버튼을 찾다가 터지고 **'산책 시작하기'
버튼이 통째로 죽은** 적이 있습니다. 화면에는 오류 한 줄 없이 그냥 안 눌렸습니다.

도장을 찍어 두면 그 조합이 아예 만들어지지 않습니다. 옛 index.html 은 옛 주소를,
새 index.html 은 새 주소를 부르므로 **섞일 수가 없습니다**.

도장이 최신인지 보기만 하려면 `python tools/stamp.py --check` 를 씁니다.

---

## 1. 처음 배포하기

```bash
cd C:\Users\ykk\sori-kongkong
git init
git add .
git commit -m "소리 콩콩 학습 산책 최초 커밋"
git branch -M main
git remote add origin https://github.com/<계정>/sori-kongkong.git
git push -u origin main
```

그다음 GitHub 저장소에서:

**Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 변경.

`.github/workflows/pages.yml` 이 이미 들어 있으므로, `main` 에 push할 때마다 자동 배포됩니다.
완료되면 접속 주소는 다음과 같습니다.

```
https://<계정>.github.io/sori-kongkong/
```

> Source 를 "Deploy from a branch" 로 두어도 동작합니다. 그 경우 브랜치를 `main`, 폴더를 `/ (root)` 로 지정하세요.
> 다만 워크플로의 문제 데이터 검증 단계는 실행되지 않습니다.

---

## 2. 워크플로가 하는 일

| 단계 | 내용 |
|---|---|
| `validate` | `python tools/build-fallback.py` 로 `data/quizzes.json` 을 검증하고, 커밋된 `data/quizzes.fallback.js` 가 최신인지 확인 |
| `deploy` | 저장소 전체를 Pages 아티팩트로 업로드해 배포 |

폴백 사본이 오래됐으면 배포가 **실패**합니다. 로컬에서 아래를 실행하고 다시 커밋하세요.

```bash
python tools/build-fallback.py
git add data/quizzes.fallback.js && git commit -m "문제 데이터 갱신"
```

---

## 3. 하위 경로에서도 동작하는 이유

Pages 는 `https://<계정>.github.io/<저장소>/` 처럼 **하위 경로**로 서비스합니다.
이 프로젝트의 모든 참조는 상대 경로입니다.

| 파일 | 참조 방식 |
|---|---|
| `index.html` | `css/style.css`, `js/*.js`, `data/quizzes.fallback.js` |
| `js/quiz.js` | `data/quizzes.json` |
| `js/main.js` | `assets/audio/manifest.json` |
| `manifest.webmanifest` | `start_url: "./"`, `scope: "./"`, 아이콘도 상대 경로 |

따라서 저장소 이름이 무엇이든, 사용자 페이지(`<계정>.github.io`)든 프로젝트 페이지든 그대로 동작합니다.
**절대 경로(`/css/...`)를 쓰지 마세요.** 하위 경로 배포에서 깨집니다.

`.nojekyll` 파일이 루트에 있어 Jekyll 전처리를 건너뜁니다.

---

## 4. 학생에게 나눠줄 때

- **링크 접속**: 주소만 공유하면 됩니다. 설치 불필요.
- **홈 화면에 추가**: `manifest.webmanifest` 가 있어 안드로이드 크롬에서
  ⋮ → "홈 화면에 추가" 를 하면 전체화면 앱처럼 실행됩니다(주소창 없음).
- **이어폰 권장**: 바이노럴(HRTF) 입체 음향은 스피커에서 효과가 크게 줄어듭니다.
- **첫 화면의 "산책 시작하기" 필수**: 브라우저 자동재생 정책 때문에
  사용자가 한 번 터치해야 오디오가 열립니다.

---

## 5. 다른 정적 호스팅

같은 방식으로 어디든 올라갑니다. 빌드 명령은 없고 출력 디렉터리는 저장소 루트입니다.

| 서비스 | 설정 |
|---|---|
| Netlify | Build command 없음 / Publish directory `.` |
| Vercel | Framework Preset: Other / Output Directory `.` |
| Cloudflare Pages | Build command 없음 / Build output `/` |

---

## 6. 배포 전 점검표

- [ ] `python tools/build-fallback.py` 가 에러 없이 끝난다
- [ ] 로컬 서버(`python -m http.server 5178`)에서 문제 풀이가 정상 동작한다
- [ ] 브라우저 콘솔에 404 나 에러가 없다
- [ ] 태블릿 가로/세로 폭에서 방향 패드가 문제나 보드를 가리지 않는다
- [ ] 화면 맨 아래 `Created by gamtudyssam using AI · 0.000XX` 가 컨트롤에 가리지 않는다
      (버전은 내보낼 때마다 `python tools/stamp.py --bump` 으로 0.00001 올린다)
- [ ] `index.html` 을 더블클릭한 `file://` 실행도 동작한다(폴백 데이터 확인)
