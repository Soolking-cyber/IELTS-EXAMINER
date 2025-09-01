from modal import Image, App, asgi_app
from typing import Optional
import tempfile
import os
import subprocess

# Build image with faster-whisper and ffmpeg available
image = (
    Image.debian_slim()
    .apt_install(
        # Runtime tools
        "ffmpeg", "libgomp1",
        # Build requirements for PyAV and audio libs
        "pkg-config", "build-essential",
        "libavformat-dev", "libavcodec-dev", "libavdevice-dev",
        "libavutil-dev", "libswresample-dev", "libswscale-dev",
        "libsndfile1"
    )
    .pip_install(
        [
            "fastapi==0.115.6",
            "uvicorn==0.34.0",
            "faster-whisper==1.0.3",
            "python-multipart==0.0.9",
            # Install PyAV explicitly; wheels may exist else build will succeed due to apt deps
            "av==12.3.0",
        ]
    )
)

app = App("ielts-stt-modal", image=image)


@app.function()
@asgi_app()
def fastapi_app():
    from fastapi import FastAPI, UploadFile, File  # type: ignore
    from fastapi.middleware.cors import CORSMiddleware  # type: ignore
    from faster_whisper import WhisperModel  # type: ignore

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Load a reasonably small model for responsiveness. You can switch to
    # "large-v3" on GPU if desired.
    # model = WhisperModel("large-v3", compute_type="int8")
    model = WhisperModel("small.en", compute_type="int8")

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/stt")
    async def stt(audio: UploadFile = File(...), language: Optional[str] = "en"):
        # Persist upload to a temporary file
        suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await audio.read())
            tmp.flush()
            in_path = tmp.name

        # Transcode to mono 16k WAV for robust decoding
        wav_path = in_path + ".wav"
        try:
            # First attempt: standard transcode to 16k mono PCM WAV
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", in_path,
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                wav_path,
            ]
            r = subprocess.run(cmd, check=False, capture_output=True, text=True)
            if r.returncode != 0:
                # Fallback 1: add genpts and force container probing
                cmd2 = [
                    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-fflags", "+genpts",
                    "-i", in_path,
                    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                    wav_path,
                ]
                r2 = subprocess.run(cmd2, check=False, capture_output=True, text=True)
                if r2.returncode != 0:
                    # Fallback 2: assume webm container
                    cmd3 = [
                        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                        "-f", "webm", "-i", in_path,
                        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                        wav_path,
                    ]
                    r3 = subprocess.run(cmd3, check=False, capture_output=True, text=True)
                    if r3.returncode != 0:
                        # Give up: surface decoder stderr for debugging
                        return {"text": "", "error": "ffmpeg_failed", "stderr": (r.stderr or r2.stderr or r3.stderr)[:500]}, 200

            # If file is tiny, return empty text instead of 500
            try:
                if os.path.getsize(wav_path) < 1024:
                    return {"text": "", "note": "empty_or_short_chunk"}, 200
            except Exception:
                return {"text": "", "note": "no_output_file"}, 200

            segments, info = model.transcribe(wav_path, beam_size=5, language=language)
            text = "".join(seg.text for seg in segments).strip()
            return {"text": text, "language": getattr(info, 'language', language), "duration": getattr(info, 'duration', 0)}
        finally:
            for p in (in_path, wav_path):
                try:
                    os.remove(p)
                except Exception:
                    pass

    return app
