from modal import Image, App, asgi_app
from typing import Optional
import tempfile
import os

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
        # Persist upload to a temporary file for the model
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(audio.filename or "audio")[1], delete=False) as tmp:
            tmp.write(await audio.read())
            tmp.flush()
            tmp_path = tmp.name

        try:
            segments, info = model.transcribe(tmp_path, beam_size=5, language=language)
            text = "".join(seg.text for seg in segments).strip()
            return {"text": text, "language": info.language, "duration": info.duration}
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    return app
