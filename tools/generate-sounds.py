#!/usr/bin/env python3
"""Generate the two bundled notification sounds (pure stdlib).

Run from the repository root:
    python tools/generate-sounds.py
"""

import math
import os
import struct
import wave

RATE = 44100
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib", "sounds")


def render(notes, path):
    total = max(start + duration for start, duration, _freq, _amp in notes) + 0.08
    count = int(total * RATE)
    buffer = [0.0] * count

    for start, duration, freq, amplitude in notes:
        offset = int(start * RATE)
        length = int(duration * RATE)
        for i in range(length):
            t = i / RATE
            attack = min(1.0, t / 0.006)
            decay = math.exp(-3.4 * t / max(duration, 0.001))
            release = 1.0
            tail = duration - 0.03
            if t > tail:
                release = max(0.0, (duration - t) / 0.03)
            envelope = attack * decay * release
            tone = math.sin(2.0 * math.pi * freq * t)
            harmonic = 0.14 * math.sin(2.0 * math.pi * freq * 2.0 * t)
            buffer[offset + i] += (tone + harmonic) * amplitude * envelope

    peak = max((abs(value) for value in buffer), default=0.0) or 1.0
    scale = 0.78 / peak
    frames = bytearray()
    for value in buffer:
        sample = max(-1.0, min(1.0, value * scale))
        frames += struct.pack("<h", int(sample * 32767))

    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(bytes(frames))
    print(f"wrote {path} ({len(frames) // 1024} KiB)")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # Gentle two-note "done" chime: E5 -> B5 (a clean perfect fifth).
    render(
        [
            (0.00, 0.58, 659.26, 0.55),
            (0.13, 0.62, 987.77, 0.46),
            (0.27, 0.45, 1318.51, 0.16),
        ],
        os.path.join(OUT_DIR, "chime.wav"),
    )

    # Short, clearly audible alert: A5 -> E5 -> A5.
    render(
        [
            (0.00, 0.16, 880.00, 0.62),
            (0.20, 0.16, 659.26, 0.58),
            (0.40, 0.24, 880.00, 0.52),
        ],
        os.path.join(OUT_DIR, "alert.wav"),
    )


if __name__ == "__main__":
    main()
