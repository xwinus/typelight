#!/usr/bin/env python3
"""Cut the samples in sounds/ out of the source recordings.

The sources are CC0 1.0 field recordings: typewriters, paper and a drawer recorded
by Joseph Sardin (BigSoundBank.com) and a carriage return recorded by knufds
(Freesound.org).
They are downloaded into tools/.cache/ (not committed) and sliced into
one-shot samples:

  key-NN.flac     single letter strikes, each a different real strike
  space-NN.flac   the space bar
  bell-NN.flac    the end-of-line bell
  return-NN.flac  a carriage return: the ratchet of the sweep, then the stop
  feed-NN.flac    the line-feed click at the start of a carriage return
  crumple-NN.flac a sheet of paper screwed up into a ball
  drawer-open-NN.flac, drawer-close-NN.flac   a wooden drawer

Needs Python 3.9+ and ffmpeg on PATH. No other dependencies.

    python3 tools/build-sounds.py            # rebuild sounds/
    python3 tools/build-sounds.py --report   # also print what was picked
"""
import argparse
import array
import hashlib
import json
import math
import subprocess
import sys
import urllib.request
import wave
from pathlib import Path

SR = 48000
ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"
OUT = ROOT / "sounds"
BSB = "https://bigsoundbank.com/UPLOAD/flac/{}.flac"

# id -> where to download it (all CC0 1.0). Pages: bigsoundbank.com/...-s<id>.html
# and freesound.org/s/<id>/.
SOURCES = {
    1065: BSB.format(1065),   # a heavy mechanical machine: strikes with body
    2835: BSB.format(2835),   # Hermes, slow typing, stereo: line-feed clicks
    2836: BSB.format(2836),   # Hermes, slow typing, stereo: line-feed clicks
    2843: BSB.format(2843),   # one press of the space bar
    2844: BSB.format(2844),   # bell
    2845: BSB.format(2845),   # bell
    1220: BSB.format(1220),   # "Ball paper" #1 to #5: a sheet wrinkled into a ball
    1221: BSB.format(1221),
    1222: BSB.format(1222),
    1223: BSB.format(1223),
    1224: BSB.format(1224),
    1499: BSB.format(1499),   # a wooden drawer, opening
    1500: BSB.format(1500),   # ... and closing
    # "Typewriter bell & carriage reset" by knufds. Freesound serves the original WAV
    # only to logged-in users, so this is its MP3 preview. Put the original at
    # tools/.cache/345955.wav and it is used instead.
    345955: "https://cdn.freesound.org/previews/345/345955_191884-hq.mp3",
}
CRUMPLE_SOURCES = (1220, 1221, 1222, 1223, 1224)
RETURN_SOURCE = 345955
RETURN_SWEEP = 0.70     # seconds of ratchet kept before the carriage hits its stop

# Letter strikes come from the heavier machine. The Hermes strikes (2835-2837) are
# almost all click: their energy sits above 2 kHz and is gone in 20 ms, so they
# sound light. Recording 1065 has the low thump of the type bar hitting the platen.
KEY_SOURCES = (1065,)
KEY_COUNT = 28
KEY_LEN = 0.30          # seconds kept of each strike, at most
KEY_MIN_LEN = 0.20      # ... and at least
KEY_MIN_BEFORE = 0.22   # gap required before a strike, so no earlier tail bleeds in
KEY_GUARD = 0.045       # stop this long before the next strike (its key travel is audible)
STRIKE_DB = -10.0       # a strike is an onset at least this loud (dBFS)
MAX_CLIPPED = 12        # full-scale samples tolerated in one strike (a quarter of a millisecond)

# Passages where the bell rings over the typing: (source, from, to) in seconds.
BELLS = [
    (2835, 17.85, 19.60),
    (2835, 39.35, 41.10),
    (2836, 19.10, 20.90),
]

# Carriage returns of the Hermes, located by hand on spectrograms: (source, from, to)
# in seconds. Only the line-feed click at the start of each one is used.
FEEDS = [
    (2835, 19.15, 20.80),
    (2835, 40.68, 42.42),
    (2836, 20.46, 22.02),
]


def db(x):
    return 20 * math.log10(max(x, 1e-9))


def lin(d):
    return 10 ** (d / 20)


def fetch(sid):
    CACHE.mkdir(exist_ok=True)
    original = CACHE / f"{sid}.wav"           # a hand-downloaded original wins
    if original.exists():
        return original
    url = SOURCES[sid]
    path = CACHE / f"{sid}{Path(url).suffix}"
    if not path.exists():
        print(f"downloading {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (sample build script)"})
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    return path


def decode(path):
    """Return (left, right) as float arrays at 48 kHz. Mono sources are duplicated."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
        check=True, capture_output=True).stdout
    a = array.array("f")
    a.frombytes(raw)
    return a[0::2], a[1::2]


def peak(L, R, s=0, e=None):
    e = len(L) if e is None else e
    if e <= s:
        return 0.0
    return max(max(L[s:e]), -min(L[s:e]), max(R[s:e]), -min(R[s:e]))


def envelope(L, R, blk):
    n = len(L) // blk
    return [peak(L, R, k * blk, (k + 1) * blk) for k in range(n)]


def find_strikes(L, R):
    """Sample positions of loud strike onsets."""
    blk = SR // 1000
    env = envelope(L, R, blk)
    thr = lin(STRIKE_DB)
    out = []
    last = -10 ** 9
    for k in range(1, len(env)):
        if env[k] >= thr and env[k - 1] < thr and (k - last) > 120:
            # refine: the loudest sample nearby, then walk back to where the slap begins
            a, b = max(0, (k - 2) * blk), min(len(L), (k + 12) * blk)
            pk = peak(L, R, a, b)
            i = a
            while i < b and max(abs(L[i]), abs(R[i])) < 0.15 * pk:
                i += 1
            out.append(i)
            last = k
    return out


def shape(L, R, s, n, fade_in=0.0015, fade_out=0.06):
    """Cut n samples from s with a short fade in and a cosine fade out."""
    l = array.array("f", L[s:s + n])
    r = array.array("f", R[s:s + n])
    n = len(l)
    fi, fo = int(fade_in * SR), min(int(fade_out * SR), n)
    for i in range(min(fi, n)):
        g = i / fi
        l[i] *= g
        r[i] *= g
    for i in range(fo):
        g = 0.5 * (1 + math.cos(math.pi * i / fo))
        l[n - fo + i] *= g
        r[n - fo + i] *= g
    return l, r


def scale(l, r, g):
    for i in range(len(l)):
        l[i] *= g
        r[i] *= g


def write(name, l, r):
    OUT.mkdir(exist_ok=True)
    wav = OUT / (name + ".wav")
    pcm = array.array("h", bytes(4 * len(l)))
    for i in range(len(l)):
        pcm[2 * i] = max(-32767, min(32767, round(l[i] * 32767)))
        pcm[2 * i + 1] = max(-32767, min(32767, round(r[i] * 32767)))
    if sys.byteorder == "big":
        pcm.byteswap()
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    flac = OUT / (name + ".flac")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-map_metadata", "-1",
                    "-fflags", "+bitexact", "-compression_level", "8", str(flac)], check=True)
    wav.unlink()
    return flac.name


def build_keys(audio, report):
    cands = []
    for sid in KEY_SOURCES:
        L, R = audio[sid]
        on = find_strikes(L, R)
        for k, s in enumerate(on):
            before = (s - on[k - 1]) / SR if k else 9.0
            after = (on[k + 1] - s) / SR if k + 1 < len(on) else (len(L) - s) / SR
            length = min(KEY_LEN, after - KEY_GUARD)
            if before < KEY_MIN_BEFORE or length < KEY_MIN_LEN:
                continue
            if any(b == sid and t0 <= s / SR <= t1 for b, t0, t1 in BELLS):
                continue
            n = int(length * SR)
            clipped = sum(1 for i in range(s, s + n) if abs(L[i]) >= 0.999 or abs(R[i]) >= 0.999)
            if clipped > MAX_CLIPPED:
                continue
            cands.append((sid, s, peak(L, R, s, s + n), n))
    if report:
        print(f"keys: {len(cands)} clean strikes found, peaks "
              f"{db(min(c[2] for c in cands)):.1f}..{db(max(c[2] for c in cands)):.1f} dBFS")
    # prefer strikes with a full tail, then take an even spread over what qualified
    full = [c for c in cands if c[3] >= int(0.27 * SR)]
    if len(full) >= KEY_COUNT:
        cands = full
    step = len(cands) / KEY_COUNT
    picked = [cands[int(i * step)] for i in range(KEY_COUNT)] if len(cands) > KEY_COUNT else cands
    names = []
    for i, (sid, s, pk, n) in enumerate(picked, 1):
        L, R = audio[sid]
        # start half a millisecond before the attack: every millisecond here is heard as lag
        l, r = shape(L, R, max(0, s - int(0.0005 * SR)), n, fade_in=0.0004)
        # keep some of the natural difference in force, but not all of it
        target = lin(-3.0) * (pk / lin(-3.0)) ** 0.3
        scale(l, r, min(target, 0.92) / pk)
        names.append(write(f"key-{i:02d}", l, r))
        if report:
            print(f"  key-{i:02d}  src {sid} @ {s / SR:6.2f}s  {n / SR:.2f}s  {db(pk):5.1f} dBFS -> {db(peak(l, r)):5.1f}")
    return names


def build_one_shot(audio, sid, name, length, fade_out, level_db, report):
    L, R = audio[sid]
    pk = peak(L, R)
    s = 0
    while max(abs(L[s]), abs(R[s])) < 0.1 * pk:
        s += 1
    l, r = shape(L, R, max(0, s - int(0.002 * SR)), int(length * SR), fade_out=fade_out)
    scale(l, r, lin(level_db) / peak(l, r))
    if report:
        print(f"  {name}  src {sid} @ {s / SR:.3f}s  {len(l) / SR:.2f}s")
    return write(name, l, r)


def build_drawer(audio, sid, name, report):
    """A slide that ends in a knock, the knock some 20 dB above the slide. Halve that
    range, or the slide is lost under a bang. Says where the knock is, so the app can
    time it to the drawer on the screen."""
    L, R = audio[sid]
    pk = peak(L, R)
    s = 0
    while max(abs(L[s]), abs(R[s])) < 0.02 * pk:
        s += 1
    l, r = shape(L, R, max(0, s - int(0.01 * SR)), len(L), fade_in=0.01, fade_out=0.15)
    blk = int(0.01 * SR)
    env = [max(peak(l, r, i, i + blk), 0.01 * pk) for i in range(0, len(l), blk)]
    for i in range(len(l)):
        a, f = divmod(i / blk - 0.5, 1)
        a = int(max(0, min(len(env) - 1, a)))
        b = min(len(env) - 1, a + 1)
        g = ((env[a] * (1 - f) + env[b] * f) / pk) ** -0.5
        l[i] *= g
        r[i] *= g
    top = peak(l, r)
    thud = 0
    while max(abs(l[thud]), abs(r[thud])) < 0.6 * top:
        thud += 1
    scale(l, r, lin(-8.0) / top)
    if report:
        print(f"  {name}  src {sid} @ {s / SR:.3f}s  {len(l) / SR:.2f}s  knock at {thud / SR:.2f}s")
    return {"file": write(name, l, r), "thud": round(thud / SR, 3)}


def build_feeds(audio, report):
    feeds = []
    for i, (sid, t0, _) in enumerate(FEEDS, 1):
        L, R = audio[sid]
        a = int(t0 * SR)
        first = peak(L, R, a, a + int(0.2 * SR))
        s = a
        while max(abs(L[s]), abs(R[s])) < 0.3 * first:
            s += 1
        l, r = shape(L, R, s - int(0.004 * SR), int(0.17 * SR), fade_out=0.05)
        scale(l, r, lin(-13.0) / peak(l, r))
        feeds.append(write(f"feed-{i:02d}", l, r))
        if report:
            print(f"  feed-{i:02d}  src {sid} @ {s / SR:.2f}s")
    return feeds


def build_return(audio, report):
    """The recording is a bell, a pause, then the return: a ratchet that ends in a
    hard stop. The stop is the loudest thing in the second half; cut back from it."""
    L, R = audio[RETURN_SOURCE]
    half = len(L) // 2
    top = peak(L, R, half)
    thud = half
    while max(abs(L[thud]), abs(R[thud])) < 0.5 * top:
        thud += 1
    lead = int(0.06 * SR)                         # a breath of room before the ratchet
    s = thud - int(RETURN_SWEEP * SR) - lead
    l, r = shape(L, R, s, len(L) - s, fade_in=0.02, fade_out=0.15)
    scale(l, r, lin(-3.0) / peak(l, r))
    name = write("return-01", l, r)
    if report:
        print(f"  return-01  src {RETURN_SOURCE} @ {s / SR:.2f}s  stop at {thud / SR:.2f}s  "
              f"total {len(l) / SR:.2f}s")
    return [{"file": name, "start": round(lead / SR, 3), "thud": round((thud - s) / SR, 3)}]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--report", action="store_true", help="print what was picked")
    args = ap.parse_args()

    audio = {sid: decode(fetch(sid)) for sid in SOURCES}
    for old in OUT.glob("*.flac"):
        old.unlink()

    keys = build_keys(audio, args.report)
    space = [build_one_shot(audio, 2843, "space-01", 0.40, 0.08, -8.0, args.report)]
    bells = [build_one_shot(audio, 2844, "bell-01", 1.90, 0.60, -6.0, args.report),
             build_one_shot(audio, 2845, "bell-02", 1.90, 0.60, -6.0, args.report)]
    returns = build_return(audio, args.report)
    feeds = build_feeds(audio, args.report)
    # the first second of each crumpling: the sheet is a ball by then, the rest is kneading
    crumples = [build_one_shot(audio, sid, f"crumple-{i:02d}", 1.10, 0.35, -8.0, args.report)
                for i, sid in enumerate(CRUMPLE_SOURCES, 1)]
    drawer = {"open": build_drawer(audio, 1499, "drawer-open-01", args.report),
              "close": build_drawer(audio, 1500, "drawer-close-01", args.report)}

    # the version changes whenever any sample does, so browsers never play a stale one
    digest = hashlib.sha1()
    for path in sorted(OUT.glob("*.flac")):
        digest.update(path.read_bytes())
    manifest = {"version": digest.hexdigest()[:10],
                "key": keys, "space": space, "bell": bells, "return": returns, "feed": feeds,
                "crumple": crumples, "drawer": drawer}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(p.stat().st_size for p in OUT.glob("*.flac"))
    print(f"wrote {len(list(OUT.glob('*.flac')))} samples, {total / 1024:.0f} KB, to {OUT}")


if __name__ == "__main__":
    main()
