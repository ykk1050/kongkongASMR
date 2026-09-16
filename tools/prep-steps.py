# -*- coding: utf-8 -*-
"""발소리 에셋 준비 도구 — 자르기(slice) · 라우드니스 정규화(normalize) · 측정(report)

왜 필요한가
-----------
1) **자르기** — 긴 발소리 녹음을 눈대중으로 자르면 한 조각 안에 걸음이 둘 들어가거나
   앞에 빈 구간이 붙는다. 게임에서는 "한 번 밟았는데 두 번 소리가 나고", "밟고 나서
   조금 있다가 소리가 난다"로 들린다. 온셋(발이 닿는 순간)을 찾아 그 앞 20ms부터
   꼬리가 잦아들 때까지 자르면 두 문제가 함께 사라진다.

2) **정규화** — 재질마다 주파수 분포가 달라서 파형 레벨(peak/RMS)을 맞춰도 체감 음량은
   맞지 않는다. 특히 **피크 미터는 트랜지언트를 과대평가**해서, 나무처럼 '탁' 하고 끝나는
   소리를 실제보다 크다고 잘못 읽는다. 여기서는 방송 표준인 BS.1770 **K-가중** 라우드니스로
   재고, 온셋 이후 250ms(짧은 타격음의 청각 적분 시간)를 창으로 쓴다.

사용법
------
    python tools/prep-steps.py report
    python tools/prep-steps.py normalize [--target 0.10] [--ceiling 0.95] [--apply]
    python tools/prep-steps.py slice <원본.wav> <재질이름> <개수>

`--apply` 없이 실행하면 아무것도 쓰지 않고 표만 보여 준다.
mp3 원본은 먼저 모노 44.1kHz wav로 바꿔서 넣는다:

    ffmpeg -i source.mp3 -ac 1 -ar 44100 -c:a pcm_s16le src.wav
"""
import wave
import numpy as np
import math
import os
import sys
import glob
import argparse

AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio')
FFT, HOP = 1024, 256


# ---------------------------------------------------------------- 파일 입출력
def load(path):
    w = wave.open(path)
    sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
    d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768
    w.close()
    if ch > 1:
        d = d.reshape(-1, ch).mean(1)
    return d, sr


def save(path, d, sr):
    d = np.clip(d, -1, 1)
    w = wave.open(path, 'wb')
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes((d * 32767).astype('<i2').tobytes())
    w.close()


# ---------------------------------------------------------------- K-가중 측정
def _biquad(x, b0, b1, b2, a1, a2):
    y = np.empty_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        xi = x[i]
        yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        y[i] = yi
        x2, x1, y2, y1 = x1, xi, y1, yi
    return y


def k_weight(x, sr):
    """BS.1770 K-가중 = 고역 셸빙(+4dB) 뒤 하이패스(38Hz). 계수를 sr에 맞춰 재설계한다."""
    G, Q, f0 = 3.99984, 0.7071752, 1681.974
    A = 10 ** (G / 40)
    w0 = 2 * math.pi * f0 / sr
    al = math.sin(w0) / (2 * Q)
    c = math.cos(w0)
    sA = math.sqrt(A)
    b0 = A * ((A + 1) + (A - 1) * c + 2 * sA * al)
    b1 = -2 * A * ((A - 1) + (A + 1) * c)
    b2 = A * ((A + 1) + (A - 1) * c - 2 * sA * al)
    a0 = (A + 1) - (A - 1) * c + 2 * sA * al
    a1 = 2 * ((A - 1) - (A + 1) * c)
    a2 = (A + 1) - (A - 1) * c - 2 * sA * al
    y = _biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)

    Q, f0 = 0.5003271, 38.13547
    w0 = 2 * math.pi * f0 / sr
    al = math.sin(w0) / (2 * Q)
    c = math.cos(w0)
    b0 = (1 + c) / 2
    b1 = -(1 + c)
    b2 = (1 + c) / 2
    a0 = 1 + al
    a1 = -2 * c
    a2 = 1 - al
    return _biquad(y, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def onset_index(x, rel=0.08):
    a = np.abs(x)
    pk = a.max()
    idx = np.where(a > pk * rel)[0]
    return int(idx[0]) if len(idx) else 0


def loudness(x, sr, win_s=0.25):
    """온셋부터 250ms 구간의 K-가중 RMS. 짧은 타격음의 체감 크기에 가장 가깝다."""
    s = onset_index(x)
    seg = x[s:s + int(sr * win_s)]
    if len(seg) < 32:
        seg = x
    k = k_weight(np.asarray(seg, dtype=np.float64), sr)
    return math.sqrt(float((k * k).mean()) + 1e-18)


# ---------------------------------------------------------------- 소프트 리미터
def limit(x, sr, ceiling=0.95, attack_ms=1.5, release_ms=80.0):
    """룩어헤드 피크 리미터 — 천장을 **절대** 넘지 않는다.

    발소리는 크레스트 팩터가 30dB에 이르는 것도 있어서, 라우드니스를 맞추려고 그냥
    곱하면 피크가 먼저 천장에 닿는다. 트랜지언트 꼭대기만 몇 dB 눌러 주면 체감은
    오히려 단단해지고, 마스터 컴프레서가 다른 소리까지 함께 눌러 버리는 펌핑도 없앤다.

    어택을 시간 상수로만 두면 첫 샘플이 새어 나가 하드 클리핑이 된다. 그래서 필요
    게인의 **미래 최솟값**(룩어헤드 창)을 먼저 깔고, 거기서 위로 올라올 때만 릴리스
    시간 상수로 천천히 풀어 준다.
    """
    a = np.abs(x)
    if a.max() <= ceiling:
        return x
    need = np.minimum(1.0, ceiling / np.maximum(a, 1e-9))

    la = max(1, int(sr * attack_ms / 1000))
    # 길이 (2*la+1) 슬라이딩 최솟값 — 트랜지언트가 오기 전에 미리 게인을 내린다
    pad = np.concatenate([np.ones(la), need, np.ones(la)])
    win = np.lib.stride_tricks.sliding_window_view(pad, 2 * la + 1)
    g = win.min(axis=1)[:len(need)]
    # 어택 구간을 부드럽게(하드한 계단은 저역 왜곡이 된다)
    ker = np.hanning(2 * la + 1)
    ker /= ker.sum()
    g = np.convolve(np.concatenate([np.ones(la), g, np.full(la, g[-1])]), ker, 'same')[la:la + len(need)]
    g = np.minimum(g, need)

    # 릴리스 — 올라올 때만 시간 상수를 건다
    kr = math.exp(-1.0 / (sr * release_ms / 1000))
    cur = g[0]
    out = np.empty_like(g)
    for i in range(len(g)):
        cur = g[i] if g[i] < cur else g[i] + (cur - g[i]) * kr
        out[i] = cur
    return x * out


# ---------------------------------------------------------------- 자르기
def _stft(d):
    win = np.hanning(FFT + 1)[:FFT]
    m = 1 + (len(d) - FFT) // HOP
    S = np.empty((m, FFT // 2 + 1), dtype=complex)
    for i in range(m):
        S[i] = np.fft.rfft(d[i * HOP:i * HOP + FFT] * win)
    return S


def _istft(S, n):
    win = np.hanning(FFT + 1)[:FFT]
    out = np.zeros(n + FFT)
    wsum = np.zeros(n + FFT) + 1e-9
    for i in range(S.shape[0]):
        out[i * HOP:i * HOP + FFT] += np.fft.irfft(S[i], FFT) * win
        wsum[i * HOP:i * HOP + FFT] += win ** 2
    return (out / wsum)[:n]


def denoise(d, sr, over=2.0, floor=0.10):
    """가장 조용한 300ms를 잡음 프로파일로 삼는 스펙트럼 차감.

    야외 녹음의 룸톤·바람·도시 소음이 알갱이 사이에 깔려 있으면 ASMR이 아니라
    '녹음 재생'으로 들린다. floor 를 0으로 두면 금속성 뮤지컬 노이즈가 생기므로
    원래 스펙트럼의 10% 정도는 반드시 남긴다.
    """
    S = _stft(d)
    mag, ph = np.abs(S), np.angle(S)
    k = max(1, int(0.30 * sr / HOP))
    csum = np.cumsum(np.concatenate([[0.0], mag.mean(1)]))
    q = int(np.argmin(csum[k:] - csum[:-k]))
    prof = mag[q:q + k].mean(0)
    return _istft(np.maximum(mag - over * prof, floor * mag) * np.exp(1j * ph), len(d))


def _env(d, sr, hop_ms=5.0, win_ms=18.0):
    hop, win = int(sr * hop_ms / 1000), int(sr * win_ms / 1000)
    m = max(0, (len(d) - win) // hop)
    e = np.empty(m)
    for i in range(m):
        s = d[i * hop:i * hop + win]
        e[i] = math.sqrt(float((s * s).mean()))
    return e, hop


def slice_steps(src, stem, want, out_dir=AUDIO_DIR,
                gap_ms=230, rel=0.15, pre_ms=20, min_ms=260, max_ms=580,
                tail_rel=0.15, max_crest_db=24.0, head_rel=0.18):
    d, sr = load(src)
    dn = denoise(d, sr)
    e, hop = _env(dn, sr)

    df = np.maximum(0, np.diff(e, prepend=e[0]))
    thr = df.max() * rel
    gap = max(1, int(gap_ms / 1000 * sr / hop))
    ons, i = [], 0
    while i < len(df):
        if df[i] > thr:
            ons.append(i + int(np.argmax(df[i:min(len(df), i + gap)])))
            i = ons[-1] + gap
        else:
            i += 1

    floor = float(np.percentile(e, 20))
    cands = []
    for k, p in enumerate(ons):
        peak = float(e[p:p + max(1, int(0.08 * sr / hop))].max())
        stop = floor + (peak - floor) * tail_rel
        q = p + int(min_ms / 1000 * sr / hop)
        lim = p + int(max_ms / 1000 * sr / hop)
        if k + 1 < len(ons):
            lim = min(lim, ons[k + 1] - int(0.02 * sr / hop))
        while q < min(lim, len(e)) and e[q] > stop:
            q += 1
        s = max(0, p * hop - int(pre_ms / 1000 * sr))
        t = min(len(dn), q * hop)
        if t - s < int(min_ms / 1000 * sr):
            continue

        seg = dn[s:t].copy()
        # 앞 6ms 페이드인(클릭 방지) · 끝 90ms 코사인 페이드아웃(툭 끊기는 느낌 방지)
        g = np.ones(len(seg))
        a = min(len(seg), int(0.006 * sr))
        g[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, a))
        b = min(len(seg), int(0.110 * sr))
        g[-b:] *= 0.5 + 0.5 * np.cos(np.linspace(0, math.pi, b))
        seg = seg * g
        seg -= seg.mean()                                   # DC 오프셋 제거

        pk = float(np.abs(seg).max())
        rm = math.sqrt(float((seg * seg).mean()) + 1e-18)
        if pk < 1e-4:
            continue
        crest = 20 * math.log10(pk / rm)
        head = math.sqrt(float((seg[:int(0.015 * sr)] ** 2).mean()))
        if crest > max_crest_db:                            # 알맹이 없이 툭 튀기만 하는 조각
            continue
        if head > pk * head_rel:                                # 온셋이 늦어 앞에 소리가 붙은 조각
            continue
        cands.append(dict(s=s, seg=seg, rms=rm, dur=(t - s) / sr, crest=crest))

    if not cands:
        raise SystemExit('온셋을 찾지 못했습니다 — rel 값을 낮춰 보세요')

    cands.sort(key=lambda c: -c['rms'])
    pool = cands[:max(want, want * 3)]
    pool.sort(key=lambda c: c['s'])                          # 서로 다른 걸음이 섞이도록
    stride = max(1, len(pool) // want)
    picked = pool[::stride][:want] or pool[:want]

    out = []
    for i, c in enumerate(picked, 1):
        p = os.path.join(out_dir, '%s_%d.wav' % (stem, i))
        save(p, c['seg'] / (np.abs(c['seg']).max() + 1e-12) * 0.92, sr)
        out.append((os.path.basename(p), c['dur'], c['crest'], c['s'] / sr))
    return out, len(ons)


# ---------------------------------------------------------------- 명령
def material_of(path):
    return os.path.basename(path).rsplit('_', 1)[0]


def cmd_report(_):
    rows = []
    for f in sorted(glob.glob(os.path.join(AUDIO_DIR, '*.wav'))):
        d, sr = load(f)
        rows.append((os.path.basename(f), material_of(f), loudness(d, sr),
                     float(np.abs(d).max()), len(d) / sr))
    print('%-16s %9s %8s %8s %7s' % ('file', 'LU', 'peak', 'dur', 'crest'))
    for r in rows:
        print('%-16s %9.1f %8.3f %8.3f %7.1f' % (
            r[0], 20 * math.log10(r[2] + 1e-12), r[3], r[4],
            20 * math.log10(r[3] / (r[2] + 1e-12))))
    mats = {}
    for r in rows:
        mats.setdefault(r[1], []).append(r[2])
    print('\n재질별 평균 라우드니스')
    lus = []
    for m, v in sorted(mats.items(), key=lambda kv: -sum(kv[1]) / len(kv[1])):
        L = 20 * math.log10(sum(v) / len(v) + 1e-12)
        lus.append(L)
        print('  %-8s %6.1f LU   (×%d)' % (m, L, len(v)))
    print('  퍼짐 %.1f dB' % (max(lus) - min(lus)))


def cmd_normalize(a):
    files = sorted(glob.glob(os.path.join(AUDIO_DIR, '*.wav')))
    print('목표 %.1f LU · 천장 %.2f · %s\n' % (
        20 * math.log10(a.target), a.ceiling, '적용' if a.apply else '미리보기(--apply 로 기록)'))
    print('%-16s %9s %9s %7s' % ('file', 'before', 'after', 'gain'))
    for f in files:
        d, sr = load(f)
        before = loudness(d, sr)
        y = d
        # 리미팅이 라우드니스를 조금 깎으므로 몇 번 되먹임하면 목표에 수렴한다
        for _ in range(3):
            cur = loudness(y, sr)
            y = limit(y * (a.target / max(cur, 1e-9)), sr, a.ceiling)
        after = loudness(y, sr)
        print('%-16s %9.1f %9.1f %7.2f' % (
            os.path.basename(f), 20 * math.log10(before + 1e-12),
            20 * math.log10(after + 1e-12), after / max(before, 1e-9)))
        if a.apply:
            save(f, y, sr)


def cmd_slice(a):
    out, n = slice_steps(a.source, a.stem, a.count, rel=a.rel, gap_ms=a.gap,
                         min_ms=a.min_ms, max_ms=a.max_ms,
                         max_crest_db=a.max_crest, head_rel=a.head)
    print('온셋 %d개 검출 → %d개 채택' % (n, len(out)))
    for name, dur, crest, at in out:
        print('  %-14s %5.3fs  crest %4.1fdB  (원본 %6.3fs 지점)' % (name, dur, crest, at))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd')
    sub.add_parser('report').set_defaults(fn=cmd_report)
    n = sub.add_parser('normalize')
    n.add_argument('--target', type=float, default=0.10)
    n.add_argument('--ceiling', type=float, default=0.95)
    n.add_argument('--apply', action='store_true')
    n.set_defaults(fn=cmd_normalize)
    s = sub.add_parser('slice')
    s.add_argument('source')
    s.add_argument('stem')
    s.add_argument('count', type=int)
    s.add_argument('--rel', type=float, default=0.15, help='온셋 검출 문턱(낮출수록 많이 찾음)')
    s.add_argument('--gap', type=float, default=230, help='온셋 최소 간격 ms')
    s.add_argument('--min', dest='min_ms', type=float, default=300, help='조각 최소 길이 ms')
    s.add_argument('--max', dest='max_ms', type=float, default=580, help='조각 최대 길이 ms')
    s.add_argument('--max-crest', type=float, default=24.0)
    s.add_argument('--head', type=float, default=0.18, help='앞머리 허용 잡음 비율')
    s.set_defaults(fn=cmd_slice)
    args = ap.parse_args()
    if not getattr(args, 'fn', None):
        ap.print_help()
        sys.exit(1)
    args.fn(args)
