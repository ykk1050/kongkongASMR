# -*- coding: utf-8 -*-
"""index.html 이 불러오는 파일들에 버전 도장을 찍는다.

왜 필요한가
-----------
GitHub Pages 는 파일마다 따로 캐시한다. 그래서 브라우저가 **새 index.html 과
옛 main.js** 를 섞어 들고 있는 순간이 생긴다. 실제로 메뉴 버튼 하나를 지웠을 때
그 조합이 만들어져서, 옛 main.js 가 없어진 버튼을 찾다가 터지고 '산책 시작하기'
버튼이 통째로 죽은 적이 있다.

주소 끝에 ?v=<해시> 를 붙여 두면 그 조합이 아예 만들어지지 않는다.
옛 index.html 은 옛 주소를 부르고(=옛 js 끼리 맞고), 새 index.html 은 새 주소를
부른다(=새 js 끼리 맞는다). 섞일 수가 없다.

쓰는 법
-------
    python tools/stamp.py          # 도장을 다시 찍는다
    python tools/stamp.py --check  # 도장이 최신인지 보기만 한다 (고치지 않음)
    python tools/stamp.py --bump   # 화면 아래 버전을 0.00001 올리고 도장도 찍는다

js·css·문제 데이터를 고친 뒤, 커밋하기 전에 한 번 돌리면 된다.
(js/ranking-config.js 의 랭킹 주소를 적은 뒤에도 마찬가지)

화면 아래 버전
--------------
index.html 의 #loadNote 에 "Created by gamtudyssam using AI · 0.00027" 이 적혀 있다.
**내보내는 변경마다 0.00001 씩 올린다.** 손으로 고치면 잊어버리므로 --bump 를 쓴다.
"""
import hashlib
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')

# 화면 아래 한 줄 — 만든 사람과 버전. 숫자만 골라내 올린다.
VERSION_PATTERN = re.compile(
    r'(<div id="loadNote">Created by gamtudyssam using AI · )(\d+\.\d+)(</div>)')
VERSION_STEP = '0.00001'

# 도장을 찍을 대상 — index.html 이 <script>/<link> 로 부르는 우리 파일들
PATTERN = re.compile(
    r'(<(?:script|link)\b[^>]*?\b(?:src|href)=")'      # 여는 따옴표까지
    r'((?:js|css|data)/[^"?]+\.(?:js|css))'            # 우리 파일 경로
    r'(?:\?v=[^"]*)?'                                  # 이미 찍힌 도장(있으면 교체)
    r'(")'
)


def asset_files():
    """해시에 넣을 파일 목록 — index.html 이 부르는 것과 같은 범위."""
    out = []
    for folder in ('js', 'css'):
        d = os.path.join(ROOT, folder)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.endswith(('.js', '.css')):
                out.append(os.path.join(d, name))
    fallback = os.path.join(ROOT, 'data', 'quizzes.fallback.js')
    if os.path.exists(fallback):
        out.append(fallback)
    return out


def stamp_of(files):
    """모든 파일의 내용을 한 줄 해시로 — 하나라도 바뀌면 도장이 바뀐다."""
    h = hashlib.sha256()
    for path in files:
        h.update(os.path.relpath(path, ROOT).replace(os.sep, '/').encode('utf-8'))
        h.update(b'\0')
        with open(path, 'rb') as f:
            h.update(f.read())
        h.update(b'\0')
    return h.hexdigest()[:10]


def bump_version(html):
    """버전을 0.00001 올린다. 자릿수는 원래 쓰던 그대로 유지한다."""
    m = VERSION_PATTERN.search(html)
    if not m:
        print('index.html 에서 #loadNote 버전을 찾지 못했습니다.')
        return html, None
    cur = m.group(2)
    # 부동소수로 더하면 0.00027 이 0.00028000000000000004 가 된다 — 정수로 센다
    places = len(cur.split('.')[1])
    step = int(round(float(VERSION_STEP) * (10 ** places)))
    nxt = ('%.' + str(places) + 'f') % ((int(round(float(cur) * (10 ** places))) + step) / float(10 ** places))
    return html[:m.start()] + m.group(1) + nxt + m.group(3) + html[m.end():], (cur, nxt)


def main():
    check_only = '--check' in sys.argv
    do_bump = '--bump' in sys.argv
    files = asset_files()
    if not files:
        print('도장을 찍을 파일이 없습니다.')
        return 1

    html = io.open(INDEX, encoding='utf-8', newline='').read()
    bumped = None
    if do_bump and not check_only:
        html, bumped = bump_version(html)
        if bumped is None:
            return 1
        # 버전 글자가 바뀌어도 도장은 그대로다 — 도장은 js/css 내용만 보기 때문이다.
        # 그래도 index.html 은 반드시 새로 써야 하므로 아래에서 항상 기록한다.

    stamp = stamp_of(files)

    hits = []

    def repl(m):
        hits.append(m.group(2))
        return m.group(1) + m.group(2) + '?v=' + stamp + m.group(3)

    new = PATTERN.sub(repl, html)

    if not hits:
        print('index.html 에서 도장을 찍을 <script>/<link> 를 찾지 못했습니다.')
        return 1

    if new == html and not bumped:
        print('도장이 이미 최신입니다 — v=%s (%d개 파일)' % (stamp, len(hits)))
        return 0

    if check_only:
        print('도장이 낡았습니다. `python tools/stamp.py` 를 돌려 주세요.')
        print('  지금 내용의 도장: v=%s' % stamp)
        return 1

    io.open(INDEX, 'w', encoding='utf-8', newline='').write(new)
    if bumped:
        print('버전 %s → %s' % bumped)
    print('도장을 찍었습니다 — v=%s' % stamp)
    for name in hits:
        print('  ' + name)
    return 0


if __name__ == '__main__':
    sys.exit(main())
