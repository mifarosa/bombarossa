#!/usr/bin/env python3
"""Synthesizes the game's sound effects. Original sounds, no samples, no licensing issues.

Usage: python3 tools/generate-sfx.py [output_dir]
Defaults to apps/mobile/assets/sfx. Output is 22.05 kHz mono 16-bit WAV.
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 22050
rng = np.random.default_rng(1234)


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def env_exp(t, decay):
    return np.exp(-t * decay)


def fade(x, ms=4):
    n = int(SR * ms / 1000)
    x = x.copy()
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (Hz) to sweep over time."""
    cutoff = np.broadcast_to(cutoff, x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def sweep(f0, f1, t, curve=1.0):
    """Sine whose frequency glides from f0 to f1 over the length of t."""
    k = (t / t[-1]) ** curve
    freq = f0 + (f1 - f0) * k
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def tone(freq, dur, decay=8.0, harmonics=((1, 1.0), (2, 0.25), (3, 0.1))):
    t = t_axis(dur)
    x = sum(a * np.sin(2 * np.pi * freq * h * t) for h, a in harmonics)
    return fade(x * env_exp(t, decay))


def normalize(x, peak=0.8):
    return x / (np.max(np.abs(x)) + 1e-9) * peak


def save(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def place():
    t = t_axis(0.16)
    thump = sweep(220, 70, t, 0.6) * env_exp(t, 22)
    click = lowpass(rng.standard_normal(len(t)), 3500) * env_exp(t, 120) * 0.5
    return normalize(fade(thump + click))


def explosion():
    t = t_axis(0.9)
    noise = rng.standard_normal(len(t))
    cutoff = 5000 * np.exp(-t * 5) + 200
    rumble = lowpass(noise, cutoff) * env_exp(t, 3.2)
    boom = sweep(110, 35, t, 0.5) * env_exp(t, 4.5) * 1.2
    crack = lowpass(noise, 8000) * env_exp(t, 40) * 0.8
    return normalize(fade(rumble * 1.6 + boom + crack), 0.9)


def pickup():
    a = tone(660, 0.09, 14)
    b = tone(990, 0.16, 10)
    return normalize(np.concatenate([a, b]), 0.7)


def death():
    t = t_axis(0.6)
    vib = 1 + 0.03 * np.sin(2 * np.pi * 9 * t)
    s = sweep(520, 110, t, 0.8) * vib * env_exp(t, 3.5)
    buzz = np.sign(sweep(260, 55, t, 0.8)) * 0.25 * env_exp(t, 5)
    return normalize(fade(s + buzz), 0.75)


def win():
    notes = [523.25, 659.25, 783.99, 1046.5]
    parts = [tone(f, 0.14, 7) for f in notes[:-1]] + [tone(notes[-1], 0.5, 3.5)]
    return normalize(np.concatenate(parts), 0.75)


def lose():
    notes = [392.0, 329.63, 261.63]
    parts = [tone(f, 0.18, 6) for f in notes[:-1]] + [tone(notes[-1], 0.55, 3.0)]
    return normalize(np.concatenate(parts), 0.7)


def click():
    t = t_axis(0.05)
    return normalize(fade(sweep(900, 600, t) * env_exp(t, 70), 2), 0.5)


def countdown():
    return normalize(tone(880, 0.12, 12), 0.6)


SOUNDS = {
    'place': place,
    'explosion': explosion,
    'pickup': pickup,
    'death': death,
    'win': win,
    'lose': lose,
    'click': click,
    'countdown': countdown,
}

if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'apps/mobile/assets/sfx'
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in SOUNDS.items():
        x = fn()
        save(out / f'{name}.wav', x)
        print(f'{name}.wav  {len(x) / SR:.2f}s')
