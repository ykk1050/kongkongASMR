# -*- coding: utf-8 -*-
"""data/quizzes.json 검증 + data/quizzes.fallback.js 재생성.

    python tools/build-fallback.py

퀴즈 JSON을 수정한 뒤 반드시 실행하세요. file:// 실행과 CI 검증이 이 파일에 의존합니다.
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'quizzes.json')
DST = os.path.join(ROOT, 'data', 'quizzes.fallback.js')

VALID_SUBJECTS = {'social', 'math'}
VALID_MATERIALS = {
    'keycap', 'cotton', 'jelly', 'leaf', 'bubble', 'wood',
    'slime', 'orbeez', 'sand', 'glass', 'snow', 'sponge',
    'water', 'gravel', 'moss', 'foam', 'paper', 'ice',
}

# 가장 작은 격자(4x4 = 16칸)에서 캐릭터 시작 칸을 뺀 값
MIN_GRID_CELLS = 15
MAX_SLOTS = 7          # HUD 슬롯이 한 줄에 들어가는 한계


def tokens_of(value):
    """문자열/배열을 타일 한 장짜리 토큰 목록으로 편다."""
    if isinstance(value, str):
        return [c for c in value if c.strip()]
    out = []
    for item in value or []:
        for c in str(item):
            if c.strip():
                out.append(c)
    return out


def validate(doc):
    errors, warns = [], []
    quizzes = doc.get('quizzes')
    if not isinstance(quizzes, list) or not quizzes:
        return ['quizzes 배열이 비어 있습니다'], warns

    seen_ids = set()
    for index, q in enumerate(quizzes):
        qid = q.get('id') or '#%d' % index
        if qid in seen_ids:
            errors.append('%s: id 중복' % qid)
        seen_ids.add(qid)

        if not q.get('prompt'):
            errors.append('%s: prompt 없음' % qid)
        if q.get('subject') not in VALID_SUBJECTS:
            warns.append('%s: subject "%s" -> social 로 대체됨' % (qid, q.get('subject')))

        material = q.get('material')
        if material and material not in VALID_MATERIALS:
            warns.append('%s: material "%s" 는 알 수 없음 -> 기본값 사용' % (qid, material))
        if material == 'wood':
            warns.append('%s: material "wood" 는 배경 바닥과 색이 같아 구분이 어렵습니다' % qid)

        qtype = q.get('type') or ('sequence' if q.get('sequence') else 'choice')

        if qtype == 'choice':
            choices = q.get('choices')
            if not isinstance(choices, list) or len(choices) < 2:
                errors.append('%s: choices 가 2개 미만' % qid)
                continue
            if q.get('answer') not in choices:
                errors.append('%s: answer 가 choices 안에 없음' % qid)
                continue
            warns.append('%s: choice 형식은 정답을 한 글자씩 밟는 sequence 로 자동 변환됩니다' % qid)
            seq = tokens_of(q['answer'])
            decoys = []
            for c in choices:
                if c == q['answer']:
                    continue
                decoys += [t for t in tokens_of(c) if t not in seq]
        else:
            raw_seq = q.get('sequence')
            if not raw_seq:
                errors.append('%s: sequence 없음' % qid)
                continue
            # 한 타일에는 한 글자만 — 여러 글자 토큰은 경고 후 분해된다
            if isinstance(raw_seq, list):
                for item in raw_seq:
                    if len(str(item)) > 1:
                        warns.append('%s: 토큰 "%s" 은 여러 글자라 한 글자씩 분해됩니다' % (qid, item))
            seq = tokens_of(raw_seq)
            decoys = [t for t in tokens_of(q.get('decoys')) if t not in seq]

        if not seq:
            errors.append('%s: 밟을 토큰이 하나도 없음' % qid)
            continue
        if len(seq) > MAX_SLOTS:
            warns.append('%s: 정답이 %d글자 — HUD 슬롯이 넘칠 수 있습니다(권장 %d 이하)'
                         % (qid, len(seq), MAX_SLOTS))

        tile_count = len(set(seq)) + len(set(decoys) - set(seq))
        if tile_count > MIN_GRID_CELLS:
            errors.append('%s: 타일 %d장 — 가장 작은 4x4 격자(%d칸)에 들어가지 않습니다. decoys 를 줄이세요.'
                          % (qid, tile_count, MIN_GRID_CELLS))
        elif tile_count > 10:
            warns.append('%s: 타일 %d장 — 작은 화면에서는 오답 타일이 잘릴 수 있습니다' % (qid, tile_count))

    return errors, warns


def main():
    with io.open(SRC, encoding='utf-8') as f:
        doc = json.load(f)

    errors, warns = validate(doc)
    for w in warns:
        print('[warn] ' + w)
    if errors:
        for e in errors:
            print('[error] ' + e)
        sys.exit(1)

    header = (
        u'/* 자동 생성 파일 — data/quizzes.json 의 내장 폴백 사본.\n'
        u' * file:// 로 직접 열었을 때 fetch가 막히면 이 데이터가 사용됩니다.\n'
        u' * 편집은 data/quizzes.json 을 고친 뒤 `python tools/build-fallback.py` 로 다시 생성하세요.\n'
        u' */\n'
    )
    body = header + u'window.SK_QUIZ_FALLBACK = ' + json.dumps(doc, ensure_ascii=False, indent=2) + u';\n'
    with io.open(DST, 'w', encoding='utf-8') as f:
        f.write(body)
    print('OK: %d개 문제 -> %s' % (len(doc['quizzes']), os.path.relpath(DST, ROOT)))


if __name__ == '__main__':
    main()
