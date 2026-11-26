"""Time speech to text on this machine, to compare servers and settings.

Prints the CPU, the thread count and how long each run of a recording takes (language detected
automatically, as in the app). The first run is a warm-up and isn't counted.

Usage (from inference-service/, or /app inside the Docker container):
  venv/bin/python -m scripts.bench_transcribe recording.wav [--runs 3]
  docker compose exec inference python -m scripts.bench_transcribe /tmp/clip.wav
Settings come from the environment as in the service, e.g. WHISPER_CPU_THREADS=4, WHISPER_BEAM_SIZE=1.
(CT2_USE_MKL=1 was 4x slower on an AMD EPYC server; don't use it.)
"""
import argparse
import os
import platform
import statistics
import time

from app.transcribe import BEAM_SIZE, CPU_THREADS, Transcriber


def cpu_summary():
    """CPU model and whether it has the int8 instructions (AVX-512 VNNI) that speed Whisper up."""
    try:
        with open("/proc/cpuinfo") as f:
            info = f.read()
    except OSError:
        return platform.processor() or platform.machine()
    model = next((line.split(":", 1)[1].strip() for line in info.splitlines() if line.startswith("model name")), "unknown")
    flags = next((line for line in info.splitlines() if line.startswith("flags")), "")
    return f"{model}; AVX2 {'avx2' in flags}; AVX-512 {'avx512f' in flags}; AVX-512 VNNI {'avx512_vnni' in flags}"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("audio")
    parser.add_argument("--runs", type=int, default=3)
    args = parser.parse_args()

    print(f"CPU: {cpu_summary()}; {os.cpu_count()} logical CPUs; Whisper threads {CPU_THREADS}; beam size {BEAM_SIZE}")
    print(f"CT2_USE_MKL={os.environ.get('CT2_USE_MKL', '(default)')}")
    with open(args.audio, "rb") as f:
        data = f.read()
    transcriber = Transcriber()
    transcriber.transcribe(data)  # warm-up: loads the model
    times = []
    for _ in range(args.runs):
        started = time.perf_counter()
        result = transcriber.transcribe(data)
        times.append(time.perf_counter() - started)
    print(f"\nText: {result['text']}")
    print(f"{result['duration']}s of audio ({result['language']}): median {statistics.median(times):.1f}s, runs {', '.join(f'{t:.1f}' for t in times)}")


if __name__ == "__main__":
    main()
